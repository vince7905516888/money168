"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { authFetch } from "@/lib/api-fetch";

// 投資試算表：可以同時存多個方案（例如不同股票各一個），逐月明細的參數（每月投入金額、
// 手續費、買進價格、配息、抽稅後可得比例）都可以一格一格手動改成實際發生的數字，
// 買進股數／持有股數／實際配息／累計配息／推估總資產都是前端依序算出來的，不存進資料庫，
// 改掉中間某一列的參數，後面所有月份的累計數字會自動跟著連動。

type DividendFrequency = "MONTHLY" | "QUARTERLY_1" | "QUARTERLY_2" | "QUARTERLY_3";
// USSTOCK：每月投入固定金額，股數隨價格換算，配息累積現金不自動買股
// TWSTOCK：每月買進股數固定遞增，配息累積夠買 1 張（1000 股）的金額就自動加碼買股、零頭留到下個月
type PlanMode = "USSTOCK" | "TWSTOCK";

// 季配息三種常見週期：配息月份分別落在 1.4.7.10 / 2.5.8.11 / 3.6.9.12 月
const QUARTERLY_MONTHS: Record<string, number[]> = {
  QUARTERLY_1: [1, 4, 7, 10],
  QUARTERLY_2: [2, 5, 8, 11],
  QUARTERLY_3: [3, 6, 9, 12],
};

// 台股版配息加碼：累積配息要夠買滿「1 張」（1000 股）才會加碼，且只能整張買，不是夠買 1 股就買
const DIVIDEND_REINVEST_LOT_SIZE = 1000;

interface PlanSummary {
  id: string;
  name: string;
  targetAmount: number | null;
  dividendFrequency: DividendFrequency;
  mode: PlanMode;
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
  holdingSharesOverride: number | null;
  dividendOverride: number | null;
  sharesToBuy: number | null;
}

interface PlanDetail {
  id: string;
  name: string;
  targetAmount: number | null;
  dividendFrequency: DividendFrequency;
  mode: PlanMode;
  shareIncrement: number | null;
  startingAssetValue: number;
  startingAvgPrice: number | null;
  rows: PlanRow[];
}

interface ComputedRow extends PlanRow {
  sharesBought: number; // 這個月新買進的股數（含配息加碼買的部分，TWSTOCK 才有）
  dividendShares: number; // TWSTOCK：配息加碼買到的股數
  holdingShares: number;
  dividend: number; // 這個月產生的配息金額
  cumulativeDividend: number; // 累計產生的配息金額（USSTOCK：還沒投入的現金；TWSTOCK：歷史累計產生總額，僅供參考）
  pendingDividendCash: number; // TWSTOCK：還不夠買滿 1 張、留到下個月的配息零頭
  assetValue: number;
  isPaymentMonth: boolean;
  avgPrice: number; // 累計持股均價＝累計實際投入金額 ÷ 累計持股數
}

const EMPTY_CREATE_FORM = {
  name: "",
  mode: "USSTOCK" as PlanMode,
  startYear: new Date().getFullYear(),
  startMonth: new Date().getMonth() + 1,
  years: "10",
  monthlyInvestment: "150",
  fee: "0.17",
  price: "54.8484",
  dividendPerShare: "0.6339",
  afterTaxRate: "70",
  dividendFrequency: "MONTHLY" as DividendFrequency,
  targetAmount: "",
  startShares: "2000",
  shareIncrement: "2000",
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

  const saveFrequency = async (frequency: DividendFrequency) => {
    if (!planDetail) return;
    setPlanDetail({ ...planDetail, dividendFrequency: frequency });
    await authFetch(`/api/calculator-plans/${planDetail.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dividendFrequency: frequency }),
    });
  };

  // 開始試算前既有的持有金額／持股均價：只有第一列可以改，當作整個方案的起始基準
  const saveStartingAssetValue = async (value: string) => {
    if (!planDetail) return;
    const num = parseFloat(value) || 0;
    setPlanDetail({ ...planDetail, startingAssetValue: num });
    await authFetch(`/api/calculator-plans/${planDetail.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startingAssetValue: num }),
    });
  };

  const saveStartingAvgPrice = async (value: string) => {
    if (!planDetail) return;
    const num = value === "" ? null : (parseFloat(value) || 0);
    setPlanDetail({ ...planDetail, startingAvgPrice: num });
    await authFetch(`/api/calculator-plans/${planDetail.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startingAvgPrice: num }),
    });
  };

  // 本地先更新畫面（打字流暢），失去焦點時才存檔，避免每打一個字就打一次 API
  const updateLocalRow = (rowId: string, field: keyof PlanRow, value: string) => {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, [field]: parseFloat(value) || 0 } : r)));
  };

  // 持有股數／實際配息覆蓋欄位：清空代表「不要覆蓋、改回照公式算」，跟其他欄位不同，空字串要存成 null 而不是 0
  const updateLocalOverride = (rowId: string, field: "holdingSharesOverride" | "dividendOverride", value: string) => {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, [field]: value === "" ? null : (parseFloat(value) || 0) } : r)));
  };

  // 套用到之後所有月份：把某一列目前的值（每月投入金額／買進價格等）往後批次套用到後面所有月份，
  // 不影響這一列本身跟之前的月份，用來反映「薪水變多/股價假設調整後，之後每個月都改用新數字」
  const applyForward = async (row: PlanRow, field: "investment" | "price" | "sharesToBuy", value: number) => {
    if (!planDetail) return;
    const fieldLabel = field === "investment" ? "每月投入金額" : field === "price" ? "買進價格" : "本月計劃買進股數";
    if (!confirm(`確定要把 ${row.year} 年 ${row.month} 月之後的「${fieldLabel}」都改成 ${value}？`)) return;
    const res = await authFetch(`/api/calculator-plans/${planDetail.id}/bulk-update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ afterYear: row.year, afterMonth: row.month, field, value }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      alert(err?.error || "套用失敗");
      return;
    }
    fetchDetail(planDetail.id);
  };

  const saveRow = async (row: PlanRow) => {
    await authFetch(`/api/calculator-plan-rows/${row.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        investment: row.investment, fee: row.fee, price: row.price,
        dividendRate: row.dividendRate, afterTaxRate: row.afterTaxRate,
        holdingSharesOverride: row.holdingSharesOverride, dividendOverride: row.dividendOverride,
        sharesToBuy: row.sharesToBuy,
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

  // 依序把每列的輸入參數算成買進股數／持有股數／實際配息／累計配息／推估總資產；
  // 季配息的話只有每 3 個月（第 3、6、9...列）才實際發配息，其他月份配息記為 0 但累計配息照樣往前帶
  const { computed, targetRow } = useMemo(() => {
    const mode = planDetail?.mode ?? "USSTOCK";
    let holdingShares = 0;
    let cumulativeDividend = 0;
    let cumulativeInvestment = 0;
    let pendingDividendCash = 0; // TWSTOCK 專用：還不夠買滿 1 張、留到下個月的配息零頭
    const list: ComputedRow[] = [];
    const target = planDetail?.targetAmount ?? 0;
    const frequency = planDetail?.dividendFrequency ?? "MONTHLY";
    let foundTarget: ComputedRow | null = null;

    const startingAssetValue = planDetail?.startingAssetValue ?? 0;
    const startingAvgPrice = planDetail?.startingAvgPrice ?? null;

    for (let idx = 0; idx < rows.length; idx++) {
      const r = rows[idx];
      const isPaymentMonth = frequency === "MONTHLY" ? true : (QUARTERLY_MONTHS[frequency] ?? []).includes(r.month);
      // 這個月產生的配息：有手動覆蓋就用覆蓋值（例如對帳後的真實入帳金額），否則照公式算
      const dividend = r.dividendOverride != null ? r.dividendOverride : (isPaymentMonth ? holdingShares * r.dividendRate * r.afterTaxRate : 0);
      cumulativeDividend += dividend;

      let sharesBought: number;
      let dividendShares = 0;
      if (mode === "TWSTOCK") {
        // 台股版：這個月固定計劃買進的股數（不隨價格變動），配息累積夠買 1000 股（1 張）的金額
        // 才自動加碼、而且只能整張買，零頭留到下個月（還原原本「1 張」為單位的加碼邏輯）
        const planned = r.sharesToBuy ?? 0;
        pendingDividendCash += dividend;
        if (r.price > 0) {
          const lotCost = r.price * DIVIDEND_REINVEST_LOT_SIZE;
          const lots = Math.floor(pendingDividendCash / lotCost);
          dividendShares = lots * DIVIDEND_REINVEST_LOT_SIZE;
          pendingDividendCash -= dividendShares * r.price;
        }
        sharesBought = planned + dividendShares;
      } else {
        // 美股版：每月投入固定金額（扣手續費）÷ 買進價格，配息不自動買股、單純累積現金
        sharesBought = r.price > 0 ? Math.max(0, r.investment - r.fee) / r.price : 0;
      }

      // 持有股數：有手動覆蓋就用覆蓋值（例如券商對帳的真實股數，含配股等公式沒算到的部分）
      // 當作這個月的最終持股，下個月接著這個數字往下算，否則用「上個月持股＋這個月買進」
      const naturalHolding = holdingShares + sharesBought;
      holdingShares = r.holdingSharesOverride != null ? r.holdingSharesOverride : naturalHolding;

      // 累計投入成本：台股版的配息加碼也是真金白銀買進股票，一樣算進投入成本
      cumulativeInvestment += mode === "TWSTOCK" ? sharesBought * r.price : r.investment;
      // 第一列可以手動指定「開始試算前既有持股的均價」當基準，之後月份接著這個基準往下算
      if (idx === 0 && startingAvgPrice != null) cumulativeInvestment = startingAvgPrice * holdingShares;
      const avgPrice = holdingShares > 0 ? cumulativeInvestment / holdingShares : 0;
      // 每一列都加上「開始試算前既有的持有金額」（只在第一列顯示可編輯，其他列自動帶著走）
      const assetValue = (mode === "TWSTOCK"
        ? holdingShares * r.price + pendingDividendCash
        : holdingShares * r.price + cumulativeDividend) + startingAssetValue;

      const row: ComputedRow = {
        ...r, sharesBought, dividendShares, holdingShares, dividend, cumulativeDividend,
        pendingDividendCash, assetValue, isPaymentMonth, avgPrice,
      };
      list.push(row);
      if (!foundTarget && target > 0 && assetValue >= target) foundTarget = row;
    }
    return { computed: list, targetRow: foundTarget };
  }, [rows, planDetail?.targetAmount, planDetail?.dividendFrequency, planDetail?.mode, planDetail?.startingAssetValue, planDetail?.startingAvgPrice]);

  const last = computed[computed.length - 1];
  const isTwstock = planDetail?.mode === "TWSTOCK";
  // 累計投入本金：美股版是每月投入金額加總；台股版沒有「投入金額」這個欄位，
  // 改用最後一列的「持股均價 × 持股數」反推累計實際花掉的錢（含配息加碼買的部分）
  const totalPrincipal = isTwstock
    ? (last ? last.avgPrice * last.holdingShares : 0)
    : rows.reduce((s, r) => s + r.investment, 0);

  return (
    <div className="w-full">
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
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}（{p.mode === "TWSTOCK" ? "台股版" : "美股版"} · {p._count.rows} 個月）</option>)}
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
          {/* 目標資產與配息頻率設定 */}
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm mb-6 space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-sm font-medium text-slate-700">目標資產（選填）</label>
              <input type="number" min="0" step="any" value={targetInput}
                onChange={(e) => setTargetInput(e.target.value)} onBlur={saveTarget}
                placeholder="例如：1000000"
                className="w-48 border border-slate-200 rounded-lg px-3.5 py-2 text-sm focus:border-indigo-400 transition-colors" />
              <span className="text-xs text-slate-400">填了之後，下面逐月明細達成目標的那一列會特別標示</span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-sm font-medium text-slate-700">配息頻率</label>
              <select value={planDetail.dividendFrequency} onChange={(e) => saveFrequency(e.target.value as DividendFrequency)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white">
                <option value="MONTHLY">月配息</option>
                <option value="QUARTERLY_1">季配息（1、4、7、10 月）</option>
                <option value="QUARTERLY_2">季配息（2、5、8、11 月）</option>
                <option value="QUARTERLY_3">季配息（3、6、9、12 月）</option>
              </select>
              <span className="text-xs text-slate-400">季配息時，每股配息欄位代表「每次配息」的金額，只有落在配息月份的那一列才會實際入帳</span>
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
                <div className="text-xs font-semibold text-emerald-500 uppercase tracking-wider mb-1">{isTwstock ? "剩餘未投入配息" : "累計配息現金"}</div>
                <div className="text-xl font-bold text-emerald-600 mt-1">{fmt(isTwstock ? last.pendingDividendCash : last.cumulativeDividend)}</div>
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
              <span className="text-xs text-slate-400">白底欄位可以直接點擊修改，改完按 Tab 或點別處就會自動存檔；持有股數／實際配息留空照公式算，填了數字（<span className="text-amber-600">淡黃色</span>）就改成手動指定的值，清空可以還原</span>
            </div>
            <div className="overflow-auto max-h-[600px]">
              {isTwstock ? (
                <table className="w-full text-sm whitespace-nowrap">
                  <thead className="sticky top-0 bg-slate-50 z-10">
                    <tr className="text-xs text-slate-500">
                      <th className="px-3 py-2.5 text-left font-semibold">年份</th>
                      <th className="px-3 py-2.5 text-left font-semibold">月份</th>
                      <th className="px-3 py-2.5 text-right font-semibold">本月計劃買進股數</th>
                      <th className="px-3 py-2.5 text-right font-semibold">持有股數</th>
                      <th className="px-3 py-2.5 text-right font-semibold">持股均價</th>
                      <th className="px-3 py-2.5 text-right font-semibold">買進價格</th>
                      <th className="px-3 py-2.5 text-right font-semibold">配息加碼股數</th>
                      <th className="px-3 py-2.5 text-right font-semibold">每股配息</th>
                      <th className="px-3 py-2.5 text-right font-semibold">稅後可得%</th>
                      <th className="px-3 py-2.5 text-right font-semibold">本期配息</th>
                      <th className="px-3 py-2.5 text-right font-semibold">剩餘未投入配息</th>
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
                          <div className="flex items-center justify-end gap-0.5">
                            <input key={`${r.id}-shares-${r.sharesToBuy}`} type="number" step="any" defaultValue={r.sharesToBuy ?? 0}
                              onChange={(e) => updateLocalRow(r.id, "sharesToBuy", e.target.value)}
                              onBlur={() => saveRow(rows.find((x) => x.id === r.id)!)}
                              className="w-24 text-right px-2 py-1 border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded text-sm" />
                            <button type="button" title="把這個股數套用到之後所有月份（會蓋掉原本遞增的規律，之後都固定這個數字）"
                              onClick={() => applyForward(rows.find((x) => x.id === r.id)!, "sharesToBuy", rows.find((x) => x.id === r.id)!.sharesToBuy ?? 0)}
                              className="opacity-0 group-hover:opacity-100 text-[10px] text-indigo-400 hover:text-indigo-600 px-1 transition-opacity">→後</button>
                          </div>
                        </td>
                        <td className="px-1 py-1">
                          <input key={`${r.id}-hold-${r.holdingSharesOverride}`} type="number" step="any"
                            defaultValue={r.holdingSharesOverride ?? ""} placeholder={fmtQty(r.holdingShares)}
                            title="留空＝照公式自動算；填數字＝改成手動指定的真實股數，下個月開始接著這個數字往下算"
                            onChange={(e) => updateLocalOverride(r.id, "holdingSharesOverride", e.target.value)}
                            onBlur={() => saveRow(rows.find((x) => x.id === r.id)!)}
                            className={`w-24 text-right px-2 py-1 border rounded text-sm placeholder:text-slate-400 ${r.holdingSharesOverride != null ? "border-amber-300 bg-amber-50" : "border-transparent hover:border-slate-200 focus:border-indigo-400"}`} />
                        </td>
                        <td className="px-1 py-1 text-right text-slate-500">
                          {i === 0 ? (
                            <input type="number" step="any" defaultValue={planDetail.startingAvgPrice ?? ""} placeholder={fmtQty(r.avgPrice)}
                              title="留空＝從 0 開始照公式算；填數字＝開始試算前既有持股的均價，當作起始基準"
                              onBlur={(e) => saveStartingAvgPrice(e.target.value)}
                              className={`w-20 text-right px-2 py-1 border rounded text-sm placeholder:text-slate-400 ${planDetail.startingAvgPrice != null ? "border-amber-300 bg-amber-50" : "border-transparent hover:border-slate-200 focus:border-indigo-400"}`} />
                          ) : fmtQty(r.avgPrice)}
                        </td>
                        <td className="px-1 py-1">
                          <div className="flex items-center justify-end gap-0.5">
                            <input key={`${r.id}-price-${r.price}`} type="number" step="any" defaultValue={r.price}
                              onChange={(e) => updateLocalRow(r.id, "price", e.target.value)}
                              onBlur={() => saveRow(rows.find((x) => x.id === r.id)!)}
                              className="w-20 text-right px-2 py-1 border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded text-sm" />
                            <button type="button" title="把這個價格套用到之後所有月份"
                              onClick={() => applyForward(rows.find((x) => x.id === r.id)!, "price", rows.find((x) => x.id === r.id)!.price)}
                              className="opacity-0 group-hover:opacity-100 text-[10px] text-indigo-400 hover:text-indigo-600 px-1 transition-opacity">→後</button>
                          </div>
                        </td>
                        <td className="px-3 py-1.5 text-right text-slate-700">{r.dividendShares > 0 ? fmtQty(r.dividendShares) : "—"}</td>
                        <td className="px-1 py-1">
                          {r.isPaymentMonth ? (
                            <input key={`${r.id}-divrate-${r.dividendRate}`} type="number" step="any" defaultValue={r.dividendRate}
                              onChange={(e) => updateLocalRow(r.id, "dividendRate", e.target.value)}
                              onBlur={() => saveRow(rows.find((x) => x.id === r.id)!)}
                              className="w-16 text-right px-2 py-1 border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded text-sm" />
                          ) : (
                            <div className="w-16 text-right px-2 py-1 text-slate-300 text-sm" title="這個月不是配息月">—</div>
                          )}
                        </td>
                        <td className="px-1 py-1">
                          <input key={`${r.id}-tax-${r.afterTaxRate}`} type="number" step="any" min="0" max="100" defaultValue={r.afterTaxRate * 100}
                            onChange={(e) => updateLocalRow(r.id, "afterTaxRate", String((parseFloat(e.target.value) || 0) / 100))}
                            onBlur={() => saveRow(rows.find((x) => x.id === r.id)!)}
                            className="w-14 text-right px-2 py-1 border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded text-sm" />
                        </td>
                        <td className="px-1 py-1">
                          <input key={`${r.id}-div-${r.dividendOverride}`} type="number" step="any"
                            defaultValue={r.dividendOverride ?? ""} placeholder={fmtQty(r.dividend)}
                            title="留空＝照公式自動算；填數字＝改成手動指定的真實配息金額"
                            onChange={(e) => updateLocalOverride(r.id, "dividendOverride", e.target.value)}
                            onBlur={() => saveRow(rows.find((x) => x.id === r.id)!)}
                            className={`w-20 text-right px-2 py-1 border rounded text-sm placeholder:text-emerald-300 ${r.dividendOverride != null ? "border-amber-300 bg-amber-50" : "border-transparent hover:border-slate-200 focus:border-indigo-400"}`} />
                        </td>
                        <td className="px-3 py-1.5 text-right text-amber-600 font-medium">{fmtQty(r.pendingDividendCash)}</td>
                        <td className="px-1 py-1 text-right text-indigo-600 font-semibold">
                          {i === 0 ? (
                            <input type="number" step="any" defaultValue={planDetail.startingAssetValue}
                              title="開始試算前既有的持有金額，會加到每一列的推估總資產裡"
                              onBlur={(e) => saveStartingAssetValue(e.target.value)}
                              className={`w-24 text-right px-2 py-1 border rounded text-sm font-semibold ${planDetail.startingAssetValue !== 0 ? "border-amber-300 bg-amber-50" : "border-transparent hover:border-slate-200 focus:border-indigo-400"}`} />
                          ) : fmt(r.assetValue)}
                        </td>
                        <td className="px-2 py-1.5">
                          <button onClick={() => handleDeleteRow(r.id)}
                            className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 text-xs transition-opacity">刪除</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-sm whitespace-nowrap">
                  <thead className="sticky top-0 bg-slate-50 z-10">
                    <tr className="text-xs text-slate-500">
                      <th className="px-3 py-2.5 text-left font-semibold">年份</th>
                      <th className="px-3 py-2.5 text-left font-semibold">月份</th>
                      <th className="px-3 py-2.5 text-right font-semibold">每月投入金額</th>
                      <th className="px-3 py-2.5 text-right font-semibold">持有股數</th>
                      <th className="px-3 py-2.5 text-right font-semibold">持股均價</th>
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
                          <div className="flex items-center justify-end gap-0.5">
                            <input key={`${r.id}-inv-${r.investment}`} type="number" step="any" defaultValue={r.investment}
                              onChange={(e) => updateLocalRow(r.id, "investment", e.target.value)}
                              onBlur={() => saveRow(rows.find((x) => x.id === r.id)!)}
                              className="w-24 text-right px-2 py-1 border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded text-sm" />
                            <button type="button" title="把這個金額套用到之後所有月份"
                              onClick={() => applyForward(rows.find((x) => x.id === r.id)!, "investment", rows.find((x) => x.id === r.id)!.investment)}
                              className="opacity-0 group-hover:opacity-100 text-[10px] text-indigo-400 hover:text-indigo-600 px-1 transition-opacity">→後</button>
                          </div>
                        </td>
                        <td className="px-1 py-1">
                          <input key={`${r.id}-hold-${r.holdingSharesOverride}`} type="number" step="any"
                            defaultValue={r.holdingSharesOverride ?? ""} placeholder={fmtQty(r.holdingShares)}
                            title="留空＝照公式自動算；填數字＝改成手動指定的真實股數，下個月開始接著這個數字往下算"
                            onChange={(e) => updateLocalOverride(r.id, "holdingSharesOverride", e.target.value)}
                            onBlur={() => saveRow(rows.find((x) => x.id === r.id)!)}
                            className={`w-24 text-right px-2 py-1 border rounded text-sm placeholder:text-slate-400 ${r.holdingSharesOverride != null ? "border-amber-300 bg-amber-50" : "border-transparent hover:border-slate-200 focus:border-indigo-400"}`} />
                        </td>
                        <td className="px-1 py-1 text-right text-slate-500">
                          {i === 0 ? (
                            <input type="number" step="any" defaultValue={planDetail.startingAvgPrice ?? ""} placeholder={fmtQty(r.avgPrice)}
                              title="留空＝從 0 開始照公式算；填數字＝開始試算前既有持股的均價，當作起始基準"
                              onBlur={(e) => saveStartingAvgPrice(e.target.value)}
                              className={`w-20 text-right px-2 py-1 border rounded text-sm placeholder:text-slate-400 ${planDetail.startingAvgPrice != null ? "border-amber-300 bg-amber-50" : "border-transparent hover:border-slate-200 focus:border-indigo-400"}`} />
                          ) : fmtQty(r.avgPrice)}
                        </td>
                        <td className="px-1 py-1">
                          <input key={`${r.id}-fee-${r.fee}`} type="number" step="any" defaultValue={r.fee}
                            onChange={(e) => updateLocalRow(r.id, "fee", e.target.value)}
                            onBlur={() => saveRow(rows.find((x) => x.id === r.id)!)}
                            className="w-16 text-right px-2 py-1 border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded text-sm" />
                        </td>
                        <td className="px-1 py-1">
                          <div className="flex items-center justify-end gap-0.5">
                            <input key={`${r.id}-price-${r.price}`} type="number" step="any" defaultValue={r.price}
                              onChange={(e) => updateLocalRow(r.id, "price", e.target.value)}
                              onBlur={() => saveRow(rows.find((x) => x.id === r.id)!)}
                              className="w-20 text-right px-2 py-1 border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded text-sm" />
                            <button type="button" title="把這個價格套用到之後所有月份"
                              onClick={() => applyForward(rows.find((x) => x.id === r.id)!, "price", rows.find((x) => x.id === r.id)!.price)}
                              className="opacity-0 group-hover:opacity-100 text-[10px] text-indigo-400 hover:text-indigo-600 px-1 transition-opacity">→後</button>
                          </div>
                        </td>
                        <td className="px-3 py-1.5 text-right text-slate-700">{fmtQty(r.sharesBought)}</td>
                        <td className="px-1 py-1">
                          {r.isPaymentMonth ? (
                            <input key={`${r.id}-divrate-${r.dividendRate}`} type="number" step="any" defaultValue={r.dividendRate}
                              onChange={(e) => updateLocalRow(r.id, "dividendRate", e.target.value)}
                              onBlur={() => saveRow(rows.find((x) => x.id === r.id)!)}
                              className="w-16 text-right px-2 py-1 border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded text-sm" />
                          ) : (
                            <div className="w-16 text-right px-2 py-1 text-slate-300 text-sm" title="這個月不是配息月">—</div>
                          )}
                        </td>
                        <td className="px-1 py-1">
                          <input key={`${r.id}-tax-${r.afterTaxRate}`} type="number" step="any" min="0" max="100" defaultValue={r.afterTaxRate * 100}
                            onChange={(e) => updateLocalRow(r.id, "afterTaxRate", String((parseFloat(e.target.value) || 0) / 100))}
                            onBlur={() => saveRow(rows.find((x) => x.id === r.id)!)}
                            className="w-14 text-right px-2 py-1 border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded text-sm" />
                        </td>
                        <td className="px-1 py-1">
                          <input key={`${r.id}-div-${r.dividendOverride}`} type="number" step="any"
                            defaultValue={r.dividendOverride ?? ""} placeholder={fmtQty(r.dividend)}
                            title="留空＝照公式自動算；填數字＝改成手動指定的真實配息入帳金額"
                            onChange={(e) => updateLocalOverride(r.id, "dividendOverride", e.target.value)}
                            onBlur={() => saveRow(rows.find((x) => x.id === r.id)!)}
                            className={`w-20 text-right px-2 py-1 border rounded text-sm placeholder:text-emerald-300 ${r.dividendOverride != null ? "border-amber-300 bg-amber-50" : "border-transparent hover:border-slate-200 focus:border-indigo-400"}`} />
                        </td>
                        <td className="px-3 py-1.5 text-right text-emerald-700 font-semibold">{fmtQty(r.cumulativeDividend)}</td>
                        <td className="px-1 py-1 text-right text-indigo-600 font-semibold">
                          {i === 0 ? (
                            <input type="number" step="any" defaultValue={planDetail.startingAssetValue}
                              title="開始試算前既有的持有金額，會加到每一列的推估總資產裡"
                              onBlur={(e) => saveStartingAssetValue(e.target.value)}
                              className={`w-24 text-right px-2 py-1 border rounded text-sm font-semibold ${planDetail.startingAssetValue !== 0 ? "border-amber-300 bg-amber-50" : "border-transparent hover:border-slate-200 focus:border-indigo-400"}`} />
                          ) : fmt(r.assetValue)}
                        </td>
                        <td className="px-2 py-1.5">
                          <button onClick={() => handleDeleteRow(r.id)}
                            className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 text-xs transition-opacity">刪除</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
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
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">版本</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setCreateForm({ ...createForm, mode: "USSTOCK" })}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${createForm.mode === "USSTOCK" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                    美股版（固定每月投入金額）
                  </button>
                  <button type="button" onClick={() => setCreateForm({ ...createForm, mode: "TWSTOCK" })}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${createForm.mode === "TWSTOCK" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                    台股版（固定每月遞增股數）
                  </button>
                </div>
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
              {createForm.mode === "TWSTOCK" ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">起始股數（第 1 個月買進股數）</label>
                    <input type="number" min="0" step="any" value={createForm.startShares}
                      onChange={(e) => setCreateForm({ ...createForm, startShares: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">每月遞增股數</label>
                    <input type="number" min="0" step="any" value={createForm.shareIncrement}
                      onChange={(e) => setCreateForm({ ...createForm, shareIncrement: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                    <p className="text-[11px] text-slate-400 mt-1">第 N 個月固定買進「起始股數 ＋ (N-1) × 遞增股數」</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">每月投入金額</label>
                    <input type="number" min="0" step="any" value={createForm.monthlyInvestment}
                      onChange={(e) => setCreateForm({ ...createForm, monthlyInvestment: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">手續費</label>
                    <input type="number" min="0" step="any" value={createForm.fee}
                      onChange={(e) => setCreateForm({ ...createForm, fee: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">買進價格</label>
                  <input type="number" min="0" step="any" value={createForm.price}
                    onChange={(e) => setCreateForm({ ...createForm, price: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">每次配息金額（每股）</label>
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
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">配息頻率</label>
                  <select value={createForm.dividendFrequency}
                    onChange={(e) => setCreateForm({ ...createForm, dividendFrequency: e.target.value as DividendFrequency })}
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors">
                    <option value="MONTHLY">月配息</option>
                    <option value="QUARTERLY_1">季配息（1、4、7、10 月）</option>
                    <option value="QUARTERLY_2">季配息（2、5、8、11 月）</option>
                    <option value="QUARTERLY_3">季配息（3、6、9、12 月）</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">目標資產（選填）</label>
                <input type="number" min="0" step="any" value={createForm.targetAmount}
                  onChange={(e) => setCreateForm({ ...createForm, targetAmount: e.target.value })} placeholder="例如：1000000"
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
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
