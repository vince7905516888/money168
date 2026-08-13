"use client";

import { useEffect, useState, useCallback } from "react";

interface Investment {
  id: string;
  type: "FUND";
  name?: string;
  code?: string;
  amount: number;
  quantity?: number;
  price?: number;
  bankName?: string;
  currency?: string;
  exchangeRate?: number;
  date: string;
  note?: string;
  transactionId?: string;
  createdAt: string;
}

interface UserBank {
  id: string;
  name: string;
}

interface ForexInvestment {
  id: string;
  name?: string;
  quantity?: number;
  fee?: number;
  currency?: string;
}

const DEFAULT_BANKS = [
  "台灣銀行", "合作金庫", "第一銀行", "華南銀行", "彰化銀行",
  "兆豐銀行", "土地銀行", "國泰世華", "玉山銀行", "中國信託",
  "台北富邦", "永豐銀行", "台新銀行", "遠東銀行", "上海商銀",
  "星展銀行", "渣打銀行", "中華郵政",
];

const CURRENCIES = ["TWD", "USD", "JPY", "EUR", "GBP", "AUD", "CNY", "HKD", "CAD", "NZD", "SGD", "ZAR", "CHF", "THB"];

const EMPTY_ADD_FORM = {
  date: new Date().toISOString().split("T")[0],
  bankName: "",
  currency: "TWD",
  currencyOther: "",
  name: "",
  code: "",
  price: "",
  quantity: "",
  exchangeRate: "1",
  note: "",
};

export default function FundPage() {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [forexAdjustments, setForexAdjustments] = useState<ForexInvestment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_ADD_FORM);
  const [addSaving, setAddSaving] = useState(false);

  const [editing, setEditing] = useState<Investment | null>(null);
  const [editForm, setEditForm] = useState({ name: "", code: "", date: "", bankName: "", currency: "", quantity: "", note: "" });
  const [saving, setSaving] = useState(false);

  const [userBanks, setUserBanks] = useState<UserBank[]>([]);
  const [addBankInput, setAddBankInput] = useState("");
  const [addBankOpen, setAddBankOpen] = useState(false);
  const [addBankLoading, setAddBankLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [invRes, bankRes, forexRes] = await Promise.all([
      fetch("/api/investments?type=FUND"),
      fetch("/api/user-banks"),
      fetch("/api/investments?type=FOREX"),
    ]);
    const [invData, bankData, forexData] = await Promise.all([invRes.json(), bankRes.json(), forexRes.json()]);
    setInvestments(Array.isArray(invData) ? invData : []);
    setUserBanks(Array.isArray(bankData) ? bankData : []);
    setForexAdjustments(Array.isArray(forexData) ? forexData.filter((i: ForexInvestment) => i.name === "調帳") : []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const allBanks = [...DEFAULT_BANKS, ...userBanks.map((b) => b.name)];

  const handleAddBank = async () => {
    if (!addBankInput.trim()) return;
    setAddBankLoading(true);
    const res = await fetch("/api/user-banks", {
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
  const fmt2 = (n: number) => new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 }).format(n);

  const total = investments.reduce((s, i) => s + i.amount, 0);

  // 各幣別投入基金總額：本頁自己新增的基金記錄（淨值×單位數，以基金原幣計）
  // ＋ 外匯投資頁「調帳」轉入的金額（不含手續費），依幣別加總同步過來
  const currencyInvestedTotals: Record<string, number> = {};
  for (const i of investments) {
    if (i.currency && i.price && i.quantity) {
      currencyInvestedTotals[i.currency] = (currencyInvestedTotals[i.currency] || 0) + i.price * i.quantity;
    }
  }
  for (const i of forexAdjustments) {
    if (i.currency) {
      const principal = -(i.quantity || 0) - (i.fee || 0);
      currencyInvestedTotals[i.currency] = (currencyInvestedTotals[i.currency] || 0) + principal;
    }
  }

  // ---- 新增表單：即時試算 ----
  const nav = parseFloat(addForm.price) || 0;
  const units = parseFloat(addForm.quantity) || 0;
  const exchangeRate = parseFloat(addForm.exchangeRate) || 0;
  const fundAmount = nav * units;
  const twdAmount = fundAmount * exchangeRate;
  const currencyLabel = addForm.currency === "其他" ? (addForm.currencyOther || "其他") : addForm.currency;

  const resetAddForm = () => {
    setAddForm(EMPTY_ADD_FORM);
    setAddBankInput("");
    setAddBankOpen(false);
  };

  const openAdd = () => { resetAddForm(); setShowAddModal(true); };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nav <= 0 || units <= 0) {
      alert("請填寫淨值與單位數");
      return;
    }
    setAddSaving(true);
    await fetch("/api/investments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "FUND",
        name: addForm.name,
        code: addForm.code,
        date: addForm.date,
        bankName: addForm.bankName,
        currency: currencyLabel,
        exchangeRate: addForm.exchangeRate,
        price: addForm.price,
        quantity: addForm.quantity,
        amount: twdAmount,
        note: addForm.note,
      }),
    });
    setAddSaving(false);
    setShowAddModal(false);
    fetchAll();
  };

  const openEdit = (inv: Investment) => {
    setEditing(inv);
    setEditForm({
      name: inv.name ?? "",
      code: inv.code ?? "",
      date: inv.date ? inv.date.split("T")[0] : "",
      bankName: inv.bankName ?? "",
      currency: inv.currency ?? "",
      quantity: inv.quantity ? String(inv.quantity) : "",
      note: inv.note ?? "",
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    await fetch(`/api/investments/${editing.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    setSaving(false);
    setEditing(null);
    fetchAll();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("確定要刪除這筆投資記錄？")) return;
    await fetch(`/api/investments/${id}`, { method: "DELETE" });
    fetchAll();
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">基金投資</h1>
          <p className="text-slate-500 text-sm mt-1">管理你的基金投資記錄</p>
        </div>
        <button onClick={openAdd}
          className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors">
          + 新增記錄
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">總投入金額</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{fmt(total)}</div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">投資筆數</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{investments.length} 筆</div>
        </div>
      </div>

      {/* 各幣別投入基金總額（含外匯調帳同步） */}
      {Object.keys(currencyInvestedTotals).length > 0 && (
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm mb-8">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">各幣別投入基金總額（含外匯調帳轉入）</div>
          <div className="space-y-2">
            {Object.entries(currencyInvestedTotals).map(([currency, amount]) => (
              <div key={currency} className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{currency}</span>
                <span className="font-semibold text-slate-900">{fmt2(amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* List */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-50">
          <h2 className="font-semibold text-slate-900">投資記錄</h2>
        </div>
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm">載入中...</div>
        ) : investments.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-slate-400 text-sm mb-3">還沒有基金投資記錄</p>
            <button onClick={openAdd} className="text-sm text-indigo-600 font-medium hover:underline">新增第一筆記錄</button>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {investments.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors group">
                <div>
                  <div className="text-sm font-medium text-slate-800">
                    {inv.name || "(未命名)"}
                    {inv.code && <span className="ml-2 text-xs text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">{inv.code}</span>}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {new Date(inv.date ?? inv.createdAt).toLocaleDateString("zh-TW")}
                    {inv.bankName ? ` · ${inv.bankName}` : ""}
                    {inv.currency ? ` · ${inv.currency}` : ""}
                    {inv.price ? ` · 淨值 ${inv.price}` : ""}
                    {inv.quantity ? ` · ${inv.quantity} 單位` : ""}
                    {inv.exchangeRate ? ` · 匯率 ${inv.exchangeRate}` : ""}
                    {inv.note ? ` · ${inv.note}` : ""}
                    {inv.transactionId && <span className="ml-1 text-indigo-400">· 已連結支出</span>}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-semibold text-slate-700">{fmt(inv.amount)}</span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEdit(inv)} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 text-xs transition-colors">編輯</button>
                    <button onClick={() => handleDelete(inv.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 text-xs transition-colors">刪除</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 新增記錄 Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-slate-900 mb-5">新增基金記錄</h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">申購日期</label>
                <input required type="date" value={addForm.date}
                  onChange={(e) => setAddForm({ ...addForm, date: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">銀行別名</label>
                  <input
                    type="text"
                    list="fundbanklist"
                    value={addForm.bankName}
                    onChange={(e) => setAddForm({ ...addForm, bankName: e.target.value })}
                    placeholder="搜尋或選擇銀行"
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors"
                  />
                  <datalist id="fundbanklist">
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
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">幣別</label>
                  <select value={addForm.currency} onChange={(e) => setAddForm({ ...addForm, currency: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors">
                    {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    <option value="其他">其他</option>
                  </select>
                  {addForm.currency === "其他" && (
                    <input value={addForm.currencyOther} onChange={(e) => setAddForm({ ...addForm, currencyOther: e.target.value })}
                      placeholder="輸入幣別代碼，例如 CHF"
                      className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors mt-2" />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">基金名稱</label>
                  <input value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                    placeholder="例如：富達環球高收益基金" className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">基金代碼</label>
                  <input value={addForm.code} onChange={(e) => setAddForm({ ...addForm, code: e.target.value })}
                    placeholder="例如：LU0068578508" className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">淨值</label>
                  <input required type="number" min="0" step="any" value={addForm.price}
                    onChange={(e) => setAddForm({ ...addForm, price: e.target.value })} placeholder="例如：10.5"
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">單位數</label>
                  <input required type="number" min="0" step="any" value={addForm.quantity}
                    onChange={(e) => setAddForm({ ...addForm, quantity: e.target.value })} placeholder="例如：1000"
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">匯率</label>
                  <input required type="number" min="0" step="any" value={addForm.exchangeRate}
                    onChange={(e) => setAddForm({ ...addForm, exchangeRate: e.target.value })} placeholder="例如：31.5"
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">備註（選填）</label>
                <input value={addForm.note} onChange={(e) => setAddForm({ ...addForm, note: e.target.value })}
                  placeholder="備註..." className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>

              {/* 試算小計 */}
              <div className="bg-slate-50 rounded-xl px-4 py-3 space-y-1.5">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>基金金額（{currencyLabel}）</span><span>{new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 }).format(fundAmount)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold text-slate-900 pt-1.5 border-t border-slate-200">
                  <span>小計（換算台幣）</span>
                  <span>{fmt(twdAmount)}</span>
                </div>
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
            <h2 className="text-lg font-bold text-slate-900 mb-5">編輯基金記錄</h2>
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">申購日期</label>
                <input type="date" value={editForm.date} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">銀行別名</label>
                <input
                  type="text"
                  list="fundbanklist-edit"
                  value={editForm.bankName}
                  onChange={(e) => setEditForm({ ...editForm, bankName: e.target.value })}
                  placeholder="搜尋或選擇銀行"
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors"
                />
                <datalist id="fundbanklist-edit">
                  {allBanks.map((b) => <option key={b} value={b} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">幣別</label>
                <select value={editForm.currency} onChange={(e) => setEditForm({ ...editForm, currency: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors">
                  <option value="">未設定</option>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  {editForm.currency && !CURRENCIES.includes(editForm.currency) && (
                    <option value={editForm.currency}>{editForm.currency}</option>
                  )}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">基金名稱（選填）</label>
                <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="例如：富達環球高收益基金" className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">基金代碼（選填）</label>
                <input value={editForm.code} onChange={(e) => setEditForm({ ...editForm, code: e.target.value })}
                  placeholder="例如：LU0068578508" className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">單位數（選填）</label>
                <input type="number" step="any" value={editForm.quantity}
                  onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })} placeholder="例如：1000"
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">備註（選填）</label>
                <input value={editForm.note} onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
                  placeholder="備註..." className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>
              <p className="text-[11px] text-slate-400">金額、淨值、匯率如需調整，請刪除後重新新增以確保試算正確</p>
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
