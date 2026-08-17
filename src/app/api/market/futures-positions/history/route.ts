import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// 期交所這份資料沒有歷史查詢功能（見 src/lib/taifex.ts），只能靠每次呼叫
// /api/market/futures-positions 順便存的逐日快照(FuturesPositionSnapshot)慢慢累積，
// 查得到的天數取決於這個網站被打開過幾天，不是一次就能補滿。
const CONTRACT_CODE = "臺股期貨";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const daysParam = Number(req.nextUrl.searchParams.get("days"));
  const days = Number.isFinite(daysParam) ? Math.min(Math.max(Math.trunc(daysParam), 1), 365) : 30;

  const rows = await prisma.futuresPositionSnapshot.findMany({
    where: { contractCode: CONTRACT_CODE },
    orderBy: { date: "desc" },
    take: days * 3, // 每天3筆（自營商/投信/外資及陸資）
  });

  const byDate = new Map<string, { date: string; dealerNet: number | null; trustNet: number | null; foreignNet: number | null }>();
  for (const r of rows) {
    if (!byDate.has(r.date)) byDate.set(r.date, { date: r.date, dealerNet: null, trustNet: null, foreignNet: null });
    const entry = byDate.get(r.date)!;
    if (r.item === "自營商") entry.dealerNet = r.netOpenInterest;
    else if (r.item === "投信") entry.trustNet = r.netOpenInterest;
    else if (r.item === "外資及陸資") entry.foreignNet = r.netOpenInterest;
  }

  const history = [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, days);
  return NextResponse.json({ history });
}
