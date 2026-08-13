import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const brokers = await prisma.userBroker.findMany({
    where: { userId: session.user.id },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(brokers);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { name } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "請輸入證券公司名稱" }, { status: 400 });
  }

  try {
    const broker = await prisma.userBroker.create({
      data: { name: name.trim(), userId: session.user.id },
    });
    return NextResponse.json(broker, { status: 201 });
  } catch {
    return NextResponse.json({ error: "此證券公司已存在" }, { status: 409 });
  }
}
