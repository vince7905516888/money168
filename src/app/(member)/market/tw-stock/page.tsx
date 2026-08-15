"use client";

import { useState, useCallback } from "react";
import {
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface Quote {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface StockData {
  code: string;
  market: "TW" | "TWO";
  name: string;
  currency: string;
  quotes: Quote[];
}

interface ChartRow extends Quote {
  range: [number, number];
  ma5: number | null;
  ma20: number | null;
  ma60: number | null;
  ma120: number | null;
  bbUpper: number | null;
  bbLower: number | null;
}

function sma(values: number[], period: number, index: number): number | null {
  if (index + 1 < period) return null;
  let sum = 0;
  for (let i = index - period + 1; i <= index; i++) sum += values[i];
  return sum / period;
}

function stddev(values: number[], period: number, index: number, mean: number): number | null {
  if (index + 1 < period) return null;
  let sumSq = 0;
  for (let i = index - period + 1; i <= index; i++) sumSq += (values[i] - mean) ** 2;
  return Math.sqrt(sumSq / period);
}

function buildChartRows(quotes: Quote[]): ChartRow[] {
  const closes = quotes.map((q) => q.close);
  return quotes.map((q, i) => {
    const ma20 = sma(closes, 20, i);
    const bbStd = ma20 != null ? stddev(closes, 20, i, ma20) : null;
    return {
      ...q,
      range: [q.low, q.high],
      ma5: sma(closes, 5, i),
      ma20,
      ma60: sma(closes, 60, i),
      ma120: sma(closes, 120, i),
      bbUpper: ma20 != null && bbStd != null ? ma20 + 2 * bbStd : null,
      bbLower: ma20 != null && bbStd != null ? ma20 - 2 * bbStd : null,
    };
  });
}

// recharts range-bar 技巧：Bar 的 dataKey 回傳 [low, high]，畫布上 y/height 對應這個區間，
// 開高低收其餘位置用線性內插算出像素座標，藉此手繪 K 棒（不用額外圖表套件）。
function CandleShape(props: unknown) {
  const p = props as { x: number; y: number; width: number; height: number; payload: ChartRow };
  const { x, y, width, height, payload } = p;
  const { open, close, high, low } = payload;
  if (height <= 0 || high === low) return null;

  const pxPerUnit = height / (high - low);
  const toY = (v: number) => y + (high - v) * pxPerUnit;

  const isUp = close >= open;
  const color = isUp ? "#ef4444" : "#22c55e"; // 台股習慣：紅漲綠跌
  const bodyTop = toY(Math.max(open, close));
  const bodyBottom = toY(Math.min(open, close));
  const bodyHeight = Math.max(bodyBottom - bodyTop, 1);
  const centerX = x + width / 2;

  return (
    <g>
      <line x1={centerX} x2={centerX} y1={y} y2={y + height} stroke={color} strokeWidth={1} />
      <rect x={x} y={bodyTop} width={width} height={bodyHeight} fill={color} />
    </g>
  );
}

const fmtNum = (n: number | null | undefined, digits = 2) =>
  n == null ? "—" : n.toLocaleString("zh-TW", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export default function TwStockPage() {
  const [codeInput, setCodeInput] = useState("2330");
  const [data, setData] = useState<StockData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStock = useCallback(async (code: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/market/tw-stock/${code}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "查詢失敗");
        setData(null);
        return;
      }
      const json: StockData = await res.json();
      setData(json);
    } catch {
      setError("查詢失敗，請稍後再試");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!codeInput.trim()) return;
    fetchStock(codeInput.trim());
  };

  const rows = data ? buildChartRows(data.quotes) : [];
  const last = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  const change = last && prev ? last.close - prev.close : null;
  const changePct = last && prev ? (change! / prev.close) * 100 : null;

  return (
    <div className="max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">台灣股市</h1>
        <p className="text-slate-500 text-sm mt-1">K線、均線、布林通道與成交量（資料源：Yahoo Finance，可能延遲，僅供參考）</p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2 mb-6">
        <input
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value)}
          placeholder="輸入股票代碼，例如 2330"
          className="w-56 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:border-indigo-400 transition-colors"
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-60"
        >
          {loading ? "查詢中..." : "查詢"}
        </button>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3 mb-6">{error}</div>
      )}

      {data && last && (
        <>
          {/* 報價卡 */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h2 className="text-lg font-bold text-slate-900">
                {data.code} {data.name}
              </h2>
              <span className="text-xs text-slate-400">{data.market === "TW" ? "上市" : "上櫃"} · {last.date}</span>
            </div>
            <div className="flex items-baseline gap-3 mt-2">
              <span className="text-3xl font-bold text-slate-900">{fmtNum(last.close)}</span>
              {change != null && changePct != null && (
                <span className={`text-sm font-semibold ${change >= 0 ? "text-red-500" : "text-green-600"}`}>
                  {change >= 0 ? "▲" : "▼"} {fmtNum(Math.abs(change))} ({fmtNum(Math.abs(changePct))}%)
                </span>
              )}
            </div>
            <div className="grid grid-cols-4 gap-4 mt-4 text-sm">
              <div><div className="text-xs text-slate-400 mb-0.5">開盤</div>{fmtNum(last.open)}</div>
              <div><div className="text-xs text-slate-400 mb-0.5">最高</div>{fmtNum(last.high)}</div>
              <div><div className="text-xs text-slate-400 mb-0.5">最低</div>{fmtNum(last.low)}</div>
              <div><div className="text-xs text-slate-400 mb-0.5">成交量</div>{last.volume?.toLocaleString("zh-TW") ?? "—"}</div>
            </div>
          </div>

          {/* K線 + 均線 + 布林通道 */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-4">
            <div className="flex items-center gap-4 text-xs mb-3 text-slate-500">
              <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-amber-400 inline-block" />MA5</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-blue-500 inline-block" />MA20</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-purple-500 inline-block" />MA60</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-slate-400 inline-block" />MA120</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-indigo-300 inline-block" />布林通道</span>
            </div>
            <ResponsiveContainer width="100%" height={380}>
              <ComposedChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={30} />
                <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11 }} width={56} />
                <Tooltip
                  formatter={(value, name) => [fmtNum(Number(value)), String(name)]}
                  labelFormatter={(label) => label}
                />
                <Bar dataKey="range" shape={CandleShape} isAnimationActive={false} />
                <Line type="monotone" dataKey="ma5" stroke="#fbbf24" dot={false} strokeWidth={1.5} connectNulls />
                <Line type="monotone" dataKey="ma20" stroke="#3b82f6" dot={false} strokeWidth={1.5} connectNulls />
                <Line type="monotone" dataKey="ma60" stroke="#a855f7" dot={false} strokeWidth={1.5} connectNulls />
                <Line type="monotone" dataKey="ma120" stroke="#94a3b8" dot={false} strokeWidth={1.5} connectNulls />
                <Line type="monotone" dataKey="bbUpper" stroke="#c7d2fe" dot={false} strokeWidth={1} connectNulls strokeDasharray="4 3" />
                <Line type="monotone" dataKey="bbLower" stroke="#c7d2fe" dot={false} strokeWidth={1} connectNulls strokeDasharray="4 3" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* 成交量 */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
            <div className="text-xs text-slate-400 mb-2">成交量</div>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={30} />
                <YAxis tick={{ fontSize: 11 }} width={56} />
                <Tooltip formatter={(value) => [Number(value).toLocaleString("zh-TW"), "成交量"]} />
                <Bar dataKey="volume" fill="#94a3b8" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 籌碼分析 / 基本面：資料建置中版位 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">籌碼分析（買超 / 賣超）</h3>
              <div className="flex items-center justify-center h-32 text-sm text-slate-400 border border-dashed border-slate-200 rounded-xl">
                券商分點資料建置中
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">基本面（EPS / 營收 / ROE）</h3>
              <div className="flex items-center justify-center h-32 text-sm text-slate-400 border border-dashed border-slate-200 rounded-xl">
                財報資料建置中
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
