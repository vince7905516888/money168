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
  const existing = await prisma.calculatorPlanRow.findUnique({
    where: { id },
    include: { plan: { select: { userId: true } } },
  });
  if (!existing || existing.plan.userId !== session.user.id) {
    return NextResponse.json({ error: "找不到記錄" }, { status: 404 });
  }

  const { investment, fee, price, dividendRate, afterTaxRate, holdingSharesOverride, dividendOverride, sharesToBuy } = await req.json();

  // 覆蓋欄位：空字串／null 代表清掉覆蓋、改回照公式算；其他欄位維持「沒傳就不動」
  const overrideValue = (v: unknown) => (v === "" || v === null ? null : parseFloat(v as string));

  const updated = await prisma.calculatorPlanRow.update({
    where: { id },
    data: {
      ...(investment !== undefined && investment !== "" ? { investment: parseFloat(investment) } : {}),
      ...(fee !== undefined && fee !== "" ? { fee: parseFloat(fee) } : {}),
      ...(price !== undefined && price !== "" ? { price: parseFloat(price) } : {}),
      ...(dividendRate !== undefined && dividendRate !== "" ? { dividendRate: parseFloat(dividendRate) } : {}),
      ...(afterTaxRate !== undefined && afterTaxRate !== "" ? { afterTaxRate: parseFloat(afterTaxRate) } : {}),
      ...(holdingSharesOverride !== undefined ? { holdingSharesOverride: overrideValue(holdingSharesOverride) } : {}),
      ...(dividendOverride !== undefined ? { dividendOverride: overrideValue(dividendOverride) } : {}),
      ...(sharesToBuy !== undefined && sharesToBuy !== "" && sharesToBuy !== null ? { sharesToBuy: parseFloat(sharesToBuy) } : {}),
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
  const existing = await prisma.calculatorPlanRow.findUnique({
    where: { id },
    include: { plan: { select: { userId: true } } },
  });
  if (!existing || existing.plan.userId !== session.user.id) {
    return NextResponse.json({ error: "找不到記錄" }, { status: 404 });
  }

  await prisma.calculatorPlanRow.delete({ where: { id } });

  return NextResponse.json({ message: "已刪除" });
}
