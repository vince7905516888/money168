import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NAV_ITEMS } from "@/lib/nav-items";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "無權限" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "缺少 userId" }, { status: 400 });

  const overrides = await prisma.pagePermission.findMany({ where: { userId } });
  const overrideMap = new Map(overrides.map((o) => [o.pageKey, o.allowed]));

  const items = NAV_ITEMS.map((item) => ({
    key: item.key,
    label: item.label,
    section: item.section,
    allowed: overrideMap.get(item.key) ?? true,
  }));

  return NextResponse.json(items);
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "無權限" }, { status: 403 });
  }

  const { userId, pageKey, allowed } = await req.json();
  if (!userId || !pageKey || typeof allowed !== "boolean") {
    return NextResponse.json({ error: "格式錯誤" }, { status: 400 });
  }

  await prisma.pagePermission.upsert({
    where: { userId_pageKey: { userId, pageKey } },
    update: { allowed },
    create: { userId, pageKey, allowed },
  });

  return NextResponse.json({ ok: true });
}
