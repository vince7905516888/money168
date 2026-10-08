import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logMemberActivity } from "@/lib/activity-log";

// 回補：賺回暫計帳的數量後，用扣除當下的同一個成本把數量加回持有
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });
  const userId = session.user.id;

  const { id } = await params;
  const { date } = await req.json().catch(() => ({}));

  const existing = await prisma.suspenseEntry.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: "找不到記錄" }, { status: 404 });
  if (existing.reversedAt) return NextResponse.json({ error: "這筆暫計帳已經回補過了" }, { status: 400 });

  const reverseDate = date ? new Date(date) : new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const reverse = await tx.investment.create({
      data: {
        type: "CRYPTO",
        name: existing.code,
        code: existing.code,
        action: "BUY",
        quantity: existing.quantity,
        price: existing.unitCost,
        amount: existing.quantity * existing.unitCost,
        broker: existing.broker,
        date: reverseDate,
        note: `暫計帳回補：${existing.name}`,
        userId,
      },
    });
    return tx.suspenseEntry.update({
      where: { id },
      data: { reversedAt: reverseDate, reverseInvestmentId: reverse.id },
    });
  });

  await logMemberActivity(userId, "REVERSE_SUSPENSE", "suspense-entries", `回補暫計帳「${existing.name}」${existing.quantity} ${existing.code}`);

  return NextResponse.json(updated);
}

// 取消回補：刪除回補記錄，數量重新被暫計帳扣住
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });
  const userId = session.user.id;

  const { id } = await params;
  const existing = await prisma.suspenseEntry.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: "找不到記錄" }, { status: 404 });
  if (!existing.reversedAt) return NextResponse.json({ error: "這筆暫計帳還沒有回補" }, { status: 400 });

  const updated = await prisma.$transaction(async (tx) => {
    if (existing.reverseInvestmentId) {
      await tx.investment.deleteMany({ where: { id: existing.reverseInvestmentId, userId } });
    }
    return tx.suspenseEntry.update({
      where: { id },
      data: { reversedAt: null, reverseInvestmentId: null },
    });
  });

  await logMemberActivity(userId, "UNDO_REVERSE_SUSPENSE", "suspense-entries", `取消回補暫計帳「${existing.name}」`);

  return NextResponse.json(updated);
}
