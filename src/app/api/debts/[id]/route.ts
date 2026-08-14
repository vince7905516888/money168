import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { id } = await params;
  const { category, amount, bankName, date, note } = await req.json();

  const existing = await prisma.debt.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing) return NextResponse.json({ error: "找不到記錄" }, { status: 404 });

  const updated = await prisma.debt.update({
    where: { id },
    data: {
      ...(category !== undefined ? { category } : {}),
      ...(amount !== undefined && amount !== "" ? { amount: parseFloat(amount) } : {}),
      ...(bankName !== undefined ? { bankName: bankName || null } : {}),
      ...(date !== undefined ? { date: new Date(date) } : {}),
      ...(note !== undefined ? { note: note || null } : {}),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.debt.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing) return NextResponse.json({ error: "找不到記錄" }, { status: 404 });

  await prisma.debt.delete({ where: { id } });
  return NextResponse.json({ message: "已刪除" });
}
