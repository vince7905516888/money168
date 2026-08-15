import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// 免費、不需金鑰的 Yahoo Finance chart 端點，資料可能延遲且非正式授權來源，僅供個人參考使用。
// 上市股票用 .TW 後綴、上櫃股票用 .TWO 後綴，依序嘗試。
async function fetchYahooChart(symbol: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1y&interval=1d`;
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

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { code } = await params;
  const cleanCode = code.trim();
  if (!/^\d{4,6}$/.test(cleanCode)) {
    return NextResponse.json({ error: "股票代碼格式錯誤" }, { status: 400 });
  }

  let market: "TW" | "TWO" = "TW";
  let result = await fetchYahooChart(`${cleanCode}.TW`);
  if (!result) {
    result = await fetchYahooChart(`${cleanCode}.TWO`);
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
      date: new Date(ts * 1000).toISOString().split("T")[0],
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

  return NextResponse.json({
    code: cleanCode,
    market,
    name: meta.longName || meta.shortName || cleanCode,
    currency: meta.currency ?? "TWD",
    quotes,
  });
}
