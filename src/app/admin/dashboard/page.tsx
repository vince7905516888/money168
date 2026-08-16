"use client";

import { useEffect, useState } from "react";

interface Stats {
  totalUsers: number;
  activeUsers: number;
  totalTransactions: number;
  totalIncome: number;
  totalExpense: number;
  sitePositiveAssetsTotal: number;
  siteDebtTotal: number;
  siteNetWorth: number;
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => r.json())
      .then((data) => {
        setStats(data);
        setLoading(false);
      });
  }, []);

  const fmt = (n: number) =>
    new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(n);

  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">後台總覽</h1>
        <p className="text-slate-400 text-sm mt-1">全站數據統計</p>
      </div>

      {loading ? (
        <div className="text-slate-400 text-sm">載入中...</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4 mb-4">
            {[
              { label: "總會員數", value: stats?.totalUsers ?? 0, suffix: "人" },
              { label: "活躍會員", value: stats?.activeUsers ?? 0, suffix: "人" },
              { label: "總筆數", value: stats?.totalTransactions ?? 0, suffix: "筆" },
            ].map((s) => (
              <div key={s.label} className="bg-slate-800 rounded-2xl p-5 border border-slate-700">
                <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">{s.label}</div>
                <div className="text-2xl font-bold text-white">
                  {s.value.toLocaleString()}
                  <span className="text-sm font-normal text-slate-400 ml-1">{s.suffix}</span>
                </div>
              </div>
            ))}
          </div>

          {/* 站結資產負債：跟前台「資產總攬」同一套公式，逐會員加總全站數字 */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700">
              <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">站結正資產總計</div>
              <div className="text-2xl font-bold text-white">{fmt(stats?.sitePositiveAssetsTotal ?? 0)}</div>
            </div>
            <div className="bg-red-950/40 rounded-2xl p-5 border border-red-900/50">
              <div className="text-xs text-red-400 uppercase tracking-wider mb-2">站結負債總額</div>
              <div className="text-2xl font-bold text-red-400">{fmt(stats?.siteDebtTotal ?? 0)}</div>
            </div>
            <div className="bg-indigo-950/40 rounded-2xl p-5 border border-indigo-900/50">
              <div className="text-xs text-indigo-400 uppercase tracking-wider mb-2">站結資產負債總計</div>
              <div className={`text-2xl font-bold ${(stats?.siteNetWorth ?? 0) >= 0 ? "text-indigo-300" : "text-red-400"}`}>
                {fmt(stats?.siteNetWorth ?? 0)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">站結正資產總計 − 站結負債總額</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700">
              <div className="text-xs text-emerald-400 uppercase tracking-wider mb-2">全站總收入</div>
              <div className="text-2xl font-bold text-emerald-400">{fmt(stats?.totalIncome ?? 0)}</div>
            </div>
            <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700">
              <div className="text-xs text-red-400 uppercase tracking-wider mb-2">全站總支出</div>
              <div className="text-2xl font-bold text-red-400">{fmt(stats?.totalExpense ?? 0)}</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
