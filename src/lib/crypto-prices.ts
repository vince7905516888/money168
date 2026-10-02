import { SYMBOL_TO_PAIR, firstResultValue } from "@/lib/kraken";
import { fetchTwelveQuote } from "@/lib/twelvedata";

// 虛擬貨幣即時台幣價格：Kraken 公開行情（美元價）× 美元兌台幣匯率。
// 匯率優先用 Twelve Data（跟投資策略頁同一個來源），抓不到再退回 open.er-api.com 的免費匯率。
// 虛擬貨幣頁、資產總攬（配息市值）與後台全站統計共用。

const STABLE_COINS = new Set(["USDT", "USDC", "FDUSD", "DAI", "TUSD", "USDP"]);
const CACHE_MS = 60_000;
const priceCache = new Map<string, { usd: number | null; at: number }>();
let fxCache: { rate: number; at: number } | null = null;

interface KrakenTicker {
  c: [string, string];
}

async function fetchUsdTwd(): Promise<number | null> {
  if (fxCache && Date.now() - fxCache.at < CACHE_MS) return fxCache.rate;
  let rate: number | null = null;
  const twelve = await fetchTwelveQuote("USD/TWD").catch(() => null);
  if (twelve && twelve.lastPrice > 0) rate = twelve.lastPrice;
  if (!rate) {
    try {
      const res = await fetch("https://open.er-api.com/v6/latest/USD", { cache: "no-store" });
      const json = res.ok ? await res.json() : null;
      const twd = json?.rates?.TWD;
      if (typeof twd === "number" && twd > 0) rate = twd;
    } catch {
      // 兩個來源都抓不到就回傳 null，呼叫端不顯示市值
    }
  }
  if (rate) fxCache = { rate, at: Date.now() };
  return rate;
}

async function fetchUsdPrice(code: string): Promise<number | null> {
  const cached = priceCache.get(code);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.usd;
  // 沒在對照表裡的幣，直接用 Kraken 慣用的「代碼+USD」交易對
  const pair = SYMBOL_TO_PAIR[code] ?? `${code}USD`;
  let usd: number | null = null;
  try {
    const res = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${pair}`, { cache: "no-store" });
    const json = res.ok ? await res.json() : null;
    if (json && !json.error?.length) {
      const ticker = firstResultValue<KrakenTicker>(json.result);
      const price = ticker ? parseFloat(ticker.c[0]) : NaN;
      if (Number.isFinite(price) && price > 0) usd = price;
    }
  } catch {
    // 抓不到就當作沒有報價
  }
  if (usd == null && STABLE_COINS.has(code)) usd = 1;
  priceCache.set(code, { usd, at: Date.now() });
  return usd;
}

export async function fetchCryptoTwdPrices(codes: string[]): Promise<{ usdTwd: number | null; prices: Record<string, number> }> {
  const unique = [...new Set(codes.map((c) => c.trim().toUpperCase()).filter((c) => c && c !== "TWD"))];
  const usdTwd = await fetchUsdTwd();
  const prices: Record<string, number> = {};
  if (!usdTwd || unique.length === 0) return { usdTwd, prices };
  const results = await Promise.all(unique.map(async (code) => [code, await fetchUsdPrice(code)] as const));
  for (const [code, usd] of results) {
    if (usd != null) prices[code] = usd * usdTwd;
  }
  return { usdTwd, prices };
}
