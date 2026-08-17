"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  type MouseEventParams,
} from "lightweight-charts";
import {
  computeMA,
  computeBollinger,
  computeRSI,
  computeKDJ,
  computeMACD,
  computeBIAS,
  computeDMI,
} from "@/lib/technical-indicators";

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type IndicatorKey = "KDJ" | "RSI" | "MACD" | "DMI" | "BIAS";

const MAIN_PANE_HEIGHT = 400;
const SUB_PANE_HEIGHT = 150;

function toLineData(times: UTCTimestamp[], values: (number | null)[]) {
  return times
    .map((time, i) => ({ time, value: values[i] }))
    .filter((d): d is { time: UTCTimestamp; value: number } => d.value != null);
}

export default function CandlestickChart({
  data,
  indicators = [],
  formatPrice = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: Math.abs(n) < 1 ? 6 : Math.abs(n) < 100 ? 4 : 2 }),
}: {
  data: Candle[];
  indicators?: IndicatorKey[];
  formatPrice?: (n: number) => string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const overlaySeriesRef = useRef<{
    ma5: ISeriesApi<"Line">;
    ma20: ISeriesApi<"Line">;
    ma60: ISeriesApi<"Line">;
    ma120: ISeriesApi<"Line">;
    bbUpper: ISeriesApi<"Line">;
    bbLower: ISeriesApi<"Line">;
  } | null>(null);
  const [hoverInfo, setHoverInfo] = useState<Candle | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: { background: { color: "transparent" }, textColor: "#64748b" },
      grid: { vertLines: { color: "#f1f5f9" }, horzLines: { color: "#f1f5f9" } },
      width: containerRef.current.clientWidth,
      height: MAIN_PANE_HEIGHT,
      // fixLeftEdge/fixRightEdge：限制縮小/拖曳滾出資料範圍以外的空白區域——免費資料源
      // 只給固定一段歷史，滾出去的空白不是「還有資料只是沒顯示」，鎖住範圍體驗才不會誤導。
      timeScale: { timeVisible: true, borderColor: "#e2e8f0", rightOffset: 3, fixLeftEdge: true, fixRightEdge: true },
      rightPriceScale: { borderColor: "#e2e8f0" },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#16a34a",
      downColor: "#dc2626",
      borderVisible: false,
      wickUpColor: "#16a34a",
      wickDownColor: "#dc2626",
    });

    // 均線/布林通道疊在主圖上，跟「台灣股市」頁同一套顏色；不顯示價格軸標籤/價格線，
    // 避免跟K棒本身的最新價標籤擠在一起看不清楚。
    const overlayLine = (color: string, dashed = false) =>
      chart.addSeries(LineSeries, {
        color,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        ...(dashed ? { lineStyle: 2 } : {}),
      });

    const overlays = {
      ma5: overlayLine("#fbbf24"),
      ma20: overlayLine("#3b82f6"),
      ma60: overlayLine("#a855f7"),
      ma120: overlayLine("#94a3b8"),
      bbUpper: overlayLine("#a5b4fc", true),
      bbLower: overlayLine("#a5b4fc", true),
    };

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    overlaySeriesRef.current = overlays;

    // 游標移到K棒上顯示當根開高低收，固定顯示在圖表上方（不用浮動tooltip擋住K棒），
    // 滑鼠移開就退回顯示最新一根（見下方 render 的 displayInfo）。
    const handleCrosshairMove = (param: MouseEventParams) => {
      const point = param.seriesData.get(candleSeries);
      if (!param.time || !point || !("open" in point)) {
        setHoverInfo(null);
        return;
      }
      setHoverInfo({ time: param.time as number, open: point.open, high: point.high, low: point.low, close: point.close });
    };
    chart.subscribeCrosshairMove(handleCrosshairMove);

    const handleResize = () => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      overlaySeriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    const overlays = overlaySeriesRef.current;
    if (!chart || !candleSeries || !overlays || data.length === 0) return;

    const times = data.map((c) => c.time as UTCTimestamp);
    const closes = data.map((c) => c.close);

    candleSeries.setData(
      data.map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close }))
    );

    overlays.ma5.setData(toLineData(times, computeMA(closes, 5)));
    overlays.ma20.setData(toLineData(times, computeMA(closes, 20)));
    overlays.ma60.setData(toLineData(times, computeMA(closes, 60)));
    overlays.ma120.setData(toLineData(times, computeMA(closes, 120)));
    const bb = computeBollinger(closes, 20, 2);
    overlays.bbUpper.setData(toLineData(times, bb.upper));
    overlays.bbLower.setData(toLineData(times, bb.lower));

    // 技術指標子圖：每次勾選變動整批砍掉重蓋，比逐一比對diff簡單可靠，反正只有使用者
    // 按checkbox時才會跑，不是高頻操作。removePane會一併清掉該pane底下的series，不用另外清。
    while (chart.panes().length > 1) {
      chart.removePane(chart.panes().length - 1);
    }

    const addLine = (paneIndex: number, color: string, values: (number | null)[]) => {
      const s = chart.addSeries(LineSeries, { color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false }, paneIndex);
      s.setData(toLineData(times, values));
    };

    indicators.forEach((key, idx) => {
      const paneIndex = idx + 1;
      if (key === "KDJ") {
        const { k, d, j } = computeKDJ(data, 9);
        addLine(paneIndex, "#f59e0b", k);
        addLine(paneIndex, "#3b82f6", d);
        addLine(paneIndex, "#a855f7", j);
      } else if (key === "RSI") {
        addLine(paneIndex, "#6366f1", computeRSI(closes, 14));
      } else if (key === "MACD") {
        const { dif, dea, hist } = computeMACD(closes);
        const histSeries = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, paneIndex);
        histSeries.setData(times.map((time, i) => ({ time, value: hist[i], color: hist[i] >= 0 ? "#86efac" : "#fca5a5" })));
        addLine(paneIndex, "#f59e0b", dif);
        addLine(paneIndex, "#3b82f6", dea);
      } else if (key === "DMI") {
        const { plusDI, minusDI, adx } = computeDMI(data, 14);
        addLine(paneIndex, "#16a34a", plusDI);
        addLine(paneIndex, "#dc2626", minusDI);
        addLine(paneIndex, "#64748b", adx);
      } else if (key === "BIAS") {
        addLine(paneIndex, "#f59e0b", computeBIAS(closes, 6));
        addLine(paneIndex, "#3b82f6", computeBIAS(closes, 12));
        addLine(paneIndex, "#a855f7", computeBIAS(closes, 24));
      }
    });

    chart.applyOptions({ height: MAIN_PANE_HEIGHT + indicators.length * SUB_PANE_HEIGHT });
    const panes = chart.panes();
    panes[0]?.setStretchFactor(MAIN_PANE_HEIGHT);
    for (let i = 1; i < panes.length; i++) panes[i]?.setStretchFactor(SUB_PANE_HEIGHT);

    // 直接依資料筆數設定可視範圍，兩側各留1根K棒空白，不用fitContent()後再讀回目前範圍
    // 來調整——那個讀回值有時還是舊資料的範圍，算出來的位移會把部分K棒擠出畫面外。
    chart.timeScale().setVisibleLogicalRange({ from: -1, to: data.length });
  }, [data, indicators]);

  const displayInfo = hoverInfo ?? (data.length > 0 ? data[data.length - 1] : null);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 text-xs mb-2 h-5">
        {displayInfo ? (
          <>
            <span className="font-semibold text-slate-700">
              {new Date(displayInfo.time * 1000).toLocaleString("zh-TW", { hour12: false })}
            </span>
            <span className="text-slate-500">開 {formatPrice(displayInfo.open)}</span>
            <span className="text-red-500">高 {formatPrice(displayInfo.high)}</span>
            <span className="text-green-600">低 {formatPrice(displayInfo.low)}</span>
            <span className="text-slate-700 font-medium">收 {formatPrice(displayInfo.close)}</span>
          </>
        ) : (
          <span className="text-slate-300">游標移到圖上顯示當根開高低收</span>
        )}
      </div>
      <div ref={containerRef} className="w-full" />
    </div>
  );
}
