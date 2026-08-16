import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeUserAssetSummary, sumAssetSummaries } from "@/lib/user-asset-summary";

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "無權限" }, { status: 403 });
  }

  const [totalUsers, activeUsers, totalTransactions, incomeAgg, expenseAgg, memberIds] =
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
      prisma.user.findMany({ where: { role: "MEMBER" }, select: { id: true } }),
    ]);

  // 站結正資產總計／站結負債總額／站結資產負債總計：跟前台「資產總攬」用同一套公式
  // （見 src/lib/user-asset-summary.ts），逐一算出每個會員的數字再加總，全站數據才會對得起來。
  const summaries = await Promise.all(memberIds.map((u) => computeUserAssetSummary(u.id)));
  const siteAssetSummary = sumAssetSummaries(summaries);

  return NextResponse.json({
    totalUsers,
    activeUsers,
    totalTransactions,
    totalIncome: incomeAgg._sum.amount ?? 0,
    totalExpense: expenseAgg._sum.amount ?? 0,
    sitePositiveAssetsTotal: siteAssetSummary.positiveAssetsTotal,
    siteDebtTotal: siteAssetSummary.debtTotal,
    siteNetWorth: siteAssetSummary.netWorth,
  });
}
