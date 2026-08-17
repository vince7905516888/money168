import { NextRequest, NextResponse } from "next/server";
import { fetchTwelveKlines, isValidInterval } from "@/lib/twelvedata";

// 黃金沒有 XAU/TWD 報價（Twelve Data 不支援），只能用 XAU/USD（國際金價，美元計價）。
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const interval = searchParams.get("interval") || "1d";

  if (!isValidInterval(interval)) {
    return NextResponse.json({ error: "無效的時間週期" }, { status: 400 });
  }

  const candles = await fetchTwelveKlines("XAU/USD", interval);
  if (!candles) {
    return NextResponse.json({ error: "查無資料，或資料來源目前無法連線" }, { status: 502 });
  }

  return NextResponse.json({ symbol: "XAU/USD", interval, candles });
}
