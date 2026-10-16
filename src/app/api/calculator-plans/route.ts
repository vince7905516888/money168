import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const plans = await prisma.calculatorPlan.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, targetAmount: true, dividendFrequency: true, createdAt: true, _count: { select: { rows: true } } },
  });

  return NextResponse.json(plans);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const {
    name, startYear, startMonth, years, targetAmount, dividendFrequency,
    monthlyInvestment, fee, price, dividendPerShare, afterTaxRate,
  } = await req.json();

  if (!name || !startYear || !startMonth) {
    return NextResponse.json({ error: "請填寫必要欄位" }, { status: 400 });
  }
  const VALID_FREQUENCIES = ["MONTHLY", "QUARTERLY_1", "QUARTERLY_2", "QUARTERLY_3"];
  const frequency = VALID_FREQUENCIES.includes(dividendFrequency) ? dividendFrequency : "MONTHLY";
  const monthCount = Math.max(1, Math.min(600, parseInt(years) || 10) * 12);
  const investment = parseFloat(monthlyInvestment) || 0;
  const feeVal = parseFloat(fee) || 0;
  const priceVal = parseFloat(price) || 0;
  const dividendRate = parseFloat(dividendPerShare) || 0;
  const afterTax = (parseFloat(afterTaxRate) || 0) / 100;

  const plan = await prisma.calculatorPlan.create({
    data: {
      name,
      targetAmount: targetAmount !== undefined && targetAmount !== "" ? parseFloat(targetAmount) : null,
      dividendFrequency: frequency,
      userId: session.user.id,
    },
  });

  let y = parseInt(startYear);
  let m = parseInt(startMonth);
  const rows = [];
  for (let i = 0; i < monthCount; i++) {
    rows.push({
      planId: plan.id, year: y, month: m,
      investment, fee: feeVal, price: priceVal, dividendRate, afterTaxRate: afterTax,
    });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  await prisma.calculatorPlanRow.createMany({ data: rows });

  return NextResponse.json({ id: plan.id }, { status: 201 });
}
