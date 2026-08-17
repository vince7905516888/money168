import { NextResponse } from "next/server";
import { fetchTwelveQuote } from "@/lib/twelvedata";

export async function GET() {
  const quote = await fetchTwelveQuote("XAU/USD");
  if (!quote) {
    return NextResponse.json({ error: "查無資料，或資料來源目前無法連線" }, { status: 502 });
  }

  return NextResponse.json({ symbol: "XAU/USD", ...quote });
}
