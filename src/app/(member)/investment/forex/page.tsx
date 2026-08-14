"use client";

import { useEffect, useState, useCallback } from "react";

interface Investment {
  id: string;
  type: "FOREX";
  name?: string;
  amount: number;
  quantity?: number;
  fee?: number;
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

type FlowType = "BUY" | "WITHDRAW" | "CONVERT_BACK" | "ADJUSTMENT" | "ADJUSTMENT_IN" | "INTEREST" | "OTHER_INCOME";

const FLOW_OPTIONS: { key: FlowType; label: string; badgeClass: string; activeClass: string }[] = [
  { key: "BUY", label: "買入外幣", badgeClass: "bg-indigo-100 text-indigo-700", activeClass: "bg-indigo-600 text-white" },
  { key: "WITHDRAW", label: "提款外幣", badgeClass: "bg-red-100 text-red-700", activeClass: "bg-red-500 text-white" },
  { key: "CONVERT_BACK", label: "換回台幣", badgeClass: "bg-red-100 text-red-700", activeClass: "bg-red-500 text-white" },
  { key: "ADJUSTMENT", label: "調帳", badgeClass: "bg-amber-100 text-amber-700", activeClass: "bg-amber-500 text-white" },
  { key: "INTEREST", label: "利息收入", badgeClass: "bg-emerald-100 text-emerald-700", activeClass: "bg-emerald-500 text-white" },
  { key: "OTHER_INCOME", label: "其他收入", badgeClass: "bg-emerald-100 text-emerald-700", activeClass: "bg-emerald-500 text-white" },
  { key: "ADJUSTMENT_IN", label: "調帳(轉入)", badgeClass: "bg-cyan-100 text-cyan-700", activeClass: "bg-cyan-500 text-white" },
];

// 支出／收入 兩大類別下的細項，依外幣餘額增減方向分類：會讓外幣餘額變多的算收入，變少的算支出
const EXPENSE_TYPES: FlowType[] = ["WITHDRAW", "CONVERT_BACK", "ADJUSTMENT"];
const INCOME_TYPES: FlowType[] = ["BUY", "INTEREST", "OTHER_INCOME", "ADJUSTMENT_IN"];

const flowMeta = (name?: string) => FLOW_OPTIONS.find((f) => f.label === name) ?? FLOW_OPTIONS[0];

const DEFAULT_BANKS = [
  "台灣銀行", "合作金庫", "第一銀行", "華南銀行", "彰化銀行",
  "兆豐銀行", "土地銀行", "國泰世華", "玉山銀行", "中國信託",
  "台北富邦", "永豐銀行", "台新銀行", "遠東銀行", "上海商銀",
  "星展銀行", "渣打銀行", "中華郵政",
];

const CURRENCIES = ["USD", "JPY", "EUR", "GBP", "AUD", "CNY", "HKD", "CAD", "NZD", "SGD", "ZAR", "CHF", "THB"];

const PAGE_SIZE = 20;

const EMPTY_ADD_FORM = {
  date: new Date().toISOString().split("T")[0],
  flowType: "BUY" as FlowType,
  bankName: "",
  currency: "USD",
  currencyOther: "",
  twdAmount: "",
  foreignAmount: "",
  exchangeRate: "",
  override: "",
  fee: "",
  note: "",
};

export default function ForexPage() {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_ADD_FORM);
  const [addSaving, setAddSaving] = useState(false);

  const [editing, setEditing] = useState<Investment | null>(null);
  const [editForm, setEditForm] = useState({ date: "", bankName: "", currency: "", note: "" });
  const [saving, setSaving] = useState(false);

  const [userBanks, setUserBanks] = useState<UserBank[]>([]);
  const [addBankInput, setAddBankInput] = useState("");
  const [addBankOpen, setAddBankOpen] = useState(false);
  const [addBankLoading, setAddBankLoading] = useState(false);

  const [page, setPage] = useState(1);
  const [filterType, setFilterType] = useState<FlowType | "">("");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [invRes, bankRes] = await Promise.all([
      fetch("/api/investments?type=FOREX"),
      fetch("/api/user-banks"),
    ]);
    const [invData, bankData] = await Promise.all([invRes.json(), bankRes.json()]);
    setInvestments(Array.isArray(invData) ? invData : []);
    setUserBanks(Array.isArray(bankData) ? bankData : []);
    setPage(1);
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

  const currencyTotals = investments.reduce((acc, i) => {
    const key = i.currency || "未指定幣別";
    acc[key] = (acc[key] || 0) + (i.quantity || 0);
    return acc;
  }, {} as Record<string, number>);

  // 各幣別總投入＋利息：買入外幣、利息收入、其他收入、調帳(轉入) 這幾種「流入」的外幣數量加總，
  // 不扣除提款外幣／換回台幣／調帳(轉出)等流出，代表累計投入成本的部位大小（非目前剩餘餘額）。
  const currencyInflowTotals = investments.reduce((acc, i) => {
    if (!i.currency) return acc;
    const label = flowMeta(i.name).label;
    if (label === "買入外幣" || label === "利息收入" || label === "其他收入" || label === "調帳(轉入)") {
      acc[i.currency] = (acc[i.currency] || 0) + (i.quantity || 0);
    }
    return acc;
  }, {} as Record<string, number>);

  // 平均匯率（買入平均）：僅採計「買入外幣」，依每筆的外幣數量 × 該筆匯率加總，除以外幣數量加總，
  // 得出的台幣加總即對應依銀行淨投入（台幣）的金額（換回台幣/提款/收入不計入成本）
  const currencyBuyStats = investments.reduce((acc, i) => {
    if (i.currency && i.amount > 0 && (i.quantity || 0) > 0 && i.exchangeRate) {
      const key = i.currency;
      if (!acc[key]) acc[key] = { twd: 0, foreign: 0 };
      acc[key].twd += (i.quantity || 0) * i.exchangeRate;
      acc[key].foreign += i.quantity || 0;
    }
    return acc;
  }, {} as Record<string, { twd: number; foreign: number }>);

  // 平均匯率（時序加權）：依日期先後逐筆計算移動平均成本。
  // 買入 → 增加餘額與成本；利息／其他收入 → 只增加餘額不增加成本（稀釋匯率，含息後平均匯率會下降）；
  // 換回台幣／提款 → 依當下平均匯率等比例扣除成本，避免後續再買進造成的匯率誤差累積到已出場的部位上。
  const currencyMovingAvgRate: Record<string, number> = {};
  {
    const byCurrency: Record<string, Investment[]> = {};
    for (const inv of investments) {
      if (!inv.currency) continue;
      (byCurrency[inv.currency] ||= []).push(inv);
    }
    for (const [currency, list] of Object.entries(byCurrency)) {
      const sorted = [...list].sort(
        (a, b) => new Date(a.date ?? a.createdAt).getTime() - new Date(b.date ?? b.createdAt).getTime()
      );
      let balance = 0;
      let cost = 0;
      for (const inv of sorted) {
        const qty = inv.quantity || 0;
        if (qty >= 0) {
          balance += qty;
          if (inv.amount > 0) cost += inv.amount;
        } else {
          const rateNow = balance > 0 ? cost / balance : 0;
          const outQty = -qty;
          cost = Math.max(0, cost - rateNow * outQty);
          balance = Math.max(0, balance - outQty);
        }
      }
      currencyMovingAvgRate[currency] = balance > 0 ? cost / balance : 0;
    }
  }

  const bankTotals = investments.reduce((acc, i) => {
    const key = i.bankName || "未指定銀行";
    acc[key] = (acc[key] || 0) + i.amount;
    return acc;
  }, {} as Record<string, number>);

  // 各幣別累計手續費（例如調帳轉入基金時的轉帳手續費，以外幣計）
  const currencyFeeTotals = investments.reduce((acc, i) => {
    if (i.currency && i.fee) {
      const key = i.currency;
      acc[key] = (acc[key] || 0) + i.fee;
    }
    return acc;
  }, {} as Record<string, number>);

  // ---- 新增表單：即時試算 ----
  const twdInput = parseFloat(addForm.twdAmount) || 0;
  const foreignInput = parseFloat(addForm.foreignAmount) || 0;
  const exchangeRate = parseFloat(addForm.exchangeRate) || 0;
  const calcForeignFromTwd = exchangeRate > 0 ? twdInput / exchangeRate : 0;
  const calcTwdFromForeign = foreignInput * exchangeRate;
  const currencyLabel = addForm.currency === "其他" ? (addForm.currencyOther || "其他") : addForm.currency;
  const flowLabel = FLOW_OPTIONS.find((f) => f.key === addForm.flowType)!.label;

  // 依交易類型決定最終台幣/外幣金額：手動覆蓋優先於自動試算（銀行實際換匯結果可能有落差）
  let finalTwd = 0;
  let finalForeign = 0;
  if (addForm.flowType === "BUY") {
    finalTwd = twdInput;
    finalForeign = addForm.override !== "" ? (parseFloat(addForm.override) || 0) : calcForeignFromTwd;
  } else if (addForm.flowType === "CONVERT_BACK") {
    finalForeign = foreignInput;
    finalTwd = addForm.override !== "" ? (parseFloat(addForm.override) || 0) : calcTwdFromForeign;
  } else {
    finalForeign = foreignInput;
    finalTwd = 0;
  }

  const resetAddForm = () => {
    setAddForm(EMPTY_ADD_FORM);
    setAddBankInput("");
    setAddBankOpen(false);
  };

  const openAdd = () => { resetAddForm(); setShowAddModal(true); };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (addForm.flowType === "BUY" && (twdInput <= 0 || exchangeRate <= 0)) {
      alert("請填寫台幣金額與匯率");
      return;
    }
    if (addForm.flowType === "CONVERT_BACK" && (foreignInput <= 0 || exchangeRate <= 0)) {
      alert("請填寫外幣金額與匯率");
      return;
    }
    if (addForm.flowType === "ADJUSTMENT" && (foreignInput <= 0 || exchangeRate <= 0)) {
      alert("請填寫外幣金額與匯率");
      return;
    }
    if ((addForm.flowType === "WITHDRAW" || addForm.flowType === "INTEREST" || addForm.flowType === "OTHER_INCOME" || addForm.flowType === "ADJUSTMENT_IN") && foreignInput <= 0) {
      alert("請填寫外幣金額");
      return;
    }

    // 外幣餘額減少（換回台幣／提款／調帳轉出）記為負數；台幣淨投入減少（換回台幣拿回錢）記為負數
    const isOutflow = addForm.flowType === "CONVERT_BACK" || addForm.flowType === "WITHDRAW" || addForm.flowType === "ADJUSTMENT";
    const feeInput = addForm.flowType === "ADJUSTMENT" ? (parseFloat(addForm.fee) || 0) : 0;
    // 調帳實際轉出＝外幣金額＋手續費（手續費也會離開外幣帳戶），但「調帳金額」對外顯示僅計外幣金額，手續費另外累計
    const signedQuantity = isOutflow ? -(finalForeign + feeInput) : finalForeign;
    const signedAmount = addForm.flowType === "CONVERT_BACK" ? -finalTwd : finalTwd;
    const needsRate = addForm.flowType === "BUY" || addForm.flowType === "CONVERT_BACK" || addForm.flowType === "ADJUSTMENT";

    setAddSaving(true);
    const res = await fetch("/api/investments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "FOREX",
        name: flowLabel,
        date: addForm.date,
        bankName: addForm.bankName,
        currency: currencyLabel,
        exchangeRate: needsRate ? addForm.exchangeRate : undefined,
        fee: addForm.flowType === "ADJUSTMENT" && addForm.fee !== "" ? addForm.fee : undefined,
        amount: signedAmount,
        quantity: signedQuantity,
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
      date: inv.date ? inv.date.split("T")[0] : "",
      bankName: inv.bankName ?? "",
      currency: inv.currency ?? "",
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

  const filteredInvestments = filterType
    ? investments.filter((inv) => flowMeta(inv.name).key === filterType)
    : investments;
  const pageCount = Math.max(1, Math.ceil(filteredInvestments.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pagedInvestments = filteredInvestments.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">外匯投資</h1>
          <p className="text-slate-500 text-sm mt-1">管理你的外幣兌換記錄</p>
        </div>
        <button onClick={openAdd}
          className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors">
          + 新增記錄
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">淨投入金額（台幣）</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{fmt(total)}</div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">交易筆數</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{investments.length} 筆</div>
        </div>
      </div>

      {/* 依幣別 / 銀行 小計 */}
      {investments.length > 0 && (
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">各幣別總投入+利息（買入平均匯率）</div>
            <div className="space-y-2">
              {Object.entries(currencyInflowTotals).map(([currency, amount]) => {
                const stats = currencyBuyStats[currency];
                const avgRate = stats && stats.foreign > 0 ? stats.twd / stats.foreign : null;
                return (
                  <div key={currency} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{currency}</span>
                    <div className="text-right">
                      <div className="font-semibold text-slate-900">{fmt2(amount)}</div>
                      {avgRate !== null && <div className="text-[11px] text-slate-400">平均匯率 {fmt2(avgRate)}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">各幣別總投入+利息（台幣）</div>
            <div className="space-y-2">
              {Object.entries(currencyInflowTotals).map(([currency, amount]) => {
                const stats = currencyBuyStats[currency];
                const avgRate = stats && stats.foreign > 0 ? stats.twd / stats.foreign : 0;
                return (
                  <div key={currency} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{currency}</span>
                    <span className="font-semibold text-slate-900">{fmt(amount * avgRate)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 依幣別 / 銀行 小計（時序加權平均，含息） */}
      {investments.length > 0 && (
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">各幣別目前餘額（時序平均匯率・含息）</div>
            <div className="space-y-2">
              {Object.entries(currencyTotals).map(([currency, amount]) => {
                const avgRate = currencyMovingAvgRate[currency];
                return (
                  <div key={currency} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{currency}</span>
                    <div className="text-right">
                      <div className="font-semibold text-slate-900">{fmt2(amount)}</div>
                      {avgRate > 0 && <div className="text-[11px] text-slate-400">平均匯率 {fmt2(avgRate)}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">依銀行淨投入（台幣）</div>
            <div className="space-y-2">
              {Object.entries(bankTotals).map(([bank, amount]) => (
                <div key={bank} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">{bank}</span>
                  <span className="font-semibold text-slate-900">{fmt(amount)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 各幣別累計手續費 */}
      {Object.keys(currencyFeeTotals).length > 0 && (
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm mb-8">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">各幣別累計手續費</div>
          <div className="space-y-2">
            {Object.entries(currencyFeeTotals).map(([currency, fee]) => (
              <div key={currency} className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{currency}</span>
                <span className="font-semibold text-slate-900">{fmt2(fee)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* List */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-50 flex items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-900">兌換記錄</h2>
          <select value={filterType}
            onChange={(e) => { setFilterType(e.target.value as FlowType | ""); setPage(1); }}
            className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-600 bg-white focus:border-indigo-400 transition-colors">
            <option value="">全部類型</option>
            <optgroup label="支出">
              {EXPENSE_TYPES.map((key) => (
                <option key={key} value={key}>{FLOW_OPTIONS.find((f) => f.key === key)!.label}</option>
              ))}
            </optgroup>
            <optgroup label="收入">
              {INCOME_TYPES.map((key) => (
                <option key={key} value={key}>{FLOW_OPTIONS.find((f) => f.key === key)!.label}</option>
              ))}
            </optgroup>
          </select>
        </div>
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm">載入中...</div>
        ) : investments.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-slate-400 text-sm mb-3">還沒有外匯兌換記錄</p>
            <button onClick={openAdd} className="text-sm text-indigo-600 font-medium hover:underline">新增第一筆記錄</button>
          </div>
        ) : filteredInvestments.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-slate-400 text-sm">沒有符合篩選條件的記錄</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {pagedInvestments.map((inv) => {
              const meta = flowMeta(inv.name);
              const showTwd = inv.amount !== 0;
              // 調帳金額對外顯示不含手續費（quantity 已內含手續費扣除，這裡加回來還原成單純的轉出本金）
              const displayQty = (inv.quantity || 0) + (inv.fee || 0);
              return (
                <div key={inv.id} className="flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors group">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${meta.badgeClass}`}>{meta.label}</span>
                      <span className="text-sm font-medium text-slate-800">{inv.bankName || "(未指定銀行)"}</span>
                      {inv.currency && <span className="text-xs text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">{inv.currency}</span>}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      {new Date(inv.date ?? inv.createdAt).toLocaleDateString("zh-TW")}
                      {inv.exchangeRate ? ` · 匯率 ${inv.exchangeRate}` : ""}
                      {showTwd && inv.quantity ? ` · ${inv.quantity >= 0 ? "+" : ""}${fmt2(inv.quantity)} ${inv.currency ?? ""}` : ""}
                      {inv.fee ? ` · 手續費 ${fmt2(inv.fee)} ${inv.currency ?? ""}` : ""}
                      {inv.note ? ` · ${inv.note}` : ""}
                      {inv.transactionId && <span className="ml-1 text-indigo-400">· 已連結支出</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {showTwd ? (
                      <span className={`text-sm font-semibold ${inv.amount >= 0 ? "text-slate-700" : "text-red-500"}`}>
                        {inv.amount < 0 ? "-" : ""}{fmt(Math.abs(inv.amount))}
                      </span>
                    ) : (
                      <span className={`text-sm font-semibold ${displayQty >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                        {displayQty >= 0 ? "+" : "-"}{fmt2(Math.abs(displayQty))} {inv.currency}
                      </span>
                    )}
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEdit(inv)} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 text-xs transition-colors">編輯</button>
                      <button onClick={() => handleDelete(inv.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 text-xs transition-colors">刪除</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {!loading && pageCount > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-slate-50">
            <span className="text-xs text-slate-400">
              第 {currentPage} / {pageCount} 頁・共 {filteredInvestments.length} 筆
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
            <h2 className="text-lg font-bold text-slate-900 mb-5">新增外匯記錄</h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">交易類型</label>
                <div className="flex flex-wrap gap-2">
                  <button type="button"
                    onClick={() => setAddForm({ ...addForm, flowType: EXPENSE_TYPES[0], override: "" })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${EXPENSE_TYPES.includes(addForm.flowType) ? "bg-red-500 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                    支出
                  </button>
                  <button type="button"
                    onClick={() => setAddForm({ ...addForm, flowType: INCOME_TYPES[0], override: "" })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${INCOME_TYPES.includes(addForm.flowType) ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                    收入
                  </button>
                </div>
                {EXPENSE_TYPES.includes(addForm.flowType) && (
                  <select value={addForm.flowType}
                    onChange={(e) => setAddForm({ ...addForm, flowType: e.target.value as FlowType, override: "" })}
                    className="mt-2 w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors">
                    <option value="WITHDRAW">提款外幣</option>
                    <option value="CONVERT_BACK">換回台幣</option>
                    <option value="ADJUSTMENT">調帳</option>
                  </select>
                )}
                {INCOME_TYPES.includes(addForm.flowType) && (
                  <select value={addForm.flowType}
                    onChange={(e) => setAddForm({ ...addForm, flowType: e.target.value as FlowType, override: "" })}
                    className="mt-2 w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors">
                    <option value="BUY">買入外幣</option>
                    <option value="INTEREST">利息收入</option>
                    <option value="OTHER_INCOME">其他收入</option>
                    <option value="ADJUSTMENT_IN">調帳(轉入)</option>
                  </select>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">兌換日期</label>
                <input required type="date" value={addForm.date}
                  onChange={(e) => setAddForm({ ...addForm, date: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">銀行別名</label>
                  <input
                    type="text"
                    list="forexbanklist"
                    value={addForm.bankName}
                    onChange={(e) => setAddForm({ ...addForm, bankName: e.target.value })}
                    placeholder="搜尋或選擇銀行"
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors"
                  />
                  <datalist id="forexbanklist">
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

              {addForm.flowType === "BUY" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">台幣金額</label>
                      <input required type="number" min="0" step="any" value={addForm.twdAmount}
                        onChange={(e) => setAddForm({ ...addForm, twdAmount: e.target.value })} placeholder="例如：10000"
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
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">實際換得外幣金額（選填）</label>
                    <input type="number" min="0" step="any" value={addForm.override}
                      onChange={(e) => setAddForm({ ...addForm, override: e.target.value })}
                      placeholder={`試算為 ${fmt2(calcForeignFromTwd)} ${currencyLabel}，如與銀行實際換匯金額不同可在此輸入覆蓋`}
                      className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                    <p className="text-[11px] text-slate-400 mt-1">留空則採用下方自動試算的金額；填寫後將以此金額為準</p>
                  </div>
                </>
              )}

              {addForm.flowType === "CONVERT_BACK" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">外幣金額</label>
                      <input required type="number" min="0" step="any" value={addForm.foreignAmount}
                        onChange={(e) => setAddForm({ ...addForm, foreignAmount: e.target.value })} placeholder="例如：500"
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
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">實際換得台幣金額（選填）</label>
                    <input type="number" min="0" step="any" value={addForm.override}
                      onChange={(e) => setAddForm({ ...addForm, override: e.target.value })}
                      placeholder={`試算為 ${fmt(calcTwdFromForeign)}，如與銀行實際換匯金額不同可在此輸入覆蓋`}
                      className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                    <p className="text-[11px] text-slate-400 mt-1">留空則採用下方自動試算的金額；填寫後將以此金額為準</p>
                  </div>
                </>
              )}

              {addForm.flowType === "ADJUSTMENT" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">外幣金額</label>
                      <input required type="number" min="0" step="any" value={addForm.foreignAmount}
                        onChange={(e) => setAddForm({ ...addForm, foreignAmount: e.target.value })} placeholder="例如：500"
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
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">手續費（選填，外幣計）</label>
                    <input type="number" min="0" step="any" value={addForm.fee}
                      onChange={(e) => setAddForm({ ...addForm, fee: e.target.value })} placeholder="例如：5"
                      className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                    <p className="text-[11px] text-slate-400 mt-1">手續費會從外幣餘額中扣除，但不計入調帳金額，會另外累計在「各幣別累計手續費」</p>
                  </div>
                </>
              )}

              {(addForm.flowType === "WITHDRAW" || addForm.flowType === "INTEREST" || addForm.flowType === "OTHER_INCOME" || addForm.flowType === "ADJUSTMENT_IN") && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {addForm.flowType === "WITHDRAW" ? "提領外幣金額" : addForm.flowType === "ADJUSTMENT_IN" ? "調帳轉入外幣金額" : "收入外幣金額"}
                  </label>
                  <input required type="number" min="0" step="any" value={addForm.foreignAmount}
                    onChange={(e) => setAddForm({ ...addForm, foreignAmount: e.target.value })} placeholder="例如：100"
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">備註（選填）</label>
                <input value={addForm.note} onChange={(e) => setAddForm({ ...addForm, note: e.target.value })}
                  placeholder="備註..." className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>

              {/* 試算小計 */}
              {addForm.flowType === "BUY" && (
                <div className="bg-slate-50 rounded-xl px-4 py-3 space-y-1.5">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>台幣金額</span><span>{fmt(twdInput)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>自動試算外幣金額</span><span>{fmt2(calcForeignFromTwd)} {currencyLabel}</span>
                  </div>
                  <div className="flex justify-between text-sm font-semibold text-slate-900 pt-1.5 border-t border-slate-200">
                    <span>換得外幣小計</span>
                    <span>
                      {fmt2(finalForeign)} {currencyLabel}
                      {addForm.override !== "" && <span className="text-[10px] font-normal text-indigo-500 ml-1">（已調整）</span>}
                    </span>
                  </div>
                </div>
              )}
              {addForm.flowType === "CONVERT_BACK" && (
                <div className="bg-slate-50 rounded-xl px-4 py-3 space-y-1.5">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>外幣金額</span><span>{fmt2(foreignInput)} {currencyLabel}</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>自動試算台幣金額</span><span>{fmt(calcTwdFromForeign)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-semibold text-slate-900 pt-1.5 border-t border-slate-200">
                    <span>換得台幣小計</span>
                    <span>
                      {fmt(finalTwd)}
                      {addForm.override !== "" && <span className="text-[10px] font-normal text-indigo-500 ml-1">（已調整）</span>}
                    </span>
                  </div>
                </div>
              )}
              {addForm.flowType === "ADJUSTMENT" && (
                <div className="bg-slate-50 rounded-xl px-4 py-3 space-y-1.5">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>調帳金額（不含手續費）</span><span>{fmt2(finalForeign)} {currencyLabel}</span>
                  </div>
                  {(parseFloat(addForm.fee) || 0) > 0 && (
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>手續費</span><span>{fmt2(parseFloat(addForm.fee) || 0)} {currencyLabel}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-semibold text-slate-900 pt-1.5 border-t border-slate-200">
                    <span>外幣帳戶實際減少</span>
                    <span className="text-amber-600">-{fmt2(finalForeign + (parseFloat(addForm.fee) || 0))} {currencyLabel}</span>
                  </div>
                </div>
              )}
              {addForm.flowType === "WITHDRAW" && (
                <div className="bg-slate-50 rounded-xl px-4 py-3">
                  <div className="flex justify-between text-sm font-semibold text-slate-900">
                    <span>提領外幣小計</span><span className="text-red-500">-{fmt2(finalForeign)} {currencyLabel}</span>
                  </div>
                </div>
              )}
              {(addForm.flowType === "INTEREST" || addForm.flowType === "OTHER_INCOME" || addForm.flowType === "ADJUSTMENT_IN") && (
                <div className="bg-slate-50 rounded-xl px-4 py-3">
                  <div className="flex justify-between text-sm font-semibold text-slate-900">
                    <span>{addForm.flowType === "ADJUSTMENT_IN" ? "調帳轉入小計" : "收入外幣小計"}</span>
                    <span className="text-emerald-600">+{fmt2(finalForeign)} {currencyLabel}</span>
                  </div>
                </div>
              )}

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
            <h2 className="text-lg font-bold text-slate-900 mb-5">編輯外匯記錄</h2>
            <div className="mb-4">
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${flowMeta(editing.name).badgeClass}`}>
                {flowMeta(editing.name).label}
              </span>
            </div>
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">兌換日期</label>
                <input type="date" value={editForm.date} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">銀行別名</label>
                <input
                  type="text"
                  list="forexbanklist-edit"
                  value={editForm.bankName}
                  onChange={(e) => setEditForm({ ...editForm, bankName: e.target.value })}
                  placeholder="搜尋或選擇銀行"
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors"
                />
                <datalist id="forexbanklist-edit">
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
                <label className="block text-sm font-medium text-slate-700 mb-1.5">備註（選填）</label>
                <input value={editForm.note} onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
                  placeholder="備註..." className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>
              <p className="text-[11px] text-slate-400">交易類型、金額、匯率如需調整，請刪除後重新新增以確保試算正確</p>
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
