import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const banks = await prisma.userBank.findMany({
    where: { userId: session.user.id },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(banks);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { name } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "請輸入銀行名稱" }, { status: 400 });
  }

  try {
    const bank = await prisma.userBank.create({
      data: { name: name.trim(), userId: session.user.id },
    });
    return NextResponse.json(bank, { status: 201 });
  } catch {
    return NextResponse.json({ error: "此銀行已存在" }, { status: 409 });
  }
}
