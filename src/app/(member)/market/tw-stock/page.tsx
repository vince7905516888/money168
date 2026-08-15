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

// 個股基本面統計：需要另外串接財報/公開資訊觀測站類的 API 才能填值，目前先保留版位、全部 null。
interface FundamentalStats {
  cumulativeRevenueYoY: number | null; // 累計營收YoY(%)
  revenueYoY: number | null; // 營收YoY(%)
  revenueMoM: number | null; // 營收MoM(%)
  epsQuarter: number | null; // EPS(季)
  eps4Q: number | null; // EPS(近4季)
  per: number | null; // 本益比
  dividendYield: number | null; // 殖利率(%)
  roe4Q: number | null; // ROE(近4季)
}

// 當日主力動向：需要券商分點籌碼資料 API，目前先保留版位。
interface MainForceFlow {
  direction: "BUY" | "SELL" | null;
  volume: number | null; // 張數
}

// 買超/賣超前 15 名分點：需要券商分點籌碼資料 API，目前先保留版位、欄位對齊圖片參考的分點排行表。
interface ChipRanking {
  brokerName: string;
  netVolume: number; // 買賣超（張）
  buyVolume: number; // 買張
  sellVolume: number; // 賣張
  avgBuyPrice: number; // 買均價
  avgSellPrice: number; // 賣均價
  totalVolume: number; // 交易量
  profitLoss: number; // 損益（萬）
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

  // 以下三份資料目前沒有串接來源，先保留 UI 版位與資料結構、全部給 null/空陣列。
  // 之後串接籌碼/財報 API 時，把對應的 fetch 邏輯接上、setState 即可，UI 不用再改。
  const [fundamentals] = useState<FundamentalStats | null>(null);
  const [mainForce] = useState<MainForceFlow | null>(null);
  const [buyRanking] = useState<ChipRanking[]>([]);
  const [sellRanking] = useState<ChipRanking[]>([]);

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

          {/* 個股資訊（基本面）：版位對齊圖片參考，欄位尚未串接資料源 */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">個股資訊</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {([
                ["累計營收YoY(%)", fundamentals?.cumulativeRevenueYoY],
                ["營收YoY(%)", fundamentals?.revenueYoY],
                ["營收MoM(%)", fundamentals?.revenueMoM],
                ["EPS(季)", fundamentals?.epsQuarter],
                ["EPS(近4季)", fundamentals?.eps4Q],
                ["本益比", fundamentals?.per],
                ["殖利率(%)", fundamentals?.dividendYield],
                ["ROE(近4季)", fundamentals?.roe4Q],
              ] as const).map(([label, value]) => (
                <div key={label}>
                  <div className="text-xs text-slate-400 mb-0.5">{label}</div>
                  <div className="text-sm font-semibold text-slate-700">{fmtNum(value)}</div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-4">尚未串接財報資料源，僅保留版位</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            {/* 當日主力動向 */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col items-center justify-center text-center">
              <div className="text-xs text-slate-400 mb-2">當日主力動向</div>
              {mainForce?.direction ? (
                <>
                  <div className={`text-xl font-bold ${mainForce.direction === "BUY" ? "text-red-500" : "text-green-600"}`}>
                    {mainForce.direction === "BUY" ? "買超" : "賣超"}
                  </div>
                  <div className="text-sm text-slate-600 mt-1">{fmtNum(mainForce.volume, 0)} 張</div>
                </>
              ) : (
                <div className="text-sm text-slate-400 mt-2">尚未串接籌碼資料源</div>
              )}
            </div>

            {/* 買超前15 */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-red-50 border-b border-red-100">
                <h3 className="text-sm font-semibold text-red-600">買超前15名</h3>
              </div>
              <ChipTable rows={buyRanking} />
            </div>
          </div>

          {/* 賣超前15 */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-emerald-50 border-b border-emerald-100">
              <h3 className="text-sm font-semibold text-emerald-700">賣超前15名</h3>
            </div>
            <ChipTable rows={sellRanking} />
          </div>
        </>
      )}
    </div>
  );
}

function ChipTable({ rows }: { rows: ChipRanking[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-slate-400 border-b border-slate-50">
            <th className="text-left font-semibold px-4 py-2.5">券商名稱</th>
            <th className="text-right font-semibold px-4 py-2.5">買賣超</th>
            <th className="text-right font-semibold px-4 py-2.5">買張</th>
            <th className="text-right font-semibold px-4 py-2.5">賣張</th>
            <th className="text-right font-semibold px-4 py-2.5">買均價</th>
            <th className="text-right font-semibold px-4 py-2.5">賣均價</th>
            <th className="text-right font-semibold px-4 py-2.5">交易量</th>
            <th className="text-right font-semibold px-4 py-2.5">損益(萬)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={8} className="py-8 text-center text-slate-400">
                尚未串接券商分點資料源，可在此處接上資料後填入表格
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.brokerName} className="text-slate-700">
                <td className="px-4 py-2.5">{r.brokerName}</td>
                <td className={`px-4 py-2.5 text-right font-semibold ${r.netVolume >= 0 ? "text-red-500" : "text-green-600"}`}>
                  {r.netVolume >= 0 ? "+" : ""}{r.netVolume.toLocaleString("zh-TW")}
                </td>
                <td className="px-4 py-2.5 text-right">{r.buyVolume.toLocaleString("zh-TW")}</td>
                <td className="px-4 py-2.5 text-right">{r.sellVolume.toLocaleString("zh-TW")}</td>
                <td className="px-4 py-2.5 text-right">{r.avgBuyPrice.toFixed(2)}</td>
                <td className="px-4 py-2.5 text-right">{r.avgSellPrice.toFixed(2)}</td>
                <td className="px-4 py-2.5 text-right">{r.totalVolume.toLocaleString("zh-TW")}</td>
                <td className={`px-4 py-2.5 text-right ${r.profitLoss >= 0 ? "text-red-500" : "text-green-600"}`}>
                  {r.profitLoss.toLocaleString("zh-TW")}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
