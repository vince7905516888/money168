"use client";

import { useState, useCallback } from "react";
import CandlestickChart, { type Candle, type IndicatorKey } from "@/components/market/CandlestickChart";

interface Quote {
  price: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  previousClose: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
}

interface StockData {
  symbol: string;
  name: string;
  currency: string;
  exchangeName: string;
  quote: Quote;
  candles: Candle[];
}

interface Fundamentals {
  trailingPE: number | null;
  forwardPE: number | null;
  marketCap: number | null;
  dividendRate: number | null;
  dividendYield: number | null;
  payoutRatio: number | null;
  beta: number | null;
  averageVolume: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
}

const INTERVAL_OPTIONS = [
  { value: "60m", label: "60分K" },
  { value: "1d", label: "日線" },
  { value: "1wk", label: "週線" },
  { value: "1mo", label: "月線" },
] as const;
type ChartInterval = (typeof INTERVAL_OPTIONS)[number]["value"];

const INDICATOR_OPTIONS: { key: IndicatorKey; label: string }[] = [
  { key: "KDJ", label: "KD" },
  { key: "RSI", label: "RSI" },
  { key: "MACD", label: "MACD" },
  { key: "DMI", label: "DMI" },
  { key: "BIAS", label: "乖離率" },
];

export default function UsStockPage() {
  const [codeInput, setCodeInput] = useState("AAPL");
  const [interval, setIntervalValue] = useState<ChartInterval>("1d");
  const [data, setData] = useState<StockData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fundamentals, setFundamentals] = useState<Fundamentals | null>(null);
  const [fundamentalsLoading, setFundamentalsLoading] = useState(false);
  const [indicators, setIndicators] = useState<IndicatorKey[]>([]);

  const toggleIndicator = (key: IndicatorKey) => {
    setIndicators((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const fetchStock = useCallback(async (symbol: string, iv: ChartInterval = "1d") => {
    const clean = symbol.trim().toUpperCase();
    if (!clean) return;
    setLoading(true);
    setError("");
    setFundamentals(null);
    try {
      const res = await fetch(`/api/market/us-stock/${clean}?interval=${iv}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error || "查無此股票代碼");
        setData(null);
        return;
      }
      const body: StockData = await res.json();
      setData(body);
      setCodeInput(body.symbol);
    } catch {
      setError("連線失敗，請稍後再試");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchFundamentals = useCallback(async (symbol: string) => {
    setFundamentalsLoading(true);
    try {
      const res = await fetch(`/api/market/us-stock/${symbol}/fundamentals`);
      if (res.ok) setFundamentals(await res.json());
      else setFundamentals(null);
    } catch {
      setFundamentals(null);
    } finally {
      setFundamentalsLoading(false);
    }
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchStock(codeInput, interval);
    fetchFundamentals(codeInput.trim().toUpperCase());
  };

  const handleIntervalChange = (iv: ChartInterval) => {
    setIntervalValue(iv);
    if (data) fetchStock(data.symbol, iv);
  };

  const fmt = (n: number | null, digits = 2) => (n == null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: digits }));
  const fmtBig = (n: number | null) => {
    if (n == null) return "—";
    if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
    if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
    return n.toLocaleString("en-US");
  };
  const fmtPct = (n: number | null) => (n == null ? "—" : `${(n * 100).toFixed(2)}%`);

  const change = data?.quote.price != null && data?.quote.previousClose != null
    ? data.quote.price - data.quote.previousClose
    : null;
  const changePct = change != null && data?.quote.previousClose ? change / data.quote.previousClose : null;

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">美國股市</h1>
        <p className="text-slate-500 text-sm mt-1">
          即時報價、K線圖與基本面資料，資料源為 Yahoo Finance（免費、非正式授權，可能延遲，僅供參考）
        </p>
      </div>

      {/* 搜尋 */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-6">
        <input
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value)}
          placeholder="輸入美股代碼，例如：AAPL、TSLA、NVDA"
          className="flex-1 border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors"
        />
        <button type="submit" disabled={loading}
          className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-60">
          {loading ? "查詢中..." : "查詢"}
        </button>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3 mb-6">{error}</div>
      )}

      {data && (
        <>
          {/* 報價卡片 */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
            <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-slate-900">{data.name}</h2>
                  <span className="text-sm text-slate-400 font-mono">{data.symbol}</span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{data.exchangeName} · {data.currency}</p>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-slate-900">{fmt(data.quote.price)}</div>
                {change != null && (
                  <div className={`text-sm font-semibold ${change >= 0 ? "text-red-500" : "text-green-600"}`}>
                    {change >= 0 ? "+" : ""}{fmt(change)}（{change >= 0 ? "+" : ""}{fmtPct(changePct)}）
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-xs text-slate-400 mb-0.5">今日區間</div>
                <div className="text-slate-700">{fmt(data.quote.dayLow)} - {fmt(data.quote.dayHigh)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-0.5">52週區間</div>
                <div className="text-slate-700">{fmt(data.quote.fiftyTwoWeekLow)} - {fmt(data.quote.fiftyTwoWeekHigh)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-0.5">成交量</div>
                <div className="text-slate-700">{fmtBig(data.quote.volume)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-0.5">前收盤</div>
                <div className="text-slate-700">{fmt(data.quote.previousClose)}</div>
              </div>
            </div>
          </div>

          {/* K線圖 */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <div className="flex gap-1.5">
                {INTERVAL_OPTIONS.map((opt) => (
                  <button key={opt.value} type="button" onClick={() => handleIntervalChange(opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      interval === opt.value ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    }`}>
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {INDICATOR_OPTIONS.map((opt) => (
                  <button key={opt.key} type="button" onClick={() => toggleIndicator(opt.key)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                      indicators.includes(opt.key) ? "bg-indigo-100 text-indigo-700" : "bg-slate-50 text-slate-400 hover:bg-slate-100"
                    }`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <CandlestickChart data={data.candles} indicators={indicators} />
          </div>

          {/* 基本面資料 */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-6">
            <div className="px-6 py-4 border-b border-slate-50">
              <h3 className="font-semibold text-slate-900">基本面資料</h3>
            </div>
            {fundamentalsLoading ? (
              <div className="py-10 text-center text-slate-400 text-sm">載入中...</div>
            ) : !fundamentals ? (
              <div className="py-10 text-center text-slate-400 text-sm">查無基本面資料</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-6 text-sm">
                <div>
                  <div className="text-xs text-slate-400 mb-0.5">本益比（TTM）</div>
                  <div className="text-slate-800 font-semibold">{fmt(fundamentals.trailingPE)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-0.5">預估本益比</div>
                  <div className="text-slate-800 font-semibold">{fmt(fundamentals.forwardPE)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-0.5">市值</div>
                  <div className="text-slate-800 font-semibold">{fmtBig(fundamentals.marketCap)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-0.5">Beta值</div>
                  <div className="text-slate-800 font-semibold">{fmt(fundamentals.beta)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-0.5">股息殖利率</div>
                  <div className="text-slate-800 font-semibold">{fmtPct(fundamentals.dividendYield)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-0.5">年配息金額</div>
                  <div className="text-slate-800 font-semibold">{fmt(fundamentals.dividendRate)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-0.5">配息率</div>
                  <div className="text-slate-800 font-semibold">{fmtPct(fundamentals.payoutRatio)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-0.5">平均成交量</div>
                  <div className="text-slate-800 font-semibold">{fmtBig(fundamentals.averageVolume)}</div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {!data && !loading && !error && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm py-16 text-center text-slate-400 text-sm">
          輸入美股代碼開始查詢
        </div>
      )}
    </div>
  );
}
