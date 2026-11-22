"use client";

import { useEffect, useState } from "react";

export interface WatchlistAlertItem {
  code: string;
  name: string;
  alerts: string[];
}

// 觀察名單極端訊號：進頁面掃一次RSI/KD同時超賣超買、乖離率(6日)正負超過13%，
// 跑馬燈（全站）、台灣股市頁清單兩個顯示方式共用同一份抓取邏輯。
export function useWatchlistAlerts() {
  const [items, setItems] = useState<WatchlistAlertItem[]>([]);

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

  return items;
}
