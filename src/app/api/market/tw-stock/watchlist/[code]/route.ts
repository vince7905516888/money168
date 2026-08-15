import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
