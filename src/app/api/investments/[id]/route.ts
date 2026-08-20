import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logMemberActivity } from "@/lib/activity-log";

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

  await prisma.investment.delete({ where: { id } });

  await logMemberActivity(
    session.user.id,
    "DELETE_INVESTMENT",
    `investment.${existing.type.toLowerCase()}`,
    `刪除記錄「${existing.name || existing.code || existing.type}」${existing.amount}`
  );

  return NextResponse.json({ message: "已刪除" });
}
