// 台股基本面資料：合併證交所公開資訊觀測站（MOPS）開放資料，全部是免費、合法的政府公開資料
// （跟 tw-stock-directory.ts 的公司名稱對照表同一批來源）。
// 三份資料集都是「全部上市公司」一次回傳，同樣用 process 內快取避免每次查詢都重打大檔案。

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

export async function getTwFundamentals(code: string): Promise<TwFundamentals | null> {
  const [revenueList, epsList, valuationList] = await Promise.all([getRevenue(), getEps(), getValuation()]);

  const revenue = revenueList.find((r) => r["公司代號"] === code);
  const eps = epsList.find((r) => r["公司代號"] === code);
  const valuation = valuationList.find((r) => r["Code"] === code);

  if (!revenue && !eps && !valuation) return null;

  return {
    cumulativeRevenueYoY: toNum(revenue?.["累計營業收入-前期比較增減(%)"]),
    revenueYoY: toNum(revenue?.["營業收入-去年同月增減(%)"]),
    revenueMoM: toNum(revenue?.["營業收入-上月比較增減(%)"]),
    epsQuarter: toNum(eps?.["基本每股盈餘(元)"]),
    eps4Q: null,
    per: toNum(valuation?.["PEratio"]),
    dividendYield: toNum(valuation?.["DividendYield"]),
    roe4Q: null,
  };
}
