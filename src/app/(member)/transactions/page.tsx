"use client";

import { useEffect, useState, useCallback } from "react";

interface Category {
  id: string;
  name: string;
  type: string;
  icon?: string;
  color?: string;
}

interface Transaction {
  id: string;
  title: string;
  amount: number;
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  date: string;
  note?: string;
  category?: Category;
  categoryId?: string;
}

interface UserBank {
  id: string;
  name: string;
}

const DEFAULT_BANKS = [
  "台灣銀行", "合作金庫", "第一銀行", "華南銀行", "彰化銀行",
  "兆豐銀行", "土地銀行", "國泰世華", "玉山銀行", "中國信託",
  "台北富邦", "永豐銀行", "台新銀行", "遠東銀行", "上海商銀",
  "星展銀行", "渣打銀行", "中華郵政",
];

const THIRD_PARTY = [
  "LINE Pay", "街口支付", "悠遊付", "Pi拍錢包",
  "全盈+PAY", "Apple Pay", "Google Pay", "台灣Pay",
  "橘子Pay", "一卡通Money", "其他",
];

type PaymentMethod = "" | "現金" | "銀行" | "第三方支付";

const EMPTY_FORM = {
  title: "",
  amount: "",
  type: "EXPENSE" as "INCOME" | "EXPENSE" | "TRANSFER",
  date: new Date().toISOString().split("T")[0],
  note: "",
  categoryId: "",
};

const EMPTY_TRANSFER = {
  fromType: "" as PaymentMethod,
  fromDetail: "",
  toType: "" as PaymentMethod,
  toDetail: "",
};

// 解析支付方式 note
function parsePaymentNote(note: string) {
  if (!note.startsWith("支付:")) return { pm: "" as PaymentMethod, detail: "", rest: note };
  const parts = note.split(":");
  return { pm: parts[1] as PaymentMethod, detail: parts[2] ?? "", rest: "" };
}

// 解析調帳 note
function parseTransferNote(note: string) {
  // 格式: "FROM:[type]:[detail]|TO:[type]:[detail]"
  const match = note.match(/FROM:([^:]+):?([^|]*)\|TO:([^:]+):?(.*)/);
  if (!match) return EMPTY_TRANSFER;
  return {
    fromType: match[1] as PaymentMethod,
    fromDetail: match[2] ?? "",
    toType: match[3] as PaymentMethod,
    toDetail: match[4] ?? "",
  };
}

function buildTransferNote(t: typeof EMPTY_TRANSFER) {
  return `FROM:${t.fromType}:${t.fromDetail}|TO:${t.toType}:${t.toDetail}`;
}

function displayTransferNote(note: string) {
  const t = parseTransferNote(note);
  const from = t.fromDetail ? `${t.fromType} (${t.fromDetail})` : t.fromType;
  const to = t.toDetail ? `${t.toType} (${t.toDetail})` : t.toType;
  return `${from} → ${to}`;
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [userBanks, setUserBanks] = useState<UserBank[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [allIncome, setAllIncome] = useState(0);
  const [allExpense, setAllExpense] = useState(0);
  const [showList, setShowList] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [transfer, setTransfer] = useState(EMPTY_TRANSFER);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("");
  const [paymentDetail, setPaymentDetail] = useState("");
  const [bankName, setBankName] = useState(""); // for 銀行 category
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState({ type: "", month: "" });
  const [investmentType, setInvestmentType] = useState<"" | "STOCK" | "FUND" | "FOREX" | "CRYPTO" | "GOLD">("");
  // 申請新增銀行
  const [addBankInput, setAddBankInput] = useState("");
  const [addBankTarget, setAddBankTarget] = useState<"category" | "payment" | "fromDetail" | "toDetail" | null>(null);
  const [addBankLoading, setAddBankLoading] = useState(false);

  const now = new Date();

  const allBanks = [...DEFAULT_BANKS, ...userBanks.map((b) => b.name)];

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter.type) params.set("type", filter.type);
    if (filter.month) params.set("month", filter.month);
    const [txRes, catRes, bankRes, allTxRes] = await Promise.all([
      fetch(`/api/transactions?${params}`),
      fetch("/api/categories"),
      fetch("/api/user-banks"),
      fetch("/api/transactions?source=CASH"),
    ]);
    const [txData, catData, bankData, allTxData] = await Promise.all([
      txRes.json(), catRes.json(), bankRes.json(), allTxRes.json(),
    ]);
    setTransactions(Array.isArray(txData) ? txData : []);
    setCategories(Array.isArray(catData) ? catData : []);
    setUserBanks(Array.isArray(bankData) ? bankData : []);
    const allTx: Transaction[] = Array.isArray(allTxData) ? allTxData : [];
    setAllIncome(allTx.filter((t) => t.type === "INCOME").reduce((s, t) => s + t.amount, 0));
    setAllExpense(allTx.filter((t) => t.type === "EXPENSE").reduce((s, t) => s + t.amount, 0));
    setLoading(false);
  }, [filter]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setTransfer(EMPTY_TRANSFER);
    setPaymentMethod("");
    setPaymentDetail("");
    setBankName("");
    setAddBankInput("");
    setAddBankTarget(null);
    setInvestmentType("");
  };

  const openAdd = () => { setEditing(null); resetForm(); setShowModal(true); };

  const openEdit = (t: Transaction) => {
    setEditing(t);
    resetForm();
    if (t.type === "TRANSFER") {
      setForm({ title: t.title, amount: String(t.amount), type: "TRANSFER", date: t.date.split("T")[0], note: "", categoryId: "" });
      setTransfer(parseTransferNote(t.note ?? ""));
    } else {
      const isBankCat = t.category?.name === "銀行";
      const { pm, detail, rest } = parsePaymentNote(t.note ?? "");
      setForm({ title: t.title, amount: String(t.amount), type: t.type, date: t.date.split("T")[0], note: isBankCat ? "" : rest, categoryId: t.categoryId ?? "" });
      if (isBankCat) setBankName(t.note ?? "");
      else { setPaymentMethod(pm); setPaymentDetail(detail); }
    }
    setShowModal(true);
  };

  const selectedCatName = categories.find((c) => c.id === form.categoryId)?.name;
  const isBank = selectedCatName === "銀行";
  const isInvestmentCat = selectedCatName === "投資" && form.type === "EXPENSE";

  const buildNote = () => {
    if (form.type === "TRANSFER") return buildTransferNote(transfer);
    if (isBank) return bankName;
    if (form.type === "EXPENSE" && paymentMethod) {
      if (paymentMethod === "現金") return "支付:現金";
      return `支付:${paymentMethod}:${paymentDetail}`;
    }
    return form.note;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing && isInvestmentCat && !investmentType) {
      alert("請選擇投資類別（股票、基金或外匯）");
      return;
    }
    setSaving(true);
    const url = editing ? `/api/transactions/${editing.id}` : "/api/transactions";
    const method = editing ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, note: buildNote() }),
    });
    // 新增投資記錄：建立新的投資支出時同步到投資模組
    if (!editing && isInvestmentCat && investmentType && res.ok) {
      const txData = await res.json();
      if (txData.id) {
        await fetch("/api/investments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: investmentType,
            amount: form.amount,
            transactionId: txData.id,
          }),
        });
      }
    }
    setSaving(false);
    setShowModal(false);
    fetchAll();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("確定要刪除這筆記錄？")) return;
    await fetch(`/api/transactions/${id}`, { method: "DELETE" });
    fetchAll();
  };

  const handleAddBank = async (target: typeof addBankTarget) => {
    if (!addBankInput.trim()) return;
    setAddBankLoading(true);
    const res = await fetch("/api/user-banks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: addBankInput.trim() }),
    });
    setAddBankLoading(false);
    if (res.ok) {
      const bank = await res.json();
      setUserBanks((prev) => [...prev, bank]);
      // 自動選到新增的銀行
      if (target === "category") setBankName(bank.name);
      else if (target === "payment") setPaymentDetail(bank.name);
      else if (target === "fromDetail") setTransfer((t) => ({ ...t, fromDetail: bank.name }));
      else if (target === "toDetail") setTransfer((t) => ({ ...t, toDetail: bank.name }));
      setAddBankInput("");
      setAddBankTarget(null);
    }
  };

  const fmt = (n: number) =>
    new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(n);

  const filteredCats = categories.filter((c) => c.type === form.type);

  // 可搜尋銀行選擇器（使用原生 datalist）
  const BankSelector = ({ value, onChange, target }: { value: string; onChange: (v: string) => void; target: typeof addBankTarget }) => (
    <div>
      <input
        type="text"
        list={`banklist-${target}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="搜尋或輸入銀行名稱"
        className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors"
      />
      <datalist id={`banklist-${target}`}>
        {allBanks.map((b) => <option key={b} value={b} />)}
      </datalist>
      {addBankTarget === target ? (
        <div className="flex gap-2 mt-2">
          <input value={addBankInput} onChange={(e) => setAddBankInput(e.target.value)}
            placeholder="輸入銀行名稱"
            className="flex-1 border border-indigo-300 rounded-lg px-3 py-2 text-sm focus:border-indigo-400" />
          <button type="button" onClick={() => handleAddBank(target)} disabled={addBankLoading}
            className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60">
            {addBankLoading ? "..." : "新增"}
          </button>
          <button type="button" onClick={() => setAddBankTarget(null)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-500 hover:bg-slate-50">取消</button>
        </div>
      ) : (
        <button type="button" onClick={() => setAddBankTarget(target)}
          className="mt-1.5 text-xs text-indigo-500 hover:text-indigo-700 hover:underline">
          + 找不到？申請新增銀行
        </button>
      )}
    </div>
  );

  // 第三方選擇器
  const ThirdPartySelector = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <select required value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors">
      <option value="">請選擇支付平台</option>
      {THIRD_PARTY.map((t) => <option key={t} value={t}>{t}</option>)}
    </select>
  );

  // 調帳端選擇器（from 或 to）
  const TransferSide = ({ label, typeKey, detailKey }: {
    label: string;
    typeKey: "fromType" | "toType";
    detailKey: "fromDetail" | "toDetail";
  }) => (
    <div className="flex-1">
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{label}</label>
      <div className="flex gap-1.5 mb-2">
        {(["現金", "銀行", "第三方支付"] as PaymentMethod[]).map((pm) => (
          <button key={pm} type="button"
            onClick={() => setTransfer((t) => ({ ...t, [typeKey]: pm, [detailKey]: "" }))}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              transfer[typeKey] === pm ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}>
            {pm === "現金" ? "💵" : pm === "銀行" ? "🏦" : "📱"}
            <div className="text-[10px] mt-0.5">{pm === "第三方支付" ? "第三方" : pm}</div>
          </button>
        ))}
      </div>
      {transfer[typeKey] === "銀行" && (
        <BankSelector value={transfer[detailKey]} onChange={(v) => setTransfer((t) => ({ ...t, [detailKey]: v }))} target={detailKey} />
      )}
      {transfer[typeKey] === "第三方支付" && (
        <ThirdPartySelector value={transfer[detailKey]} onChange={(v) => setTransfer((t) => ({ ...t, [detailKey]: v }))} />
      )}
    </div>
  );

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">收支記錄</h1>
          <p className="text-slate-500 text-sm mt-1">管理你的每一筆收支</p>
        </div>
        <button onClick={openAdd}
          className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors">
          + 新增記錄
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="text-xs font-semibold text-emerald-500 uppercase tracking-wider mb-1">總流入</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">{fmt(allIncome)}</div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-1">總流出</div>
          <div className="text-2xl font-bold text-red-500 mt-1">{fmt(allExpense)}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <select value={filter.month} onChange={(e) => setFilter({ ...filter, month: e.target.value })}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white">
          <option value="">全部月份</option>
          {Array.from({ length: 6 }, (_, i) => {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            return <option key={val} value={val}>{d.getFullYear()} 年 {d.getMonth() + 1} 月</option>;
          })}
        </select>
        <select value={filter.type} onChange={(e) => setFilter({ ...filter, type: e.target.value })}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white">
          <option value="">全部類型</option>
          <option value="INCOME">收入</option>
          <option value="EXPENSE">支出</option>
          <option value="TRANSFER">調帳</option>
        </select>
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50">
          <h2 className="font-semibold text-slate-900">收支明細</h2>
          <button
            onClick={() => setShowList((v) => !v)}
            className="text-xs text-slate-400 hover:text-slate-600 px-2.5 py-1 rounded-lg hover:bg-slate-100 transition-colors"
          >
            {showList ? "隱藏" : "顯示"}
          </button>
        </div>
        {showList && (loading ? (
          <div className="py-16 text-center text-slate-400 text-sm">載入中...</div>
        ) : transactions.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-slate-400 text-sm mb-3">還沒有任何記錄</p>
            <button onClick={openAdd} className="text-sm text-indigo-600 font-medium hover:underline">新增第一筆記錄</button>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {transactions.map((t) => (
              <div key={t.id} className="flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors group">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
                    style={{ backgroundColor: t.type === "TRANSFER" ? "#f0fdf4" : (t.category?.color ?? "#e2e8f0") + "20" }}>
                    {t.type === "TRANSFER" ? "↔️" : (t.category?.icon ?? (t.type === "INCOME" ? "💰" : "💸"))}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-800">{t.title}</div>
                    <div className="text-xs text-slate-400">
                      {t.type === "TRANSFER"
                        ? `調帳 · ${new Date(t.date).toLocaleDateString("zh-TW")} · ${displayTransferNote(t.note ?? "")}`
                        : `${t.category?.name ?? "未分類"} · ${new Date(t.date).toLocaleDateString("zh-TW")}${t.note ? ` · ${t.note.startsWith("支付:") ? t.note.slice(3).replace(":", " ") : t.note}` : ""}`
                      }
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`text-sm font-semibold ${
                    t.type === "INCOME" ? "text-emerald-600" :
                    t.type === "TRANSFER" ? "text-indigo-500" : "text-red-500"
                  }`}>
                    {t.type === "INCOME" ? "+" : t.type === "TRANSFER" ? "" : "-"}{fmt(t.amount)}
                  </span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 text-xs transition-colors">編輯</button>
                    <button onClick={() => handleDelete(t.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 text-xs transition-colors">刪除</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-slate-900 mb-5">{editing ? "編輯記錄" : "新增記錄"}</h2>
            <form onSubmit={handleSave} className="space-y-4">

              {/* Type tabs */}
              <div className="flex gap-2">
                {(["EXPENSE", "INCOME", "TRANSFER"] as const).map((tp) => (
                  <button key={tp} type="button"
                    onClick={() => { setForm({ ...EMPTY_FORM, type: tp, date: form.date }); setTransfer(EMPTY_TRANSFER); setPaymentMethod(""); setPaymentDetail(""); setBankName(""); }}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                      form.type === tp
                        ? tp === "INCOME" ? "bg-emerald-500 text-white"
                          : tp === "TRANSFER" ? "bg-indigo-500 text-white"
                          : "bg-red-500 text-white"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    }`}>
                    {tp === "INCOME" ? "收入" : tp === "EXPENSE" ? "支出" : "↔ 調帳"}
                  </button>
                ))}
              </div>

              {/* 調帳表單 */}
              {form.type === "TRANSFER" ? (
                <>
                  <div className="flex gap-3 items-start">
                    <TransferSide label="從" typeKey="fromType" detailKey="fromDetail" />
                    <div className="text-2xl text-slate-300 mt-8">→</div>
                    <TransferSide label="至" typeKey="toType" detailKey="toDetail" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">名稱（選填）</label>
                    <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                      placeholder="例如：提款" className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">金額</label>
                    <input required type="number" min="0" step="1" value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0"
                      className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">日期</label>
                    <input required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                  </div>
                </>
              ) : (
                /* 收入/支出表單 */
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">名稱</label>
                    <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                      placeholder="例如：午餐" className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">金額</label>
                    <input required type="number" min="0" step="1" value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0"
                      className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">日期</label>
                    <input required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">分類</label>
                    <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors">
                      <option value="">未分類</option>
                      {filteredCats.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                    </select>
                  </div>

                  {/* 銀行分類：選銀行名稱 */}
                  {isBank && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">銀行名稱</label>
                      <BankSelector value={bankName} onChange={setBankName} target="category" />
                    </div>
                  )}

                  {/* 投資分類：選投資細項 */}
                  {isInvestmentCat && !editing && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        投資類別 <span className="text-red-500">*</span>
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {([
                          { value: "STOCK", label: "📈 股票" },
                          { value: "FUND", label: "📦 基金" },
                          { value: "FOREX", label: "💱 外匯" },
                          { value: "CRYPTO", label: "₿ 虛擬貨幣" },
                          { value: "GOLD", label: "🪙 黃金" },
                        ] as const).map(({ value, label }) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setInvestmentType(value)}
                            className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                              investmentType === value
                                ? "bg-indigo-600 text-white"
                                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-slate-400 mt-1.5">選擇後將自動同步到對應的投資細項，詳情可至左側「投資」頁面編輯</p>
                    </div>
                  )}
                  {isInvestmentCat && editing && (
                    <p className="text-xs text-slate-400 bg-slate-50 rounded-lg px-3 py-2">
                      投資詳細資料（名稱、代碼、數量）請至左側「投資」頁面進行編輯
                    </p>
                  )}

                  {/* 支出：支付方式 */}
                  {!isBank && !isInvestmentCat && form.type === "EXPENSE" && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">支付方式</label>
                      <div className="flex gap-2 mb-2">
                        {(["現金", "銀行", "第三方支付"] as PaymentMethod[]).map((pm) => (
                          <button key={pm} type="button"
                            onClick={() => { setPaymentMethod(pm); setPaymentDetail(""); setAddBankTarget(null); }}
                            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                              paymentMethod === pm ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                            }`}>
                            {pm === "現金" ? "💵 現金" : pm === "銀行" ? "🏦 銀行" : "📱 第三方"}
                          </button>
                        ))}
                      </div>
                      {paymentMethod === "銀行" && (
                        <BankSelector value={paymentDetail} onChange={setPaymentDetail} target="payment" />
                      )}
                      {paymentMethod === "第三方支付" && (
                        <ThirdPartySelector value={paymentDetail} onChange={setPaymentDetail} />
                      )}
                    </div>
                  )}

                  {/* 收入：備註 */}
                  {!isBank && !isInvestmentCat && form.type === "INCOME" && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">備註（選填）</label>
                      <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
                        placeholder="備註..." className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
                    </div>
                  )}
                </>
              )}

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
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
