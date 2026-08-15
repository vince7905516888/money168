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

interface UserFund {
  id: string;
  name: string;
}

const DEFAULT_BANKS = [
  "台灣銀行", "合作金庫", "第一銀行", "華南銀行", "彰化銀行",
  "兆豐銀行", "土地銀行", "國泰世華", "玉山銀行", "中國信託",
  "台北富邦", "永豐銀行", "台新銀行", "遠東銀行", "上海商銀",
  "星展銀行", "渣打銀行", "中華郵政",
];

const CURRENCIES = ["TWD", "USD", "JPY", "EUR", "GBP", "AUD", "CNY", "HKD", "CAD", "NZD", "SGD", "ZAR", "CHF", "THB"];

type FundFlowType = "INCOME" | "EXPENSE";

const EMPTY_ADD_FORM = {
  flowType: "INCOME" as FundFlowType,
  date: new Date().toISOString().split("T")[0],
  bankName: "",
  currency: "TWD",
  currencyOther: "",
  name: "",
  code: "",
  price: "",
  quantity: "",
  override: "",
  note: "",
};

export default function FundPage() {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_ADD_FORM);
  const [addSaving, setAddSaving] = useState(false);

  const [editing, setEditing] = useState<Investment | null>(null);
  const [editForm, setEditForm] = useState({ name: "", code: "", date: "", bankName: "", currency: "", quantity: "", amount: "", note: "" });
  const [saving, setSaving] = useState(false);

  const [userBanks, setUserBanks] = useState<UserBank[]>([]);
  const [addBankInput, setAddBankInput] = useState("");
  const [addBankOpen, setAddBankOpen] = useState(false);
  const [addBankLoading, setAddBankLoading] = useState(false);

  const [userFunds, setUserFunds] = useState<UserFund[]>([]);
  const [addFundNameInput, setAddFundNameInput] = useState("");
  const [addFundNameOpen, setAddFundNameOpen] = useState(false);
  const [addFundNameLoading, setAddFundNameLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [invRes, bankRes, fundNameRes] = await Promise.all([
      fetch("/api/investments?type=FUND"),
      fetch("/api/user-banks"),
      fetch("/api/user-funds"),
    ]);
    const [invData, bankData, fundNameData] = await Promise.all([invRes.json(), bankRes.json(), fundNameRes.json()]);
    setInvestments(Array.isArray(invData) ? invData : []);
    setUserBanks(Array.isArray(bankData) ? bankData : []);
    setUserFunds(Array.isArray(fundNameData) ? fundNameData : []);
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

  const handleAddFundName = async () => {
    if (!addFundNameInput.trim()) return;
    setAddFundNameLoading(true);
    const res = await fetch("/api/user-funds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: addFundNameInput.trim() }),
    });
    setAddFundNameLoading(false);
    if (res.ok) {
      const fund = await res.json();
      setUserFunds((prev) => [...prev, fund]);
      setAddForm((f) => ({ ...f, name: fund.name }));
      setAddFundNameInput("");
      setAddFundNameOpen(false);
    }
  };

  const handleDeleteFundName = async (id: string) => {
    if (!confirm("確定要刪除這個基金名稱？(不會刪除已經新增的投資記錄)")) return;
    await fetch(`/api/user-funds/${id}`, { method: "DELETE" });
    setUserFunds((prev) => prev.filter((f) => f.id !== id));
  };

  const fmt = (n: number) =>
    new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(n);
  const fmt2 = (n: number) => new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 }).format(n);

  const total = investments.reduce((s, i) => s + i.amount, 0);

  // 基金投資紀錄：依「檔」（同一產品，以代碼或名稱識別）分組，統計每檔基金買進的筆數與累計金額（台幣）
  // 先 trim 掉前後空白再比對，避免手動輸入時多打的空格讓同一檔基金被拆成兩組
  const fundGroups = investments.reduce((acc, i) => {
    const name = i.name?.trim() || "(未命名)";
    const code = i.code?.trim() || undefined;
    const key = code || name;
    if (!acc[key]) acc[key] = { name, code, count: 0, amount: 0 };
    acc[key].count += 1;
    acc[key].amount += i.amount;
    return acc;
  }, {} as Record<string, { name: string; code?: string; count: number; amount: number }>);
  const fundGroupList = Object.values(fundGroups);

  // ---- 新增表單：即時試算 ----
  const nav = parseFloat(addForm.price) || 0;
  const units = parseFloat(addForm.quantity) || 0;
  const fundAmount = nav * units;
  // 實際投入金額：淨值×單位數的試算結果常因匯率／進位而與銀行實際扣款金額有落差，填了就以此為準
  const finalFundAmount = addForm.override !== "" ? (parseFloat(addForm.override) || 0) : fundAmount;
  const currencyLabel = addForm.currency === "其他" ? (addForm.currencyOther || "其他") : addForm.currency;
  const isExpense = addForm.flowType === "EXPENSE";

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
        price: addForm.price,
        quantity: isExpense ? -units : units,
        amount: isExpense ? -finalFundAmount : finalFundAmount,
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
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">淨投入金額</div>
          <div className={`text-2xl font-bold mt-1 ${total >= 0 ? "text-slate-900" : "text-red-500"}`}>{fmt(total)}</div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">投資筆數</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{investments.length} 筆</div>
        </div>
      </div>

      {/* 基金投資紀錄：依產品（檔）分組統計 */}
      {fundGroupList.length > 0 && (
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm mb-8">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">基金投資紀錄</div>
          <div className="divide-y divide-slate-50">
            {fundGroupList.map((g) => (
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
            <span className="font-semibold text-slate-900">合計（{fundGroupList.length} 檔）</span>
            <div className="flex items-center gap-4">
              <span className="text-xs text-slate-400">{investments.length} 筆</span>
              <span className={`font-bold ${total >= 0 ? "text-slate-900" : "text-red-500"}`}>{fmt(total)}</span>
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
            <p className="text-slate-400 text-sm mb-3">還沒有基金投資記錄</p>
            <button onClick={openAdd} className="text-sm text-indigo-600 font-medium hover:underline">新增第一筆記錄</button>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {investments.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors group">
                <div>
                  <div className="text-sm font-medium text-slate-800 flex items-center gap-2">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${inv.amount >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                      {inv.amount >= 0 ? "申購" : "贖回"}
                    </span>
                    {inv.name || "(未命名)"}
                    {inv.code && <span className="ml-1 text-xs text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">{inv.code}</span>}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {new Date(inv.date ?? inv.createdAt).toLocaleDateString("zh-TW")}
                    {inv.bankName ? ` · ${inv.bankName}` : ""}
                    {inv.currency ? ` · ${inv.currency}` : ""}
                    {inv.price ? ` · 淨值 ${inv.price}` : ""}
                    {inv.quantity ? ` · ${Math.abs(inv.quantity)} 單位` : ""}
                    {inv.exchangeRate ? ` · 匯率 ${inv.exchangeRate}` : ""}
                    {inv.note ? ` · ${inv.note}` : ""}
                    {inv.transactionId && <span className="ml-1 text-indigo-400">· 已連結支出</span>}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`text-sm font-semibold ${inv.amount >= 0 ? "text-slate-700" : "text-red-500"}`}>
                    {inv.amount < 0 ? "-" : ""}{fmt(Math.abs(inv.amount))}
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
            <h2 className="text-lg font-bold text-slate-900 mb-5">新增基金記錄</h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">交易類型</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setAddForm({ ...addForm, flowType: "INCOME" })}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${addForm.flowType === "INCOME" ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                    收入（申購）
                  </button>
                  <button type="button" onClick={() => setAddForm({ ...addForm, flowType: "EXPENSE" })}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${addForm.flowType === "EXPENSE" ? "bg-red-500 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                    支出（贖回）
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{isExpense ? "贖回日期" : "申購日期"}</label>
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

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">基金名稱</label>
                <input
                  type="text"
                  list="fundnamelist"
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  placeholder="搜尋或選擇基金，例如：富達環球高收益基金"
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors"
                />
                <datalist id="fundnamelist">
                  {userFunds.map((f) => <option key={f.id} value={f.name} />)}
                </datalist>
                {addFundNameOpen ? (
                  <div className="flex gap-2 mt-2">
                    <input value={addFundNameInput} onChange={(e) => setAddFundNameInput(e.target.value)}
                      placeholder="輸入基金名稱"
                      className="flex-1 border border-indigo-300 rounded-lg px-3 py-2 text-sm focus:border-indigo-400" />
                    <button type="button" onClick={handleAddFundName} disabled={addFundNameLoading}
                      className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60">
                      {addFundNameLoading ? "..." : "新增"}
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setAddFundNameOpen(true)}
                    className="mt-1.5 text-xs text-indigo-500 hover:text-indigo-700 hover:underline">
                    + 找不到？新增基金名稱
                  </button>
                )}
                {userFunds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {userFunds.map((f) => (
                      <span key={f.id} className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs pl-2 pr-1 py-1 rounded-full">
                        <button type="button" onClick={() => setAddForm({ ...addForm, name: f.name })} className="hover:text-indigo-600">
                          {f.name}
                        </button>
                        <button type="button" onClick={() => handleDeleteFundName(f.id)}
                          className="text-slate-400 hover:text-red-500 leading-none w-4 h-4 flex items-center justify-center rounded-full hover:bg-red-50">
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">基金代碼</label>
                <input value={addForm.code} onChange={(e) => setAddForm({ ...addForm, code: e.target.value })}
                  placeholder="例如：LU0068578508" className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">{isExpense ? "贖回淨值" : "淨值"}</label>
                  <input required type="number" min="0" step="any" value={addForm.price}
                    onChange={(e) => setAddForm({ ...addForm, price: e.target.value })} placeholder="例如：10.5"
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">{isExpense ? "贖回單位數" : "單位數"}</label>
                  <input required type="number" min="0" step="any" value={addForm.quantity}
                    onChange={(e) => setAddForm({ ...addForm, quantity: e.target.value })} placeholder="例如：1000"
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">實際投入金額（選填）</label>
                <input type="number" min="0" step="any" value={addForm.override}
                  onChange={(e) => setAddForm({ ...addForm, override: e.target.value })}
                  placeholder={`試算為 ${fmt2(fundAmount)}，如與實際扣款/入帳金額不同可在此輸入覆蓋`}
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                <p className="text-[11px] text-slate-400 mt-1">留空則採用下方自動試算的金額；填寫後將以此金額為準</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">備註（選填）</label>
                <input value={addForm.note} onChange={(e) => setAddForm({ ...addForm, note: e.target.value })}
                  placeholder="備註..." className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>

              {/* 試算小計 */}
              <div className="bg-slate-50 rounded-xl px-4 py-3">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>自動試算金額</span><span>{fmt2(fundAmount)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold text-slate-900 pt-1.5 border-t border-slate-200 mt-1.5">
                  <span>{isExpense ? "贖回金額小計" : "基金金額小計"}（{currencyLabel}）</span>
                  <span className={isExpense ? "text-red-500" : "text-emerald-600"}>
                    {isExpense ? "-" : "+"}{fmt2(finalFundAmount)}
                    {addForm.override !== "" && <span className="text-[10px] font-normal text-indigo-500 ml-1">（已調整）</span>}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">匯率換算台幣的金額改在投資總覽頁統一處理</p>
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
                <label className="block text-sm font-medium text-slate-700 mb-1.5">投入金額</label>
                <input required type="number" step="any" value={editForm.amount}
                  onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })} placeholder="例如：50000"
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                <p className="text-[11px] text-slate-400 mt-1">因匯率／進位導致與實際扣款金額有落差時，可直接在此修正（贖回記錄請填負數）</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">備註（選填）</label>
                <input value={editForm.note} onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
                  placeholder="備註..." className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>
              <p className="text-[11px] text-slate-400">淨值如需調整，請刪除後重新新增以確保試算正確；投入金額可直接於上方修正</p>
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
