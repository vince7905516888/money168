import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchFuturesPositions } from "@/lib/taifex";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const result = await fetchFuturesPositions();
  if (!result) {
    return NextResponse.json({ error: "目前無法取得期貨未平倉資料" }, { status: 502 });
  }
  return NextResponse.json(result);
}
