import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { id } = await params;
  const conversation = await prisma.assistantConversation.findFirst({
    where: { id, userId: session.user.id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!conversation) return NextResponse.json({ error: "找不到對話" }, { status: 404 });

  return NextResponse.json({ conversation });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.assistantConversation.findFirst({ where: { id, userId: session.user.id } });
  if (!existing) return NextResponse.json({ error: "找不到對話" }, { status: 404 });

  await prisma.assistantConversation.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
