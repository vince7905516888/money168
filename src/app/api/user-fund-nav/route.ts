import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const navs = await prisma.userFundNav.findMany({
    where: { userId: session.user.id },
  });

  return NextResponse.json(navs);
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { fundKey, nav } = await req.json();
  if (!fundKey || nav === undefined || nav === null || nav === "") {
    return NextResponse.json({ error: "請填寫必要欄位" }, { status: 400 });
  }

  const updated = await prisma.userFundNav.upsert({
    where: { userId_fundKey: { userId: session.user.id, fundKey } },
    update: { nav: parseFloat(nav) },
    create: { userId: session.user.id, fundKey, nav: parseFloat(nav) },
  });

  return NextResponse.json(updated);
}
