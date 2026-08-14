"use client";

import { useEffect, useState, useCallback } from "react";

type InvestmentType = "STOCK" | "FUND" | "FOREX" | "CRYPTO" | "GOLD" | "REALESTATE" | "INSURANCE";

interface Investment {
  id: string;
  type: InvestmentType;
  name?: string;
  code?: string;
  amount: number;
  quantity?: number;
  currency?: string;
  exchangeRate?: number;
  note?: string;
  transactionId?: string;
  createdAt: string;
}

interface BankSummary {
  name: string;
  balance: number;
}

interface Debt {
  id: string;
  category: string;
  amount: number;
}

const TYPE_LABEL: Record<InvestmentType, string> = {
  STOCK: "股票",
  FUND: "基金",
  FOREX: "外匯",
  CRYPTO: "虛擬貨幣",
  GOLD: "黃金",
  REALESTATE: "不動產",
  INSURANCE: "保險",
};

const TYPE_COLOR: Record<InvestmentType, string> = {
  STOCK: "bg-blue-100 text-blue-700",
  FUND: "bg-emerald-100 text-emerald-700",
  FOREX: "bg-amber-100 text-amber-700",
  CRYPTO: "bg-orange-100 text-orange-700",
  GOLD: "bg-yellow-100 text-yellow-700",
  REALESTATE: "bg-teal-100 text-teal-700",
  INSURANCE: "bg-purple-100 text-purple-700",
};

export default function InvestmentOverviewPage() {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [banks, setBanks] = useState<BankSummary[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Investment | null>(null);
  const [editForm, setEditForm] = useState({ name: "", code: "", quantity: "", note: "" });
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [invRes, bankRes, debtRes] = await Promise.all([
      fetch("/api/investments"),
      fetch("/api/banks/summary"),
      fetch("/api/debts"),
    ]);
    const [invData, bankData, debtData] = await Promise.all([invRes.json(), bankRes.json(), debtRes.json()]);
    setInvestments(Array.isArray(invData) ? invData : []);
    setBanks(Array.isArray(bankData) ? bankData : []);
    setDebts(Array.isArray(debtData) ? debtData : []);
    setLoading(false);
  }, []);

  // 每次進入頁面都重新抓取，確保各細項餘額有變動時這裡會同步顯示最新金額
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openEdit = (inv: Investment) => {
    setEditing(inv);
    setEditForm({
      name: inv.name ?? "",
      code: inv.code ?? "",
      quantity: inv.quantity ? String(inv.quantity) : "",
      note: inv.note ?? "",
    });
  };

  const handleSave = async (e: React.FormEvent) => {
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

  const fmt = (n: number) =>
    new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(n);

  const byType = (t: InvestmentType) => investments.filter((i) => i.type === t);
  const sumAmount = (list: Investment[]) => list.reduce((s, i) => s + i.amount, 0);

  // 各幣別買入平均匯率：取自外匯投資頁同一套邏輯（僅計「買入外幣」，依每筆外幣數量×匯率加權），
  // 用來把基金頁存的外幣原始金額換算回台幣
  const currencyRates: Record<string, number> = { TWD: 1 };
  {
    const rateStats: Record<string, { twd: number; foreign: number }> = {};
    for (const i of byType("FOREX")) {
      if (i.currency && i.amount > 0 && (i.quantity || 0) > 0 && i.exchangeRate) {
        if (!rateStats[i.currency]) rateStats[i.currency] = { twd: 0, foreign: 0 };
        rateStats[i.currency].twd += (i.quantity || 0) * i.exchangeRate;
        rateStats[i.currency].foreign += i.quantity || 0;
      }
    }
    for (const [cur, s] of Object.entries(rateStats)) {
      if (s.foreign > 0) currencyRates[cur] = s.twd / s.foreign;
    }
  }

  const fundInvestments = byType("FUND");
  const fundHasUnratedCurrency = fundInvestments.some((i) => {
    const cur = i.currency || "TWD";
    return cur !== "TWD" && currencyRates[cur] === undefined;
  });
  const fundTwdTotal = fundInvestments.reduce((s, i) => {
    const cur = i.currency || "TWD";
    const rate = currencyRates[cur] ?? 1;
    return s + i.amount * rate;
  }, 0);

  const bankTotal = banks.reduce((s, b) => s + b.balance, 0);
  const stockTotal = sumAmount(byType("STOCK"));
  const forexTotal = sumAmount(byType("FOREX"));
  const cryptoTotal = sumAmount(byType("CRYPTO"));
  const goldTotal = sumAmount(byType("GOLD"));
  const realestateTotal = sumAmount(byType("REALESTATE"));
  const insuranceTotal = sumAmount(byType("INSURANCE"));
  const debtTotal = debts.reduce((s, d) => s + d.amount, 0);

  const positiveAssetsTotal = bankTotal + stockTotal + fundTwdTotal + forexTotal + cryptoTotal + goldTotal + realestateTotal + insuranceTotal;
  // 資產負債總計＝正資產總計 − 負債表總額
  const netWorth = positiveAssetsTotal - debtTotal;

  const assetBreakdown = [
    { label: "銀行資產", amount: bankTotal },
    { label: "股票投資", amount: stockTotal },
    { label: "基金投資（已換算台幣）", amount: fundTwdTotal },
    { label: "外匯投資", amount: forexTotal },
    { label: "虛擬貨幣", amount: cryptoTotal },
    { label: "黃金投資", amount: goldTotal },
    { label: "不動產投資", amount: realestateTotal },
    { label: "保險投資", amount: insuranceTotal },
  ];

  const debtByCategory = debts.reduce((acc, d) => {
    acc[d.category] = (acc[d.category] || 0) + d.amount;
    return acc;
  }, {} as Record<string, number>);

  const total = investments.reduce((s, i) => s + i.amount, 0);

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">資產總攬</h1>
        <p className="text-slate-500 text-sm mt-1">銀行、投資與負債一覽</p>
      </div>

      {/* 淨資產三大卡片 */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">正資產總計</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{fmt(positiveAssetsTotal)}</div>
        </div>
        <div className="bg-red-50 rounded-2xl p-5 border border-red-100 shadow-sm">
          <div className="text-xs font-semibold text-red-500 uppercase tracking-wider mb-1">負債總額</div>
          <div className="text-2xl font-bold text-red-600 mt-1">{fmt(debtTotal)}</div>
        </div>
        <div className="bg-indigo-50 rounded-2xl p-5 border border-indigo-100 shadow-sm">
          <div className="text-xs font-semibold text-indigo-500 uppercase tracking-wider mb-1">資產負債總計</div>
          <div className={`text-2xl font-bold mt-1 ${netWorth >= 0 ? "text-indigo-700" : "text-red-600"}`}>{fmt(netWorth)}</div>
          <div className="text-xs text-slate-400 mt-0.5">正資產總計 − 負債總額</div>
        </div>
      </div>

      {/* 各項資產明細 */}
      <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm mb-8">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">各項資產明細</div>
        <div className="divide-y divide-slate-50">
          {assetBreakdown.map((row) => (
            <div key={row.label} className="flex items-center justify-between py-2 text-sm">
              <span className="text-slate-600">{row.label}</span>
              <span className="font-semibold text-slate-900">{fmt(row.amount)}</span>
            </div>
          ))}
        </div>
        {fundHasUnratedCurrency && (
          <p className="text-[11px] text-slate-400 mt-2">部分基金幣別在外匯投資頁尚無買入匯率記錄，暫以 1:1 換算，實際金額可能有落差</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        {/* 銀行別餘額 */}
        {banks.length > 0 && (
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">銀行別餘額</div>
            <div className="space-y-2">
              {banks.map((b) => (
                <div key={b.name} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">{b.name}</span>
                  <span className={`font-semibold ${b.balance >= 0 ? "text-slate-900" : "text-red-500"}`}>{fmt(b.balance)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 負債分類明細 */}
        {Object.keys(debtByCategory).length > 0 && (
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">負債分類明細</div>
            <div className="space-y-2">
              {Object.entries(debtByCategory).map(([category, amount]) => (
                <div key={category} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">{category}</span>
                  <span className={`font-semibold ${amount > 0 ? "text-red-500" : "text-slate-900"}`}>{fmt(amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 投資類型筆數統計 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">總投資（不含銀行/負債）</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{fmt(total)}</div>
          <div className="text-xs text-slate-400 mt-0.5">{investments.length} 筆</div>
        </div>
        {(["STOCK", "FUND", "FOREX", "CRYPTO", "GOLD", "REALESTATE", "INSURANCE"] as InvestmentType[]).map((type) => (
          <div key={type} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{TYPE_LABEL[type]}</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              {fmt(byType(type).reduce((s, i) => s + i.amount, 0))}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">{byType(type).length} 筆</div>
          </div>
        ))}
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-50">
          <h2 className="font-semibold text-slate-900">全部投資記錄</h2>
        </div>
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm">載入中...</div>
        ) : investments.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            還沒有投資記錄<br />
            <span className="text-xs mt-1 block">請到左側各投資項目頁面新增記錄</span>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {investments.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors group">
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${TYPE_COLOR[inv.type]}`}>
                    {TYPE_LABEL[inv.type]}
                  </span>
                  <div>
                    <div className="text-sm font-medium text-slate-800">
                      {inv.name || "(未命名)"}
                      {inv.code && (
                        <span className="ml-2 text-xs text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">
                          {inv.code}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {new Date(inv.createdAt).toLocaleDateString("zh-TW")}
                      {inv.quantity ? ` · ${inv.quantity} 單位` : ""}
                      {inv.note ? ` · ${inv.note}` : ""}
                      {inv.transactionId && <span className="ml-1 text-indigo-400">· 已連結支出</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`text-sm font-semibold ${inv.amount >= 0 ? "text-slate-700" : "text-red-500"}`}>{fmt(inv.amount)}</span>
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

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-1">編輯投資記錄</h2>
            <p className="text-xs text-slate-400 mb-5">
              {TYPE_LABEL[editing.type]} · {new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(editing.amount)}
            </p>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">名稱（選填）</label>
                <input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="例如：台積電、元大高股息"
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">代碼（選填）</label>
                <input
                  value={editForm.code}
                  onChange={(e) => setEditForm({ ...editForm, code: e.target.value })}
                  placeholder="例如：2330、00878"
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">數量（選填）</label>
                <input
                  type="number"
                  step="any"
                  value={editForm.quantity}
                  onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
                  placeholder="例如：1000（股）"
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">備註（選填）</label>
                <input
                  value={editForm.note}
                  onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
                  placeholder="備註..."
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors"
                />
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
