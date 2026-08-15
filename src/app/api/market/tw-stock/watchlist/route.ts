import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lookupStockName } from "@/lib/tw-stock-directory";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const list = await prisma.userWatchStock.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(list);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { code } = await req.json();
  const cleanCode = String(code ?? "").trim();
  if (!/^\d{4,6}$/.test(cleanCode)) {
    return NextResponse.json({ error: "股票代碼格式錯誤" }, { status: 400 });
  }

  const name = await lookupStockName(cleanCode).catch(() => null);

  const item = await prisma.userWatchStock.upsert({
    where: { userId_code: { userId: session.user.id, code: cleanCode } },
    update: {},
    create: { userId: session.user.id, code: cleanCode, name },
  });
  return NextResponse.json(item);
}
