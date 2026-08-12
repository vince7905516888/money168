"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const navItems = [
  { href: "/dashboard", label: "總覽", icon: "◎" },
  { href: "/transactions", label: "收支記錄", icon: "≡" },
  { href: "/reports", label: "報表分析", icon: "▦" },
];

export default function MemberSidebar({ userName }: { userName: string }) {
  const pathname = usePathname();

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
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                active
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              <span className="text-base leading-none">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
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
