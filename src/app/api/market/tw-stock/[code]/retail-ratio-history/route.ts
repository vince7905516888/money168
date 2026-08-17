import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchRetailRatioHistory } from "@/lib/tdcc";

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { code } = await params;
  const cleanCode = code.trim();
  if (!/^\d{4,6}[A-Z]?$/.test(cleanCode)) {
    return NextResponse.json({ error: "股票代碼格式錯誤" }, { status: 400 });
  }

  const thresholdParam = req.nextUrl.searchParams.get("threshold");
  const threshold = thresholdParam === "50" ? 50 : thresholdParam === "100" ? 100 : 20;

  const history = await fetchRetailRatioHistory(cleanCode, threshold);
  return NextResponse.json({ history });
}
