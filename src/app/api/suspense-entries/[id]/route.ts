import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logMemberActivity } from "@/lib/activity-log";

// 編輯暫計帳：只能改名稱、日期、備註；數量要改請刪除後重新新增（扣除記錄的成本是新增當下算的）
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { id } = await params;
  const { name, date, note, broker } = await req.json();

  const existing = await prisma.suspenseEntry.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing) return NextResponse.json({ error: "找不到記錄" }, { status: 404 });

  const newName = name !== undefined && name !== "" ? name : existing.name;
  const newDate = date !== undefined && date !== "" ? new Date(date) : existing.date;
  const newBroker = broker !== undefined ? (broker?.trim() || null) : existing.broker;

  const updated = await prisma.$transaction(async (tx) => {
    // 同步扣除記錄的日期、交易所與備註
    if (existing.deductInvestmentId) {
      await tx.investment.updateMany({
        where: { id: existing.deductInvestmentId, userId: session.user.id },
        data: { date: newDate, broker: newBroker, note: `暫計帳：${newName}` },
      });
    }
    if (existing.reverseInvestmentId) {
      await tx.investment.updateMany({
        where: { id: existing.reverseInvestmentId, userId: session.user.id },
        data: { broker: newBroker, note: `暫計帳回補：${newName}` },
      });
    }
    return tx.suspenseEntry.update({
      where: { id },
      data: {
        name: newName,
        date: newDate,
        broker: newBroker,
        ...(note !== undefined ? { note: note || null } : {}),
      },
    });
  });

  await logMemberActivity(session.user.id, "UPDATE_SUSPENSE", "suspense-entries", `編輯暫計帳「${updated.name}」`);

  return NextResponse.json(updated);
}

// 刪除暫計帳：連同自動產生的扣除／回補記錄一起刪除，持有數量恢復成沒有這筆暫計帳的狀態
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.suspenseEntry.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing) return NextResponse.json({ error: "找不到記錄" }, { status: 404 });

  const linkedIds = [existing.deductInvestmentId, existing.reverseInvestmentId].filter((x): x is string => !!x);
  await prisma.$transaction([
    prisma.investment.deleteMany({ where: { id: { in: linkedIds }, userId: session.user.id } }),
    prisma.suspenseEntry.delete({ where: { id } }),
  ]);

  await logMemberActivity(session.user.id, "DELETE_SUSPENSE", "suspense-entries", `刪除暫計帳「${existing.name}」${existing.quantity} ${existing.code}`);

  return NextResponse.json({ message: "已刪除" });
}
