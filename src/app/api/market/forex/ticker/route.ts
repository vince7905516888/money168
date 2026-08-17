import { NextRequest, NextResponse } from "next/server";
import { fetchTwelveQuote } from "@/lib/twelvedata";

const ALLOWED_CURRENCIES = new Set(["USD", "JPY", "EUR", "GBP", "AUD", "CNY", "HKD", "CAD", "NZD", "SGD", "ZAR", "CHF", "THB"]);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const currency = (searchParams.get("symbol") || "USD").toUpperCase();

  if (!ALLOWED_CURRENCIES.has(currency)) {
    return NextResponse.json({ error: "無效的幣別代碼" }, { status: 400 });
  }

  const quote = await fetchTwelveQuote(`${currency}/TWD`);
  if (!quote) {
    return NextResponse.json({ error: "查無此幣別，或資料來源目前無法連線" }, { status: 502 });
  }

  return NextResponse.json({ symbol: currency, ...quote });
}
