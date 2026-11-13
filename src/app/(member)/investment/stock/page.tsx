"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { authFetch } from "@/lib/api-fetch";
import { computeStockLedger, NO_REALIZE_NOTE, type SaleResult } from "@/lib/stock-holdings";
import { getTodayTW, monthRange } from "@/lib/date";
import Combobox from "@/components/ui/Combobox";
import Pagination from "@/components/ui/Pagination";

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

const PAGE_SIZE = 20;

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
  date: "",
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
  costAdjustQuantity: "",
  costAdjustSource: "",
  note: "",
  noRealize: false,
};

// 台股交割日：成交日 + 2 個工作天（跳過週六、週日；國定假日請自行調整）
function settlementDate(tradeDate: string): string {
  const d = new Date(`${tradeDate}T00:00:00`);
  if (isNaN(d.getTime())) return tradeDate;
  let added = 0;
  while (added < 2) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) added++;
  }
  return d.toLocaleDateString("sv-SE");
}

export default function StockPage() {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [stockFilter, setStockFilter] = useState("");
  const [realizedOpen, setRealizedOpen] = useState(false);
  const [unrealizedOpen, setUnrealizedOpen] = useState(false);
  const [statsMonth, setStatsMonth] = useState("");
  const [holdingsMonth, setHoldingsMonth] = useState("");
  // 買賣同步到銀行資金管理：交割銀行（記住上次選的）與交割日（預設成交日 + 2 個工作天，可改）
  const [bankNames, setBankNames] = useState<string[]>([]);
  const [bankCategoryIds, setBankCategoryIds] = useState<{ INCOME?: string; EXPENSE?: string }>({});
  const [settleBank, setSettleBank] = useState("");
  const [settleDate, setSettleDate] = useState("");
  // 持股校正：把某一檔的股數與總成本調成券商庫存上的實際數字
  const [calibrating, setCalibrating] = useState<{ code: string; name: string; quantity: number; cost: number } | null>(null);
  const [calibForm, setCalibForm] = useState({ quantity: "", cost: "", note: "" });
  const [calibSaving, setCalibSaving] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState(() => ({ ...EMPTY_ADD_FORM, date: getTodayTW() }));
  const [addSaving, setAddSaving] = useState(false);

  const [editing, setEditing] = useState<Investment | null>(null);
  const [editForm, setEditForm] = useState({ name: "", code: "", date: "", action: "BUY" as "BUY" | "SELL", broker: "", quantity: "", note: "", noRealize: false });
  const [saving, setSaving] = useState(false);

  const [userBrokers, setUserBrokers] = useState<UserBroker[]>([]);
  const [addBrokerInput, setAddBrokerInput] = useState("");
  const [addBrokerOpen, setAddBrokerOpen] = useState(false);
  const [addBrokerLoading, setAddBrokerLoading] = useState(false);

  // 未實現損益：目前持股的即時股價，跟「投資策略」頁「當前」欄位共用同一套抓價邏輯
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const [pricesLoading, setPricesLoading] = useState(false);
  const [priceUpdatedAt, setPriceUpdatedAt] = useState<string | null>(null);
  const pricesFetchedRef = useRef(false);
  const handleRefreshPrices = useCallback(async (codes: string[]) => {
    if (codes.length === 0) return;
    setPricesLoading(true);
    try {
      const res = await authFetch("/api/investments/stock-live-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codes }),
      });
      if (res.ok) {
        const data = await res.json();
        setLivePrices((prev) => ({ ...prev, ...data.prices }));
        setPriceUpdatedAt(new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" }));
      }
    } finally {
      setPricesLoading(false);
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [invRes, feeRes, brokerRes, bankRes, catRes] = await Promise.all([
      fetch("/api/investments?type=STOCK"),
      fetch("/api/fee-settings"),
      fetch("/api/user-brokers"),
      fetch("/api/banks/summary"),
      fetch("/api/categories"),
    ]);
    const [invData, feeData, brokerData, bankData, catData] = await Promise.all([invRes.json(), feeRes.json(), brokerRes.json(), bankRes.json().catch(() => []), catRes.json().catch(() => [])]);
    setBankNames(Array.isArray(bankData) ? bankData.map((b: { name: string }) => b.name) : []);
    const cats: { id: string; name: string; type: string }[] = Array.isArray(catData) ? catData : [];
    setBankCategoryIds({
      INCOME: cats.find((c) => c.name === "銀行" && c.type === "INCOME")?.id,
      EXPENSE: cats.find((c) => c.name === "銀行" && c.type === "EXPENSE")?.id,
    });
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
  // 均價固定算到小數點後兩位（第三位四捨五入），不像其他金額欄位四捨五入到整數
  const fmtAvg = (n: number) =>
    new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  const buyCount = investments.filter((i) => i.action === "BUY").length;
  const sellCount = investments.filter((i) => i.action === "SELL").length;
  // 先進先出：賣出從最早買進的那批開始扣，sales 是每筆賣出的成本與已實現損益
  const { holdings, sales } = computeStockLedger(investments);
  // 進頁面載入完持股後自動抓一次即時股價（只抓一次，避免每次重新整理都打外部API），
  // 之後可以用「重新整理股價」按鈕手動再抓
  useEffect(() => {
    if (loading || pricesFetchedRef.current || holdings.length === 0) return;
    pricesFetchedRef.current = true;
    handleRefreshPrices(holdings.map((h) => h.code).filter((c) => c && c !== "—"));
  }, [loading, holdings, handleRefreshPrices]);
  // 「買低賣高降成本」的賣出：股數/成本正常從FIFO扣減，但不計入已實現損益統計
  const isNoRealizeRecord = (i: Investment) => !!i.note?.startsWith(NO_REALIZE_NOTE);
  const realizedPnl = investments.reduce((s, inv) => {
    if (isNoRealizeRecord(inv)) return s;
    const sale = sales.get(inv.id);
    return sale ? s + sale.pnl : s;
  }, 0);
  const signedFmt = (n: number) => `${n > 0 ? "+" : ""}${fmt(n)}`;
  // 已實現損益明細：依股票分組，每次賣出列出當次股數、賣價與先進先出扣掉的成本；
  // 只保留目前仍持有的股票（已經全部出清、不再持有的標的不需要留著歷史明細，避免清單越積越長）
  const realizedGroups = (() => {
    const heldKeys = new Set(holdings.map((h) => h.key));
    const map = new Map<string, { key: string; name: string; code: string; qty: number; pnl: number; adjustedPnl: number; rows: { inv: Investment; sale: SaleResult }[] }>();
    for (const inv of investments) {
      if (isNoRealizeRecord(inv)) continue;
      const sale = sales.get(inv.id);
      if (!sale) continue;
      const key = inv.code?.trim() || inv.name?.trim() || "(未命名)";
      if (!heldKeys.has(key)) continue;
      if (!map.has(key)) map.set(key, { key, name: inv.name || "(未命名)", code: inv.code || "—", qty: 0, pnl: 0, adjustedPnl: 0, rows: [] });
      const g = map.get(key)!;
      g.qty += inv.quantity ?? 0;
      g.pnl += sale.pnl;
      g.adjustedPnl += sale.adjustedPnl;
      g.rows.push({ inv, sale });
    }
    const time = (i: Investment) => new Date(i.date ?? i.createdAt).getTime();
    const groups = [...map.values()];
    for (const g of groups) g.rows.sort((a, b) => time(b.inv) - time(a.inv));
    // 最近有賣出的股票排在前面
    return groups.sort((a, b) => time(b.rows[0].inv) - time(a.rows[0].inv));
  })();
  // 明細只列目前持有的股票，這裡的小計要跟著只算這些，才會跟下面實際列出的加總對得起來
  // （跟 Summary 卡片「所有賣出累計」的 realizedPnl 是不同的數字，那張卡刻意算全部，含已出清的）
  const realizedPnlHeld = realizedGroups.reduce((s, g) => s + g.pnl, 0);
  const pnlColor = (n: number) => (n >= 0 ? "text-red-500" : "text-emerald-600");
  // 持股成本：目前仍持有部位的投入成本（含成本調整），跟資產總攬的股票投資同一個數字
  const netInvested = holdings.reduce((s, h) => s + h.cost, 0);
  // 持股狀況依月份顯示：選過去月份看那個月底累計持有的部位，選當月則看到今天為止
  // （月份選單涵蓋最早一筆交易到本月，沒交易的月份也能選，因為持股是累計的）
  const todayStr = getTodayTW();
  const currentMonthStr = todayStr.slice(0, 7);
  const holdingsMonthOptions = (investments.length === 0
    ? [currentMonthStr]
    : monthRange(investments.map((i) => (i.date ?? i.createdAt).slice(0, 7)).sort()[0], currentMonthStr)
  ).reverse();
  const effectiveHoldingsMonth = holdingsMonth || currentMonthStr;
  const isCurrentHoldingsMonth = effectiveHoldingsMonth === currentMonthStr;
  // 當月直接沿用上面已經算好的 holdings（跟校正功能共用同一份資料，避免同一頁對當下持股
  // 算出兩種不同結果）；只有選過去月份才需要另外算歷史快照，且歷史快照不提供校正（只看過去）
  const holdingsForMonth = isCurrentHoldingsMonth ? holdings : computeStockLedger(
    investments.filter((i) => {
      const d = (i.date ?? i.createdAt).slice(0, 10);
      return d.slice(0, 7) <= effectiveHoldingsMonth;
    })
  ).holdings;
  // 未實現損益：目前持有部位若用即時股價全部賣出的估計盈虧，公式跟「新增記錄」賣出試算、
  // 「投資策略」頁一致（市值 − 投入成本 − 賣出手續費 − 證券交易稅），抓不到報價的那檔先跳過不計入
  const unrealizedFeeRate = (parseFloat(addForm.feeRate) || 0) / 100;
  const unrealizedDiscount = parseFloat(addForm.discount) || 1;
  const unrealizedTaxRate = (parseFloat(addForm.taxRate) || 0) / 100;
  const unrealizedFor = (h: { quantity: number; cost: number; code: string }) => {
    const price = livePrices[h.code];
    if (!price) return null;
    const marketValue = h.quantity * price;
    const sellFee = marketValue * unrealizedFeeRate * unrealizedDiscount;
    const tax = marketValue * unrealizedTaxRate;
    return marketValue - h.cost - sellFee - tax;
  };
  const unrealizedTotal = holdingsForMonth.reduce((s, h) => s + (unrealizedFor(h) ?? 0), 0);
  const unrealizedMissing = holdingsForMonth.some((h) => unrealizedFor(h) == null);
  // 月份買進統計：依「成交日期」所在月份分組，只列有買進記錄的月份可選
  const buyMonthOptions = Array.from(
    new Set(investments.filter((i) => i.action === "BUY").map((i) => (i.date ?? i.createdAt).slice(0, 7)))
  ).sort().reverse();
  const effectiveStatsMonth = statsMonth || buyMonthOptions[0] || "";
  const monthlyBuyStats = (() => {
    const map = new Map<string, { key: string; name: string; code: string; quantity: number; principal: number; fee: number }>();
    for (const inv of investments) {
      if (inv.action !== "BUY") continue;
      if ((inv.date ?? inv.createdAt).slice(0, 7) !== effectiveStatsMonth) continue;
      const key = inv.code?.trim() || inv.name?.trim() || "(未命名)";
      if (!map.has(key)) map.set(key, { key, name: inv.name || "(未命名)", code: inv.code || "—", quantity: 0, principal: 0, fee: 0 });
      const g = map.get(key)!;
      g.quantity += inv.quantity ?? 0;
      g.principal += (inv.quantity ?? 0) * (inv.price ?? 0);
      g.fee += inv.fee ?? 0;
    }
    return [...map.values()].sort((a, b) => (b.principal + b.fee) - (a.principal + a.fee));
  })();
  // 投資記錄依「申購/調整日期」由新到舊排序，補登前幾天的帳也會照日期排在正確位置；
  // 同一天的多筆再依建立時間由新到舊，同日內的先後順序才穩定
  const sortedInvestments = [...investments].sort((a, b) => {
    const byDate = new Date(b.date ?? b.createdAt).getTime() - new Date(a.date ?? a.createdAt).getTime();
    return byDate !== 0 ? byDate : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  // 股票名稱篩選選單：從實際記錄裡出現過的股票取不重複清單（優先用代碼判斷），依筆畫排序
  const stockKey = (i: Investment) => i.code?.trim() || i.name?.trim() || "(未命名)";
  const stockFilterOptions = Array.from(
    investments.reduce((m, i) => {
      const key = stockKey(i);
      if (!m.has(key)) m.set(key, { key, name: i.name?.trim() || "(未命名)", code: i.code?.trim() });
      return m;
    }, new Map<string, { key: string; name: string; code?: string }>()).values()
  ).sort((a, b) => a.name.localeCompare(b.name, "zh-TW"));
  const filteredInvestments = stockFilter ? sortedInvestments.filter((i) => stockKey(i) === stockFilter) : sortedInvestments;
  const pageCount = Math.max(1, Math.ceil(filteredInvestments.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pagedInvestments = filteredInvestments.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  // 成本調整可選的「獲利來源股票」：所有出現過紀錄的股票（含已全數賣出的），排除被調整的那檔
  const sourceStocks = Array.from(
    investments.reduce((m, i) => {
      const code = i.code?.trim();
      if (code && !m.has(code)) m.set(code, { code, name: i.name || code });
      return m;
    }, new Map<string, { code: string; name: string }>()).values()
  ).filter((s) => s.code !== addForm.code);

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
    setAddForm((f) => ({ ...EMPTY_ADD_FORM, date: getTodayTW(), feeRate: f.feeRate }));
    setAddBrokerInput("");
    setAddBrokerOpen(false);
  };

  const openAdd = () => {
    resetAddForm(); setShowAddModal(true);
    try { setSettleBank(localStorage.getItem("stock-settle-bank") ?? ""); } catch { setSettleBank(""); }
    setSettleDate("");
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();

    if (addForm.mode === "COST_ADJUST") {
      if (!addForm.code) {
        alert("請選擇要調整成本的股票");
        return;
      }
      const adjustCost = parseFloat(addForm.costAdjustAmount) || 0;
      const adjustQty = parseFloat(addForm.costAdjustQuantity) || 0;
      if (adjustCost <= 0 && adjustQty <= 0) {
        alert("請填寫調整金額或配股股數");
        return;
      }
      const defaultNote = adjustQty > 0
        ? (adjustCost > 0 ? "成本調整＋配股（增加股數並自其他持股獲利中扣抵成本）" : "配股（股數增加，成本不變，平均成本自動下降）")
        : "成本調整（用其他持股獲利攤平此檔虧損，股數不變）";
      const source = adjustCost > 0 ? sourceStocks.find((s) => s.code === addForm.costAdjustSource) : undefined;
      setAddSaving(true);
      const adjustRes = await authFetch("/api/investments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "STOCK",
          name: addForm.name,
          code: addForm.code,
          date: addForm.date,
          action: adjustQty > 0 ? "BUY" : "SELL",
          amount: -adjustCost,
          quantity: adjustQty > 0 ? adjustQty : undefined,
          note: addForm.note || (source ? `${defaultNote}，獲利來源：${source.name}` : defaultNote),
        }),
      });
      // 獲利來源只記在備註：持股成本以先進先出計算，來源股票賣出時已實現的獲利不會留在它的成本裡，
      // 不需要再補沖銷記錄（舊版會在來源股票補一筆「沖銷」，計算時一律略過）
      if (!adjustRes.ok) alert("成本調整儲存失敗，請稍後再試");
      setAddSaving(false);
      setShowAddModal(false);
      setPage(1);
      fetchAll();
      return;
    }

    if (quantity <= 0 || price <= 0) {
      alert("請填寫股數與每股價格");
      return;
    }
    setAddSaving(true);
    const invRes = await authFetch("/api/investments", {
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
        note: addForm.action === "SELL" && addForm.noRealize
          ? `${NO_REALIZE_NOTE}${addForm.note ? `：${addForm.note}` : ""}`
          : addForm.note,
      }),
    });
    // 同步到銀行資金管理：買進記銀行支出、賣出記銀行收入（格式同手動記帳：分類「銀行」、備註放銀行名稱）
    if (invRes.ok && settleBank) {
      const isBuy = addForm.action === "BUY";
      const stockName = addForm.name || addForm.code || "股票";
      const bankRes = await authFetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: isBuy ? stockName : `${stockName}賣出`,
          amount: Math.round(subtotal),
          type: isBuy ? "EXPENSE" : "INCOME",
          date: settleDate || settlementDate(addForm.date),
          categoryId: (isBuy ? bankCategoryIds.EXPENSE : bankCategoryIds.INCOME) ?? "",
          note: settleBank,
          source: "BANK",
          currency: "TWD",
        }),
      });
      if (!bankRes.ok) alert(`股票記錄已儲存，但銀行記錄新增失敗，請到銀行資金管理手動補一筆${isBuy ? "支出" : "收入"} ${Math.round(subtotal)}`);
      try { localStorage.setItem("stock-settle-bank", settleBank); } catch { /* 無法記住也不影響 */ }
    }
    setAddSaving(false);
    setShowAddModal(false);
    setPage(1);
    fetchAll();
  };

  // 把「降低持有成本，不列入已實現損益」的備註標記去掉，編輯表單只顯示使用者自己填的那段
  const stripNoRealizeNote = (note: string) => {
    if (!note.startsWith(NO_REALIZE_NOTE)) return note;
    const rest = note.slice(NO_REALIZE_NOTE.length);
    return rest.startsWith("：") ? rest.slice(1) : rest;
  };

  const openEdit = (inv: Investment) => {
    setEditing(inv);
    const rawNote = inv.note ?? "";
    setEditForm({
      name: inv.name ?? "",
      code: inv.code ?? "",
      date: inv.date ? inv.date.split("T")[0] : "",
      action: inv.action,
      broker: inv.broker ?? "",
      quantity: inv.quantity ? String(inv.quantity) : "",
      note: stripNoRealizeNote(rawNote),
      noRealize: isNoRealizeRecord(inv),
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    const finalNote = editForm.action === "SELL" && editForm.noRealize
      ? `${NO_REALIZE_NOTE}${editForm.note ? `：${editForm.note}` : ""}`
      : editForm.note;
    const res = await authFetch(`/api/investments/${editing.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...editForm, note: finalNote }),
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

  const openCalibrate = (h: { code: string; name: string; quantity: number; cost: number }) => {
    setCalibrating(h);
    setCalibForm({ quantity: String(h.quantity), cost: String(Math.round(h.cost)), note: "" });
  };

  // 校正：先補股數差額（股數多記零成本、少了依先進先出扣掉），再補成本差額，讓股數與總成本等於輸入的實際數字
  const saveCalibrate = async () => {
    if (!calibrating) return;
    const targetQty = parseFloat(calibForm.quantity);
    const targetCost = parseFloat(calibForm.cost);
    if (!(targetQty >= 0) || !(targetCost >= 0)) { alert("請填寫實際股數與總成本"); return; }
    const qtyDiff = Math.round((targetQty - calibrating.quantity) * 1e6) / 1e6;
    // 先模擬補完股數差額後的成本（股數減少時依先進先出扣掉對應批次的成本），再算要補的成本差額，確保最後剛好等於目標
    const now = new Date().toISOString();
    const qtyRec = qtyDiff !== 0
      ? [{ code: calibrating.code, name: calibrating.name, action: (qtyDiff > 0 ? "BUY" : "SELL") as "BUY" | "SELL", quantity: Math.abs(qtyDiff), price: null, amount: 0, date: now, createdAt: now }]
      : [];
    const after = computeStockLedger([...investments, ...qtyRec]).holdings.find((x) => x.code === calibrating.code);
    const costDiff = Math.round(targetCost - (after?.cost ?? 0));
    if (qtyDiff === 0 && Math.abs(targetCost - calibrating.cost) < 1) { alert("股數與成本都跟系統一樣，不需要校正"); return; }
    if (!confirm(`校正「${calibrating.name}」？\n\n股數：${calibrating.quantity.toLocaleString()} → ${targetQty.toLocaleString()}\n總成本：${Math.round(calibrating.cost).toLocaleString()} → ${Math.round(targetCost).toLocaleString()}`)) return;
    setCalibSaving(true);
    const date = new Date().toLocaleDateString("sv-SE");
    const base = `持股校正：股數 ${calibrating.quantity} → ${targetQty}、成本 ${Math.round(calibrating.cost)} → ${Math.round(targetCost)}${calibForm.note ? `（${calibForm.note}）` : ""}`;
    const post = (body: Record<string, unknown>) => authFetch("/api/investments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "STOCK", name: calibrating.name, code: calibrating.code, date, broker: "", ...body }),
    });
    let ok = true;
    if (qtyDiff !== 0) ok = (await post({ action: qtyDiff > 0 ? "BUY" : "SELL", quantity: Math.abs(qtyDiff), amount: 0, note: `${base}・股數` })).ok && ok;
    if (costDiff !== 0) ok = (await post({ action: costDiff > 0 ? "BUY" : "SELL", amount: costDiff, note: `${base}・成本` })).ok && ok;
    setCalibSaving(false);
    if (!ok) alert("校正記錄有部分儲存失敗，請檢查投資記錄");
    setCalibrating(null);
    fetchAll();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("確定要刪除這筆投資記錄？")) return;
    await authFetch(`/api/investments/${id}`, { method: "DELETE" });
    fetchAll();
  };

  return (
    <div className="w-full max-w-7xl">
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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">持股成本</div>
          <div className={`text-2xl font-bold mt-1 ${netInvested >= 0 ? "text-slate-900" : "text-red-500"}`}>{fmt(netInvested)}</div>
          <div className="text-xs text-slate-400 mt-0.5">目前持股的投入成本（含調帳）</div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">已實現損益</div>
          <div className={`text-2xl font-bold mt-1 ${realizedPnl >= 0 ? "text-red-500" : "text-emerald-600"}`}>{signedFmt(realizedPnl)}</div>
          <div className="text-xs text-slate-400 mt-0.5">所有賣出累計（先進先出）</div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">未實現損益</div>
          {holdings.length === 0 ? (
            <div className="text-2xl font-bold mt-1 text-slate-300">—</div>
          ) : (
            <div className={`text-2xl font-bold mt-1 ${unrealizedTotal >= 0 ? "text-red-500" : "text-emerald-600"}`}>{signedFmt(unrealizedTotal)}</div>
          )}
          <div className="text-xs text-slate-400 mt-0.5">
            {pricesLoading ? "報價更新中…" : unrealizedMissing ? "部分個股抓不到報價，未計入" : priceUpdatedAt ? `股價更新於 ${priceUpdatedAt}` : "目前持股以即時股價估算"}
          </div>
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

      {/* 月份買進統計 */}
      {buyMonthOptions.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-8">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50">
            <h2 className="font-semibold text-slate-900">月份買進統計</h2>
            <select value={effectiveStatsMonth} onChange={(e) => setStatsMonth(e.target.value)}
              className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-600 bg-white focus:border-indigo-400 transition-colors">
              {buyMonthOptions.map((m) => {
                const [y, mo] = m.split("-");
                return <option key={m} value={m}>{y} 年 {parseInt(mo)} 月</option>;
              })}
            </select>
          </div>
          {monthlyBuyStats.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-sm">這個月沒有買進記錄</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-400 border-b border-slate-50">
                    <th className="px-6 py-2.5 text-left font-medium">個股</th>
                    <th className="px-4 py-2.5 text-right font-medium">總股數</th>
                    <th className="px-4 py-2.5 text-right font-medium">成交金額</th>
                    <th className="px-4 py-2.5 text-right font-medium">手續費</th>
                    <th className="px-4 py-2.5 text-right font-medium">總價格（含手續費）</th>
                    <th className="px-4 py-2.5 text-right font-medium">均價（不含手續費）</th>
                    <th className="px-6 py-2.5 text-right font-medium">均價（含手續費）</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {monthlyBuyStats.map((g) => (
                    <tr key={g.key}>
                      <td className="px-6 py-3">
                        <span className="text-sm font-medium text-slate-800">{g.name}</span>
                        {g.code !== "—" && <span className="ml-2 text-xs text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">{g.code}</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">{g.quantity.toLocaleString("zh-TW")}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{fmt(g.principal)}</td>
                      <td className="px-4 py-3 text-right text-slate-500">{fmt(g.fee)}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{fmt(g.principal + g.fee)}</td>
                      <td className="px-4 py-3 text-right text-slate-500">
                        {g.quantity > 0 ? fmtAvg(g.principal / g.quantity) : "—"}
                      </td>
                      <td className="px-6 py-3 text-right font-semibold text-slate-900">
                        {g.quantity > 0 ? fmtAvg((g.principal + g.fee) / g.quantity) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 持股狀況 */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50">
          <h2 className="font-semibold text-slate-900">持股狀況</h2>
          <select value={effectiveHoldingsMonth} onChange={(e) => setHoldingsMonth(e.target.value)}
            className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-600 bg-white focus:border-indigo-400 transition-colors">
            {holdingsMonthOptions.map((m) => {
              const [y, mo] = m.split("-");
              return <option key={m} value={m}>{y} 年 {parseInt(mo)} 月{m === currentMonthStr ? "（至今）" : "底"}</option>;
            })}
          </select>
        </div>
        {holdingsForMonth.length === 0 ? (
          <div className="py-10 text-center text-slate-400 text-sm">{isCurrentHoldingsMonth ? "目前沒有持股" : "這個月份沒有持股"}</div>
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
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {holdingsForMonth.map((h) => (
                  <tr key={h.key} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3 font-medium text-slate-800">{h.name}</td>
                    <td className="px-6 py-3 text-slate-500 font-mono text-xs">{h.code}</td>
                    <td className="px-6 py-3 text-right text-slate-700">{h.quantity.toLocaleString("zh-TW")}</td>
                    <td className="px-6 py-3 text-right text-slate-700">{fmt(h.cost)}</td>
                    <td className="px-6 py-3 text-right text-slate-700">{h.avgPrice.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">
                      {isCurrentHoldingsMonth && (
                        <button type="button" onClick={() => openCalibrate(h)}
                          className="text-xs font-semibold text-violet-600 border border-violet-200 rounded-lg px-2.5 py-1 hover:bg-violet-50">校正</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 未實現損益明細 */}
      {holdingsForMonth.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-8">
          <div className={`w-full flex items-center justify-between gap-4 px-6 py-4 ${unrealizedOpen ? "border-b border-slate-50" : ""}`}>
            <button type="button" onClick={() => setUnrealizedOpen((o) => !o)} aria-expanded={unrealizedOpen}
              className="flex-1 min-w-0 text-left hover:opacity-80 transition-opacity">
              <h2 className="font-semibold text-slate-900">未實現損益明細</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                依即時股價估算目前持股的帳面盈虧（市值－成本－賣出手續費－證交稅）
                {!pricesLoading && priceUpdatedAt && ` · 股價更新於 ${priceUpdatedAt}`}
              </p>
            </button>
            <div className="flex items-center gap-3 shrink-0">
              <button type="button"
                onClick={() => handleRefreshPrices(holdingsForMonth.map((h) => h.code).filter((c) => c && c !== "—"))}
                disabled={pricesLoading}
                className="text-xs font-semibold text-indigo-600 border border-indigo-200 rounded-lg px-2.5 py-1.5 hover:bg-indigo-50 disabled:opacity-50 transition-colors">
                {pricesLoading ? "更新中…" : "重新整理股價"}
              </button>
              <span className={`text-sm font-bold ${pnlColor(unrealizedTotal)}`}>{signedFmt(unrealizedTotal)}</span>
              <button type="button" onClick={() => setUnrealizedOpen((o) => !o)}
                className="text-xs text-indigo-600 font-medium hover:underline">
                {unrealizedOpen ? "收合 ▲" : "展開 ▼"}
              </button>
            </div>
          </div>
          {unrealizedOpen && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="text-xs text-slate-400 uppercase tracking-wider border-b border-slate-50">
                    <th className="text-left font-semibold px-6 py-3">股票</th>
                    <th className="text-right font-semibold px-4 py-3">持有股數</th>
                    <th className="text-right font-semibold px-4 py-3">成本均價</th>
                    <th className="text-right font-semibold px-4 py-3">現價</th>
                    <th className="text-right font-semibold px-4 py-3">市值</th>
                    <th className="text-right font-semibold px-4 py-3">成本</th>
                    <th className="text-right font-semibold px-6 py-3">損益</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {holdingsForMonth.map((h) => {
                    const price = livePrices[h.code];
                    const unrealized = unrealizedFor(h);
                    return (
                      <tr key={h.key} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-2.5 font-semibold text-slate-800">
                          {h.name}
                          <span className="ml-2 text-xs text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">{h.code}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-700">{h.quantity.toLocaleString("zh-TW")}</td>
                        <td className="px-4 py-2.5 text-right text-slate-700">{h.avgPrice.toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-right text-slate-500">{price ? price.toFixed(2) : "—"}</td>
                        <td className="px-4 py-2.5 text-right text-slate-700">{price ? fmt(h.quantity * price) : "—"}</td>
                        <td className="px-4 py-2.5 text-right text-slate-700">{fmt(h.cost)}</td>
                        <td className={`px-6 py-2.5 text-right font-bold ${unrealized == null ? "text-slate-300" : pnlColor(unrealized)}`}>
                          {unrealized == null ? "—" : signedFmt(unrealized)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 已實現損益明細 */}
      {realizedGroups.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-8">
          <button type="button" onClick={() => setRealizedOpen((o) => !o)} aria-expanded={realizedOpen}
            className={`w-full flex items-center justify-between gap-4 px-6 py-4 text-left hover:bg-slate-50 transition-colors ${realizedOpen ? "border-b border-slate-50" : ""}`}>
            <div>
              <h2 className="font-semibold text-slate-900">已實現損益明細</h2>
              <p className="text-xs text-slate-400 mt-0.5">每次賣出依先進先出扣除最早買進的批次計算成本，只列目前仍持有的股票</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className={`text-sm font-bold ${pnlColor(realizedPnlHeld)}`}>{signedFmt(realizedPnlHeld)}</span>
              <span className="text-xs text-indigo-600 font-medium">{realizedOpen ? "收合 ▲" : "展開 ▼"}</span>
            </div>
          </button>
          {realizedOpen && <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="text-xs text-slate-400 uppercase tracking-wider border-b border-slate-50">
                  <th className="text-left font-semibold px-6 py-3">日期</th>
                  <th className="text-right font-semibold px-4 py-3">賣出股數</th>
                  <th className="text-right font-semibold px-4 py-3">賣價</th>
                  <th className="text-right font-semibold px-4 py-3">成本均價</th>
                  <th className="text-right font-semibold px-4 py-3">賣出淨額</th>
                  <th className="text-right font-semibold px-4 py-3">成本</th>
                  <th className="text-right font-semibold px-4 py-3">損益</th>
                  <th className="text-right font-semibold px-6 py-3">攤平後損益</th>
                </tr>
              </thead>
              {realizedGroups.map((g) => (
                <tbody key={g.key} className="border-b border-slate-100 last:border-b-0">
                  <tr className="bg-slate-50">
                    <td className="px-6 py-2.5 font-semibold text-slate-800">
                      {g.name}
                      <span className="ml-2 text-xs text-slate-400 font-mono bg-white px-1.5 py-0.5 rounded">{g.code}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-slate-700">{g.qty.toLocaleString("zh-TW")}</td>
                    <td colSpan={4} />
                    <td className={`px-4 py-2.5 text-right font-bold ${pnlColor(g.pnl)}`}>{signedFmt(g.pnl)}</td>
                    <td className={`px-6 py-2.5 text-right font-bold ${pnlColor(g.adjustedPnl)}`}>{signedFmt(g.adjustedPnl)}</td>
                  </tr>
                  {g.rows.map(({ inv, sale }) => {
                    const qty = inv.quantity ?? 0;
                    return (
                      <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-2.5 text-slate-500">{new Date(inv.date ?? inv.createdAt).toLocaleDateString("zh-TW")}</td>
                        <td className="px-4 py-2.5 text-right text-slate-700">{qty.toLocaleString("zh-TW")}</td>
                        <td className="px-4 py-2.5 text-right text-slate-700">{inv.price ?? "—"}</td>
                        <td className="px-4 py-2.5 text-right text-slate-700">{qty > 0 ? (sale.cost / qty).toFixed(2) : "—"}</td>
                        <td className="px-4 py-2.5 text-right text-slate-700">{fmt(sale.proceeds)}</td>
                        <td className="px-4 py-2.5 text-right text-slate-700">{fmt(sale.cost)}</td>
                        <td className={`px-4 py-2.5 text-right font-semibold ${pnlColor(sale.pnl)}`}>{signedFmt(sale.pnl)}</td>
                        <td className={`px-6 py-2.5 text-right ${Math.abs(sale.adjustedPnl - sale.pnl) >= 1 ? `font-semibold ${pnlColor(sale.adjustedPnl)}` : "text-slate-300"}`}>
                          {Math.abs(sale.adjustedPnl - sale.pnl) >= 1 ? signedFmt(sale.adjustedPnl) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
          </div>}
        </div>
      )}

      {/* List */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-50 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-semibold text-slate-900">投資記錄</h2>
          {stockFilterOptions.length > 1 && (
            <select value={stockFilter}
              onChange={(e) => { setStockFilter(e.target.value); setPage(1); }}
              className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-600 bg-white focus:border-indigo-400 transition-colors">
              <option value="">全部股票</option>
              {stockFilterOptions.map((s) => (
                <option key={s.key} value={s.key}>{s.name}{s.code ? `（${s.code}）` : ""}</option>
              ))}
            </select>
          )}
        </div>
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm">載入中...</div>
        ) : investments.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-slate-400 text-sm mb-3">還沒有股票投資記錄</p>
            <button onClick={openAdd} className="text-sm text-indigo-600 font-medium hover:underline">新增第一筆記錄</button>
          </div>
        ) : filteredInvestments.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-slate-400 text-sm">這檔股票沒有符合的記錄</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {pagedInvestments.map((inv) => (
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
                    {(() => {
                      const sale = sales.get(inv.id);
                      if (!sale || isNoRealizeRecord(inv)) return null;
                      const adjusted = Math.abs(sale.adjustedPnl - sale.pnl) >= 1;
                      return (
                        <div className="text-xs mt-0.5 text-slate-500">
                          成本 {fmt(sale.cost)} · 損益{" "}
                          <span className={`font-semibold ${sale.pnl >= 0 ? "text-red-500" : "text-emerald-600"}`}>{signedFmt(sale.pnl)}</span>
                          {adjusted && (
                            <>
                              {" "}· 攤平後{" "}
                              <span className={`font-semibold ${sale.adjustedPnl >= 0 ? "text-red-500" : "text-emerald-600"}`}>{signedFmt(sale.adjustedPnl)}</span>
                            </>
                          )}
                        </div>
                      );
                    })()}
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
        {!loading && filteredInvestments.length > 0 && (
          <Pagination page={currentPage} pageCount={pageCount} totalCount={filteredInvestments.length} onPageChange={setPage} />
        )}
      </div>

      {/* 持股校正 Modal */}
      {calibrating && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">持股校正：{calibrating.name}（{calibrating.code}）</h2>
              <p className="text-xs text-slate-400 mt-1">填入券商庫存上的實際股數與總成本，系統會補記差額讓這檔等於實際數字</p>
            </div>
            <div className="bg-slate-50 rounded-xl px-4 py-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-slate-500">系統目前股數</span><span>{calibrating.quantity.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">系統目前總成本</span><span>{fmt(calibrating.cost)}</span></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">實際股數</label>
                <input type="number" min="0" step="any" value={calibForm.quantity} onChange={(e) => setCalibForm({ ...calibForm, quantity: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">實際總成本</label>
                <input type="number" min="0" step="any" value={calibForm.cost} onChange={(e) => setCalibForm({ ...calibForm, cost: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>
            </div>
            {parseFloat(calibForm.quantity) > 0 && parseFloat(calibForm.cost) >= 0 && (
              <p className="text-xs text-slate-500">校正後平均每股價格：{(parseFloat(calibForm.cost) / parseFloat(calibForm.quantity)).toFixed(2)}</p>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">備註（選填）</label>
              <input value={calibForm.note} onChange={(e) => setCalibForm({ ...calibForm, note: e.target.value })} placeholder="例如：對照國泰證券庫存"
                className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
            </div>
            <p className="text-xs text-amber-600">校正後的差額會直接反映在總資產上</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setCalibrating(null)} className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50">取消</button>
              <button type="button" onClick={saveCalibrate} disabled={calibSaving} className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-60">
                {calibSaving ? "校正中..." : "確認校正"}
              </button>
            </div>
          </div>
        </div>
      )}

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
                  可用其他持股的獲利攤平這檔的虧損（只扣減累計投入成本，股數不變），
                  也可以在配股、增資等股數異動時直接增加這檔的股數（成本留白代表股數增加、平均成本自動下降），
                  兩者也可以同時填寫，盈虧試算與「投資策略」頁會同步反映
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
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">調整金額（從投入成本中扣除，選填）</label>
                    <input type="number" min="0" step="any" value={addForm.costAdjustAmount}
                      onChange={(e) => setAddForm({ ...addForm, costAdjustAmount: e.target.value })} placeholder="例如：5000"
                      className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">獲利來源股票（選填）</label>
                    <select value={addForm.costAdjustSource}
                      onChange={(e) => setAddForm({ ...addForm, costAdjustSource: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors">
                      <option value="">無（例如配息）</option>
                      {sourceStocks.map((s) => (
                        <option key={s.code} value={s.code}>{s.name}（{s.code}）</option>
                      ))}
                    </select>
                    <p className="text-[11px] text-slate-400 mt-1">選擇獲利來自哪一檔股票，會記在這筆調整的備註裡，方便日後對照</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">配股股數（增加股數，選填）</label>
                    <input type="number" min="0" step="any" value={addForm.costAdjustQuantity}
                      onChange={(e) => setAddForm({ ...addForm, costAdjustQuantity: e.target.value })} placeholder="例如：100"
                      className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                    <p className="text-[11px] text-slate-400 mt-1">配股、增資配發等免成本增加的股數，填了會直接加到這檔的合計股數</p>
                  </div>
                </>
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
                      <label className="flex items-start gap-2 text-sm bg-slate-50 rounded-lg px-3.5 py-2.5 cursor-pointer">
                        <input type="checkbox" checked={addForm.noRealize}
                          onChange={(e) => setAddForm({ ...addForm, noRealize: e.target.checked })}
                          className="mt-0.5" />
                        <span>
                          <span className="font-medium text-slate-700">降低持有成本，不列入已實現損益</span>
                          <br />
                          <span className="text-[11px] text-slate-400">適合同一檔股票「買低賣高」調降均價的操作：股數照常扣減，但這筆的損益會加回/扣掉剩餘持股的成本抵銷掉（持有成本不受影響），也不會算進「已實現損益明細」與總計</span>
                        </span>
                      </label>
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

                  {/* 同步到銀行資金管理 */}
                  <div className="bg-sky-50 rounded-xl px-4 py-3 space-y-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">交割銀行（同步記到銀行）</label>
                        <select value={settleBank} onChange={(e) => setSettleBank(e.target.value)}
                          className="w-full border border-slate-200 rounded-lg px-2.5 py-2 text-sm bg-white focus:border-indigo-400 transition-colors">
                          <option value="">不同步</option>
                          {bankNames.map((b) => <option key={b} value={b}>{b}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">交割日</label>
                        <input type="date" value={settleDate || settlementDate(addForm.date)} disabled={!settleBank}
                          onChange={(e) => setSettleDate(e.target.value)}
                          className="w-full border border-slate-200 rounded-lg px-2.5 py-2 text-sm bg-white focus:border-indigo-400 transition-colors disabled:bg-slate-50 disabled:text-slate-400" />
                      </div>
                    </div>
                    {settleBank && (
                      <p className="text-xs text-sky-700">
                        會同時在「銀行資金管理」記一筆：{settleBank} {addForm.action === "BUY" ? "支出" : "收入"} {fmt(subtotal)}（交割日 {settleDate || settlementDate(addForm.date)}）
                      </p>
                    )}
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
              {editForm.action === "SELL" && (
                <label className="flex items-start gap-2 text-sm bg-slate-50 rounded-lg px-3.5 py-2.5 cursor-pointer">
                  <input type="checkbox" checked={editForm.noRealize}
                    onChange={(e) => setEditForm({ ...editForm, noRealize: e.target.checked })}
                    className="mt-0.5" />
                  <span>
                    <span className="font-medium text-slate-700">降低持有成本，不列入已實現損益</span>
                    <br />
                    <span className="text-[11px] text-slate-400">這筆不會算進「已實現損益明細」與總計</span>
                  </span>
                </label>
              )}
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
