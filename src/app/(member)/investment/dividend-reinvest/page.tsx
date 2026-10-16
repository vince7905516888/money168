"use client";

import { useEffect, useState, useCallback } from "react";
import { authFetch } from "@/lib/api-fetch";
import Combobox from "@/components/ui/Combobox";
import Pagination from "@/components/ui/Pagination";

type AssetType = "STOCK" | "FUND";

interface DividendEntry {
  id: string;
  type: AssetType;
  name: string;
  code?: string;
  amount: number;
  quantity?: number;
  price?: number;
  fee?: number;
  date: string;
  note?: string;
  createdAt: string;
}

const TYPE_LABEL: Record<AssetType, string> = { STOCK: "股票", FUND: "基金" };

const PAGE_SIZE = 20;

const EMPTY_ADD_FORM = {
  type: "STOCK" as AssetType,
  flowType: "INCOME" as "INCOME" | "REINVEST",
  name: "",
  code: "",
  date: new Date().toISOString().split("T")[0],
  amount: "",
  quantity: "",
  price: "",
  fee: "",
  note: "",
};

export default function DividendReinvestPage() {
  const [entries, setEntries] = useState<DividendEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_ADD_FORM);
  const [addSaving, setAddSaving] = useState(false);

  const [editing, setEditing] = useState<DividendEntry | null>(null);
  const [editForm, setEditForm] = useState({ type: "STOCK" as AssetType, name: "", code: "", amount: "", quantity: "", price: "", fee: "", date: "", note: "" });
  const [saving, setSaving] = useState(false);

  const [typeFilter, setTypeFilter] = useState<"" | AssetType>("");
  const [page, setPage] = useState(1);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/dividend-entries");
    const data = await res.json();
    setEntries(Array.isArray(data) ? data : []);
    setPage(1);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const fmt = (n: number) =>
    new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(n);

  // 剩餘未投入配息餘額：配息入帳為正、再買進為負，加總即為目前還沒拿去買更多股數/單位的配息
  const total = entries.reduce((s, e) => s + e.amount, 0);
  const totalIncome = entries.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0);
  const totalReinvested = entries.filter((e) => e.amount < 0).reduce((s, e) => s + -e.amount, 0);

  // 依類型（股票／基金）小計
  const typeTotals = entries.reduce((acc, e) => {
    acc[e.type] = (acc[e.type] || 0) + e.amount;
    return acc;
  }, {} as Record<string, number>);

  // 依個別股票／基金名稱小計，用來看每一檔各自還剩多少配息沒投入、累積滾存了多少股
  const nameTotals = entries.reduce((acc, e) => {
    const key = `${e.type}__${e.name}`;
    if (!acc[key]) acc[key] = { type: e.type, name: e.name, code: e.code, total: 0, quantity: 0 };
    acc[key].total += e.amount;
    acc[key].quantity += e.quantity ?? 0;
    return acc;
  }, {} as Record<string, { type: AssetType; name: string; code?: string; total: number; quantity: number }>);
  const nameTotalList = Object.values(nameTotals).sort((a, b) => b.total - a.total);
  const fmtQty = (n: number) => new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 4 }).format(n);

  // 名稱自動建議：依目前選的類型，列出曾經輸入過的名稱
  const namesForType = (type: AssetType) =>
    Array.from(new Set(entries.filter((e) => e.type === type).map((e) => e.name)));

  const amountInput = parseFloat(addForm.amount) || 0;
  const isReinvest = addForm.flowType === "REINVEST";
  const signedAmount = isReinvest ? -amountInput : amountInput;

  const resetAddForm = () => setAddForm({ ...EMPTY_ADD_FORM, date: new Date().toISOString().split("T")[0] });
  const openAdd = () => { resetAddForm(); setShowAddModal(true); };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.name.trim()) {
      alert("請填寫股票／基金名稱");
      return;
    }
    if (amountInput <= 0) {
      alert("請填寫金額");
      return;
    }
    setAddSaving(true);
    const res = await authFetch("/api/dividend-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: addForm.type,
        name: addForm.name.trim(),
        code: addForm.code.trim(),
        date: addForm.date,
        amount: signedAmount,
        quantity: isReinvest ? addForm.quantity : "",
        price: isReinvest ? addForm.price : "",
        fee: isReinvest ? addForm.fee : "",
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

  const openEdit = (e: DividendEntry) => {
    setEditing(e);
    setEditForm({
      type: e.type,
      name: e.name,
      code: e.code ?? "",
      amount: String(e.amount),
      quantity: e.quantity != null ? String(e.quantity) : "",
      price: e.price != null ? String(e.price) : "",
      fee: e.fee != null ? String(e.fee) : "",
      date: e.date ? e.date.split("T")[0] : "",
      note: e.note ?? "",
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    const res = await authFetch(`/api/dividend-entries/${editing.id}`, {
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
    if (!confirm("確定要刪除這筆記錄？")) return;
    await authFetch(`/api/dividend-entries/${id}`, { method: "DELETE" });
    fetchAll();
  };

  const filteredEntries = typeFilter ? entries.filter((e) => e.type === typeFilter) : entries;
  const sortedEntries = [...filteredEntries].sort((a, b) => {
    const byDate = new Date(b.date ?? b.createdAt).getTime() - new Date(a.date ?? a.createdAt).getTime();
    return byDate !== 0 ? byDate : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  const pageCount = Math.max(1, Math.ceil(sortedEntries.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pagedEntries = sortedEntries.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="w-full max-w-7xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">配息複利滾存</h1>
          <p className="text-slate-500 text-sm mt-1">記錄股票／基金配息入帳與再買進，追蹤還沒投入的配息餘額</p>
        </div>
        <button onClick={openAdd}
          className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors">
          + 新增記錄
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">剩餘未投入餘額</div>
          <div className={`text-2xl font-bold mt-1 ${total >= 0 ? "text-slate-900" : "text-red-500"}`}>{fmt(total)}</div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="text-xs font-semibold text-emerald-500 uppercase tracking-wider mb-1">累計配息入帳</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">{fmt(totalIncome)}</div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="text-xs font-semibold text-indigo-500 uppercase tracking-wider mb-1">累計再買進</div>
          <div className="text-2xl font-bold text-indigo-600 mt-1">{fmt(totalReinvested)}</div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">記錄筆數</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{entries.length} 筆</div>
        </div>
      </div>

      {/* 依股票／基金分類小計 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">依類型小計</div>
          <div className="space-y-2">
            {(["STOCK", "FUND"] as AssetType[]).map((t) => (
              <div key={t} className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{TYPE_LABEL[t]}</span>
                <span className={`font-semibold ${(typeTotals[t] ?? 0) >= 0 ? "text-slate-900" : "text-red-500"}`}>
                  {fmt(typeTotals[t] ?? 0)}
                </span>
              </div>
            ))}
            {entries.length === 0 && <div className="text-sm text-slate-400">尚無記錄</div>}
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">依個股／基金小計</div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {nameTotalList.length === 0 ? (
              <div className="text-sm text-slate-400">尚無記錄</div>
            ) : (
              nameTotalList.map((n) => (
                <div key={`${n.type}__${n.name}`} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">
                    <span className="text-[10px] text-slate-400 mr-1.5">{TYPE_LABEL[n.type]}</span>
                    {n.name}{n.code ? ` (${n.code})` : ""}
                    {n.quantity > 0 && <span className="text-[11px] text-indigo-500 ml-1.5">滾存 {fmtQty(n.quantity)} 股</span>}
                  </span>
                  <span className={`font-semibold ${n.total >= 0 ? "text-slate-900" : "text-red-500"}`}>{fmt(n.total)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-50">
          <h2 className="font-semibold text-slate-900">配息記錄</h2>
          <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value as "" | AssetType); setPage(1); }}
            className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-600 focus:border-indigo-400 transition-colors">
            <option value="">全部類型</option>
            <option value="STOCK">股票</option>
            <option value="FUND">基金</option>
          </select>
        </div>
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm">載入中...</div>
        ) : entries.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-slate-400 text-sm mb-3">還沒有配息記錄</p>
            <button onClick={openAdd} className="text-sm text-indigo-600 font-medium hover:underline">新增第一筆記錄</button>
          </div>
        ) : sortedEntries.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-slate-400 text-sm mb-3">這個類型沒有符合的記錄</p>
            <button onClick={() => { setTypeFilter(""); setPage(1); }} className="text-sm text-indigo-600 font-medium hover:underline">清除篩選</button>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {pagedEntries.map((e) => (
              <div key={e.id} className="flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors group">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${e.amount >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-indigo-100 text-indigo-700"}`}>
                      {e.amount >= 0 ? "配息入帳" : "再買進"}
                    </span>
                    <span className="text-[10px] text-slate-400">{TYPE_LABEL[e.type]}</span>
                    <span className="text-sm font-medium text-slate-800">{e.name}</span>
                    {e.code && <span className="text-xs text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">{e.code}</span>}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {new Date(e.date ?? e.createdAt).toLocaleDateString("zh-TW")}
                    {e.quantity ? ` · ${fmtQty(e.quantity)} 股` : ""}
                    {e.price ? ` · @${fmtQty(e.price)}` : ""}
                    {e.fee ? ` · 手續費 ${fmt(e.fee)}` : ""}
                    {e.note ? ` · ${e.note}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`text-sm font-semibold ${e.amount >= 0 ? "text-emerald-600" : "text-indigo-600"}`}>
                    {e.amount >= 0 ? "+" : "-"}{fmt(Math.abs(e.amount))}
                  </span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEdit(e)} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 text-xs transition-colors">編輯</button>
                    <button onClick={() => handleDelete(e.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 text-xs transition-colors">刪除</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {!loading && sortedEntries.length > 0 && (
          <Pagination page={currentPage} pageCount={pageCount} totalCount={sortedEntries.length} onPageChange={setPage} />
        )}
      </div>

      {/* 新增記錄 Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-slate-900 mb-5">新增配息記錄</h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">類型</label>
                <div className="flex gap-2">
                  {(["STOCK", "FUND"] as AssetType[]).map((t) => (
                    <button key={t} type="button" onClick={() => setAddForm({ ...addForm, type: t, name: "" })}
                      className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${addForm.type === t ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                      {TYPE_LABEL[t]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">名稱</label>
                <Combobox
                  value={addForm.name}
                  onChange={(v) => setAddForm({ ...addForm, name: v })}
                  options={namesForType(addForm.type)}
                  placeholder="例如：台積電、元大高股息"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">代碼（選填）</label>
                <input value={addForm.code} onChange={(e) => setAddForm({ ...addForm, code: e.target.value })}
                  placeholder="例如：2330、00878"
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">交易類型</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setAddForm({ ...addForm, flowType: "INCOME" })}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${addForm.flowType === "INCOME" ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                    配息入帳（增加）
                  </button>
                  <button type="button" onClick={() => setAddForm({ ...addForm, flowType: "REINVEST" })}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${addForm.flowType === "REINVEST" ? "bg-indigo-500 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                    再買進（減少）
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
                  onChange={(e) => setAddForm({ ...addForm, amount: e.target.value })} placeholder="例如：5000"
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>

              {isReinvest && (
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">股數（選填）</label>
                    <input type="number" min="0" step="any" value={addForm.quantity}
                      onChange={(e) => setAddForm({ ...addForm, quantity: e.target.value })} placeholder="100"
                      className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">成交價（選填）</label>
                    <input type="number" min="0" step="any" value={addForm.price}
                      onChange={(e) => setAddForm({ ...addForm, price: e.target.value })} placeholder="例如：35"
                      className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">手續費（選填）</label>
                    <input type="number" min="0" step="any" value={addForm.fee}
                      onChange={(e) => setAddForm({ ...addForm, fee: e.target.value })} placeholder="例如：20"
                      className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                  </div>
                </div>
              )}

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
            <h2 className="text-lg font-bold text-slate-900 mb-5">編輯配息記錄</h2>
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">類型</label>
                <div className="flex gap-2">
                  {(["STOCK", "FUND"] as AssetType[]).map((t) => (
                    <button key={t} type="button" onClick={() => setEditForm({ ...editForm, type: t })}
                      className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${editForm.type === t ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                      {TYPE_LABEL[t]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">名稱</label>
                <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">代碼（選填）</label>
                <input value={editForm.code} onChange={(e) => setEditForm({ ...editForm, code: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">日期</label>
                <input type="date" value={editForm.date} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">金額</label>
                <input required type="number" step="any" value={editForm.amount}
                  onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                <p className="text-[11px] text-slate-400 mt-1">正數＝配息入帳（增加），負數＝再買進（減少）</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">股數（選填）</label>
                  <input type="number" step="any" value={editForm.quantity}
                    onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">成交價（選填）</label>
                  <input type="number" step="any" value={editForm.price}
                    onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">手續費（選填）</label>
                  <input type="number" step="any" value={editForm.fee}
                    onChange={(e) => setEditForm({ ...editForm, fee: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                </div>
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
