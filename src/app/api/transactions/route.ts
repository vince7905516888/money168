import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  const months = searchParams.get("months");
  const type = searchParams.get("type");
  const page = searchParams.get("page");
  const pageSize = Math.min(Number(searchParams.get("pageSize")) || 20, 100);

  const source = searchParams.get("source") ?? "CASH";
  const where: Record<string, unknown> = { userId: session.user.id, source };
  if (type && (type === "INCOME" || type === "EXPENSE" || type === "TRANSFER")) where.type = type;
  if (month) {
    const [year, m] = month.split("-").map(Number);
    where.date = {
      gte: new Date(year, m - 1, 1),
      lt: new Date(year, m, 1),
    };
  } else if (months) {
    const n = Number(months);
    const now = new Date();
    where.date = {
      gte: new Date(now.getFullYear(), now.getMonth() - (n - 1), 1),
      lt: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    };
  }

  if (page) {
    const pageNum = Math.max(Number(page) || 1, 1);
    const [items, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: { category: true },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        skip: (pageNum - 1) * pageSize,
        take: pageSize,
      }),
      prisma.transaction.count({ where }),
    ]);
    return NextResponse.json({ items, total, page: pageNum, pageSize });
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

  const { title, amount, type, date, note, categoryId, source, currency } = await req.json();

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
      source: source ?? "CASH",
      currency: currency || "TWD",
      categoryId: categoryId || null,
      userId: session.user.id,
    },
    include: { category: true },
  });

  return NextResponse.json(transaction, { status: 201 });
}
