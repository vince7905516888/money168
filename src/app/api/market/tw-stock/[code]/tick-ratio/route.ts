import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchTickRatio } from "@/lib/shioaji-gateway";

// 內外盤比：永豐閘道那邊已經把當日逐筆成交(ticks)聚合好才回傳，這裡不用再處理原始資料。
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { code } = await params;
  const cleanCode = code.trim();
  if (!/^\d{4,6}[A-Z]?$/.test(cleanCode)) {
    return NextResponse.json({ error: "股票代碼格式錯誤" }, { status: 400 });
  }

  const dateParam = req.nextUrl.searchParams.get("date") ?? undefined;
  const ratio = await fetchTickRatio(cleanCode, dateParam);
  if (!ratio) {
    return NextResponse.json({ error: "目前無法取得內外盤資料" }, { status: 502 });
  }
  return NextResponse.json(ratio);
}
