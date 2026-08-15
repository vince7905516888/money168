import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NAV_ITEMS, FEATURE_ITEMS } from "@/lib/nav-items";

const TIERS = ["FREE", "BASIC", "PRO"] as const;

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN" || !session.user.isSuperAdmin) {
    return NextResponse.json({ error: "無權限" }, { status: 403 });
  }

  const rows = await prisma.tierPageAccess.findMany();
  const map = new Map(rows.map((r) => [`${r.tier}:${r.pageKey}`, r.allowed]));

  const pageRows = NAV_ITEMS.map((item) => ({
    key: item.key,
    label: item.label,
    section: item.section,
    tiers: Object.fromEntries(
      TIERS.map((tier) => [tier, map.get(`${tier}:${item.key}`) ?? true])
    ),
  }));

  const featureRows = FEATURE_ITEMS.map((item) => ({
    key: item.key,
    label: item.label,
    section: "功能權限",
    tiers: Object.fromEntries(
      TIERS.map((tier) => [tier, map.get(`${tier}:${item.key}`) ?? true])
    ),
  }));

  return NextResponse.json([...pageRows, ...featureRows]);
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN" || !session.user.isSuperAdmin) {
    return NextResponse.json({ error: "無權限" }, { status: 403 });
  }

  const { items } = await req.json();
  if (!Array.isArray(items)) {
    return NextResponse.json({ error: "格式錯誤" }, { status: 400 });
  }

  const validKeys = new Set([...NAV_ITEMS.map((i) => i.key), ...FEATURE_ITEMS.map((i) => i.key)]);

  await Promise.all(
    items
      .filter((it: { tier: string; pageKey: string }) => validKeys.has(it.pageKey) && TIERS.includes(it.tier as typeof TIERS[number]))
      .map((it: { tier: "FREE" | "BASIC" | "PRO"; pageKey: string; allowed: boolean }) =>
        prisma.tierPageAccess.upsert({
          where: { tier_pageKey: { tier: it.tier, pageKey: it.pageKey } },
          update: { allowed: it.allowed },
          create: { tier: it.tier, pageKey: it.pageKey, allowed: it.allowed },
        })
      )
  );

  return NextResponse.json({ ok: true });
}
