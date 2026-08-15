import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const debts = await prisma.debt.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(debts);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { category, amount, bankName, date, note } = await req.json();

  if (!category || amount === undefined || amount === null || amount === "") {
    return NextResponse.json({ error: "請填寫必要欄位" }, { status: 400 });
  }

  const debt = await prisma.debt.create({
    data: {
      category,
      amount: parseFloat(amount),
      bankName: bankName || null,
      date: date ? new Date(date) : undefined,
      note: note || null,
      userId: session.user.id,
    },
  });

  return NextResponse.json(debt, { status: 201 });
}
