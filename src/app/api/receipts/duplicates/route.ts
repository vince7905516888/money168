import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// 拍照記帳的重複提醒：找出可能是同一筆的既有記錄，讓會員選擇「更正原本的記錄」而不是重複新增。
// GET /api/receipts/duplicates?date=YYYY-MM-DD&amount=559&orderNo=249220068
// - 同一天（台灣時間）、同金額的支出（收支記錄、銀行記錄、負債表）
// - 或名稱／備註含有同一個訂單（出貨單、發票）編號的記錄（不限日期）
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });
  const userId = session.user.id;

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") ?? "";
  const amount = parseFloat(searchParams.get("amount") ?? "");
  const orderNo = (searchParams.get("orderNo") ?? "").trim();

  const byDateAmount = /^\d{4}-\d{2}-\d{2}$/.test(date) && amount > 0;
  const byOrderNo = orderNo.length >= 4;
  if (!byDateAmount && !byOrderNo) return NextResponse.json({ transactions: [], debts: [] });

  // 日期以台灣時間的當天比對（記錄的日期可能存成 UTC 午夜或台灣午夜），前後各放寬 8 小時
  const start = new Date(`${date}T00:00:00+08:00`);
  const range = { gte: new Date(start.getTime() - 8 * 3600_000), lt: new Date(start.getTime() + 32 * 3600_000) };

  const txOr = [
    ...(byDateAmount ? [{ type: "EXPENSE" as const, amount, date: range }] : []),
    ...(byOrderNo ? [{ title: { contains: orderNo } }, { note: { contains: orderNo } }] : []),
  ];
  const debtOr = [
    ...(byDateAmount ? [{ amount, date: range }] : []),
    ...(byOrderNo ? [{ note: { contains: orderNo } }] : []),
  ];

  const [transactions, debts] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId, OR: txOr },
      select: { id: true, title: true, amount: true, type: true, source: true, note: true, date: true, currency: true, categoryId: true, category: { select: { name: true } } },
      take: 10,
    }),
    prisma.debt.findMany({
      where: { userId, OR: debtOr },
      select: { id: true, category: true, amount: true, bankName: true, note: true, date: true },
      take: 10,
    }),
  ]);

  return NextResponse.json({ transactions, debts });
}
