import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "無權限" }, { status: 403 });
  }

  const [totalUsers, activeUsers, totalTransactions, incomeAgg, expenseAgg] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.transaction.count(),
      prisma.transaction.aggregate({
        where: { type: "INCOME" },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: { type: "EXPENSE" },
        _sum: { amount: true },
      }),
    ]);

  return NextResponse.json({
    totalUsers,
    activeUsers,
    totalTransactions,
    totalIncome: incomeAgg._sum.amount ?? 0,
    totalExpense: expenseAgg._sum.amount ?? 0,
  });
}
