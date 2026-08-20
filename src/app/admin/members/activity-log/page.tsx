"use client";

import { useEffect, useState, useCallback } from "react";
import { useAdminTheme, ADMIN_THEMES } from "@/components/layout/AdminThemeContext";
import { ACTIVITY_LOG_CATEGORIES } from "@/lib/nav-items";
import { ACTIVITY_ACTION_LABEL } from "@/lib/activity-log-labels";

interface ActivityLog {
  id: string;
  action: string;
  category: string | null;
  detail: string | null;
  createdAt: string;
  user: { name: string; email: string };
}

interface AdminUser {
  id: string;
  name: string;
  email: string;
}

const PAGE_SIZE = 50;

export default function MemberActivityLogPage() {
  const { themeKey } = useAdminTheme();
  const skin = ADMIN_THEMES[themeKey];
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [page, setPage] = useState(1);

  const [filters, setFilters] = useState({ userId: "", category: "", from: "", to: "" });

  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((data) => setUsers(Array.isArray(data) ? data : []));
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.userId) params.set("userId", filters.userId);
    if (filters.category) params.set("category", filters.category);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    const res = await fetch(`/api/admin/member-activity-log?${params}`);
    const data = await res.json();
    setLogs(Array.isArray(data?.items) ? data.items : []);
    setTotal(typeof data?.total === "number" ? data.total : 0);
    setLoading(false);
  }, [filters, page]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);
  useEffect(() => { setPage(1); }, [filters]);

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className={`text-2xl font-bold ${skin.heading}`}>會員變動紀錄</h1>
        <p className={`${skin.subheading} text-sm mt-1`}>會員在前台新增/編輯/刪除的收支、銀行、投資、負債、自訂策略等內容都會記錄在這裡</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select
          value={filters.userId}
          onChange={(e) => setFilters((f) => ({ ...f, userId: e.target.value }))}
          className="border border-slate-700 bg-slate-800 text-slate-200 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">全部會員</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}（{u.email}）</option>
          ))}
        </select>
        <select
          value={filters.category}
          onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
          className="border border-slate-700 bg-slate-800 text-slate-200 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">全部分類</option>
          {ACTIVITY_LOG_CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>
        <input
          type="date"
          value={filters.from}
          onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
          className="border border-slate-700 bg-slate-800 text-slate-200 rounded-lg px-3 py-2 text-sm"
        />
        <span className="text-slate-500 self-center text-sm">至</span>
        <input
          type="date"
          value={filters.to}
          onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
          className="border border-slate-700 bg-slate-800 text-slate-200 rounded-lg px-3 py-2 text-sm"
        />
        {(filters.userId || filters.category || filters.from || filters.to) && (
          <button
            onClick={() => setFilters({ userId: "", category: "", from: "", to: "" })}
            className="text-xs text-slate-400 hover:text-slate-200 px-2 py-2"
          >
            清除篩選
          </button>
        )}
      </div>

      <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm">載入中...</div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">沒有符合條件的變動紀錄</div>
        ) : (
          <div className="divide-y divide-slate-700">
            {logs.map((log) => {
              const catLabel = ACTIVITY_LOG_CATEGORIES.find((c) => c.key === log.category)?.label;
              return (
                <div key={log.id} className="flex items-center justify-between px-5 py-4 hover:bg-slate-700/50 transition-colors">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-900 text-indigo-300 shrink-0">
                        {ACTIVITY_ACTION_LABEL[log.action] ?? log.action}
                      </span>
                      {catLabel && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 shrink-0">
                          {catLabel}
                        </span>
                      )}
                      <span className="text-sm text-slate-50">{log.user.name}</span>
                      <span className="text-xs text-slate-500">{log.user.email}</span>
                    </div>
                    {log.detail && <div className="text-xs text-slate-400 mt-1">{log.detail}</div>}
                  </div>
                  <span className="text-xs text-slate-500 shrink-0">{new Date(log.createdAt).toLocaleString("zh-TW")}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 px-1">
          <span className="text-xs text-slate-500">共 {total} 筆 · 第 {page} / {totalPages} 頁</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              上一頁
            </button>
            <button
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              下一頁
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
