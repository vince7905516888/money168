"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const navItems = [
  { href: "/admin/dashboard", label: "後台總覽", icon: "◎" },
  { href: "/admin/users", label: "會員管理", icon: "◫" },
];

export default function AdminSidebar({ userName }: { userName: string }) {
  const pathname = usePathname();

  return (
    <aside className="w-60 min-h-screen bg-slate-900 flex flex-col px-4 py-6 fixed left-0 top-0 z-20">
      {/* Logo */}
      <div className="flex items-center gap-2 px-3 mb-8">
        <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center text-white font-bold text-sm">
          M
        </div>
        <div>
          <div className="text-sm font-semibold text-white">MoneyFlow</div>
          <div className="text-xs text-slate-400">管理後台</div>
        </div>
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
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
            >
              <span className="text-base leading-none">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="border-t border-slate-700 pt-4 mt-4">
        <div className="flex items-center gap-3 px-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-indigo-900 flex items-center justify-center text-indigo-300 font-semibold text-sm">
            {userName?.charAt(0)?.toUpperCase()}
          </div>
          <div>
            <div className="text-sm font-medium text-white truncate">{userName}</div>
            <div className="text-xs text-slate-400">管理員</div>
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-all"
        >
          登出
        </button>
      </div>
    </aside>
  );
}
