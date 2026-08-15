import { prisma } from "@/lib/prisma";
import { NAV_ITEMS, type NavItem } from "@/lib/nav-items";

export async function getVisibleNavItems(userId: string, role: string): Promise<NavItem[]> {
  if (role === "ADMIN") return NAV_ITEMS;

  const [navConfigs, overrides] = await Promise.all([
    prisma.navItemConfig.findMany(),
    prisma.pagePermission.findMany({ where: { userId } }),
  ]);

  const configMap = new Map(navConfigs.map((c) => [c.key, c]));
  const overrideMap = new Map(overrides.map((o) => [o.pageKey, o.allowed]));

  return NAV_ITEMS.filter((item) => {
    const override = overrideMap.get(item.key);
    if (override !== undefined) return override;
    return configMap.get(item.key)?.enabled ?? true;
  })
    .map((item, index) => ({ ...item, order: configMap.get(item.key)?.order ?? index }))
    .sort((a, b) => a.order - b.order);
}

export async function getVisiblePageKeys(userId: string, role: string): Promise<string[]> {
  const items = await getVisibleNavItems(userId, role);
  return items.map((i) => i.key);
}
