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
  const { type, name, code, amount, quantity, price, fee, date, note } = await req.json();

  const existing = await prisma.dividendEntry.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing) return NextResponse.json({ error: "找不到記錄" }, { status: 404 });

  if (type !== undefined && type !== "STOCK" && type !== "FUND") {
    return NextResponse.json({ error: "類型僅限股票或基金" }, { status: 400 });
  }

  const updated = await prisma.dividendEntry.update({
    where: { id },
    data: {
      ...(type !== undefined ? { type } : {}),
      ...(name !== undefined ? { name } : {}),
      ...(code !== undefined ? { code: code || null } : {}),
      ...(amount !== undefined && amount !== "" ? { amount: parseFloat(amount) } : {}),
      ...(quantity !== undefined ? { quantity: quantity === "" || quantity === null ? null : parseFloat(quantity) } : {}),
      ...(price !== undefined ? { price: price === "" || price === null ? null : parseFloat(price) } : {}),
      ...(fee !== undefined ? { fee: fee === "" || fee === null ? null : parseFloat(fee) } : {}),
      ...(date !== undefined ? { date: new Date(date) } : {}),
      ...(note !== undefined ? { note: note || null } : {}),
    },
  });

  await logMemberActivity(session.user.id, "UPDATE_DIVIDEND", "dividend-reinvest", `編輯配息記錄「${updated.name}」${updated.amount}`);

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.dividendEntry.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing) return NextResponse.json({ error: "找不到記錄" }, { status: 404 });

  await prisma.dividendEntry.delete({ where: { id } });

  await logMemberActivity(session.user.id, "DELETE_DIVIDEND", "dividend-reinvest", `刪除配息記錄「${existing.name}」${existing.amount}`);

  return NextResponse.json({ message: "已刪除" });
}
