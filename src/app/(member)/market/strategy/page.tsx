"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { authFetch } from "@/lib/api-fetch";

interface StrategyRow {
  id: string;
  order: number;
  broker: string;
  stockName: string;
  stockCode: string;
  plan: string;
  shares: string;
  avgPrice: string;
  currentPrice: string;
  dividendDate: string;
  dividendAmount: string;
  discount: string;
  futureLow: string;
  futureMid: string;
  futureHigh: string;
  batch1: string;
  batch2: string;
  batch3: string;
  batch4: string;
  batch5: string;
  batch6: string;
}

type RawEntry = Record<string, string | number | null>;

interface MartingaleTemplate {
  id: string;
  name: string;
  ratios: number[];
  note: string | null;
}

interface UserMartingale {
  id: string;
  name: string;
  ratios: number[];
  note: string | null;
}

const MAX_MARTINGALE_STEPS = 8;
const MIN_MARTINGALE_STEPS = 2;
const EMPTY_STRATEGY_FORM = { name: "", note: "", ratios: ["1", "1"] };

const STOCK_TAX_RATE = 0.003; // 證券交易稅 0.3%，僅賣出課徵
const DEFAULT_FEE_RATE = 0.001425; // 手續費率 0.1425%（找不到後台設定時的預設值）

function toRow(e: RawEntry): StrategyRow {
  const s = (k: string) => (e[k] == null ? "" : String(e[k]));
  return {
    id: String(e.id),
    order: e.order == null ? 0 : Number(e.order),
    broker: s("broker"),
    stockName: s("stockName"),
    stockCode: s("stockCode"),
    plan: s("plan"),
    shares: s("shares"),
    avgPrice: s("avgPrice"),
    currentPrice: s("currentPrice"),
    dividendDate: s("dividendDate"),
    dividendAmount: s("dividendAmount"),
    discount: e.discount == null ? "1" : String(e.discount),
    futureLow: s("futureLow"),
    futureMid: s("futureMid"),
    futureHigh: s("futureHigh"),
    batch1: s("batch1"),
    batch2: s("batch2"),
    batch3: s("batch3"),
    batch4: s("batch4"),
    batch5: s("batch5"),
    batch6: s("batch6"),
  };
}

function calcRow(row: StrategyRow, feeRate: number, syncedTotal: number | undefined) {
  const shares = parseFloat(row.shares) || 0;
  const avgPrice = parseFloat(row.avgPrice) || 0;
  const currentPrice = parseFloat(row.currentPrice) || 0;
  const discount = row.discount === "" ? 1 : parseFloat(row.discount) || 0;

  // 總額優先用「股票投資」頁同一代碼底下所有交易紀錄的實際扣款金額加總（含手續費/稅/人工調帳），
  // 這樣才會跟股票投資頁「淨投入金額」逐碼加總起來完全一致；股數×均價（不含手續費）只在
  // 找不到對應交易紀錄時（例如手動新增、還沒同步過的列）當作備援估算值。
  const totalAmount = syncedTotal != null ? syncedTotal : shares > 0 && avgPrice > 0 ? shares * avgPrice : null;
  if (totalAmount == null) {
    return { totalAmount: null as number | null, profitLoss: null as number | null, returnRate: null as number | null };
  }

  if (currentPrice <= 0) {
    return { totalAmount, profitLoss: null as number | null, returnRate: null as number | null };
  }

  const marketValue = shares * currentPrice;
  const sellFee = marketValue * feeRate * discount;
  const tax = marketValue * STOCK_TAX_RATE;
  const profitLoss = marketValue - totalAmount - sellFee - tax;
  const returnRate = totalAmount > 0 ? profitLoss / totalAmount : null;

  return { totalAmount, profitLoss, returnRate };
}

const inputCls = "min-w-0 bg-transparent border-0 focus:ring-1 focus:ring-indigo-300 rounded px-2 py-2 text-sm text-slate-700 focus:bg-indigo-50/50 transition-colors";

export default function StrategyPage() {
  const [rows, setRows] = useState<StrategyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [feeRate, setFeeRate] = useState(DEFAULT_FEE_RATE);
  const [netAmountByCode, setNetAmountByCode] = useState<Record<string, number>>({});
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const [templates, setTemplates] = useState<MartingaleTemplate[]>([]);
  const [userStrategies, setUserStrategies] = useState<UserMartingale[]>([]);
  const [martingaleLoading, setMartingaleLoading] = useState(true);
  const [showAddStrategy, setShowAddStrategy] = useState(false);
  const [strategyForm, setStrategyForm] = useState(EMPTY_STRATEGY_FORM);
  const [strategySaving, setStrategySaving] = useState(false);

  const fetchMartingales = useCallback(async () => {
    setMartingaleLoading(true);
    const [templateRes, userRes] = await Promise.all([
      fetch("/api/martingale-strategies"),
      fetch("/api/user-martingale-strategies"),
    ]);
    const [templateData, userData] = await Promise.all([templateRes.json(), userRes.json()]);
    setTemplates(Array.isArray(templateData) ? templateData : []);
    setUserStrategies(Array.isArray(userData) ? userData : []);
    setMartingaleLoading(false);
  }, []);

  useEffect(() => { fetchMartingales(); }, [fetchMartingales]);

  const addRatioField = () =>
    setStrategyForm((f) => (f.ratios.length >= MAX_MARTINGALE_STEPS ? f : { ...f, ratios: [...f.ratios, ""] }));
  const removeRatioField = (index: number) =>
    setStrategyForm((f) => (f.ratios.length <= MIN_MARTINGALE_STEPS ? f : { ...f, ratios: f.ratios.filter((_, i) => i !== index) }));
  const updateRatioField = (index: number, value: string) =>
    setStrategyForm((f) => ({ ...f, ratios: f.ratios.map((r, i) => (i === index ? value : r)) }));

  const handleAddStrategy = async (e: React.FormEvent) => {
    e.preventDefault();
    setStrategySaving(true);
    const res = await authFetch("/api/user-martingale-strategies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(strategyForm),
    });
    setStrategySaving(false);
    if (res.ok) {
      setShowAddStrategy(false);
      setStrategyForm(EMPTY_STRATEGY_FORM);
      fetchMartingales();
    } else {
      const err = await res.json().catch(() => null);
      alert(err?.error || "新增失敗");
    }
  };

  const handleDeleteStrategy = async (s: UserMartingale) => {
    if (!confirm(`確定要刪除自訂策略「${s.name}」？`)) return;
    await authFetch("/api/user-martingale-strategies", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: s.id }),
    });
    fetchMartingales();
  };

  // 表格左右拖曳捲動：欄位太多，滑鼠在表格空白處（不是輸入框裡）按住拖曳可以左右移動，
  // 不影響一般點輸入框打字；輸入框裡按住拖曳還是正常的文字選取行為
  const [isDragging, setIsDragging] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{ startX: number; scrollLeft: number } | null>(null);

  const handleTableMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement) return;
    const el = scrollRef.current;
    if (!el) return;
    dragStateRef.current = { startX: e.clientX, scrollLeft: el.scrollLeft };
    setIsDragging(true);
  };
  const handleTableMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    const drag = dragStateRef.current;
    if (!el || !drag) return;
    e.preventDefault();
    el.scrollLeft = drag.scrollLeft - (e.clientX - drag.startX);
  };
  const stopTableDrag = () => {
    dragStateRef.current = null;
    setIsDragging(false);
  };
  useEffect(() => {
    window.addEventListener("mouseup", stopTableDrag);
    return () => window.removeEventListener("mouseup", stopTableDrag);
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [entriesRes, feeRes, stockInvRes] = await Promise.all([
      fetch("/api/investment-strategy"),
      fetch("/api/fee-settings"),
      fetch("/api/investments?type=STOCK"),
    ]);
    const authenticated = entriesRes.status !== 401;
    const [entriesData, feeData, stockInvData] = await Promise.all([entriesRes.json(), feeRes.json(), stockInvRes.json()]);
    setRows(Array.isArray(entriesData) ? entriesData.map(toRow) : []);
    const fees: { key: string; rate: number }[] = Array.isArray(feeData) ? feeData : [];
    const commission = fees.find((f) => f.key === "stock_commission");
    if (commission) setFeeRate(commission.rate / 100);

    // 依代碼加總「股票投資」頁同一支股票所有交易紀錄的實際扣款金額（amount 已含手續費/稅/
    // 人工調帳），讓「總額」跟股票投資頁「淨投入金額」逐碼加總起來完全一致，不用重新估算。
    const stockInvestments: { code?: string | null; amount: number }[] = Array.isArray(stockInvData) ? stockInvData : [];
    const netMap: Record<string, number> = {};
    for (const inv of stockInvestments) {
      const code = inv.code?.trim();
      if (!code) continue;
      netMap[code] = (netMap[code] ?? 0) + inv.amount;
    }
    setNetAmountByCode(netMap);

    setLoading(false);
    return authenticated;
  }, []);

  const [refreshingPrices, setRefreshingPrices] = useState(false);
  const [priceUpdatedAt, setPriceUpdatedAt] = useState<string | null>(null);

  // 「當前」欄位自動抓證交所當日收盤價回填，不用每天手動輸入；
  // 進頁面時自動抓一次，也保留手動按鈕可以隨時重新抓
  const handleRefreshPrices = useCallback(async () => {
    setRefreshingPrices(true);
    try {
      const res = await authFetch("/api/investment-strategy/refresh-prices", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        const updated: RawEntry[] = Array.isArray(data.updated) ? data.updated : [];
        if (updated.length > 0) {
          const map = new Map(updated.map((u) => [String(u.id), u]));
          setRows((prev) =>
            prev.map((r) => {
              const u = map.get(r.id);
              if (!u || u.currentPrice == null) return r;
              return { ...r, currentPrice: String(u.currentPrice) };
            })
          );
        }
        setPriceUpdatedAt(new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" }));
      }
    } finally {
      setRefreshingPrices(false);
    }
  }, []);

  useEffect(() => {
    fetchAll().then((authenticated) => {
      if (authenticated) handleRefreshPrices();
    });
  }, [fetchAll, handleRefreshPrices]);

  // 從「股票投資」頁面算出來的目前持股（代碼/名稱/股數/均價）同步過來，同代碼的列只更新
  // 這幾個欄位、其他手動欄位不動；沒有對應列的持股才新增一筆，之後不用重打一次
  const [syncingHoldings, setSyncingHoldings] = useState(false);
  const handleSyncHoldings = async () => {
    setSyncingHoldings(true);
    try {
      const res = await authFetch("/api/investment-strategy/sync-holdings", { method: "POST" });
      if (res.ok) {
        await fetchAll();
        await handleRefreshPrices();
      }
    } finally {
      setSyncingHoldings(false);
    }
  };

  const handleChange = (id: string, field: keyof StrategyRow, value: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const handleBlur = async (id: string, field: keyof StrategyRow) => {
    const row = rowsRef.current.find((r) => r.id === id);
    if (!row) return;
    await authFetch(`/api/investment-strategy/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: row[field] }),
    });
  };

  const handleMove = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= rowsRef.current.length) return;
    const current = [...rowsRef.current];
    const a = current[index];
    const b = current[target];
    const orderA = a.order;
    const orderB = b.order;
    current[index] = { ...b, order: orderA };
    current[target] = { ...a, order: orderB };
    setRows(current);
    authFetch(`/api/investment-strategy/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: orderB }),
    });
    authFetch(`/api/investment-strategy/${b.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: orderA }),
    });
  };

  const handleAdd = async () => {
    const res = await authFetch("/api/investment-strategy", { method: "POST" });
    if (!res.ok) return;
    const created = await res.json();
    setRows((prev) => [...prev, toRow(created)]);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("確定要刪除這筆策略記錄？")) return;
    await authFetch(`/api/investment-strategy/${id}`, { method: "DELETE" });
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const calcs = rows.map((r) => calcRow(r, feeRate, r.stockCode ? netAmountByCode[r.stockCode.trim()] : undefined));
  const totalProfitLoss = calcs.reduce((s, c) => s + (c.profitLoss ?? 0), 0);
  const totalAmount = calcs.reduce((s, c) => s + (c.totalAmount ?? 0), 0);

  const fmt = (n: number) => n.toLocaleString("zh-TW", { maximumFractionDigits: 2 });

  const textCol = (row: StrategyRow, field: keyof StrategyRow, placeholder: string, width = "w-20") => (
    <td className="px-0.5 py-0.5 border-b border-slate-50">
      <input
        value={row[field]}
        placeholder={placeholder}
        onChange={(e) => handleChange(row.id, field, e.target.value)}
        onBlur={() => handleBlur(row.id, field)}
        className={`${inputCls} ${width}`}
      />
    </td>
  );

  const numCol = (row: StrategyRow, field: keyof StrategyRow, placeholder: string, width = "w-16") => (
    <td className="px-0.5 py-0.5 border-b border-slate-50">
      <input
        type="number"
        step="any"
        value={row[field]}
        placeholder={placeholder}
        onChange={(e) => handleChange(row.id, field, e.target.value)}
        onBlur={() => handleBlur(row.id, field)}
        className={`${inputCls} ${width} text-right`}
      />
    </td>
  );

  // 股票名稱/代碼/股數/均價/當前：唯讀，避免誤輸入跟自動同步/抓價的資料打架
  const readonlyCol = (value: string, align: "left" | "right", width = "w-20", emptyHint = "用同步持股帶入") => (
    <td className={`px-2 py-2 border-b border-slate-50 text-slate-500 ${align === "right" ? "text-right" : "text-left"}`}>
      <span className={`block truncate ${width}`}>{value || <span className="text-slate-300">{emptyHint}</span>}</span>
    </td>
  );

  return (
    <div className="max-w-full">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">投資策略</h1>
          <p className="text-slate-500 text-sm mt-1">
            手動記錄持股策略與未來目標價；「當前」會自動抓證交所當日收盤價回填，不用手動輸入；
            總額與「股票投資」頁的淨投入金額同步；盈虧／報酬率會自動扣除賣出手續費（依折扣）與證券交易稅計算
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleSyncHoldings}
            disabled={syncingHoldings}
            className="text-sm text-indigo-600 font-medium hover:underline disabled:opacity-50 disabled:no-underline"
            title="從「股票投資」頁面的目前持股同步代碼/股數/均價過來"
          >
            {syncingHoldings ? "同步中..." : "⇅ 同步持股"}
          </button>
          <div className="text-right">
            <button
              onClick={handleRefreshPrices}
              disabled={refreshingPrices}
              className="text-sm text-indigo-600 font-medium hover:underline disabled:opacity-50 disabled:no-underline"
            >
              {refreshingPrices ? "更新中..." : "↻ 更新當前股價"}
            </button>
            {priceUpdatedAt && !refreshingPrices && (
              <div className="text-[11px] text-slate-400 mt-0.5">上次更新 {priceUpdatedAt}</div>
            )}
          </div>
          <button
            onClick={handleAdd}
            className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors"
          >
            + 新增一筆
          </button>
        </div>
      </div>

      {/* 馬丁格爾策略模版 */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-6 max-w-2xl">
        <div className="px-6 py-4 border-b border-slate-50">
          <h2 className="font-semibold text-slate-900">馬丁格爾策略模版</h2>
          <p className="text-xs text-slate-400 mt-0.5">官方模版僅供參考；不喜歡的話可以新增自己的模版，只有你自己看得到</p>
        </div>

        {martingaleLoading ? (
          <div className="py-8 text-center text-slate-400 text-sm">載入中...</div>
        ) : (
          <>
            {templates.length > 0 && (
              <div className="px-6 pt-4">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">官方模版</div>
                <div className="divide-y divide-slate-50">
                  {templates.map((t) => (
                    <div key={t.id} className="flex items-center justify-between py-2.5 text-sm">
                      <span className="text-slate-700">{t.name}</span>
                      <span className="font-mono text-indigo-600 font-semibold">{t.ratios.join(" : ")}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="px-6 py-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">我的自訂模版</span>
                <button onClick={() => setShowAddStrategy(true)} className="text-xs text-indigo-600 font-medium hover:underline">
                  + 新增自訂模版
                </button>
              </div>
              {userStrategies.length === 0 ? (
                <div className="py-4 text-center text-slate-400 text-xs">還沒有自訂模版</div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {userStrategies.map((s) => (
                    <div key={s.id} className="flex items-center justify-between py-2.5 text-sm group">
                      <span className="text-slate-700">{s.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-indigo-600 font-semibold">{s.ratios.join(" : ")}</span>
                        <button onClick={() => handleDeleteStrategy(s)}
                          className="opacity-0 group-hover:opacity-100 text-xs text-slate-300 hover:text-red-500 transition-all">
                          刪除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6 max-w-md">
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">加總盈虧</div>
          <div className={`text-2xl font-bold mt-1 ${totalProfitLoss >= 0 ? "text-red-500" : "text-green-600"}`}>
            {fmt(totalProfitLoss)}
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">加總總額</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{fmt(totalAmount)}</div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm">載入中...</div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-slate-400 text-sm mb-3">還沒有任何策略記錄</p>
            <button onClick={handleAdd} className="text-sm text-indigo-600 font-medium hover:underline">新增第一筆</button>
          </div>
        ) : (
          <div
            ref={scrollRef}
            className={`overflow-x-auto select-none ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
            onMouseDown={handleTableMouseDown}
            onMouseMove={handleTableMouseMove}
            onMouseUp={stopTableDrag}
            onMouseLeave={stopTableDrag}
          >
            <table className="text-sm border-collapse">
              <thead>
                <tr className="text-xs text-slate-400 bg-slate-50 whitespace-nowrap">
                  <th className="px-2 py-2.5 text-center font-semibold">排序</th>
                  <th className="px-2 py-2.5 text-left font-semibold">證券公司</th>
                  <th className="px-2 py-2.5 text-left font-semibold" title="唯讀，請用「同步持股」帶入">股票名稱🔒</th>
                  <th className="px-2 py-2.5 text-left font-semibold" title="唯讀，請用「同步持股」帶入">股票代碼🔒</th>
                  <th className="px-2 py-2.5 text-left font-semibold">方案</th>
                  <th className="px-2 py-2.5 text-right font-semibold" title="唯讀，請用「同步持股」帶入">股數🔒</th>
                  <th className="px-2 py-2.5 text-right font-semibold" title="唯讀，請用「同步持股」帶入">均價🔒</th>
                  <th className="px-2 py-2.5 text-right font-semibold" title="唯讀，自動抓永豐/證交所報價">當前🔒</th>
                  <th className="px-2 py-2.5 text-left font-semibold">配息日</th>
                  <th className="px-2 py-2.5 text-right font-semibold">金額</th>
                  <th className="px-2 py-2.5 text-right font-semibold">折扣</th>
                  <th className="px-2 py-2.5 text-right font-semibold">盈虧</th>
                  <th className="px-2 py-2.5 text-right font-semibold">報酬率</th>
                  <th className="px-2 py-2.5 text-center font-semibold" colSpan={3}>未來可到價格</th>
                  <th className="px-2 py-2.5 text-right font-semibold">總額</th>
                  <th className="px-2 py-2.5 text-right font-semibold">第一次</th>
                  <th className="px-2 py-2.5 text-right font-semibold">第二次</th>
                  <th className="px-2 py-2.5 text-right font-semibold">第三次</th>
                  <th className="px-2 py-2.5 text-right font-semibold">第四次</th>
                  <th className="px-2 py-2.5 text-right font-semibold">第五次</th>
                  <th className="px-2 py-2.5 text-right font-semibold">第六次</th>
                  <th className="px-2 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const calc = calcs[i];
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-2 py-2 border-b border-slate-50">
                        <div className="flex flex-col items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleMove(i, -1)}
                            disabled={i === 0}
                            className="text-slate-400 hover:text-indigo-600 disabled:opacity-20 disabled:hover:text-slate-400 text-xs leading-none px-1.5 py-0.5 transition-colors"
                            title="上移"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMove(i, 1)}
                            disabled={i === rows.length - 1}
                            className="text-slate-400 hover:text-indigo-600 disabled:opacity-20 disabled:hover:text-slate-400 text-xs leading-none px-1.5 py-0.5 transition-colors"
                            title="下移"
                          >
                            ▼
                          </button>
                        </div>
                      </td>
                      {textCol(row, "broker", "券商", "w-20")}
                      {readonlyCol(row.stockName, "left", "w-28")}
                      {readonlyCol(row.stockCode, "left", "w-20")}
                      {textCol(row, "plan", "方案", "w-16")}
                      {readonlyCol(row.shares, "right", "w-24")}
                      {readonlyCol(row.avgPrice, "right", "w-24")}
                      {readonlyCol(row.currentPrice, "right", "w-24", "自動抓報價")}
                      {textCol(row, "dividendDate", "配息日", "w-20")}
                      {numCol(row, "dividendAmount", "金額", "w-20")}
                      {numCol(row, "discount", "1", "w-16")}
                      <td className={`px-2 py-2 text-right font-semibold whitespace-nowrap ${
                        calc.profitLoss == null ? "text-slate-300" : calc.profitLoss >= 0 ? "text-red-500" : "text-green-600"
                      }`}>
                        {calc.profitLoss == null ? "—" : fmt(calc.profitLoss)}
                      </td>
                      <td className={`px-2 py-2 text-right font-semibold whitespace-nowrap ${
                        calc.returnRate == null ? "text-slate-300" : calc.returnRate >= 0 ? "text-red-500" : "text-green-600"
                      }`}>
                        {calc.returnRate == null ? "—" : `${(calc.returnRate * 100).toFixed(2)}%`}
                      </td>
                      {textCol(row, "futureLow", "低", "w-24")}
                      {textCol(row, "futureMid", "中", "w-24")}
                      {textCol(row, "futureHigh", "高", "w-24")}
                      <td className="px-2 py-2 text-right text-slate-500 whitespace-nowrap">
                        {calc.totalAmount == null ? "—" : fmt(calc.totalAmount)}
                      </td>
                      {numCol(row, "batch1", "-", "w-20")}
                      {numCol(row, "batch2", "-", "w-20")}
                      {numCol(row, "batch3", "-", "w-20")}
                      {numCol(row, "batch4", "-", "w-20")}
                      {numCol(row, "batch5", "-", "w-20")}
                      {numCol(row, "batch6", "-", "w-20")}
                      <td className="px-2 py-2">
                        <button
                          onClick={() => handleDelete(row.id)}
                          className="text-slate-300 hover:text-red-500 transition-colors px-1 text-base"
                          title="刪除"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400 mt-3">
        總額 = 同代碼在「股票投資」頁所有交易紀錄的實際扣款金額加總（含手續費/稅/人工調帳），
        逐碼加總會完全等於股票投資頁「淨投入金額」；找不到對應交易紀錄的列才退回用股數×均價估算；
        盈虧 = (股數 × 當前) − 總額 − 賣出手續費 − 證券交易稅（賣出方向課徵0.3%）；
        手續費 = 成交金額 × {(feeRate * 100).toFixed(4)}% × 折扣（1 = 無折扣，0.6 = 6折）；報酬率 = 盈虧 ÷ 總額
      </p>

      {/* 新增自訂馬丁格爾策略 Modal */}
      {showAddStrategy && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-slate-900 mb-5">新增自訂馬丁格爾策略</h2>
            <form onSubmit={handleAddStrategy} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">方案名稱</label>
                <input required value={strategyForm.name} onChange={(e) => setStrategyForm({ ...strategyForm, name: e.target.value })}
                  placeholder="例如：我的穩健方案"
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  核心邏輯（股數比例）
                  <span className="text-slate-400 font-normal ml-1">最少 {MIN_MARTINGALE_STEPS} 次、最多 {MAX_MARTINGALE_STEPS} 次補投入</span>
                </label>
                <div className="space-y-2">
                  {strategyForm.ratios.map((r, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 w-14 shrink-0">第 {i + 1} 次</span>
                      <input required type="number" min="0" step="any" value={r}
                        onChange={(e) => updateRatioField(i, e.target.value)}
                        placeholder="比例"
                        className="flex-1 border border-slate-200 rounded-lg px-3.5 py-2 text-sm focus:border-indigo-400 transition-colors" />
                      <button type="button" onClick={() => removeRatioField(i)}
                        disabled={strategyForm.ratios.length <= MIN_MARTINGALE_STEPS}
                        className="text-slate-300 hover:text-red-500 disabled:opacity-20 disabled:hover:text-slate-300 text-xs px-1 shrink-0">
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addRatioField}
                  disabled={strategyForm.ratios.length >= MAX_MARTINGALE_STEPS}
                  className="mt-2 text-xs text-indigo-500 hover:text-indigo-700 hover:underline disabled:opacity-30 disabled:hover:no-underline">
                  + 新增一次補投入
                </button>
                <p className="text-xs text-indigo-600 font-mono font-semibold mt-2">
                  {strategyForm.ratios.filter((r) => r !== "").join(" : ") || "—"}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">備註（選填）</label>
                <input value={strategyForm.note} onChange={(e) => setStrategyForm({ ...strategyForm, note: e.target.value })}
                  placeholder="說明或備註..."
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => { setShowAddStrategy(false); setStrategyForm(EMPTY_STRATEGY_FORM); }}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                  取消
                </button>
                <button type="submit" disabled={strategySaving}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-60">
                  {strategySaving ? "新增中..." : "新增"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
