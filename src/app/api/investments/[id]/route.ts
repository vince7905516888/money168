import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { id } = await params;
  const { name, code, quantity, note, price, broker, action, date, discount, fee, tax, amount } = await req.json();

  const existing = await prisma.investment.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing) return NextResponse.json({ error: "找不到記錄" }, { status: 404 });

  const updated = await prisma.investment.update({
    where: { id },
    data: {
      name: name || null,
      code: code || null,
      quantity: quantity ? parseFloat(quantity) : null,
      note: note || null,
      ...(price !== undefined ? { price: price !== "" && price !== null ? parseFloat(price) : null } : {}),
      ...(broker !== undefined ? { broker: broker || null } : {}),
      ...(action !== undefined ? { action: action === "SELL" ? "SELL" : "BUY" } : {}),
      ...(date !== undefined ? { date: new Date(date) } : {}),
      ...(discount !== undefined ? { discount: discount !== "" && discount !== null ? parseFloat(discount) : null } : {}),
      ...(fee !== undefined ? { fee: fee !== "" && fee !== null ? parseFloat(fee) : null } : {}),
      ...(tax !== undefined ? { tax: tax !== "" && tax !== null ? parseFloat(tax) : null } : {}),
      ...(amount !== undefined ? { amount: parseFloat(amount) } : {}),
    },
  });

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
  return NextResponse.json({ message: "已刪除" });
}
