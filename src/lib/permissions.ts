import { prisma } from "@/lib/prisma";
import { NAV_ITEMS, type NavItem } from "@/lib/nav-items";

export async function getVisibleNavItems(userId: string, role: string): Promise<NavItem[]> {
  if (role === "ADMIN") return NAV_ITEMS;

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

  // 優先序：個人 PagePermission 覆蓋 > 該會員 tier 的預設 > 全站 NavItemConfig 預設
  return NAV_ITEMS.filter((item) => {
    const override = overrideMap.get(item.key);
    if (override !== undefined) return override;
    const tierAllowed = tierAccessMap.get(item.key);
    if (tierAllowed !== undefined) return tierAllowed;
    return configMap.get(item.key)?.enabled ?? true;
  })
    .map((item, index) => ({ ...item, order: configMap.get(item.key)?.order ?? index }))
    .sort((a, b) => a.order - b.order);
}

export async function getVisiblePageKeys(userId: string, role: string): Promise<string[]> {
  const items = await getVisibleNavItems(userId, role);
  return items.map((i) => i.key);
}
