"use client";

import { useEffect, useState } from "react";

interface BankSummary {
  name: string;
  income: number;
  expense: number;
  transferIn: number;
  transferOut: number;
  balance: number;
}

export default function BanksPage() {
  const [banks, setBanks] = useState<BankSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    setLoading(true);
    const res = await fetch("/api/banks/summary");
    const data = await res.json();
    setBanks(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const fmt = (n: number) =>
    new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(n);

  const totalBalance = banks.reduce((s, b) => s + b.balance, 0);
  const totalIncome = banks.reduce((s, b) => s + b.income + b.transferIn, 0);
  const totalExpense = banks.reduce((s, b) => s + b.expense + b.transferOut, 0);

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">銀行資金管理</h1>
        <p className="text-slate-500 text-sm mt-1">追蹤各銀行帳戶的資金流向</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">銀行總結餘</div>
          <div className={`text-2xl font-bold mt-1 ${totalBalance >= 0 ? "text-slate-900" : "text-red-500"}`}>
            {fmt(totalBalance)}
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="text-xs font-semibold text-emerald-500 uppercase tracking-wider mb-1">總流入</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">{fmt(totalIncome)}</div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-1">總流出</div>
          <div className="text-2xl font-bold text-red-500 mt-1">{fmt(totalExpense)}</div>
        </div>
      </div>

      {/* Bank list */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-50">
          <h2 className="font-semibold text-slate-900">各銀行明細</h2>
        </div>

        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm">載入中...</div>
        ) : banks.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            尚無銀行交易記錄<br />
            <span className="text-xs mt-1 block">在「收支記錄」中選擇「銀行」分類或支付方式即可追蹤</span>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {banks.map((bank) => (
              <div key={bank.name} className="px-6 py-5 hover:bg-slate-50 transition-colors">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center text-lg">
                      🏦
                    </div>
                    <span className="text-sm font-semibold text-slate-800">{bank.name}</span>
                  </div>
                  <span className={`text-base font-bold ${bank.balance >= 0 ? "text-slate-800" : "text-red-500"}`}>
                    {fmt(bank.balance)}
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 ml-13">
                  <div className="bg-emerald-50 rounded-lg px-3 py-2">
                    <div className="text-xs text-emerald-600 font-medium">收入</div>
                    <div className="text-sm font-semibold text-emerald-700">{fmt(bank.income)}</div>
                  </div>
                  <div className="bg-red-50 rounded-lg px-3 py-2">
                    <div className="text-xs text-red-500 font-medium">支出</div>
                    <div className="text-sm font-semibold text-red-600">{fmt(bank.expense)}</div>
                  </div>
                  <div className="bg-indigo-50 rounded-lg px-3 py-2">
                    <div className="text-xs text-indigo-500 font-medium">調帳流入</div>
                    <div className="text-sm font-semibold text-indigo-600">{fmt(bank.transferIn)}</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg px-3 py-2">
                    <div className="text-xs text-slate-500 font-medium">調帳流出</div>
                    <div className="text-sm font-semibold text-slate-600">{fmt(bank.transferOut)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400 mt-4 text-center">
        資料來源：收支記錄中選擇「銀行」分類或支付方式，以及調帳記錄中涉及銀行的部分
      </p>
    </div>
  );
}
