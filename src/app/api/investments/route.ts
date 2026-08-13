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

  const { type, name, code, amount, quantity, note, transactionId, price, action, date, discount, fee, tax } = await req.json();

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
      price: price ? parseFloat(price) : null,
      action: action === "SELL" ? "SELL" : "BUY",
      date: date ? new Date(date) : undefined,
      discount: discount !== undefined && discount !== null && discount !== "" ? parseFloat(discount) : null,
      fee: fee !== undefined && fee !== null && fee !== "" ? parseFloat(fee) : null,
      tax: tax !== undefined && tax !== null && tax !== "" ? parseFloat(tax) : null,
      note: note || null,
      transactionId: transactionId || null,
      userId: session.user.id,
    },
  });

  return NextResponse.json(investment, { status: 201 });
}
