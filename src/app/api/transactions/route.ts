import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  const type = searchParams.get("type");

  const where: Record<string, unknown> = { userId: session.user.id };
  if (type && (type === "INCOME" || type === "EXPENSE")) where.type = type;
  if (month) {
    const [year, m] = month.split("-").map(Number);
    where.date = {
      gte: new Date(year, m - 1, 1),
      lt: new Date(year, m, 1),
    };
  }

  const transactions = await prisma.transaction.findMany({
    where,
    include: { category: true },
    orderBy: { date: "desc" },
  });

  return NextResponse.json(transactions);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { title, amount, type, date, note, categoryId } = await req.json();

  if (!title || !amount || !type || !date) {
    return NextResponse.json({ error: "請填寫必要欄位" }, { status: 400 });
  }

  const transaction = await prisma.transaction.create({
    data: {
      title,
      amount: parseFloat(amount),
      type,
      date: new Date(date),
      note,
      categoryId: categoryId || null,
      userId: session.user.id,
    },
    include: { category: true },
  });

  return NextResponse.json(transaction, { status: 201 });
}
