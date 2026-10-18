"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { authFetch } from "@/lib/api-fetch";

// 投資試算表：可以同時存多個方案（例如不同股票各一個），逐月明細的參數（每月投入金額、
// 手續費、買進價格、配息、抽稅後可得比例）都可以一格一格手動改成實際發生的數字，
// 買進股數／持有股數／實際配息／累計配息／推估總資產都是前端依序算出來的，不存進資料庫，
// 改掉中間某一列的參數，後面所有月份的累計數字會自動跟著連動。

type DividendFrequency = "MONTHLY" | "QUARTERLY_1" | "QUARTERLY_2" | "QUARTERLY_3" | "CUSTOM";
// USSTOCK：每月投入固定金額，股數隨價格換算，配息累積現金不自動買股
// TWSTOCK：每月買進股數固定遞增，配息累積夠買 1 張（1000 股）的金額就自動加碼買股、零頭留到下個月
// FUND：每月投入固定金額（像 USSTOCK），但配息會自動滾入買更多單位，而且可以買到小數單位（不像台股要湊整張）
type PlanMode = "USSTOCK" | "TWSTOCK" | "FUND";

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

const MONTH_LABELS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

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
  dividendPurchaseOverride: number | null;
  sharesToBuy: number | null;
}

interface PlanDetail {
  id: string;
  name: string;
  targetAmount: number | null;
  dividendFrequency: DividendFrequency;
  customPaymentMonths: number[];
  mode: PlanMode;
  shareIncrement: number | null;
  startingAssetValue: number;
  startingAvgPrice: number | null;
  feeNote: string | null;
  allowOddLot: boolean;
  minPurchaseAmount: number;
  stockCode: string | null;
  currentPrice: number | null;
  currentPriceUpdatedAt: string | null;
  rows: PlanRow[];
}

interface ComputedRow extends PlanRow {
  sharesBought: number; // 這個月新買進的股數（含配息加碼買的部分，TWSTOCK 才有）
  dividendShares: number; // TWSTOCK：配息加碼買到的股數
  dividendSharesCost: number; // TWSTOCK：配息加碼這筆實際花掉的金額＝配息加碼股數 × 買進價格
  holdingShares: number;
  dividend: number; // 這個月產生的配息金額
  cumulativeDividend: number; // 累計產生的配息金額（USSTOCK：還沒投入的現金；TWSTOCK：歷史累計產生總額，僅供參考）
  pendingDividendCash: number; // TWSTOCK：還不夠買滿 1 張、留到下個月的配息零頭
  assetValue: number;
  isPaymentMonth: boolean;
  avgPrice: number; // 累計持股均價＝累計實際投入金額 ÷ 累計持股數
  cumulativeFee: number; // 累計手續費，純紀錄用，不影響任何計算
  actualPrincipal: number; // TWSTOCK／FUND：實際累計投入本金＝只算自己掏錢買的部分（本月計劃買進股數或投入金額），不含配息加碼買的部分
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
  customPaymentMonths: [] as number[],
  stockCode: "",
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
  const [savingAll, setSavingAll] = useState(false);
  // 每次從伺服器重新抓資料就 +1，逐月明細的輸入框用這個當 key 的一部分，
  // 讓「伺服器資料變了（例如批次套用、新增月份）」才重新掛載、顯示最新值，
  // 本地打字（只更新 rows state，不會重抓）不會觸發，欄位才不會每打一個字就被重設、失焦
  const [dataVersion, setDataVersion] = useState(0);
  const [refreshingPrice, setRefreshingPrice] = useState(false);
  const [settingsExpanded, setSettingsExpanded] = useState(true);

  const fmt = (n: number) =>
    new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(n);
  const fmtQty = (n: number) => new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 4 }).format(n);
  const fmtPrice = (n: number) =>
    new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

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
      setDataVersion((v) => v + 1);
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

  // 自訂配息月份（dividendFrequency="CUSTOM" 時用）：半年配、年配、不配息等非固定週期的定存股自己勾選配息月份
  const toggleCustomMonth = async (month: number) => {
    if (!planDetail) return;
    const current = planDetail.customPaymentMonths ?? [];
    const next = current.includes(month) ? current.filter((m) => m !== month) : [...current, month].sort((a, b) => a - b);
    setPlanDetail({ ...planDetail, customPaymentMonths: next });
    await authFetch(`/api/calculator-plans/${planDetail.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customPaymentMonths: next }),
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

  // 「累計手續費」卡片下方的小字說明，使用者可自行輸入，留空則顯示預設文字
  const saveFeeNote = async (value: string) => {
    if (!planDetail) return;
    const note = value === "" ? null : value;
    setPlanDetail({ ...planDetail, feeNote: note });
    await authFetch(`/api/calculator-plans/${planDetail.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feeNote: note }),
    });
  };

  // 股票代號：填了之後背景排程會每天自動抓最新收盤價，用來算「目前市值」
  const saveStockCode = async (value: string) => {
    if (!planDetail) return;
    const code = value.trim() === "" ? null : value.trim();
    setPlanDetail({ ...planDetail, stockCode: code });
    await authFetch(`/api/calculator-plans/${planDetail.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stockCode: code }),
    });
    if (code) refreshPrices();
  };

  const refreshPrices = async () => {
    if (!planDetail) return;
    setRefreshingPrice(true);
    await authFetch("/api/calculator-plans/refresh-prices", { method: "POST" });
    setRefreshingPrice(false);
    fetchDetail(planDetail.id);
  };

  // TWSTOCK 專用：配息加碼是否允許零股（剩餘配息不夠買滿 1 張也能買）
  const saveAllowOddLot = async (checked: boolean) => {
    if (!planDetail) return;
    setPlanDetail({ ...planDetail, allowOddLot: checked });
    await authFetch(`/api/calculator-plans/${planDetail.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowOddLot: checked }),
    });
  };

  // FUND 專用：配息再投入買基金的單筆最低金額限制，0 代表沒有限制
  const saveMinPurchaseAmount = async (value: string) => {
    if (!planDetail) return;
    const num = parseFloat(value) || 0;
    setPlanDetail({ ...planDetail, minPurchaseAmount: num });
    await authFetch(`/api/calculator-plans/${planDetail.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minPurchaseAmount: num }),
    });
  };

  // 本地先更新畫面（打字流暢），失去焦點時才存檔，避免每打一個字就打一次 API
  const updateLocalRow = (rowId: string, field: keyof PlanRow, value: string) => {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, [field]: parseFloat(value) || 0 } : r)));
  };

  // 持有股數／實際配息覆蓋欄位：清空代表「不要覆蓋、改回照公式算」，跟其他欄位不同，空字串要存成 null 而不是 0
  const updateLocalOverride = (rowId: string, field: "holdingSharesOverride" | "dividendOverride" | "dividendPurchaseOverride", value: string) => {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, [field]: value === "" ? null : (parseFloat(value) || 0) } : r)));
  };

  // 配息加碼股數欄位改股數輸入，換算成金額存進同一個 dividendPurchaseOverride（跟配息購買金額共用同一個覆蓋來源，改任一邊都會同步）
  const updateDividendSharesOverride = (rowId: string, value: string) => {
    setRows((prev) => prev.map((r) => {
      if (r.id !== rowId) return r;
      if (value === "") return { ...r, dividendPurchaseOverride: null };
      const shares = parseFloat(value) || 0;
      return { ...r, dividendPurchaseOverride: shares * r.price };
    }));
  };

  // 套用到之後所有月份：把某一列目前的值（每月投入金額／買進價格等）往後批次套用到後面所有月份，
  // 不影響這一列本身跟之前的月份，用來反映「薪水變多/股價假設調整後，之後每個月都改用新數字」
  const applyForward = async (row: PlanRow, field: "investment" | "price" | "sharesToBuy" | "fee", value: number) => {
    if (!planDetail) return;
    const fieldLabel = field === "investment" ? "每月投入金額" : field === "price" ? (isFund ? "基金淨值" : "買進價格") : field === "fee" ? "手續費" : "本月計劃買進股數";
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
        sharesToBuy: row.sharesToBuy, dividendPurchaseOverride: row.dividendPurchaseOverride,
      }),
    });
  };

  const handleAddRow = async () => {
    if (!planDetail) return;
    const input = window.prompt("要延伸試算幾個月？", "1");
    if (input === null) return; // 使用者取消
    const count = Math.max(1, Math.min(600, parseInt(input) || 1));
    setAddingRow(true);
    for (let i = 0; i < count; i++) {
      const res = await authFetch(`/api/calculator-plans/${planDetail.id}/rows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        alert(err?.error || "新增失敗");
        break;
      }
    }
    setAddingRow(false);
    fetchDetail(planDetail.id);
  };

  // 強制儲存：把目前畫面上每一列的最新內容都存一次，不想等 onBlur 自動存、或想保險起見時手動按
  const handleSaveAll = async () => {
    if (!planDetail) return;
    setSavingAll(true);
    await Promise.all(rows.map((r) => saveRow(r)));
    await saveTarget();
    setSavingAll(false);
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
    let cumulativePrincipal = 0; // TWSTOCK：實際累計投入本金，只算自己掏錢買進的部分（計劃買進股數×價格），不含配息加碼的部分
    let pendingDividendCash = 0; // TWSTOCK 專用：已經入帳、可以動用去加碼的配息現金（含零頭）
    let dividendInTransit = 0; // TWSTOCK 專用：這個月剛宣告、還要等下個月才會實際入帳的配息
    let prevAssetValue = 0; // TWSTOCK 專用：上個月的推估總資產，逐月累加用
    let prevPendingDividendCash = 0; // TWSTOCK 專用：上個月的剩餘未投入配息，用來算這個月「新增」的部分（避免同一筆餘額被逐月重複相加而虛增）
    let cumulativeFee = 0; // 累計手續費，純紀錄用，不影響任何計算
    const list: ComputedRow[] = [];
    const target = planDetail?.targetAmount ?? 0;
    const frequency = planDetail?.dividendFrequency ?? "MONTHLY";
    let foundTarget: ComputedRow | null = null;

    const startingAssetValue = planDetail?.startingAssetValue ?? 0;
    const startingAvgPrice = planDetail?.startingAvgPrice ?? null;
    // 允許零股時以 1 股為單位，剩餘配息夠買幾股就買幾股；否則維持滿 1 張（1,000 股）才加碼
    const dividendLotSize = planDetail?.allowOddLot ? 1 : DIVIDEND_REINVEST_LOT_SIZE;

    for (let idx = 0; idx < rows.length; idx++) {
      const r = rows[idx];
      const isPaymentMonth = frequency === "MONTHLY" ? true
        : frequency === "CUSTOM" ? (planDetail?.customPaymentMonths ?? []).includes(r.month)
        : (QUARTERLY_MONTHS[frequency] ?? []).includes(r.month);
      // 這個月產生的配息：有手動覆蓋就用覆蓋值（例如對帳後的真實入帳金額），否則照公式算
      const dividend = r.dividendOverride != null ? r.dividendOverride : (isPaymentMonth ? holdingShares * r.dividendRate * r.afterTaxRate : 0);
      cumulativeDividend += dividend;

      let sharesBought: number;
      let dividendShares = 0;
      let dividendSharesCost = 0;
      if (mode === "TWSTOCK" || mode === "FUND") {
        // 台股版：這個月固定計劃買進的股數（不隨價格變動）；基金版：這個月固定投入金額（扣手續費）÷ 淨值算出單位數
        const planned = mode === "TWSTOCK"
          ? (r.sharesToBuy ?? 0)
          : (r.price > 0 ? Math.max(0, r.investment - r.fee) / r.price : 0);
        // 配息是隔一個月才實際入帳：上個月宣告的這個月才能動用，這個月剛宣告的要留到下個月
        pendingDividendCash += dividendInTransit;
        dividendInTransit = dividend;
        // 配息加碼股數／金額有手動覆蓋就用覆蓋值（兩個欄位共用同一個覆蓋來源，改任一邊都會讓兩邊同步）
        if (r.dividendPurchaseOverride != null) {
          dividendSharesCost = r.dividendPurchaseOverride;
          dividendShares = r.price > 0 ? dividendSharesCost / r.price : 0;
        } else if (r.price > 0) {
          if (mode === "FUND") {
            // 基金可以買到小數單位，不用像台股湊整張；但單筆申購通常有最低金額限制，
            // 沒湊到這個金額基金公司不會受理，所以沒到門檻就繼續留到下個月累積
            const minPurchase = planDetail?.minPurchaseAmount ?? 0;
            if (pendingDividendCash >= minPurchase) {
              dividendShares = pendingDividendCash / r.price;
              dividendSharesCost = pendingDividendCash;
            }
          } else {
            // 台股版：配息累積夠買 1000 股（1 張，或允許零股時 1 股）的金額才自動加碼，零頭留到下個月
            const lotCost = r.price * dividendLotSize;
            const lots = Math.floor(pendingDividendCash / lotCost);
            dividendShares = lots * dividendLotSize;
            dividendSharesCost = dividendShares * r.price;
          }
        }
        pendingDividendCash -= dividendSharesCost;
        sharesBought = planned + dividendShares;
        cumulativePrincipal += mode === "TWSTOCK" ? planned * r.price : r.investment;
      } else {
        // 美股版：每月投入固定金額（扣手續費）÷ 買進價格，配息不自動買股、單純累積現金
        sharesBought = r.price > 0 ? Math.max(0, r.investment - r.fee) / r.price : 0;
      }

      // 持有股數：有手動覆蓋就用覆蓋值（例如券商對帳的真實股數，含配股等公式沒算到的部分）
      // 當作這個月的最終持股，下個月接著這個數字往下算，否則用「上個月持股＋這個月買進」
      const naturalHolding = holdingShares + sharesBought;
      holdingShares = r.holdingSharesOverride != null ? r.holdingSharesOverride : naturalHolding;

      // 累計投入成本：台股版／基金版的配息加碼也是真金白銀買進股票（單位），一樣算進投入成本
      cumulativeInvestment += (mode === "TWSTOCK" || mode === "FUND") ? sharesBought * r.price : r.investment;
      // 第一列可以手動指定「開始試算前既有持股的均價」當基準，之後月份接著這個基準往下算
      if (idx === 0 && startingAvgPrice != null) {
        cumulativeInvestment = startingAvgPrice * holdingShares;
        cumulativePrincipal = startingAvgPrice * holdingShares; // 起始部位算是自己掏錢買的本金，不是配息滾出來的
      }
      const avgPrice = holdingShares > 0 ? cumulativeInvestment / holdingShares : 0;
      // 第一列的「起始持有金額」是直接指定那一列的推估總資產是多少（取代公式算出來的值，不是疊加上去），
      // 填 0 代表沒有手動指定、照公式用持有股數×價格＋剩餘未投入配息算。
      // TWSTOCK 從第二列開始，推估總資產＝上個月推估總資產＋這個月（計劃買進股數＋配息加碼股數）
      // ×這個月買進價格＋這個月剩餘未投入配息「比上個月新增的部分」－這個月手續費，逐月累加
      // （剩餘未投入配息是餘額不是這個月才多出來的錢，只能算差額，不能整包加，否則沒花掉的餘額會被逐月重複累加而虛增總資產）
      let assetValue: number;
      if (mode === "TWSTOCK" || mode === "FUND") {
        if (idx === 0) {
          assetValue = startingAssetValue !== 0 ? startingAssetValue : (holdingShares * r.price + pendingDividendCash);
        } else {
          assetValue = prevAssetValue + sharesBought * r.price + (pendingDividendCash - prevPendingDividendCash) - r.fee;
        }
      } else {
        // 美股版維持原本「每一列都加上起始持有金額」的簡單寫法（美股版沒有被回報這個問題）
        assetValue = holdingShares * r.price + cumulativeDividend + startingAssetValue;
      }
      prevAssetValue = assetValue;
      prevPendingDividendCash = pendingDividendCash;

      cumulativeFee += r.fee;

      const row: ComputedRow = {
        ...r, sharesBought, dividendShares, dividendSharesCost, holdingShares, dividend, cumulativeDividend,
        pendingDividendCash, assetValue, isPaymentMonth, avgPrice, cumulativeFee, actualPrincipal: cumulativePrincipal,
      };
      list.push(row);
      if (!foundTarget && target > 0 && assetValue >= target) foundTarget = row;
    }
    return { computed: list, targetRow: foundTarget };
  }, [rows, planDetail?.targetAmount, planDetail?.dividendFrequency, planDetail?.customPaymentMonths, planDetail?.mode, planDetail?.startingAssetValue, planDetail?.startingAvgPrice, planDetail?.allowOddLot, planDetail?.minPurchaseAmount]);

  const last = computed[computed.length - 1];
  // 目前市值要用「現在這個月」實際持有的股數算，不是表格最後一列（表格可能已經延伸到未來月份）；
  // 找不到現在這個月（例如明細還沒延伸到現在）就退回表格最後一列當基準
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentMonthRow = computed.filter((r) => r.year < currentYear || (r.year === currentYear && r.month <= currentMonth)).pop() ?? last;
  const isTwstock = planDetail?.mode === "TWSTOCK";
  const isFund = planDetail?.mode === "FUND";
  // 台股版／基金版都有配息自動再投入，共用同一套「累計投入本金含配息再投入」「剩餘未投入配息」等卡片
  const showsReinvestMetrics = isTwstock || isFund;
  // 累計投入本金：美股版是每月投入金額加總；台股版／基金版沒有「投入金額」這個欄位（或投入金額跟配息買的混在一起），
  // 改用最後一列的「持股均價 × 持股數」反推累計實際花掉的錢（含配息加碼買的部分）
  const totalPrincipal = showsReinvestMetrics
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
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}（{p.mode === "TWSTOCK" ? "台股版" : p.mode === "FUND" ? "基金版" : "美股版"} · {p._count.rows} 個月）</option>)}
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
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm mb-6">
            <button type="button" onClick={() => setSettingsExpanded((v) => !v)}
              className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors rounded-2xl">
              方案設定
              <span className={`text-slate-400 transition-transform ${settingsExpanded ? "rotate-180" : ""}`}>▾</span>
            </button>
            {settingsExpanded && (
            <div className="px-5 pb-5 space-y-3">
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
                <option value="CUSTOM">自訂月份（半年配／年配／不配息）</option>
              </select>
              <span className="text-xs text-slate-400">季配息時，每股配息欄位代表「每次配息」的金額，只有落在配息月份的那一列才會實際入帳</span>
            </div>
            {planDetail.dividendFrequency === "CUSTOM" && (
              <div className="flex items-center gap-3 flex-wrap">
                <label className="text-sm font-medium text-slate-700 shrink-0">配息月份</label>
                <div className="flex flex-wrap gap-2">
                  {MONTH_LABELS.map((label, i) => {
                    const month = i + 1;
                    const checked = (planDetail.customPaymentMonths ?? []).includes(month);
                    return (
                      <button key={month} type="button" onClick={() => toggleCustomMonth(month)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${checked ? "bg-indigo-600 border-indigo-600 text-white" : "border-slate-200 text-slate-500 hover:border-indigo-300"}`}>
                        {label}
                      </button>
                    );
                  })}
                </div>
                <span className="text-xs text-slate-400">勾選這檔股票實際配息的月份，都不勾代表這檔不配息</span>
              </div>
            )}
            {isTwstock && (
              <div className="flex items-center gap-3 flex-wrap">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={planDetail.allowOddLot}
                    onChange={(e) => saveAllowOddLot(e.target.checked)}
                    className="w-4 h-4 accent-indigo-500" />
                  配息加碼允許買零股
                </label>
                <span className="text-xs text-slate-400">預設關閉：剩餘未投入配息要湊到滿 1 張（1,000 股）才會自動加碼；打勾後剩餘配息不管多少，夠買幾股就買幾股</span>
              </div>
            )}
            {isFund && (
              <div className="flex items-center gap-3 flex-wrap">
                <label className="text-sm font-medium text-slate-700">配息再投入單筆最低金額（選填）</label>
                <input key={`minPurchase-${dataVersion}`} type="number" min="0" step="any" defaultValue={planDetail.minPurchaseAmount || ""}
                  placeholder="例如：1000"
                  onBlur={(e) => saveMinPurchaseAmount(e.target.value)}
                  className="w-32 border border-slate-200 rounded-lg px-3.5 py-2 text-sm focus:border-indigo-400 transition-colors" />
                <span className="text-xs text-slate-400">基金單筆申購通常有最低金額限制，剩餘未投入配息沒湊到這個金額就不會自動買，留到下個月繼續累積；留空或 0 代表沒有限制</span>
              </div>
            )}
            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-sm font-medium text-slate-700">股票代號（選填）</label>
              <input key={`stockCode-${dataVersion}`} type="text" defaultValue={planDetail.stockCode ?? ""}
                placeholder="例如：00878"
                onBlur={(e) => saveStockCode(e.target.value)}
                className="w-32 border border-slate-200 rounded-lg px-3.5 py-2 text-sm focus:border-indigo-400 transition-colors" />
              <button type="button" onClick={refreshPrices} disabled={refreshingPrice || !planDetail.stockCode}
                className="text-xs text-indigo-600 font-medium hover:underline disabled:opacity-40 disabled:no-underline">
                {refreshingPrice ? "更新中..." : "重新整理股價"}
              </button>
              <span className="text-xs text-slate-400">
                填了股票代號後，系統每天會自動抓最新收盤價來算「目前市值」（目前只支援台股上市股票）
                {planDetail.currentPrice != null && planDetail.currentPriceUpdatedAt && (
                  <> ・目前股價 {fmtPrice(planDetail.currentPrice)}（{new Date(planDetail.currentPriceUpdatedAt).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 更新）</>
                )}
              </span>
            </div>
            </div>
            )}
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
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
              <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{isFund ? "目前累計單位數" : "目前累計持股"}</div>
                <div className="text-xl font-bold text-slate-900 mt-1">{fmtQty(last.holdingShares)} {isFund ? "單位" : "股"}</div>
              </div>
              <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">累計投入本金</div>
                <div className="text-xl font-bold text-slate-900 mt-1">{fmt(totalPrincipal)}</div>
                {showsReinvestMetrics && <div className="text-[11px] text-slate-400 mt-0.5">含配息再投入買的部分</div>}
              </div>
              {showsReinvestMetrics && (
                <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">實際累計投入本金</div>
                  <div className="text-xl font-bold text-slate-900 mt-1">{fmt(last.actualPrincipal)}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">不含配息再投入買的部分</div>
                </div>
              )}
              {showsReinvestMetrics && (
                <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                  <div className="text-xs font-semibold text-emerald-500 uppercase tracking-wider mb-1">累積配息金額</div>
                  <div className="text-xl font-bold text-emerald-600 mt-1">{fmt(last.cumulativeDividend)}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">歷史累計總共領到的配息</div>
                </div>
              )}
              <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                <div className="text-xs font-semibold text-emerald-500 uppercase tracking-wider mb-1">{showsReinvestMetrics ? "剩餘未投入配息" : "累計配息現金"}</div>
                <div className="text-xl font-bold text-emerald-600 mt-1">{fmt(showsReinvestMetrics ? last.pendingDividendCash : last.cumulativeDividend)}</div>
              </div>
              <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">累計手續費</div>
                <div className="text-xl font-bold text-slate-500 mt-1">{fmt(last.cumulativeFee)}</div>
                <input key={`feeNote-${dataVersion}`} type="text" defaultValue={planDetail.feeNote ?? ""}
                  placeholder={showsReinvestMetrics ? "不包含手續費" : "純紀錄，不影響任何計算"}
                  onBlur={(e) => saveFeeNote(e.target.value)}
                  className="w-full mt-0.5 text-[11px] text-slate-400 placeholder:text-slate-400 border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded px-1 -mx-1 bg-transparent" />
              </div>
              <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                <div className="text-xs font-semibold text-indigo-500 uppercase tracking-wider mb-1">推估總資產</div>
                <div className="text-xl font-bold text-indigo-600 mt-1">{fmt(last.assetValue)}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">依逐月明細輸入的買進價格推算</div>
              </div>
              {planDetail.stockCode && planDetail.currentPrice != null && (() => {
                const marketValue = currentMonthRow.holdingShares * planDetail.currentPrice
                  + (showsReinvestMetrics ? currentMonthRow.pendingDividendCash : currentMonthRow.cumulativeDividend);
                const costBasis = currentMonthRow.avgPrice * currentMonthRow.holdingShares;
                const pnl = marketValue - costBasis;
                const pnlPercent = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
                return (
                  <>
                    <div className="bg-indigo-50/40 rounded-2xl p-5 border border-indigo-100 shadow-sm">
                      <div className="text-xs font-semibold text-indigo-500 uppercase tracking-wider mb-1">目前市值</div>
                      <div className="text-xl font-bold text-indigo-700 mt-1">{fmt(marketValue)}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {currentMonthRow.year} 年 {currentMonthRow.month} 月持{isFund ? "有" : "股"} {fmtQty(currentMonthRow.holdingShares)} {isFund ? "單位" : "股"} × {planDetail.stockCode} 最新{isFund ? "淨值" : "股價"} {fmtPrice(planDetail.currentPrice)}
                      </div>
                    </div>
                    <div className={`rounded-2xl p-5 border shadow-sm ${pnl >= 0 ? "bg-rose-50/40 border-rose-100" : "bg-emerald-50/40 border-emerald-100"}`}>
                      <div className={`text-xs font-semibold uppercase tracking-wider mb-1 ${pnl >= 0 ? "text-rose-500" : "text-emerald-500"}`}>目前持有盈虧</div>
                      <div className={`text-xl font-bold mt-1 ${pnl >= 0 ? "text-rose-600" : "text-emerald-600"}`}>
                        {pnl >= 0 ? "+" : ""}{fmt(pnl)}
                        <span className="text-sm font-medium ml-1.5">（{pnl >= 0 ? "+" : ""}{pnlPercent.toFixed(2)}%）</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">目前市值－累計投入成本 {fmt(costBasis)}</div>
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* 逐月明細表（可編輯） */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50 gap-3 flex-wrap">
              <h2 className="font-semibold text-slate-900">逐月試算明細</h2>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400">白底欄位可以直接點擊修改，改完按 Tab 或點別處就會自動存檔；持有股數／實際配息留空照公式算，填了數字（<span className="text-amber-600">淡黃色</span>）就改成手動指定的值，清空可以還原</span>
                <button onClick={handleSaveAll} disabled={savingAll}
                  className="shrink-0 bg-slate-800 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-slate-700 transition-colors disabled:opacity-60">
                  {savingAll ? "儲存中..." : "強制儲存全部"}
                </button>
              </div>
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
                      <th className="px-3 py-2.5 text-right font-semibold">手續費</th>
                      <th className="px-3 py-2.5 text-right font-semibold">配息加碼股數</th>
                      <th className="px-3 py-2.5 text-right font-semibold">配息購買金額</th>
                      <th className="px-3 py-2.5 text-right font-semibold">每股配息</th>
                      <th className="px-3 py-2.5 text-right font-semibold">稅後可得%</th>
                      <th className="px-3 py-2.5 text-right font-semibold">本期配息</th>
                      <th className="px-3 py-2.5 text-right font-semibold">剩餘未投入配息</th>
                      <th className="px-3 py-2.5 text-right font-semibold">推估總資產<span className="block font-normal normal-case text-[10px] text-slate-400" title="第一列：手動指定的起始值（沒填就用 持有股數×買進價格＋剩餘未投入配息）。第二列開始：上月推估總資產＋(本月計劃買進股數＋配息加碼股數)×本月買進價格＋本月剩餘未投入配息比上月新增的部分－本月手續費">上月總資產＋買進股數×價格＋剩餘配息</span></th>
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
                            <input key={`${r.id}-${dataVersion}`} type="number" step="any" defaultValue={r.sharesToBuy ?? 0}
                              onChange={(e) => updateLocalRow(r.id, "sharesToBuy", e.target.value)}
                              onBlur={() => saveRow(rows.find((x) => x.id === r.id)!)}
                              className="w-24 text-right px-2 py-1 border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded text-sm" />
                            <button type="button" title="把這個股數套用到之後所有月份（會蓋掉原本遞增的規律，之後都固定這個數字）"
                              onClick={() => applyForward(rows.find((x) => x.id === r.id)!, "sharesToBuy", rows.find((x) => x.id === r.id)!.sharesToBuy ?? 0)}
                              className="opacity-0 group-hover:opacity-100 text-[10px] text-indigo-400 hover:text-indigo-600 px-1 transition-opacity">→後</button>
                          </div>
                        </td>
                        <td className="px-1 py-1">
                          <input key={`${r.id}-${dataVersion}`} type="number" step="any"
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
                            <input key={`${r.id}-${dataVersion}`} type="number" step="any" defaultValue={r.price}
                              onChange={(e) => updateLocalRow(r.id, "price", e.target.value)}
                              onBlur={() => saveRow(rows.find((x) => x.id === r.id)!)}
                              className="w-20 text-right px-2 py-1 border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded text-sm" />
                            <button type="button" title="把這個價格套用到之後所有月份"
                              onClick={() => applyForward(rows.find((x) => x.id === r.id)!, "price", rows.find((x) => x.id === r.id)!.price)}
                              className="opacity-0 group-hover:opacity-100 text-[10px] text-indigo-400 hover:text-indigo-600 px-1 transition-opacity">→後</button>
                          </div>
                        </td>
                        <td className="px-1 py-1">
                          <div className="flex items-center justify-end gap-0.5">
                            <input key={`${r.id}-${dataVersion}`} type="number" step="any" defaultValue={r.fee}
                              title="第一列(起始列)不計算；第二列開始會從當月推估總資產裡扣除"
                              onChange={(e) => updateLocalRow(r.id, "fee", e.target.value)}
                              onBlur={() => saveRow(rows.find((x) => x.id === r.id)!)}
                              className="w-16 text-right px-2 py-1 border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded text-sm" />
                            <button type="button" title="把這個手續費套用到之後所有月份"
                              onClick={() => applyForward(rows.find((x) => x.id === r.id)!, "fee", rows.find((x) => x.id === r.id)!.fee)}
                              className="opacity-0 group-hover:opacity-100 text-[10px] text-indigo-400 hover:text-indigo-600 px-1 transition-opacity">→後</button>
                          </div>
                        </td>
                        <td className="px-1 py-1">
                          <input key={`${r.id}-${dataVersion}`} type="number" step="any"
                            defaultValue={r.dividendPurchaseOverride != null ? r.dividendShares : ""} placeholder={r.dividendShares > 0 ? fmtQty(r.dividendShares) : "0"}
                            title="留空＝照「滿1張才加碼」公式算；填股數＝改成手動指定的配息加碼股數，會連動換算配息購買金額"
                            onChange={(e) => updateDividendSharesOverride(r.id, e.target.value)}
                            onBlur={() => saveRow(rows.find((x) => x.id === r.id)!)}
                            className={`w-20 text-right px-2 py-1 border rounded text-sm placeholder:text-slate-400 ${r.dividendPurchaseOverride != null ? "border-amber-300 bg-amber-50" : "border-transparent hover:border-slate-200 focus:border-indigo-400"}`} />
                        </td>
                        <td className="px-1 py-1">
                          <input key={`${r.id}-${dataVersion}`} type="number" step="any"
                            defaultValue={r.dividendPurchaseOverride ?? ""} placeholder={r.dividendSharesCost > 0 ? fmtQty(r.dividendSharesCost) : "0"}
                            title="留空＝照「滿1張才加碼」公式算；填金額＝改成手動指定的配息購買金額，會連動換算配息加碼股數"
                            onChange={(e) => updateLocalOverride(r.id, "dividendPurchaseOverride", e.target.value)}
                            onBlur={() => saveRow(rows.find((x) => x.id === r.id)!)}
                            className={`w-24 text-right px-2 py-1 border rounded text-sm placeholder:text-slate-400 ${r.dividendPurchaseOverride != null ? "border-amber-300 bg-amber-50" : "border-transparent hover:border-slate-200 focus:border-indigo-400"}`} />
                        </td>
                        <td className="px-1 py-1">
                          {r.isPaymentMonth ? (
                            <input key={`${r.id}-${dataVersion}`} type="number" step="any" defaultValue={r.dividendRate}
                              onChange={(e) => updateLocalRow(r.id, "dividendRate", e.target.value)}
                              onBlur={() => saveRow(rows.find((x) => x.id === r.id)!)}
                              className="w-16 text-right px-2 py-1 border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded text-sm" />
                          ) : (
                            <div className="w-16 text-right px-2 py-1 text-slate-300 text-sm" title="這個月不是配息月">—</div>
                          )}
                        </td>
                        <td className="px-1 py-1">
                          <input key={`${r.id}-${dataVersion}`} type="number" step="any" min="0" max="100" defaultValue={r.afterTaxRate * 100}
                            onChange={(e) => updateLocalRow(r.id, "afterTaxRate", String((parseFloat(e.target.value) || 0) / 100))}
                            onBlur={() => saveRow(rows.find((x) => x.id === r.id)!)}
                            className="w-14 text-right px-2 py-1 border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded text-sm" />
                        </td>
                        <td className="px-1 py-1">
                          <input key={`${r.id}-${dataVersion}`} type="number" step="any"
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
                              title="直接指定這一列(起始列)的推估總資產是多少，會取代公式算出來的值，不是疊加上去；填 0 代表不手動指定、照公式算"
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
              ) : isFund ? (
                <table className="w-full text-sm whitespace-nowrap">
                  <thead className="sticky top-0 bg-slate-50 z-10">
                    <tr className="text-xs text-slate-500">
                      <th className="px-3 py-2.5 text-left font-semibold">年份</th>
                      <th className="px-3 py-2.5 text-left font-semibold">月份</th>
                      <th className="px-3 py-2.5 text-right font-semibold">每月投入金額</th>
                      <th className="px-3 py-2.5 text-right font-semibold">持有單位數</th>
                      <th className="px-3 py-2.5 text-right font-semibold">持有均價</th>
                      <th className="px-3 py-2.5 text-right font-semibold">基金淨值</th>
                      <th className="px-3 py-2.5 text-right font-semibold">手續費</th>
                      <th className="px-3 py-2.5 text-right font-semibold">配息加碼單位數</th>
                      <th className="px-3 py-2.5 text-right font-semibold">配息購買金額</th>
                      <th className="px-3 py-2.5 text-right font-semibold">每單位配息</th>
                      <th className="px-3 py-2.5 text-right font-semibold">稅後可得%</th>
                      <th className="px-3 py-2.5 text-right font-semibold">本期配息</th>
                      <th className="px-3 py-2.5 text-right font-semibold">剩餘未投入配息</th>
                      <th className="px-3 py-2.5 text-right font-semibold">推估總資產<span className="block font-normal normal-case text-[10px] text-slate-400" title="第一列：手動指定的起始值（沒填就用 持有單位數×淨值＋剩餘未投入配息）。第二列開始：上月推估總資產＋(本月投入單位數＋配息加碼單位數)×本月淨值＋本月剩餘未投入配息比上月新增的部分－本月手續費">上月總資產＋投入單位×淨值＋剩餘配息</span></th>
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
                            <input key={`${r.id}-${dataVersion}`} type="number" step="any" defaultValue={r.investment}
                              onChange={(e) => updateLocalRow(r.id, "investment", e.target.value)}
                              onBlur={() => saveRow(rows.find((x) => x.id === r.id)!)}
                              className="w-24 text-right px-2 py-1 border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded text-sm" />
                            <button type="button" title="把這個投入金額套用到之後所有月份"
                              onClick={() => applyForward(rows.find((x) => x.id === r.id)!, "investment", rows.find((x) => x.id === r.id)!.investment)}
                              className="opacity-0 group-hover:opacity-100 text-[10px] text-indigo-400 hover:text-indigo-600 px-1 transition-opacity">→後</button>
                          </div>
                        </td>
                        <td className="px-1 py-1">
                          <input key={`${r.id}-${dataVersion}`} type="number" step="any"
                            defaultValue={r.holdingSharesOverride ?? ""} placeholder={fmtQty(r.holdingShares)}
                            title="留空＝照公式自動算；填數字＝改成手動指定的真實單位數，下個月開始接著這個數字往下算"
                            onChange={(e) => updateLocalOverride(r.id, "holdingSharesOverride", e.target.value)}
                            onBlur={() => saveRow(rows.find((x) => x.id === r.id)!)}
                            className={`w-24 text-right px-2 py-1 border rounded text-sm placeholder:text-slate-400 ${r.holdingSharesOverride != null ? "border-amber-300 bg-amber-50" : "border-transparent hover:border-slate-200 focus:border-indigo-400"}`} />
                        </td>
                        <td className="px-1 py-1 text-right text-slate-500">
                          {i === 0 ? (
                            <input type="number" step="any" defaultValue={planDetail.startingAvgPrice ?? ""} placeholder={fmtQty(r.avgPrice)}
                              title="留空＝從 0 開始照公式算；填數字＝開始試算前既有持有單位的均價，當作起始基準"
                              onBlur={(e) => saveStartingAvgPrice(e.target.value)}
                              className={`w-20 text-right px-2 py-1 border rounded text-sm placeholder:text-slate-400 ${planDetail.startingAvgPrice != null ? "border-amber-300 bg-amber-50" : "border-transparent hover:border-slate-200 focus:border-indigo-400"}`} />
                          ) : fmtQty(r.avgPrice)}
                        </td>
                        <td className="px-1 py-1">
                          <div className="flex items-center justify-end gap-0.5">
                            <input key={`${r.id}-${dataVersion}`} type="number" step="any" defaultValue={r.price}
                              onChange={(e) => updateLocalRow(r.id, "price", e.target.value)}
                              onBlur={() => saveRow(rows.find((x) => x.id === r.id)!)}
                              className="w-20 text-right px-2 py-1 border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded text-sm" />
                            <button type="button" title="把這個淨值套用到之後所有月份"
                              onClick={() => applyForward(rows.find((x) => x.id === r.id)!, "price", rows.find((x) => x.id === r.id)!.price)}
                              className="opacity-0 group-hover:opacity-100 text-[10px] text-indigo-400 hover:text-indigo-600 px-1 transition-opacity">→後</button>
                          </div>
                        </td>
                        <td className="px-1 py-1">
                          <div className="flex items-center justify-end gap-0.5">
                            <input key={`${r.id}-${dataVersion}`} type="number" step="any" defaultValue={r.fee}
                              title="第一列(起始列)不計算；第二列開始會從當月推估總資產裡扣除"
                              onChange={(e) => updateLocalRow(r.id, "fee", e.target.value)}
                              onBlur={() => saveRow(rows.find((x) => x.id === r.id)!)}
                              className="w-16 text-right px-2 py-1 border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded text-sm" />
                            <button type="button" title="把這個手續費套用到之後所有月份"
                              onClick={() => applyForward(rows.find((x) => x.id === r.id)!, "fee", rows.find((x) => x.id === r.id)!.fee)}
                              className="opacity-0 group-hover:opacity-100 text-[10px] text-indigo-400 hover:text-indigo-600 px-1 transition-opacity">→後</button>
                          </div>
                        </td>
                        <td className="px-1 py-1">
                          <input key={`${r.id}-${dataVersion}`} type="number" step="any"
                            defaultValue={r.dividendPurchaseOverride != null ? r.dividendShares : ""} placeholder={r.dividendShares > 0 ? fmtQty(r.dividendShares) : "0"}
                            title="留空＝配息現金有多少就全部拿去買多少單位（基金可以買小數單位，不用湊整張）；填數字＝改成手動指定的配息加碼單位數，會連動換算配息購買金額"
                            onChange={(e) => updateDividendSharesOverride(r.id, e.target.value)}
                            onBlur={() => saveRow(rows.find((x) => x.id === r.id)!)}
                            className={`w-20 text-right px-2 py-1 border rounded text-sm placeholder:text-slate-400 ${r.dividendPurchaseOverride != null ? "border-amber-300 bg-amber-50" : "border-transparent hover:border-slate-200 focus:border-indigo-400"}`} />
                        </td>
                        <td className="px-1 py-1">
                          <input key={`${r.id}-${dataVersion}`} type="number" step="any"
                            defaultValue={r.dividendPurchaseOverride ?? ""} placeholder={r.dividendSharesCost > 0 ? fmtQty(r.dividendSharesCost) : "0"}
                            title="留空＝配息現金有多少就全部拿去買；填金額＝改成手動指定的配息購買金額，會連動換算配息加碼單位數"
                            onChange={(e) => updateLocalOverride(r.id, "dividendPurchaseOverride", e.target.value)}
                            onBlur={() => saveRow(rows.find((x) => x.id === r.id)!)}
                            className={`w-24 text-right px-2 py-1 border rounded text-sm placeholder:text-slate-400 ${r.dividendPurchaseOverride != null ? "border-amber-300 bg-amber-50" : "border-transparent hover:border-slate-200 focus:border-indigo-400"}`} />
                        </td>
                        <td className="px-1 py-1">
                          {r.isPaymentMonth ? (
                            <input key={`${r.id}-${dataVersion}`} type="number" step="any" defaultValue={r.dividendRate}
                              onChange={(e) => updateLocalRow(r.id, "dividendRate", e.target.value)}
                              onBlur={() => saveRow(rows.find((x) => x.id === r.id)!)}
                              className="w-16 text-right px-2 py-1 border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded text-sm" />
                          ) : (
                            <div className="w-16 text-right px-2 py-1 text-slate-300 text-sm" title="這個月不是配息月">—</div>
                          )}
                        </td>
                        <td className="px-1 py-1">
                          <input key={`${r.id}-${dataVersion}`} type="number" step="any" min="0" max="100" defaultValue={r.afterTaxRate * 100}
                            onChange={(e) => updateLocalRow(r.id, "afterTaxRate", String((parseFloat(e.target.value) || 0) / 100))}
                            onBlur={() => saveRow(rows.find((x) => x.id === r.id)!)}
                            className="w-14 text-right px-2 py-1 border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded text-sm" />
                        </td>
                        <td className="px-1 py-1">
                          <input key={`${r.id}-${dataVersion}`} type="number" step="any"
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
                              title="直接指定這一列(起始列)的推估總資產是多少，會取代公式算出來的值，不是疊加上去；填 0 代表不手動指定、照公式算"
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
                            <input key={`${r.id}-${dataVersion}`} type="number" step="any" defaultValue={r.investment}
                              onChange={(e) => updateLocalRow(r.id, "investment", e.target.value)}
                              onBlur={() => saveRow(rows.find((x) => x.id === r.id)!)}
                              className="w-24 text-right px-2 py-1 border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded text-sm" />
                            <button type="button" title="把這個金額套用到之後所有月份"
                              onClick={() => applyForward(rows.find((x) => x.id === r.id)!, "investment", rows.find((x) => x.id === r.id)!.investment)}
                              className="opacity-0 group-hover:opacity-100 text-[10px] text-indigo-400 hover:text-indigo-600 px-1 transition-opacity">→後</button>
                          </div>
                        </td>
                        <td className="px-1 py-1">
                          <input key={`${r.id}-${dataVersion}`} type="number" step="any"
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
                          <input key={`${r.id}-${dataVersion}`} type="number" step="any" defaultValue={r.fee}
                            onChange={(e) => updateLocalRow(r.id, "fee", e.target.value)}
                            onBlur={() => saveRow(rows.find((x) => x.id === r.id)!)}
                            className="w-16 text-right px-2 py-1 border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded text-sm" />
                        </td>
                        <td className="px-1 py-1">
                          <div className="flex items-center justify-end gap-0.5">
                            <input key={`${r.id}-${dataVersion}`} type="number" step="any" defaultValue={r.price}
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
                            <input key={`${r.id}-${dataVersion}`} type="number" step="any" defaultValue={r.dividendRate}
                              onChange={(e) => updateLocalRow(r.id, "dividendRate", e.target.value)}
                              onBlur={() => saveRow(rows.find((x) => x.id === r.id)!)}
                              className="w-16 text-right px-2 py-1 border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded text-sm" />
                          ) : (
                            <div className="w-16 text-right px-2 py-1 text-slate-300 text-sm" title="這個月不是配息月">—</div>
                          )}
                        </td>
                        <td className="px-1 py-1">
                          <input key={`${r.id}-${dataVersion}`} type="number" step="any" min="0" max="100" defaultValue={r.afterTaxRate * 100}
                            onChange={(e) => updateLocalRow(r.id, "afterTaxRate", String((parseFloat(e.target.value) || 0) / 100))}
                            onBlur={() => saveRow(rows.find((x) => x.id === r.id)!)}
                            className="w-14 text-right px-2 py-1 border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded text-sm" />
                        </td>
                        <td className="px-1 py-1">
                          <input key={`${r.id}-${dataVersion}`} type="number" step="any"
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
                  <button type="button" onClick={() => setCreateForm({ ...createForm, mode: "FUND" })}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${createForm.mode === "FUND" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                    基金版（固定每月投入金額，配息自動滾入）
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
                    <option value="CUSTOM">自訂月份（半年配／年配／不配息）</option>
                  </select>
                </div>
              </div>
              {createForm.dividendFrequency === "CUSTOM" && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">配息月份</label>
                  <div className="flex flex-wrap gap-2">
                    {MONTH_LABELS.map((label, i) => {
                      const month = i + 1;
                      const checked = createForm.customPaymentMonths.includes(month);
                      return (
                        <button key={month} type="button"
                          onClick={() => setCreateForm({
                            ...createForm,
                            customPaymentMonths: checked
                              ? createForm.customPaymentMonths.filter((m) => m !== month)
                              : [...createForm.customPaymentMonths, month].sort((a, b) => a - b),
                          })}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${checked ? "bg-indigo-600 border-indigo-600 text-white" : "border-slate-200 text-slate-500 hover:border-indigo-300"}`}>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-slate-400 mt-1.5">勾選這檔股票實際配息的月份，都不勾代表這檔不配息；建立後也可以在方案頁面裡再調整</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">股票代號（選填）</label>
                  <input type="text" value={createForm.stockCode}
                    onChange={(e) => setCreateForm({ ...createForm, stockCode: e.target.value })} placeholder="例如：00878"
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                  <p className="text-xs text-slate-400 mt-1">填了會每天自動抓收盤價算目前市值（只支援台股上市）</p>
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
