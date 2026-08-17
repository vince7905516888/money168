import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchForeignHoldingRatio } from "@/lib/tw-stock-chip";

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { code } = await params;
  const cleanCode = code.trim();
  if (!/^\d{4,6}[A-Z]?$/.test(cleanCode)) {
    return NextResponse.json({ error: "股票代碼格式錯誤" }, { status: 400 });
  }

  const ratio = await fetchForeignHoldingRatio(cleanCode);
  if (!ratio) {
    return NextResponse.json({ error: "查無外資持股資料" }, { status: 404 });
  }
  return NextResponse.json(ratio);
}
