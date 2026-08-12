"use client";

import { useEffect, useState, useCallback } from "react";

interface Category {
  id: string;
  name: string;
  type: string;
  icon?: string;
  color?: string;
}

interface Transaction {
  id: string;
  title: string;
  amount: number;
  type: "INCOME" | "EXPENSE";
  date: string;
  note?: string;
  category?: Category;
  categoryId?: string;
}

const EMPTY_FORM = {
  title: "",
  amount: "",
  type: "EXPENSE" as "INCOME" | "EXPENSE",
  date: new Date().toISOString().split("T")[0],
  note: "",
  categoryId: "",
};

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState({ type: "", month: "" });

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter.type) params.set("type", filter.type);
    if (filter.month) params.set("month", filter.month);

    const [txRes, catRes] = await Promise.all([
      fetch(`/api/transactions?${params}`),
      fetch("/api/categories"),
    ]);
    const [txData, catData] = await Promise.all([txRes.json(), catRes.json()]);
    setTransactions(Array.isArray(txData) ? txData : []);
    setCategories(Array.isArray(catData) ? catData : []);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (t: Transaction) => {
    setEditing(t);
    setForm({
      title: t.title,
      amount: String(t.amount),
      type: t.type,
      date: t.date.split("T")[0],
      note: t.note ?? "",
      categoryId: t.categoryId ?? "",
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const url = editing ? `/api/transactions/${editing.id}` : "/api/transactions";
    const method = editing ? "PUT" : "POST";

    await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    setSaving(false);
    setShowModal(false);
    fetchAll();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("確定要刪除這筆記錄？")) return;
    await fetch(`/api/transactions/${id}`, { method: "DELETE" });
    fetchAll();
  };

  const fmt = (n: number) =>
    new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(n);

  const filteredCats = categories.filter((c) => c.type === form.type);

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">收支記錄</h1>
          <p className="text-slate-500 text-sm mt-1">管理你的每一筆收支</p>
        </div>
        <button
          onClick={openAdd}
          className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors"
        >
          + 新增記錄
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <select
          value={filter.month}
          onChange={(e) => setFilter({ ...filter, month: e.target.value })}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white"
        >
          <option value="">全部月份</option>
          {Array.from({ length: 6 }, (_, i) => {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            return (
              <option key={val} value={val}>
                {d.getFullYear()} 年 {d.getMonth() + 1} 月
              </option>
            );
          })}
        </select>
        <select
          value={filter.type}
          onChange={(e) => setFilter({ ...filter, type: e.target.value })}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white"
        >
          <option value="">全部類型</option>
          <option value="INCOME">收入</option>
          <option value="EXPENSE">支出</option>
        </select>
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm">載入中...</div>
        ) : transactions.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-slate-400 text-sm mb-3">還沒有任何記錄</p>
            <button
              onClick={openAdd}
              className="text-sm text-indigo-600 font-medium hover:underline"
            >
              新增第一筆記錄
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {transactions.map((t) => (
              <div key={t.id} className="flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors group">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
                    style={{ backgroundColor: (t.category?.color ?? "#e2e8f0") + "20" }}
                  >
                    {t.category?.icon ?? (t.type === "INCOME" ? "💰" : "💸")}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-800">{t.title}</div>
                    <div className="text-xs text-slate-400">
                      {t.category?.name ?? "未分類"} · {new Date(t.date).toLocaleDateString("zh-TW")}
                      {t.note && ` · ${t.note}`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`text-sm font-semibold ${t.type === "INCOME" ? "text-emerald-600" : "text-red-500"}`}>
                    {t.type === "INCOME" ? "+" : "-"}{fmt(t.amount)}
                  </span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openEdit(t)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 text-xs transition-colors"
                    >
                      編輯
                    </button>
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 text-xs transition-colors"
                    >
                      刪除
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-5">
              {editing ? "編輯記錄" : "新增記錄"}
            </h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="flex gap-2">
                {(["EXPENSE", "INCOME"] as const).map((tp) => (
                  <button
                    key={tp}
                    type="button"
                    onClick={() => setForm({ ...form, type: tp, categoryId: "" })}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      form.type === tp
                        ? tp === "INCOME"
                          ? "bg-emerald-500 text-white"
                          : "bg-red-500 text-white"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    }`}
                  >
                    {tp === "INCOME" ? "收入" : "支出"}
                  </button>
                ))}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">名稱</label>
                <input
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="例如：午餐"
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">金額</label>
                <input
                  required
                  type="number"
                  min="0"
                  step="1"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="0"
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">日期</label>
                <input
                  required
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">分類</label>
                <select
                  value={form.categoryId}
                  onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors"
                >
                  <option value="">未分類</option>
                  {filteredCats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon} {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">備註（選填）</label>
                <input
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="備註..."
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
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
