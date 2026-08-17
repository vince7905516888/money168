// Twelve Data：外匯／黃金K線資料來源。免費額度每分鐘8次、每天800次，
// 用 next revalidate 快取降低重複打上游API的次數。

export interface TwelveCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface TwelveQuote {
  lastPrice: number;
  priceChangePercent: number;
  highPrice: number;
  lowPrice: number;
}

const INTERVAL_MAP: Record<string, string> = {
  "15m": "15min",
  "1h": "1h",
  "4h": "4h",
  "1d": "1day",
  "1w": "1week",
};

export function isValidInterval(interval: string): boolean {
  return interval in INTERVAL_MAP;
}

// Twelve Data 回傳資料是新到舊排序，圖表要舊到新，記得反過來。
export async function fetchTwelveKlines(symbol: string, interval: string): Promise<TwelveCandle[] | null> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) return null;

  const td_interval = INTERVAL_MAP[interval];
  if (!td_interval) return null;

  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${td_interval}&outputsize=200&apikey=${apiKey}`;
  const res = await fetch(url, { next: { revalidate: 60 } });
  if (!res.ok) return null;
  const json = await res.json();
  if (json.status !== "ok" || !Array.isArray(json.values)) {
    console.error("Twelve Data time_series error:", json.message || json);
    return null;
  }

  return json.values
    .map((v: { datetime: string; open: string; high: string; low: string; close: string }) => ({
      time: Math.floor(new Date(v.datetime.length === 10 ? `${v.datetime}T00:00:00Z` : `${v.datetime}Z`).getTime() / 1000),
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
    }))
    .reverse();
}

export async function fetchTwelveQuote(symbol: string): Promise<TwelveQuote | null> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) return null;

  const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;
  const res = await fetch(url, { next: { revalidate: 30 } });
  if (!res.ok) return null;
  const json = await res.json();
  if (json.status === "error" || json.close == null) {
    console.error("Twelve Data quote error:", json.message || json);
    return null;
  }

  return {
    lastPrice: parseFloat(json.close),
    priceChangePercent: parseFloat(json.percent_change),
    highPrice: parseFloat(json.high),
    lowPrice: parseFloat(json.low),
  };
}
