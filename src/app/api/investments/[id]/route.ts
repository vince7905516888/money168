import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logMemberActivity } from "@/lib/activity-log";

// 暫計帳自動產生的扣除／回補記錄不能單獨編輯或刪除，否則暫計帳與持有數量會對不上
async function isSuspenseLinked(investmentId: string) {
  const linked = await prisma.suspenseEntry.findFirst({
    where: { OR: [{ deductInvestmentId: investmentId }, { reverseInvestmentId: investmentId }] },
    select: { id: true },
  });
  return !!linked;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { id } = await params;
  const { name, code, quantity, note, price, broker, bankName, currency, exchangeRate, action, date, discount, fee, tax, amount } = await req.json();

  const existing = await prisma.investment.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing) return NextResponse.json({ error: "找不到記錄" }, { status: 404 });
  if (await isSuspenseLinked(id)) {
    return NextResponse.json({ error: "這筆是暫計帳自動產生的記錄，請到「暫計帳」編輯或刪除" }, { status: 400 });
  }

  const updated = await prisma.investment.update({
    where: { id },
    data: {
      note: note || null,
      ...(name !== undefined ? { name: name || null } : {}),
      ...(code !== undefined ? { code: code || null } : {}),
      ...(quantity !== undefined ? { quantity: quantity !== "" && quantity !== null ? parseFloat(quantity) : null } : {}),
      ...(price !== undefined ? { price: price !== "" && price !== null ? parseFloat(price) : null } : {}),
      ...(broker !== undefined ? { broker: broker || null } : {}),
      ...(bankName !== undefined ? { bankName: bankName || null } : {}),
      ...(currency !== undefined ? { currency: currency || null } : {}),
      ...(exchangeRate !== undefined ? { exchangeRate: exchangeRate !== "" && exchangeRate !== null ? parseFloat(exchangeRate) : null } : {}),
      ...(action !== undefined ? { action: action === "SELL" ? "SELL" : "BUY" } : {}),
      ...(date !== undefined ? { date: new Date(date) } : {}),
      ...(discount !== undefined ? { discount: discount !== "" && discount !== null ? parseFloat(discount) : null } : {}),
      ...(fee !== undefined ? { fee: fee !== "" && fee !== null ? parseFloat(fee) : null } : {}),
      ...(tax !== undefined ? { tax: tax !== "" && tax !== null ? parseFloat(tax) : null } : {}),
      ...(amount !== undefined ? { amount: parseFloat(amount) } : {}),
    },
  });

  await logMemberActivity(
    session.user.id,
    "UPDATE_INVESTMENT",
    `investment.${updated.type.toLowerCase()}`,
    `編輯記錄「${updated.name || updated.code || updated.type}」${updated.amount}`
  );

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.investment.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing) return NextResponse.json({ error: "找不到記錄" }, { status: 404 });
  if (await isSuspenseLinked(id)) {
    return NextResponse.json({ error: "這筆是暫計帳自動產生的記錄，請到「暫計帳」編輯或刪除" }, { status: 400 });
  }

  await prisma.investment.delete({ where: { id } });
  // 自動入帳的記錄被刪除後，記下外部編號，自動作帳就不會再把它記回來
  if (existing.externalRef) {
    const ref = existing.externalRef.split("#")[0];
    await prisma.dismissedExternalRef.upsert({
      where: { userId_ref: { userId: session.user.id, ref } },
      create: { userId: session.user.id, ref },
      update: {},
    });
  }

  await logMemberActivity(
    session.user.id,
    "DELETE_INVESTMENT",
    `investment.${existing.type.toLowerCase()}`,
    `刪除記錄「${existing.name || existing.code || existing.type}」${existing.amount}`
  );

  return NextResponse.json({ message: "已刪除" });
}
