import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NAV_ITEMS } from "@/lib/nav-items";

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "無權限" }, { status: 403 });
  }

  const configs = await prisma.navItemConfig.findMany();
  const configMap = new Map(configs.map((c) => [c.key, c]));

  const items = NAV_ITEMS.map((item, index) => {
    const config = configMap.get(item.key);
    return {
      key: item.key,
      label: item.label,
      href: item.href,
      section: item.section,
      enabled: config?.enabled ?? true,
      order: config?.order ?? index,
    };
  }).sort((a, b) => a.order - b.order);

  return NextResponse.json(items);
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "無權限" }, { status: 403 });
  }

  const { items } = await req.json();
  if (!Array.isArray(items)) {
    return NextResponse.json({ error: "格式錯誤" }, { status: 400 });
  }

  const validKeys = new Set(NAV_ITEMS.map((i) => i.key));

  await Promise.all(
    items
      .filter((it: { key: string }) => validKeys.has(it.key))
      .map((it: { key: string; enabled: boolean; order: number }) =>
        prisma.navItemConfig.upsert({
          where: { key: it.key },
          update: { enabled: it.enabled, order: it.order },
          create: { key: it.key, enabled: it.enabled, order: it.order },
        })
      )
  );

  return NextResponse.json({ ok: true });
}
