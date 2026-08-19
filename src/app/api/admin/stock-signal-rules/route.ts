import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "無權限" }, { status: 403 });
  }

  const rules = await prisma.stockSignalRule.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(rules);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "無權限" }, { status: 403 });
  }

  const { code, name, condition, value, note } = await req.json();
  if (!code || !condition || value === undefined || value === null || value === "") {
    return NextResponse.json({ error: "請填寫必要欄位" }, { status: 400 });
  }
  if (condition !== "ABOVE" && condition !== "BELOW") {
    return NextResponse.json({ error: "條件類型錯誤" }, { status: 400 });
  }

  const rule = await prisma.stockSignalRule.create({
    data: { code: code.trim(), name: name?.trim() || null, condition, value: parseFloat(value), note: note?.trim() || null },
  });

  return NextResponse.json(rule, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "無權限" }, { status: 403 });
  }

  const { id, code, name, condition, value, note, enabled } = await req.json();
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });

  const updated = await prisma.stockSignalRule.update({
    where: { id },
    data: {
      ...(code !== undefined && { code: code.trim() }),
      ...(name !== undefined && { name: name?.trim() || null }),
      ...(condition !== undefined && { condition }),
      ...(value !== undefined && { value: parseFloat(value) }),
      ...(note !== undefined && { note: note?.trim() || null }),
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
  await prisma.stockSignalRule.delete({ where: { id } });
  return NextResponse.json({ message: "已刪除" });
}
