import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeBankSummaries } from "@/lib/bank-balances";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const [transactions, userBanks, savedRates] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId: session.user.id, source: "BANK" },
      include: { category: { select: { name: true } } },
    }),
    prisma.userBank.findMany({
      where: { userId: session.user.id },
      select: { name: true },
    }),
    prisma.userExchangeRate.findMany({ where: { userId: session.user.id } }),
  ]);

  // 非台幣帳戶（例如支付寶的人民幣）依使用者在資產總攬儲存的匯率換算成台幣，balance 等金額皆為台幣
  const rates = new Map(savedRates.map((r) => [r.currency, r.rate]));
  const result = computeBankSummaries(transactions, rates);

  // 加入尚未有交易紀錄的自訂銀行
  for (const ub of userBanks) {
    if (!result.find((r) => r.name === ub.name)) {
      result.push({ name: ub.name, income: 0, expense: 0, transferIn: 0, transferOut: 0, balance: 0, currencies: {}, unratedCurrencies: [] });
    }
  }

  result.sort((a, b) => b.balance - a.balance);

  return NextResponse.json(result);
}
