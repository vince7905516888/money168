import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "無權限" }, { status: 403 });
  }

  const { id } = await params;
  const { points } = await req.json();
  const value = parseInt(points, 10);
  if (Number.isNaN(value)) {
    return NextResponse.json({ error: "積分格式錯誤" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id },
    data: { points: value },
    select: { id: true, name: true, email: true, points: true, role: true },
  });

  return NextResponse.json(user);
}
