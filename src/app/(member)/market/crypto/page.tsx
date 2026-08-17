"use client";

import { useEffect, useState, useCallback } from "react";
import CandlestickChart, { type Candle } from "@/components/market/CandlestickChart";

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

  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">市場行情 · 虛擬貨幣</h1>
        <p className="text-slate-500 text-sm mt-1">即時 K 線圖，資料來源：Kraken</p>
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
        {loading ? (
          <div className="h-[400px] flex items-center justify-center text-slate-400 text-sm">載入中...</div>
        ) : error ? (
          <div className="h-[400px] flex items-center justify-center text-red-500 text-sm">{error}</div>
        ) : (
          <CandlestickChart data={candles} />
        )}
      </div>
    </div>
  );
}
