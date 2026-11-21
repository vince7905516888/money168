"use client";

import { useEffect, useState } from "react";

interface PredictionAlert {
  code: string;
  name: string;
  alerts: string[];
}

// 全站跑馬燈：進APP就掃一次觀察名單裡每一檔的RSI/KD/乖離率，有任何一檔符合極端條件
// （RSI與KD同時超賣<20或超買>80、乖離率(6日)正負超過13%）就在側邊欄旁邊跳出來，
// 不管使用者停在哪一頁都看得到；只在打開APP當下掃一次，不是背景持續輪詢即時更新。
export default function WatchlistAlertMarquee() {
  const [items, setItems] = useState<PredictionAlert[]>([]);

  useEffect(() => {
    fetch("/api/market/tw-stock/watchlist/predictions")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        const predictions: Array<{ code: string; name: string; alerts?: string[] }> = body?.predictions ?? [];
        const withAlerts = predictions
          .filter((p) => Array.isArray(p.alerts) && p.alerts.length > 0)
          .map((p) => ({ code: p.code, name: p.name, alerts: p.alerts! }));
        setItems(withAlerts);
      })
      .catch(() => {});
  }, []);

  if (items.length === 0) return null;

  const text = items.map((it) => `${it.name}（${it.code}）${it.alerts.join("、")}`).join("　　◆　　");
  const duration = Math.max(20, text.length * 0.25);

  return (
    <div className="bg-red-600 rounded-2xl overflow-hidden mb-4 shadow-sm">
      <div className="flex items-center py-2.5">
        <span className="shrink-0 px-4 text-xs font-bold text-white/90 tracking-wider border-r border-white/20">觀察名單提醒</span>
        <div className="flex-1 overflow-hidden whitespace-nowrap">
          <div className="inline-block animate-marquee text-sm text-white font-medium" style={{ animationDuration: `${duration}s` }}>
            <span className="pr-24">{text}</span>
            <span className="pr-24">{text}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
