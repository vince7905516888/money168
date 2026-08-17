"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import CandlestickChart, { type Candle, type IndicatorKey } from "@/components/market/CandlestickChart";

// Kraken沒有BNB（競爭對手交易所自家代幣，Kraken不上架），暫時只有這5個。
const SYMBOLS = [
  { value: "BTC", label: "BTC / USD" },
  { value: "ETH", label: "ETH / USD" },
  { value: "SOL", label: "SOL / USD" },
  { value: "XRP", label: "XRP / USD" },
  { value: "DOGE", label: "DOGE / USD" },
];

const INTERVALS = [
  { value: "15m", label: "15分鐘" },
  { value: "1h", label: "1小時" },
  { value: "4h", label: "4小時" },
  { value: "1d", label: "1天" },
  { value: "1w", label: "1週" },
];

// 比照「台灣股市」頁的技術指標：同一套公式（src/lib/technical-indicators.ts），最多同時勾選3個。
const INDICATOR_OPTIONS: { key: IndicatorKey; label: string }[] = [
  { key: "KDJ", label: "KDJ" },
  { key: "RSI", label: "RSI" },
  { key: "MACD", label: "MACD" },
  { key: "DMI", label: "DMI" },
  { key: "BIAS", label: "乖離率" },
];

interface Ticker {
  lastPrice: number;
  priceChangePercent: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
}

export default function CryptoMarketPage() {
  const [symbol, setSymbol] = useState("BTC");
  const [interval, setInterval_] = useState("1d");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [ticker, setTicker] = useState<Ticker | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [indicators, setIndicators] = useState<IndicatorKey[]>(["KDJ", "RSI", "MACD"]);
  const indicatorLimitReached = indicators.length >= 3;
  const toggleIndicator = (key: IndicatorKey) => {
    setIndicators((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : prev.length >= 3 ? prev : [...prev, key]
    );
  };
  const [indicatorDropdownOpen, setIndicatorDropdownOpen] = useState(false);
  const indicatorDropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!indicatorDropdownOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (indicatorDropdownRef.current && !indicatorDropdownRef.current.contains(e.target as Node)) {
        setIndicatorDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [indicatorDropdownOpen]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [klinesRes, tickerRes] = await Promise.all([
        fetch(`/api/market/crypto/klines?symbol=${symbol}&interval=${interval}`),
        fetch(`/api/market/crypto/ticker?symbol=${symbol}`),
      ]);
      const klinesData = await klinesRes.json();
      const tickerData = await tickerRes.json();
      if (!klinesRes.ok) throw new Error(klinesData.error || "讀取失敗");
      setCandles(klinesData.candles);
      setTicker(tickerRes.ok ? tickerData : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "讀取失敗");
    } finally {
      setLoading(false);
    }
  }, [symbol, interval]);

  useEffect(() => {
    load();
  }, [load]);

  const fmtUsd = (n: number) =>
    new Intl.NumberFormat("en-US", { maximumFractionDigits: n < 1 ? 6 : 2 }).format(n);

  const legendDot = (color: string) => (
    <span className="w-2.5 h-0.5 inline-block" style={{ backgroundColor: color }} />
  );

  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">市場行情 · 虛擬貨幣</h1>
        <p className="text-slate-500 text-sm mt-1">K線、均線、布林通道與技術指標，資料來源：Kraken</p>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <select
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          className="border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm font-medium text-slate-700 focus:border-indigo-400 transition-colors"
        >
          {SYMBOLS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
          {INTERVALS.map((i) => (
            <button
              key={i.value}
              onClick={() => setInterval_(i.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                interval === i.value
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {i.label}
            </button>
          ))}
        </div>

        {/* 技術指標下拉選單：比照台灣股市頁，最多同時勾選3個，選滿時其餘checkbox停用 */}
        <div className="relative" ref={indicatorDropdownRef}>
          <button
            type="button"
            onClick={() => setIndicatorDropdownOpen((o) => !o)}
            className="border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            技術指標{indicators.length > 0 ? `：${INDICATOR_OPTIONS.filter((o) => indicators.includes(o.key)).map((o) => o.label).join("、")}` : ""}
          </button>
          {indicatorDropdownOpen && (
            <div className="absolute z-10 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1.5 w-40">
              {INDICATOR_OPTIONS.map((opt) => {
                const checked = indicators.includes(opt.key);
                const disabled = !checked && indicatorLimitReached;
                return (
                  <label
                    key={opt.key}
                    className={`flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-slate-50 ${disabled ? "opacity-40 cursor-not-allowed" : "text-slate-700"}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggleIndicator(opt.key)}
                      className="accent-indigo-600"
                    />
                    {opt.label}
                  </label>
                );
              })}
              <div className="px-3 pt-1.5 text-[11px] text-slate-400 border-t border-slate-50 mt-1">最多同時勾選3個</div>
            </div>
          )}
        </div>
      </div>

      {ticker && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">最新價格</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">${fmtUsd(ticker.lastPrice)}</div>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">24h 漲跌</div>
            <div className={`text-2xl font-bold mt-1 ${ticker.priceChangePercent >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {ticker.priceChangePercent >= 0 ? "+" : ""}{ticker.priceChangePercent.toFixed(2)}%
            </div>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">24h 最高</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">${fmtUsd(ticker.highPrice)}</div>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">24h 最低</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">${fmtUsd(ticker.lowPrice)}</div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        {/* 均線/布林通道一律顯示，跟台灣股市頁同一套顏色 */}
        <div className="flex flex-wrap items-center gap-3 text-xs mb-3 text-slate-500">
          <span className="flex items-center gap-1">{legendDot("#fbbf24")}MA5</span>
          <span className="flex items-center gap-1">{legendDot("#3b82f6")}MA20</span>
          <span className="flex items-center gap-1">{legendDot("#a855f7")}MA60</span>
          <span className="flex items-center gap-1">{legendDot("#94a3b8")}MA120</span>
          <span className="flex items-center gap-1">{legendDot("#a5b4fc")}布林通道</span>
        </div>

        {loading ? (
          <div className="h-[400px] flex items-center justify-center text-slate-400 text-sm">載入中...</div>
        ) : error ? (
          <div className="h-[400px] flex items-center justify-center text-red-500 text-sm">{error}</div>
        ) : (
          <>
            <CandlestickChart data={candles} indicators={indicators} />
            {indicators.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs mt-3 pt-3 border-t border-slate-50 text-slate-500">
                {indicators.includes("KDJ") && (
                  <span className="flex items-center gap-3">
                    <span className="font-medium text-slate-600">KDJ(9,3,3)</span>
                    <span className="flex items-center gap-1">{legendDot("#f59e0b")}K</span>
                    <span className="flex items-center gap-1">{legendDot("#3b82f6")}D</span>
                    <span className="flex items-center gap-1">{legendDot("#a855f7")}J</span>
                  </span>
                )}
                {indicators.includes("RSI") && (
                  <span className="flex items-center gap-3">
                    <span className="font-medium text-slate-600">RSI(14)</span>
                    <span className="flex items-center gap-1">{legendDot("#6366f1")}RSI</span>
                  </span>
                )}
                {indicators.includes("MACD") && (
                  <span className="flex items-center gap-3">
                    <span className="font-medium text-slate-600">MACD(12,26,9)</span>
                    <span className="flex items-center gap-1">{legendDot("#f59e0b")}DIF</span>
                    <span className="flex items-center gap-1">{legendDot("#3b82f6")}DEA</span>
                  </span>
                )}
                {indicators.includes("DMI") && (
                  <span className="flex items-center gap-3">
                    <span className="font-medium text-slate-600">DMI/ADX(14)</span>
                    <span className="flex items-center gap-1">{legendDot("#16a34a")}+DI</span>
                    <span className="flex items-center gap-1">{legendDot("#dc2626")}-DI</span>
                    <span className="flex items-center gap-1">{legendDot("#64748b")}ADX</span>
                  </span>
                )}
                {indicators.includes("BIAS") && (
                  <span className="flex items-center gap-3">
                    <span className="font-medium text-slate-600">乖離率 BIAS</span>
                    <span className="flex items-center gap-1">{legendDot("#f59e0b")}BIAS6</span>
                    <span className="flex items-center gap-1">{legendDot("#3b82f6")}BIAS12</span>
                    <span className="flex items-center gap-1">{legendDot("#a855f7")}BIAS24</span>
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
