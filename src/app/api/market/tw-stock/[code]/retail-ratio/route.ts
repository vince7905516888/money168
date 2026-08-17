import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchRetailShareholderRatio } from "@/lib/tdcc";

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

  try {
    const result = await fetchRetailShareholderRatio(cleanCode, threshold);
    if (!result) {
      return NextResponse.json({ error: "查無此股票的集保股權分散資料" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "查詢失敗，請稍後再試" }, { status: 502 });
  }
}
