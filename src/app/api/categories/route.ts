import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const categories = await prisma.category.findMany({
    where: { userId: session.user.id },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(categories);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { name, type, icon, color } = await req.json();
  if (!name || !type)
    return NextResponse.json({ error: "請填寫名稱與類型" }, { status: 400 });

  const category = await prisma.category.create({
    data: { name, type, icon, color, userId: session.user.id },
  });

  return NextResponse.json(category, { status: 201 });
}
