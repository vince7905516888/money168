"use client";

import { useEffect, useState, useCallback } from "react";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  _count: { transactions: number };
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/users");
    const data = await res.json();
    setUsers(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const toggleActive = async (user: User) => {
    await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !user.isActive }),
    });
    fetchUsers();
  };

  const deleteUser = async (user: User) => {
    if (!confirm(`確定要刪除 ${user.name} 的帳號？此操作無法還原。`)) return;
    await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
    fetchUsers();
  };

  const filtered = users.filter(
    (u) =>
      u.name.includes(search) ||
      u.email.includes(search)
  );

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">會員管理</h1>
          <p className="text-slate-400 text-sm mt-1">管理所有註冊會員</p>
        </div>
        <div className="text-sm text-slate-400">
          共 {users.length} 位會員
        </div>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="搜尋姓名或 Email..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full mb-5 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500 transition-colors"
      />

      {/* Table */}
      <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
        <div className="grid grid-cols-12 px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-700">
          <div className="col-span-4">會員</div>
          <div className="col-span-2">角色</div>
          <div className="col-span-2 text-center">記錄數</div>
          <div className="col-span-2">狀態</div>
          <div className="col-span-2 text-right">操作</div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm">載入中...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">沒有符合的會員</div>
        ) : (
          <div className="divide-y divide-slate-700">
            {filtered.map((user) => (
              <div key={user.id} className="grid grid-cols-12 items-center px-5 py-4 hover:bg-slate-700/50 transition-colors">
                <div className="col-span-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-indigo-900 flex items-center justify-center text-indigo-300 font-semibold text-sm flex-shrink-0">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white truncate">{user.name}</div>
                    <div className="text-xs text-slate-400 truncate">{user.email}</div>
                  </div>
                </div>
                <div className="col-span-2">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      user.role === "ADMIN"
                        ? "bg-indigo-900 text-indigo-300"
                        : "bg-slate-700 text-slate-300"
                    }`}
                  >
                    {user.role === "ADMIN" ? "管理員" : "會員"}
                  </span>
                </div>
                <div className="col-span-2 text-center text-sm text-slate-300">
                  {user._count.transactions}
                </div>
                <div className="col-span-2">
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-medium ${
                      user.isActive ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${user.isActive ? "bg-emerald-400" : "bg-red-400"}`} />
                    {user.isActive ? "正常" : "停用"}
                  </span>
                </div>
                <div className="col-span-2 flex justify-end gap-2">
                  <button
                    onClick={() => toggleActive(user)}
                    className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${
                      user.isActive
                        ? "text-amber-400 hover:bg-amber-900/30"
                        : "text-emerald-400 hover:bg-emerald-900/30"
                    }`}
                  >
                    {user.isActive ? "停用" : "啟用"}
                  </button>
                  <button
                    onClick={() => deleteUser(user)}
                    className="text-xs px-2.5 py-1 rounded-lg text-red-400 hover:bg-red-900/30 transition-colors"
                  >
                    刪除
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
