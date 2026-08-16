"use client";

import { useEffect, useState, useCallback } from "react";
import { authFetch } from "@/lib/api-fetch";

interface Debt {
  id: string;
  category: string;
  amount: number;
  bankName?: string;
  date: string;
  note?: string;
  createdAt: string;
}

interface UserDebtCategory {
  id: string;
  name: string;
}

interface UserBank {
  id: string;
  name: string;
}

const DEFAULT_BANKS = [
  "台灣銀行", "合作金庫", "第一銀行", "華南銀行", "彰化銀行",
  "兆豐銀行", "土地銀行", "國泰世華", "玉山銀行", "中國信託",
  "台北富邦", "永豐銀行", "台新銀行", "遠東銀行", "上海商銀",
  "星展銀行", "渣打銀行", "中華郵政",
];

const PAGE_SIZE = 20;

const EMPTY_ADD_FORM = {
  category: "",
  flowType: "INCREASE" as "INCREASE" | "DECREASE",
  date: new Date().toISOString().split("T")[0],
  amount: "",
  bankName: "",
  note: "",
};

export default function DebtsPage() {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_ADD_FORM);
  const [addSaving, setAddSaving] = useState(false);

  const [editing, setEditing] = useState<Debt | null>(null);
  const [editForm, setEditForm] = useState({ category: "", amount: "", bankName: "", date: "", note: "" });
  const [saving, setSaving] = useState(false);

  const [categories, setCategories] = useState<UserDebtCategory[]>([]);
  const [addCategoryInput, setAddCategoryInput] = useState("");
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [addCategoryLoading, setAddCategoryLoading] = useState(false);

  const [userBanks, setUserBanks] = useState<UserBank[]>([]);
  const [addBankInput, setAddBankInput] = useState("");
  const [addBankOpen, setAddBankOpen] = useState(false);
  const [addBankLoading, setAddBankLoading] = useState(false);

  const [page, setPage] = useState(1);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [debtRes, catRes, bankRes] = await Promise.all([
      fetch("/api/debts"),
      fetch("/api/user-debt-categories"),
      fetch("/api/user-banks"),
    ]);
    const [debtData, catData, bankData] = await Promise.all([debtRes.json(), catRes.json(), bankRes.json()]);
    setDebts(Array.isArray(debtData) ? debtData : []);
    setCategories(Array.isArray(catData) ? catData : []);
    setUserBanks(Array.isArray(bankData) ? bankData : []);
    setPage(1);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const allBanks = [...DEFAULT_BANKS, ...userBanks.map((b) => b.name)];

  const handleAddCategory = async () => {
    if (!addCategoryInput.trim()) return;
    setAddCategoryLoading(true);
    const res = await authFetch("/api/user-debt-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: addCategoryInput.trim() }),
    });
    setAddCategoryLoading(false);
    if (res.ok) {
      const cat = await res.json();
      setCategories((prev) => [...prev, cat]);
      setAddForm((f) => ({ ...f, category: cat.name }));
      setAddCategoryInput("");
      setAddCategoryOpen(false);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm("確定要刪除這個分類？(不會刪除已經新增的負債記錄)")) return;
    await authFetch(`/api/user-debt-categories/${id}`, { method: "DELETE" });
    setCategories((prev) => prev.filter((c) => c.id !== id));
  };

  const handleAddBank = async () => {
    if (!addBankInput.trim()) return;
    setAddBankLoading(true);
    const res = await authFetch("/api/user-banks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: addBankInput.trim() }),
    });
    setAddBankLoading(false);
    if (res.ok) {
      const bank = await res.json();
      setUserBanks((prev) => [...prev, bank]);
      setAddForm((f) => ({ ...f, bankName: bank.name }));
      setAddBankInput("");
      setAddBankOpen(false);
    }
  };

  const fmt = (n: number) =>
    new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(n);

  // 目前總負債：增加為正、減少（還款）為負，加總即為目前尚欠金額
  const total = debts.reduce((s, d) => s + d.amount, 0);

  const categoryTotals = debts.reduce((acc, d) => {
    acc[d.category] = (acc[d.category] || 0) + d.amount;
    return acc;
  }, {} as Record<string, number>);

  // ---- 新增表單：即時試算 ----
  const amountInput = parseFloat(addForm.amount) || 0;
  const isDecrease = addForm.flowType === "DECREASE";
  const signedAmount = isDecrease ? -amountInput : amountInput;

  const resetAddForm = () => {
    setAddForm(EMPTY_ADD_FORM);
    setAddCategoryInput("");
    setAddCategoryOpen(false);
    setAddBankInput("");
    setAddBankOpen(false);
  };

  const openAdd = () => { resetAddForm(); setShowAddModal(true); };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.category) {
      alert("請選擇分類");
      return;
    }
    if (amountInput <= 0) {
      alert("請填寫金額");
      return;
    }
    setAddSaving(true);
    const res = await authFetch("/api/debts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: addForm.category,
        date: addForm.date,
        amount: signedAmount,
        bankName: addForm.bankName,
        note: addForm.note,
      }),
    });
    setAddSaving(false);
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      alert(err?.error || "儲存失敗，請稍後再試");
      return;
    }
    setShowAddModal(false);
    fetchAll();
  };

  const openEdit = (d: Debt) => {
    setEditing(d);
    setEditForm({
      category: d.category,
      amount: String(d.amount),
      bankName: d.bankName ?? "",
      date: d.date ? d.date.split("T")[0] : "",
      note: d.note ?? "",
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    const res = await authFetch(`/api/debts/${editing.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    setSaving(false);
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      alert(err?.error || "儲存失敗，請稍後再試");
      return;
    }
    setEditing(null);
    fetchAll();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("確定要刪除這筆負債記錄？")) return;
    await authFetch(`/api/debts/${id}`, { method: "DELETE" });
    fetchAll();
  };

  const pageCount = Math.max(1, Math.ceil(debts.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pagedDebts = debts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">負債表</h1>
          <p className="text-slate-500 text-sm mt-1">管理你的負債記錄</p>
        </div>
        <button onClick={openAdd}
          className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors">
          + 新增記錄
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">目前總負債</div>
          <div className={`text-2xl font-bold mt-1 ${total > 0 ? "text-red-500" : "text-slate-900"}`}>{fmt(total)}</div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">記錄筆數</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{debts.length} 筆</div>
        </div>
      </div>

      {/* 依分類小計 */}
      {Object.keys(categoryTotals).length > 0 && (
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm mb-8">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">依分類小計</div>
          <div className="space-y-2">
            {Object.entries(categoryTotals).map(([category, amount]) => (
              <div key={category} className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{category}</span>
                <span className={`font-semibold ${amount > 0 ? "text-slate-900" : "text-emerald-600"}`}>{fmt(amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* List */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-50">
          <h2 className="font-semibold text-slate-900">負債記錄</h2>
        </div>
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm">載入中...</div>
        ) : debts.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-slate-400 text-sm mb-3">還沒有負債記錄</p>
            <button onClick={openAdd} className="text-sm text-indigo-600 font-medium hover:underline">新增第一筆記錄</button>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {pagedDebts.map((d) => (
              <div key={d.id} className="flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors group">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${d.amount >= 0 ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                      {d.amount >= 0 ? "增加" : "減少"}
                    </span>
                    <span className="text-sm font-medium text-slate-800">{d.category}</span>
                    {d.bankName && <span className="text-xs text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">{d.bankName}</span>}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {new Date(d.date ?? d.createdAt).toLocaleDateString("zh-TW")}
                    {d.note ? ` · ${d.note}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`text-sm font-semibold ${d.amount >= 0 ? "text-red-500" : "text-emerald-600"}`}>
                    {d.amount >= 0 ? "+" : "-"}{fmt(Math.abs(d.amount))}
                  </span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEdit(d)} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 text-xs transition-colors">編輯</button>
                    <button onClick={() => handleDelete(d.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 text-xs transition-colors">刪除</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {!loading && pageCount > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-slate-50">
            <span className="text-xs text-slate-400">
              第 {currentPage} / {pageCount} 頁・共 {debts.length} 筆
            </span>
            <div className="flex gap-1">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                上一頁
              </button>
              <button type="button" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={currentPage >= pageCount}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                下一頁
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 新增記錄 Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-slate-900 mb-5">新增負債記錄</h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">分類</label>
                <select required value={addForm.category}
                  onChange={(e) => setAddForm({ ...addForm, category: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors">
                  <option value="">請選擇分類</option>
                  {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
                {addCategoryOpen ? (
                  <div className="flex gap-2 mt-2">
                    <input value={addCategoryInput} onChange={(e) => setAddCategoryInput(e.target.value)}
                      placeholder="輸入分類名稱，例如：房貸"
                      className="flex-1 border border-indigo-300 rounded-lg px-3 py-2 text-sm focus:border-indigo-400" />
                    <button type="button" onClick={handleAddCategory} disabled={addCategoryLoading}
                      className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60">
                      {addCategoryLoading ? "..." : "新增"}
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setAddCategoryOpen(true)}
                    className="mt-1.5 text-xs text-indigo-500 hover:text-indigo-700 hover:underline">
                    + 找不到？新增分類
                  </button>
                )}
                {categories.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {categories.map((c) => (
                      <span key={c.id} className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs pl-2 pr-1 py-1 rounded-full">
                        <button type="button" onClick={() => setAddForm({ ...addForm, category: c.name })} className="hover:text-indigo-600">
                          {c.name}
                        </button>
                        <button type="button" onClick={() => handleDeleteCategory(c.id)}
                          className="text-slate-400 hover:text-red-500 leading-none w-4 h-4 flex items-center justify-center rounded-full hover:bg-red-50">
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">交易類型</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setAddForm({ ...addForm, flowType: "INCREASE" })}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${addForm.flowType === "INCREASE" ? "bg-red-500 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                    增加（借款）
                  </button>
                  <button type="button" onClick={() => setAddForm({ ...addForm, flowType: "DECREASE" })}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${addForm.flowType === "DECREASE" ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                    減少（還款）
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">日期</label>
                <input required type="date" value={addForm.date}
                  onChange={(e) => setAddForm({ ...addForm, date: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">金額</label>
                <input required type="number" min="0" step="any" value={addForm.amount}
                  onChange={(e) => setAddForm({ ...addForm, amount: e.target.value })} placeholder="例如：10000"
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">機構／銀行（選填）</label>
                <input
                  type="text"
                  list="debtbanklist"
                  value={addForm.bankName}
                  onChange={(e) => setAddForm({ ...addForm, bankName: e.target.value })}
                  placeholder="搜尋或選擇銀行"
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors"
                />
                <datalist id="debtbanklist">
                  {allBanks.map((b) => <option key={b} value={b} />)}
                </datalist>
                {addBankOpen ? (
                  <div className="flex gap-2 mt-2">
                    <input value={addBankInput} onChange={(e) => setAddBankInput(e.target.value)}
                      placeholder="輸入銀行名稱"
                      className="flex-1 border border-indigo-300 rounded-lg px-3 py-2 text-sm focus:border-indigo-400" />
                    <button type="button" onClick={handleAddBank} disabled={addBankLoading}
                      className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60">
                      {addBankLoading ? "..." : "新增"}
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setAddBankOpen(true)}
                    className="mt-1.5 text-xs text-indigo-500 hover:text-indigo-700 hover:underline">
                    + 找不到？申請新增銀行
                  </button>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">備註（選填）</label>
                <input value={addForm.note} onChange={(e) => setAddForm({ ...addForm, note: e.target.value })}
                  placeholder="備註..." className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                  取消
                </button>
                <button type="submit" disabled={addSaving}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-60">
                  {addSaving ? "儲存中..." : "儲存"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 編輯 Modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-5">編輯負債記錄</h2>
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">分類</label>
                <select value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors">
                  <option value="">未設定</option>
                  {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                  {editForm.category && !categories.find((c) => c.name === editForm.category) && (
                    <option value={editForm.category}>{editForm.category}</option>
                  )}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">日期</label>
                <input type="date" value={editForm.date} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">金額</label>
                <input required type="number" step="any" value={editForm.amount}
                  onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })} placeholder="例如：10000"
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                <p className="text-[11px] text-slate-400 mt-1">正數＝增加負債，負數＝減少（還款）</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">機構／銀行（選填）</label>
                <input
                  type="text"
                  list="debtbanklist-edit"
                  value={editForm.bankName}
                  onChange={(e) => setEditForm({ ...editForm, bankName: e.target.value })}
                  placeholder="搜尋或選擇銀行"
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors"
                />
                <datalist id="debtbanklist-edit">
                  {allBanks.map((b) => <option key={b} value={b} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">備註（選填）</label>
                <input value={editForm.note} onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
                  placeholder="備註..." className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setEditing(null)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                  取消
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-60">
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
