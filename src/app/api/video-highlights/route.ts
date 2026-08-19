import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const items = await prisma.videoHighlight.findMany({
    orderBy: [{ pinned: "desc" }, { date: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "無權限" }, { status: 403 });
  }

  const { date, title, content, url } = await req.json();
  if (!date || !content?.trim()) {
    return NextResponse.json({ error: "請填寫日期與重點內容" }, { status: 400 });
  }

  const item = await prisma.videoHighlight.create({
    data: {
      date: new Date(date),
      title: title?.trim() || null,
      content: content.trim(),
      url: url?.trim() || null,
    },
  });
  return NextResponse.json(item, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "無權限" }, { status: 403 });
  }

  const { id, date, title, content, url, pinned } = await req.json();
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });

  const updated = await prisma.videoHighlight.update({
    where: { id },
    data: {
      ...(date !== undefined && { date: new Date(date) }),
      ...(title !== undefined && { title: title?.trim() || null }),
      ...(content !== undefined && { content: content.trim() }),
      ...(url !== undefined && { url: url?.trim() || null }),
      ...(pinned !== undefined && { pinned }),
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
  await prisma.videoHighlight.delete({ where: { id } });
  return NextResponse.json({ message: "已刪除" });
}
