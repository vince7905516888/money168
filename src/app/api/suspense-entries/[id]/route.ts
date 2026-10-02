import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logMemberActivity } from "@/lib/activity-log";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { id } = await params;
  const { name, amount, date, note } = await req.json();

  const existing = await prisma.suspenseEntry.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing) return NextResponse.json({ error: "找不到記錄" }, { status: 404 });

  const updated = await prisma.suspenseEntry.update({
    where: { id },
    data: {
      ...(name !== undefined && name !== "" ? { name } : {}),
      ...(amount !== undefined && amount !== "" ? { amount: parseFloat(amount) } : {}),
      ...(date !== undefined && date !== "" ? { date: new Date(date) } : {}),
      ...(note !== undefined ? { note: note || null } : {}),
    },
  });

  await logMemberActivity(session.user.id, "UPDATE_SUSPENSE", "suspense-entries", `編輯暫計帳「${updated.name}」${updated.amount}`);

  return NextResponse.json(updated);
}

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

  await prisma.suspenseEntry.delete({ where: { id } });

  await logMemberActivity(session.user.id, "DELETE_SUSPENSE", "suspense-entries", `刪除暫計帳「${existing.name}」${existing.amount}`);

  return NextResponse.json({ message: "已刪除" });
}
