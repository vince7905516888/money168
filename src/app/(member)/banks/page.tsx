"use client";

import { useEffect, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface BankSummary {
  name: string;
  income: number;
  expense: number;
  transferIn: number;
  transferOut: number;
  balance: number;
}

interface BankRecord {
  id: string;
  title: string;
  amount: number;
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  date: string;
  note?: string;
  category?: { name: string; icon?: string; color?: string };
}

interface Category {
  id: string;
  name: string;
  type: string;
  icon?: string;
  color?: string;
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

const PIE_COLORS = [
  "#6366f1", "#0ea5e9", "#22c55e", "#f59e0b", "#ef4444",
  "#8b5cf6", "#14b8a6", "#f97316", "#ec4899", "#64748b",
];

type PaymentMethod = "" | "現金" | "銀行" | "第三方支付";
type SortKey = "balance_desc" | "balance_asc" | "name_asc";

const EMPTY_FORM = {
  title: "",
  amount: "",
  type: "INCOME" as "INCOME" | "EXPENSE" | "TRANSFER",
  date: new Date().toLocaleDateString("sv-SE"),
  note: "",
  categoryId: "",
};

const EMPTY_TRANSFER = {
  fromType: "" as PaymentMethod,
  fromDetail: "",
  toType: "" as PaymentMethod,
  toDetail: "",
};

function buildTransferNote(t: typeof EMPTY_TRANSFER) {
  return `FROM:${t.fromType}:${t.fromDetail}|TO:${t.toType}:${t.toDetail}`;
}

function parseTransferNote(note: string) {
  const match = note.match(/FROM:([^:]+):?([^|]*)\|TO:([^:]+):?(.*)/);
  if (!match) return EMPTY_TRANSFER;
  return { fromType: match[1] as PaymentMethod, fromDetail: match[2] ?? "", toType: match[3] as PaymentMethod, toDetail: match[4] ?? "" };
}

function displayTransferNote(note: string) {
  const t = parseTransferNote(note);
  const from = t.fromDetail ? `${t.fromType} (${t.fromDetail})` : t.fromType;
  const to = t.toDetail ? `${t.toType} (${t.toDetail})` : t.toType;
  return `${from} → ${to}`;
}

export default function BanksPage() {
  const [banks, setBanks] = useState<BankSummary[]>([]);
  const [records, setRecords] = useState<BankRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // 顯示/隱藏切換
  const [showSummary, setShowSummary] = useState(true);
  const [showRecords, setShowRecords] = useState(true);

  // 排序
  const [sortKey, setSortKey] = useState<SortKey>("balance_desc");

  // 表單狀態
  const [categories, setCategories] = useState<Category[]>([]);
  const [userBanks, setUserBanks] = useState<UserBank[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [transfer, setTransfer] = useState(EMPTY_TRANSFER);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("");
  const [paymentDetail, setPaymentDetail] = useState("");
  const [bankName, setBankName] = useState("");
  const [investmentType, setInvestmentType] = useState<"" | "STOCK" | "FUND" | "FOREX" | "CRYPTO" | "GOLD">("");
  const [saving, setSaving] = useState(false);
  const [addBankInput, setAddBankInput] = useState("");
  const [addBankTarget, setAddBankTarget] = useState<"category" | "payment" | "fromDetail" | "toDetail" | null>(null);
  const [addBankLoading, setAddBankLoading] = useState(false);
  const [bankSearch, setBankSearch] = useState<Record<string, string>>({});
  const [bankOpen, setBankOpen] = useState<Record<string, boolean>>({});

  const allBanks = [...DEFAULT_BANKS, ...userBanks.map((b) => b.name)];

  const fetchAll = async () => {
    setLoading(true);
    const [summaryRes, recordsRes] = await Promise.all([
      fetch("/api/banks/summary"),
      fetch("/api/transactions?source=BANK"),
    ]);
    const [summaryData, recordsData] = await Promise.all([summaryRes.json(), recordsRes.json()]);
    setBanks(Array.isArray(summaryData) ? summaryData : []);
    setRecords(Array.isArray(recordsData) ? recordsData : []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  // 過濾掉餘額為 0 的銀行，並排序
  const sortedBanks = [...banks]
    .filter((b) => b.balance !== 0)
    .sort((a, b) => {
      if (sortKey === "balance_desc") return b.balance - a.balance;
      if (sortKey === "balance_asc") return a.balance - b.balance;
      return a.name.localeCompare(b.name, "zh-TW");
    });

  // 圓餅圖資料（只取正餘額）
  const pieData = sortedBanks
    .filter((b) => b.balance > 0)
    .map((b) => ({ name: b.name, value: b.balance }));

  const openModal = async () => {
    setForm({ ...EMPTY_FORM, date: new Date().toLocaleDateString("sv-SE") });
    setTransfer(EMPTY_TRANSFER);
    setPaymentMethod("");
    setPaymentDetail("");
    setBankName("");
    setInvestmentType("");
    setAddBankInput("");
    setAddBankTarget(null);
    setShowModal(true);
    const [catRes, bankRes] = await Promise.all([fetch("/api/categories"), fetch("/api/user-banks")]);
    const [catData, bankData] = await Promise.all([catRes.json(), bankRes.json()]);
    setCategories(Array.isArray(catData) ? catData : []);
    setUserBanks(Array.isArray(bankData) ? bankData : []);
  };

  const resetForm = () => {
    setForm({ ...EMPTY_FORM, date: new Date().toLocaleDateString("sv-SE") });
    setTransfer(EMPTY_TRANSFER);
    setPaymentMethod("");
    setPaymentDetail("");
    setBankName("");
    setInvestmentType("");
    setAddBankInput("");
    setAddBankTarget(null);
  };

  const handleClose = () => { resetForm(); setShowModal(false); };

  const selectedCatName = categories.find((c) => c.id === form.categoryId)?.name;
  const isBank = selectedCatName === "銀行";
  const isInvestmentCat = selectedCatName === "投資" && form.type === "EXPENSE";
  const filteredCats = categories.filter((c) => c.type === form.type);

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
    if (isInvestmentCat && !investmentType) {
      alert("請選擇投資類別（股票、基金或外匯）");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, note: buildNote(), source: "BANK" }),
    });
    if (isInvestmentCat && investmentType && res.ok) {
      const txData = await res.json();
      if (txData.id) {
        await fetch("/api/investments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: investmentType, amount: form.amount, transactionId: txData.id }),
        });
      }
    }
    setSaving(false);
    handleClose();
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

  const BankSelector = ({ value, onChange, target }: { value: string; onChange: (v: string) => void; target: typeof addBankTarget }) => {
    const key = target ?? "";
    const search = bankSearch[key] ?? "";
    const open = bankOpen[key] ?? false;
    const filtered = allBanks.filter((b) =>
      search ? b.toLowerCase().includes(search.toLowerCase()) : true
    );
    return (
      <div>
        <div className="relative">
          <input
            type="text"
            value={open ? search : value}
            onChange={(e) => {
              setBankSearch((s) => ({ ...s, [key]: e.target.value }));
              setBankOpen((o) => ({ ...o, [key]: true }));
              onChange("");
            }}
            onFocus={() => {
              setBankSearch((s) => ({ ...s, [key]: "" }));
              setBankOpen((o) => ({ ...o, [key]: true }));
            }}
            onBlur={() => setTimeout(() => setBankOpen((o) => ({ ...o, [key]: false })), 150)}
            placeholder={value || "搜尋或輸入銀行名稱"}
            className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors"
          />
          {open && (
            <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
              {filtered.length > 0 ? filtered.map((b) => (
                <div key={b} onMouseDown={() => { onChange(b); setBankOpen((o) => ({ ...o, [key]: false })); setBankSearch((s) => ({ ...s, [key]: "" })); }}
                  className={`px-3.5 py-2.5 text-sm cursor-pointer transition-colors ${value === b ? "bg-indigo-50 text-indigo-700 font-medium" : "hover:bg-slate-50"}`}>
                  {b}
                </div>
              )) : (
                <div className="px-3.5 py-2.5 text-sm text-slate-400">找不到符合的銀行</div>
              )}
            </div>
          )}
        </div>
        {addBankTarget === target ? (
          <div className="flex gap-2 mt-2">
            <input value={addBankInput} onChange={(e) => setAddBankInput(e.target.value)} placeholder="輸入銀行名稱"
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
  };

  const ThirdPartySelector = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <select required value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors">
      <option value="">請選擇支付平台</option>
      {THIRD_PARTY.map((t) => <option key={t} value={t}>{t}</option>)}
    </select>
  );

  const TransferSide = ({ label, typeKey, detailKey }: {
    label: string; typeKey: "fromType" | "toType"; detailKey: "fromDetail" | "toDetail";
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

  const totalBalance = banks.reduce((s, b) => s + b.balance, 0);
  const totalIncome = banks.reduce((s, b) => s + b.income + b.transferIn, 0);
  const totalExpense = banks.reduce((s, b) => s + b.expense + b.transferOut, 0);

  const SectionHeader = ({ title, show, onToggle, extra }: { title: string; show: boolean; onToggle: () => void; extra?: React.ReactNode }) => (
    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50 cursor-pointer select-none" onClick={onToggle}>
      <h2 className="font-semibold text-slate-900">{title}</h2>
      <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
        {extra}
        <button onClick={onToggle} className="text-slate-400 hover:text-slate-600 text-sm font-medium transition-colors">
          {show ? "▾ 收合" : "▸ 展開"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">銀行資金管理</h1>
          <p className="text-slate-500 text-sm mt-1">追蹤各銀行帳戶的資金流向</p>
        </div>
        <button onClick={openModal}
          className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors">
          + 新增記錄
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">銀行總結餘</div>
          <div className={`text-2xl font-bold mt-1 ${totalBalance >= 0 ? "text-slate-900" : "text-red-500"}`}>
            {fmt(totalBalance)}
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="text-xs font-semibold text-emerald-500 uppercase tracking-wider mb-1">總流入</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">{fmt(totalIncome)}</div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-1">總流出</div>
          <div className="text-2xl font-bold text-red-500 mt-1">{fmt(totalExpense)}</div>
        </div>
      </div>

      {/* 各銀行明細 */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-6">
        <SectionHeader
          title="各銀行明細"
          show={showSummary}
          onToggle={() => setShowSummary((v) => !v)}
          extra={
            showSummary && sortedBanks.length > 0 ? (
              <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-600 bg-white">
                <option value="balance_desc">餘額由高到低</option>
                <option value="balance_asc">餘額由低到高</option>
                <option value="name_asc">名稱排序</option>
              </select>
            ) : undefined
          }
        />

        {showSummary && (
          loading ? (
            <div className="py-10 text-center text-slate-400 text-sm">載入中...</div>
          ) : sortedBanks.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-sm">尚無銀行資料</div>
          ) : (
            <>
              {/* 圓餅圖 */}
              {pieData.length > 0 && (
                <div className="px-6 py-4 border-b border-slate-50">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">各銀行餘額比例</p>
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {pieData.map((_, index) => (
                          <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => [fmt(Number(value)), "餘額"]}
                        contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: "13px" }}
                      />
                      <Legend
                        formatter={(value) => <span className="text-xs text-slate-600">{value}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* 明細列表 */}
              <div className="divide-y divide-slate-50">
                {sortedBanks.map((bank, i) => (
                  <div key={bank.name} className="px-6 py-4 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <div className="w-9 h-9 rounded-xl bg-sky-50 flex items-center justify-center text-base">🏦</div>
                        <span className="text-sm font-semibold text-slate-800">{bank.name}</span>
                      </div>
                      <span className={`text-sm font-bold ${bank.balance >= 0 ? "text-slate-800" : "text-red-500"}`}>
                        {fmt(bank.balance)}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 ml-12">
                      <div className="bg-emerald-50 rounded-lg px-3 py-1.5">
                        <div className="text-xs text-emerald-600 font-medium">收入</div>
                        <div className="text-sm font-semibold text-emerald-700">{fmt(bank.income)}</div>
                      </div>
                      <div className="bg-red-50 rounded-lg px-3 py-1.5">
                        <div className="text-xs text-red-500 font-medium">支出</div>
                        <div className="text-sm font-semibold text-red-600">{fmt(bank.expense)}</div>
                      </div>
                      <div className="bg-indigo-50 rounded-lg px-3 py-1.5">
                        <div className="text-xs text-indigo-500 font-medium">調帳流入</div>
                        <div className="text-sm font-semibold text-indigo-600">{fmt(bank.transferIn)}</div>
                      </div>
                      <div className="bg-slate-50 rounded-lg px-3 py-1.5">
                        <div className="text-xs text-slate-500 font-medium">調帳流出</div>
                        <div className="text-sm font-semibold text-slate-600">{fmt(bank.transferOut)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )
        )}
      </div>

      {/* 銀行記錄 */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <SectionHeader title="銀行記錄" show={showRecords} onToggle={() => setShowRecords((v) => !v)} />

        {showRecords && (
          loading ? (
            <div className="py-16 text-center text-slate-400 text-sm">載入中...</div>
          ) : records.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">
              尚無銀行記錄<br />
              <span className="text-xs mt-1 block">點擊右上角「+ 新增記錄」開始記帳</span>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {records.map((r) => (
                <div key={r.id} className="flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
                      style={{ backgroundColor: r.type === "TRANSFER" ? "#eef2ff" : (r.category?.color ?? "#e2e8f0") + "20" }}>
                      {r.type === "TRANSFER" ? "↔️" : (r.category?.icon ?? (r.type === "INCOME" ? "💰" : "💸"))}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-800">{r.title}</div>
                      <div className="text-xs text-slate-400">
                        {r.type === "TRANSFER"
                          ? `調帳 · ${new Date(r.date).toLocaleDateString("zh-TW")} · ${displayTransferNote(r.note ?? "")}`
                          : `${r.category?.name ?? "未分類"} · ${new Date(r.date).toLocaleDateString("zh-TW")}${r.note ? ` · ${r.note.startsWith("支付:") ? r.note.slice(3).replace(":", " ") : r.note}` : ""}`
                        }
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`text-sm font-semibold ${
                      r.type === "INCOME" ? "text-emerald-600" :
                      r.type === "TRANSFER" ? "text-indigo-500" : "text-red-500"
                    }`}>
                      {r.type === "INCOME" ? "+" : r.type === "TRANSFER" ? "" : "-"}{fmt(r.amount)}
                    </span>
                    <button onClick={() => handleDelete(r.id)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 text-xs transition-all">
                      刪除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* 新增記錄 Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-slate-900 mb-5">新增銀行記錄</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="flex gap-2">
                {(["INCOME", "EXPENSE", "TRANSFER"] as const).map((tp) => (
                  <button key={tp} type="button"
                    onClick={() => { setForm({ ...EMPTY_FORM, type: tp, date: form.date }); setTransfer(EMPTY_TRANSFER); setPaymentMethod(""); setPaymentDetail(""); setBankName(""); setInvestmentType(""); }}
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
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">名稱</label>
                    <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                      placeholder="例如：薪資入帳" className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
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
                  {isBank && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">銀行名稱</label>
                      <BankSelector value={bankName} onChange={setBankName} target="category" />
                    </div>
                  )}
                  {isInvestmentCat && (
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
                          <button key={value} type="button" onClick={() => setInvestmentType(value)}
                            className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                              investmentType === value ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                            }`}>{label}</button>
                        ))}
                      </div>
                    </div>
                  )}
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
                      {paymentMethod === "銀行" && <BankSelector value={paymentDetail} onChange={setPaymentDetail} target="payment" />}
                      {paymentMethod === "第三方支付" && <ThirdPartySelector value={paymentDetail} onChange={setPaymentDetail} />}
                    </div>
                  )}
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
                <button type="button" onClick={handleClose}
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
