// 台股基本面資料：合併證交所公開資訊觀測站（MOPS）開放資料，全部是免費、合法的政府公開資料
// （跟 tw-stock-directory.ts 的公司名稱對照表同一批來源）。
// 四份資料集都是「全部上市公司」一次回傳，同樣用 process 內快取避免每次查詢都重打大檔案。
//
// EPS(近4季)：證交所公開資料只給「最新一季」快照，沒有歷史查詢功能（試過帶 season/year
// 參數會被忽略），MOPS 舊版可查歷史季別的介面又有防爬蟲機制擋掉一般請求。所以改用「自己養資料庫」：
// 每次查到某檔股票的最新一季 EPS，就存進 StockEpsSnapshot，累積滿 4 筆不同季別後就能加總算出。
import { prisma } from "@/lib/prisma";

const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; MoneyFlowApp/1.0)" };
const CACHE_TTL = 60 * 60 * 1000; // 1 小時（月營收/季報不會比這更新頻繁，本益比/殖利率是日資料但快取 1 小時可接受）

function makeCache<T>(fetcher: () => Promise<T[]>) {
  let cache: { list: T[]; fetchedAt: number } | null = null;
  let inflight: Promise<T[]> | null = null;
  return async (): Promise<T[]> => {
    if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) return cache.list;
    if (inflight) return inflight;
    inflight = fetcher()
      .then((list) => {
        cache = { list, fetchedAt: Date.now() };
        return list;
      })
      .catch(() => cache?.list ?? [])
      .finally(() => {
        inflight = null;
      });
    return inflight;
  };
}

async function fetchJson(url: string): Promise<Array<Record<string, string>>> {
  const res = await fetch(url, { headers: HEADERS, cache: "no-store" });
  if (!res.ok) return [];
  return res.json();
}

// t187ap05_L 月營收彙總表
const getRevenue = makeCache(() => fetchJson("https://openapi.twse.com.tw/v1/opendata/t187ap05_L"));
// t187ap14_L 綜合損益表-一般業（含基本每股盈餘）
const getEps = makeCache(() => fetchJson("https://openapi.twse.com.tw/v1/opendata/t187ap14_L"));
// BWIBBU_ALL 本益比、殖利率及股價淨值比（日資料）
const getValuation = makeCache(() => fetchJson("https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL"));
// t187ap07_L_ci 資產負債表(一般業)，含「每股參考淨值」，用來算 ROE(近4季)
const getBalanceSheet = makeCache(() => fetchJson("https://openapi.twse.com.tw/v1/opendata/t187ap07_L_ci"));

const toNum = (s: string | undefined) => {
  if (!s) return null;
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
};

export interface TwFundamentals {
  cumulativeRevenueYoY: number | null;
  revenueYoY: number | null;
  revenueMoM: number | null;
  epsQuarter: number | null;
  eps4Q: number | null; // 需要串接歷史季度資料才能算，目前固定 null
  per: number | null;
  dividendYield: number | null;
  roe4Q: number | null; // 需要股東權益等資產負債表資料才能算，目前固定 null
}

async function recordEpsSnapshotAndGetTrailing4Q(code: string, eps: Record<string, string> | undefined): Promise<number | null> {
  const epsValue = toNum(eps?.["基本每股盈餘(元)"]);
  const year = toNum(eps?.["年度"]);
  const season = toNum(eps?.["季別"]);

  if (epsValue != null && year != null && season != null) {
    await prisma.stockEpsSnapshot
      .upsert({
        where: { code_year_season: { code, year, season } },
        update: { eps: epsValue },
        create: { code, year, season, eps: epsValue },
      })
      .catch(() => {}); // 存快照失敗不影響本次查詢結果，下次查到一樣會再試著補存
  }

  const snapshots = await prisma.stockEpsSnapshot
    .findMany({
      where: { code },
      orderBy: [{ year: "desc" }, { season: "desc" }],
      take: 4,
    })
    .catch(() => []);

  if (snapshots.length < 4) return null; // 還沒累積滿 4 季，先保留 null
  return snapshots.reduce((sum, s) => sum + s.eps, 0);
}

// 全市場版本：getEps() 本來就是「全部上市公司最新一季」一次回傳，這裡不篩單一代碼，
// 把每一列都寫進 StockEpsSnapshot。用 createMany+skipDuplicates 而不是 upsert，
// 單次寫入全市場（約2000檔）效率好很多；代價是同一季已存在的資料被財報重編更新時不會覆蓋，
// 但那種情況很少見，且使用者之後查詢該股票時原本的 upsert 路徑仍會補上最新值。
export async function recordAllEpsSnapshots(): Promise<number> {
  const epsList = await getEps();
  const rows = epsList
    .map((r) => {
      const code = r["公司代號"];
      const epsValue = toNum(r["基本每股盈餘(元)"]);
      const year = toNum(r["年度"]);
      const season = toNum(r["季別"]);
      if (!code || epsValue == null || year == null || season == null) return null;
      return { code, year, season, eps: epsValue };
    })
    .filter((r): r is { code: string; year: number; season: number; eps: number } => r != null);
  if (rows.length === 0) return 0;
  const result = await prisma.stockEpsSnapshot.createMany({ data: rows, skipDuplicates: true });
  return result.count;
}

// 產業別文字版：t187ap03_L(公司基本資料) 只有代碼，月營收彙總表裡剛好有文字版，直接借用同一份快取。
export async function getIndustryName(code: string): Promise<string | null> {
  const revenueList = await getRevenue();
  return revenueList.find((r) => r["公司代號"] === code)?.["產業別"] ?? null;
}

export async function getTwFundamentals(code: string): Promise<TwFundamentals | null> {
  const [revenueList, epsList, valuationList, balanceSheetList] = await Promise.all([
    getRevenue(),
    getEps(),
    getValuation(),
    getBalanceSheet(),
  ]);

  const revenue = revenueList.find((r) => r["公司代號"] === code);
  const eps = epsList.find((r) => r["公司代號"] === code);
  const valuation = valuationList.find((r) => r["Code"] === code);
  const balanceSheet = balanceSheetList.find((r) => r["公司代號"] === code);

  if (!revenue && !eps && !valuation && !balanceSheet) return null;

  const eps4Q = await recordEpsSnapshotAndGetTrailing4Q(code, eps);
  const bookValuePerShare = toNum(balanceSheet?.["每股參考淨值"]);
  const roe4Q = eps4Q != null && bookValuePerShare ? (eps4Q / bookValuePerShare) * 100 : null;

  return {
    cumulativeRevenueYoY: toNum(revenue?.["累計營業收入-前期比較增減(%)"]),
    revenueYoY: toNum(revenue?.["營業收入-去年同月增減(%)"]),
    revenueMoM: toNum(revenue?.["營業收入-上月比較增減(%)"]),
    epsQuarter: toNum(eps?.["基本每股盈餘(元)"]),
    eps4Q,
    per: toNum(valuation?.["PEratio"]),
    dividendYield: toNum(valuation?.["DividendYield"]),
    roe4Q,
  };
}
