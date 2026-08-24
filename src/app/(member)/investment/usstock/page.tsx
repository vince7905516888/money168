"use client";

import { useEffect, useState, useCallback } from "react";
import { authFetch } from "@/lib/api-fetch";
import { computeHoldings } from "@/lib/stock-holdings";
import Combobox from "@/components/ui/Combobox";

interface Investment {
  id: string;
  type: "USSTOCK";
  name?: string;
  code?: string;
  amount: number;
  quantity?: number;
  price?: number;
  broker?: string;
  currency?: string;
  action: "BUY" | "SELL";
  date: string;
  fee?: number;
  note?: string;
  transactionId?: string;
  createdAt: string;
}

interface UserBroker {
  id: string;
  name: string;
}

// 美股交易多半是海外券商直接開戶或透過台灣券商複委託，兩種都常見，先列一份常見清單，
// 找不到可以自己新增（跟其他投資頁的做法一致）。
const DEFAULT_BROKERS = [
  "Firstrade 第一證券", "Interactive Brokers 盈透證券", "Charles Schwab 嘉信理財",
  "元大證券複委託", "富邦證券複委託", "國泰證券複委託", "凱基證券複委託",
  "永豐金證券複委託", "玉山證券複委託",
];

const CURRENCIES = ["USD", "TWD", "HKD"];

const EMPTY_ADD_FORM = {
  name: "",
  code: "",
  date: new Date().toISOString().split("T")[0],
  action: "BUY" as "BUY" | "SELL",
  broker: "",
  currency: "USD",
  quantity: "",
  price: "",
  fee: "",
  adjustAmount: "",
  note: "",
};

export default function UsStockPage() {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_ADD_FORM);
  const [addSaving, setAddSaving] = useState(false);

  const [editing, setEditing] = useState<Investment | null>(null);
  const [editForm, setEditForm] = useState({ name: "", code: "", date: "", action: "BUY" as "BUY" | "SELL", broker: "", currency: "", quantity: "", note: "" });
  const [saving, setSaving] = useState(false);

  const [userBrokers, setUserBrokers] = useState<UserBroker[]>([]);
  const [addBrokerInput, setAddBrokerInput] = useState("");
  const [addBrokerOpen, setAddBrokerOpen] = useState(false);
  const [addBrokerLoading, setAddBrokerLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [invRes, brokerRes] = await Promise.all([
      fetch("/api/investments?type=USSTOCK"),
      fetch("/api/user-brokers"),
    ]);
    const [invData, brokerData] = await Promise.all([invRes.json(), brokerRes.json()]);
    setInvestments(Array.isArray(invData) ? invData : []);
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

  const fmtCur = (n: number, currency: string) => {
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
    } catch {
      return `${currency} ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n)}`;
    }
  };

  // 淨投入金額：買進為正、賣出為負，依幣別分開加總（美股常見美金計價，也可能有複委託掛牌在其他幣別的情況）
  const currencyTotals = investments.reduce((acc, i) => {
    const cur = i.currency || "USD";
    acc[cur] = (acc[cur] || 0) + i.amount;
    return acc;
  }, {} as Record<string, number>);
  const buyCount = investments.filter((i) => i.action === "BUY").length;
  const sellCount = investments.filter((i) => i.action === "SELL").length;
  const holdings = computeHoldings(investments);

  // ---- 新增表單：即時試算 ----
  const quantity = parseFloat(addForm.quantity) || 0;
  const price = parseFloat(addForm.price) || 0;
  const principal = quantity * price;
  const fee = parseFloat(addForm.fee) || 0;
  const calcSubtotal = addForm.action === "BUY" ? principal + fee : principal - fee;
  // 調帳金額：實際扣款/入帳金額可能因匯率或券商計費方式跟試算有落差，填了就以此為準
  const subtotal = addForm.adjustAmount !== "" ? (parseFloat(addForm.adjustAmount) || 0) : calcSubtotal;

  const resetAddForm = () => {
    setAddForm(EMPTY_ADD_FORM);
    setAddBrokerInput("");
    setAddBrokerOpen(false);
  };

  const openAdd = () => { resetAddForm(); setShowAddModal(true); };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (quantity <= 0 || price <= 0) {
      alert("請填寫股數與每股價格");
      return;
    }
    setAddSaving(true);
    await authFetch("/api/investments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "USSTOCK",
        name: addForm.name,
        code: addForm.code,
        date: addForm.date,
        action: addForm.action,
        broker: addForm.broker,
        currency: addForm.currency,
        quantity: addForm.quantity,
        price: addForm.price,
        fee,
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
      currency: inv.currency ?? "USD",
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
          <h1 className="text-2xl font-bold text-slate-900">美股投資</h1>
          <p className="text-slate-500 text-sm mt-1">管理你的美股投資記錄</p>
        </div>
        <button onClick={openAdd}
          className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors">
          + 新增記錄
        </button>
      </div>

      {/* Summary */}
      <div className="space-y-4 mb-8">
        {Object.keys(currencyTotals).length === 0 ? (
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">淨投入金額</div>
              <div className="text-2xl font-bold text-slate-900 mt-1">{fmtCur(0, "USD")}</div>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
              <div className="text-xs font-semibold text-emerald-500 uppercase tracking-wider mb-1">買進筆數</div>
              <div className="text-2xl font-bold text-slate-900 mt-1">0 筆</div>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
              <div className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-1">賣出筆數</div>
              <div className="text-2xl font-bold text-slate-900 mt-1">0 筆</div>
            </div>
          </div>
        ) : (
          Object.entries(currencyTotals)
            .sort(([a], [b]) => (a === "USD" ? -1 : b === "USD" ? 1 : a.localeCompare(b)))
            .map(([currency, amount]) => (
              <div key={currency}>
                <div className="text-xs font-semibold text-slate-400 mb-1.5">{currency}</div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">淨投入金額</div>
                    <div className={`text-2xl font-bold mt-1 ${amount >= 0 ? "text-slate-900" : "text-red-500"}`}>{fmtCur(amount, currency)}</div>
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
              </div>
            ))
        )}
        <p className="text-[11px] text-slate-400">換算台幣的總金額改在「資產總攬」頁統一處理</p>
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
                  <th className="text-left font-semibold px-6 py-3">代碼</th>
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
                    <td className="px-6 py-3 text-right text-slate-700">{h.quantity.toLocaleString("en-US")}</td>
                    <td className="px-6 py-3 text-right text-slate-700">{h.cost.toLocaleString("en-US", { maximumFractionDigits: 2 })}</td>
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
            <p className="text-slate-400 text-sm mb-3">還沒有美股投資記錄</p>
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
                      {inv.fee ? ` · 手續費 ${fmtCur(inv.fee, inv.currency || "USD")}` : ""}
                      {inv.note ? ` · ${inv.note}` : ""}
                      {inv.transactionId && <span className="ml-1 text-indigo-400">· 已連結支出</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`text-sm font-semibold ${inv.amount >= 0 ? "text-slate-700" : "text-red-500"}`}>
                    {fmtCur(Math.abs(inv.amount), inv.currency || "USD")}
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
            <h2 className="text-lg font-bold text-slate-900 mb-5">新增美股記錄</h2>
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
                <label className="block text-sm font-medium text-slate-700 mb-1.5">券商（選填）</label>
                <Combobox
                  value={addForm.broker}
                  onChange={(v) => setAddForm({ ...addForm, broker: v })}
                  options={allBrokers}
                  placeholder="搜尋或選擇券商"
                />
                {addBrokerOpen ? (
                  <div className="flex gap-2 mt-2">
                    <input value={addBrokerInput} onChange={(e) => setAddBrokerInput(e.target.value)}
                      placeholder="輸入券商名稱"
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
                    + 找不到？申請新增券商
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">名稱（選填）</label>
                  <input value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                    placeholder="例如：Apple" className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">代碼（選填）</label>
                  <input value={addForm.code} onChange={(e) => setAddForm({ ...addForm, code: e.target.value.toUpperCase() })}
                    placeholder="例如：AAPL" className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">幣別</label>
                <select value={addForm.currency} onChange={(e) => setAddForm({ ...addForm, currency: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors">
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">股數</label>
                  <input required type="number" min="0" step="any" value={addForm.quantity}
                    onChange={(e) => setAddForm({ ...addForm, quantity: e.target.value })} placeholder="例如：10"
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">每股價格</label>
                  <input required type="number" min="0" step="any" value={addForm.price}
                    onChange={(e) => setAddForm({ ...addForm, price: e.target.value })} placeholder="例如：190"
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">手續費（選填）</label>
                <input type="number" min="0" step="any" value={addForm.fee}
                  onChange={(e) => setAddForm({ ...addForm, fee: e.target.value })} placeholder="例如：0"
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                <p className="text-[11px] text-slate-400 mt-1">美股/複委託的手續費計算方式券商各不相同，直接填實際金額</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">備註（選填）</label>
                <input value={addForm.note} onChange={(e) => setAddForm({ ...addForm, note: e.target.value })}
                  placeholder="備註..." className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">調帳金額（選填）</label>
                <input type="number" min="0" step="any" value={addForm.adjustAmount}
                  onChange={(e) => setAddForm({ ...addForm, adjustAmount: e.target.value })}
                  placeholder={`試算為 ${calcSubtotal.toFixed(2)}，如與實際金額不同可在此輸入覆蓋`}
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                <p className="text-[11px] text-slate-400 mt-1">留空則採用下方自動試算的小計；填寫後將以此金額為準</p>
              </div>

              {/* 試算小計 */}
              <div className="bg-slate-50 rounded-xl px-4 py-3 space-y-1.5">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>成交金額</span><span>{principal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>手續費</span><span>{fee.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>自動試算小計</span><span>{calcSubtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold text-slate-900 pt-1.5 border-t border-slate-200">
                  <span>{addForm.action === "BUY" ? "最終小計（應付）" : "最終小計（應收）"}（{addForm.currency}）</span>
                  <span>{subtotal.toFixed(2)}{addForm.adjustAmount !== "" && <span className="text-[10px] font-normal text-indigo-500 ml-1">（已調帳）</span>}</span>
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
            <h2 className="text-lg font-bold text-slate-900 mb-5">編輯美股記錄</h2>
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
                <label className="block text-sm font-medium text-slate-700 mb-1.5">券商（選填）</label>
                <Combobox
                  value={editForm.broker}
                  onChange={(v) => setEditForm({ ...editForm, broker: v })}
                  options={allBrokers}
                  placeholder="搜尋或選擇券商"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">幣別</label>
                <select value={editForm.currency} onChange={(e) => setEditForm({ ...editForm, currency: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors">
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  {editForm.currency && !CURRENCIES.includes(editForm.currency) && (
                    <option value={editForm.currency}>{editForm.currency}</option>
                  )}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">名稱（選填）</label>
                <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="例如：Apple" className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">代碼（選填）</label>
                <input value={editForm.code} onChange={(e) => setEditForm({ ...editForm, code: e.target.value.toUpperCase() })}
                  placeholder="例如：AAPL" className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">股數（選填）</label>
                <input type="number" step="any" value={editForm.quantity}
                  onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })} placeholder="例如：10"
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">備註（選填）</label>
                <input value={editForm.note} onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
                  placeholder="備註..." className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>
              <p className="text-[11px] text-slate-400">金額、手續費如需調整，請刪除後重新新增以確保試算正確</p>
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
