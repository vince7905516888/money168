"use client";

import { useState, useCallback, useEffect } from "react";
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
  ReferenceLine,
  Cell,
} from "recharts";

const SYNC_ID = "tw-stock-charts";

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

// 個股基本面統計：營收/EPS(季)/本益比/殖利率來自證交所公開資料，
// EPS(近4季)、ROE(近4季)由系統逐季累積歷史 EPS 快照，累積滿4季後才會有值（見 tw-stock-fundamentals.ts）。
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

// 三大法人買賣超（張）：來自證交所 T86 當日全部股票日報表，僅涵蓋上市股票
interface InstitutionalData {
  date: string;
  foreignNetLots: number;
  trustNetLots: number;
  dealerNetLots: number;
  totalNetLots: number;
}

// 融資融券餘額（張）：來自證交所 MI_MARGN 當日全部股票日報表，僅涵蓋上市股票
interface MarginData {
  date: string;
  marginBalance: number;
  marginChange: number;
  shortBalance: number;
  shortChange: number;
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
  rsi: number | null;
  k: number | null;
  d: number | null;
  j: number | null;
  macdDif: number | null;
  macdDea: number | null;
  macdHist: number | null;
  plusDI: number | null;
  minusDI: number | null;
  adx: number | null;
  bias6: number | null;
  bias12: number | null;
  bias24: number | null;
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

// RSI(14)：Wilder 平滑移動平均，台股看盤軟體常見算法
function computeRSI(closes: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null);
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1];
    const gain = Math.max(delta, 0);
    const loss = Math.max(-delta, 0);
    if (i <= period) {
      avgGain += gain;
      avgLoss += loss;
      if (i === period) {
        avgGain /= period;
        avgLoss /= period;
        result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
      }
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    }
  }
  return result;
}

// KDJ(9,3,3)：RSV 取近 9 日高低，K/D 用平滑因子 1/3，台股看盤軟體常見算法
function computeKDJ(quotes: Quote[], period = 9) {
  const k: (number | null)[] = new Array(quotes.length).fill(null);
  const d: (number | null)[] = new Array(quotes.length).fill(null);
  const j: (number | null)[] = new Array(quotes.length).fill(null);
  let prevK = 50;
  let prevD = 50;
  for (let i = 0; i < quotes.length; i++) {
    if (i + 1 < period) continue;
    let highN = -Infinity;
    let lowN = Infinity;
    for (let n = i - period + 1; n <= i; n++) {
      highN = Math.max(highN, quotes[n].high);
      lowN = Math.min(lowN, quotes[n].low);
    }
    const rsv = highN === lowN ? 50 : ((quotes[i].close - lowN) / (highN - lowN)) * 100;
    const curK = (prevK * 2 + rsv) / 3;
    const curD = (prevD * 2 + curK) / 3;
    k[i] = curK;
    d[i] = curD;
    j[i] = 3 * curK - 2 * curD;
    prevK = curK;
    prevD = curD;
  }
  return { k, d, j };
}

function ema(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length);
  const factor = 2 / (period + 1);
  result[0] = values[0];
  for (let i = 1; i < values.length; i++) {
    result[i] = values[i] * factor + result[i - 1] * (1 - factor);
  }
  return result;
}

// MACD(12,26,9)：DIF = EMA12 - EMA26，DEA = DIF 的 EMA9，柱狀圖 = DIF - DEA
function computeMACD(closes: number[]) {
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const dif = closes.map((_, i) => ema12[i] - ema26[i]);
  const dea = ema(dif, 9);
  const hist = dif.map((v, i) => v - dea[i]);
  return { dif, dea, hist };
}

// 乖離率 BIAS(n) = (收盤價 - n日均線) / n日均線 * 100，台股常用 6/12/24 日
function computeBIAS(closes: number[], period: number): (number | null)[] {
  return closes.map((c, i) => {
    const ma = sma(closes, period, i);
    return ma != null && ma !== 0 ? ((c - ma) / ma) * 100 : null;
  });
}

// DMI/ADX(14)：Wilder 平滑，+DI/-DI 判斷多空方向，ADX 判斷趨勢強弱，台股看盤軟體常見算法
function computeDMI(quotes: Quote[], period = 14) {
  const n = quotes.length;
  const plusDI: (number | null)[] = new Array(n).fill(null);
  const minusDI: (number | null)[] = new Array(n).fill(null);
  const adx: (number | null)[] = new Array(n).fill(null);

  const tr: number[] = new Array(n).fill(0);
  const plusDM: number[] = new Array(n).fill(0);
  const minusDM: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const upMove = quotes[i].high - quotes[i - 1].high;
    const downMove = quotes[i - 1].low - quotes[i].low;
    plusDM[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDM[i] = downMove > upMove && downMove > 0 ? downMove : 0;
    tr[i] = Math.max(
      quotes[i].high - quotes[i].low,
      Math.abs(quotes[i].high - quotes[i - 1].close),
      Math.abs(quotes[i].low - quotes[i - 1].close)
    );
  }

  let smoothTR = 0;
  let smoothPlusDM = 0;
  let smoothMinusDM = 0;
  let prevADX: number | null = null;
  const dxHistory: number[] = [];

  for (let i = 1; i < n; i++) {
    if (i <= period) {
      smoothTR += tr[i];
      smoothPlusDM += plusDM[i];
      smoothMinusDM += minusDM[i];
      if (i === period) {
        const pDI = smoothTR === 0 ? 0 : (100 * smoothPlusDM) / smoothTR;
        const mDI = smoothTR === 0 ? 0 : (100 * smoothMinusDM) / smoothTR;
        plusDI[i] = pDI;
        minusDI[i] = mDI;
        const dx = pDI + mDI === 0 ? 0 : (100 * Math.abs(pDI - mDI)) / (pDI + mDI);
        dxHistory.push(dx);
      }
    } else {
      smoothTR = smoothTR - smoothTR / period + tr[i];
      smoothPlusDM = smoothPlusDM - smoothPlusDM / period + plusDM[i];
      smoothMinusDM = smoothMinusDM - smoothMinusDM / period + minusDM[i];
      const pDI = smoothTR === 0 ? 0 : (100 * smoothPlusDM) / smoothTR;
      const mDI = smoothTR === 0 ? 0 : (100 * smoothMinusDM) / smoothTR;
      plusDI[i] = pDI;
      minusDI[i] = mDI;
      const dx = pDI + mDI === 0 ? 0 : (100 * Math.abs(pDI - mDI)) / (pDI + mDI);
      dxHistory.push(dx);

      if (dxHistory.length === period) {
        prevADX = dxHistory.reduce((s, v) => s + v, 0) / period;
        adx[i] = prevADX;
      } else if (dxHistory.length > period && prevADX != null) {
        prevADX = (prevADX * (period - 1) + dx) / period;
        adx[i] = prevADX;
      }
    }
  }

  return { plusDI, minusDI, adx };
}

function buildChartRows(quotes: Quote[]): ChartRow[] {
  const closes = quotes.map((q) => q.close);
  const rsi = computeRSI(closes);
  const { k, d, j } = computeKDJ(quotes);
  const { dif, dea, hist } = computeMACD(closes);
  const { plusDI, minusDI, adx } = computeDMI(quotes);
  const bias6 = computeBIAS(closes, 6);
  const bias12 = computeBIAS(closes, 12);
  const bias24 = computeBIAS(closes, 24);
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
      rsi: rsi[i],
      k: k[i],
      d: d[i],
      j: j[i],
      macdDif: dif[i],
      macdDea: dea[i],
      macdHist: hist[i],
      plusDI: plusDI[i],
      minusDI: minusDI[i],
      adx: adx[i],
      bias6: bias6[i],
      bias12: bias12[i],
      bias24: bias24[i],
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

  // 個股資訊：營收/EPS(季)/本益比/殖利率已接證交所公開資料，EPS(近4季)、ROE(近4季)
  // 需要額外的歷史季度或資產負債表資料，目前尚未找到可靠免費來源，固定回傳 null。
  const [fundamentals, setFundamentals] = useState<FundamentalStats | null>(null);
  // 以下籌碼排行目前沒有串接來源，先保留 UI 版位與資料結構、全部給空陣列。
  const [buyRanking] = useState<ChipRanking[]>([]);
  const [sellRanking] = useState<ChipRanking[]>([]);

  // 三大法人買賣超、融資融券：真的接了證交所公開資料
  const [institutional, setInstitutional] = useState<InstitutionalData | null>(null);
  const [margin, setMargin] = useState<MarginData | null>(null);

  // 散戶持股比率：門檻可調整，但目前找不到能對上台股代碼的免費集保資料源，先留 UI、資料待確認
  const [retailThreshold, setRetailThreshold] = useState("20");

  // 三個技術指標小窗口：都用同一個 syncId，滑鼠移到任一張圖，其他圖的十字線/提示會同步移動
  const [showKDJ, setShowKDJ] = useState(true);
  const [showRSI, setShowRSI] = useState(true);
  const [showMACD, setShowMACD] = useState(true);
  const [showDMI, setShowDMI] = useState(false);
  const [showBIAS, setShowBIAS] = useState(false);

  const fetchStock = useCallback(async (code: string) => {
    setLoading(true);
    setError(null);
    setInstitutional(null);
    setMargin(null);
    setFundamentals(null);
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

      // 三大法人／融資融券目前僅涵蓋上市股票，查詢失敗就靜默保留空值（版位仍會顯示「尚未取得資料」）
      fetch(`/api/market/tw-stock/${code}/institutional`)
        .then((r) => (r.ok ? r.json() : null))
        .then((body) => {
          if (body?.institutional) setInstitutional(body.institutional);
          if (body?.margin) setMargin(body.margin);
        })
        .catch(() => {});

      fetch(`/api/market/tw-stock/${code}/fundamentals`)
        .then((r) => (r.ok ? r.json() : null))
        .then((body) => {
          if (body) setFundamentals(body);
        })
        .catch(() => {});
    } catch {
      setError("查詢失敗，請稍後再試");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // 搜尋股票：可打代碼或中文名稱，輸入時即時查詢比對結果做成下拉選單
  const [searchResults, setSearchResults] = useState<{ code: string; name: string; market: "TW" | "TWO" }[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    const q = codeInput.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/market/tw-stock/search?q=${encodeURIComponent(q)}`);
        if (res.ok) setSearchResults(await res.json());
      } catch {
        // 搜尋失敗就不顯示下拉選單，不影響直接輸入代碼查詢
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [codeInput]);

  const selectSearchResult = (r: { code: string; name: string }) => {
    setCodeInput(r.code);
    setDropdownOpen(false);
    setSearchResults([]);
    fetchStock(r.code);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = codeInput.trim();
    if (!q) return;
    setDropdownOpen(false);
    if (/^\d+$/.test(q)) {
      fetchStock(q);
    } else if (searchResults.length > 0) {
      setCodeInput(searchResults[0].code);
      fetchStock(searchResults[0].code);
    } else {
      setError("查無符合的股票，請確認代碼或名稱");
    }
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
        <div className="relative w-56">
          <input
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            onFocus={() => setDropdownOpen(true)}
            onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
            placeholder="輸入股票代碼或中文名稱，例如 2330 或 台積電"
            autoComplete="off"
            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:border-indigo-400 transition-colors"
          />
          {dropdownOpen && searchResults.length > 0 && (
            <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
              {searchResults.map((r) => (
                <button
                  key={r.code}
                  type="button"
                  onClick={() => selectSearchResult(r)}
                  className="w-full flex items-center justify-between px-4 py-2 text-sm text-left hover:bg-slate-50 transition-colors"
                >
                  <span className="text-slate-700">{r.name}</span>
                  <span className="flex items-center gap-1.5 text-xs text-slate-400">
                    {r.code}
                    <span className="px-1 py-0.5 rounded bg-slate-100">{r.market === "TW" ? "上市" : "上櫃"}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
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
              <ComposedChart data={rows} syncId={SYNC_ID} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
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
              <BarChart data={rows} syncId={SYNC_ID} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={30} />
                <YAxis tick={{ fontSize: 11 }} width={56} />
                <Tooltip formatter={(value) => [Number(value).toLocaleString("zh-TW"), "成交量"]} />
                <Bar dataKey="volume" fill="#94a3b8" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 技術指標小窗口：跟上面 K 線、成交量共用同一個 syncId 同步游標 */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
            <div className="flex items-center gap-4 text-xs mb-3 flex-wrap">
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-600">
                <input type="checkbox" checked={showKDJ} onChange={(e) => setShowKDJ(e.target.checked)} className="accent-indigo-500" />
                KDJ
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-600">
                <input type="checkbox" checked={showRSI} onChange={(e) => setShowRSI(e.target.checked)} className="accent-indigo-500" />
                RSI
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-600">
                <input type="checkbox" checked={showMACD} onChange={(e) => setShowMACD(e.target.checked)} className="accent-indigo-500" />
                MACD
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-600">
                <input type="checkbox" checked={showDMI} onChange={(e) => setShowDMI(e.target.checked)} className="accent-indigo-500" />
                DMI
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-600">
                <input type="checkbox" checked={showBIAS} onChange={(e) => setShowBIAS(e.target.checked)} className="accent-indigo-500" />
                乖離率
              </label>
            </div>

            {showKDJ && (
              <div className="mb-4">
                <div className="flex items-center gap-3 text-xs mb-1.5 text-slate-500">
                  <span className="font-medium text-slate-600">KDJ(9,3,3)</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-amber-500 inline-block" />K</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-blue-500 inline-block" />D</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-purple-500 inline-block" />J</span>
                </div>
                <ResponsiveContainer width="100%" height={150}>
                  <ComposedChart data={rows} syncId={SYNC_ID} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={30} />
                    <YAxis tick={{ fontSize: 11 }} width={56} />
                    <Tooltip formatter={(value, name) => [fmtNum(Number(value)), String(name)]} />
                    <Line type="monotone" dataKey="k" stroke="#f59e0b" dot={false} strokeWidth={1.5} connectNulls />
                    <Line type="monotone" dataKey="d" stroke="#3b82f6" dot={false} strokeWidth={1.5} connectNulls />
                    <Line type="monotone" dataKey="j" stroke="#a855f7" dot={false} strokeWidth={1.5} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}

            {showRSI && (
              <div className="mb-4">
                <div className="flex items-center gap-3 text-xs mb-1.5 text-slate-500">
                  <span className="font-medium text-slate-600">RSI(14)</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-indigo-500 inline-block" />RSI</span>
                </div>
                <ResponsiveContainer width="100%" height={150}>
                  <ComposedChart data={rows} syncId={SYNC_ID} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={30} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} width={56} />
                    <Tooltip formatter={(value, name) => [fmtNum(Number(value)), String(name)]} />
                    <ReferenceLine y={70} stroke="#fca5a5" strokeDasharray="4 3" />
                    <ReferenceLine y={30} stroke="#86efac" strokeDasharray="4 3" />
                    <Line type="monotone" dataKey="rsi" stroke="#6366f1" dot={false} strokeWidth={1.5} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}

            {showMACD && (
              <div className={showDMI || showBIAS ? "mb-4" : ""}>
                <div className="flex items-center gap-3 text-xs mb-1.5 text-slate-500">
                  <span className="font-medium text-slate-600">MACD(12,26,9)</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-amber-500 inline-block" />DIF</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-blue-500 inline-block" />DEA</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-slate-300 inline-block" />柱狀圖</span>
                </div>
                <ResponsiveContainer width="100%" height={150}>
                  <ComposedChart data={rows} syncId={SYNC_ID} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={30} />
                    <YAxis tick={{ fontSize: 11 }} width={56} />
                    <Tooltip formatter={(value, name) => [fmtNum(Number(value)), String(name)]} />
                    <ReferenceLine y={0} stroke="#e2e8f0" />
                    <Bar dataKey="macdHist" isAnimationActive={false}>
                      {rows.map((r, idx) => (
                        <Cell key={idx} fill={(r.macdHist ?? 0) >= 0 ? "#fca5a5" : "#86efac"} />
                      ))}
                    </Bar>
                    <Line type="monotone" dataKey="macdDif" stroke="#f59e0b" dot={false} strokeWidth={1.5} connectNulls />
                    <Line type="monotone" dataKey="macdDea" stroke="#3b82f6" dot={false} strokeWidth={1.5} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}

            {showDMI && (
              <div className={showBIAS ? "mb-4" : ""}>
                <div className="flex items-center gap-3 text-xs mb-1.5 text-slate-500">
                  <span className="font-medium text-slate-600">DMI/ADX(14)</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-red-500 inline-block" />+DI</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-green-600 inline-block" />-DI</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-slate-500 inline-block" />ADX</span>
                </div>
                <ResponsiveContainer width="100%" height={150}>
                  <ComposedChart data={rows} syncId={SYNC_ID} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={30} />
                    <YAxis tick={{ fontSize: 11 }} width={56} />
                    <Tooltip formatter={(value, name) => [fmtNum(Number(value)), String(name)]} />
                    <Line type="monotone" dataKey="plusDI" stroke="#ef4444" dot={false} strokeWidth={1.5} connectNulls />
                    <Line type="monotone" dataKey="minusDI" stroke="#16a34a" dot={false} strokeWidth={1.5} connectNulls />
                    <Line type="monotone" dataKey="adx" stroke="#64748b" dot={false} strokeWidth={1.5} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}

            {showBIAS && (
              <div>
                <div className="flex items-center gap-3 text-xs mb-1.5 text-slate-500">
                  <span className="font-medium text-slate-600">乖離率 BIAS</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-amber-500 inline-block" />BIAS6</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-blue-500 inline-block" />BIAS12</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-purple-500 inline-block" />BIAS24</span>
                </div>
                <ResponsiveContainer width="100%" height={150}>
                  <ComposedChart data={rows} syncId={SYNC_ID} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={30} />
                    <YAxis tick={{ fontSize: 11 }} width={56} />
                    <Tooltip formatter={(value, name) => [`${fmtNum(Number(value))}%`, String(name)]} />
                    <ReferenceLine y={0} stroke="#e2e8f0" />
                    <Line type="monotone" dataKey="bias6" stroke="#f59e0b" dot={false} strokeWidth={1.5} connectNulls />
                    <Line type="monotone" dataKey="bias12" stroke="#3b82f6" dot={false} strokeWidth={1.5} connectNulls />
                    <Line type="monotone" dataKey="bias24" stroke="#a855f7" dot={false} strokeWidth={1.5} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* 個股資訊（基本面）：營收/EPS(季)/本益比/殖利率為證交所公開資料真實數值，
              EPS(近4季)、ROE(近4季)靠系統逐季自動累積歷史 EPS 快照，累積滿4季後才會顯示數值 */}
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
            <p className="text-[11px] text-slate-400 mt-4">
              EPS(近4季)、ROE(近4季)由系統每季自動累積歷史資料，累積滿4季後自動顯示；其餘欄位為證交所公開資料
            </p>
          </div>

          {/* 三大法人買賣超：真實資料，來源證交所 T86（僅涵蓋上市） */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">三大法人買賣超（張）</h3>
            {institutional ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {([
                    ["外資", institutional.foreignNetLots],
                    ["投信", institutional.trustNetLots],
                    ["自營商", institutional.dealerNetLots],
                    ["合計", institutional.totalNetLots],
                  ] as const).map(([label, value]) => (
                    <div key={label}>
                      <div className="text-xs text-slate-400 mb-0.5">{label}</div>
                      <div className={`text-lg font-semibold ${value >= 0 ? "text-red-500" : "text-green-600"}`}>
                        {value >= 0 ? "+" : ""}{value.toLocaleString("zh-TW")}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-4">資料日期 {institutional.date} · 資料源：證交所 T86</p>
              </>
            ) : (
              <div className="text-sm text-slate-400">尚未取得資料（僅涵蓋上市股票，上櫃股票暫無此資料）</div>
            )}
          </div>

          {/* 融資融券餘額：真實資料，來源證交所 MI_MARGN（僅涵蓋上市） */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">融資融券餘額（張）</h3>
            {margin ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-slate-400 mb-0.5">融資餘額</div>
                    <div className="text-lg font-semibold text-slate-700">{margin.marginBalance.toLocaleString("zh-TW")}</div>
                    <div className={`text-xs mt-0.5 ${margin.marginChange >= 0 ? "text-red-500" : "text-green-600"}`}>
                      {margin.marginChange >= 0 ? "+" : ""}{margin.marginChange.toLocaleString("zh-TW")}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 mb-0.5">融券餘額</div>
                    <div className="text-lg font-semibold text-slate-700">{margin.shortBalance.toLocaleString("zh-TW")}</div>
                    <div className={`text-xs mt-0.5 ${margin.shortChange >= 0 ? "text-red-500" : "text-green-600"}`}>
                      {margin.shortChange >= 0 ? "+" : ""}{margin.shortChange.toLocaleString("zh-TW")}
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 mt-4">資料日期 {margin.date} · 資料源：證交所 MI_MARGN</p>
              </>
            ) : (
              <div className="text-sm text-slate-400">尚未取得資料（僅涵蓋上市股票，上櫃股票暫無此資料）</div>
            )}
          </div>

          {/* 散戶持股比率：門檻可調整，但目前沒有能對上台股代碼的免費集保資料源，先留 UI 版位 */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700">散戶持股比率</h3>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>門檻</span>
                <select
                  value={retailThreshold}
                  onChange={(e) => setRetailThreshold(e.target.value)}
                  className="border border-slate-200 rounded-lg px-2 py-1 text-xs focus:border-indigo-400 transition-colors"
                >
                  <option value="20">20張以下</option>
                  <option value="50">50張以下</option>
                  <option value="100">100張以下</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-center h-16 text-sm text-slate-400 border border-dashed border-slate-200 rounded-xl">
              尚未串接集保股權分散資料源，僅保留版位（門檻選單已可切換）
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            {/* 當日主力動向：以三大法人合計買賣超作為替代指標，非真正的券商分點籌碼 */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col items-center justify-center text-center">
              <div className="text-xs text-slate-400 mb-2">當日主力動向</div>
              {institutional ? (
                <>
                  <div className={`text-xl font-bold ${institutional.totalNetLots >= 0 ? "text-red-500" : "text-green-600"}`}>
                    {institutional.totalNetLots >= 0 ? "買超" : "賣超"}
                  </div>
                  <div className="text-sm text-slate-600 mt-1">{Math.abs(institutional.totalNetLots).toLocaleString("zh-TW")} 張</div>
                  <div className="text-[10px] text-slate-400 mt-1">以三大法人合計買賣超估算</div>
                </>
              ) : (
                <div className="text-sm text-slate-400 mt-2">尚未取得資料</div>
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
