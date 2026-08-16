import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchVolumeRanking } from "@/lib/shioaji-gateway";

// 即時成交量排行：走永豐 Shioaji scanners，跟用證交所 T86 做的「全市場買賣超前15名」不一樣——
// 那個是收盤後才有的三大法人籌碼資料，這個是盤中即時的成交量排行。
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const ranking = await fetchVolumeRanking();
  if (!ranking) {
    return NextResponse.json({ error: "目前無法取得即時成交量排行" }, { status: 502 });
  }
  return NextResponse.json({ ranking });
}
