"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/api-fetch";

// 拍照記帳：拍發票／收據／訂單截圖 → AI 辨識 → 確認欄位、選付款方式 → 寫入
// 信用卡記到負債表（/api/debts），銀行記到銀行資金管理、現金記到收支記錄（/api/transactions），
// 寫入格式跟手動記帳完全一樣。
// 一張截圖有多筆訂單（例如團購 App 的訂單列表）時，列成清單逐筆勾選，可分開記或合併成一筆；
// 團購截圖預設現金付款。

type PayType = "CARD" | "BANK" | "CASH";

interface ParsedOrder {
  date: string;
  store: string;
  amount: number;
  currency: string;
  items: string[];
  orderNo: string;
  category: string;
  cardHint: string;
  uncertain: boolean;
}

interface Order {
  key: number;
  checked: boolean;
  date: string;
  title: string;
  amount: string;
  currency: string;
  items: string;
  orderNo: string;
  category: string;
  uncertain: boolean;
}

interface Category { id: string; name: string; type: string }

// 可能已記過的既有記錄
interface DupTx { id: string; title: string; amount: number; type: string; source: string; note: string | null; date: string; currency: string | null; categoryId: string | null; category: { name: string } | null }
interface DupDebt { id: string; category: string; amount: number; bankName: string | null; note: string | null; date: string }
interface Dups { transactions: DupTx[]; debts: DupDebt[] }
const NO_DUPS: Dups = { transactions: [], debts: [] };

const PAY_LABEL: Record<PayType, { label: string; dest: string; href: string }> = {
  CARD: { label: "💳 信用卡", dest: "負債表", href: "/debts" },
  BANK: { label: "🏦 銀行", dest: "銀行資金管理", href: "/banks" },
  CASH: { label: "💵 現金", dest: "收支記錄", href: "/transactions" },
};
const CURRENCIES = ["TWD", "CNY", "USD", "JPY", "HKD", "EUR", "KRW", "THB", "PHP"];
const today = () => new Date().toLocaleDateString("sv-SE");

// 手機照片動輒好幾 MB，先在瀏覽器縮到長邊 1600px 的 JPEG 再上傳
async function compressImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("無法讀取這張圖片，請改用 JPG 或 PNG"));
      el.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// 記錄名稱：店家・品項（#單號）
const recordTitle = (o: Pick<Order, "title" | "items" | "orderNo">) =>
  [o.title.trim(), o.items.trim()].filter(Boolean).join("・").slice(0, 70) + (o.orderNo ? `（#${o.orderNo}）` : "");

const emptyOrder = (): Order => ({ key: 0, checked: true, date: today(), title: "", amount: "", currency: "TWD", items: "", orderNo: "", category: "其他支出", uncertain: false });

export default function ReceiptPage() {
  const [image, setImage] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isGroupBuy, setIsGroupBuy] = useState(false);
  const [mergeMode, setMergeMode] = useState<"SEPARATE" | "MERGE">("SEPARATE");
  const [shared, setShared] = useState({ date: today(), category: "其他支出" }); // 多筆訂單共用的日期與分類
  const [payType, setPayType] = useState<PayType | null>(null);
  const [account, setAccount] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ dest: string; href: string; count: number } | null>(null);

  const [cards, setCards] = useState<string[]>([]);
  const [cardBank, setCardBank] = useState<Record<string, string>>({});
  const [banks, setBanks] = useState<string[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  // 外幣刷卡（單筆）：已儲存的匯率、可修改的匯率與國外交易手續費、可直接輸入的台幣金額（帳單或 App 通知）
  const [savedRates, setSavedRates] = useState<Record<string, number>>({});
  const [fx, setFx] = useState({ rate: "", feePct: "1.5", twd: "" });
  const [dups, setDups] = useState<Record<number, Dups>>({});

  const loadOptions = useCallback(async () => {
    const [debtCatRes, debtRes, bankRes, catRes, rateRes] = await Promise.all([
      fetch("/api/user-debt-categories"),
      fetch("/api/debts"),
      fetch("/api/banks/summary"),
      fetch("/api/categories"),
      fetch("/api/user-exchange-rates"),
    ]);
    const [debtCats, debts, bankList, cats, rates] = await Promise.all([debtCatRes.json(), debtRes.json(), bankRes.json(), catRes.json(), rateRes.json()]);
    setSavedRates(Object.fromEntries((Array.isArray(rates) ? rates : []).map((r: { currency: string; rate: number }) => [r.currency, r.rate])));
    const names: string[] = Array.isArray(debtCats) ? debtCats.map((c: { name: string }) => c.name) : [];
    // 信用卡排前面；各卡的發卡銀行沿用最近一筆同分類負債記錄的銀行
    setCards([...names.filter((n) => n.includes("信用卡")), ...names.filter((n) => !n.includes("信用卡"))]);
    const bankOf: Record<string, string> = {};
    for (const d of Array.isArray(debts) ? debts : []) if (d.bankName && !bankOf[d.category]) bankOf[d.category] = d.bankName;
    setCardBank(bankOf);
    setBanks(Array.isArray(bankList) ? bankList.map((b: { name: string }) => b.name) : []);
    setCategories(Array.isArray(cats) ? cats.filter((c: Category) => c.type === "EXPENSE") : []);
  }, []);

  useEffect(() => { loadOptions(); }, [loadOptions]);

  const multi = orders.length > 1;
  const single = orders.length === 1 ? orders[0] : null;
  const updateOrder = (key: number, patch: Partial<Order>) => setOrders((list) => list.map((o) => (o.key === key ? { ...o, ...patch } : o)));
  const effDate = (o: Order) => (multi ? shared.date : o.date);

  // 重複檢查：同一天同金額，或名稱／備註含同一個單號
  const dupKey = orders.map((o) => `${o.key}|${effDate(o)}|${o.amount}|${o.orderNo}`).join(",");
  useEffect(() => {
    if (orders.length === 0) return;
    const timer = setTimeout(async () => {
      const result: Record<number, Dups> = {};
      await Promise.all(orders.map(async (o) => {
        const qs = new URLSearchParams({ date: effDate(o), amount: String(parseFloat(o.amount) || 0), orderNo: o.orderNo });
        const res = await fetch(`/api/receipts/duplicates?${qs}`);
        const data = await res.json().catch(() => null);
        result[o.key] = { transactions: data?.transactions ?? [], debts: data?.debts ?? [] };
      }));
      setDups(result);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dupKey]);
  const dupsOf = (o: Order) => dups[o.key] ?? NO_DUPS;
  const dupCountOf = (o: Order) => dupsOf(o).transactions.length + dupsOf(o).debts.length;

  // 更正原本的記錄（單筆）：只改名稱／品項，不動付款方式、金額、日期與分類（備註裡可能存著付款方式或銀行名稱）
  const correctTx = async (o: Order, t: DupTx) => {
    const title = recordTitle(o);
    if (!confirm(`更正原本的記錄？\n\n名稱：${t.title} → ${title}\n（付款方式、金額、日期不變）`)) return;
    setSaving(true);
    const res = await authFetch(`/api/transactions/${t.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, amount: t.amount, type: t.type, date: t.date, note: t.note, categoryId: t.categoryId, currency: t.currency ?? "TWD" }),
    });
    setSaving(false);
    if (!res.ok) { alert("更正失敗，請稍後再試"); return; }
    setDone(t.source === "BANK" ? { dest: "銀行資金管理（已更正原本的記錄）", href: "/banks", count: 1 } : { dest: "收支記錄（已更正原本的記錄）", href: "/transactions", count: 1 });
  };
  const correctDebt = async (o: Order, d: DupDebt) => {
    const note = recordTitle(o);
    if (!confirm(`更正原本的記錄？\n\n${d.category} 的備註：${d.note ?? "（空白）"} → ${note}\n（金額、日期不變）`)) return;
    setSaving(true);
    const res = await authFetch(`/api/debts/${d.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    setSaving(false);
    if (!res.ok) { alert("更正失敗，請稍後再試"); return; }
    setDone({ dest: "負債表（已更正原本的記錄）", href: "/debts", count: 1 });
  };

  const reset = () => {
    setImage(null); setOrders([]); setIsGroupBuy(false); setMergeMode("SEPARATE"); setDups({});
    setShared({ date: today(), category: "其他支出" });
    setFx({ rate: "", feePct: "1.5", twd: "" }); setPayType(null); setAccount(""); setError(null); setDone(null);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    reset();
    setParsing(true);
    try {
      const dataUrl = await compressImage(file);
      setImage(dataUrl);
      const res = await authFetch("/api/receipts/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      const data: { isGroupBuy: boolean; orders: ParsedOrder[]; error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error || "辨識失敗");
      const list: Order[] = (data.orders.length ? data.orders : [{ date: "", store: "", amount: 0, currency: "TWD", items: [], orderNo: "", category: "其他支出", cardHint: "", uncertain: true }])
        .map((o, i) => ({
          key: i + 1,
          checked: !o.uncertain, // 被截斷、看不完整的預設不勾
          date: o.date || today(),
          title: o.store || o.items[0] || "",
          amount: o.amount ? String(o.amount) : "",
          currency: o.currency || "TWD",
          items: o.items.join("、"),
          orderNo: o.orderNo,
          category: o.category,
          uncertain: o.uncertain,
        }));
      setOrders(list);
      setIsGroupBuy(data.isGroupBuy);
      setShared({ date: data.orders.find((o) => o.date)?.date || today(), category: list[0].category });
      if (data.isGroupBuy) {
        // 團購只用現金付款，預設選好（仍可改）
        setPayType("CASH");
      } else if (data.orders[0]?.cardHint) {
        // 照片上看得出信用卡名稱時，預先選好那張卡（不分繁簡比對發卡銀行名稱的前兩個字）
        const norm = (x: string) => x.replace(/国/g, "國").replace(/银/g, "銀").replace(/信用卡|銀行|世華/g, "");
        const hint = norm(data.orders[0].cardHint);
        const hit = cards.find((c) => c.includes("信用卡") && hint.includes(norm(c).slice(0, 2)));
        if (hit) { setPayType("CARD"); setAccount(hit); }
      }
    } catch (e) {
      setError((e as Error).message);
      setOrders([{ ...emptyOrder(), key: 1 }]); // 辨識失敗也讓會員手動填
    } finally {
      setParsing(false);
    }
  };

  // ---- 要寫入的記錄 ----
  const checkedOrders = orders.filter((o) => o.checked);
  const merged = multi && mergeMode === "MERGE";
  type Rec = { date: string; title: string; amount: number; currency: string; category: string };
  const records: Rec[] = !multi
    ? single ? [{ date: single.date, title: recordTitle(single), amount: parseFloat(single.amount) || 0, currency: single.currency, category: single.category }] : []
    : merged
      ? (() => {
          const store = checkedOrders[0]?.title.trim() || "";
          const items = checkedOrders.map((o) => o.items.trim() || o.title.trim()).filter(Boolean).join("、");
          const nos = checkedOrders.map((o) => o.orderNo).filter(Boolean).map((n) => `#${n}`).join(" ");
          return checkedOrders.length ? [{
            date: shared.date,
            title: `${store}（${items}）`.slice(0, 70) + (nos ? ` ${nos}` : ""),
            amount: checkedOrders.reduce((s, o) => s + (parseFloat(o.amount) || 0), 0),
            currency: checkedOrders[0].currency,
            category: shared.category,
          }] : [];
        })()
      : checkedOrders.map((o) => ({ date: shared.date, title: recordTitle(o), amount: parseFloat(o.amount) || 0, currency: o.currency, category: shared.category }));
  const total = records.reduce((s, r) => s + r.amount, 0);

  const accounts = payType === "CARD" ? cards : payType === "BANK" ? banks : [];
  // 外幣刷卡（只支援單筆）：負債表只記台幣。估算台幣＝外幣 × 匯率 ×（1＋國外交易手續費）；有填台幣金額就以填的為準
  const foreignCard = payType === "CARD" && records.some((r) => r.currency !== "TWD");
  const singleAmount = records[0]?.amount ?? 0;
  const singleCurrency = records[0]?.currency ?? "TWD";
  const fxRate = parseFloat(fx.rate) || savedRates[singleCurrency] || 0;
  const fxFee = parseFloat(fx.feePct) || 0;
  const twdEstimate = Math.round(singleAmount * fxRate * (1 + fxFee / 100));
  const twdActual = parseFloat(fx.twd) || 0;
  const cardTwd = twdActual > 0 ? twdActual : twdEstimate;
  const canSave =
    records.length > 0 && records.every((r) => r.amount > 0 && !!r.date && !!r.title.trim()) &&
    !!payType && (payType === "CASH" || !!account) &&
    (!foreignCard || (records.length === 1 && cardTwd > 0));
  const dupWarnCount = orders.filter((o) => (!multi || o.checked) && dupCountOf(o) > 0).length;

  const save = async () => {
    if (!canSave || !payType) return;
    if (dupWarnCount > 0 && !confirm(`有 ${dupWarnCount} 筆可能已經記過了（同一天同金額或同單號）。\n確定還是要新增嗎？`)) return;
    const lines = records.map((r) => `${r.date}　${r.title}　${r.currency} ${r.amount.toLocaleString()}`).join("\n");
    if (!confirm(`確認記帳 ${records.length} 筆？\n\n${lines}${foreignCard ? `\n（記台幣 ${cardTwd.toLocaleString()}${twdActual > 0 ? "" : "，估算"}）` : ""}\n\n付款：${PAY_LABEL[payType].label}${account ? `（${account}）` : ""}\n記到：${PAY_LABEL[payType].dest}`)) return;
    setSaving(true);
    let ok = 0;
    for (const r of records) {
      const categoryId = categories.find((c) => c.name === r.category)?.id ?? "";
      const res = payType === "CARD"
        ? await authFetch("/api/debts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              category: account, amount: foreignCard ? cardTwd : r.amount, bankName: cardBank[account] ?? "", date: r.date,
              note: [r.title, foreignCard ? (twdActual > 0
                ? `原幣 ${r.amount} ${r.currency}，實際台幣（帳單／通知）`
                : `原幣 ${r.amount} ${r.currency}，估算台幣（匯率 ${fxRate}、手續費 ${fxFee}%，請以帳單更正）`) : ""].filter(Boolean).join("・"),
            }),
          })
        : await authFetch("/api/transactions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: r.title, amount: r.amount, type: "EXPENSE", date: r.date, categoryId, currency: r.currency,
              note: payType === "BANK" ? `支付:銀行:${account}` : "支付:現金",
              source: payType === "BANK" ? "BANK" : "CASH",
            }),
          });
      if (res.ok) ok++;
    }
    setSaving(false);
    if (ok < records.length) alert(`有 ${records.length - ok} 筆記帳失敗，請到${PAY_LABEL[payType].dest}確認`);
    if (ok > 0) setDone({ dest: PAY_LABEL[payType].dest, href: PAY_LABEL[payType].href, count: ok });
  };

  const input = "w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors";
  const categoryOptions = (current: string) =>
    [...new Set([current, ...categories.map((c) => c.name).filter((n) => !["銀行", "第三方", "投資"].includes(n))])];

  return (
    <div className="w-full max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">拍照記帳</h1>
        <p className="text-slate-500 text-sm mt-1">拍發票、收據或訂單截圖，AI 自動讀出金額，選好付款方式就記好帳</p>
      </div>

      {done ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center space-y-4">
          <div className="text-4xl">✅</div>
          <p className="text-slate-800 font-semibold">已記到「{done.dest}」{done.count > 1 ? `，共 ${done.count} 筆` : ""}</p>
          <div className="flex justify-center gap-2">
            <button type="button" onClick={reset} className="px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700">再記一筆</button>
            <Link href={done.href} className="px-4 py-2 rounded-lg text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50">查看{done.dest.replace(/（.*）/, "")}</Link>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* 拍照／選照片 */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col items-center justify-center gap-1 py-5 rounded-xl border-2 border-dashed border-indigo-200 text-indigo-600 cursor-pointer hover:bg-indigo-50">
                <span className="text-2xl">📷</span><span className="text-sm font-semibold">拍照</span>
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
              <label className="flex flex-col items-center justify-center gap-1 py-5 rounded-xl border-2 border-dashed border-slate-200 text-slate-600 cursor-pointer hover:bg-slate-50">
                <span className="text-2xl">🖼️</span><span className="text-sm font-semibold">從相簿選／截圖</span>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
            </div>
            {image && <img src={image} alt="收據照片" className="mt-4 max-h-72 mx-auto rounded-lg border border-slate-100" />}
            {parsing && <p className="mt-3 text-center text-sm text-indigo-600">AI 辨識中…</p>}
            {error && <p className="mt-3 text-center text-sm text-red-500">{error}，請手動填寫下面的欄位</p>}
          </div>

          {/* 單筆：完整欄位 */}
          {single && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
              <h2 className="font-semibold text-slate-900">① 確認內容 <span className="text-xs font-normal text-slate-400">辨識結果可以直接修改</span></h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">日期</label>
                  <input type="date" value={single.date} onChange={(e) => updateOrder(single.key, { date: e.target.value })} className={input} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">分類</label>
                  <select value={single.category} onChange={(e) => updateOrder(single.key, { category: e.target.value })} className={input}>
                    {categoryOptions(single.category).map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">店家／名稱</label>
                <input value={single.title} onChange={(e) => updateOrder(single.key, { title: e.target.value })} placeholder="例如：全聯" className={input} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">金額</label>
                  <input type="number" min="0" step="any" value={single.amount} onChange={(e) => updateOrder(single.key, { amount: e.target.value })} className={input} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">幣別</label>
                  <select value={single.currency} onChange={(e) => updateOrder(single.key, { currency: e.target.value })} className={input}>
                    {(CURRENCIES.includes(single.currency) ? CURRENCIES : [...CURRENCIES, single.currency]).map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">品項</label>
                  <input value={single.items} onChange={(e) => updateOrder(single.key, { items: e.target.value })} className={input} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">單號（選填）</label>
                  <input value={single.orderNo} onChange={(e) => updateOrder(single.key, { orderNo: e.target.value })} className={input} />
                </div>
              </div>
            </div>
          )}

          {/* 單筆：重複提醒＋更正 */}
          {single && dupCountOf(single) > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-3">
              <h2 className="font-semibold text-amber-800">⚠️ 這張可能已經記過了</h2>
              <p className="text-xs text-amber-700">同一天同金額、或同單號已經有下面的記錄。如果是同一筆，請按「更正這筆」，用辨識內容更正名稱與品項，不會重複記帳。</p>
              <div className="space-y-2">
                {dupsOf(single).debts.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-3 bg-white rounded-lg px-3.5 py-2.5 text-sm">
                    <span className="text-slate-700">負債表・{d.category}・{d.amount.toLocaleString()}・備註「{d.note || "空白"}」</span>
                    <button type="button" disabled={saving} onClick={() => correctDebt(single, d)}
                      className="shrink-0 text-xs font-semibold text-amber-700 border border-amber-300 rounded-lg px-2.5 py-1 hover:bg-amber-100 disabled:opacity-50">更正這筆</button>
                  </div>
                ))}
                {dupsOf(single).transactions.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-3 bg-white rounded-lg px-3.5 py-2.5 text-sm">
                    <span className="text-slate-700">{t.source === "BANK" ? "銀行資金管理" : "收支記錄"}・{t.title}・{t.amount.toLocaleString()}{t.currency && t.currency !== "TWD" ? ` ${t.currency}` : ""}</span>
                    <button type="button" disabled={saving} onClick={() => correctTx(single, t)}
                      className="shrink-0 text-xs font-semibold text-amber-700 border border-amber-300 rounded-lg px-2.5 py-1 hover:bg-amber-100 disabled:opacity-50">更正這筆</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 多筆訂單：清單 */}
          {multi && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
              <h2 className="font-semibold text-slate-900">
                ① 確認訂單 <span className="text-xs font-normal text-slate-400">共 {orders.length} 筆{isGroupBuy ? "・團購" : ""}，勾選要記的訂單</span>
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">日期</label>
                  <input type="date" value={shared.date} onChange={(e) => setShared({ ...shared, date: e.target.value })} className={input} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">分類</label>
                  <select value={shared.category} onChange={(e) => setShared({ ...shared, category: e.target.value })} className={input}>
                    {categoryOptions(shared.category).map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                {orders.map((o) => (
                  <div key={o.key} className={`rounded-xl border px-3.5 py-3 space-y-2 ${o.checked ? "border-indigo-200 bg-indigo-50/30" : "border-slate-200 opacity-70"}`}>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={o.checked} onChange={(e) => updateOrder(o.key, { checked: e.target.checked })} />
                      <span className="font-mono text-xs text-slate-500">{o.orderNo ? `#${o.orderNo}` : "（無單號）"}</span>
                      {o.uncertain && <span className="text-[10px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">請確認：內容不完整</span>}
                      {dupCountOf(o) > 0 && (
                        <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded"
                          title={[...dupsOf(o).transactions.map((t) => `${t.title} ${t.amount}`), ...dupsOf(o).debts.map((d) => `${d.category} ${d.note ?? ""} ${d.amount}`)].join("\n")}>
                          可能已記過
                        </span>
                      )}
                    </label>
                    <div className="grid grid-cols-6 gap-2">
                      <input value={o.title} onChange={(e) => updateOrder(o.key, { title: e.target.value })} placeholder="店家" className={`${input} col-span-2`} />
                      <input value={o.items} onChange={(e) => updateOrder(o.key, { items: e.target.value })} placeholder="品項" className={`${input} col-span-3`} />
                      <input type="number" min="0" step="any" value={o.amount} onChange={(e) => updateOrder(o.key, { amount: e.target.value })} placeholder="金額" className={`${input} col-span-1 px-2`} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
                {([["SEPARATE", "每筆分開記"], ["MERGE", "合併成一筆"]] as const).map(([m, label]) => (
                  <button key={m} type="button" onClick={() => setMergeMode(m)}
                    className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors ${mergeMode === m ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="bg-slate-50 rounded-xl px-4 py-3 text-sm space-y-1">
                {records.map((r, i) => (
                  <div key={i} className="flex justify-between gap-3"><span className="text-slate-600 truncate">{r.title}</span><span className="shrink-0 font-semibold text-slate-800">{r.amount.toLocaleString()}</span></div>
                ))}
                {records.length > 1 && <div className="flex justify-between pt-1 border-t border-slate-200 font-semibold"><span>合計 {records.length} 筆</span><span>{total.toLocaleString()}</span></div>}
                {records.length === 0 && <p className="text-slate-400">沒有勾選任何訂單</p>}
              </div>
            </div>
          )}

          {orders.length > 0 && (
            <>
              {/* 付款方式 */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
                <h2 className="font-semibold text-slate-900">② 付款方式{isGroupBuy && payType === "CASH" && <span className="ml-2 text-xs font-normal text-slate-400">團購預設現金</span>}</h2>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(PAY_LABEL) as PayType[]).map((t) => (
                    <button key={t} type="button" onClick={() => { setPayType(t); setAccount(""); }}
                      className={`py-2.5 rounded-lg text-sm font-semibold transition-colors ${payType === t ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                      {PAY_LABEL[t].label}
                    </button>
                  ))}
                </div>
                {payType && payType !== "CASH" && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">{payType === "CARD" ? "哪一張信用卡" : "哪一家銀行"}</label>
                    <div className="flex flex-wrap gap-2">
                      {accounts.map((a) => (
                        <button key={a} type="button" onClick={() => setAccount(a)}
                          className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${account === a ? "bg-indigo-600 border-indigo-600 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                          {a}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {foreignCard && records.length > 1 && (
                  <p className="text-xs text-amber-600">外幣刷卡請一次記一筆（合併成一筆，或只勾選一筆訂單）</p>
                )}
                {foreignCard && records.length === 1 && (
                  <div className="bg-slate-50 rounded-xl px-4 py-3 space-y-3">
                    <p className="text-xs text-slate-500">外幣刷卡：負債表記台幣。可以先用匯率估算，或直接輸入帳單／App 通知上的台幣金額</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">匯率（1 {singleCurrency} = ? 台幣）</label>
                        <input type="number" min="0" step="any" value={fx.rate} onChange={(e) => setFx({ ...fx, rate: e.target.value })}
                          placeholder={savedRates[singleCurrency] ? `已儲存 ${savedRates[singleCurrency]}` : "請輸入匯率"} className={input} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">國外交易手續費（%）</label>
                        <input type="number" min="0" step="any" value={fx.feePct} onChange={(e) => setFx({ ...fx, feePct: e.target.value })} className={input} />
                      </div>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">估算台幣</span>
                      <span className="font-semibold text-slate-800">{fxRate > 0 ? `NT$${twdEstimate.toLocaleString()}` : "（請先輸入匯率）"}</span>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">實際台幣金額（帳單或 App 通知，有的話直接填）</label>
                      <input type="number" min="0" step="any" value={fx.twd} onChange={(e) => setFx({ ...fx, twd: e.target.value })}
                        placeholder={fxRate > 0 ? `留空就用估算 ${twdEstimate.toLocaleString()}` : "例如：258"} className={input} />
                    </div>
                    <p className="text-xs font-semibold text-indigo-600">會記到負債表：NT${cardTwd > 0 ? cardTwd.toLocaleString() : "—"}（{twdActual > 0 ? "實際金額" : "估算，帳單出來後可到負債表更正"}）</p>
                  </div>
                )}
                {payType && <p className="text-xs text-slate-400">會記到「{PAY_LABEL[payType].dest}」{records.length > 1 ? `，共 ${records.length} 筆` : ""}</p>}
              </div>

              <div className="flex gap-2">
                <button type="button" onClick={reset} className="flex-1 py-3 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50">重新拍</button>
                <button type="button" onClick={save} disabled={!canSave || saving}
                  className="flex-[2] py-3 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
                  {saving ? "記帳中…" : records.length > 1 ? `確認記帳（${records.length} 筆）` : "確認記帳"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
