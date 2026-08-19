import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const items = await prisma.marquee.findMany({
    where: { enabled: true },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "無權限" }, { status: 403 });
  }

  const { text, order } = await req.json();
  if (!text?.trim()) {
    return NextResponse.json({ error: "請輸入跑馬燈內容" }, { status: 400 });
  }

  const item = await prisma.marquee.create({
    data: { text: text.trim(), order: Number(order) || 0 },
  });
  return NextResponse.json(item, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "無權限" }, { status: 403 });
  }

  const { id, text, order, enabled } = await req.json();
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });

  const updated = await prisma.marquee.update({
    where: { id },
    data: {
      ...(text !== undefined && { text: text.trim() }),
      ...(order !== undefined && { order: Number(order) || 0 }),
      ...(enabled !== undefined && { enabled }),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "無權限" }, { status: 403 });
  }

  const { id } = await req.json();
  await prisma.marquee.delete({ where: { id } });
  return NextResponse.json({ message: "已刪除" });
}
