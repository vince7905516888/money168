"use client";

import { useEffect, useState, useCallback } from "react";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  tier: string;
  isSuperAdmin: boolean;
  isActive: boolean;
  createdAt: string;
  _count: { transactions: number };
}

export default function LevelsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

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

  const patchUser = async (user: User, body: Record<string, unknown>) => {
    setSaving(user.id);
    await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(null);
    fetchUsers();
  };

  const changeRole = (user: User, newRole: string) => {
    if (newRole === user.role) return;
    patchUser(user, { role: newRole });
  };

  const changeTier = (user: User, newTier: string) => {
    if (newTier === user.tier) return;
    patchUser(user, { tier: newTier });
  };

  const changeAdminLevel = (user: User, superAdmin: boolean) => {
    if (superAdmin === user.isSuperAdmin) return;
    patchUser(user, { isSuperAdmin: superAdmin });
  };

  const toggleActive = (user: User) => {
    patchUser(user, { isActive: !user.isActive });
  };

  const admins = users.filter((u) => u.role === "ADMIN");
  const members = users.filter((u) => u.role !== "ADMIN");

  const UserRow = ({ user }: { user: User }) => (
    <div className="flex items-center justify-between px-5 py-4 hover:bg-slate-700/50 transition-colors">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-indigo-900 flex items-center justify-center text-indigo-300 font-semibold text-sm flex-shrink-0">
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <div className="text-sm font-medium text-white">{user.name}</div>
          <div className="text-xs text-slate-400">{user.email}</div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className={`inline-flex items-center gap-1 text-xs font-medium ${user.isActive ? "text-emerald-400" : "text-red-400"}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${user.isActive ? "bg-emerald-400" : "bg-red-400"}`} />
          {user.isActive ? "正常" : "停用"}
        </span>
        <button
          onClick={() => toggleActive(user)}
          disabled={saving === user.id}
          className={`text-xs px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 ${
            user.isActive ? "text-amber-400 hover:bg-amber-900/30" : "text-emerald-400 hover:bg-emerald-900/30"
          }`}
        >
          {user.isActive ? "停用" : "啟用"}
        </button>
        <select
          value={user.role}
          onChange={(e) => changeRole(user, e.target.value)}
          disabled={saving === user.id}
          className="bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-xs text-white focus:border-indigo-500 transition-colors disabled:opacity-50"
        >
          <option value="MEMBER">會員</option>
          <option value="ADMIN">管理員</option>
        </select>
        {user.role === "ADMIN" ? (
          <select
            value={user.isSuperAdmin ? "SUPER" : "STAFF"}
            onChange={(e) => changeAdminLevel(user, e.target.value === "SUPER")}
            disabled={saving === user.id}
            className="bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-xs text-white focus:border-indigo-500 transition-colors disabled:opacity-50"
          >
            <option value="STAFF">一般管理員</option>
            <option value="SUPER">超級管理員</option>
          </select>
        ) : (
          <select
            value={user.tier}
            onChange={(e) => changeTier(user, e.target.value)}
            disabled={saving === user.id}
            className="bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-xs text-white focus:border-indigo-500 transition-colors disabled:opacity-50"
          >
            <option value="FREE">一般會員</option>
            <option value="BASIC">進階會員</option>
            <option value="PRO">尊榮會員</option>
          </select>
        )}
        {saving === user.id && <span className="text-xs text-slate-400">儲存中...</span>}
      </div>
    </div>
  );

  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">層級管理</h1>
        <p className="text-slate-400 text-sm mt-1">
          調整帳戶的角色與層級。管理員分「一般/超級」兩級，能看到的後台頁面不同；會員分「一般/進階/尊榮」三級，能看到的前台欄目由「會員等級設定」頁配置。
        </p>
      </div>

      {loading ? (
        <div className="text-slate-400 text-sm">載入中...</div>
      ) : (
        <div className="space-y-6">
          {/* 管理員 */}
          <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-700 flex items-center gap-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-900 text-indigo-300">管理員</span>
              <span className="text-slate-400 text-xs">{admins.length} 人</span>
            </div>
            {admins.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-sm">目前沒有管理員</div>
            ) : (
              <div className="divide-y divide-slate-700">
                {admins.map((u) => <UserRow key={u.id} user={u} />)}
              </div>
            )}
          </div>

          {/* 一般會員 */}
          <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-700 flex items-center gap-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-700 text-slate-300">會員</span>
              <span className="text-slate-400 text-xs">{members.length} 人</span>
            </div>
            {members.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-sm">目前沒有一般會員</div>
            ) : (
              <div className="divide-y divide-slate-700">
                {members.map((u) => <UserRow key={u.id} user={u} />)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
