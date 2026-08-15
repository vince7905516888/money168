import { prisma } from "@/lib/prisma";
import { NAV_ITEMS, FEATURE_ITEMS, type NavItem } from "@/lib/nav-items";

export async function getVisibleNavItems(userId: string, role: string): Promise<NavItem[]> {
  if (role === "ADMIN") return NAV_ITEMS;

  const [user, navConfigs, tierAccessAll] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { tier: true } }),
    prisma.navItemConfig.findMany(),
    prisma.tierPageAccess.findMany(),
  ]);

  const tier = user?.tier ?? "FREE";
  const configMap = new Map(navConfigs.map((c) => [c.key, c]));
  const tierAccessMap = new Map(
    tierAccessAll.filter((t) => t.tier === tier).map((t) => [t.pageKey, t.allowed])
  );

  // 優先序：該會員 tier 的預設 > 全站 NavItemConfig 預設
  return NAV_ITEMS.filter((item) => {
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

// 功能權限：頁面內的子功能（例如股票觀察名單），跟頁面權限共用同一張 TierPageAccess 表，
// 但不影響側邊欄或路由導覽，只用來判斷該會員等級能不能用這個功能。
export async function getVisibleFeatureKeys(userId: string, role: string): Promise<string[]> {
  if (role === "ADMIN") return FEATURE_ITEMS.map((f) => f.key);

  const [user, tierAccessAll] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { tier: true } }),
    prisma.tierPageAccess.findMany(),
  ]);

  const tier = user?.tier ?? "FREE";
  const tierAccessMap = new Map(
    tierAccessAll.filter((t) => t.tier === tier).map((t) => [t.pageKey, t.allowed])
  );

  return FEATURE_ITEMS.filter((f) => tierAccessMap.get(f.key) ?? true).map((f) => f.key);
}

export async function hasFeatureAccess(userId: string, role: string, key: string): Promise<boolean> {
  const keys = await getVisibleFeatureKeys(userId, role);
  return keys.includes(key);
}
