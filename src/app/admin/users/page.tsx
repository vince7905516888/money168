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

interface EditForm {
  password: string;
  confirmPassword: string;
  role: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ password: "", confirmPassword: "", role: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

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

  const openEdit = (user: User) => {
    setEditTarget(user);
    setEditForm({ password: "", confirmPassword: "", role: user.role });
    setSaveError("");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    if (editForm.password && editForm.password !== editForm.confirmPassword) {
      setSaveError("兩次密碼輸入不一致");
      return;
    }
    if (editForm.password && editForm.password.length < 6) {
      setSaveError("密碼至少需要 6 個字元");
      return;
    }
    setSaving(true);
    setSaveError("");
    const body: Record<string, string> = { role: editForm.role };
    if (editForm.password) body.password = editForm.password;
    const res = await fetch(`/api/admin/users/${editTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json();
      setSaveError(d.error ?? "儲存失敗");
      return;
    }
    setEditTarget(null);
    fetchUsers();
  };

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
    (u) => u.name.includes(search) || u.email.includes(search)
  );

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">帳戶管理</h1>
          <p className="text-slate-400 text-sm mt-1">管理所有註冊帳戶的密碼與權限</p>
        </div>
        <div className="text-sm text-slate-400">
          共 {users.length} 位帳戶
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
          <div className="col-span-4">帳戶</div>
          <div className="col-span-2">角色</div>
          <div className="col-span-2 text-center">記錄數</div>
          <div className="col-span-2">狀態</div>
          <div className="col-span-2 text-right">操作</div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm">載入中...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">沒有符合的帳戶</div>
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
                    onClick={() => openEdit(user)}
                    className="text-xs px-2.5 py-1 rounded-lg text-indigo-400 hover:bg-indigo-900/30 transition-colors"
                  >
                    編輯
                  </button>
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

      {/* Edit modal */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl shadow-xl w-full max-w-md p-6 border border-slate-700">
            <h2 className="text-lg font-bold text-white mb-1">編輯帳戶</h2>
            <p className="text-slate-400 text-sm mb-5">{editTarget.name} · {editTarget.email}</p>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">角色權限</label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3.5 py-2.5 text-sm text-white focus:border-indigo-500 transition-colors"
                >
                  <option value="MEMBER">會員</option>
                  <option value="ADMIN">管理員</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  新密碼 <span className="text-slate-500 font-normal">（不修改請留空）</span>
                </label>
                <input
                  type="password"
                  value={editForm.password}
                  onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                  placeholder="輸入新密碼（至少 6 字元）"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">確認新密碼</label>
                <input
                  type="password"
                  value={editForm.confirmPassword}
                  onChange={(e) => setEditForm({ ...editForm, confirmPassword: e.target.value })}
                  placeholder="再次輸入新密碼"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500 transition-colors"
                />
              </div>
              {saveError && (
                <div className="text-sm text-red-400 bg-red-900/20 rounded-lg px-3 py-2">{saveError}</div>
              )}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditTarget(null)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-slate-600 text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-60"
                >
                  {saving ? "儲存中..." : "儲存"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
