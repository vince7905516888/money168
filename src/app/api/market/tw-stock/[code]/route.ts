import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { lookupStockName } from "@/lib/tw-stock-directory";
import { fetchLiveQuote } from "@/lib/shioaji-gateway";

// K線週期對應的 Yahoo Finance interval/range：週期越大，抓的歷史範圍越長，
// 方便搭配前端新增的縮放(Brush)功能回顧更長的歷史。
const INTERVAL_CONFIG: Record<string, { interval: string; range: string; intraday: boolean }> = {
  "60m": { interval: "60m", range: "1y", intraday: true },
  "1d": { interval: "1d", range: "2y", intraday: false },
  "1wk": { interval: "1wk", range: "5y", intraday: false },
  "1mo": { interval: "1mo", range: "max", intraday: false },
};

// 免費、不需金鑰的 Yahoo Finance chart 端點，資料可能延遲且非正式授權來源，僅供個人參考使用。
// 上市股票用 .TW 後綴、上櫃股票用 .TWO 後綴，依序嘗試。
async function fetchYahooChart(symbol: string, config: { interval: string; range: string }) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${config.range}&interval=${config.interval}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MoneyFlowApp/1.0)" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) return null;
  return result;
}

// 60分K要顯示到時分，其餘週期只顯示到日期；一律轉成台北時間，避免主機時區（Railway 預設 UTC）跟台股盤中時間對不上。
function formatBarDate(ts: number, intraday: boolean): string {
  const d = new Date(ts * 1000);
  if (intraday) {
    return d.toLocaleString("sv-SE", { timeZone: "Asia/Taipei", hour12: false }).slice(0, 16);
  }
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { code } = await params;
  const cleanCode = code.trim();
  if (!/^\d{4,6}$/.test(cleanCode)) {
    return NextResponse.json({ error: "股票代碼格式錯誤" }, { status: 400 });
  }

  const intervalParam = req.nextUrl.searchParams.get("interval") ?? "1d";
  const config = INTERVAL_CONFIG[intervalParam] ?? INTERVAL_CONFIG["1d"];

  let market: "TW" | "TWO" = "TW";
  let result = await fetchYahooChart(`${cleanCode}.TW`, config);
  if (!result) {
    result = await fetchYahooChart(`${cleanCode}.TWO`, config);
    market = "TWO";
  }

  if (!result) {
    return NextResponse.json({ error: "查無此股票代碼" }, { status: 404 });
  }

  const timestamps: number[] = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const opens: (number | null)[] = quote.open ?? [];
  const highs: (number | null)[] = quote.high ?? [];
  const lows: (number | null)[] = quote.low ?? [];
  const closes: (number | null)[] = quote.close ?? [];
  const volumes: (number | null)[] = quote.volume ?? [];

  const quotes = timestamps
    .map((ts, i) => ({
      date: formatBarDate(ts, config.intraday),
      open: opens[i],
      high: highs[i],
      low: lows[i],
      close: closes[i],
      volume: volumes[i],
    }))
    .filter((q) => q.open != null && q.close != null);

  if (quotes.length === 0) {
    return NextResponse.json({ error: "此股票目前沒有可用的歷史資料" }, { status: 404 });
  }

  const meta = result.meta ?? {};
  const [chineseName, liveQuote] = await Promise.all([
    lookupStockName(cleanCode).catch(() => null),
    fetchLiveQuote(cleanCode),
  ]);

  return NextResponse.json({
    code: cleanCode,
    market,
    name: chineseName || meta.longName || meta.shortName || cleanCode,
    currency: meta.currency ?? "TWD",
    quotes,
    liveQuote,
  });
}
