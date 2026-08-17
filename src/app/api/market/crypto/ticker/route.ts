import { NextRequest, NextResponse } from "next/server";

const SYMBOL_PATTERN = /^[A-Z0-9]{5,20}$/;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "BTCUSDT").toUpperCase();

  if (!SYMBOL_PATTERN.test(symbol)) {
    return NextResponse.json({ error: "無效的交易對代碼" }, { status: 400 });
  }

  const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`;

  try {
    const res = await fetch(url, { next: { revalidate: 10 } });
    if (!res.ok) {
      return NextResponse.json({ error: "查無此交易對，或 Binance 目前無法連線" }, { status: 502 });
    }
    const data = await res.json();

    return NextResponse.json({
      symbol: data.symbol,
      lastPrice: parseFloat(data.lastPrice),
      priceChangePercent: parseFloat(data.priceChangePercent),
      highPrice: parseFloat(data.highPrice),
      lowPrice: parseFloat(data.lowPrice),
      volume: parseFloat(data.volume),
    });
  } catch {
    return NextResponse.json({ error: "連線 Binance API 失敗" }, { status: 502 });
  }
}
