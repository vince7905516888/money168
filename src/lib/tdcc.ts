// 集保結算所公開資料「集保戶股權分散表」(dataset 1-5)：免費、不需金鑰，但是「全部上市櫃股票、
// 全部17個持股級距」一次回傳（約4千檔*17級距），沒有單一股票查詢的參數，只能整包抓回來自己篩。
// 每週最後一個營業日結算一次，不是每天更新，所以在記憶體裡快取一段時間，不用每次查詢都重抓一次大檔。
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

export async function fetchRetailShareholderRatio(
  code: string,
  thresholdLots: 20 | 50 | 100
): Promise<RetailShareholderRatio | null> {
  const byCode = await loadAll();
  const dist = byCode.get(code);
  if (!dist) return null;

  const totalRow = dist.tiers.find((t) => t.tier === TOTAL_TIER);
  if (!totalRow || totalRow.shares === 0) return null;

  const cutoff = TIER_CUTOFF[thresholdLots];
  const belowRows = dist.tiers.filter((t) => t.tier >= 1 && t.tier <= cutoff);
  const belowShares = belowRows.reduce((s, t) => s + t.shares, 0);
  const belowHolders = belowRows.reduce((s, t) => s + t.holders, 0);

  return {
    date: dist.date,
    totalShares: totalRow.shares,
    totalHolders: totalRow.holders,
    belowThresholdShares: belowShares,
    belowThresholdHolders: belowHolders,
    ratioPercent: (belowShares / totalRow.shares) * 100,
  };
}
