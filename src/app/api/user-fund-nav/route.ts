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

  const { fundKey, nav, url } = await req.json();
  const hasNav = nav !== undefined && nav !== null && nav !== "";
  const hasUrl = url !== undefined;
  if (!fundKey || (!hasNav && !hasUrl)) {
    return NextResponse.json({ error: "請填寫必要欄位" }, { status: 400 });
  }

  const updated = await prisma.userFundNav.upsert({
    where: { userId_fundKey: { userId: session.user.id, fundKey } },
    update: {
      ...(hasNav ? { nav: parseFloat(nav) } : {}),
      ...(hasUrl ? { url: url.trim() || null } : {}),
    },
    create: {
      userId: session.user.id,
      fundKey,
      nav: hasNav ? parseFloat(nav) : 0,
      url: hasUrl ? (url.trim() || null) : null,
    },
  });

  return NextResponse.json(updated);
}
