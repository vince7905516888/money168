"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Transaction {
  id: string;
  title: string;
  amount: number;
  type: "INCOME" | "EXPENSE";
  date: string;
  category?: { name: string; icon?: string; color?: string };
}

export default function DashboardPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  useEffect(() => {
    fetch(`/api/transactions?month=${month}`)
      .then((r) => r.json())
      .then((data) => {
        setTransactions(Array.isArray(data) ? data : []);
        setLoading(false);
      });
  }, [month]);

  const income = transactions
    .filter((t) => t.type === "INCOME")
    .reduce((s, t) => s + t.amount, 0);
  const expense = transactions
    .filter((t) => t.type === "EXPENSE")
    .reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;

  const fmt = (n: number) =>
    new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(n);

  const recent = transactions.slice(0, 5);

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">本月總覽</h1>
        <p className="text-slate-500 text-sm mt-1">
          {now.getFullYear()} 年 {now.getMonth() + 1} 月
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">結餘</div>
          <div className={`text-3xl font-bold mt-1 ${balance >= 0 ? "text-slate-900" : "text-red-500"}`}>
            {fmt(balance)}
          </div>
        </div>
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <div className="text-xs font-semibold text-emerald-500 uppercase tracking-wider mb-1">收入</div>
          <div className="text-3xl font-bold text-emerald-600 mt-1">{fmt(income)}</div>
        </div>
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <div className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-1">支出</div>
          <div className="text-3xl font-bold text-red-500 mt-1">{fmt(expense)}</div>
        </div>
      </div>

      {/* Recent transactions */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50">
          <h2 className="font-semibold text-slate-900">最近記錄</h2>
          <Link href="/transactions" className="text-sm text-indigo-600 hover:underline">
            查看全部
          </Link>
        </div>

        {loading ? (
          <div className="px-6 py-12 text-center text-slate-400 text-sm">載入中...</div>
        ) : recent.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-slate-400 text-sm mb-4">本月還沒有記錄</p>
            <Link
              href="/transactions"
              className="inline-flex items-center gap-1 bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              新增第一筆
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {recent.map((t) => (
              <div key={t.id} className="flex items-center justify-between px-6 py-3.5">
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
                    style={{ backgroundColor: (t.category?.color ?? "#e2e8f0") + "20" }}
                  >
                    {t.category?.icon ?? (t.type === "INCOME" ? "💰" : "💸")}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-800">{t.title}</div>
                    <div className="text-xs text-slate-400">
                      {t.category?.name ?? "未分類"} · {new Date(t.date).toLocaleDateString("zh-TW")}
                    </div>
                  </div>
                </div>
                <span
                  className={`text-sm font-semibold ${
                    t.type === "INCOME" ? "text-emerald-600" : "text-red-500"
                  }`}
                >
                  {t.type === "INCOME" ? "+" : "-"}{fmt(t.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
