"use client";

import { useEffect, useState } from "react";

interface Transaction {
  id: string;
  title: string;
  amount: number;
  type: "INCOME" | "EXPENSE";
  date: string;
  category?: { name: string; icon?: string; color?: string };
}

export default function ReportsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  );

  useEffect(() => {
    setLoading(true);
    fetch(`/api/transactions?month=${selectedMonth}`)
      .then((r) => r.json())
      .then((data) => {
        setTransactions(Array.isArray(data) ? data : []);
        setLoading(false);
      });
  }, [selectedMonth]);

  const income = transactions.filter((t) => t.type === "INCOME").reduce((s, t) => s + t.amount, 0);
  const expense = transactions.filter((t) => t.type === "EXPENSE").reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;

  // Group by category
  const catGroups = transactions
    .filter((t) => t.type === "EXPENSE")
    .reduce((acc: Record<string, { name: string; icon?: string; color?: string; total: number }>, t) => {
      const key = t.category?.name ?? "未分類";
      if (!acc[key]) {
        acc[key] = { name: key, icon: t.category?.icon, color: t.category?.color, total: 0 };
      }
      acc[key].total += t.amount;
      return acc;
    }, {});

  const catList = Object.values(catGroups).sort((a, b) => b.total - a.total);

  const fmt = (n: number) =>
    new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(n);

  const [year, month] = selectedMonth.split("-").map(Number);

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">報表分析</h1>
          <p className="text-slate-500 text-sm mt-1">了解你的財務狀況</p>
        </div>
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white"
        >
          {Array.from({ length: 12 }, (_, i) => {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            return (
              <option key={val} value={val}>
                {d.getFullYear()} 年 {d.getMonth() + 1} 月
              </option>
            );
          })}
        </select>
      </div>

      <h2 className="text-base font-semibold text-slate-600 mb-4">
        {year} 年 {month} 月
      </h2>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">結餘</div>
          <div className={`text-2xl font-bold ${balance >= 0 ? "text-slate-900" : "text-red-500"}`}>
            {fmt(balance)}
          </div>
        </div>
        <div className="bg-emerald-50 rounded-2xl p-5 border border-emerald-100">
          <div className="text-xs text-emerald-500 uppercase tracking-wider mb-2">總收入</div>
          <div className="text-2xl font-bold text-emerald-600">{fmt(income)}</div>
        </div>
        <div className="bg-red-50 rounded-2xl p-5 border border-red-100">
          <div className="text-xs text-red-400 uppercase tracking-wider mb-2">總支出</div>
          <div className="text-2xl font-bold text-red-500">{fmt(expense)}</div>
        </div>
      </div>

      {/* Expense by category */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
        <h3 className="font-semibold text-slate-900 mb-4">支出分類</h3>
        {loading ? (
          <div className="text-center py-8 text-slate-400 text-sm">載入中...</div>
        ) : catList.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm">本月沒有支出記錄</div>
        ) : (
          <div className="space-y-3">
            {catList.map((c) => {
              const pct = expense > 0 ? (c.total / expense) * 100 : 0;
              return (
                <div key={c.name}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{c.icon ?? "📦"}</span>
                      <span className="text-sm font-medium text-slate-700">{c.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-semibold text-slate-800">{fmt(c.total)}</span>
                      <span className="text-xs text-slate-400 ml-2">{pct.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: c.color ?? "#6366f1",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Saving rate */}
      {income > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h3 className="font-semibold text-slate-900 mb-4">儲蓄率</h3>
          <div className="flex items-end gap-4">
            <div className="text-4xl font-bold text-indigo-600">
              {Math.max(0, ((balance / income) * 100)).toFixed(1)}%
            </div>
            <p className="text-sm text-slate-500 mb-1">
              本月收入的 {((balance / income) * 100).toFixed(1)}% 被儲蓄下來
            </p>
          </div>
          <div className="mt-3 h-3 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all"
              style={{ width: `${Math.max(0, Math.min(100, (balance / income) * 100))}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
