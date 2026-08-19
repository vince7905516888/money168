"use client";

import { useEffect, useState, useCallback } from "react";

interface MarqueeItem {
  id: string;
  text: string;
  order: number;
}

interface VideoHighlight {
  id: string;
  date: string;
  title: string | null;
  content: string;
  url: string | null;
}

// 前台會同步後台「前台公告」新增的跑馬燈／影片重點，每 30 秒自動輪詢一次，
// 不用重新整理頁面就能看到後台剛新增的內容。
const POLL_INTERVAL_MS = 30_000;

export default function StockHighlightsPage() {
  const [marquees, setMarquees] = useState<MarqueeItem[]>([]);
  const [highlights, setHighlights] = useState<VideoHighlight[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const [marqueeRes, highlightRes] = await Promise.all([
      fetch("/api/marquee"),
      fetch("/api/video-highlights"),
    ]);
    const [marqueeData, highlightData] = await Promise.all([marqueeRes.json(), highlightRes.json()]);
    setMarquees(Array.isArray(marqueeData) ? marqueeData : []);
    setHighlights(Array.isArray(highlightData) ? highlightData : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    const timer = setInterval(fetchAll, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchAll]);

  const marqueeText = marquees.map((m) => m.text).join("　　◆　　");
  const marqueeDuration = Math.max(20, marqueeText.length * 0.25);

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">股市要點</h1>
        <p className="text-slate-500 text-sm mt-1">每日市場公告與分析師影片重點整理</p>
      </div>

      {/* 跑馬燈 */}
      {marquees.length > 0 && (
        <div className="bg-indigo-600 rounded-2xl overflow-hidden mb-6 shadow-sm">
          <div className="flex items-center py-3">
            <span className="shrink-0 px-4 text-xs font-bold text-white/90 tracking-wider border-r border-white/20">公告</span>
            <div className="flex-1 overflow-hidden whitespace-nowrap">
              <div
                className="inline-block animate-marquee text-sm text-white font-medium"
                style={{ animationDuration: `${marqueeDuration}s` }}
              >
                <span className="pr-24">{marqueeText}</span>
                <span className="pr-24">{marqueeText}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 影片重點列表 */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-50">
          <h2 className="font-semibold text-slate-900">每日影片重點</h2>
        </div>

        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm">載入中...</div>
        ) : highlights.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">目前尚無影片重點紀錄</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {highlights.map((h) => (
              <div key={h.id} className="px-6 py-5">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-xs font-semibold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full shrink-0">
                    {new Date(h.date).toLocaleDateString("zh-TW")}
                  </span>
                  {h.title && <span className="text-sm font-semibold text-slate-800">{h.title}</span>}
                </div>
                {h.url && (
                  <a href={h.url} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-indigo-500 hover:underline block mb-2">
                    {h.url}
                  </a>
                )}
                <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{h.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
