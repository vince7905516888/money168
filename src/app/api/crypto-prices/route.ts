import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchCryptoTwdPrices } from "@/lib/crypto-prices";

// 虛擬貨幣即時台幣價格：GET /api/crypto-prices?codes=SOL,USDC
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const codes = (new URL(req.url).searchParams.get("codes") ?? "").split(",").slice(0, 50);
  const result = await fetchCryptoTwdPrices(codes);
  return NextResponse.json({ ...result, fetchedAt: new Date().toISOString() });
}
