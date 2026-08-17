// 貴金屬K線：COMEX期貨報價，免費、不需金鑰的 Yahoo Finance chart 端點（跟舊版台股頁用的
// 同一支API），資料可能延遲且非正式授權來源，僅供個人參考使用。
// Twelve Data 免費額度只開放黃金(XAU)，白銀/鉑金/鈀金被鎖在付費方案，所以改走這條路，
// 一次涵蓋四種貴金屬，且5個週期（15分/1小時/4小時/日/週）都支援。

export const METAL_SYMBOLS: Record<string, string> = {
  GOLD: "GC=F",
  SILVER: "SI=F",
  PLATINUM: "PL=F",
  PALLADIUM: "PA=F",
};

const RANGE_BY_INTERVAL: Record<string, string> = {
  "15m": "5d",
  "1h": "1mo",
  "4h": "3mo",
  "1d": "2y",
  "1w": "5y",
};

export interface MetalCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export function isValidMetalInterval(interval: string): boolean {
  return interval in RANGE_BY_INTERVAL;
}

export async function fetchMetalKlines(metalKey: string, interval: string): Promise<MetalCandle[] | null> {
  const symbol = METAL_SYMBOLS[metalKey];
  const range = RANGE_BY_INTERVAL[interval];
  if (!symbol || !range) return null;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=${interval}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MoneyFlowApp/1.0)" },
    next: { revalidate: 60 },
  });
  if (!res.ok) return null;
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) return null;

  const timestamps: number[] = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const opens: (number | null)[] = quote.open ?? [];
  const highs: (number | null)[] = quote.high ?? [];
  const lows: (number | null)[] = quote.low ?? [];
  const closes: (number | null)[] = quote.close ?? [];

  return timestamps
    .map((t, i) => ({ time: t, open: opens[i], high: highs[i], low: lows[i], close: closes[i] }))
    .filter((c): c is MetalCandle => c.open != null && c.high != null && c.low != null && c.close != null);
}

export interface MetalQuote {
  lastPrice: number;
  priceChangePercent: number;
  highPrice: number;
  lowPrice: number;
}

export async function fetchMetalQuote(metalKey: string): Promise<MetalQuote | null> {
  const symbol = METAL_SYMBOLS[metalKey];
  if (!symbol) return null;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1d&interval=1d`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MoneyFlowApp/1.0)" },
    next: { revalidate: 30 },
  });
  if (!res.ok) return null;
  const json = await res.json();
  const meta = json?.chart?.result?.[0]?.meta;
  if (!meta || meta.regularMarketPrice == null) return null;

  const price = meta.regularMarketPrice;
  const prevClose = meta.chartPreviousClose ?? meta.previousClose;
  return {
    lastPrice: price,
    priceChangePercent: prevClose ? ((price - prevClose) / prevClose) * 100 : 0,
    highPrice: meta.regularMarketDayHigh ?? price,
    lowPrice: meta.regularMarketDayLow ?? price,
  };
}
