"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { authFetch } from "@/lib/api-fetch";

// 投資試算表：可以同時存多個方案（例如不同股票各一個），逐月明細的參數（每月投入金額、
// 手續費、買進價格、配息、抽稅後可得比例）都可以一格一格手動改成實際發生的數字，
// 買進股數／持有股數／實際配息／累計配息／推估總資產都是前端依序算出來的，不存進資料庫，
// 改掉中間某一列的參數，後面所有月份的累計數字會自動跟著連動。

interface PlanSummary {
  id: string;
  name: string;
  targetAmount: number | null;
  createdAt: string;
  _count: { rows: number };
}

interface PlanRow {
  id: string;
  year: number;
  month: number;
  investment: number;
  fee: number;
  price: number;
  dividendRate: number;
  afterTaxRate: number;
}

interface PlanDetail {
  id: string;
  name: string;
  targetAmount: number | null;
  rows: PlanRow[];
}

interface ComputedRow extends PlanRow {
  sharesBought: number;
  holdingShares: number;
  dividend: number;
  cumulativeDividend: number;
  assetValue: number;
}

const EMPTY_CREATE_FORM = {
  name: "",
  startYear: new Date().getFullYear(),
  startMonth: new Date().getMonth() + 1,
  years: "10",
  monthlyInvestment: "150",
  fee: "0.17",
  price: "54.8484",
  dividendPerShare: "0.6339",
  afterTaxRate: "70",
  targetAmount: "",
};

export default function InvestmentCalculatorPage() {
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [planDetail, setPlanDetail] = useState<PlanDetail | null>(null);
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);
  const [creating, setCreating] = useState(false);

  const [targetInput, setTargetInput] = useState("");
  const [addingRow, setAddingRow] = useState(false);

  const fmt = (n: number) =>
    new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(n);
  const fmtQty = (n: number) => new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 4 }).format(n);

  const fetchPlans = useCallback(async () => {
    setLoadingPlans(true);
    const res = await fetch("/api/calculator-plans");
    const data = await res.json();
    const list = Array.isArray(data) ? data : [];
    setPlans(list);
    setLoadingPlans(false);
    return list as PlanSummary[];
  }, []);

  const fetchDetail = useCallback(async (id: string) => {
    if (!id) { setPlanDetail(null); setRows([]); return; }
    setLoadingDetail(true);
    const res = await fetch(`/api/calculator-plans/${id}`);
    if (res.ok) {
      const data: PlanDetail = await res.json();
      setPlanDetail(data);
      setRows(data.rows);
      setTargetInput(data.targetAmount != null ? String(data.targetAmount) : "");
    }
    setLoadingDetail(false);
  }, []);

  useEffect(() => {
    fetchPlans().then((list) => {
      if (list.length > 0) setSelectedId(list[list.length - 1].id);
    });
  }, [fetchPlans]);

  useEffect(() => { if (selectedId) fetchDetail(selectedId); }, [selectedId, fetchDetail]);

  const openCreate = () => {
    setCreateForm({ ...EMPTY_CREATE_FORM, name: "" });
    setShowCreateModal(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.name.trim()) {
      alert("請填寫方案名稱（例如股票名稱）");
      return;
    }
    setCreating(true);
    const res = await authFetch("/api/calculator-plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createForm),
    });
    setCreating(false);
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      alert(err?.error || "建立失敗，請稍後再試");
      return;
    }
    const created = await res.json();
    setShowCreateModal(false);
    await fetchPlans();
    setSelectedId(created.id);
  };

  const handleDeletePlan = async () => {
    if (!planDetail) return;
    if (!confirm(`確定要刪除「${planDetail.name}」這個試算方案？所有逐月記錄都會一起刪除。`)) return;
    await authFetch(`/api/calculator-plans/${planDetail.id}`, { method: "DELETE" });
    const list = await fetchPlans();
    setSelectedId(list.length > 0 ? list[list.length - 1].id : "");
  };

  const saveTarget = async () => {
    if (!planDetail) return;
    await authFetch(`/api/calculator-plans/${planDetail.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetAmount: targetInput }),
    });
    fetchPlans();
  };

  // 本地先更新畫面（打字流暢），失去焦點時才存檔，避免每打一個字就打一次 API
  const updateLocalRow = (rowId: string, field: keyof PlanRow, value: string) => {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, [field]: parseFloat(value) || 0 } : r)));
  };

  const saveRow = async (row: PlanRow) => {
    await authFetch(`/api/calculator-plan-rows/${row.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        investment: row.investment, fee: row.fee, price: row.price,
        dividendRate: row.dividendRate, afterTaxRate: row.afterTaxRate,
      }),
    });
  };

  const handleAddRow = async () => {
    if (!planDetail) return;
    setAddingRow(true);
    const res = await authFetch(`/api/calculator-plans/${planDetail.id}/rows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    setAddingRow(false);
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      alert(err?.error || "新增失敗");
      return;
    }
    fetchDetail(planDetail.id);
  };

  const handleDeleteRow = async (rowId: string) => {
    if (!confirm("確定要刪除這一列？")) return;
    await authFetch(`/api/calculator-plan-rows/${rowId}`, { method: "DELETE" });
    if (planDetail) fetchDetail(planDetail.id);
  };

  // 依序把每列的輸入參數算成買進股數／持有股數／實際配息／累計配息／推估總資產
  const { computed, targetRow } = useMemo(() => {
    let holdingShares = 0;
    let cumulativeDividend = 0;
    const list: ComputedRow[] = [];
    const target = planDetail?.targetAmount ?? 0;
    let foundTarget: ComputedRow | null = null;

    for (const r of rows) {
      const dividend = holdingShares * r.dividendRate * r.afterTaxRate;
      cumulativeDividend += dividend;
      const sharesBought = r.price > 0 ? Math.max(0, r.investment - r.fee) / r.price : 0;
      holdingShares += sharesBought;
      const assetValue = holdingShares * r.price + cumulativeDividend;
      const row: ComputedRow = { ...r, sharesBought, holdingShares, dividend, cumulativeDividend, assetValue };
      list.push(row);
      if (!foundTarget && target > 0 && assetValue >= target) foundTarget = row;
    }
    return { computed: list, targetRow: foundTarget };
  }, [rows, planDetail?.targetAmount]);

  const last = computed[computed.length - 1];
  const totalPrincipal = rows.reduce((s, r) => s + r.investment, 0);

  return (
    <div className="w-full max-w-7xl">
      <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">投資試算表</h1>
          <p className="text-slate-500 text-sm mt-1">每檔股票／基金可以各存一個方案，逐月參數可以隨時改成實際發生的數字</p>
        </div>
        <button onClick={openCreate}
          className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors">
          + 新增試算方案
        </button>
      </div>

      {/* 方案選擇 */}
      {!loadingPlans && plans.length > 0 && (
        <div className="flex items-center gap-3 mb-6">
          <label className="text-sm font-medium text-slate-600">試算方案</label>
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white min-w-[200px]">
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}（{p._count.rows} 個月）</option>)}
          </select>
          {planDetail && (
            <button onClick={handleDeletePlan} className="text-xs text-red-500 hover:underline">刪除此方案</button>
          )}
        </div>
      )}

      {loadingPlans ? (
        <div className="py-16 text-center text-slate-400 text-sm">載入中...</div>
      ) : plans.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm py-16 text-center">
          <p className="text-slate-400 text-sm mb-3">還沒有任何試算方案</p>
          <button onClick={openCreate} className="text-sm text-indigo-600 font-medium hover:underline">新增第一個試算方案</button>
        </div>
      ) : loadingDetail || !planDetail ? (
        <div className="py-16 text-center text-slate-400 text-sm">載入方案中...</div>
      ) : (
        <>
          {/* 目標資產設定 */}
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm mb-6">
            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-sm font-medium text-slate-700">目標資產（選填）</label>
              <input type="number" min="0" step="any" value={targetInput}
                onChange={(e) => setTargetInput(e.target.value)} onBlur={saveTarget}
                placeholder="例如：1000000"
                className="w-48 border border-slate-200 rounded-lg px-3.5 py-2 text-sm focus:border-indigo-400 transition-colors" />
              <span className="text-xs text-slate-400">填了之後，下面逐月明細達成目標的那一列會特別標示</span>
            </div>
          </div>

          {/* 目標達成預估 */}
          {planDetail.targetAmount != null && planDetail.targetAmount > 0 && (
            <div className={`rounded-2xl p-5 border shadow-sm mb-6 ${targetRow ? "bg-emerald-50 border-emerald-100" : "bg-amber-50 border-amber-100"}`}>
              {targetRow ? (
                <>
                  <div className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-1">預估達成時間</div>
                  <div className="text-2xl font-bold text-emerald-700">
                    {targetRow.year} 年 {targetRow.month} 月
                    <span className="text-sm font-medium text-emerald-600 ml-2">
                      （第 {computed.indexOf(targetRow) + 1} 個月，約 {((computed.indexOf(targetRow) + 1) / 12).toFixed(1)} 年）
                    </span>
                  </div>
                  <div className="text-xs text-emerald-600 mt-1">當月推估總資產 {fmt(targetRow.assetValue)}</div>
                </>
              ) : (
                <div className="text-sm text-amber-700">
                  目前明細（共 {rows.length} 個月）裡還沒有達到目標 {fmt(planDetail.targetAmount)}，可以在表格最下面「+ 新增月份」繼續延伸試算。
                </div>
              )}
            </div>
          )}

          {/* 總覽 */}
          {last && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">目前累計持股</div>
                <div className="text-xl font-bold text-slate-900 mt-1">{fmtQty(last.holdingShares)} 股</div>
              </div>
              <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">累計投入本金</div>
                <div className="text-xl font-bold text-slate-900 mt-1">{fmt(totalPrincipal)}</div>
              </div>
              <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                <div className="text-xs font-semibold text-emerald-500 uppercase tracking-wider mb-1">累計配息現金</div>
                <div className="text-xl font-bold text-emerald-600 mt-1">{fmt(last.cumulativeDividend)}</div>
              </div>
              <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                <div className="text-xs font-semibold text-indigo-500 uppercase tracking-wider mb-1">推估總資產</div>
                <div className="text-xl font-bold text-indigo-600 mt-1">{fmt(last.assetValue)}</div>
              </div>
            </div>
          )}

          {/* 逐月明細表（可編輯） */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50">
              <h2 className="font-semibold text-slate-900">逐月試算明細</h2>
              <span className="text-xs text-slate-400">白底欄位可以直接點擊修改，改完按 Tab 或點別處就會自動存檔</span>
            </div>
            <div className="overflow-auto max-h-[600px]">
              <table className="w-full text-sm whitespace-nowrap">
                <thead className="sticky top-0 bg-slate-50 z-10">
                  <tr className="text-xs text-slate-500">
                    <th className="px-3 py-2.5 text-left font-semibold">年份</th>
                    <th className="px-3 py-2.5 text-left font-semibold">月份</th>
                    <th className="px-3 py-2.5 text-right font-semibold">每月投入金額</th>
                    <th className="px-3 py-2.5 text-right font-semibold">持有股數</th>
                    <th className="px-3 py-2.5 text-right font-semibold">手續費</th>
                    <th className="px-3 py-2.5 text-right font-semibold">買進價格</th>
                    <th className="px-3 py-2.5 text-right font-semibold">買進股數</th>
                    <th className="px-3 py-2.5 text-right font-semibold">每股配息</th>
                    <th className="px-3 py-2.5 text-right font-semibold">稅後可得%</th>
                    <th className="px-3 py-2.5 text-right font-semibold">實際配息</th>
                    <th className="px-3 py-2.5 text-right font-semibold">累計配息</th>
                    <th className="px-3 py-2.5 text-right font-semibold">推估總資產</th>
                    <th className="px-3 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {computed.map((r, i) => (
                    <tr key={r.id} className={`group hover:bg-slate-50 transition-colors ${targetRow === r ? "bg-emerald-50" : ""}`}>
                      <td className="px-3 py-1.5 text-slate-700">{i === 0 || r.month === 1 ? r.year : ""}</td>
                      <td className="px-3 py-1.5 text-slate-700">{r.month}</td>
                      <td className="px-1 py-1">
                        <input type="number" step="any" defaultValue={r.investment}
                          onChange={(e) => updateLocalRow(r.id, "investment", e.target.value)}
                          onBlur={() => saveRow(rows.find((x) => x.id === r.id)!)}
                          className="w-24 text-right px-2 py-1 border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded text-sm" />
                      </td>
                      <td className="px-3 py-1.5 text-right text-slate-700">{fmtQty(r.holdingShares)}</td>
                      <td className="px-1 py-1">
                        <input type="number" step="any" defaultValue={r.fee}
                          onChange={(e) => updateLocalRow(r.id, "fee", e.target.value)}
                          onBlur={() => saveRow(rows.find((x) => x.id === r.id)!)}
                          className="w-16 text-right px-2 py-1 border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded text-sm" />
                      </td>
                      <td className="px-1 py-1">
                        <input type="number" step="any" defaultValue={r.price}
                          onChange={(e) => updateLocalRow(r.id, "price", e.target.value)}
                          onBlur={() => saveRow(rows.find((x) => x.id === r.id)!)}
                          className="w-20 text-right px-2 py-1 border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded text-sm" />
                      </td>
                      <td className="px-3 py-1.5 text-right text-slate-700">{fmtQty(r.sharesBought)}</td>
                      <td className="px-1 py-1">
                        <input type="number" step="any" defaultValue={r.dividendRate}
                          onChange={(e) => updateLocalRow(r.id, "dividendRate", e.target.value)}
                          onBlur={() => saveRow(rows.find((x) => x.id === r.id)!)}
                          className="w-16 text-right px-2 py-1 border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded text-sm" />
                      </td>
                      <td className="px-1 py-1">
                        <input type="number" step="any" min="0" max="100" defaultValue={r.afterTaxRate * 100}
                          onChange={(e) => updateLocalRow(r.id, "afterTaxRate", String((parseFloat(e.target.value) || 0) / 100))}
                          onBlur={() => saveRow(rows.find((x) => x.id === r.id)!)}
                          className="w-14 text-right px-2 py-1 border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded text-sm" />
                      </td>
                      <td className="px-3 py-1.5 text-right text-emerald-600 font-medium">{fmtQty(r.dividend)}</td>
                      <td className="px-3 py-1.5 text-right text-emerald-700 font-semibold">{fmtQty(r.cumulativeDividend)}</td>
                      <td className="px-3 py-1.5 text-right text-indigo-600 font-semibold">{fmt(r.assetValue)}</td>
                      <td className="px-2 py-1.5">
                        <button onClick={() => handleDeleteRow(r.id)}
                          className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 text-xs transition-opacity">刪除</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-3.5 border-t border-slate-50">
              <button onClick={handleAddRow} disabled={addingRow}
                className="text-sm text-indigo-600 font-medium hover:underline disabled:opacity-60">
                {addingRow ? "新增中..." : "+ 新增月份（延伸試算）"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* 新增方案 Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-slate-900 mb-1">新增試算方案</h2>
            <p className="text-xs text-slate-400 mb-5">這裡只是用來產生逐月明細的初始設定，之後每個月的參數都可以在下面表格裡個別修改</p>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">方案名稱</label>
                <input required value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder="例如：元大高股息 0056"
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">起始年份</label>
                  <input type="number" value={createForm.startYear}
                    onChange={(e) => setCreateForm({ ...createForm, startYear: parseInt(e.target.value) || createForm.startYear })}
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">起始月份</label>
                  <select value={createForm.startMonth} onChange={(e) => setCreateForm({ ...createForm, startMonth: parseInt(e.target.value) })}
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors">
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((mo) => <option key={mo} value={mo}>{mo} 月</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">試算年數（最多 50，之後還能逐月延伸）</label>
                <input type="number" min="1" max="50" value={createForm.years}
                  onChange={(e) => setCreateForm({ ...createForm, years: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">每月投入金額</label>
                  <input type="number" min="0" step="any" value={createForm.monthlyInvestment}
                    onChange={(e) => setCreateForm({ ...createForm, monthlyInvestment: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">買進價格</label>
                  <input type="number" min="0" step="any" value={createForm.price}
                    onChange={(e) => setCreateForm({ ...createForm, price: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">手續費</label>
                  <input type="number" min="0" step="any" value={createForm.fee}
                    onChange={(e) => setCreateForm({ ...createForm, fee: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">每股配息（月）</label>
                  <input type="number" min="0" step="any" value={createForm.dividendPerShare}
                    onChange={(e) => setCreateForm({ ...createForm, dividendPerShare: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">抽稅後可得配息%</label>
                  <input type="number" min="0" max="100" step="any" value={createForm.afterTaxRate}
                    onChange={(e) => setCreateForm({ ...createForm, afterTaxRate: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">目標資產（選填）</label>
                  <input type="number" min="0" step="any" value={createForm.targetAmount}
                    onChange={(e) => setCreateForm({ ...createForm, targetAmount: e.target.value })} placeholder="例如：1000000"
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                  取消
                </button>
                <button type="submit" disabled={creating}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-60">
                  {creating ? "建立中..." : "建立方案"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
