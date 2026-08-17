import { NextRequest, NextResponse } from "next/server";
import { fetchTwelveKlines, isValidInterval } from "@/lib/twelvedata";

// 跟「外匯投資」頁同一份幣別清單，一律兌台幣。
const ALLOWED_CURRENCIES = new Set(["USD", "JPY", "EUR", "GBP", "AUD", "CNY", "HKD", "CAD", "NZD", "SGD", "ZAR", "CHF", "THB"]);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const currency = (searchParams.get("symbol") || "USD").toUpperCase();
  const interval = searchParams.get("interval") || "1d";

  if (!ALLOWED_CURRENCIES.has(currency)) {
    return NextResponse.json({ error: "無效的幣別代碼" }, { status: 400 });
  }
  if (!isValidInterval(interval)) {
    return NextResponse.json({ error: "無效的時間週期" }, { status: 400 });
  }

  const symbol = `${currency}/TWD`;
  const candles = await fetchTwelveKlines(symbol, interval);
  if (!candles) {
    return NextResponse.json({ error: "查無此幣別，或資料來源目前無法連線" }, { status: 502 });
  }

  return NextResponse.json({ symbol: currency, interval, candles });
}
