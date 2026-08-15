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

  const [user, navConfigs, tierAccessAll, overrides] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { tier: true } }),
    prisma.navItemConfig.findMany(),
    prisma.tierPageAccess.findMany(),
    prisma.pagePermission.findMany({ where: { userId } }),
  ]);

  const tier = user?.tier ?? "FREE";
  const configMap = new Map(navConfigs.map((c) => [c.key, c]));
  const tierAccessMap = new Map(
    tierAccessAll.filter((t) => t.tier === tier).map((t) => [t.pageKey, t.allowed])
  );
  const overrideMap = new Map(overrides.map((o) => [o.pageKey, o.allowed]));

  // 顯示「目前實際生效」的結果（個人覆蓋 > tier 預設 > 全站預設），而不是只看有沒有個人覆蓋記錄
  const items = NAV_ITEMS.map((item) => {
    const override = overrideMap.get(item.key);
    const effective = override ?? tierAccessMap.get(item.key) ?? configMap.get(item.key)?.enabled ?? true;
    return {
      key: item.key,
      label: item.label,
      section: item.section,
      allowed: effective,
      isOverride: override !== undefined,
    };
  });

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
