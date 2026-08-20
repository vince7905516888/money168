"use client";

import { useEffect, useState, useCallback } from "react";
import { ACTIVITY_LOG_CATEGORIES } from "@/lib/nav-items";
import { ACTIVITY_ACTION_LABEL } from "@/lib/activity-log-labels";

interface Transaction {
  id: string;
  title: string;
  amount: number;
  type: "INCOME" | "EXPENSE";
  date: string;
  category?: { name: string; icon?: string; color?: string };
}

interface ActivityLog {
  id: string;
  action: string;
  category: string | null;
  detail: string | null;
  createdAt: string;
}

const LOG_PAGE_SIZE = 20;

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

  // 變動紀錄查詢：查詢自己在前台新增/編輯/刪除過的收支、銀行、投資、負債、自訂策略等紀錄
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsShown, setLogsShown] = useState(true);
  const [logPage, setLogPage] = useState(1);
  const [logFilters, setLogFilters] = useState({ category: "", from: "", to: "" });

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    const params = new URLSearchParams();
    if (logFilters.category) params.set("category", logFilters.category);
    if (logFilters.from) params.set("from", logFilters.from);
    if (logFilters.to) params.set("to", logFilters.to);
    params.set("page", String(logPage));
    params.set("pageSize", String(LOG_PAGE_SIZE));
    const res = await fetch(`/api/member-activity-log?${params}`);
    const data = await res.json();
    setLogs(Array.isArray(data?.items) ? data.items : []);
    setLogsTotal(typeof data?.total === "number" ? data.total : 0);
    setLogsLoading(false);
  }, [logFilters, logPage]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);
  useEffect(() => { setLogPage(1); }, [logFilters]);

  const logsTotalPages = Math.max(Math.ceil(logsTotal / LOG_PAGE_SIZE), 1);

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

      {/* 變動紀錄查詢 */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mt-6">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50">
          <div>
            <h3 className="font-semibold text-slate-900">變動紀錄查詢</h3>
            <p className="text-xs text-slate-400 mt-0.5">查詢你在前台新增/編輯/刪除過的收支、銀行、投資、負債等紀錄</p>
          </div>
          <button
            onClick={() => setLogsShown((v) => !v)}
            className="text-xs text-slate-400 hover:text-slate-600 px-2.5 py-1 rounded-lg hover:bg-slate-100 transition-colors shrink-0"
          >
            {logsShown ? "隱藏" : "顯示"}
          </button>
        </div>
        {logsShown && (
          <>
            <div className="flex flex-wrap gap-2 px-6 py-4 border-b border-slate-50">
              <select
                value={logFilters.category}
                onChange={(e) => setLogFilters((f) => ({ ...f, category: e.target.value }))}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white"
              >
                <option value="">全部分類</option>
                {ACTIVITY_LOG_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
              <input
                type="date"
                value={logFilters.from}
                onChange={(e) => setLogFilters((f) => ({ ...f, from: e.target.value }))}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white"
              />
              <span className="text-slate-400 self-center text-sm">至</span>
              <input
                type="date"
                value={logFilters.to}
                onChange={(e) => setLogFilters((f) => ({ ...f, to: e.target.value }))}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white"
              />
              {(logFilters.category || logFilters.from || logFilters.to) && (
                <button
                  onClick={() => setLogFilters({ category: "", from: "", to: "" })}
                  className="text-xs text-slate-400 hover:text-slate-600 px-2 py-2"
                >
                  清除篩選
                </button>
              )}
            </div>
            {logsLoading ? (
              <div className="py-16 text-center text-slate-400 text-sm">載入中...</div>
            ) : logs.length === 0 ? (
              <div className="py-16 text-center text-slate-400 text-sm">沒有符合條件的變動紀錄</div>
            ) : (
              <>
                <div className="divide-y divide-slate-50">
                  {logs.map((log) => {
                    const catLabel = ACTIVITY_LOG_CATEGORIES.find((c) => c.key === log.category)?.label;
                    return (
                      <div key={log.id} className="flex items-center justify-between px-6 py-3.5">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 shrink-0">
                              {ACTIVITY_ACTION_LABEL[log.action] ?? log.action}
                            </span>
                            {catLabel && (
                              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 shrink-0">
                                {catLabel}
                              </span>
                            )}
                          </div>
                          {log.detail && <div className="text-xs text-slate-500 mt-1">{log.detail}</div>}
                        </div>
                        <span className="text-xs text-slate-400 shrink-0">{new Date(log.createdAt).toLocaleString("zh-TW")}</span>
                      </div>
                    );
                  })}
                </div>
                {logsTotalPages > 1 && (
                  <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-50">
                    <span className="text-xs text-slate-400">共 {logsTotal} 筆 · 第 {logPage} / {logsTotalPages} 頁</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setLogPage((p) => Math.max(p - 1, 1))}
                        disabled={logPage <= 1}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        上一頁
                      </button>
                      <button
                        onClick={() => setLogPage((p) => Math.min(p + 1, logsTotalPages))}
                        disabled={logPage >= logsTotalPages}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        下一頁
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
