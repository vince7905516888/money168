import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchTodayKbars } from "@/lib/shioaji-gateway";

// 今日走勢圖：用永豐 Shioaji 的1分鐘K棒，只有這個粒度、沒有日線彙總，只拿來畫「當天」走勢。
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { code } = await params;
  const cleanCode = code.trim();
  if (!/^\d{4,6}$/.test(cleanCode)) {
    return NextResponse.json({ error: "股票代碼格式錯誤" }, { status: 400 });
  }

  const bars = await fetchTodayKbars(cleanCode);
  if (!bars) {
    return NextResponse.json({ error: "目前無法取得當日走勢資料" }, { status: 502 });
  }
  return NextResponse.json({ bars });
}
