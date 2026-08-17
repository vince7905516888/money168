import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const STRING_FIELDS = ["broker", "stockName", "stockCode", "plan", "dividendDate", "futureLow", "futureMid", "futureHigh"] as const;
const NUMBER_FIELDS = ["shares", "avgPrice", "currentPrice", "dividendAmount", "discount", "batch1", "batch2", "batch3", "batch4", "batch5", "batch6"] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.investmentStrategyEntry.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing) return NextResponse.json({ error: "找不到記錄" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, string | number | null> = {};

  for (const field of STRING_FIELDS) {
    if (field in body) {
      const v = body[field];
      data[field] = v === "" || v == null ? null : String(v);
    }
  }
  for (const field of NUMBER_FIELDS) {
    if (field in body) {
      const v = body[field];
      data[field] = v === "" || v == null ? null : Number(v);
    }
  }
  if ("discount" in data && (data.discount == null || Number.isNaN(data.discount))) {
    data.discount = 1;
  }
  if ("order" in body) {
    const o = Math.trunc(Number(body.order));
    data.order = Number.isNaN(o) ? existing.order : o;
  }

  const updated = await prisma.investmentStrategyEntry.update({
    where: { id },
    data,
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
  const existing = await prisma.investmentStrategyEntry.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing) return NextResponse.json({ error: "找不到記錄" }, { status: 404 });

  await prisma.investmentStrategyEntry.delete({ where: { id } });
  return NextResponse.json({ message: "已刪除" });
}
