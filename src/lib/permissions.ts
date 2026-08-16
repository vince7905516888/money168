import { prisma } from "@/lib/prisma";
import { NAV_ITEMS, FEATURE_ITEMS, type NavItem } from "@/lib/nav-items";

export async function getVisibleNavItems(userId: string | null, role: string | null): Promise<NavItem[]> {
  // 未登入訪客：側邊欄照樣顯示全部頁面（包含台灣股市、會員資料管理），點下去才會被個別
  // 頁面自己的 layout.tsx 導去登入頁（見 market/tw-stock、profile 底下的 layout.tsx）。
  // 這裡故意不過濾掉那兩個頁面：如果過濾掉，PagePermissionGuard 會把它們當成「權限不足」
  // 又搶著導到 /transactions，跟頁面自己的登入導向互搶，導致最後跑錯地方。
  if (!userId || !role) return NAV_ITEMS;
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
