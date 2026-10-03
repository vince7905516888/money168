import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// 拍照記帳的重複提醒：找出同一天、同金額的支出記錄（收支記錄、銀行記錄、負債表），
// 讓會員選擇「更正原本的記錄」而不是重複新增。
// GET /api/receipts/duplicates?date=YYYY-MM-DD&amount=559
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") ?? "";
  const amount = parseFloat(searchParams.get("amount") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !(amount > 0)) return NextResponse.json({ transactions: [], debts: [] });

  // 日期以台灣時間的當天比對（記錄的日期可能存成 UTC 午夜或台灣午夜），前後各放寬 8 小時
  const start = new Date(`${date}T00:00:00+08:00`);
  const from = new Date(start.getTime() - 8 * 3600_000);
  const to = new Date(start.getTime() + 32 * 3600_000);

  const [transactions, debts] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId: session.user.id, type: "EXPENSE", amount, date: { gte: from, lt: to } },
      select: { id: true, title: true, amount: true, type: true, source: true, note: true, date: true, currency: true, categoryId: true, category: { select: { name: true } } },
    }),
    prisma.debt.findMany({
      where: { userId: session.user.id, amount, date: { gte: from, lt: to } },
      select: { id: true, category: true, amount: true, bankName: true, note: true, date: true },
    }),
  ]);

  return NextResponse.json({ transactions, debts });
}
