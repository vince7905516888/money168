"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState } from "react";
import { useSidebar } from "./SidebarContext";

const topItems = [
  { href: "/admin/dashboard", label: "後台總覽", icon: "◎" },
];

const settingsItems = [
  { href: "/admin/users", label: "帳戶管理" },
  { href: "/admin/settings/permissions", label: "權限管理" },
];

const configItems = [
  { href: "/admin/config/fees", label: "手續費設定" },
];

export default function AdminSidebar({ userName }: { userName: string }) {
  const pathname = usePathname();
  const { collapsed, toggle, expand } = useSidebar();
  const isSettingsActive = settingsItems.some((i) => pathname === i.href || pathname.startsWith(i.href + "/"));
  const isConfigActive = configItems.some((i) => pathname === i.href || pathname.startsWith(i.href + "/"));
  const [settingsOpen, setSettingsOpen] = useState(isSettingsActive);
  const [configOpen, setConfigOpen] = useState(isConfigActive);

  const toggleSettings = () => {
    if (collapsed) { expand(); setSettingsOpen(true); return; }
    setSettingsOpen((o) => !o);
  };
  const toggleConfig = () => {
    if (collapsed) { expand(); setConfigOpen(true); return; }
    setConfigOpen((o) => !o);
  };

  return (
    <aside
      className={`min-h-screen bg-slate-900 flex flex-col py-6 fixed left-0 top-0 z-20 transition-all duration-200 ${
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

        {/* 系統設置 collapsible */}
        <div>
          <button
            onClick={toggleSettings}
            title="系統設置"
            className={`w-full flex items-center py-2.5 rounded-xl text-sm font-medium transition-all ${
              collapsed ? "justify-center px-0" : "justify-between px-3"
            } ${isSettingsActive ? "text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}
          >
            <div className={`flex items-center ${collapsed ? "" : "gap-3"}`}>
              <span className="text-base leading-none">⚙️</span>
              {!collapsed && "系統設置"}
            </div>
            {!collapsed && <span className={`text-xs transition-transform ${settingsOpen ? "rotate-90" : ""}`}>▶</span>}
          </button>
          {!collapsed && settingsOpen && (
            <div className="ml-4 mt-1 space-y-1">
              {settingsItems.map((item) => {
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
        {/* 設定 collapsible */}
        <div>
          <button
            onClick={toggleConfig}
            title="設定"
            className={`w-full flex items-center py-2.5 rounded-xl text-sm font-medium transition-all ${
              collapsed ? "justify-center px-0" : "justify-between px-3"
            } ${isConfigActive ? "text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}
          >
            <div className={`flex items-center ${collapsed ? "" : "gap-3"}`}>
              <span className="text-base leading-none">🔧</span>
              {!collapsed && "設定"}
            </div>
            {!collapsed && <span className={`text-xs transition-transform ${configOpen ? "rotate-90" : ""}`}>▶</span>}
          </button>
          {!collapsed && configOpen && (
            <div className="ml-4 mt-1 space-y-1">
              {configItems.map((item) => {
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
      </nav>

      {/* User */}
      <div className="border-t border-slate-700 pt-4 mt-4">
        <div className={`flex items-center gap-3 mb-3 ${collapsed ? "justify-center" : "px-3"}`}>
          <div className="w-8 h-8 rounded-full bg-indigo-900 flex items-center justify-center text-indigo-300 font-semibold text-sm flex-shrink-0">
            {userName?.charAt(0)?.toUpperCase()}
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <div className="text-sm font-medium text-white truncate">{userName}</div>
              <div className="text-xs text-slate-400">管理員</div>
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
