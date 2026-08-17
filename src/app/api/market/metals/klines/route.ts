import { NextRequest, NextResponse } from "next/server";
import { fetchMetalKlines, isValidMetalInterval, METAL_SYMBOLS } from "@/lib/precious-metals";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const metal = (searchParams.get("metal") || "GOLD").toUpperCase();
  const interval = searchParams.get("interval") || "1d";

  if (!(metal in METAL_SYMBOLS)) {
    return NextResponse.json({ error: "無效的貴金屬代碼" }, { status: 400 });
  }
  if (!isValidMetalInterval(interval)) {
    return NextResponse.json({ error: "無效的時間週期" }, { status: 400 });
  }

  const candles = await fetchMetalKlines(metal, interval);
  if (!candles || candles.length === 0) {
    return NextResponse.json({ error: "查無資料，或資料來源目前無法連線" }, { status: 502 });
  }

  return NextResponse.json({ metal, interval, candles });
}
