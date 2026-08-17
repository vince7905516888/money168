import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTwFundamentals } from "@/lib/tw-stock-fundamentals";

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { code } = await params;
  const cleanCode = code.trim();
  if (!/^\d{4,6}[A-Z]?$/.test(cleanCode)) {
    return NextResponse.json({ error: "股票代碼格式錯誤" }, { status: 400 });
  }

  const fundamentals = await getTwFundamentals(cleanCode);
  return NextResponse.json(fundamentals);
}
