"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState } from "react";
import { useSidebar } from "./SidebarContext";
import { useAdminTheme, ADMIN_THEMES, type AdminThemeKey } from "./AdminThemeContext";

const topItems = [
  { href: "/admin/dashboard", label: "後台總覽", icon: "◎" },
  { href: "/admin/token-usage", label: "TOKEN使用量", icon: "🔢" },
];

const settingsItemsAll = [
  { href: "/admin/users", label: "帳戶管理", superOnly: false },
  { href: "/admin/settings/levels", label: "層級管理", superOnly: true },
  { href: "/admin/settings/tiers", label: "會員等級設定", superOnly: true },
];

const membersItemsAll = [
  { href: "/admin/members/activity-log", label: "會員變動紀錄", superOnly: false },
];

const pointsItemsAll = [
  { href: "/admin/points/query", label: "會員積分查詢", superOnly: false },
];

const configItemsAll = [
  { href: "/admin/config/fees", label: "手續費設定", superOnly: false },
  { href: "/admin/config/stock-market", label: "股市設定", superOnly: false },
  { href: "/admin/config/announcements", label: "前台公告", superOnly: false },
  { href: "/admin/settings/layout", label: "前台欄目排版", superOnly: true },
];

const GROUP_DEFS = [
  { key: "settings", label: "系統設置", icon: "⚙️", itemsAll: settingsItemsAll },
  { key: "members", label: "會員管理", icon: "👥", itemsAll: membersItemsAll },
  { key: "points", label: "積分系統", icon: "🏆", itemsAll: pointsItemsAll },
  { key: "config", label: "設定", icon: "🔧", itemsAll: configItemsAll },
];

export default function AdminSidebar({ userName, isSuperAdmin }: { userName: string; isSuperAdmin: boolean }) {
  const pathname = usePathname();
  const { collapsed, toggle, expand } = useSidebar();
  const { themeKey, setThemeKey } = useAdminTheme();

  const groups = GROUP_DEFS.map((g) => {
    const items = g.itemsAll.filter((i) => isSuperAdmin || !i.superOnly);
    const active = items.some((i) => pathname === i.href || pathname.startsWith(i.href + "/"));
    return { ...g, items, active };
  }).filter((g) => g.items.length > 0);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map((g) => [g.key, g.active]))
  );

  const toggleGroup = (key: string) => {
    if (collapsed) { expand(); setOpenGroups((o) => ({ ...o, [key]: true })); return; }
    setOpenGroups((o) => ({ ...o, [key]: !o[key] }));
  };

  return (
    <aside
      className={`min-h-screen ${ADMIN_THEMES[themeKey].sidebar} flex flex-col py-6 fixed left-0 top-0 z-20 transition-all duration-200 ${
        collapsed ? "w-16 px-2" : "w-60 px-4"
      }`}
    >
      {/* Logo */}
      <div className={`flex items-center mb-8 ${collapsed ? "justify-center" : "justify-between px-3"}`}>
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            M
          </div>
          {!collapsed && (
            <div className="whitespace-nowrap">
              <div className="text-sm font-semibold text-white">MoneyFlow</div>
              <div className="text-xs text-slate-400">管理後台</div>
            </div>
          )}
        </div>
        {!collapsed && (
          <button
            onClick={toggle}
            title="收合側邊欄"
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors flex-shrink-0"
          >
            «
          </button>
        )}
      </div>
      {collapsed && (
        <button
          onClick={toggle}
          title="展開側邊欄"
          className="mx-auto mb-4 text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
        >
          »
        </button>
      )}

      {/* Nav */}
      <nav className="flex-1 space-y-1">
        {topItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`flex items-center py-2.5 rounded-xl text-sm font-medium transition-all ${
                collapsed ? "justify-center px-0" : "gap-3 px-3"
              } ${
                active
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
            >
              <span className="text-base leading-none">{item.icon}</span>
              {!collapsed && item.label}
            </Link>
          );
        })}

        {groups.map((g) => (
          <div key={g.key}>
            <button
              onClick={() => toggleGroup(g.key)}
              title={g.label}
              className={`w-full flex items-center py-2.5 rounded-xl text-sm font-medium transition-all ${
                collapsed ? "justify-center px-0" : "justify-between px-3"
              } ${g.active ? "text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}
            >
              <div className={`flex items-center ${collapsed ? "" : "gap-3"}`}>
                <span className="text-base leading-none">{g.icon}</span>
                {!collapsed && g.label}
              </div>
              {!collapsed && <span className={`text-xs transition-transform ${openGroups[g.key] ? "rotate-90" : ""}`}>▶</span>}
            </button>
            {!collapsed && openGroups[g.key] && (
              <div className="ml-4 mt-1 space-y-1">
                {g.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                        active
                          ? "bg-indigo-600 text-white font-medium"
                          : "text-slate-400 hover:text-white hover:bg-slate-800"
                      }`}
                    >
                      <span className="w-1 h-1 rounded-full bg-current opacity-60" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* 換膚 */}
      {!collapsed && (
        <div className="border-t border-slate-700 pt-4 mt-4 px-3">
          <div className="text-xs text-slate-500 mb-2">換膚</div>
          <div className="flex gap-2">
            {(Object.keys(ADMIN_THEMES) as AdminThemeKey[]).map((key) => (
              <button
                key={key}
                onClick={() => setThemeKey(key)}
                title={ADMIN_THEMES[key].label}
                className={`w-6 h-6 rounded-full border-2 transition-all ${
                  themeKey === key ? "border-white scale-110" : "border-transparent hover:border-slate-500"
                }`}
                style={{ backgroundColor: ADMIN_THEMES[key].swatch }}
              />
            ))}
          </div>
        </div>
      )}

      {/* User */}
      <div className="border-t border-slate-700 pt-4 mt-4">
        <div className={`flex items-center gap-3 mb-3 ${collapsed ? "justify-center" : "px-3"}`}>
          <div className="w-8 h-8 rounded-full bg-indigo-900 flex items-center justify-center text-indigo-300 font-semibold text-sm flex-shrink-0">
            {userName?.charAt(0)?.toUpperCase()}
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <div className="text-sm font-medium text-white truncate">{userName}</div>
              <div className="text-xs text-slate-400">{isSuperAdmin ? "超級管理員" : "一般管理員"}</div>
            </div>
          )}
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          title="登出"
          className={`w-full py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-all ${
            collapsed ? "text-center px-0" : "text-left px-3"
          }`}
        >
          {collapsed ? "⎋" : "登出"}
        </button>
      </div>
    </aside>
  );
}
