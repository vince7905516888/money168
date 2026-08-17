import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const entries = await prisma.investmentStrategyEntry.findMany({
    where: { userId: session.user.id },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json(entries);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  const last = await prisma.investmentStrategyEntry.findFirst({
    where: { userId: session.user.id },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const entry = await prisma.investmentStrategyEntry.create({
    data: {
      userId: session.user.id,
      broker: body.broker ?? null,
      stockName: body.stockName ?? null,
      stockCode: body.stockCode ?? null,
      order: (last?.order ?? -1) + 1,
    },
  });

  return NextResponse.json(entry, { status: 201 });
}
