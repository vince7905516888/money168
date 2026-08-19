"use client";

import { useEffect, useState, useCallback } from "react";
import { useAdminTheme, ADMIN_THEMES } from "@/components/layout/AdminThemeContext";

interface PointUser {
  id: string;
  name: string;
  email: string;
  role: string;
  points: number;
}

export default function PointsQueryPage() {
  const { themeKey } = useAdminTheme();
  const skin = ADMIN_THEMES[themeKey];
  const [users, setUsers] = useState<PointUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const fetchUsers = useCallback(async (q: string) => {
    setLoading(true);
    const res = await fetch(`/api/admin/points${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    const data = await res.json();
    const list: PointUser[] = Array.isArray(data) ? data : [];
    setUsers(list);
    setEditValues(Object.fromEntries(list.map((u) => [u.id, String(u.points)])));
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => fetchUsers(query), 300);
    return () => clearTimeout(timer);
  }, [query, fetchUsers]);

  const handleSave = async (userId: string) => {
    setSaving(userId);
    const res = await fetch(`/api/admin/points/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points: editValues[userId] }),
    });
    setSaving(null);
    if (res.ok) {
      const updated = await res.json();
      setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)));
    }
  };

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className={`text-2xl font-bold ${skin.heading}`}>會員積分查詢</h1>
        <p className={`${skin.subheading} text-sm mt-1`}>查詢會員目前的積分餘額，可直接調整數值（暫無異動歷史紀錄）</p>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="搜尋姓名或 Email..."
        className="w-full max-w-sm bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-50 placeholder:text-slate-500 focus:border-indigo-500 transition-colors mb-6"
      />

      <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
        <div className="grid grid-cols-12 px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-700">
          <div className="col-span-4">姓名</div>
          <div className="col-span-4">Email</div>
          <div className="col-span-2 text-center">目前積分</div>
          <div className="col-span-2 text-right">調整</div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm">載入中...</div>
        ) : users.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">查無會員</div>
        ) : (
          <div className="divide-y divide-slate-700">
            {users.map((u) => (
              <div key={u.id} className="grid grid-cols-12 items-center px-5 py-4 hover:bg-slate-700/40 transition-colors">
                <div className="col-span-4">
                  <div className="text-sm font-medium text-slate-50">{u.name}</div>
                  <span className="inline-flex items-center mt-0.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-700 text-slate-300">
                    {u.role === "ADMIN" ? "管理員" : "會員"}
                  </span>
                </div>
                <div className="col-span-4 text-sm text-slate-400">{u.email}</div>
                <div className="col-span-2 text-center text-sm font-semibold text-amber-400">{u.points}</div>
                <div className="col-span-2 flex justify-end items-center gap-2">
                  <input
                    type="number"
                    value={editValues[u.id] ?? ""}
                    onChange={(e) => setEditValues((prev) => ({ ...prev, [u.id]: e.target.value }))}
                    className="w-20 bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-slate-50 text-right focus:border-indigo-500 transition-colors"
                  />
                  <button
                    onClick={() => handleSave(u.id)}
                    disabled={saving === u.id || editValues[u.id] === String(u.points)}
                    className="text-xs px-2.5 py-1.5 rounded-lg text-indigo-400 hover:bg-indigo-900/30 transition-colors disabled:opacity-30"
                  >
                    {saving === u.id ? "..." : "儲存"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
