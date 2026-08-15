import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const rates = await prisma.userExchangeRate.findMany({
    where: { userId: session.user.id },
  });

  return NextResponse.json(rates);
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { currency, rate } = await req.json();
  if (!currency || rate === undefined || rate === null || rate === "") {
    return NextResponse.json({ error: "請填寫必要欄位" }, { status: 400 });
  }

  const updated = await prisma.userExchangeRate.upsert({
    where: { userId_currency: { userId: session.user.id, currency } },
    update: { rate: parseFloat(rate) },
    create: { userId: session.user.id, currency, rate: parseFloat(rate) },
  });

  return NextResponse.json(updated);
}
