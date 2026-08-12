import { NextRequest, NextResponse } from "next/server";
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
  const { isActive, role } = await req.json();

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(isActive !== undefined && { isActive }),
      ...(role !== undefined && { role }),
    },
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
