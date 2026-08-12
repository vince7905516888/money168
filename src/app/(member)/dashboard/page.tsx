"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Transaction {
  id: string;
  title: string;
  amount: number;
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  date: string;
  category?: { name: string; icon?: string; color?: string };
}

interface BankSummary {
  name: string;
  balance: number;
}

export default function DashboardPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [banks, setBanks] = useState<BankSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      const [txRes, bankRes] = await Promise.all([
        fetch("/api/transactions?source=CASH"),
        fetch("/api/banks/summary"),
      ]);
      const [txData, bankData] = await Promise.all([txRes.json(), bankRes.json()]);
      setTransactions(Array.isArray(txData) ? txData : []);
      setBanks(Array.isArray(bankData) ? bankData : []);
      setLoading(false);
    };
    fetchAll();
  }, []);

  const cashIncome = transactions.filter((t) => t.type === "INCOME").reduce((s, t) => s + t.amount, 0);
  const cashExpense = transactions.filter((t) => t.type === "EXPENSE").reduce((s, t) => s + t.amount, 0);
  const cashBalance = cashIncome - cashExpense;
  const bankTotal = banks.reduce((s, b) => s + b.balance, 0);
  const recent = transactions.slice(0, 5);

  const fmt = (n: number) =>
    new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(n);

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">資產總覽</h1>
        <p className="text-slate-500 text-sm mt-1">所有帳戶的整體財務狀況</p>
      </div>

      {loading ? (
        <div className="py-16 text-center text-slate-400 text-sm">載入中...</div>
      ) : (
        <>
          {/* 主要統計卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">銀行總結餘</div>
              <div className={`text-3xl font-bold mt-1 ${bankTotal >= 0 ? "text-slate-900" : "text-red-500"}`}>
                {fmt(bankTotal)}
              </div>
              <Link href="/banks" className="text-xs text-indigo-500 hover:underline mt-2 inline-block">查看各銀行明細 →</Link>
            </div>
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
              <div className="text-xs font-semibold text-emerald-500 uppercase tracking-wider mb-1">總流入</div>
              <div className="text-3xl font-bold text-emerald-600 mt-1">{fmt(cashIncome)}</div>
              <div className="text-xs text-slate-400 mt-2">收支記錄 · 累計收入</div>
            </div>
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
              <div className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-1">總流出</div>
              <div className="text-3xl font-bold text-red-500 mt-1">{fmt(cashExpense)}</div>
              <div className="text-xs text-slate-400 mt-2">收支記錄 · 累計支出</div>
            </div>
          </div>

          {/* 收支結餘 */}
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm mb-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">收支結餘</div>
                <div className={`text-2xl font-bold mt-1 ${cashBalance >= 0 ? "text-slate-900" : "text-red-500"}`}>
                  {fmt(cashBalance)}
                </div>
              </div>
              <Link href="/transactions"
                className="text-sm text-indigo-600 hover:underline font-medium">
                查看收支記錄 →
              </Link>
            </div>
          </div>

          {/* 各銀行餘額 */}
          {banks.filter((b) => b.balance !== 0).length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm mb-6 overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50">
                <h2 className="font-semibold text-slate-900">各銀行餘額</h2>
                <Link href="/banks" className="text-sm text-indigo-600 hover:underline">查看詳細</Link>
              </div>
              <div className="divide-y divide-slate-50">
                {banks.filter((b) => b.balance !== 0).map((b) => (
                  <div key={b.name} className="flex items-center justify-between px-6 py-3.5">
                    <div className="flex items-center gap-2">
                      <span className="text-base">🏦</span>
                      <span className="text-sm font-medium text-slate-800">{b.name}</span>
                    </div>
                    <span className={`text-sm font-semibold ${b.balance >= 0 ? "text-slate-700" : "text-red-500"}`}>
                      {fmt(b.balance)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 最近記錄 */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50">
              <h2 className="font-semibold text-slate-900">最近記錄</h2>
              <Link href="/transactions" className="text-sm text-indigo-600 hover:underline">
                查看全部
              </Link>
            </div>

            {recent.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-slate-400 text-sm mb-4">還沒有任何記錄</p>
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
        </>
      )}
    </div>
  );
}
