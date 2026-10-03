import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// 最新一筆幣安同步快照（排程工作每 12 小時寫入，見 services/binance-sync）
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const snap = await prisma.binanceSnapshot.findFirst({
    where: { userId: session.user.id },
    orderBy: { fetchedAt: "desc" },
    select: { fetchedAt: true, balances: true, error: true },
  });

  return NextResponse.json(snap ?? null);
}
