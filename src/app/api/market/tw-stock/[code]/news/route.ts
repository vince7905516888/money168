import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchStockNews } from "@/lib/tw-stock-news";

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { code } = await params;
  const cleanCode = code.trim().toUpperCase();
  if (!/^\d{4,6}[A-Z]?$/.test(cleanCode)) {
    return NextResponse.json({ error: "股票代碼格式錯誤" }, { status: 400 });
  }

  const news = await fetchStockNews(cleanCode);
  return NextResponse.json({ news });
}
