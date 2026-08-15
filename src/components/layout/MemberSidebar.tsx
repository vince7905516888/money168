"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useMemo, useState } from "react";
import { useSidebar } from "./SidebarContext";
import { useVisibleNavItems } from "./NavPermissionContext";
import type { NavItem } from "@/lib/nav-items";

const ICONS: Record<string, string> = {
  dashboard: "◎",
  reports: "▦",
  debts: "📉",
  profile: "👤",
};

const SECTION_ICONS: Record<string, string> = {
  "現金系統": "💵",
  "投資": "📊",
  "市場行情": "📈",
};

type Block =
  | { type: "link"; item: NavItem; order: number }
  | { type: "section"; name: string; items: NavItem[]; order: number };

export default function MemberSidebar({ userName }: { userName: string }) {
  const pathname = usePathname();
  const { collapsed, toggle, expand } = useSidebar();
  const visibleItems = useVisibleNavItems();

  const blocks = useMemo<Block[]>(() => {
    const bySection = new Map<string, NavItem[]>();
    const standalone: NavItem[] = [];
    for (const item of visibleItems) {
      if (item.section) {
        if (!bySection.has(item.section)) bySection.set(item.section, []);
        bySection.get(item.section)!.push(item);
      } else {
        standalone.push(item);
      }
    }
    const result: Block[] = [
      ...standalone.map((item) => ({ type: "link" as const, item, order: item.order ?? 0 })),
      ...Array.from(bySection.entries()).map(([name, items]) => ({
        type: "section" as const,
        name,
        items,
        order: Math.min(...items.map((i) => i.order ?? 0)),
      })),
    ];
    return result.sort((a, b) => a.order - b.order);
  }, [visibleItems]);

  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set(blocks.filter((b) => b.type === "section" && b.items.some((i) => pathname.startsWith(i.href))).map((b) => (b as { name: string }).name))
  );

  const toggleSection = (name: string) => {
    if (collapsed) {
      expand();
      setOpenSections((prev) => new Set(prev).add(name));
      return;
    }
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <aside
      className={`min-h-screen bg-white border-r border-slate-100 flex flex-col py-6 fixed left-0 top-0 z-20 transition-all duration-200 ${
        collapsed ? "w-16 px-2" : "w-60 px-4"
      }`}
    >
      {/* Logo */}
      <div className={`flex items-center mb-8 ${collapsed ? "justify-center" : "justify-between px-3"}`}>
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            M
          </div>
          {!collapsed && <span className="text-base font-semibold text-slate-900 whitespace-nowrap">MoneyFlow</span>}
        </div>
        {!collapsed && (
          <button
            onClick={toggle}
            title="收合側邊欄"
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors flex-shrink-0"
          >
            «
          </button>
        )}
      </div>
      {collapsed && (
        <button
          onClick={toggle}
          title="展開側邊欄"
          className="mx-auto mb-4 text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
        >
          »
        </button>
      )}

      {/* Nav */}
      <nav className="flex-1 space-y-1">
        {blocks.map((block) => {
          if (block.type === "link") {
            const { item } = block;
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.key}
                href={item.href}
                title={item.label}
                className={`flex items-center py-2.5 rounded-xl text-sm font-medium transition-all ${
                  collapsed ? "justify-center px-0" : "gap-3 px-3"
                } ${
                  active ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                <span className="text-base leading-none">{ICONS[item.key] ?? "•"}</span>
                {!collapsed && item.label}
              </Link>
            );
          }

          const isActiveSection = block.items.some((i) => pathname.startsWith(i.href));
          const open = openSections.has(block.name);
          return (
            <div key={block.name}>
              <button
                onClick={() => toggleSection(block.name)}
                title={block.name}
                className={`w-full flex items-center py-2.5 rounded-xl text-sm font-medium transition-all ${
                  collapsed ? "justify-center px-0" : "gap-3 px-3"
                } ${
                  isActiveSection ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                <span className="text-base leading-none">{SECTION_ICONS[block.name] ?? "▤"}</span>
                {!collapsed && <span className="flex-1 text-left">{block.name}</span>}
                {!collapsed && <span className="text-xs text-slate-400">{open ? "▾" : "▸"}</span>}
              </button>

              {!collapsed && open && (
                <div className="ml-4 space-y-0.5">
                  {block.items.map((item) => {
                    const active = pathname === item.href;
                    return (
                      <Link
                        key={item.key}
                        href={item.href}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all ${
                          active
                            ? "bg-indigo-50 text-indigo-700 font-medium"
                            : "text-slate-400 hover:text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* User */}
      <div className="border-t border-slate-100 pt-4 mt-4">
        <div className={`flex items-center gap-3 mb-3 ${collapsed ? "justify-center" : "px-3"}`}>
          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-sm flex-shrink-0">
            {userName?.charAt(0)?.toUpperCase()}
          </div>
          {!collapsed && <span className="text-sm font-medium text-slate-700 truncate">{userName}</span>}
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          title="登出"
          className={`w-full py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 transition-all ${
            collapsed ? "text-center px-0" : "text-left px-3"
          }`}
        >
          {collapsed ? "⎋" : "登出"}
        </button>
      </div>
    </aside>
  );
}
