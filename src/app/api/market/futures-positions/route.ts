import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchFuturesPositions } from "@/lib/taifex";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  // 先嘗試打即時API，如果期交所有更新會順便寫進資料庫（見 taifex.ts）
  await fetchFuturesPositions().catch(() => null);

  // 畫面一律以資料庫裡「最新一天」的快照為準，不是直接回傳即時API的結果——
  // 這樣手動補登（/api/admin/futures-positions/manual）或排程抓到的資料才能立刻反映在這裡，
  // 不會因為期交所開放API資料進度落後，就一直蓋掉資料庫裡其實已經更新的日期。
  const latest = await prisma.futuresPositionSnapshot.findFirst({
    orderBy: { date: "desc" },
    select: { date: true },
  });
  if (!latest) {
    return NextResponse.json({ error: "目前無法取得期貨未平倉資料" }, { status: 502 });
  }

  const positions = await prisma.futuresPositionSnapshot.findMany({
    where: { date: latest.date },
    orderBy: [{ contractCode: "asc" }, { item: "asc" }],
  });

  return NextResponse.json({
    date: latest.date,
    positions: positions.map((p) => ({
      contractCode: p.contractCode,
      item: p.item,
      longOpenInterest: p.longOpenInterest,
      shortOpenInterest: p.shortOpenInterest,
      netOpenInterest: p.netOpenInterest,
    })),
  });
}
