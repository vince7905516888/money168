import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// 新增一列（延伸試算）：沒填的欄位沿用該方案最後一列的值，年月沒填就接在最後一列的下個月
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { id } = await params;
  const plan = await prisma.calculatorPlan.findFirst({ where: { id, userId: session.user.id } });
  if (!plan) return NextResponse.json({ error: "找不到方案" }, { status: 404 });

  const lastRow = await prisma.calculatorPlanRow.findFirst({
    where: { planId: id },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });

  const body = await req.json().catch(() => ({}));

  let year = body.year;
  let month = body.month;
  if (!year || !month) {
    if (lastRow) {
      month = lastRow.month + 1;
      year = lastRow.year;
      if (month > 12) { month = 1; year += 1; }
    } else {
      const now = new Date();
      year = now.getFullYear();
      month = now.getMonth() + 1;
    }
  }

  const row = await prisma.calculatorPlanRow.create({
    data: {
      planId: id,
      year: parseInt(year),
      month: parseInt(month),
      investment: body.investment !== undefined ? parseFloat(body.investment) : (lastRow?.investment ?? 0),
      fee: body.fee !== undefined ? parseFloat(body.fee) : (lastRow?.fee ?? 0),
      price: body.price !== undefined ? parseFloat(body.price) : (lastRow?.price ?? 0),
      dividendRate: body.dividendRate !== undefined ? parseFloat(body.dividendRate) : (lastRow?.dividendRate ?? 0),
      afterTaxRate: body.afterTaxRate !== undefined ? parseFloat(body.afterTaxRate) : (lastRow?.afterTaxRate ?? 0),
    },
  }).catch(() => null);

  if (!row) return NextResponse.json({ error: "這個年月已經有記錄了" }, { status: 400 });

  return NextResponse.json(row, { status: 201 });
}
