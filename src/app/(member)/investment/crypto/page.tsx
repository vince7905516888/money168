"use client";

import { useEffect, useState, useCallback } from "react";
import { authFetch } from "@/lib/api-fetch";
import Combobox from "@/components/ui/Combobox";
import { remainingHoldingsByAmount, suspenseOpenCost, isCryptoDividend } from "@/lib/stock-holdings";

interface Investment {
  id: string;
  type: "CRYPTO";
  name?: string;
  code?: string;
  amount: number;
  quantity?: number;
  price?: number;
  broker?: string;
  action: "BUY" | "SELL";
  date: string;
  fee?: number;
  note?: string;
  transactionId?: string;
  externalRef?: string | null; // 幣安自動作帳的記錄才有
  createdAt: string;
}

// 暫計帳：用持有的 USDT 支付的項目（例如自動交易軟體），新增時自動扣除持有數量，賺回後可回補
interface SuspenseEntry {
  id: string;
  name: string;
  code: string;
  quantity: number;
  unitCost: number;
  broker?: string | null;
  date: string;
  note?: string | null;
  deductInvestmentId?: string | null;
  reversedAt?: string | null;
  reverseInvestmentId?: string | null;
}

const SUSPENSE_CODE = "USDT";
const EMPTY_SUSPENSE_FORM = { name: "", quantity: "", date: "", broker: "", note: "" };

interface UserExchange {
  id: string;
  name: string;
}

const DEFAULT_EXCHANGES = [
  "幣安 Binance", "MAX", "ACE", "BitoPro", "OKX", "Bybit", "Coinbase", "Kraken", "Bitfinex", "冷錢包",
];

const DEFAULT_CODES = [
  "BTC", "ETH", "USDT", "USDC", "BNB", "SOL", "XRP", "ADA", "DOGE", "MATIC", "DOT", "LTC", "AVAX", "LINK", "TRX", "SHIB",
];

// 交易所裡還沒拿去買幣的台幣，記成代碼 TWD、單價 1 的一種「幣」，持有數量＝台幣餘額
const TWD_CODE = "TWD";
const PAGE_SIZE = 20;
// 交易所之間轉移的記錄（一對：轉出／轉入），備註以這個字串開頭
const TRANSFER_NOTE = "轉移";
// 幣與幣之間兌換的記錄（一對：換出／換入），備註以這個字串開頭
const SWAP_NOTE = "兌換";
const USDT_CODE = "USDT";

type SortKey = "DATE_DESC" | "DATE_ASC" | "AMOUNT_DESC" | "COIN";
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "DATE_DESC", label: "日期（新→舊）" },
  { value: "DATE_ASC", label: "日期（舊→新）" },
  { value: "AMOUNT_DESC", label: "金額（大→小）" },
  { value: "COIN", label: "幣種" },
];

const EMPTY_ADD_FORM = {
  mode: "TRADE" as "TRADE" | "DIVIDEND" | "DEPOSIT" | "ADJUST" | "TRANSFER" | "SWAP",
  swapFrom: "",
  swapFromQty: "",
  swapTo: "",
  swapToQty: "",
  swapFee: "",
  transferCode: "",
  transferFrom: "",
  transferTo: "",
  transferFee: "",
  depositAmount: "",
  adjustCode: "",
  adjustActual: "",
  payFromTwd: true,
  quote: "USDT" as "USDT" | "TWD",
  creditToTwd: false,
  name: "",
  code: "",
  date: new Date().toISOString().split("T")[0],
  action: "BUY" as "BUY" | "SELL",
  broker: "",
  quantity: "",
  price: "",
  fee: "",
  override: "",
  note: "",
};

export default function CryptoPage() {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_ADD_FORM);
  const [addSaving, setAddSaving] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("DATE_DESC");
  const [page, setPage] = useState(1);
  const [holdingsOpen, setHoldingsOpen] = useState(false);
  // 即時台幣價格（key 為大寫代碼），每次進入頁面重新抓取
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [pricesAt, setPricesAt] = useState<string | null>(null);
  const [pricesFailed, setPricesFailed] = useState(false);
  // 幣安帳戶最新同步快照（同步工作每 6 小時寫入），用來核對帳上數量
  const [binanceSnap, setBinanceSnap] = useState<{ fetchedAt: string; balances: Record<string, { spot: number; funding: number; earn: number; total: number }>; error: string | null } | null>(null);
  const [binanceOpen, setBinanceOpen] = useState(false);
  // 會員自行設定的幣安 API 金鑰（選填）：有設定就自動同步核對，沒設定就維持手動記帳
  const [binanceCred, setBinanceCred] = useState<{ connected: boolean; apiKeyHint?: string; keyChangedAt?: string; syncHour?: number | null; syncRequestedAt?: string | null } | null>(null);
  const [credForm, setCredForm] = useState({ apiKey: "", apiSecret: "", syncHour: "" });
  const [credEditing, setCredEditing] = useState(false);
  const [credSaving, setCredSaving] = useState(false);
  const [adjustingCode, setAdjustingCode] = useState<string | null>(null);

  const [suspenseEntries, setSuspenseEntries] = useState<SuspenseEntry[]>([]);
  const [suspenseModal, setSuspenseModal] = useState<{ editing: SuspenseEntry | null } | null>(null);
  const [suspenseForm, setSuspenseForm] = useState(EMPTY_SUSPENSE_FORM);
  const [suspenseSaving, setSuspenseSaving] = useState(false);

  const [editing, setEditing] = useState<Investment | null>(null);
  const [editForm, setEditForm] = useState({ name: "", code: "", date: "", action: "BUY" as "BUY" | "SELL", broker: "", quantity: "", amount: "", note: "" });
  const [saving, setSaving] = useState(false);

  const [userExchanges, setUserExchanges] = useState<UserExchange[]>([]);
  const [addExchangeInput, setAddExchangeInput] = useState("");
  const [addExchangeOpen, setAddExchangeOpen] = useState(false);
  const [addExchangeLoading, setAddExchangeLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    // 先把幣安切點之後的新記錄自動入帳（沒連結幣安的會員不會有任何動作）
    await fetch("/api/binance/autobook", { method: "POST" }).catch(() => null);
    const [invRes, exchangeRes, suspenseRes, snapRes, credRes] = await Promise.all([
      fetch("/api/investments?type=CRYPTO"),
      fetch("/api/user-exchanges"),
      fetch("/api/suspense-entries"),
      fetch("/api/binance/snapshot"),
      fetch("/api/binance/credentials"),
    ]);
    const [invData, exchangeData, suspenseData, snapData, credData] = await Promise.all([invRes.json(), exchangeRes.json(), suspenseRes.json(), snapRes.json().catch(() => null), credRes.json().catch(() => null)]);
    setBinanceCred(credData && typeof credData.connected === "boolean" ? credData : null);
    setBinanceSnap(snapData && snapData.balances ? snapData : null);
    setInvestments(Array.isArray(invData) ? invData : []);
    setSuspenseEntries(Array.isArray(suspenseData) ? suspenseData : []);
    // 抓持有過的幣的即時價格（不擋住頁面載入）
    const codes = [...new Set((Array.isArray(invData) ? invData as Investment[] : []).map((i) => i.code?.trim().toUpperCase()).filter((c): c is string => !!c && c !== "TWD"))];
    if (codes.length > 0) {
      fetch(`/api/crypto-prices?codes=${encodeURIComponent(codes.join(","))}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.prices && d.usdTwd) {
            setPrices(d.prices);
            setPricesAt(d.fetchedAt);
            setPricesFailed(false);
          } else setPricesFailed(true);
        })
        .catch(() => setPricesFailed(true));
    }
    setUserExchanges(Array.isArray(exchangeData) ? exchangeData : []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const allExchanges = [...DEFAULT_EXCHANGES, ...userExchanges.map((e) => e.name)];

  const handleAddExchange = async () => {
    if (!addExchangeInput.trim()) return;
    setAddExchangeLoading(true);
    const res = await authFetch("/api/user-exchanges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: addExchangeInput.trim() }),
    });
    setAddExchangeLoading(false);
    if (res.ok) {
      const exchange = await res.json();
      setUserExchanges((prev) => [...prev, exchange]);
      setAddForm((f) => ({ ...f, broker: exchange.name }));
      setAddExchangeInput("");
      setAddExchangeOpen(false);
    }
  };

  const handleDeleteExchange = async (id: string) => {
    if (!confirm("確定要刪除這個交易所？(不會刪除已經新增的投資記錄)")) return;
    await authFetch(`/api/user-exchanges/${id}`, { method: "DELETE" });
    setUserExchanges((prev) => prev.filter((e) => e.id !== id));
  };

  const fmt = (n: number) =>
    new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(n);
  const fmt2 = (n: number) => new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 }).format(n);
  // 數量完整顯示：虛擬貨幣（尤其配息）常有很多位小數，不四捨五入，照實際輸入的位數顯示
  const fmtQty = (n: number) => new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 12 }).format(n);
  // 平均成本：SHIB 這類單價很小的幣，固定 2 位小數會變成 0，改用有效位數顯示
  const fmtAvg = (n: number) => (n === 0 || Math.abs(n) >= 1 ? fmt2(n) : new Intl.NumberFormat("zh-TW", { maximumSignificantDigits: 4 }).format(n));

  // 持有狀況：每種幣目前的持有數量與投入成本，跟資產總攬同一套算法（依實際金額的移動平均成本）
  const holdings = remainingHoldingsByAmount(investments).sort((a, b) => b.cost - a.cost);
  // 即時台幣單價：台幣本身為 1，抓不到報價的幣回傳 null
  const livePrice = (code: string) => (code === TWD_CODE ? 1 : prices[code.toUpperCase()] ?? null);
  const marketValueOf = (h: { code: string; quantity: number }) => {
    const p = livePrice(h.code);
    return p == null ? null : h.quantity * p;
  };
  const marketTotal = holdings.reduce((s, h) => s + (marketValueOf(h) ?? 0), 0);
  // 持有狀況明細：依「幣種＋交易所」各自獨立計算數量與成本，不同交易所分開列（沒填交易所的歸到「未指定」），
  // 不是把不同交易所的持有混在同一列算——每個交易所的數量、成本、均價、市值都是獨立算出來的
  const UNSPECIFIED_EXCHANGE = "未指定";
  const codeOrder = new Map(holdings.map((h, i) => [h.code, i]));
  const exchangeHoldings = (() => {
    const rows: { key: string; code: string; name: string; exchange: string; quantity: number; cost: number; dividendQty: number }[] = [];
    for (const exchange of new Set(investments.map((i) => i.broker?.trim() || UNSPECIFIED_EXCHANGE))) {
      const subset = investments.filter((i) => (i.broker?.trim() || UNSPECIFIED_EXCHANGE) === exchange);
      for (const h of remainingHoldingsByAmount(subset)) {
        rows.push({ key: `${h.code}__${exchange}`, code: h.code, name: h.name, exchange, quantity: h.quantity, cost: h.cost, dividendQty: h.dividendQty });
      }
    }
    return rows.sort((a, b) => (codeOrder.get(a.code) ?? 999) - (codeOrder.get(b.code) ?? 999) || b.cost - a.cost);
  })();
  // 持有狀況改以交易所為主分類：幣安有哪些幣、各多少顆，BitoPro 有哪些幣、各多少顆，分開獨立呈現
  const holdingsByExchange = (() => {
    const groups = new Map<string, { exchange: string; rows: typeof exchangeHoldings; cost: number }>();
    for (const h of exchangeHoldings) {
      if (!groups.has(h.exchange)) groups.set(h.exchange, { exchange: h.exchange, rows: [], cost: 0 });
      const g = groups.get(h.exchange)!;
      g.rows.push(h);
      g.cost += h.cost;
    }
    for (const g of groups.values()) g.rows.sort((a, b) => b.cost - a.cost);
    return [...groups.values()].sort((a, b) => {
      if (a.exchange === UNSPECIFIED_EXCHANGE) return 1;
      if (b.exchange === UNSPECIFIED_EXCHANGE) return -1;
      return b.cost - a.cost;
    });
  })();
  // 各幣種在哪些交易所持有（只取數量）：轉移／調帳試算與幣安核對沿用這份資料
  const exchangesByCode = new Map<string, { exchange: string; quantity: number }[]>();
  for (const h of exchangeHoldings) {
    if (!exchangesByCode.has(h.code)) exchangesByCode.set(h.code, []);
    exchangesByCode.get(h.code)!.push({ exchange: h.exchange, quantity: h.quantity });
  }
  const marketMissing = holdings.filter((h) => marketValueOf(h) == null).length;
  // 持有成本：目前持有部位的投入成本，跟資產總攬的虛擬貨幣同一個數字
  // 暫計帳（待賺回）：從 USDT 扣除、尚未回補的部分，持有成本與合計都把它算進去
  const suspenseCost = suspenseOpenCost(suspenseEntries);
  const suspenseQty = suspenseEntries.filter((e) => !e.reversedAt).reduce((s, e) => s + e.quantity, 0);
  const suspenseMarket = livePrice(SUSPENSE_CODE) != null ? suspenseQty * livePrice(SUSPENSE_CODE)! : null;
  const netInvested = holdings.reduce((s, h) => s + h.cost, 0) + suspenseCost;
  const isTransferRecord = (i: Investment) => !!i.note?.startsWith(TRANSFER_NOTE + "：") || !!i.note?.startsWith(SWAP_NOTE + "：");
  const isSwapRecord = (i: Investment) => !!i.note?.startsWith(SWAP_NOTE + "：");
  const buyCount = investments.filter((i) => i.action === "BUY" && !isTransferRecord(i)).length;
  const sellCount = investments.filter((i) => i.action === "SELL" && !isTransferRecord(i)).length;

  // 配息（質押／理財收益等）：只增加數量、不增加成本（金額 0、沒有單價），平均成本會自動下降
  const isDividend = (i: Investment) => isCryptoDividend(i);
  // 配息可選的幣種：曾經有紀錄的幣種，加上常見幣種
  const knownCoins = new Map<string, string>();
  for (const i of investments) {
    const code = i.code?.trim();
    if (code && !knownCoins.has(code)) knownCoins.set(code, i.name?.trim() || code);
  }
  const coinOptions = [...new Set([...knownCoins.keys(), ...DEFAULT_CODES])].filter((c) => c !== TWD_CODE);
  const isTwd = (i: Investment) => i.code?.trim() === TWD_CODE;
  // 交易所台幣餘額
  const twdBalance = holdings.find((h) => h.code === TWD_CODE)?.quantity ?? 0;
  // 調帳記錄（備註以 ADJUST_NOTE 開頭；早期的台幣調帳備註為「台幣餘額校正」）
  const ADJUST_NOTE = "數量校正";
  const isAdjustRecord = (i: Investment) => !!i.note && (i.note.startsWith(ADJUST_NOTE) || i.note.startsWith("台幣餘額校正"));
  // 暫計帳自動產生的扣除／回補記錄：只能從暫計帳操作，投資記錄裡不提供編輯／刪除
  const suspenseDeductIds = new Set(suspenseEntries.map((e) => e.deductInvestmentId).filter(Boolean));
  const suspenseReverseIds = new Set(suspenseEntries.map((e) => e.reverseInvestmentId).filter(Boolean));
  const isSuspenseRecord = (i: Investment) => suspenseDeductIds.has(i.id) || suspenseReverseIds.has(i.id);
  const recordLabel = (i: Investment) =>
    suspenseDeductIds.has(i.id) ? { text: "暫計帳扣除", cls: "bg-violet-100 text-violet-700" }
    : suspenseReverseIds.has(i.id) ? { text: "暫計帳回補", cls: "bg-violet-100 text-violet-700" }
    : isAdjustRecord(i) ? { text: "調帳", cls: "bg-violet-100 text-violet-700" }
    : isSwapRecord(i) ? { text: i.action === "SELL" ? "兌換換出" : "兌換換入", cls: "bg-orange-100 text-orange-700" }
    : isTransferRecord(i) ? { text: i.action === "SELL" ? "轉出" : "轉入", cls: "bg-cyan-100 text-cyan-700" }
    : isTwd(i) ? (i.action === "BUY" ? { text: "台幣入帳", cls: "bg-sky-100 text-sky-700" } : { text: "台幣扣款", cls: "bg-slate-200 text-slate-600" })
    : isDividend(i) ? { text: "配息", cls: "bg-amber-100 text-amber-700" }
    : i.action === "BUY" ? { text: "買進", cls: "bg-emerald-100 text-emerald-700" }
    : { text: "賣出", cls: "bg-red-100 text-red-700" };

  // 投資記錄排序
  const time = (i: Investment) => new Date(i.date ?? i.createdAt).getTime();
  const sortedInvestments = [...investments].sort((a, b) => {
    const byCreated = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    switch (sortKey) {
      case "DATE_ASC": return time(a) - time(b) || -byCreated;
      case "AMOUNT_DESC": return Math.abs(b.amount) - Math.abs(a.amount) || time(b) - time(a);
      case "COIN": return (a.code?.trim() || a.name?.trim() || "").localeCompare(b.code?.trim() || b.name?.trim() || "") || time(b) - time(a);
      default: return time(b) - time(a) || byCreated;
    }
  });

  const pageCount = Math.max(1, Math.ceil(sortedInvestments.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pagedInvestments = sortedInvestments.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const postInvestment = (body: Record<string, unknown>) =>
    authFetch("/api/investments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "CRYPTO", ...body }),
    });

  // ---- 新增表單：即時試算 ----
  // 計價幣別：用 USDT 買賣其他幣時以 USDT 輸入單價／手續費，系統依 USDT 平均成本換算台幣並自動扣除／加回 USDT；
  // 交易的幣本身是 USDT（台幣買 USDT）或台幣時一律用台幣計價
  const tradeCode = addForm.code.trim().toUpperCase();
  const quoteLocked = tradeCode === USDT_CODE || tradeCode === TWD_CODE;
  const quote: "USDT" | "TWD" = quoteLocked ? "TWD" : addForm.quote;
  const usdtHolding = holdings.find((h) => h.code === USDT_CODE);
  const usdtHeld = usdtHolding?.quantity ?? 0;
  const usdtUnitCost = usdtHolding && usdtHolding.quantity > 0 ? usdtHolding.cost / usdtHolding.quantity : 0;
  const fmtQuote = (n: number) => (quote === "USDT" ? `${fmtQty(Math.round(n * 1e6) / 1e6)} USDT` : fmt(n));
  const quantity = parseFloat(addForm.quantity) || 0;
  // 兌換試算：換出的幣以平均成本帶走成本，換到的幣承接同一筆成本（兌換本身不影響總資產）
  const swapFromHolding = holdings.find((h) => h.code === addForm.swapFrom);
  const swapFromQty = parseFloat(addForm.swapFromQty) || 0;
  const swapToQty = parseFloat(addForm.swapToQty) || 0;
  const swapToCode = addForm.swapTo.trim().toUpperCase();
  const swapCost = swapFromHolding && swapFromHolding.quantity > 0 ? (swapFromHolding.cost / swapFromHolding.quantity) * swapFromQty : 0;
  // 兌換手續費：以換到的幣計，從輸入的換到數量中扣除，實際入帳 = 換到數量 − 手續費
  const swapFee = parseFloat(addForm.swapFee) || 0;
  const swapNet = swapToQty - swapFee;
  // 換到的成本：換成 USDT 時跟「USDT 計價賣出」一樣，以 USDT 目前平均成本計價（賺賠直接反映在資產上，
  // 也不會把 USDT 平均成本拉歪）；換成其他幣時，換出幣的成本直接轉給換到的幣
  const swapToUsdt = swapToCode === USDT_CODE && usdtUnitCost > 0;
  const swapInCost = swapToUsdt ? Math.max(0, swapNet) * usdtUnitCost : swapCost;
  // 轉移試算：轉出交易所的持有數量、手續費（以幣計）、轉入數量、搬過去的成本（以全體平均成本計）
  const transferHolding = holdings.find((h) => h.code === addForm.transferCode);
  const transferSources = exchangesByCode.get(addForm.transferCode) ?? [];
  const transferSourceQty = transferSources.find((e) => e.exchange === addForm.transferFrom)?.quantity ?? 0;
  const transferFee = parseFloat(addForm.transferFee) || 0;
  const transferAvg = transferHolding && transferHolding.quantity > 0 ? transferHolding.cost / transferHolding.quantity : 0;
  const transferIn = quantity - transferFee;
  // 調帳試算：目前帳上數量、實際數量與差額（數量取到小數 8 位避免浮點誤差）
  const adjustHolding = holdings.find((h) => h.code === addForm.adjustCode);
  const adjustAvg = adjustHolding && adjustHolding.quantity > 0 ? adjustHolding.cost / adjustHolding.quantity : 0;
  const adjustActual = parseFloat(addForm.adjustActual);
  const adjustDiff = adjustHolding && Number.isFinite(adjustActual) ? Math.round((adjustActual - adjustHolding.quantity) * 1e8) / 1e8 : 0;
  // 單價、總金額都沒填時，用這個幣目前的平均成本當單價（USDT 計價時換算成 USDT），只輸入顆數就能記帳
  const coinHolding = holdings.find((h) => h.code === tradeCode);
  const coinAvgTwd = coinHolding && coinHolding.quantity > 0 ? coinHolding.cost / coinHolding.quantity : 0;
  const autoPrice = quote === "USDT" ? (usdtUnitCost > 0 ? coinAvgTwd / usdtUnitCost : 0) : coinAvgTwd;
  const priceIsAuto = addForm.price === "" && addForm.override === "" && autoPrice > 0;
  const price = parseFloat(addForm.price) || (priceIsAuto ? autoPrice : 0);
  const fee = parseFloat(addForm.fee) || 0;
  // 台幣計價的買進手續費固定用 USDT 計算（交易所手續費實際是從 USDT 扣的）：
  // 輸入的是 USDT 顆數，依 USDT 平均成本換算台幣計入成本，並另外從 USDT 持有扣除
  const buyFeeInUsdt = !quoteLocked && quote === "TWD" && addForm.action === "BUY";
  const feeTwd = buyFeeInUsdt ? fee * usdtUnitCost : fee;
  const principal = quantity * price;
  const calcSubtotal = addForm.action === "BUY" ? principal + feeTwd : principal - fee;
  // 實際金額：如果填了就以此為準（交易所實際扣款/入帳金額可能與試算有落差），否則採自動試算結果
  const subtotal = addForm.override !== "" ? (parseFloat(addForm.override) || 0) : calcSubtotal;

  const resetAddForm = () => {
    setAddForm(EMPTY_ADD_FORM);
    setAddExchangeInput("");
    setAddExchangeOpen(false);
  };

  const openAdd = () => { resetAddForm(); setPage(1); setShowAddModal(true); };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();

    if (addForm.mode === "SWAP") {
      if (!swapFromHolding || !swapToCode) {
        alert("請選擇換出與換到的幣種");
        return;
      }
      if (swapToCode === swapFromHolding.code) {
        alert("換出與換到的幣種不能相同");
        return;
      }
      if (swapFromQty <= 0 || swapFromQty > swapFromHolding.quantity + 1e-9) {
        alert(`換出數量要大於 0，且不能超過持有 ${fmtQty(swapFromHolding.quantity)}`);
        return;
      }
      if (swapToQty <= 0) {
        alert("請填寫實際換到的數量");
        return;
      }
      if (swapFee < 0 || swapNet <= 0) {
        alert("手續費要小於換到數量");
        return;
      }
      const note = `${SWAP_NOTE}：${fmtQty(swapFromQty)} ${swapFromHolding.code} → ${fmtQty(swapToQty)} ${swapToCode}${swapFee ? `（含手續費 ${fmtQty(swapFee)} ${swapToCode}）` : ""}${addForm.note ? `（${addForm.note}）` : ""}`;
      setAddSaving(true);
      const out = await postInvestment({
        name: swapFromHolding.code === TWD_CODE ? "台幣" : swapFromHolding.name, code: swapFromHolding.code,
        date: addForm.date, action: "SELL", broker: addForm.broker,
        quantity: swapFromQty, price: swapFromQty > 0 && swapCost > 0 ? swapCost / swapFromQty : undefined, amount: -swapCost, note,
      });
      if (!out.ok) {
        setAddSaving(false);
        const err = await out.json().catch(() => null);
        alert(err?.error || "儲存失敗，請稍後再試");
        return;
      }
      const inn = await postInvestment({
        name: knownCoins.get(swapToCode) ?? swapToCode, code: swapToCode,
        date: addForm.date, action: "BUY", broker: addForm.broker,
        quantity: swapNet, price: swapInCost > 0 ? swapInCost / swapNet : undefined, amount: swapInCost, note,
      });
      if (!inn.ok) alert(`換出已儲存，但 ${swapToCode} 的換入記錄儲存失敗，請手動補一筆買進 ${fmtQty(swapNet)} ${swapToCode}`);
      setAddSaving(false);
      setShowAddModal(false);
      fetchAll();
      return;
    }

    if (addForm.mode === "TRANSFER") {
      // 交易所之間轉移：轉出交易所記一筆轉出、轉入交易所記一筆轉入，總成本不變；
      // 手續費（以幣計）讓轉入數量變少，平均成本會因此略為上升
      const to = addForm.transferTo.trim();
      if (!transferHolding || !addForm.transferFrom || !to) {
        alert("請選擇幣種、轉出與轉入交易所");
        return;
      }
      if (to === addForm.transferFrom) {
        alert("轉出與轉入交易所不能相同");
        return;
      }
      if (quantity <= 0 || quantity > transferSourceQty + 1e-9) {
        alert(`轉出數量要大於 0，且不能超過 ${addForm.transferFrom} 的持有 ${fmtQty(transferSourceQty)}`);
        return;
      }
      if (transferFee < 0 || transferIn <= 0) {
        alert("手續費要小於轉出數量");
        return;
      }
      const cost = quantity * transferAvg;
      const name = transferHolding.code === TWD_CODE ? "台幣" : transferHolding.name;
      const note = `${TRANSFER_NOTE}：${addForm.transferFrom} → ${to}${transferFee ? `，手續費 ${fmtQty(transferFee)}` : ""}${addForm.note ? `（${addForm.note}）` : ""}`;
      setAddSaving(true);
      const out = await postInvestment({
        name, code: transferHolding.code, date: addForm.date, action: "SELL",
        broker: addForm.transferFrom === UNSPECIFIED_EXCHANGE ? "" : addForm.transferFrom,
        quantity, price: transferAvg || undefined, amount: -cost, note,
      });
      if (!out.ok) {
        setAddSaving(false);
        const err = await out.json().catch(() => null);
        alert(err?.error || "儲存失敗，請稍後再試");
        return;
      }
      const inn = await postInvestment({
        name, code: transferHolding.code, date: addForm.date, action: "BUY", broker: to,
        quantity: transferIn, price: transferIn > 0 && cost > 0 ? cost / transferIn : undefined, amount: cost, note,
      });
      if (!inn.ok) alert(`轉出已儲存，但 ${to} 的轉入記錄儲存失敗，請手動補一筆轉入 ${fmtQty(transferIn)} ${transferHolding.code}`);
      setAddSaving(false);
      setShowAddModal(false);
      fetchAll();
      return;
    }

    if (addForm.mode === "ADJUST") {
      // 調帳：輸入交易所實際的持有數量，補一筆差額讓帳上數量等於實際數量；
      // 差額以目前平均成本計價（台幣為 1），調帳後平均成本不變，數量與成本一起調整
      if (!adjustHolding) {
        alert("請選擇要調帳的幣種");
        return;
      }
      if (addForm.adjustActual === "" || adjustActual < 0) {
        alert("請填寫交易所實際的持有數量");
        return;
      }
      if (adjustDiff === 0) {
        alert("帳上數量已經等於實際數量，不需要調帳");
        return;
      }
      setAddSaving(true);
      const res = await postInvestment({
        name: adjustHolding.code === TWD_CODE ? "台幣" : adjustHolding.name, code: adjustHolding.code,
        date: addForm.date, action: adjustDiff > 0 ? "BUY" : "SELL", broker: addForm.broker,
        quantity: Math.abs(adjustDiff), price: adjustAvg || undefined, amount: adjustDiff * adjustAvg,
        note: `${ADJUST_NOTE}：${fmtQty(adjustHolding.quantity)} → ${fmtQty(adjustActual)}${addForm.note ? `（${addForm.note}）` : ""}`,
      });
      setAddSaving(false);
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        alert(err?.error || "儲存失敗，請稍後再試");
        return;
      }
      setShowAddModal(false);
      fetchAll();
      return;
    }

    if (addForm.mode === "DEPOSIT") {
      const amt = parseFloat(addForm.depositAmount) || 0;
      if (amt <= 0) {
        alert("請填寫入金金額");
        return;
      }
      setAddSaving(true);
      const res = await postInvestment({
        name: "台幣", code: TWD_CODE, date: addForm.date, action: "BUY", broker: addForm.broker,
        quantity: amt, price: 1, amount: amt, note: addForm.note || "入金（台幣，尚未買幣）",
      });
      setAddSaving(false);
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        alert(err?.error || "儲存失敗，請稍後再試");
        return;
      }
      setShowAddModal(false);
      fetchAll();
      return;
    }

    if (addForm.mode === "DIVIDEND") {
      if (!addForm.code.trim()) {
        alert("請選擇配息的幣種");
        return;
      }
      if (quantity <= 0) {
        alert("請填寫配息數量");
        return;
      }
      setAddSaving(true);
      const code = addForm.code.trim();
      // 配息不計成本（金額 0），價值依即時市價計算；備註固定以「配息」開頭，用來辨識這筆是配息
      const res = await authFetch("/api/investments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "CRYPTO",
          name: addForm.name || knownCoins.get(code) || code,
          code,
          date: addForm.date,
          action: "BUY",
          broker: addForm.broker,
          quantity: addForm.quantity,
          amount: 0,
          note: `配息${addForm.note ? `：${addForm.note}` : ""}`,
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
      return;
    }

    // 單價與總金額擇一填寫：只填總金額時，單價用總金額 ÷ 數量回推
    const hasTotal = addForm.override !== "" && subtotal > 0;
    if (quantity <= 0 || (price <= 0 && !hasTotal)) {
      alert(coinHolding ? "請填寫數量" : "第一次買這個幣沒有平均成本可用，請填寫單價或總金額");
      return;
    }
    const unitPrice = price > 0 ? price : subtotal / quantity;

    if (quote === "USDT") {
      // USDT 計價：subtotal 是 USDT 數量，依 USDT 平均成本換算台幣成本，並自動扣除／加回 USDT 持有
      if (!tradeCode) {
        alert("請填寫代碼（例如 BTC）");
        return;
      }
      if (usdtUnitCost <= 0) {
        alert("目前沒有 USDT 持有，無法換算台幣成本，請改用台幣計價");
        return;
      }
      if (addForm.action === "BUY" && subtotal > usdtHeld + 1e-9) {
        alert(`USDT 持有不足：需要 ${fmtQty(subtotal)}，目前 ${fmtQty(usdtHeld)}`);
        return;
      }
      const twd = subtotal * usdtUnitCost;
      const usdtNote = `USDT 計價：${price > 0 ? `${fmtQty(quantity)} × ${price} USDT` : `${fmtQty(quantity)} 顆`}${fee ? `，手續費 ${fee} USDT` : ""}，共 ${fmtQty(Math.round(subtotal * 1e6) / 1e6)} USDT（@${fmt2(usdtUnitCost)}）`;
      setAddSaving(true);
      const res = await postInvestment({
        name: addForm.name || tradeCode, code: tradeCode, date: addForm.date, action: addForm.action, broker: addForm.broker,
        quantity, price: twd / quantity, fee: fee ? Math.round(fee * usdtUnitCost * 100) / 100 : undefined,
        amount: addForm.action === "SELL" ? -twd : twd,
        note: addForm.note ? `${addForm.note} · ${usdtNote}` : usdtNote,
      });
      if (!res.ok) {
        setAddSaving(false);
        const err = await res.json().catch(() => null);
        alert(err?.error || "儲存失敗，請稍後再試");
        return;
      }
      const r = await postInvestment({
        name: USDT_CODE, code: USDT_CODE, date: addForm.date, broker: addForm.broker,
        action: addForm.action === "BUY" ? "SELL" : "BUY",
        quantity: subtotal, price: usdtUnitCost, amount: (addForm.action === "BUY" ? -1 : 1) * twd,
        note: addForm.action === "BUY" ? `買進 ${tradeCode} 扣款` : `賣出 ${tradeCode} 款項`,
      });
      if (!r.ok) alert(`${tradeCode} 已儲存，但 USDT ${addForm.action === "BUY" ? "扣款" : "入帳"}失敗，請手動補一筆 ${fmtQty(subtotal)} USDT`);
      setAddSaving(false);
      setShowAddModal(false);
      fetchAll();
      return;
    }

    if (buyFeeInUsdt && fee > 0) {
      if (usdtUnitCost <= 0) {
        alert("目前沒有 USDT 持有，無法換算手續費成本，請改用台幣計價或先補登 USDT 持有");
        return;
      }
      if (fee > usdtHeld + 1e-9) {
        alert(`USDT 持有不足以支付手續費：需要 ${fmtQty(fee)}，目前 ${fmtQty(usdtHeld)}`);
        return;
      }
    }

    setAddSaving(true);
    const res = await authFetch("/api/investments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "CRYPTO",
        name: addForm.name,
        code: addForm.code,
        date: addForm.date,
        action: addForm.action,
        broker: addForm.broker,
        quantity: addForm.quantity,
        price: unitPrice,
        fee: fee ? Math.round(feeTwd * 100) / 100 : undefined,
        amount: addForm.action === "SELL" ? -subtotal : subtotal,
        note: addForm.note,
      }),
    });
    if (!res.ok) {
      setAddSaving(false);
      const err = await res.json().catch(() => null);
      alert(err?.error || "儲存失敗，請稍後再試");
      return;
    }
    // 台幣計價買進的手續費是從 USDT 扣的：另外補一筆 USDT 扣款，數量＝輸入的手續費顆數
    const coin = addForm.code.trim() || addForm.name.trim() || "虛擬貨幣";
    if (buyFeeInUsdt && fee > 0) {
      const r = await postInvestment({
        name: USDT_CODE, code: USDT_CODE, date: addForm.date, action: "SELL", broker: addForm.broker,
        quantity: fee, price: usdtUnitCost, amount: -feeTwd, note: `買進 ${coin} 手續費`,
      });
      if (!r.ok) alert(`${coin} 已儲存，但手續費 USDT 扣款失敗，請手動補一筆 ${fmtQty(fee)} USDT`);
    }
    // 連動交易所台幣餘額：買進從台幣餘額扣款（餘額不足只扣到 0，其餘視為從外部付款），賣出款項存入台幣餘額
    if (addForm.action === "BUY" && addForm.payFromTwd && twdBalance > 0) {
      const pay = Math.min(subtotal, twdBalance);
      const r = await postInvestment({
        name: "台幣", code: TWD_CODE, date: addForm.date, action: "SELL", broker: addForm.broker,
        quantity: pay, price: 1, amount: -pay, note: `買進 ${coin} 扣款`,
      });
      if (!r.ok) alert(`${coin} 買進已儲存，但台幣餘額扣款失敗，請手動補一筆台幣扣款 ${pay}`);
    } else if (addForm.action === "SELL" && addForm.creditToTwd && subtotal > 0) {
      const r = await postInvestment({
        name: "台幣", code: TWD_CODE, date: addForm.date, action: "BUY", broker: addForm.broker,
        quantity: subtotal, price: 1, amount: subtotal, note: `賣出 ${coin} 款項`,
      });
      if (!r.ok) alert(`${coin} 賣出已儲存，但存入台幣餘額失敗，請手動補一筆台幣入金 ${subtotal}`);
    }
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
      amount: String(inv.amount),
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

  // 尚未回補（目前從持有中扣住）的暫計帳數量
  const suspenseOpenQty = suspenseEntries.filter((e) => !e.reversedAt).reduce((s, e) => s + e.quantity, 0);
  const suspenseHeld = holdings.find((h) => h.code === SUSPENSE_CODE)?.quantity ?? 0;

  const openSuspense = (entry: SuspenseEntry | null) => {
    setSuspenseForm(entry
      ? { name: entry.name, quantity: String(entry.quantity), date: entry.date.split("T")[0], broker: entry.broker ?? "", note: entry.note ?? "" }
      : { ...EMPTY_SUSPENSE_FORM, broker: addForm.broker, date: new Date().toLocaleDateString("sv-SE") });
    setSuspenseModal({ editing: entry });
  };

  const handleReverseSuspense = async (entry: SuspenseEntry, undo: boolean) => {
    const msg = undo
      ? `確定要取消「${entry.name}」的回補？${fmtQty(entry.quantity)} ${entry.code} 會重新從持有中扣除`
      : `確定「${entry.name}」已經賺回？會把 ${fmtQty(entry.quantity)} ${entry.code} 加回持有`;
    if (!confirm(msg)) return;
    const res = await authFetch(`/api/suspense-entries/${entry.id}/reverse`, {
      method: undo ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: undo ? undefined : JSON.stringify({ date: new Date().toLocaleDateString("sv-SE") }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      alert(err?.error || "操作失敗，請稍後再試");
      return;
    }
    fetchAll();
  };

  const handleSaveSuspense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!suspenseModal) return;
    setSuspenseSaving(true);
    const editing = suspenseModal.editing;
    const res = await authFetch(editing ? `/api/suspense-entries/${editing.id}` : "/api/suspense-entries", {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(suspenseForm),
    });
    setSuspenseSaving(false);
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      alert(err?.error || "儲存失敗，請稍後再試");
      return;
    }
    setSuspenseModal(null);
    fetchAll();
  };

  const handleDeleteSuspense = async (id: string) => {
    if (!confirm("確定要刪除這筆暫計帳？自動產生的扣除／回補記錄會一起刪除，持有數量恢復成沒有這筆暫計帳的狀態")) return;
    await authFetch(`/api/suspense-entries/${id}`, { method: "DELETE" });
    fetchAll();
  };

  // 幣安核對：幣安實際數量 vs 帳上數量（台幣不在幣安，不比對）
  const BINANCE_EXCHANGE = "幣安 Binance";
  // 帳上的幣安數量＝帳上總數量 − 記在其他交易所（例如 BitoPro）的數量；沒填交易所的視為幣安。
  // EQ_ 開頭是幣安的美股代幣，記在美股頁，不在這裡核對
  const otherExchangeQty = (code: string) =>
    (exchangesByCode.get(code) ?? [])
      .filter((e) => e.exchange !== BINANCE_EXCHANGE && e.exchange !== UNSPECIFIED_EXCHANGE)
      .reduce((sum, e) => sum + e.quantity, 0);
  const binanceRows = binanceSnap
    ? [...new Set([...Object.keys(binanceSnap.balances), ...holdings.map((h) => h.code)])]
        .filter((code) => code !== TWD_CODE && code !== "—" && !code.startsWith("EQ_"))
        .map((code) => {
          const actual = binanceSnap.balances[code]?.total ?? 0;
          const holding = holdings.find((h) => h.code === code);
          const book = Math.max(0, (holding?.quantity ?? 0) - otherExchangeQty(code));
          return { code, actual, book, diff: Math.round((actual - book) * 1e8) / 1e8, holding };
        })
        .filter((r) => r.actual !== 0 || r.book !== 0)
        .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
    : [];
  const binanceMismatch = binanceRows.filter((r) => r.diff !== 0).length;

  // 一鍵調帳：補一筆差額讓帳上數量等於幣安實際數量（以目前平均成本計價，跟「調帳」模式相同）
  // 只採用設定金鑰之後的同步結果（換了金鑰，舊的快照就不算）
  const binanceConnected = !!binanceCred?.connected;
  const snapValid = binanceConnected && !!binanceSnap && !!binanceCred?.keyChangedAt && new Date(binanceSnap.fetchedAt) >= new Date(binanceCred.keyChangedAt);
  // 同步時間：設定了第一次檢查時間就是每天該整點起每 6 小時一次
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const syncScheduleText = (h: number | null | undefined) =>
    h === null || h === undefined ? "設定後立即同步，之後每 6 小時" : `每天 ${[0, 6, 12, 18].map((d) => `${pad2((h + d) % 24)}:00`).join("、")}`;
  const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => h);

  // 立即同步：要求同步工作在下一次檢查（10 分鐘內）抓一次最新資料
  const syncPending = !!binanceCred?.syncRequestedAt && (!binanceSnap || new Date(binanceCred.syncRequestedAt) > new Date(binanceSnap.fetchedAt));
  const requestSyncNow = async () => {
    const res = await authFetch("/api/binance/credentials", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ syncNow: true }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      alert(err?.error || "操作失敗，請稍後再試");
      return;
    }
    fetchAll();
  };

  const changeSyncHour = async (value: string) => {
    const res = await authFetch("/api/binance/credentials", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ syncHour: value === "" ? null : Number(value) }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      alert(err?.error || "儲存失敗，請稍後再試");
      return;
    }
    fetchAll();
  };

  const saveBinanceCred = async (e: React.FormEvent) => {
    e.preventDefault();
    setCredSaving(true);
    const res = await authFetch("/api/binance/credentials", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...credForm, syncHour: credForm.syncHour === "" ? null : Number(credForm.syncHour) }),
    });
    setCredSaving(false);
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      alert(data?.error || "儲存失敗，請稍後再試");
      return;
    }
    setCredForm({ apiKey: "", apiSecret: "", syncHour: "" });
    setCredEditing(false);
    fetchAll();
  };

  const removeBinanceCred = async () => {
    if (!confirm("確定要移除幣安 API 連結？移除後不再自動同步，已同步的資料會保留")) return;
    await authFetch("/api/binance/credentials", { method: "DELETE" });
    fetchAll();
  };

  const quickAdjust = async (row: (typeof binanceRows)[number]) => {
    if (!row.holding) return;
    if (!confirm(`把 ${row.code} 帳上數量 ${fmtQty(row.book)} 調成幣安實際 ${fmtQty(row.actual)}？（差額 ${row.diff > 0 ? "+" : ""}${fmtQty(row.diff)}）`)) return;
    const avg = row.holding.quantity > 0 ? row.holding.cost / row.holding.quantity : 0;
    setAdjustingCode(row.code);
    const res = await postInvestment({
      name: row.holding.name, code: row.code, date: new Date().toLocaleDateString("sv-SE"),
      action: row.diff > 0 ? "BUY" : "SELL", broker: BINANCE_EXCHANGE,
      quantity: Math.abs(row.diff), price: avg || undefined, amount: row.diff * avg,
      note: `${ADJUST_NOTE}：${fmtQty(row.book)} → ${fmtQty(row.actual)}（幣安核對）`,
    });
    setAdjustingCode(null);
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      alert(err?.error || "調帳失敗，請稍後再試");
      return;
    }
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
          <h1 className="text-2xl font-bold text-slate-900">虛擬貨幣</h1>
          <p className="text-slate-500 text-sm mt-1">管理你的虛擬貨幣投資記錄</p>
        </div>
        <button onClick={openAdd}
          className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors">
          + 新增記錄
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">持有成本</div>
          <div className={`text-2xl font-bold mt-1 ${netInvested >= 0 ? "text-slate-900" : "text-red-500"}`}>{fmt(netInvested)}</div>
          <div className="text-xs text-slate-400 mt-0.5">{suspenseCost > 0 ? `含暫計帳 ${fmt(suspenseCost)}` : "目前持有的實際投入成本"}</div>
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

      {/* 持有狀況 */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-8">
        <button type="button" onClick={() => setHoldingsOpen((o) => !o)} aria-expanded={holdingsOpen}
          className={`w-full flex items-center justify-between gap-3 px-6 py-4 text-left hover:bg-slate-50 transition-colors ${holdingsOpen ? "border-b border-slate-50" : ""}`}>
          <div>
            <h2 className="font-semibold text-slate-900">持有狀況</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {pricesFailed ? "即時價格暫時抓不到" : pricesAt ? `價格更新於 ${new Date(pricesAt).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}` : "價格更新中…"}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0 text-right">
            <div>
              <div className="text-sm font-bold text-slate-900">市值 {fmt(marketTotal + (suspenseMarket ?? 0))}</div>
              <div className="text-[11px] text-slate-400">成本 {fmt(netInvested)}</div>
            </div>
            <span className="text-xs text-indigo-600 font-medium">{holdingsOpen ? "收合 ▲" : "展開 ▼"}</span>
          </div>
        </button>
        {!holdingsOpen ? null : exchangeHoldings.length === 0 ? (
          <div className="py-10 text-center text-slate-400 text-sm">目前沒有持有虛擬貨幣</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="text-xs text-slate-400 uppercase tracking-wider border-b border-slate-50">
                  <th className="text-left font-semibold px-6 py-3">幣種</th>
                  <th className="text-right font-semibold px-4 py-3">持有顆數</th>
                  <th className="text-right font-semibold px-4 py-3">累計配息</th>
                  <th className="text-right font-semibold px-4 py-3">持有成本（台幣）</th>
                  <th className="text-right font-semibold px-4 py-3">平均成本</th>
                  <th className="text-right font-semibold px-4 py-3">現價</th>
                  <th className="text-right font-semibold px-6 py-3">目前市值</th>
                </tr>
              </thead>
              {holdingsByExchange.map((group) => {
                const groupMarketValue = group.rows.reduce((s, h) => s + (marketValueOf(h) ?? 0), 0);
                const groupMissing = group.rows.filter((h) => marketValueOf(h) == null).length;
                return (
                  <tbody key={group.exchange} className="divide-y divide-slate-50">
                    <tr className="bg-slate-50/80">
                      <td colSpan={3} className="px-6 py-2 text-xs font-semibold text-slate-600">{group.exchange}</td>
                      <td className="px-4 py-2 text-right text-xs text-slate-400">{fmt(group.cost)}</td>
                      <td colSpan={2} />
                      <td className="px-6 py-2 text-right text-xs text-slate-400">
                        {groupMissing < group.rows.length ? fmt(groupMarketValue) : "—"}
                      </td>
                    </tr>
                    {group.rows.map((h) => {
                      const marketValue = marketValueOf(h);
                      return (
                        <tr key={h.key} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-3 font-medium text-slate-800">
                            {h.name}
                            {h.code !== "—" && h.code !== h.name && <span className="ml-2 text-xs text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">{h.code}</span>}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-700 font-mono">{fmtQty(h.quantity)}</td>
                          <td className="px-4 py-3 text-right font-mono">
                            {h.dividendQty > 0 ? (
                              <span className="text-amber-600">
                                {fmtQty(h.dividendQty)}
                                {livePrice(h.code) != null && (
                                  <span className="block text-[11px] text-slate-400 font-sans">≈ {fmt(Math.min(h.dividendQty, h.quantity) * livePrice(h.code)!)}</span>
                                )}
                              </span>
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-700">{fmt(h.cost)}</td>
                          <td className="px-4 py-3 text-right text-slate-700">{fmtAvg(h.cost / h.quantity)}</td>
                          <td className="px-4 py-3 text-right text-slate-700">{livePrice(h.code) != null ? fmtAvg(livePrice(h.code)!) : <span className="text-slate-300">—</span>}</td>
                          <td className="px-6 py-3 text-right font-semibold">
                            {marketValue != null ? (
                              <span className={marketValue >= h.cost ? "text-red-500" : "text-emerald-600"}>{fmt(marketValue)}</span>
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                );
              })}
              {suspenseQty > 0 && (
                <tbody className="divide-y divide-slate-50">
                  <tr className="bg-violet-50/40">
                    <td className="px-6 py-3 font-medium text-violet-700">暫計帳（待賺回）</td>
                    <td className="px-4 py-3 text-right text-slate-700 font-mono">{fmtQty(suspenseQty)} {SUSPENSE_CODE}</td>
                    <td className="px-4 py-3 text-right text-slate-300">—</td>
                    <td className="px-4 py-3 text-right text-slate-700">{fmt(suspenseCost)}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{fmtAvg(suspenseCost / suspenseQty)}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{livePrice(SUSPENSE_CODE) != null ? fmtAvg(livePrice(SUSPENSE_CODE)!) : <span className="text-slate-300">—</span>}</td>
                    <td className="px-6 py-3 text-right font-semibold">
                      {suspenseMarket != null ? (
                        <span className={suspenseMarket >= suspenseCost ? "text-red-500" : "text-emerald-600"}>{fmt(suspenseMarket)}</span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                </tbody>
              )}
              <tfoot>
                <tr className="border-t border-slate-100 bg-slate-50">
                  <td colSpan={3} className="px-6 py-3 font-semibold text-slate-800">合計{suspenseCost > 0 ? "（含暫計帳）" : ""}</td>
                  <td className="px-4 py-3 text-right font-bold text-slate-900">{fmt(netInvested)}</td>
                  <td colSpan={2} />
                  <td className="px-6 py-3 text-right font-bold text-slate-900">
                    {fmt(marketTotal + (suspenseMarket ?? 0))}
                    {marketMissing > 0 && <span className="block text-[11px] font-normal text-slate-400">{marketMissing} 種幣沒有報價未計入</span>}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* 幣安帳戶核對 */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-8">
        <button type="button" onClick={() => setBinanceOpen((o) => !o)} aria-expanded={binanceOpen}
          className={`w-full flex items-center justify-between gap-3 px-6 py-4 text-left hover:bg-slate-50 transition-colors ${binanceOpen ? "border-b border-slate-50" : ""}`}>
          <div>
            <h2 className="font-semibold text-slate-900">幣安帳戶核對</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {!binanceConnected
                ? "未連結（選填）：連結幣安 API 後自動同步核對；不連結就維持手動記帳"
                : snapValid
                  ? `最後同步 ${new Date(binanceSnap!.fetchedAt).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}・${syncScheduleText(binanceCred?.syncHour)}`
                  : binanceCred?.syncHour === null || binanceCred?.syncHour === undefined
                    ? "已連結，10 分鐘內會完成第一次同步"
                    : `已連結，將於 ${[0, 6, 12, 18].map((d) => `${pad2((binanceCred.syncHour! + d) % 24)}:00`).join("、")} 其中最近的一個時間第一次同步`}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {snapValid && !binanceSnap!.error && (
              binanceMismatch > 0
                ? <span className="text-sm font-bold text-amber-600">{binanceMismatch} 種幣對不上</span>
                : <span className="text-sm font-bold text-emerald-600">全部一致 ✓</span>
            )}
            <span className="text-xs text-indigo-600 font-medium">{binanceOpen ? "收合 ▲" : "展開 ▼"}</span>
          </div>
        </button>
        {binanceOpen && (
          <div className="px-6 py-4 border-b border-slate-50">
            {binanceConnected && !credEditing ? (
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-slate-600">✅ 已連結幣安 API（API Key 末 4 碼 <span className="font-mono">{binanceCred?.apiKeyHint}</span>）</span>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-slate-500">
                    第一次檢查時間
                    <select value={binanceCred?.syncHour ?? ""} onChange={(e) => changeSyncHour(e.target.value)}
                      className="border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700">
                      <option value="">不指定（立即）</option>
                      {HOUR_OPTIONS.map((h) => <option key={h} value={h}>{pad2(h)}:00</option>)}
                    </select>
                  </label>
                  <button type="button" onClick={requestSyncNow} disabled={syncPending}
                    className="text-xs font-semibold text-emerald-600 border border-emerald-200 rounded-lg px-2.5 py-1 hover:bg-emerald-50 disabled:opacity-60"
                    title="同步工作會在 10 分鐘內抓一次最新資料，完成後重新整理頁面就會自動入帳">
                    {syncPending ? "同步排程中（10 分鐘內）" : "立即同步"}
                  </button>
                  <button type="button" onClick={() => { setCredForm({ apiKey: "", apiSecret: "", syncHour: binanceCred?.syncHour == null ? "" : String(binanceCred.syncHour) }); setCredEditing(true); }}
                    className="text-xs font-semibold text-indigo-600 border border-indigo-200 rounded-lg px-2.5 py-1 hover:bg-indigo-50">更新金鑰</button>
                  <button type="button" onClick={removeBinanceCred}
                    className="text-xs font-semibold text-red-500 border border-red-200 rounded-lg px-2.5 py-1 hover:bg-red-50">移除連結</button>
                </div>
              </div>
            ) : (
              <form onSubmit={saveBinanceCred} className="space-y-3">
                <div className="text-xs text-slate-500 space-y-1 bg-slate-50 rounded-lg px-3.5 py-2.5">
                  <p>到幣安「API 管理」建立金鑰：<strong>只勾「讀取」權限</strong>，不要開交易或提領；IP 存取選「不限制」。</p>
                  <p>金鑰會加密保存，網站本身無法解開，只有同步工作能使用；不會再顯示在畫面上。</p>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <input required value={credForm.apiKey} onChange={(e) => setCredForm({ ...credForm, apiKey: e.target.value })}
                    placeholder="API Key" autoComplete="off" spellCheck={false}
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm font-mono focus:border-indigo-400 transition-colors" />
                  <input required type="password" value={credForm.apiSecret} onChange={(e) => setCredForm({ ...credForm, apiSecret: e.target.value })}
                    placeholder="Secret Key" autoComplete="new-password" spellCheck={false}
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm font-mono focus:border-indigo-400 transition-colors" />
                </div>
                <label className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                  第一次檢查時間（台灣時間）
                  <select value={credForm.syncHour} onChange={(e) => setCredForm({ ...credForm, syncHour: e.target.value })}
                    className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm text-slate-700">
                    <option value="">不指定（連結後立即同步）</option>
                    {HOUR_OPTIONS.map((h) => <option key={h} value={h}>{pad2(h)}:00</option>)}
                  </select>
                  <span className="text-[11px] text-slate-400">之後每 6 小時同步一次，例如選 08:00 就是每天 08:00、14:00、20:00、02:00</span>
                </label>
                <div className="flex gap-2 justify-end">
                  {credEditing && (
                    <button type="button" onClick={() => { setCredEditing(false); setCredForm({ apiKey: "", apiSecret: "", syncHour: "" }); }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50">取消</button>
                  )}
                  <button type="submit" disabled={credSaving}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60">
                    {credSaving ? "儲存中..." : "連結幣安"}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
        {binanceOpen && binanceConnected && (
          !snapValid ? (
            <div className="px-6 py-6 text-sm text-slate-500">已連結，同步時間：{syncScheduleText(binanceCred?.syncHour)}。第一次同步完成後，這裡會顯示幣安實際數量與帳上數量的比對。</div>
          ) : binanceSnap!.error ? (
            <div className="px-6 py-6 text-sm text-red-500">同步失敗：{binanceSnap!.error}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="text-xs text-slate-400 uppercase tracking-wider border-b border-slate-50">
                    <th className="text-left font-semibold px-6 py-3">幣種</th>
                    <th className="text-right font-semibold px-4 py-3">幣安實際</th>
                    <th className="text-right font-semibold px-4 py-3">帳上</th>
                    <th className="text-right font-semibold px-4 py-3">差額</th>
                    <th className="text-right font-semibold px-6 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {binanceRows.map((r) => (
                    <tr key={r.code} className={r.diff !== 0 ? "bg-amber-50/40" : ""}>
                      <td className="px-6 py-3 font-medium text-slate-800">
                        {r.code}
                        {binanceSnap.balances[r.code] && (
                          <span className="block text-[11px] font-normal text-slate-400">
                            {[["現貨", binanceSnap.balances[r.code].spot], ["資金", binanceSnap.balances[r.code].funding], ["理財", binanceSnap.balances[r.code].earn]]
                              .filter(([, v]) => (v as number) > 0).map(([k, v]) => `${k} ${fmtQty(v as number)}`).join(" · ")}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700">{fmtQty(r.actual)}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700">{fmtQty(r.book)}</td>
                      <td className={`px-4 py-3 text-right font-mono font-semibold ${r.diff === 0 ? "text-slate-300" : "text-amber-600"}`}>
                        {r.diff === 0 ? "—" : `${r.diff > 0 ? "+" : ""}${fmtQty(r.diff)}`}
                      </td>
                      <td className="px-6 py-3 text-right">
                        {r.diff !== 0 && (r.holding ? (
                          <button type="button" disabled={adjustingCode === r.code} onClick={() => quickAdjust(r)}
                            className="text-xs font-semibold text-violet-600 border border-violet-200 rounded-lg px-2.5 py-1 hover:bg-violet-50 disabled:opacity-50">
                            {adjustingCode === r.code ? "調帳中…" : "調帳"}
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400">帳上沒有（美股代幣請記在美股頁）</span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* 暫計帳 */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-8">
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-50">
          <div>
            <h2 className="font-semibold text-slate-900">暫計帳</h2>
            <p className="text-xs text-slate-400 mt-0.5">用 USDT 支付的項目（例如自動交易軟體）：新增時從持有扣除、轉列暫計帳資產，賺回後可回補</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {suspenseOpenQty > 0 && (
              <span className="text-sm font-bold text-violet-700 text-right" title="尚未回補，以扣除當下成本計入資產總攬">
                待賺回 {fmtQty(suspenseOpenQty)} {SUSPENSE_CODE}
                <span className="block text-[11px] font-normal text-slate-400">計入資產 {fmt(suspenseOpenCost(suspenseEntries))}</span>
              </span>
            )}
            <button type="button" onClick={() => openSuspense(null)}
              className="text-xs font-semibold text-indigo-600 border border-indigo-200 rounded-lg px-2.5 py-1.5 hover:bg-indigo-50 transition-colors">
              + 新增
            </button>
          </div>
        </div>
        {suspenseEntries.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm">還沒有暫計帳</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {suspenseEntries.map((en) => (
              <div key={en.id} className="flex items-center justify-between gap-3 px-6 py-3.5 hover:bg-slate-50 transition-colors group">
                <div>
                  <div className="text-sm font-medium text-slate-800">
                    {en.name}
                    <span className={`ml-2 text-[11px] font-semibold px-2 py-0.5 rounded-full ${en.reversedAt ? "bg-emerald-100 text-emerald-700" : "bg-violet-100 text-violet-700"}`}>
                      {en.reversedAt ? `已回補 ${new Date(en.reversedAt).toLocaleDateString("zh-TW")}` : "待賺回"}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {new Date(en.date).toLocaleDateString("zh-TW")}
                    {` · 成本 ${fmt(en.quantity * en.unitCost)}（@${fmt2(en.unitCost)}）`}
                    {en.note ? ` · ${en.note}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-semibold text-slate-700 font-mono">{fmtQty(en.quantity)} {en.code}</span>
                  <button type="button" onClick={() => handleReverseSuspense(en, !!en.reversedAt)}
                    className={`text-xs font-semibold rounded-lg px-2.5 py-1.5 border transition-colors ${
                      en.reversedAt ? "text-slate-500 border-slate-200 hover:bg-slate-50" : "text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                    }`}>
                    {en.reversedAt ? "取消回補" : "回補"}
                  </button>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openSuspense(en)} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 text-xs transition-colors">編輯</button>
                    <button onClick={() => handleDeleteSuspense(en.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 text-xs transition-colors">刪除</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 暫計帳 Modal */}
      {suspenseModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-slate-900 mb-5">{suspenseModal.editing ? "編輯暫計帳" : "新增暫計帳"}</h2>
            <form onSubmit={handleSaveSuspense} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">項目名稱</label>
                <input required value={suspenseForm.name} onChange={(e) => setSuspenseForm({ ...suspenseForm, name: e.target.value })}
                  placeholder="例如：自動交易軟體" className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">數量（{SUSPENSE_CODE}）</label>
                  <input required type="number" min="0" step="any" value={suspenseForm.quantity}
                    disabled={!!suspenseModal.editing}
                    onChange={(e) => setSuspenseForm({ ...suspenseForm, quantity: e.target.value })} placeholder="例如：500"
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors disabled:bg-slate-50 disabled:text-slate-400" />
                  <p className="text-[11px] text-slate-400 mt-1">
                    {suspenseModal.editing ? "數量不能修改，要改請刪除後重新新增" : `目前持有 ${fmtQty(suspenseHeld)} ${SUSPENSE_CODE}`}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">日期</label>
                  <input required type="date" value={suspenseForm.date}
                    onChange={(e) => setSuspenseForm({ ...suspenseForm, date: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">從哪個交易所扣除（選填）</label>
                <Combobox
                  value={suspenseForm.broker}
                  onChange={(v) => setSuspenseForm({ ...suspenseForm, broker: v })}
                  options={allExchanges}
                  placeholder="搜尋或選擇交易所"
                />
                <p className="text-[11px] text-slate-400 mt-1">留空會標成「未指定」，持有狀況的交易所明細會對不起來</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">備註（選填）</label>
                <input value={suspenseForm.note} onChange={(e) => setSuspenseForm({ ...suspenseForm, note: e.target.value })}
                  placeholder="備註..." className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setSuspenseModal(null)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                  取消
                </button>
                <button type="submit" disabled={suspenseSaving}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-60">
                  {suspenseSaving ? "儲存中..." : "儲存"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* List */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-50">
          <h2 className="font-semibold text-slate-900">投資記錄</h2>
          <select value={sortKey} onChange={(e) => { setSortKey(e.target.value as SortKey); setPage(1); }} aria-label="排序方式"
            className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-600 focus:border-indigo-400 transition-colors">
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm">載入中...</div>
        ) : investments.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-slate-400 text-sm mb-3">還沒有虛擬貨幣投資記錄</p>
            <button onClick={openAdd} className="text-sm text-indigo-600 font-medium hover:underline">新增第一筆記錄</button>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {pagedInvestments.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors group">
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${recordLabel(inv).cls}`}>
                    {recordLabel(inv).text}
                  </span>
                  <div>
                    <div className="text-sm font-medium text-slate-800">
                      {inv.name || "(未命名)"}
                      {inv.code && <span className="ml-2 text-xs text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">{inv.code}</span>}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {inv.externalRef
                        ? new Date(inv.date ?? inv.createdAt).toLocaleString("zh-TW", { hour12: false, year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })
                        : new Date(inv.date ?? inv.createdAt).toLocaleDateString("zh-TW")}
                      {inv.externalRef && <span className="ml-1.5 inline-block text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">幣安自動入帳</span>}
                      {inv.broker ? ` · ${inv.broker}` : ""}
                      {inv.quantity && !isTwd(inv) ? ` · ${fmtQty(inv.quantity)} 顆` : ""}
                      {inv.price && !isTwd(inv) ? ` · @${fmt2(inv.price)}` : ""}
                      {inv.fee ? ` · 手續費 ${fmt(inv.fee)}` : ""}
                      {inv.note ? ` · ${inv.note}` : ""}
                      {inv.transactionId && <span className="ml-1 text-indigo-400">· 已連結支出</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`text-sm font-semibold ${inv.amount >= 0 ? "text-slate-700" : "text-red-500"}`}>
                    {fmt(Math.abs(inv.amount))}
                  </span>
                  {isSuspenseRecord(inv) ? (
                    <span className="text-[11px] text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity">由暫計帳管理</span>
                  ) : (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEdit(inv)} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 text-xs transition-colors">編輯</button>
                      <button onClick={() => handleDelete(inv.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 text-xs transition-colors">刪除</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {!loading && pageCount > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-slate-50">
            <span className="text-xs text-slate-400">
              第 {currentPage} / {pageCount} 頁・共 {sortedInvestments.length} 筆
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
            <h2 className="text-lg font-bold text-slate-900 mb-5">新增虛擬貨幣記錄</h2>
            <form onSubmit={handleAdd} className="space-y-4">
              {/* 買進/賣出/配息/台幣入金/調帳 */}
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5 [&>button]:text-xs sm:[&>button]:text-sm [&>button]:px-1">
                {(["BUY", "SELL"] as const).map((a) => (
                  <button key={a} type="button" onClick={() => setAddForm({ ...addForm, mode: "TRADE", action: a })}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      addForm.mode === "TRADE" && addForm.action === a
                        ? a === "BUY" ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    }`}>
                    {a === "BUY" ? "買進" : "賣出"}
                  </button>
                ))}
                <button type="button" onClick={() => setAddForm({ ...addForm, mode: "DIVIDEND" })}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    addForm.mode === "DIVIDEND" ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}>
                  配息
                </button>
                <button type="button" onClick={() => setAddForm({ ...addForm, mode: "DEPOSIT" })}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    addForm.mode === "DEPOSIT" ? "bg-sky-500 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}>
                  台幣入金
                </button>
                <button type="button" onClick={() => setAddForm({ ...addForm, mode: "ADJUST" })}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    addForm.mode === "ADJUST" ? "bg-violet-500 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}>
                  調帳
                </button>
                <button type="button" onClick={() => setAddForm({ ...addForm, mode: "TRANSFER" })}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    addForm.mode === "TRANSFER" ? "bg-cyan-500 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}>
                  轉移
                </button>
                <button type="button" onClick={() => setAddForm({ ...addForm, mode: "SWAP" })}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    addForm.mode === "SWAP" ? "bg-orange-500 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}>
                  兌換
                </button>
              </div>
              {addForm.mode === "SWAP" && (
                <p className="text-xs text-slate-400 -mt-2">
                  用一種幣換另一種幣：換成 USDT 時以 USDT 平均成本計價（賺賠反映在資產）；換成其他幣時承接換出幣的成本
                </p>
              )}
              {addForm.mode === "TRANSFER" && (
                <p className="text-xs text-slate-400 -mt-2">
                  把幣從一個交易所轉到另一個交易所：總成本不變，手續費（以幣計）會讓轉入數量變少
                </p>
              )}
              {addForm.mode === "ADJUST" && (
                <p className="text-xs text-slate-400 -mt-2">
                  核對用：輸入交易所實際的持有數量，系統補一筆差額讓帳上數量一致（差額以目前平均成本計價，平均成本不變）
                </p>
              )}
              {addForm.mode === "DEPOSIT" && (
                <p className="text-xs text-slate-400 -mt-2">
                  轉進交易所、還沒拿去買幣的台幣。之後買幣時可以勾選「從交易所台幣餘額扣款」，資產才不會重複計算
                </p>
              )}
              {addForm.mode === "DIVIDEND" && (
                <p className="text-xs text-slate-400 -mt-2">
                  質押、理財、空投等收到的幣：只填顆數，台幣價值每次開啟頁面依最新市價計算
                </p>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{addForm.mode === "DIVIDEND" ? "配息日期" : addForm.mode === "DEPOSIT" ? "入金日期" : addForm.mode === "ADJUST" ? "調帳日期" : addForm.mode === "TRANSFER" ? "轉移日期" : addForm.mode === "SWAP" ? "兌換日期" : "交易日期"}</label>
                <input required type="date" value={addForm.date}
                  onChange={(e) => setAddForm({ ...addForm, date: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>

              {addForm.mode !== "TRANSFER" && (<div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">交易所／錢包（選填）</label>
                <Combobox
                  value={addForm.broker}
                  onChange={(v) => setAddForm({ ...addForm, broker: v })}
                  options={allExchanges}
                  placeholder="搜尋或選擇交易所"
                />
                {addExchangeOpen ? (
                  <div className="flex gap-2 mt-2">
                    <input value={addExchangeInput} onChange={(e) => setAddExchangeInput(e.target.value)}
                      placeholder="輸入交易所名稱"
                      className="flex-1 border border-indigo-300 rounded-lg px-3 py-2 text-sm focus:border-indigo-400" />
                    <button type="button" onClick={handleAddExchange} disabled={addExchangeLoading}
                      className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60">
                      {addExchangeLoading ? "..." : "新增"}
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setAddExchangeOpen(true)}
                    className="mt-1.5 text-xs text-indigo-500 hover:text-indigo-700 hover:underline">
                    + 找不到？新增交易所
                  </button>
                )}
                {userExchanges.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {userExchanges.map((ex) => (
                      <span key={ex.id} className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs pl-2 pr-1 py-1 rounded-full">
                        <button type="button" onClick={() => setAddForm({ ...addForm, broker: ex.name })} className="hover:text-indigo-600">
                          {ex.name}
                        </button>
                        <button type="button" onClick={() => handleDeleteExchange(ex.id)}
                          className="text-slate-400 hover:text-red-500 leading-none w-4 h-4 flex items-center justify-center rounded-full hover:bg-red-50">
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>)}

              {addForm.mode === "DEPOSIT" && (
                <>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">入金金額（台幣）</label>
                      <input required type="number" min="0" step="any" value={addForm.depositAmount}
                        onChange={(e) => setAddForm({ ...addForm, depositAmount: e.target.value })} placeholder="例如：10000"
                        className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                      <p className="text-[11px] text-slate-400 mt-1">目前交易所台幣餘額：{fmt(twdBalance)}</p>
                    </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">備註（選填）</label>
                    <input value={addForm.note} onChange={(e) => setAddForm({ ...addForm, note: e.target.value })}
                      placeholder="例如：玉山銀行轉入" className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                  </div>
                </>
              )}

              {addForm.mode === "SWAP" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">換出幣種</label>
                      <select required value={addForm.swapFrom}
                        onChange={(e) => setAddForm({ ...addForm, swapFrom: e.target.value })}
                        className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors">
                        <option value="">請選擇</option>
                        {holdings.map((h) => (
                          <option key={h.key} value={h.code}>{h.code === TWD_CODE ? "台幣" : h.code}（{fmtQty(h.quantity)}）</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">換出數量</label>
                      <input required type="number" min="0" step="any" value={addForm.swapFromQty}
                        onChange={(e) => setAddForm({ ...addForm, swapFromQty: e.target.value })}
                        placeholder={swapFromHolding ? `最多 ${fmtQty(swapFromHolding.quantity)}` : "例如：1"}
                        className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">換到幣種</label>
                      <Combobox
                        value={addForm.swapTo}
                        onChange={(v) => setAddForm({ ...addForm, swapTo: v })}
                        options={coinOptions}
                        placeholder="例如：ADA"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">換到數量</label>
                      <input required type="number" min="0" step="any" value={addForm.swapToQty}
                        onChange={(e) => setAddForm({ ...addForm, swapToQty: e.target.value })} placeholder="交易所顯示收到的數量"
                        className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">手續費（選填，{swapToCode || "換到的幣"}）</label>
                    <input type="number" min="0" step="any" value={addForm.swapFee}
                      onChange={(e) => setAddForm({ ...addForm, swapFee: e.target.value })} placeholder="例如：0.1"
                      className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                    <p className="text-[11px] text-slate-400 mt-1">從你輸入的換到數量扣除，實際入帳 = 換到數量 − 手續費</p>
                  </div>
                  {swapFromHolding && swapFromQty > 0 && (
                    <div className="bg-slate-50 rounded-xl px-4 py-3 space-y-1.5">
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>換出成本</span><span>{fmt(swapCost)}</span>
                      </div>
                      {swapToQty > 0 && swapToCode && (
                        <>
                          <div className="flex justify-between text-xs text-slate-500">
                            <span>實際入帳（換到 − 手續費）</span><span className="font-mono">{fmtQty(Math.max(0, Math.round(swapNet * 1e8) / 1e8))} {swapToCode}</span>
                          </div>
                          <div className="flex justify-between text-xs text-slate-500">
                            <span>換入成本{swapToUsdt ? `（USDT 以平均成本 ${fmt2(usdtUnitCost)} 計）` : "（承接換出成本）"}</span><span>{fmt(swapInCost)}</span>
                          </div>
                          {swapToUsdt && (
                            <div className="flex justify-between text-xs font-semibold pt-1.5 border-t border-slate-200">
                              <span className="text-slate-700">這次兌換損益</span>
                              <span className={swapInCost - swapCost >= 0 ? "text-red-500" : "text-emerald-600"}>{swapInCost - swapCost >= 0 ? "+" : ""}{fmt(swapInCost - swapCost)}</span>
                            </div>
                          )}
                        </>
                      )}
                      {swapFee > 0 && swapNet <= 0 && (
                        <p className="text-xs text-red-500">手續費要小於換到數量</p>
                      )}
                      {swapFromQty > swapFromHolding.quantity + 1e-9 && (
                        <p className="text-xs text-red-500">超過持有（{fmtQty(swapFromHolding.quantity)}）</p>
                      )}
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">備註（選填）</label>
                    <input value={addForm.note} onChange={(e) => setAddForm({ ...addForm, note: e.target.value })}
                      placeholder="例如：幣安閃兌" className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                  </div>
                </>
              )}

              {addForm.mode === "TRANSFER" && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">幣種</label>
                    <select required value={addForm.transferCode}
                      onChange={(e) => setAddForm({ ...addForm, transferCode: e.target.value, transferFrom: "" })}
                      className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors">
                      <option value="">請選擇要轉移的幣種</option>
                      {holdings.map((h) => (
                        <option key={h.key} value={h.code}>{h.code === TWD_CODE ? "台幣" : h.name}（{h.code}）· 共 {fmtQty(h.quantity)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">轉出交易所</label>
                      <select required value={addForm.transferFrom} disabled={!addForm.transferCode}
                        onChange={(e) => setAddForm({ ...addForm, transferFrom: e.target.value })}
                        className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors disabled:bg-slate-50">
                        <option value="">請選擇</option>
                        {transferSources.map((e) => (
                          <option key={e.exchange} value={e.exchange}>{e.exchange}（{fmtQty(e.quantity)}）</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">轉入交易所</label>
                      <Combobox
                        value={addForm.transferTo}
                        onChange={(v) => setAddForm({ ...addForm, transferTo: v })}
                        options={allExchanges}
                        placeholder="搜尋或輸入"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">轉出數量</label>
                      <input required type="number" min="0" step="any" value={addForm.quantity}
                        onChange={(e) => setAddForm({ ...addForm, quantity: e.target.value })}
                        placeholder={addForm.transferFrom ? `最多 ${fmtQty(transferSourceQty)}` : "例如：100"}
                        className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">手續費（選填，以幣計）</label>
                      <input type="number" min="0" step="any" value={addForm.transferFee}
                        onChange={(e) => setAddForm({ ...addForm, transferFee: e.target.value })} placeholder="例如：1"
                        className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                    </div>
                  </div>
                  {transferHolding && quantity > 0 && (
                    <div className="bg-slate-50 rounded-xl px-4 py-3 space-y-1.5">
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>轉入數量</span><span className="font-mono">{fmtQty(Math.max(0, Math.round(transferIn * 1e8) / 1e8))}</span>
                      </div>
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>搬移成本（總成本不變）</span><span>{fmt(quantity * transferAvg)}</span>
                      </div>
                      {quantity > transferSourceQty + 1e-9 && addForm.transferFrom && (
                        <p className="text-xs text-red-500">超過 {addForm.transferFrom} 的持有（{fmtQty(transferSourceQty)}）</p>
                      )}
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">備註（選填）</label>
                    <input value={addForm.note} onChange={(e) => setAddForm({ ...addForm, note: e.target.value })}
                      placeholder="例如：轉到冷錢包" className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                  </div>
                </>
              )}

              {addForm.mode === "ADJUST" && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">幣種</label>
                    <select required value={addForm.adjustCode}
                      onChange={(e) => setAddForm({ ...addForm, adjustCode: e.target.value, adjustActual: "" })}
                      className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors">
                      <option value="">請選擇要核對的幣種</option>
                      {holdings.map((h) => (
                        <option key={h.key} value={h.code}>{h.code === TWD_CODE ? "台幣" : h.name}（{h.code}）· 帳上 {fmtQty(h.quantity)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">交易所實際持有數量</label>
                    <input required type="number" min="0" step="any" value={addForm.adjustActual}
                      onChange={(e) => setAddForm({ ...addForm, adjustActual: e.target.value })}
                      placeholder={adjustHolding ? `帳上 ${fmtQty(adjustHolding.quantity)}` : "先選擇幣種"}
                      className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                  </div>
                  {adjustHolding && (
                    <div className="bg-slate-50 rounded-xl px-4 py-3 space-y-1.5">
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>目前帳上數量</span><span className="font-mono">{fmtQty(adjustHolding.quantity)}</span>
                      </div>
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>平均成本</span><span>{fmtAvg(adjustAvg)}</span>
                      </div>
                      <div className="flex justify-between text-sm font-semibold pt-1.5 border-t border-slate-200">
                        <span className="text-slate-900">調帳差額</span>
                        <span className={adjustDiff === 0 ? "text-slate-400" : adjustDiff > 0 ? "text-sky-600" : "text-slate-600"}>
                          {addForm.adjustActual === "" ? "—" : adjustDiff === 0 ? "無差額" : `${adjustDiff > 0 ? "+" : "−"}${fmtQty(Math.abs(adjustDiff))}（${adjustDiff > 0 ? "+" : "−"}${fmt(Math.abs(adjustDiff * adjustAvg))}）`}
                        </span>
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">備註（選填）</label>
                    <input value={addForm.note} onChange={(e) => setAddForm({ ...addForm, note: e.target.value })}
                      placeholder="例如：月底核對交易所餘額" className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                  </div>
                </>
              )}

              {addForm.mode === "DIVIDEND" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">幣種</label>
                      <Combobox
                        value={addForm.code}
                        onChange={(v) => setAddForm({ ...addForm, code: v, name: knownCoins.get(v.trim()) ?? addForm.name })}
                        options={coinOptions}
                        placeholder="例如：USDT"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">配息數量</label>
                      <input required type="number" min="0" step="any" value={addForm.quantity}
                        onChange={(e) => setAddForm({ ...addForm, quantity: e.target.value })} placeholder="例如：1.25"
                        className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">備註（選填）</label>
                    <input value={addForm.note} onChange={(e) => setAddForm({ ...addForm, note: e.target.value })}
                      placeholder="例如：幣安活期理財利息" className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                  </div>
                </>
              )}

              {addForm.mode === "TRADE" && (<>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">幣種名稱（選填）</label>
                  <input value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                    placeholder="例如：Bitcoin" className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">代碼（選填）</label>
                  <Combobox
                    value={addForm.code}
                    onChange={(v) => setAddForm({ ...addForm, code: v })}
                    options={DEFAULT_CODES}
                    placeholder="例如：BTC"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">計價幣別</label>
                <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
                  {(["USDT", "TWD"] as const).map((q) => (
                    <button key={q} type="button" disabled={quoteLocked} onClick={() => setAddForm({ ...addForm, quote: q })}
                      className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors disabled:cursor-not-allowed ${
                        quote === q ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                      }`}>
                      {q === "USDT" ? "USDT" : "台幣"}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  {quoteLocked
                    ? `交易 ${tradeCode} 一律用台幣計價`
                    : quote === "USDT"
                      ? `用 USDT 買賣：自動${addForm.action === "BUY" ? "從 USDT 持有扣款" : "把款項加回 USDT 持有"}，依 USDT 平均成本 ${usdtUnitCost > 0 ? fmt2(usdtUnitCost) : "—"} 換算台幣（目前持有 ${fmtQty(usdtHeld)} USDT）`
                      : "用台幣直接買賣"}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">數量</label>
                  <input required type="number" min="0" step="any" value={addForm.quantity}
                    onChange={(e) => setAddForm({ ...addForm, quantity: e.target.value })} placeholder="例如：0.5"
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">單價（選填，{quote === "USDT" ? "USDT" : "台幣"}）</label>
                  <input type="number" min="0" step="any" value={addForm.price}
                    onChange={(e) => setAddForm({ ...addForm, price: e.target.value })} placeholder={autoPrice > 0 ? `留空用平均成本 ${fmt2(autoPrice)}` : "留空用平均成本"}
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">手續費（選填，{buyFeeInUsdt || quote === "USDT" ? "USDT" : "台幣"}）</label>
                <input type="number" min="0" step="any" value={addForm.fee}
                  onChange={(e) => setAddForm({ ...addForm, fee: e.target.value })} placeholder="例如：0.5"
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                {buyFeeInUsdt && (
                  <p className="text-[11px] text-slate-400 mt-1">
                    交易所手續費是從 USDT 扣的：依 USDT 平均成本 {usdtUnitCost > 0 ? fmt2(usdtUnitCost) : "—"} 換算台幣成本，並從 USDT 持有扣除{fee > 0 && usdtUnitCost > 0 ? `（≈ ${fmt(feeTwd)}）` : ""}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">備註（選填）</label>
                <input value={addForm.note} onChange={(e) => setAddForm({ ...addForm, note: e.target.value })}
                  placeholder="備註..." className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">總金額（選填，{quote === "USDT" ? "USDT" : "台幣"}）</label>
                <input type="number" min="0" step="any" value={addForm.override}
                  onChange={(e) => setAddForm({ ...addForm, override: e.target.value })}
                  placeholder={`試算為 ${fmtQuote(calcSubtotal)}，如與交易所實際金額不同可在此輸入覆蓋`}
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                <p className="text-[11px] text-slate-400 mt-1">
                  只填顆數時以平均成本自動計算；實際價格不同時再填單價或總金額（只填總金額會自動回推單價，兩個都填以總金額為準）
                </p>
                {priceIsAuto && quantity > 0 && (
                  <p className="text-[11px] text-indigo-500 mt-0.5">目前以 {tradeCode} 平均成本 {fmt2(autoPrice)}{quote === "USDT" ? " USDT" : ""} 計算</p>
                )}
              </div>

              {/* 試算小計 */}
              <div className="bg-slate-50 rounded-xl px-4 py-3 space-y-1.5">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>成交金額</span><span>{fmtQuote(principal)}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>手續費</span>
                  <span>{buyFeeInUsdt ? `${fmtQty(fee)} USDT${usdtUnitCost > 0 ? ` ≈ ${fmt(feeTwd)}` : ""}` : fmtQuote(fee)}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>自動試算小計</span><span>{fmtQuote(calcSubtotal)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold text-slate-900 pt-1.5 border-t border-slate-200">
                  <span>{addForm.action === "BUY" ? "最終小計（應付）" : "最終小計（應收）"}</span>
                  <span>{fmtQuote(subtotal)}{addForm.override !== "" && <span className="text-[10px] font-normal text-indigo-500 ml-1">（已調整）</span>}</span>
                </div>
                {quote === "USDT" && usdtUnitCost > 0 && (
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>換算台幣成本</span><span>{fmt(subtotal * usdtUnitCost)}</span>
                  </div>
                )}
                {quote === "USDT" && addForm.action === "BUY" && subtotal > usdtHeld + 1e-9 && (
                  <p className="text-xs text-red-500">USDT 持有不足（目前 {fmtQty(usdtHeld)}）</p>
                )}
                {buyFeeInUsdt && fee > 0 && usdtUnitCost > 0 && fee > usdtHeld + 1e-9 && (
                  <p className="text-xs text-red-500">USDT 持有不足以支付手續費（目前 {fmtQty(usdtHeld)}）</p>
                )}
              </div>

              {quote === "TWD" && addForm.action === "BUY" && twdBalance > 0 && (
                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={addForm.payFromTwd} className="mt-0.5"
                    onChange={(e) => setAddForm({ ...addForm, payFromTwd: e.target.checked })} />
                  <span>
                    從交易所台幣餘額扣款
                    <span className="block text-[11px] text-slate-400">
                      目前餘額 {fmt(twdBalance)}{subtotal > twdBalance ? `，不足的 ${fmt(subtotal - twdBalance)} 視為從外部付款` : ""}
                    </span>
                  </span>
                </label>
              )}
              {quote === "TWD" && addForm.action === "SELL" && (
                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={addForm.creditToTwd} className="mt-0.5"
                    onChange={(e) => setAddForm({ ...addForm, creditToTwd: e.target.checked })} />
                  <span>
                    賣出款項存入交易所台幣餘額
                    <span className="block text-[11px] text-slate-400">款項留在交易所、還沒轉回銀行時勾選</span>
                  </span>
                </label>
              )}
              </>)}

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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-slate-900 mb-5">編輯虛擬貨幣記錄</h2>
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
                <label className="block text-sm font-medium text-slate-700 mb-1.5">交易所／錢包（選填）</label>
                <Combobox
                  value={editForm.broker}
                  onChange={(v) => setEditForm({ ...editForm, broker: v })}
                  options={allExchanges}
                  placeholder="搜尋或選擇交易所"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">幣種名稱（選填）</label>
                <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="例如：Bitcoin" className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">代碼（選填）</label>
                <input value={editForm.code} onChange={(e) => setEditForm({ ...editForm, code: e.target.value })}
                  placeholder="例如：BTC" className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">數量（選填）</label>
                <input type="number" step="any" value={editForm.quantity}
                  onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })} placeholder="例如：0.5"
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">投入金額</label>
                <input required type="number" step="any" value={editForm.amount}
                  onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })} placeholder="例如：50000"
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                <p className="text-[11px] text-slate-400 mt-1">因手續費／進位導致與實際金額有落差時，可直接在此修正（賣出記錄請填負數）</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">備註（選填）</label>
                <input value={editForm.note} onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
                  placeholder="備註..." className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>
              <p className="text-[11px] text-slate-400">單價、手續費如需調整，請刪除後重新新增以確保試算正確</p>
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
