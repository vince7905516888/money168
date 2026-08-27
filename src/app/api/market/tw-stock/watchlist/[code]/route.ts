import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// 觀察名單排序：前端上移/下移是把相鄰兩檔的 order 互換，這裡只負責更新單一筆的 order 值
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { code } = await params;
  const cleanCode = code.trim();
  const { order } = await req.json().catch(() => ({}));
  const orderNum = Math.trunc(Number(order));
  if (!Number.isFinite(orderNum)) {
    return NextResponse.json({ error: "order 必須是數字" }, { status: 400 });
  }

  const existing = await prisma.userWatchStock.findFirst({
    where: { userId: session.user.id, code: cleanCode },
  });
  if (!existing) return NextResponse.json({ error: "找不到觀察項目" }, { status: 404 });

  const updated = await prisma.userWatchStock.update({
    where: { id: existing.id },
    data: { order: orderNum },
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { code } = await params;
  const cleanCode = code.trim();

  await prisma.userWatchStock
    .delete({ where: { userId_code: { userId: session.user.id, code: cleanCode } } })
    .catch(() => {}); // 本來就不存在也視為成功，前端不用額外處理

  return NextResponse.json({ ok: true });
}
