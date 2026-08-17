"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { authFetch } from "@/lib/api-fetch";

interface StrategyRow {
  id: string;
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

const STOCK_TAX_RATE = 0.003; // 證券交易稅 0.3%，僅賣出課徵
const DEFAULT_FEE_RATE = 0.001425; // 手續費率 0.1425%（找不到後台設定時的預設值）

const NUM_FIELDS = [
  "shares", "avgPrice", "currentPrice", "dividendAmount", "discount",
  "batch1", "batch2", "batch3", "batch4", "batch5", "batch6",
] as const;
const STR_FIELDS = ["broker", "stockName", "stockCode", "plan", "dividendDate", "futureLow", "futureMid", "futureHigh"] as const;

function toRow(e: RawEntry): StrategyRow {
  const s = (k: string) => (e[k] == null ? "" : String(e[k]));
  return {
    id: String(e.id),
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

function calcRow(row: StrategyRow, feeRate: number) {
  const shares = parseFloat(row.shares) || 0;
  const avgPrice = parseFloat(row.avgPrice) || 0;
  const currentPrice = parseFloat(row.currentPrice) || 0;
  const discount = row.discount === "" ? 1 : parseFloat(row.discount) || 0;

  const totalAmount = shares > 0 && avgPrice > 0 ? shares * avgPrice : null;
  if (totalAmount == null || currentPrice <= 0) {
    return { totalAmount, profitLoss: null as number | null, returnRate: null as number | null };
  }

  const marketValue = shares * currentPrice;
  const buyFee = totalAmount * feeRate * discount;
  const sellFee = marketValue * feeRate * discount;
  const tax = marketValue * STOCK_TAX_RATE;
  const profitLoss = marketValue - totalAmount - buyFee - sellFee - tax;
  const investedCost = totalAmount + buyFee;
  const returnRate = investedCost > 0 ? profitLoss / investedCost : null;

  return { totalAmount, profitLoss, returnRate };
}

const inputCls = "w-full min-w-0 bg-transparent border-0 focus:ring-1 focus:ring-indigo-300 rounded px-1.5 py-1 text-xs text-slate-700 focus:bg-indigo-50/50 transition-colors";

export default function StrategyPage() {
  const [rows, setRows] = useState<StrategyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [feeRate, setFeeRate] = useState(DEFAULT_FEE_RATE);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

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
    const [entriesRes, feeRes] = await Promise.all([
      fetch("/api/investment-strategy"),
      fetch("/api/fee-settings"),
    ]);
    const [entriesData, feeData] = await Promise.all([entriesRes.json(), feeRes.json()]);
    setRows(Array.isArray(entriesData) ? entriesData.map(toRow) : []);
    const fees: { key: string; rate: number }[] = Array.isArray(feeData) ? feeData : [];
    const commission = fees.find((f) => f.key === "stock_commission");
    if (commission) setFeeRate(commission.rate / 100);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

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

  const calcs = rows.map((r) => calcRow(r, feeRate));
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

  return (
    <div className="max-w-full">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">投資策略</h1>
          <p className="text-slate-500 text-sm mt-1">
            手動記錄持股策略與未來目標價；盈虧／報酬率會自動扣除買賣手續費（依折扣）與證券交易稅計算
          </p>
        </div>
        <button
          onClick={handleAdd}
          className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors shrink-0"
        >
          + 新增一筆
        </button>
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
            <table className="text-xs border-collapse">
              <thead>
                <tr className="text-[11px] text-slate-400 bg-slate-50 whitespace-nowrap">
                  <th className="px-2 py-2 text-left font-semibold">證券公司</th>
                  <th className="px-2 py-2 text-left font-semibold">股票名稱</th>
                  <th className="px-2 py-2 text-left font-semibold">股票代碼</th>
                  <th className="px-2 py-2 text-left font-semibold">方案</th>
                  <th className="px-2 py-2 text-right font-semibold">股數</th>
                  <th className="px-2 py-2 text-right font-semibold">均價</th>
                  <th className="px-2 py-2 text-right font-semibold">當前</th>
                  <th className="px-2 py-2 text-left font-semibold">配息日</th>
                  <th className="px-2 py-2 text-right font-semibold">金額</th>
                  <th className="px-2 py-2 text-right font-semibold">折扣</th>
                  <th className="px-2 py-2 text-right font-semibold">盈虧</th>
                  <th className="px-2 py-2 text-right font-semibold">報酬率</th>
                  <th className="px-2 py-2 text-center font-semibold" colSpan={3}>未來可到價格</th>
                  <th className="px-2 py-2 text-right font-semibold">總額</th>
                  <th className="px-2 py-2 text-right font-semibold">第一次</th>
                  <th className="px-2 py-2 text-right font-semibold">第二次</th>
                  <th className="px-2 py-2 text-right font-semibold">第三次</th>
                  <th className="px-2 py-2 text-right font-semibold">第四次</th>
                  <th className="px-2 py-2 text-right font-semibold">第五次</th>
                  <th className="px-2 py-2 text-right font-semibold">第六次</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const calc = calcs[i];
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/70 transition-colors">
                      {textCol(row, "broker", "券商", "w-16")}
                      {textCol(row, "stockName", "名稱", "w-24")}
                      {textCol(row, "stockCode", "代碼", "w-16")}
                      {textCol(row, "plan", "方案", "w-12")}
                      {numCol(row, "shares", "股數", "w-16")}
                      {numCol(row, "avgPrice", "均價", "w-20")}
                      {numCol(row, "currentPrice", "當前", "w-20")}
                      {textCol(row, "dividendDate", "配息日", "w-16")}
                      {numCol(row, "dividendAmount", "金額", "w-16")}
                      {numCol(row, "discount", "1", "w-12")}
                      <td className={`px-2 py-1 text-right font-semibold whitespace-nowrap ${
                        calc.profitLoss == null ? "text-slate-300" : calc.profitLoss >= 0 ? "text-red-500" : "text-green-600"
                      }`}>
                        {calc.profitLoss == null ? "—" : fmt(calc.profitLoss)}
                      </td>
                      <td className={`px-2 py-1 text-right font-semibold whitespace-nowrap ${
                        calc.returnRate == null ? "text-slate-300" : calc.returnRate >= 0 ? "text-red-500" : "text-green-600"
                      }`}>
                        {calc.returnRate == null ? "—" : `${(calc.returnRate * 100).toFixed(2)}%`}
                      </td>
                      {textCol(row, "futureLow", "低", "w-14")}
                      {textCol(row, "futureMid", "中", "w-14")}
                      {textCol(row, "futureHigh", "高", "w-14")}
                      <td className="px-2 py-1 text-right text-slate-500 whitespace-nowrap">
                        {calc.totalAmount == null ? "—" : fmt(calc.totalAmount)}
                      </td>
                      {numCol(row, "batch1", "-", "w-16")}
                      {numCol(row, "batch2", "-", "w-16")}
                      {numCol(row, "batch3", "-", "w-16")}
                      {numCol(row, "batch4", "-", "w-16")}
                      {numCol(row, "batch5", "-", "w-16")}
                      {numCol(row, "batch6", "-", "w-16")}
                      <td className="px-2 py-1">
                        <button
                          onClick={() => handleDelete(row.id)}
                          className="text-slate-300 hover:text-red-500 transition-colors px-1"
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

      <p className="text-[11px] text-slate-400 mt-3">
        盈虧 = (股數 × 當前 − 股數 × 均價) − 買進手續費 − 賣出手續費 − 證券交易稅（賣出方向課徵0.3%）；
        手續費 = 成交金額 × {(feeRate * 100).toFixed(4)}% × 折扣（1 = 無折扣，0.6 = 6折）；報酬率 = 盈虧 ÷ (投入成本 + 買進手續費)
      </p>
    </div>
  );
}
