import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { id } = await params;
  const plan = await prisma.calculatorPlan.findFirst({
    where: { id, userId: session.user.id },
    include: { rows: { orderBy: [{ year: "asc" }, { month: "asc" }] } },
  });
  if (!plan) return NextResponse.json({ error: "找不到方案" }, { status: 404 });

  return NextResponse.json(plan);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { id } = await params;
  const { name, targetAmount } = await req.json();

  const existing = await prisma.calculatorPlan.findFirst({ where: { id, userId: session.user.id } });
  if (!existing) return NextResponse.json({ error: "找不到方案" }, { status: 404 });

  const updated = await prisma.calculatorPlan.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(targetAmount !== undefined ? { targetAmount: targetAmount === "" || targetAmount === null ? null : parseFloat(targetAmount) } : {}),
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
  const existing = await prisma.calculatorPlan.findFirst({ where: { id, userId: session.user.id } });
  if (!existing) return NextResponse.json({ error: "找不到方案" }, { status: 404 });

  await prisma.calculatorPlan.delete({ where: { id } });

  return NextResponse.json({ message: "已刪除" });
}
