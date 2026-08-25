import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchUsStockChart } from "@/lib/us-stock";

// 美股不用像台股那樣分別嘗試多個交易所後綴、也不需要另外接別的資料源補歷史——
// Yahoo Finance 的 chart 端點本身就能涵蓋日/週/月/60分K 的完整歷史，一個端點打完。
const INTERVAL_CONFIG: Record<string, { range: string; interval: string }> = {
  "60m": { range: "6mo", interval: "60m" },
  "1d": { range: "2y", interval: "1d" },
  "1wk": { range: "5y", interval: "1wk" },
  "1mo": { range: "max", interval: "1mo" },
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { symbol } = await params;
  const cleanSymbol = symbol.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(cleanSymbol)) {
    return NextResponse.json({ error: "股票代碼格式錯誤" }, { status: 400 });
  }

  const intervalParam = req.nextUrl.searchParams.get("interval") ?? "1d";
  const config = INTERVAL_CONFIG[intervalParam] ?? INTERVAL_CONFIG["1d"];

  const result = await fetchUsStockChart(cleanSymbol, config.range, config.interval);
  if (!result || result.candles.length === 0) {
    return NextResponse.json({ error: "查無此股票代碼" }, { status: 404 });
  }

  return NextResponse.json({
    symbol: result.meta.symbol,
    name: result.meta.longName || result.meta.shortName || cleanSymbol,
    currency: result.meta.currency,
    exchangeName: result.meta.exchangeName,
    quote: {
      price: result.meta.regularMarketPrice,
      dayHigh: result.meta.regularMarketDayHigh,
      dayLow: result.meta.regularMarketDayLow,
      volume: result.meta.regularMarketVolume,
      previousClose: result.meta.chartPreviousClose,
      fiftyTwoWeekHigh: result.meta.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: result.meta.fiftyTwoWeekLow,
    },
    candles: result.candles,
  });
}
