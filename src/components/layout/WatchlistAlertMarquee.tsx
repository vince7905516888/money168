"use client";

import { usePathname } from "next/navigation";
import { useWatchlistAlerts } from "@/lib/use-watchlist-alerts";

// 全站跑馬燈：進APP就掃一次觀察名單裡每一檔的RSI/KD/乖離率，有任何一檔符合極端條件
// 就在側邊欄旁邊跳出來，不管使用者停在哪一頁都看得到；只在打開APP當下掃一次，不是
// 背景持續輪詢即時更新。「台灣股市」頁自己有清單式的完整顯示，這裡就不重複跳跑馬燈。
export default function WatchlistAlertMarquee() {
  const pathname = usePathname();
  const items = useWatchlistAlerts();

  if (pathname?.startsWith("/market/tw-stock")) return null;
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
