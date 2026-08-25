import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchUsStockFundamentals } from "@/lib/us-stock";

export async function GET(req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { symbol } = await params;
  const cleanSymbol = symbol.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(cleanSymbol)) {
    return NextResponse.json({ error: "股票代碼格式錯誤" }, { status: 400 });
  }

  const fundamentals = await fetchUsStockFundamentals(cleanSymbol);
  if (!fundamentals) {
    return NextResponse.json({ error: "查無基本面資料" }, { status: 404 });
  }

  return NextResponse.json(fundamentals);
}
