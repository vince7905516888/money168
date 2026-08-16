import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchLendingAvailability } from "@/lib/tw-stock-chip";

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { code } = await params;
  const cleanCode = code.trim();
  if (!/^\d{4,6}$/.test(cleanCode)) {
    return NextResponse.json({ error: "股票代碼格式錯誤" }, { status: 400 });
  }

  const lending = await fetchLendingAvailability(cleanCode);
  if (!lending) {
    return NextResponse.json({ error: "查無借券資料" }, { status: 404 });
  }
  return NextResponse.json(lending);
}
