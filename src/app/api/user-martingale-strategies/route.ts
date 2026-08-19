import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseMartingaleRatios } from "@/lib/martingale";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const strategies = await prisma.userMartingaleStrategy.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(strategies);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { name, ratios, note } = await req.json();
  const parsedRatios = parseMartingaleRatios(ratios);
  if (!name?.trim() || !parsedRatios) {
    return NextResponse.json({ error: "請填寫方案名稱，並提供 2～8 組大於 0 的比例數值" }, { status: 400 });
  }

  const strategy = await prisma.userMartingaleStrategy.create({
    data: { userId: session.user.id, name: name.trim(), ratios: parsedRatios, note: note?.trim() || null },
  });

  await prisma.memberActivityLog
    .create({
      data: {
        userId: session.user.id,
        action: "CREATE_MARTINGALE_STRATEGY",
        detail: `新增自訂馬丁格爾策略「${strategy.name}」（${parsedRatios.join(":")}）`,
      },
    })
    .catch((e) => console.error("member activity log failed:", e));

  return NextResponse.json(strategy, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { id } = await req.json();
  const existing = await prisma.userMartingaleStrategy.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing) return NextResponse.json({ error: "找不到策略" }, { status: 404 });

  await prisma.userMartingaleStrategy.delete({ where: { id } });

  await prisma.memberActivityLog
    .create({
      data: {
        userId: session.user.id,
        action: "DELETE_MARTINGALE_STRATEGY",
        detail: `刪除自訂馬丁格爾策略「${existing.name}」（${existing.ratios.join(":")}）`,
      },
    })
    .catch((e) => console.error("member activity log failed:", e));

  return NextResponse.json({ message: "已刪除" });
}
