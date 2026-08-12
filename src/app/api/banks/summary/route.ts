import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const [transactions, userBanks] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId: session.user.id },
      include: { category: { select: { name: true } } },
    }),
    prisma.userBank.findMany({
      where: { userId: session.user.id },
      select: { name: true },
    }),
  ]);

  const bankMap: Record<string, { income: number; expense: number; transfer_in: number; transfer_out: number }> = {};

  const ensure = (name: string) => {
    if (!bankMap[name]) bankMap[name] = { income: 0, expense: 0, transfer_in: 0, transfer_out: 0 };
  };

  for (const t of transactions) {
    if (t.type === "EXPENSE" && t.note?.startsWith("支付:銀行:")) {
      const name = t.note.split(":")[2];
      if (name) { ensure(name); bankMap[name].expense += t.amount; }
    } else if (t.type === "INCOME" && t.category?.name === "銀行" && t.note) {
      ensure(t.note); bankMap[t.note].income += t.amount;
    } else if (t.type === "TRANSFER" && t.note) {
      const match = t.note.match(/FROM:([^:]+):?([^|]*)\|TO:([^:]+):?(.*)/);
      if (match) {
        const [, fromType, fromDetail, toType, toDetail] = match;
        if (fromType === "銀行" && fromDetail) {
          ensure(fromDetail); bankMap[fromDetail].transfer_out += t.amount;
        }
        if (toType === "銀行" && toDetail) {
          ensure(toDetail); bankMap[toDetail].transfer_in += t.amount;
        }
      }
    }
  }

  const result = Object.entries(bankMap).map(([name, d]) => ({
    name,
    income: d.income,
    expense: d.expense,
    transferIn: d.transfer_in,
    transferOut: d.transfer_out,
    balance: d.income + d.transfer_in - d.expense - d.transfer_out,
  }));

  // 加入尚未有交易紀錄的自訂銀行
  for (const ub of userBanks) {
    if (!result.find((r) => r.name === ub.name)) {
      result.push({ name: ub.name, income: 0, expense: 0, transferIn: 0, transferOut: 0, balance: 0 });
    }
  }

  result.sort((a, b) => b.balance - a.balance);

  return NextResponse.json(result);
}
