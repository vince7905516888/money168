"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export default function CandlestickChart({ data }: { data: Candle[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: { background: { color: "transparent" }, textColor: "#64748b" },
      grid: {
        vertLines: { color: "#f1f5f9" },
        horzLines: { color: "#f1f5f9" },
      },
      width: containerRef.current.clientWidth,
      height: 400,
      timeScale: { timeVisible: true, borderColor: "#e2e8f0", rightOffset: 3 },
      rightPriceScale: { borderColor: "#e2e8f0" },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#16a34a",
      downColor: "#dc2626",
      borderVisible: false,
      wickUpColor: "#16a34a",
      wickDownColor: "#dc2626",
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current) return;
    seriesRef.current.setData(
      data.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );
    const timeScale = chartRef.current?.timeScale();
    timeScale?.fitContent();
    // fitContent 會讓最左/最右的K棒緊貼容器邊緣，視覺上像被裁掉一半，兩側各留1根K棒寬的空白。
    const range = timeScale?.getVisibleLogicalRange();
    if (timeScale && range) {
      timeScale.setVisibleLogicalRange({ from: range.from - 1, to: range.to + 1 });
    }
  }, [data]);

  return <div ref={containerRef} className="w-full" />;
}
