"use client";

import { useEffect, useState, useCallback } from "react";
import { authFetch } from "@/lib/api-fetch";
import { computeHoldings } from "@/lib/stock-holdings";
import Combobox from "@/components/ui/Combobox";

interface Investment {
  id: string;
  type: "STOCK";
  name?: string;
  code?: string;
  amount: number;
  quantity?: number;
  price?: number;
  broker?: string;
  action: "BUY" | "SELL";
  date: string;
  discount?: number;
  fee?: number;
  tax?: number;
  note?: string;
  transactionId?: string;
  createdAt: string;
}

interface FeeSetting {
  key: string;
  rate: number;
}

interface UserBroker {
  id: string;
  name: string;
}

const DEFAULT_BROKERS = [
  "元大證券", "富邦證券", "國泰證券", "凱基證券", "群益證券",
  "統一證券", "永豐金證券", "兆豐證券", "中國信託證券", "玉山證券",
  "台新證券", "日盛證券", "康和證券", "華南永昌證券", "第一金證券",
  "元富證券", "新光證券", "大昌證券",
];

const EMPTY_ADD_FORM = {
  mode: "TRADE" as "TRADE" | "COST_ADJUST",
  name: "",
  code: "",
  date: new Date().toISOString().split("T")[0],
  action: "BUY" as "BUY" | "SELL",
  broker: "",
  quantity: "",
  price: "",
  feeRate: "0.1425",
  discount: "1",
  taxRate: "0.3",
  feeAmount: "",
  taxAmount: "",
  adjustAmount: "",
  costAdjustAmount: "",
  note: "",
};

export default function StockPage() {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_ADD_FORM);
  const [addSaving, setAddSaving] = useState(false);

  const [editing, setEditing] = useState<Investment | null>(null);
  const [editForm, setEditForm] = useState({ name: "", code: "", date: "", action: "BUY" as "BUY" | "SELL", broker: "", quantity: "", note: "" });
  const [saving, setSaving] = useState(false);

  const [userBrokers, setUserBrokers] = useState<UserBroker[]>([]);
  const [addBrokerInput, setAddBrokerInput] = useState("");
  const [addBrokerOpen, setAddBrokerOpen] = useState(false);
  const [addBrokerLoading, setAddBrokerLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [invRes, feeRes, brokerRes] = await Promise.all([
      fetch("/api/investments?type=STOCK"),
      fetch("/api/fee-settings"),
      fetch("/api/user-brokers"),
    ]);
    const [invData, feeData, brokerData] = await Promise.all([invRes.json(), feeRes.json(), brokerRes.json()]);
    setInvestments(Array.isArray(invData) ? invData : []);
    const fees: FeeSetting[] = Array.isArray(feeData) ? feeData : [];
    const commission = fees.find((f) => f.key === "stock_commission");
    if (commission) {
      setAddForm((f) => ({ ...f, feeRate: String(commission.rate) }));
    }
    setUserBrokers(Array.isArray(brokerData) ? brokerData : []);
    setLoading(false);
  }, []);

  const allBrokers = [...DEFAULT_BROKERS, ...userBrokers.map((b) => b.name)];

  const handleAddBroker = async () => {
    if (!addBrokerInput.trim()) return;
    setAddBrokerLoading(true);
    const res = await authFetch("/api/user-brokers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: addBrokerInput.trim() }),
    });
    setAddBrokerLoading(false);
    if (res.ok) {
      const broker = await res.json();
      setUserBrokers((prev) => [...prev, broker]);
      setAddForm((f) => ({ ...f, broker: broker.name }));
      setAddBrokerInput("");
      setAddBrokerOpen(false);
    }
  };

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const fmt = (n: number) =>
    new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(n);

  // 淨投入金額：買進為正、賣出為負（賣出淨額會抵銷買進金額）
  const netInvested = investments.reduce((s, i) => s + i.amount, 0);
  const buyCount = investments.filter((i) => i.action === "BUY").length;
  const sellCount = investments.filter((i) => i.action === "SELL").length;
  const holdings = computeHoldings(investments);

  // ---- 新增表單：即時試算 ----
  const quantity = parseFloat(addForm.quantity) || 0;
  const price = parseFloat(addForm.price) || 0;
  const feeRate = parseFloat(addForm.feeRate) || 0;
  const discount = parseFloat(addForm.discount) || 0;
  const taxRate = parseFloat(addForm.taxRate) || 0;
  const principal = quantity * price;
  const calcFee = Math.round(principal * (feeRate / 100) * discount);
  // 手續費金額：定期定額等扣款方式常常不是比照一般費率計算，填了就直接用這個金額，
  // 不填才用費率*折扣自動試算
  const fee = addForm.feeAmount !== "" ? (parseFloat(addForm.feeAmount) || 0) : calcFee;
  const calcTax = addForm.action === "SELL" ? Math.round(principal * (taxRate / 100)) : 0;
  // 證券交易稅金額：實際扣款常因四捨五入或券商計算方式跟試算有落差，填了就直接用這個金額，
  // 不填才用稅率自動試算
  const tax = addForm.taxAmount !== "" ? (parseFloat(addForm.taxAmount) || 0) : calcTax;
  const calcSubtotal = addForm.action === "BUY" ? principal + fee : principal - fee - tax;
  // 調帳金額：如果填了就以此為準（實際扣款/入帳金額可能與試算有落差），否則採自動試算結果
  const subtotal = addForm.adjustAmount !== "" ? (parseFloat(addForm.adjustAmount) || 0) : calcSubtotal;

  const resetAddForm = () => {
    setAddForm((f) => ({ ...EMPTY_ADD_FORM, feeRate: f.feeRate }));
    setAddBrokerInput("");
    setAddBrokerOpen(false);
  };

  const openAdd = () => { resetAddForm(); setShowAddModal(true); };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();

    if (addForm.mode === "COST_ADJUST") {
      if (!addForm.code) {
        alert("請選擇要調整成本的股票");
        return;
      }
      const adjustCost = parseFloat(addForm.costAdjustAmount) || 0;
      if (adjustCost <= 0) {
        alert("請填寫調整金額");
        return;
      }
      setAddSaving(true);
      await authFetch("/api/investments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "STOCK",
          name: addForm.name,
          code: addForm.code,
          date: addForm.date,
          action: "SELL",
          amount: -adjustCost,
          note: addForm.note || "成本調整（用其他持股獲利攤平此檔虧損，股數不變）",
        }),
      });
      setAddSaving(false);
      setShowAddModal(false);
      fetchAll();
      return;
    }

    if (quantity <= 0 || price <= 0) {
      alert("請填寫股數與每股價格");
      return;
    }
    setAddSaving(true);
    await authFetch("/api/investments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "STOCK",
        name: addForm.name,
        code: addForm.code,
        date: addForm.date,
        action: addForm.action,
        broker: addForm.broker,
        quantity: addForm.quantity,
        price: addForm.price,
        discount: addForm.discount,
        fee,
        tax,
        amount: addForm.action === "SELL" ? -subtotal : subtotal,
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
      action: inv.action,
      broker: inv.broker ?? "",
      quantity: inv.quantity ? String(inv.quantity) : "",
      note: inv.note ?? "",
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    const res = await authFetch(`/api/investments/${editing.id}`, {
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
    await authFetch(`/api/investments/${id}`, { method: "DELETE" });
    fetchAll();
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">股票投資</h1>
          <p className="text-slate-500 text-sm mt-1">管理你的股票投資記錄</p>
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

      {/* 持股狀況 */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-slate-50">
          <h2 className="font-semibold text-slate-900">持股狀況</h2>
        </div>
        {holdings.length === 0 ? (
          <div className="py-10 text-center text-slate-400 text-sm">目前沒有持股</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-400 uppercase tracking-wider border-b border-slate-50">
                  <th className="text-left font-semibold px-6 py-3">股票名稱</th>
                  <th className="text-left font-semibold px-6 py-3">股票代碼</th>
                  <th className="text-right font-semibold px-6 py-3">合計股數</th>
                  <th className="text-right font-semibold px-6 py-3">投資總額</th>
                  <th className="text-right font-semibold px-6 py-3">平均每股價格</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {holdings.map((h) => (
                  <tr key={h.key} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3 font-medium text-slate-800">{h.name}</td>
                    <td className="px-6 py-3 text-slate-500 font-mono text-xs">{h.code}</td>
                    <td className="px-6 py-3 text-right text-slate-700">{h.quantity.toLocaleString("zh-TW")}</td>
                    <td className="px-6 py-3 text-right text-slate-700">{fmt(h.cost)}</td>
                    <td className="px-6 py-3 text-right text-slate-700">{h.avgPrice.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-50">
          <h2 className="font-semibold text-slate-900">投資記錄</h2>
        </div>
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm">載入中...</div>
        ) : investments.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-slate-400 text-sm mb-3">還沒有股票投資記錄</p>
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
                      {inv.broker ? ` · ${inv.broker}` : ""}
                      {inv.quantity ? ` · ${inv.quantity} 股` : ""}
                      {inv.price ? ` · @${inv.price}` : ""}
                      {inv.fee ? ` · 手續費 ${fmt(inv.fee)}` : ""}
                      {inv.tax ? ` · 交易稅 ${fmt(inv.tax)}` : ""}
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
            <h2 className="text-lg font-bold text-slate-900 mb-5">新增股票記錄</h2>
            <form onSubmit={handleAdd} className="space-y-4">
              {/* 買進/賣出/成本調整 */}
              <div className="flex gap-2">
                <button type="button" onClick={() => setAddForm({ ...addForm, mode: "TRADE", action: "BUY" })}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    addForm.mode === "TRADE" && addForm.action === "BUY" ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}>
                  買進
                </button>
                <button type="button" onClick={() => setAddForm({ ...addForm, mode: "TRADE", action: "SELL" })}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    addForm.mode === "TRADE" && addForm.action === "SELL" ? "bg-red-500 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}>
                  賣出
                </button>
                <button type="button" onClick={() => setAddForm({ ...addForm, mode: "COST_ADJUST" })}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    addForm.mode === "COST_ADJUST" ? "bg-indigo-500 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}>
                  成本調整
                </button>
              </div>
              {addForm.mode === "COST_ADJUST" && (
                <p className="text-xs text-slate-400 -mt-2">
                  用其他持股的獲利攤平這檔的虧損：股數不會變動，只會扣減這檔的累計投入成本（總額），
                  盈虧試算與「投資策略」頁會同步反映
                </p>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{addForm.mode === "COST_ADJUST" ? "調整日期" : "申購日期"}</label>
                <input required type="date" value={addForm.date}
                  onChange={(e) => setAddForm({ ...addForm, date: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>

              {addForm.mode === "TRADE" && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">證券公司（選填）</label>
                  <Combobox
                    value={addForm.broker}
                    onChange={(v) => setAddForm({ ...addForm, broker: v })}
                    options={allBrokers}
                    placeholder="搜尋或選擇證券公司"
                  />
                  {addBrokerOpen ? (
                    <div className="flex gap-2 mt-2">
                      <input value={addBrokerInput} onChange={(e) => setAddBrokerInput(e.target.value)}
                        placeholder="輸入證券公司名稱"
                        className="flex-1 border border-indigo-300 rounded-lg px-3 py-2 text-sm focus:border-indigo-400" />
                      <button type="button" onClick={handleAddBroker} disabled={addBrokerLoading}
                        className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60">
                        {addBrokerLoading ? "..." : "新增"}
                      </button>
                      <button type="button" onClick={() => setAddBrokerOpen(false)}
                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-500 hover:bg-slate-50">取消</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setAddBrokerOpen(true)}
                      className="mt-1.5 text-xs text-indigo-500 hover:text-indigo-700 hover:underline">
                      + 找不到？申請新增證券公司
                    </button>
                  )}
                </div>
              )}

              {(addForm.mode === "COST_ADJUST" || (addForm.mode === "TRADE" && addForm.action === "SELL")) ? (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">選擇持股</label>
                  {holdings.length === 0 ? (
                    <p className="text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg px-3.5 py-2.5">目前沒有任何持股可選</p>
                  ) : (
                    <select
                      required
                      value={addForm.code}
                      onChange={(e) => {
                        const h = holdings.find((x) => x.code === e.target.value);
                        setAddForm({ ...addForm, code: h?.code ?? "", name: h?.name ?? "" });
                      }}
                      className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors"
                    >
                      <option value="">請選擇目前持有的股票</option>
                      {holdings.map((h) => (
                        <option key={h.code} value={h.code}>{h.name}（{h.code}）· 持有 {h.quantity.toLocaleString("zh-TW")} 股</option>
                      ))}
                    </select>
                  )}
                  <p className="text-[11px] text-slate-400 mt-1">從目前持股選擇，會自動帶入名稱與代碼</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">名稱（選填）</label>
                    <input value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                      placeholder="例如：台積電" className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">代碼（選填）</label>
                    <input value={addForm.code} onChange={(e) => setAddForm({ ...addForm, code: e.target.value })}
                      placeholder="例如：2330" className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                  </div>
                </div>
              )}

              {addForm.mode === "COST_ADJUST" && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">調整金額（從投入成本中扣除）</label>
                  <input required type="number" min="0" step="any" value={addForm.costAdjustAmount}
                    onChange={(e) => setAddForm({ ...addForm, costAdjustAmount: e.target.value })} placeholder="例如：5000"
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                </div>
              )}

              {addForm.mode === "TRADE" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">股數</label>
                      <input required type="number" min="0" step="any" value={addForm.quantity}
                        onChange={(e) => setAddForm({ ...addForm, quantity: e.target.value })} placeholder="例如：1000"
                        className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">每股價格</label>
                      <input required type="number" min="0" step="any" value={addForm.price}
                        onChange={(e) => setAddForm({ ...addForm, price: e.target.value })} placeholder="例如：600"
                        className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">手續費率 (%)</label>
                      <input type="number" min="0" step="any" value={addForm.feeRate}
                        onChange={(e) => setAddForm({ ...addForm, feeRate: e.target.value })}
                        className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                      <p className="text-[11px] text-slate-400 mt-1">預設帶入後台「手續費設定」</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">券商折扣</label>
                      <input type="number" min="0" max="1" step="0.01" value={addForm.discount}
                        onChange={(e) => setAddForm({ ...addForm, discount: e.target.value })} placeholder="例如 6 折請輸入 0.6"
                        className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                      <p className="text-[11px] text-slate-400 mt-1">1 = 無折扣，0.6 = 6 折</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">手續費金額（選填）</label>
                    <input type="number" min="0" step="any" value={addForm.feeAmount}
                      onChange={(e) => setAddForm({ ...addForm, feeAmount: e.target.value })}
                      placeholder={`留空則用費率試算為 ${fmt(calcFee)}`}
                      className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                    <p className="text-[11px] text-slate-400 mt-1">定期定額等扣款方式常常不是比照一般費率算，可以直接輸入實際手續費金額覆蓋試算</p>
                  </div>

                  {addForm.action === "SELL" && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">證券交易稅率 (%)</label>
                        <input type="number" min="0" step="any" value={addForm.taxRate}
                          onChange={(e) => setAddForm({ ...addForm, taxRate: e.target.value })}
                          className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                        <p className="text-[11px] text-slate-400 mt-1">僅賣出課徵，預設 0.3%</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">證券交易稅金額（選填）</label>
                        <input type="number" min="0" step="any" value={addForm.taxAmount}
                          onChange={(e) => setAddForm({ ...addForm, taxAmount: e.target.value })}
                          placeholder={`留空則用稅率試算為 ${fmt(calcTax)}`}
                          className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                        <p className="text-[11px] text-slate-400 mt-1">實際扣款常因四捨五入跟試算有落差，可以直接輸入實際證券交易稅金額覆蓋試算</p>
                      </div>
                    </>
                  )}
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">備註（選填）</label>
                <input value={addForm.note} onChange={(e) => setAddForm({ ...addForm, note: e.target.value })}
                  placeholder="備註..." className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>

              {addForm.mode === "TRADE" && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">調帳金額（選填）</label>
                    <input type="number" min="0" step="any" value={addForm.adjustAmount}
                      onChange={(e) => setAddForm({ ...addForm, adjustAmount: e.target.value })}
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
                      <span>手續費</span>
                      <span>{fmt(fee)}{addForm.feeAmount !== "" && <span className="text-[10px] font-normal text-indigo-500 ml-1">（手動輸入）</span>}</span>
                    </div>
                    {addForm.action === "SELL" && (
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>證券交易稅</span>
                        <span>{fmt(tax)}{addForm.taxAmount !== "" && <span className="text-[10px] font-normal text-indigo-500 ml-1">（手動輸入）</span>}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>自動試算小計</span><span>{fmt(calcSubtotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-semibold text-slate-900 pt-1.5 border-t border-slate-200">
                      <span>{addForm.action === "BUY" ? "最終小計（應付）" : "最終小計（應收）"}</span>
                      <span>{fmt(subtotal)}{addForm.adjustAmount !== "" && <span className="text-[10px] font-normal text-indigo-500 ml-1">（已調帳）</span>}</span>
                    </div>
                  </div>
                </>
              )}

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                  取消
                </button>
                <button type="submit" disabled={addSaving}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-60">
                  {addSaving ? "儲存中..." : addForm.mode === "COST_ADJUST" ? "儲存調整" : "儲存"}
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
            <h2 className="text-lg font-bold text-slate-900 mb-5">編輯股票記錄</h2>
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
                <label className="block text-sm font-medium text-slate-700 mb-1.5">申購日期</label>
                <input type="date" value={editForm.date} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">證券公司（選填）</label>
                <Combobox
                  value={editForm.broker}
                  onChange={(v) => setEditForm({ ...editForm, broker: v })}
                  options={allBrokers}
                  placeholder="搜尋或選擇證券公司"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">名稱（選填）</label>
                <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="例如：台積電" className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">代碼（選填）</label>
                <input value={editForm.code} onChange={(e) => setEditForm({ ...editForm, code: e.target.value })}
                  placeholder="例如：2330" className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">股數（選填）</label>
                <input type="number" step="any" value={editForm.quantity}
                  onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })} placeholder="例如：1000"
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">備註（選填）</label>
                <input value={editForm.note} onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
                  placeholder="備註..." className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>
              <p className="text-[11px] text-slate-400">金額、手續費、交易稅如需調整，請刪除後重新新增以確保試算正確</p>
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
