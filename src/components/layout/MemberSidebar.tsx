"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState } from "react";
import { useSidebar } from "./SidebarContext";

const cashItems = [
  { href: "/transactions", label: "收支記錄" },
  { href: "/banks", label: "銀行資金管理" },
];

const investmentItems = [
  { href: "/investment/overview", label: "投資總攬" },
  { href: "/investment/stock", label: "股票投資" },
  { href: "/investment/fund", label: "基金投資" },
  { href: "/investment/forex", label: "外匯投資" },
  { href: "/investment/crypto", label: "虛擬貨幣" },
  { href: "/investment/gold", label: "黃金投資" },
];

export default function MemberSidebar({ userName }: { userName: string }) {
  const pathname = usePathname();
  const { collapsed, toggle, expand } = useSidebar();
  const isCash = pathname.startsWith("/transactions") || pathname.startsWith("/banks");
  const isInvestment = pathname.startsWith("/investment");
  const [cashOpen, setCashOpen] = useState(isCash);
  const [investOpen, setInvestOpen] = useState(isInvestment);

  const toggleCash = () => {
    if (collapsed) { expand(); setCashOpen(true); return; }
    setCashOpen((o) => !o);
  };
  const toggleInvest = () => {
    if (collapsed) { expand(); setInvestOpen(true); return; }
    setInvestOpen((o) => !o);
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
        {/* 總覽 */}
        <Link
          href="/dashboard"
          title="總覽"
          className={`flex items-center py-2.5 rounded-xl text-sm font-medium transition-all ${
            collapsed ? "justify-center px-0" : "gap-3 px-3"
          } ${
            pathname === "/dashboard"
              ? "bg-indigo-50 text-indigo-700"
              : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
          }`}
        >
          <span className="text-base leading-none">◎</span>
          {!collapsed && "總覽"}
        </Link>

        {/* 現金系統 section */}
        <button
          onClick={toggleCash}
          title="現金系統"
          className={`w-full flex items-center py-2.5 rounded-xl text-sm font-medium transition-all ${
            collapsed ? "justify-center px-0" : "gap-3 px-3"
          } ${
            isCash
              ? "bg-indigo-50 text-indigo-700"
              : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
          }`}
        >
          <span className="text-base leading-none">💵</span>
          {!collapsed && <span className="flex-1 text-left">現金系統</span>}
          {!collapsed && <span className="text-xs text-slate-400">{cashOpen ? "▾" : "▸"}</span>}
        </button>

        {!collapsed && cashOpen && (
          <div className="ml-4 space-y-0.5">
            {cashItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
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

        {/* 報表分析 */}
        <Link
          href="/reports"
          title="報表分析"
          className={`flex items-center py-2.5 rounded-xl text-sm font-medium transition-all ${
            collapsed ? "justify-center px-0" : "gap-3 px-3"
          } ${
            pathname.startsWith("/reports")
              ? "bg-indigo-50 text-indigo-700"
              : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
          }`}
        >
          <span className="text-base leading-none">▦</span>
          {!collapsed && "報表分析"}
        </Link>

        {/* 投資 section */}
        <button
          onClick={toggleInvest}
          title="投資"
          className={`w-full flex items-center py-2.5 rounded-xl text-sm font-medium transition-all ${
            collapsed ? "justify-center px-0" : "gap-3 px-3"
          } ${
            isInvestment
              ? "bg-indigo-50 text-indigo-700"
              : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
          }`}
        >
          <span className="text-base leading-none">📊</span>
          {!collapsed && <span className="flex-1 text-left">投資</span>}
          {!collapsed && <span className="text-xs text-slate-400">{investOpen ? "▾" : "▸"}</span>}
        </button>

        {!collapsed && investOpen && (
          <div className="ml-4 space-y-0.5">
            {investmentItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
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

        {/* 會員資料管理 */}
        <Link
          href="/profile"
          title="會員資料管理"
          className={`flex items-center py-2.5 rounded-xl text-sm font-medium transition-all ${
            collapsed ? "justify-center px-0" : "gap-3 px-3"
          } ${
            pathname.startsWith("/profile")
              ? "bg-indigo-50 text-indigo-700"
              : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
          }`}
        >
          <span className="text-base leading-none">👤</span>
          {!collapsed && "會員資料管理"}
        </Link>
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
