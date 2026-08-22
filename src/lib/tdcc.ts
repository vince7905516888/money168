import { prisma } from "@/lib/prisma";

// 集保結算所公開資料「集保戶股權分散表」(dataset 1-5)：免費、不需金鑰，但是「全部上市櫃股票、
// 全部17個持股級距」一次回傳（約4千檔*17級距），沒有單一股票查詢的參數，只能整包抓回來自己篩。
// 每週最後一個營業日結算一次，不是每天更新，所以在記憶體裡快取一段時間，不用每次查詢都重抓一次大檔。
// 這個端點也不支援歷史日期查詢（試過 date= 參數會被忽略，永遠回傳最新一週），沒辦法像三大法人
// 那樣主動往回補歷史，只能每次查詢時把當週資料存一筆snapshot，靠使用者查詢慢慢逐週累積出趨勢。
const TDCC_URL = "https://openapi.tdcc.com.tw/v1/opendata/1-5";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6小時（資料本來就是週更，快取久一點也不會拿到舊資料）

interface ShareholderTier {
  tier: number;
  holders: number;
  shares: number;
}

interface ShareholderDistribution {
  date: string;
  tiers: ShareholderTier[];
}

let cache: { fetchedAt: number; byCode: Map<string, ShareholderDistribution> } | null = null;
let inflight: Promise<Map<string, ShareholderDistribution>> | null = null;

async function loadAll(): Promise<Map<string, ShareholderDistribution>> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.byCode;
  if (inflight) return inflight;

  inflight = (async () => {
    const res = await fetch(TDCC_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`TDCC API ${res.status}`);
    const raw: Record<string, string>[] = await res.json();

    const byCode = new Map<string, ShareholderDistribution>();
    for (const row of raw) {
      const code = row["證券代號"]?.trim();
      const tierNum = parseInt(row["持股分級"], 10);
      if (!code || !Number.isFinite(tierNum)) continue;
      const holders = parseInt(row["人數"], 10) || 0;
      const shares = parseInt(row["股數"], 10) || 0;
      // 欄位名稱在原始資料裡帶了 BOM（﻿資料日期），兩種寫法都要接
      const dateRaw = row["﻿資料日期"] || row["資料日期"];
      const date = dateRaw && dateRaw.length === 8 ? `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}` : "";

      let entry = byCode.get(code);
      if (!entry) {
        entry = { date, tiers: [] };
        byCode.set(code, entry);
      }
      entry.tiers.push({ tier: tierNum, holders, shares });
    }

    cache = { fetchedAt: Date.now(), byCode };
    return byCode;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

// 集保標準17級距裡，5/8/9三個級距的股數上限剛好對到20張/50張/100張（1張=1000股），
// 所以「N張以下」直接累加到對應級距序號即可，不用另外算股數區間。
const TIER_CUTOFF: Record<20 | 50 | 100, number> = { 20: 5, 50: 8, 100: 9 };
const TOTAL_TIER = 17;

export interface RetailShareholderRatio {
  date: string;
  totalShares: number;
  totalHolders: number;
  belowThresholdShares: number;
  belowThresholdHolders: number;
  ratioPercent: number;
}

function sumTiers(tiers: ShareholderTier[], upToTier: number) {
  const rows = tiers.filter((t) => t.tier >= 1 && t.tier <= upToTier);
  return {
    shares: rows.reduce((s, t) => s + t.shares, 0),
    holders: rows.reduce((s, t) => s + t.holders, 0),
  };
}

// 每次查詢時把當週三個門檻(20/50/100張)的加總都存起來（不只存使用者當下選的那個），
// 這樣趨勢圖不管使用者切哪個門檻都有歷史可看，不用等使用者剛好選過那個門檻才會有資料。
async function snapshotIfNeeded(code: string, dist: ShareholderDistribution, totalRow: ShareholderTier) {
  if (!dist.date) return;
  const below20 = sumTiers(dist.tiers, TIER_CUTOFF[20]);
  const below50 = sumTiers(dist.tiers, TIER_CUTOFF[50]);
  const below100 = sumTiers(dist.tiers, TIER_CUTOFF[100]);
  const data = {
    totalShares: totalRow.shares,
    totalHolders: totalRow.holders,
    below20LotsShares: below20.shares,
    below20LotsHolders: below20.holders,
    below50LotsShares: below50.shares,
    below50LotsHolders: below50.holders,
    below100LotsShares: below100.shares,
    below100LotsHolders: below100.holders,
  };
  await prisma.stockRetailRatioSnapshot
    .upsert({
      where: { code_date: { code, date: dist.date } },
      update: data,
      create: { code, date: dist.date, ...data },
    })
    .catch(() => {});
}

// 全市場版本：loadAll() 本來就是「全部上市櫃股票」一次回傳，這裡不篩單一代碼，
// 把每一檔的當週分散表都寫進 StockRetailRatioSnapshot（用 createMany+skipDuplicates，
// 同樣是為了一次寫入約4千檔的效率考量，見 tw-stock-fundamentals.ts 的 recordAllEpsSnapshots）。
export async function recordAllRetailRatioSnapshots(): Promise<number> {
  const byCode = await loadAll();
  const rows: {
    code: string;
    date: string;
    totalShares: number;
    totalHolders: number;
    below20LotsShares: number;
    below20LotsHolders: number;
    below50LotsShares: number;
    below50LotsHolders: number;
    below100LotsShares: number;
    below100LotsHolders: number;
  }[] = [];
  for (const [code, dist] of byCode) {
    if (!dist.date) continue;
    const totalRow = dist.tiers.find((t) => t.tier === TOTAL_TIER);
    if (!totalRow || totalRow.shares === 0) continue;
    const below20 = sumTiers(dist.tiers, TIER_CUTOFF[20]);
    const below50 = sumTiers(dist.tiers, TIER_CUTOFF[50]);
    const below100 = sumTiers(dist.tiers, TIER_CUTOFF[100]);
    rows.push({
      code,
      date: dist.date,
      totalShares: totalRow.shares,
      totalHolders: totalRow.holders,
      below20LotsShares: below20.shares,
      below20LotsHolders: below20.holders,
      below50LotsShares: below50.shares,
      below50LotsHolders: below50.holders,
      below100LotsShares: below100.shares,
      below100LotsHolders: below100.holders,
    });
  }
  if (rows.length === 0) return 0;
  const result = await prisma.stockRetailRatioSnapshot.createMany({ data: rows, skipDuplicates: true });
  return result.count;
}

export async function fetchRetailShareholderRatio(
  code: string,
  thresholdLots: 20 | 50 | 100
): Promise<RetailShareholderRatio | null> {
  const byCode = await loadAll();
  const dist = byCode.get(code);
  if (!dist) return null;

  const totalRow = dist.tiers.find((t) => t.tier === TOTAL_TIER);
  if (!totalRow || totalRow.shares === 0) return null;

  await snapshotIfNeeded(code, dist, totalRow);

  const below = sumTiers(dist.tiers, TIER_CUTOFF[thresholdLots]);

  return {
    date: dist.date,
    totalShares: totalRow.shares,
    totalHolders: totalRow.holders,
    belowThresholdShares: below.shares,
    belowThresholdHolders: below.holders,
    ratioPercent: (below.shares / totalRow.shares) * 100,
  };
}

export interface RetailRatioHistoryPoint {
  date: string;
  ratioPercent: number;
  holders: number;
}

export async function fetchRetailRatioHistory(
  code: string,
  thresholdLots: 20 | 50 | 100
): Promise<RetailRatioHistoryPoint[]> {
  const rows = await prisma.stockRetailRatioSnapshot.findMany({
    where: { code },
    orderBy: { date: "asc" },
  });
  const sharesKey = `below${thresholdLots}LotsShares` as const;
  const holdersKey = `below${thresholdLots}LotsHolders` as const;
  return rows
    .filter((r) => r.totalShares > 0)
    .map((r) => ({
      date: r.date,
      ratioPercent: (r[sharesKey] / r.totalShares) * 100,
      holders: r[holdersKey],
    }));
}
