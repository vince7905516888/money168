import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "無權限" }, { status: 403 });
  }

  const { id } = await params;
  const { isActive, role, password } = await req.json();

  const data: Record<string, unknown> = {};
  if (isActive !== undefined) data.isActive = isActive;
  if (role !== undefined) data.role = role;
  if (password) {
    if (password.length < 6) {
      return NextResponse.json({ error: "密碼至少需要 6 個字元" }, { status: 400 });
    }
    data.password = await bcrypt.hash(password, 12);
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "無權限" }, { status: 403 });
  }

  const { id } = await params;

  if (id === session.user.id) {
    return NextResponse.json({ error: "不能刪除自己" }, { status: 400 });
  }

  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ message: "已刪除" });
}
