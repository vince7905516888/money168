import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logMemberActivity } from "@/lib/activity-log";
import { deriveBankDeltas } from "@/lib/bank-balances";

const TYPE_LABEL: Record<string, string> = { INCOME: "收入", EXPENSE: "支出", TRANSFER: "調帳" };

interface BankBalanceAfter {
  bankName: string;
  balance: number;
  currency: string;
}

// 銀行記錄要能依銀行篩選、每筆顯示扣款後餘額，餘額必須照「扣款日期」由舊到新累加才會正確
// （例如登打順序在後、但日期較早的預計扣款，要排在日期較晚的那筆前面計算），不能只用分頁
// 那一頁的資料算，所以先把這個使用者全部的銀行記錄一次抓出來算好餘額，篩選/分頁都在記憶體處理。
async function getBankRecords(
  userId: string,
  opts: { month: string | null; months: string | null; type: string | null; bankName: string | null; page: string | null; pageSize: number }
) {
  const all = await prisma.transaction.findMany({
    where: { userId, source: "BANK" },
    include: { category: true },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });

  const runningBalance: Record<string, number> = {};
  const balancesByTxId = new Map<string, BankBalanceAfter[]>();
  for (const t of all) {
    const deltas = deriveBankDeltas(t);
    const afterBalances: BankBalanceAfter[] = [];
    for (const d of deltas) {
      // 依「銀行＋幣別」分開累加，人民幣帳戶的餘額不會跟台幣混在一起
      const key = `${d.bankName}|${d.currency}`;
      runningBalance[key] = (runningBalance[key] ?? 0) + d.delta;
      afterBalances.push({ bankName: d.bankName, balance: runningBalance[key], currency: d.currency });
    }
    balancesByTxId.set(t.id, afterBalances);
  }

  let filtered = all;
  if (opts.bankName) {
    filtered = filtered.filter((t) => (balancesByTxId.get(t.id) ?? []).some((b) => b.bankName === opts.bankName));
  }
  if (opts.type && (opts.type === "INCOME" || opts.type === "EXPENSE" || opts.type === "TRANSFER")) {
    filtered = filtered.filter((t) => t.type === opts.type);
  }
  if (opts.month) {
    const [year, m] = opts.month.split("-").map(Number);
    const start = new Date(year, m - 1, 1);
    const end = new Date(year, m, 1);
    filtered = filtered.filter((t) => t.date >= start && t.date < end);
  } else if (opts.months) {
    const n = Number(opts.months);
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - (n - 1), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    filtered = filtered.filter((t) => t.date >= start && t.date < end);
  }

  // 顯示由新到舊，跟原本 CASH 那條路徑的排序習慣一致
  filtered = [...filtered].sort(
    (a, b) => b.date.getTime() - a.date.getTime() || b.createdAt.getTime() - a.createdAt.getTime()
  );

  const total = filtered.length;
  let items = filtered;
  let pageNum = 1;
  if (opts.page) {
    pageNum = Math.max(Number(opts.page) || 1, 1);
    items = filtered.slice((pageNum - 1) * opts.pageSize, pageNum * opts.pageSize);
  }

  const enriched = items.map((t) => ({
    ...t,
    bankBalances: balancesByTxId.get(t.id) ?? [],
  }));

  return NextResponse.json({ items: enriched, total, page: pageNum, pageSize: opts.pageSize });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  const months = searchParams.get("months");
  const type = searchParams.get("type");
  const page = searchParams.get("page");
  const pageSize = Math.min(Number(searchParams.get("pageSize")) || 20, 100);
  const bankName = searchParams.get("bankName");

  const source = searchParams.get("source") ?? "CASH";

  if (source === "BANK") {
    return getBankRecords(session.user.id, { month, months, type, bankName, page, pageSize });
  }

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

  const isBank = transaction.source === "BANK";
  await logMemberActivity(
    session.user.id,
    "CREATE_TRANSACTION",
    isBank ? "banks" : "transactions",
    `新增${TYPE_LABEL[transaction.type] ?? transaction.type}「${transaction.title}」${transaction.amount}${transaction.currency ? " " + transaction.currency : ""}`
  );

  return NextResponse.json(transaction, { status: 201 });
}
