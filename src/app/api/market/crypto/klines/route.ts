import { NextRequest, NextResponse } from "next/server";

const ALLOWED_INTERVALS = new Set(["15m", "1h", "4h", "1d", "1w"]);
const SYMBOL_PATTERN = /^[A-Z0-9]{5,20}$/;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "BTCUSDT").toUpperCase();
  const interval = searchParams.get("interval") || "1d";
  const limit = Math.min(Number(searchParams.get("limit")) || 200, 500);

  if (!SYMBOL_PATTERN.test(symbol)) {
    return NextResponse.json({ error: "無效的交易對代碼" }, { status: 400 });
  }
  if (!ALLOWED_INTERVALS.has(interval)) {
    return NextResponse.json({ error: "無效的時間週期" }, { status: 400 });
  }

  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;

  try {
    const res = await fetch(url, { next: { revalidate: 30 } });
    if (!res.ok) {
      return NextResponse.json({ error: "查無此交易對，或 Binance 目前無法連線" }, { status: 502 });
    }
    const raw: unknown[] = await res.json();

    const candles = raw.map((row) => {
      const r = row as [number, string, string, string, string, string, ...unknown[]];
      return {
        time: Math.floor(r[0] / 1000),
        open: parseFloat(r[1]),
        high: parseFloat(r[2]),
        low: parseFloat(r[3]),
        close: parseFloat(r[4]),
        volume: parseFloat(r[5]),
      };
    });

    return NextResponse.json({ symbol, interval, candles });
  } catch {
    return NextResponse.json({ error: "連線 Binance API 失敗" }, { status: 502 });
  }
}
