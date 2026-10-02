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
  createdAt: string;
}

// 暫計帳：用持有的 USDT 支付的項目（例如自動交易軟體），新增時自動扣除持有數量，賺回後可回補
interface SuspenseEntry {
  id: string;
  name: string;
  code: string;
  quantity: number;
  unitCost: number;
  date: string;
  note?: string | null;
  deductInvestmentId?: string | null;
  reversedAt?: string | null;
  reverseInvestmentId?: string | null;
}

const SUSPENSE_CODE = "USDT";
const EMPTY_SUSPENSE_FORM = { name: "", quantity: "", date: "", note: "" };

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
const USDT_CODE = "USDT";

type SortKey = "DATE_DESC" | "DATE_ASC" | "AMOUNT_DESC" | "COIN";
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "DATE_DESC", label: "日期（新→舊）" },
  { value: "DATE_ASC", label: "日期（舊→新）" },
  { value: "AMOUNT_DESC", label: "金額（大→小）" },
  { value: "COIN", label: "幣種" },
];

const EMPTY_ADD_FORM = {
  mode: "TRADE" as "TRADE" | "DIVIDEND" | "DEPOSIT",
  depositAmount: "",
  twdMode: "DEPOSIT" as "DEPOSIT" | "CALIBRATE",
  twdActual: "",
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
  // 即時台幣價格（key 為大寫代碼），每次進入頁面重新抓取
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [pricesAt, setPricesAt] = useState<string | null>(null);
  const [pricesFailed, setPricesFailed] = useState(false);

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
    const [invRes, exchangeRes, suspenseRes] = await Promise.all([
      fetch("/api/investments?type=CRYPTO"),
      fetch("/api/user-exchanges"),
      fetch("/api/suspense-entries"),
    ]);
    const [invData, exchangeData, suspenseData] = await Promise.all([invRes.json(), exchangeRes.json(), suspenseRes.json()]);
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
  const marketMissing = holdings.filter((h) => marketValueOf(h) == null).length;
  // 持有成本：目前持有部位的投入成本，跟資產總攬的虛擬貨幣同一個數字
  // 暫計帳（待賺回）：從 USDT 扣除、尚未回補的部分，持有成本與合計都把它算進去
  const suspenseCost = suspenseOpenCost(suspenseEntries);
  const suspenseQty = suspenseEntries.filter((e) => !e.reversedAt).reduce((s, e) => s + e.quantity, 0);
  const suspenseMarket = livePrice(SUSPENSE_CODE) != null ? suspenseQty * livePrice(SUSPENSE_CODE)! : null;
  const netInvested = holdings.reduce((s, h) => s + h.cost, 0) + suspenseCost;
  const buyCount = investments.filter((i) => i.action === "BUY").length;
  const sellCount = investments.filter((i) => i.action === "SELL").length;

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
  // 台幣餘額校正記錄（備註以 TWD_CALIBRATE_NOTE 開頭）
  const TWD_CALIBRATE_NOTE = "台幣餘額校正";
  // 暫計帳自動產生的扣除／回補記錄：只能從暫計帳操作，投資記錄裡不提供編輯／刪除
  const suspenseDeductIds = new Set(suspenseEntries.map((e) => e.deductInvestmentId).filter(Boolean));
  const suspenseReverseIds = new Set(suspenseEntries.map((e) => e.reverseInvestmentId).filter(Boolean));
  const isSuspenseRecord = (i: Investment) => suspenseDeductIds.has(i.id) || suspenseReverseIds.has(i.id);
  const recordLabel = (i: Investment) =>
    suspenseDeductIds.has(i.id) ? { text: "暫計帳扣除", cls: "bg-violet-100 text-violet-700" }
    : suspenseReverseIds.has(i.id) ? { text: "暫計帳回補", cls: "bg-violet-100 text-violet-700" }
    : isTwd(i) && i.note?.startsWith(TWD_CALIBRATE_NOTE) ? { text: "台幣調帳", cls: "bg-violet-100 text-violet-700" }
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
  // 單價、總金額都沒填時，用這個幣目前的平均成本當單價（USDT 計價時換算成 USDT），只輸入顆數就能記帳
  const coinHolding = holdings.find((h) => h.code === tradeCode);
  const coinAvgTwd = coinHolding && coinHolding.quantity > 0 ? coinHolding.cost / coinHolding.quantity : 0;
  const autoPrice = quote === "USDT" ? (usdtUnitCost > 0 ? coinAvgTwd / usdtUnitCost : 0) : coinAvgTwd;
  const priceIsAuto = addForm.price === "" && addForm.override === "" && autoPrice > 0;
  const price = parseFloat(addForm.price) || (priceIsAuto ? autoPrice : 0);
  const fee = parseFloat(addForm.fee) || 0;
  const principal = quantity * price;
  const calcSubtotal = addForm.action === "BUY" ? principal + fee : principal - fee;
  // 實際金額：如果填了就以此為準（交易所實際扣款/入帳金額可能與試算有落差），否則採自動試算結果
  const subtotal = addForm.override !== "" ? (parseFloat(addForm.override) || 0) : calcSubtotal;

  const resetAddForm = () => {
    setAddForm(EMPTY_ADD_FORM);
    setAddExchangeInput("");
    setAddExchangeOpen(false);
  };

  const openAdd = () => { resetAddForm(); setShowAddModal(true); };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();

    if (addForm.mode === "DEPOSIT" && addForm.twdMode === "CALIBRATE") {
      // 校正餘額：輸入交易所實際的台幣金額，補一筆差額（多了記入帳、少了記扣款），讓帳上餘額等於實際金額
      if (addForm.twdActual === "" || (parseFloat(addForm.twdActual) || 0) < 0) {
        alert("請填寫交易所實際的台幣餘額");
        return;
      }
      const actual = parseFloat(addForm.twdActual) || 0;
      const diff = Math.round((actual - twdBalance) * 100) / 100;
      if (diff === 0) {
        alert("帳上餘額已經等於實際金額，不需要校正");
        return;
      }
      setAddSaving(true);
      const res = await postInvestment({
        name: "台幣", code: TWD_CODE, date: addForm.date, action: diff > 0 ? "BUY" : "SELL", broker: addForm.broker,
        quantity: Math.abs(diff), price: 1, amount: diff,
        note: `${TWD_CALIBRATE_NOTE}：${fmt(twdBalance)} → ${fmt(actual)}${addForm.note ? `（${addForm.note}）` : ""}`,
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
        fee: addForm.fee || undefined,
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
    // 連動交易所台幣餘額：買進從台幣餘額扣款（餘額不足只扣到 0，其餘視為從外部付款），賣出款項存入台幣餘額
    const coin = addForm.code.trim() || addForm.name.trim() || "虛擬貨幣";
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
      ? { name: entry.name, quantity: String(entry.quantity), date: entry.date.split("T")[0], note: entry.note ?? "" }
      : { ...EMPTY_SUSPENSE_FORM, date: new Date().toLocaleDateString("sv-SE") });
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

  const handleDelete = async (id: string) => {
    if (!confirm("確定要刪除這筆投資記錄？")) return;
    await authFetch(`/api/investments/${id}`, { method: "DELETE" });
    fetchAll();
  };

  return (
    <div className="max-w-4xl">
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
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-50">
          <h2 className="font-semibold text-slate-900">持有狀況</h2>
          <span className="text-[11px] text-slate-400">
            {pricesFailed ? "即時價格暫時抓不到" : pricesAt ? `價格更新於 ${new Date(pricesAt).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}` : "價格更新中…"}
          </span>
        </div>
        {holdings.length === 0 ? (
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
              <tbody className="divide-y divide-slate-50">
                {holdings.map((h) => (
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
                      {marketValueOf(h) != null ? (
                        <span className={marketValueOf(h)! >= h.cost ? "text-red-500" : "text-emerald-600"}>{fmt(marketValueOf(h)!)}</span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                ))}
                {suspenseQty > 0 && (
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
                )}
              </tbody>
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
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} aria-label="排序方式"
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
            {sortedInvestments.map((inv) => (
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
                      {new Date(inv.date ?? inv.createdAt).toLocaleDateString("zh-TW")}
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
      </div>

      {/* 新增記錄 Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-slate-900 mb-5">新增虛擬貨幣記錄</h2>
            <form onSubmit={handleAdd} className="space-y-4">
              {/* 買進/賣出/配息 */}
              <div className="flex gap-2">
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
              </div>
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
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{addForm.mode === "DIVIDEND" ? "配息日期" : addForm.mode === "DEPOSIT" ? (addForm.twdMode === "CALIBRATE" ? "校正日期" : "入金日期") : "交易日期"}</label>
                <input required type="date" value={addForm.date}
                  onChange={(e) => setAddForm({ ...addForm, date: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>

              <div>
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
              </div>

              {addForm.mode === "DEPOSIT" && (
                <>
                  <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
                    {([["DEPOSIT", "入金"], ["CALIBRATE", "校正餘額"]] as const).map(([m, label]) => (
                      <button key={m} type="button" onClick={() => setAddForm({ ...addForm, twdMode: m })}
                        className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                          addForm.twdMode === m ? "bg-white text-sky-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                        }`}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {addForm.twdMode === "DEPOSIT" ? (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">入金金額（台幣）</label>
                      <input required type="number" min="0" step="any" value={addForm.depositAmount}
                        onChange={(e) => setAddForm({ ...addForm, depositAmount: e.target.value })} placeholder="例如：10000"
                        className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                      <p className="text-[11px] text-slate-400 mt-1">目前交易所台幣餘額：{fmt(twdBalance)}</p>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">交易所實際台幣餘額</label>
                      <input required type="number" min="0" step="any" value={addForm.twdActual}
                        onChange={(e) => setAddForm({ ...addForm, twdActual: e.target.value })} placeholder="例如：3520"
                        className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                      {(() => {
                        const actual = parseFloat(addForm.twdActual);
                        const diff = Number.isFinite(actual) ? Math.round((actual - twdBalance) * 100) / 100 : null;
                        return (
                          <div className="bg-slate-50 rounded-xl px-4 py-3 space-y-1.5 mt-2">
                            <div className="flex justify-between text-xs text-slate-500">
                              <span>目前帳上餘額</span><span>{fmt(twdBalance)}</span>
                            </div>
                            <div className="flex justify-between text-sm font-semibold pt-1.5 border-t border-slate-200">
                              <span className="text-slate-900">校正差額</span>
                              <span className={diff === null || diff === 0 ? "text-slate-400" : diff > 0 ? "text-sky-600" : "text-slate-600"}>
                                {diff === null ? "—" : diff === 0 ? "無差額" : `${diff > 0 ? "+" : "−"}${fmt(Math.abs(diff))}`}
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                      <p className="text-[11px] text-slate-400 mt-1">
                        系統會補一筆差額讓帳上餘額等於實際金額。這筆差額會直接增減虛擬貨幣資產，不會動到銀行記錄
                      </p>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">備註（選填）</label>
                    <input value={addForm.note} onChange={(e) => setAddForm({ ...addForm, note: e.target.value })}
                      placeholder={addForm.twdMode === "CALIBRATE" ? "例如：補登早期交易差額" : "例如：玉山銀行轉入"} className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
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
                <label className="block text-sm font-medium text-slate-700 mb-1.5">手續費（選填，{quote === "USDT" ? "USDT" : "台幣"}）</label>
                <input type="number" min="0" step="any" value={addForm.fee}
                  onChange={(e) => setAddForm({ ...addForm, fee: e.target.value })} placeholder="例如：50"
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
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
                  <span>手續費</span><span>{fmtQuote(fee)}</span>
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
