"use client";

import { useEffect, useState } from "react";

type InvestmentType = "STOCK" | "FUND" | "FOREX" | "CRYPTO" | "GOLD" | "REALESTATE" | "INSURANCE";

interface Investment {
  id: string;
  type: InvestmentType;
  name?: string;
  code?: string;
  amount: number;
  quantity?: number;
  note?: string;
  transactionId?: string;
  createdAt: string;
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
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Investment | null>(null);
  const [editForm, setEditForm] = useState({ name: "", code: "", quantity: "", note: "" });
  const [saving, setSaving] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    const res = await fetch("/api/investments");
    const data = await res.json();
    setInvestments(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

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

  const fmt = (n: number) =>
    new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(n);

  const total = investments.reduce((s, i) => s + i.amount, 0);
  const byType = (t: InvestmentType) => investments.filter((i) => i.type === t);

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">投資總攬</h1>
        <p className="text-slate-500 text-sm mt-1">所有投資項目一覽</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">總投資</div>
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
          <h2 className="font-semibold text-slate-900">全部記錄</h2>
        </div>
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm">載入中...</div>
        ) : investments.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            還沒有投資記錄<br />
            <span className="text-xs mt-1 block">請在「收支記錄」中選擇「支出 → 投資」分類來新增</span>
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
