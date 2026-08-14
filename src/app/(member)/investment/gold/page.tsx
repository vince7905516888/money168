"use client";

import { useEffect, useState, useCallback } from "react";

interface Investment {
  id: string;
  type: "GOLD";
  name?: string;
  code?: string;
  amount: number;
  quantity?: number;
  price?: number;
  bankName?: string;
  action: "BUY" | "SELL";
  date: string;
  fee?: number;
  note?: string;
  transactionId?: string;
  createdAt: string;
}

interface UserBank {
  id: string;
  name: string;
}

const DEFAULT_BANKS = [
  "台灣銀行", "合作金庫", "第一銀行", "華南銀行", "彰化銀行",
  "兆豐銀行", "土地銀行", "國泰世華", "玉山銀行", "中國信託",
  "台北富邦", "永豐銀行", "台新銀行", "遠東銀行", "上海商銀",
  "星展銀行", "渣打銀行", "中華郵政", "六福銀樓", "金隆盛銀樓",
];

const EMPTY_ADD_FORM = {
  name: "",
  code: "",
  date: new Date().toISOString().split("T")[0],
  action: "BUY" as "BUY" | "SELL",
  bankName: "",
  quantity: "",
  price: "",
  fee: "",
  override: "",
  note: "",
};

export default function GoldPage() {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_ADD_FORM);
  const [addSaving, setAddSaving] = useState(false);

  const [editing, setEditing] = useState<Investment | null>(null);
  const [editForm, setEditForm] = useState({ name: "", code: "", date: "", action: "BUY" as "BUY" | "SELL", bankName: "", quantity: "", amount: "", note: "" });
  const [saving, setSaving] = useState(false);

  const [userBanks, setUserBanks] = useState<UserBank[]>([]);
  const [addBankInput, setAddBankInput] = useState("");
  const [addBankOpen, setAddBankOpen] = useState(false);
  const [addBankLoading, setAddBankLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [invRes, bankRes] = await Promise.all([
      fetch("/api/investments?type=GOLD"),
      fetch("/api/user-banks"),
    ]);
    const [invData, bankData] = await Promise.all([invRes.json(), bankRes.json()]);
    setInvestments(Array.isArray(invData) ? invData : []);
    setUserBanks(Array.isArray(bankData) ? bankData : []);
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

  // 淨投入金額：買進為正、賣出為負（賣出淨額會抵銷買進金額）
  const netInvested = investments.reduce((s, i) => s + i.amount, 0);
  const buyCount = investments.filter((i) => i.action === "BUY").length;
  const sellCount = investments.filter((i) => i.action === "SELL").length;

  // 依名稱分組統計：同一個名稱（優先用代碼判斷，trim 後比對）的買賣筆數與累計淨額
  const nameGroups = investments.reduce((acc, i) => {
    const name = i.name?.trim() || "(未命名)";
    const code = i.code?.trim() || undefined;
    const key = code || name;
    if (!acc[key]) acc[key] = { name, code, count: 0, amount: 0 };
    acc[key].count += 1;
    acc[key].amount += i.amount;
    return acc;
  }, {} as Record<string, { name: string; code?: string; count: number; amount: number }>);
  const nameGroupList = Object.values(nameGroups);

  // ---- 新增表單：即時試算 ----
  const quantity = parseFloat(addForm.quantity) || 0;
  const price = parseFloat(addForm.price) || 0;
  const fee = parseFloat(addForm.fee) || 0;
  const principal = quantity * price;
  const calcSubtotal = addForm.action === "BUY" ? principal + fee : principal - fee;
  // 實際金額：如果填了就以此為準（銀樓/銀行實際扣款金額可能與試算有落差），否則採自動試算結果
  const subtotal = addForm.override !== "" ? (parseFloat(addForm.override) || 0) : calcSubtotal;

  const resetAddForm = () => {
    setAddForm(EMPTY_ADD_FORM);
    setAddBankInput("");
    setAddBankOpen(false);
  };

  const openAdd = () => { resetAddForm(); setShowAddModal(true); };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (quantity <= 0 || price <= 0) {
      alert("請填寫重量與單價");
      return;
    }
    setAddSaving(true);
    const res = await fetch("/api/investments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "GOLD",
        name: addForm.name,
        code: addForm.code,
        date: addForm.date,
        action: addForm.action,
        bankName: addForm.bankName,
        quantity: addForm.quantity,
        price: addForm.price,
        fee: addForm.fee || undefined,
        amount: addForm.action === "SELL" ? -subtotal : subtotal,
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

  const openEdit = (inv: Investment) => {
    setEditing(inv);
    setEditForm({
      name: inv.name ?? "",
      code: inv.code ?? "",
      date: inv.date ? inv.date.split("T")[0] : "",
      action: inv.action,
      bankName: inv.bankName ?? "",
      quantity: inv.quantity ? String(inv.quantity) : "",
      amount: String(inv.amount),
      note: inv.note ?? "",
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    const res = await fetch(`/api/investments/${editing.id}`, {
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
    if (!confirm("確定要刪除這筆投資記錄？")) return;
    await fetch(`/api/investments/${id}`, { method: "DELETE" });
    fetchAll();
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">黃金投資</h1>
          <p className="text-slate-500 text-sm mt-1">管理你的黃金投資記錄</p>
        </div>
        <button onClick={openAdd}
          className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors">
          + 新增記錄
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">淨投入金額</div>
          <div className={`text-2xl font-bold mt-1 ${netInvested >= 0 ? "text-slate-900" : "text-red-500"}`}>{fmt(netInvested)}</div>
          <div className="text-xs text-slate-400 mt-0.5">買進金額 − 賣出淨額</div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="text-xs font-semibold text-emerald-500 uppercase tracking-wider mb-1">買進筆數</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{buyCount} 筆</div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-1">賣出筆數</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{sellCount} 筆</div>
        </div>
      </div>

      {/* 依名稱分組統計 */}
      {nameGroupList.length > 0 && (
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm mb-8">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">依名稱統計</div>
          <div className="divide-y divide-slate-50">
            {nameGroupList.map((g) => (
              <div key={g.code || g.name} className="flex items-center justify-between py-2 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-slate-700 truncate">{g.name}</span>
                  {g.code && <span className="text-xs text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded shrink-0">{g.code}</span>}
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <span className="text-xs text-slate-400">{g.count} 筆</span>
                  <span className={`font-semibold ${g.amount >= 0 ? "text-slate-900" : "text-red-500"}`}>{fmt(g.amount)}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between pt-3 mt-1 border-t border-slate-200 text-sm">
            <span className="font-semibold text-slate-900">合計（{nameGroupList.length} 項）</span>
            <div className="flex items-center gap-4">
              <span className="text-xs text-slate-400">{investments.length} 筆</span>
              <span className={`font-bold ${netInvested >= 0 ? "text-slate-900" : "text-red-500"}`}>{fmt(netInvested)}</span>
            </div>
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
            <p className="text-slate-400 text-sm mb-3">還沒有黃金投資記錄</p>
            <button onClick={openAdd} className="text-sm text-indigo-600 font-medium hover:underline">新增第一筆記錄</button>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {investments.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors group">
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    inv.action === "BUY" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                  }`}>
                    {inv.action === "BUY" ? "買進" : "賣出"}
                  </span>
                  <div>
                    <div className="text-sm font-medium text-slate-800">
                      {inv.name || "(未命名)"}
                      {inv.code && <span className="ml-2 text-xs text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">{inv.code}</span>}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {new Date(inv.date ?? inv.createdAt).toLocaleDateString("zh-TW")}
                      {inv.bankName ? ` · ${inv.bankName}` : ""}
                      {inv.quantity ? ` · ${fmt2(inv.quantity)} 公克` : ""}
                      {inv.price ? ` · @${fmt2(inv.price)}` : ""}
                      {inv.fee ? ` · 手續費 ${fmt(inv.fee)}` : ""}
                      {inv.note ? ` · ${inv.note}` : ""}
                      {inv.transactionId && <span className="ml-1 text-indigo-400">· 已連結支出</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`text-sm font-semibold ${inv.amount >= 0 ? "text-slate-700" : "text-red-500"}`}>
                    {fmt(Math.abs(inv.amount))}
                  </span>
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
            <h2 className="text-lg font-bold text-slate-900 mb-5">新增黃金記錄</h2>
            <form onSubmit={handleAdd} className="space-y-4">
              {/* 買進/賣出 */}
              <div className="flex gap-2">
                {(["BUY", "SELL"] as const).map((a) => (
                  <button key={a} type="button" onClick={() => setAddForm({ ...addForm, action: a })}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      addForm.action === a
                        ? a === "BUY" ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    }`}>
                    {a === "BUY" ? "買進" : "賣出"}
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">交易日期</label>
                <input required type="date" value={addForm.date}
                  onChange={(e) => setAddForm({ ...addForm, date: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">銀行／銀樓（選填）</label>
                <input
                  type="text"
                  list="goldbanklist"
                  value={addForm.bankName}
                  onChange={(e) => setAddForm({ ...addForm, bankName: e.target.value })}
                  placeholder="搜尋或選擇銀行／銀樓"
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors"
                />
                <datalist id="goldbanklist">
                  {allBanks.map((b) => <option key={b} value={b} />)}
                </datalist>
                {addBankOpen ? (
                  <div className="flex gap-2 mt-2">
                    <input value={addBankInput} onChange={(e) => setAddBankInput(e.target.value)}
                      placeholder="輸入名稱"
                      className="flex-1 border border-indigo-300 rounded-lg px-3 py-2 text-sm focus:border-indigo-400" />
                    <button type="button" onClick={handleAddBank} disabled={addBankLoading}
                      className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60">
                      {addBankLoading ? "..." : "新增"}
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setAddBankOpen(true)}
                    className="mt-1.5 text-xs text-indigo-500 hover:text-indigo-700 hover:underline">
                    + 找不到？申請新增
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">名稱（選填）</label>
                  <input value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                    placeholder="例如：黃金存摺" className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">代碼（選填）</label>
                  <input value={addForm.code} onChange={(e) => setAddForm({ ...addForm, code: e.target.value })}
                    placeholder="例如：條塊編號" className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">重量（公克）</label>
                  <input required type="number" min="0" step="any" value={addForm.quantity}
                    onChange={(e) => setAddForm({ ...addForm, quantity: e.target.value })} placeholder="例如：5"
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">單價（每公克）</label>
                  <input required type="number" min="0" step="any" value={addForm.price}
                    onChange={(e) => setAddForm({ ...addForm, price: e.target.value })} placeholder="例如：2800"
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">手續費（選填）</label>
                <input type="number" min="0" step="any" value={addForm.fee}
                  onChange={(e) => setAddForm({ ...addForm, fee: e.target.value })} placeholder="例如：100"
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">備註（選填）</label>
                <input value={addForm.note} onChange={(e) => setAddForm({ ...addForm, note: e.target.value })}
                  placeholder="備註..." className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">實際金額（選填）</label>
                <input type="number" min="0" step="any" value={addForm.override}
                  onChange={(e) => setAddForm({ ...addForm, override: e.target.value })}
                  placeholder={`試算為 ${fmt(calcSubtotal)}，如與實際金額不同可在此輸入覆蓋`}
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                <p className="text-[11px] text-slate-400 mt-1">留空則採用下方自動試算的小計；填寫後將以此金額為準</p>
              </div>

              {/* 試算小計 */}
              <div className="bg-slate-50 rounded-xl px-4 py-3 space-y-1.5">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>成交金額</span><span>{fmt(principal)}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>手續費</span><span>{fmt(fee)}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>自動試算小計</span><span>{fmt(calcSubtotal)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold text-slate-900 pt-1.5 border-t border-slate-200">
                  <span>{addForm.action === "BUY" ? "最終小計（應付）" : "最終小計（應收）"}</span>
                  <span>{fmt(subtotal)}{addForm.override !== "" && <span className="text-[10px] font-normal text-indigo-500 ml-1">（已調整）</span>}</span>
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-slate-900 mb-5">編輯黃金記錄</h2>
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="flex gap-2">
                {(["BUY", "SELL"] as const).map((a) => (
                  <button key={a} type="button" onClick={() => setEditForm({ ...editForm, action: a })}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      editForm.action === a
                        ? a === "BUY" ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    }`}>
                    {a === "BUY" ? "買進" : "賣出"}
                  </button>
                ))}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">交易日期</label>
                <input type="date" value={editForm.date} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">銀行／銀樓（選填）</label>
                <input
                  type="text"
                  list="goldbanklist-edit"
                  value={editForm.bankName}
                  onChange={(e) => setEditForm({ ...editForm, bankName: e.target.value })}
                  placeholder="搜尋或選擇銀行／銀樓"
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors"
                />
                <datalist id="goldbanklist-edit">
                  {allBanks.map((b) => <option key={b} value={b} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">名稱（選填）</label>
                <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="例如：黃金存摺" className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">代碼（選填）</label>
                <input value={editForm.code} onChange={(e) => setEditForm({ ...editForm, code: e.target.value })}
                  placeholder="例如：條塊編號" className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">重量（選填，公克）</label>
                <input type="number" step="any" value={editForm.quantity}
                  onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })} placeholder="例如：5"
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">投入金額</label>
                <input required type="number" step="any" value={editForm.amount}
                  onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })} placeholder="例如：14000"
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                <p className="text-[11px] text-slate-400 mt-1">因手續費／進位導致與實際金額有落差時，可直接在此修正（賣出記錄請填負數）</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">備註（選填）</label>
                <input value={editForm.note} onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
                  placeholder="備註..." className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>
              <p className="text-[11px] text-slate-400">單價、手續費如需調整，請刪除後重新新增以確保試算正確</p>
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
