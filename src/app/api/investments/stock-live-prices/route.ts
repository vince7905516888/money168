import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchLiveStockAndCryptoPrices } from "@/lib/strategy-live-prices";

// 「股票投資」頁「未實現損益」用的即時報價，跟「投資策略」頁「當前」欄位共用同一套抓價邏輯
// （見 lib/strategy-live-prices.ts）：優先打永豐 Shioaji 閘道，抓不到才退回證交所收盤價。
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { codes } = await req.json();
  const stockCodes: string[] = Array.isArray(codes)
    ? [...new Set(codes.map((c) => String(c).trim()).filter(Boolean))]
    : [];
  if (stockCodes.length === 0) return NextResponse.json({ prices: {} });

  const priceMap = await fetchLiveStockAndCryptoPrices(stockCodes, []);
  const prices: Record<string, number> = {};
  for (const code of stockCodes) {
    const price = priceMap.get(`STOCK:${code}`);
    if (price != null) prices[code] = price;
  }

  return NextResponse.json({ prices });
}
