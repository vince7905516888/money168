"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState } from "react";

const cashItems = [
  { href: "/transactions", label: "收支記錄" },
  { href: "/banks", label: "銀行資金管理" },
];

const investmentItems = [
  { href: "/investment/overview", label: "投資總攬" },
  { href: "/investment/stock", label: "股票投資" },
  { href: "/investment/fund", label: "基金投資" },
  { href: "/investment/forex", label: "外匯投資" },
];

export default function MemberSidebar({ userName }: { userName: string }) {
  const pathname = usePathname();
  const isCash = pathname.startsWith("/transactions") || pathname.startsWith("/banks");
  const isInvestment = pathname.startsWith("/investment");
  const [cashOpen, setCashOpen] = useState(isCash);
  const [investOpen, setInvestOpen] = useState(isInvestment);

  return (
    <aside className="w-60 min-h-screen bg-white border-r border-slate-100 flex flex-col px-4 py-6 fixed left-0 top-0 z-20">
      {/* Logo */}
      <div className="flex items-center gap-2 px-3 mb-8">
        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">
          M
        </div>
        <span className="text-base font-semibold text-slate-900">MoneyFlow</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1">
        {/* 總覽 */}
        <Link
          href="/dashboard"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
            pathname === "/dashboard"
              ? "bg-indigo-50 text-indigo-700"
              : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
          }`}
        >
          <span className="text-base leading-none">◎</span>
          總覽
        </Link>

        {/* 現金系統 section */}
        <button
          onClick={() => setCashOpen((o) => !o)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
            isCash
              ? "bg-indigo-50 text-indigo-700"
              : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
          }`}
        >
          <span className="text-base leading-none">💵</span>
          <span className="flex-1 text-left">現金系統</span>
          <span className="text-xs text-slate-400">{cashOpen ? "▾" : "▸"}</span>
        </button>

        {cashOpen && (
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
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
            pathname.startsWith("/reports")
              ? "bg-indigo-50 text-indigo-700"
              : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
          }`}
        >
          <span className="text-base leading-none">▦</span>
          報表分析
        </Link>

        {/* 投資 section */}
        <button
          onClick={() => setInvestOpen((o) => !o)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
            isInvestment
              ? "bg-indigo-50 text-indigo-700"
              : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
          }`}
        >
          <span className="text-base leading-none">📊</span>
          <span className="flex-1 text-left">投資</span>
          <span className="text-xs text-slate-400">{investOpen ? "▾" : "▸"}</span>
        </button>

        {investOpen && (
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
      </nav>

      {/* User */}
      <div className="border-t border-slate-100 pt-4 mt-4">
        <div className="flex items-center gap-3 px-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-sm">
            {userName?.charAt(0)?.toUpperCase()}
          </div>
          <span className="text-sm font-medium text-slate-700 truncate">{userName}</span>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 transition-all"
        >
          登出
        </button>
      </div>
    </aside>
  );
}
