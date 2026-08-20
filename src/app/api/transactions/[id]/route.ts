import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logMemberActivity } from "@/lib/activity-log";

const TYPE_LABEL: Record<string, string> = { INCOME: "收入", EXPENSE: "支出", TRANSFER: "調帳" };

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { id } = await params;
  const { title, amount, type, date, note, categoryId, currency } = await req.json();

  const existing = await prisma.transaction.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing)
    return NextResponse.json({ error: "找不到記錄" }, { status: 404 });

  const updated = await prisma.transaction.update({
    where: { id },
    data: {
      title,
      amount: parseFloat(amount),
      type,
      date: new Date(date),
      note,
      currency: currency || "TWD",
      categoryId: categoryId || null,
    },
    include: { category: true },
  });

  const isBank = updated.source === "BANK";
  await logMemberActivity(
    session.user.id,
    "UPDATE_TRANSACTION",
    isBank ? "banks" : "transactions",
    `編輯${TYPE_LABEL[updated.type] ?? updated.type}「${updated.title}」${updated.amount}${updated.currency ? " " + updated.currency : ""}`
  );

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { id } = await params;

  const existing = await prisma.transaction.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing)
    return NextResponse.json({ error: "找不到記錄" }, { status: 404 });

  await prisma.transaction.delete({ where: { id } });

  const isBank = existing.source === "BANK";
  await logMemberActivity(
    session.user.id,
    "DELETE_TRANSACTION",
    isBank ? "banks" : "transactions",
    `刪除${TYPE_LABEL[existing.type] ?? existing.type}「${existing.title}」${existing.amount}${existing.currency ? " " + existing.currency : ""}`
  );

  return NextResponse.json({ message: "已刪除" });
}
