"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/api-fetch";

// 拍照記帳：拍發票／收據 → AI 辨識 → 確認欄位、選付款方式 → 寫入
// 信用卡記到負債表（/api/debts），銀行記到銀行資金管理、現金記到收支記錄（/api/transactions），
// 寫入格式跟手動記帳完全一樣。

type PayType = "CARD" | "BANK" | "CASH";

interface Parsed {
  date: string;
  store: string;
  amount: number;
  currency: string;
  items: string[];
  category: string;
  cardHint: string;
}

interface Category { id: string; name: string; type: string }

const PAY_LABEL: Record<PayType, { label: string; dest: string; href: string }> = {
  CARD: { label: "💳 信用卡", dest: "負債表", href: "/debts" },
  BANK: { label: "🏦 銀行", dest: "銀行資金管理", href: "/banks" },
  CASH: { label: "💵 現金", dest: "收支記錄", href: "/transactions" },
};
const CURRENCIES = ["TWD", "CNY", "USD", "JPY", "HKD", "EUR", "KRW", "THB", "PHP"];

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

export default function ReceiptPage() {
  const [image, setImage] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ date: "", title: "", amount: "", currency: "TWD", note: "", category: "其他支出" });
  const [parsed, setParsed] = useState(false);
  const [payType, setPayType] = useState<PayType | null>(null);
  const [account, setAccount] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ dest: string; href: string } | null>(null);

  const [cards, setCards] = useState<string[]>([]);
  const [cardBank, setCardBank] = useState<Record<string, string>>({});
  const [banks, setBanks] = useState<string[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const loadOptions = useCallback(async () => {
    const [debtCatRes, debtRes, bankRes, catRes] = await Promise.all([
      fetch("/api/user-debt-categories"),
      fetch("/api/debts"),
      fetch("/api/banks/summary"),
      fetch("/api/categories"),
    ]);
    const [debtCats, debts, bankList, cats] = await Promise.all([debtCatRes.json(), debtRes.json(), bankRes.json(), catRes.json()]);
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

  const reset = () => {
    setImage(null); setParsed(false); setPayType(null); setAccount(""); setError(null); setDone(null);
    setForm({ date: "", title: "", amount: "", currency: "TWD", note: "", category: "其他支出" });
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
      const data: Parsed & { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error || "辨識失敗");
      setForm({
        date: data.date || new Date().toLocaleDateString("sv-SE"),
        title: data.store || data.items[0] || "",
        amount: data.amount ? String(data.amount) : "",
        currency: data.currency || "TWD",
        note: data.items.join("、"),
        category: data.category,
      });
      // 照片上看得出信用卡名稱時，預先選好那張卡（仍可改）
      if (data.cardHint) {
        // 不分繁簡比對（照片常是「國泰世華」，負債分類可能是「国泰信用卡」），比對發卡銀行名稱的前兩個字
        const norm = (x: string) => x.replace(/国/g, "國").replace(/银/g, "銀").replace(/信用卡|銀行|世華/g, "");
        const hint = norm(data.cardHint);
        const hit = cards.find((c) => c.includes("信用卡") && hint.includes(norm(c).slice(0, 2)));
        if (hit) { setPayType("CARD"); setAccount(hit); }
      }
      setParsed(true);
    } catch (e) {
      setError((e as Error).message);
      setForm((f) => ({ ...f, date: new Date().toLocaleDateString("sv-SE") }));
      setParsed(true); // 辨識失敗也讓會員手動填
    } finally {
      setParsing(false);
    }
  };

  const accounts = payType === "CARD" ? cards : payType === "BANK" ? banks : [];
  const amount = parseFloat(form.amount) || 0;
  const canSave = parsed && amount > 0 && !!form.date && !!form.title.trim() && !!payType && (payType === "CASH" || !!account);

  const save = async () => {
    if (!canSave || !payType) return;
    if (!confirm(`確認記帳？\n\n${form.date}　${form.title}\n${form.currency} ${amount.toLocaleString()}\n付款：${PAY_LABEL[payType].label}${account ? `（${account}）` : ""}\n記到：${PAY_LABEL[payType].dest}`)) return;
    setSaving(true);
    const categoryId = categories.find((c) => c.name === form.category)?.id ?? "";
    const note = form.note.trim();
    let res: Response;
    if (payType === "CARD") {
      res = await authFetch("/api/debts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: account, amount, bankName: cardBank[account] ?? "", date: form.date, note: note ? `${form.title}・${note}` : form.title }),
      });
    } else {
      res = await authFetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(), amount, type: "EXPENSE", date: form.date, categoryId, currency: form.currency,
          note: payType === "BANK" ? `支付:銀行:${account}` : "支付:現金",
          source: payType === "BANK" ? "BANK" : "CASH",
        }),
      });
    }
    setSaving(false);
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      alert(err?.error || "記帳失敗，請稍後再試");
      return;
    }
    setDone({ dest: PAY_LABEL[payType].dest, href: PAY_LABEL[payType].href });
  };

  const input = "w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors";

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">拍照記帳</h1>
        <p className="text-slate-500 text-sm mt-1">拍發票或收據，AI 自動讀出金額，選好付款方式就記好帳</p>
      </div>

      {done ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center space-y-4">
          <div className="text-4xl">✅</div>
          <p className="text-slate-800 font-semibold">已記到「{done.dest}」</p>
          <div className="flex justify-center gap-2">
            <button type="button" onClick={reset} className="px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700">再記一筆</button>
            <Link href={done.href} className="px-4 py-2 rounded-lg text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50">查看{done.dest}</Link>
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
                <span className="text-2xl">🖼️</span><span className="text-sm font-semibold">從相簿選</span>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
            </div>
            {image && <img src={image} alt="收據照片" className="mt-4 max-h-72 mx-auto rounded-lg border border-slate-100" />}
            {parsing && <p className="mt-3 text-center text-sm text-indigo-600">AI 辨識中…</p>}
            {error && <p className="mt-3 text-center text-sm text-red-500">{error}，請手動填寫下面的欄位</p>}
          </div>

          {parsed && (
            <>
              {/* 辨識結果（可修改） */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
                <h2 className="font-semibold text-slate-900">① 確認內容 <span className="text-xs font-normal text-slate-400">辨識結果可以直接修改</span></h2>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">日期</label>
                    <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={input} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">分類</label>
                    <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={input}>
                      {[...new Set([form.category, ...categories.map((c) => c.name).filter((n) => !["銀行", "第三方", "投資"].includes(n))])].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">店家／名稱</label>
                  <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="例如：全聯" className={input} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">金額</label>
                    <input type="number" min="0" step="any" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={input} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">幣別</label>
                    <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className={input}>
                      {(CURRENCIES.includes(form.currency) ? CURRENCIES : [...CURRENCIES, form.currency]).map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">品項／備註</label>
                  <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={input} />
                </div>
              </div>

              {/* 付款方式 */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
                <h2 className="font-semibold text-slate-900">② 付款方式</h2>
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
                {payType === "CARD" && form.currency !== "TWD" && (
                  <p className="text-xs text-amber-600">負債表只記台幣金額，請把金額改成信用卡帳單上的台幣金額，並把幣別改成 TWD</p>
                )}
                {payType && <p className="text-xs text-slate-400">會記到「{PAY_LABEL[payType].dest}」</p>}
              </div>

              <div className="flex gap-2">
                <button type="button" onClick={reset} className="flex-1 py-3 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50">重新拍</button>
                <button type="button" onClick={save} disabled={!canSave || saving || (payType === "CARD" && form.currency !== "TWD")}
                  className="flex-[2] py-3 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
                  {saving ? "記帳中…" : "確認記帳"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
