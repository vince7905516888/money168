import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ALLOWED_FIELDS = ["investment", "fee", "price", "dividendRate", "afterTaxRate", "sharesToBuy"] as const;
type AllowedField = (typeof ALLOWED_FIELDS)[number];

// 批次套用：把某個年月「之後」的所有列，某個欄位都改成同一個值；不影響那個年月本身與之前的列
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { id } = await params;
  const plan = await prisma.calculatorPlan.findFirst({ where: { id, userId: session.user.id } });
  if (!plan) return NextResponse.json({ error: "找不到方案" }, { status: 404 });

  const { afterYear, afterMonth, field, value } = await req.json();

  if (!ALLOWED_FIELDS.includes(field as AllowedField)) {
    return NextResponse.json({ error: "欄位不支援批次套用" }, { status: 400 });
  }
  const year = parseInt(afterYear);
  const month = parseInt(afterMonth);
  const numValue = parseFloat(value);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(numValue)) {
    return NextResponse.json({ error: "請填寫必要欄位" }, { status: 400 });
  }

  const result = await prisma.calculatorPlanRow.updateMany({
    where: {
      planId: id,
      OR: [
        { year: { gt: year } },
        { year, month: { gt: month } },
      ],
    },
    data: { [field as AllowedField]: numValue },
  });

  return NextResponse.json({ updated: result.count });
}
