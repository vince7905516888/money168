import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");

  const where: Record<string, unknown> = { userId: session.user.id };
  if (type) where.type = type;

  const investments = await prisma.investment.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(investments);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { type, name, code, amount, quantity, note, transactionId } = await req.json();

  if (!type || !amount) {
    return NextResponse.json({ error: "請填寫必要欄位" }, { status: 400 });
  }

  const investment = await prisma.investment.create({
    data: {
      type,
      name: name || null,
      code: code || null,
      amount: parseFloat(amount),
      quantity: quantity ? parseFloat(quantity) : null,
      note: note || null,
      transactionId: transactionId || null,
      userId: session.user.id,
    },
  });

  return NextResponse.json(investment, { status: 201 });
}
