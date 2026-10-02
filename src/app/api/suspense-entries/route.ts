import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logMemberActivity } from "@/lib/activity-log";
import { remainingHoldingsByAmount } from "@/lib/stock-holdings";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const entries = await prisma.suspenseEntry.findMany({
    where: { userId: session.user.id },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(entries);
}

// 新增暫計帳：從持有的虛擬貨幣（預設 USDT）扣除數量，扣除記錄以當下平均成本計價，回補時用同一個成本加回
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });
  const userId = session.user.id;

  const { name, quantity, date, note, code: rawCode } = await req.json();
  const code = (rawCode || "USDT").trim();
  const qty = parseFloat(quantity);

  if (!name || !Number.isFinite(qty) || qty <= 0) {
    return NextResponse.json({ error: "請填寫項目名稱與數量" }, { status: 400 });
  }

  const cryptoInvestments = await prisma.investment.findMany({ where: { userId, type: "CRYPTO" } });
  const holding = remainingHoldingsByAmount(cryptoInvestments).find((h) => h.code === code);
  if (!holding || holding.quantity + 1e-9 < qty) {
    return NextResponse.json({ error: `${code} 持有數量不足（目前 ${holding?.quantity ?? 0}）` }, { status: 400 });
  }
  const unitCost = holding.cost / holding.quantity;
  const entryDate = date ? new Date(date) : new Date();

  const entry = await prisma.$transaction(async (tx) => {
    const deduct = await tx.investment.create({
      data: {
        type: "CRYPTO",
        name: code,
        code,
        action: "SELL",
        quantity: qty,
        price: unitCost,
        amount: -qty * unitCost,
        date: entryDate,
        note: `暫計帳：${name}`,
        userId,
      },
    });
    return tx.suspenseEntry.create({
      data: { name, code, quantity: qty, unitCost, date: entryDate, note: note || null, deductInvestmentId: deduct.id, userId },
    });
  });

  await logMemberActivity(userId, "CREATE_SUSPENSE", "suspense-entries", `新增暫計帳「${entry.name}」${entry.quantity} ${entry.code}`);

  return NextResponse.json(entry, { status: 201 });
}
