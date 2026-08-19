"use client";

import { useEffect, useState, useCallback } from "react";
import { useAdminTheme, ADMIN_THEMES } from "@/components/layout/AdminThemeContext";

interface MarqueeItem {
  id: string;
  text: string;
  enabled: boolean;
  order: number;
}

interface VideoHighlight {
  id: string;
  date: string;
  title: string | null;
  content: string;
  url: string | null;
}

const EMPTY_MARQUEE_FORM = { text: "", order: "0" };
const EMPTY_HIGHLIGHT_FORM = { date: new Date().toLocaleDateString("sv-SE"), title: "", content: "", url: "" };

export default function AnnouncementsPage() {
  const { themeKey } = useAdminTheme();
  const skin = ADMIN_THEMES[themeKey];

  const [marquees, setMarquees] = useState<MarqueeItem[]>([]);
  const [marqueeLoading, setMarqueeLoading] = useState(true);
  const [showAddMarquee, setShowAddMarquee] = useState(false);
  const [marqueeForm, setMarqueeForm] = useState(EMPTY_MARQUEE_FORM);
  const [marqueeSaving, setMarqueeSaving] = useState(false);

  const [highlights, setHighlights] = useState<VideoHighlight[]>([]);
  const [highlightsLoading, setHighlightsLoading] = useState(true);
  const [showAddHighlight, setShowAddHighlight] = useState(false);
  const [highlightForm, setHighlightForm] = useState(EMPTY_HIGHLIGHT_FORM);
  const [highlightSaving, setHighlightSaving] = useState(false);
  const [editingHighlight, setEditingHighlight] = useState<VideoHighlight | null>(null);

  const fetchMarquees = useCallback(async () => {
    setMarqueeLoading(true);
    const res = await fetch("/api/marquee");
    const data = await res.json();
    setMarquees(Array.isArray(data) ? data : []);
    setMarqueeLoading(false);
  }, []);

  const fetchHighlights = useCallback(async () => {
    setHighlightsLoading(true);
    const res = await fetch("/api/video-highlights");
    const data = await res.json();
    setHighlights(Array.isArray(data) ? data : []);
    setHighlightsLoading(false);
  }, []);

  useEffect(() => { fetchMarquees(); fetchHighlights(); }, [fetchMarquees, fetchHighlights]);

  const handleAddMarquee = async (e: React.FormEvent) => {
    e.preventDefault();
    setMarqueeSaving(true);
    const res = await fetch("/api/marquee", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(marqueeForm),
    });
    setMarqueeSaving(false);
    if (res.ok) {
      setShowAddMarquee(false);
      setMarqueeForm(EMPTY_MARQUEE_FORM);
      fetchMarquees();
    } else {
      const err = await res.json().catch(() => null);
      alert(err?.error || "新增失敗");
    }
  };

  const handleToggleMarquee = async (item: MarqueeItem) => {
    await fetch("/api/marquee", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, enabled: !item.enabled }),
    });
    fetchMarquees();
  };

  const handleDeleteMarquee = async (item: MarqueeItem) => {
    if (!confirm(`確定要刪除這則跑馬燈？\n「${item.text}」`)) return;
    await fetch("/api/marquee", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id }),
    });
    fetchMarquees();
  };

  const openAddHighlight = () => {
    setEditingHighlight(null);
    setHighlightForm(EMPTY_HIGHLIGHT_FORM);
    setShowAddHighlight(true);
  };

  const openEditHighlight = (h: VideoHighlight) => {
    setEditingHighlight(h);
    setHighlightForm({
      date: h.date.split("T")[0],
      title: h.title ?? "",
      content: h.content,
      url: h.url ?? "",
    });
    setShowAddHighlight(true);
  };

  const handleSaveHighlight = async (e: React.FormEvent) => {
    e.preventDefault();
    setHighlightSaving(true);
    const method = editingHighlight ? "PUT" : "POST";
    const res = await fetch("/api/video-highlights", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingHighlight ? { id: editingHighlight.id, ...highlightForm } : highlightForm),
    });
    setHighlightSaving(false);
    if (res.ok) {
      setShowAddHighlight(false);
      setEditingHighlight(null);
      setHighlightForm(EMPTY_HIGHLIGHT_FORM);
      fetchHighlights();
    } else {
      const err = await res.json().catch(() => null);
      alert(err?.error || "儲存失敗");
    }
  };

  const handleDeleteHighlight = async (id: string) => {
    if (!confirm("確定要刪除這筆影片重點紀錄？")) return;
    await fetch("/api/video-highlights", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchHighlights();
  };

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className={`text-2xl font-bold ${skin.heading}`}>前台公告</h1>
        <p className={`${skin.subheading} text-sm mt-1`}>管理前台「股市要點」頁面顯示的跑馬燈與每日影片重點</p>
      </div>

      {/* 跑馬燈 */}
      <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden mb-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <div>
            <h2 className="font-semibold text-slate-50">跑馬燈</h2>
            <p className="text-xs text-slate-400 mt-0.5">啟用中的跑馬燈會依排序值由小到大串接顯示在前台頁面上方</p>
          </div>
          <button
            onClick={() => setShowAddMarquee(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors"
          >
            + 新增跑馬燈
          </button>
        </div>

        {marqueeLoading ? (
          <div className="py-10 text-center text-slate-400 text-sm">載入中...</div>
        ) : marquees.length === 0 ? (
          <div className="py-10 text-center text-slate-400 text-sm">尚未設定任何跑馬燈</div>
        ) : (
          <div className="divide-y divide-slate-700">
            {marquees.map((item) => (
              <div key={item.id} className="flex items-center justify-between px-5 py-4 hover:bg-slate-700/50 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    onClick={() => handleToggleMarquee(item)}
                    title={item.enabled ? "啟用中，點擊停用" : "已停用，點擊啟用"}
                    className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${item.enabled ? "bg-emerald-500" : "bg-slate-600"}`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                        item.enabled ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                  <div className="min-w-0">
                    <div className="text-sm text-slate-50 truncate">{item.text}</div>
                    <div className="text-xs text-slate-500 mt-0.5">排序 {item.order}</div>
                  </div>
                </div>
                <button onClick={() => handleDeleteMarquee(item)}
                  className="text-xs px-2 py-1 rounded-lg text-red-400 hover:bg-red-900/30 transition-colors shrink-0">
                  刪除
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 影片重點紀錄 */}
      <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden mb-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <div>
            <h2 className="font-semibold text-slate-50">影片重點紀錄</h2>
            <p className="text-xs text-slate-400 mt-0.5">貼上當天分析師影片的重點內容，會同步顯示在前台「股市要點」頁面</p>
          </div>
          <button
            onClick={openAddHighlight}
            className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors"
          >
            + 新增紀錄
          </button>
        </div>

        {highlightsLoading ? (
          <div className="py-10 text-center text-slate-400 text-sm">載入中...</div>
        ) : highlights.length === 0 ? (
          <div className="py-10 text-center text-slate-400 text-sm">尚無影片重點紀錄</div>
        ) : (
          <div className="divide-y divide-slate-700">
            {highlights.map((h) => (
              <div key={h.id} className="px-5 py-4 hover:bg-slate-700/50 transition-colors">
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-slate-500 shrink-0">{new Date(h.date).toLocaleDateString("zh-TW")}</span>
                    {h.title && <span className="text-sm font-medium text-slate-50 truncate">{h.title}</span>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => openEditHighlight(h)} className="text-xs px-2 py-1 rounded-lg text-indigo-400 hover:bg-indigo-900/30 transition-colors">編輯</button>
                    <button onClick={() => handleDeleteHighlight(h.id)} className="text-xs px-2 py-1 rounded-lg text-red-400 hover:bg-red-900/30 transition-colors">刪除</button>
                  </div>
                </div>
                {h.url && <a href={h.url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-400 hover:underline block mb-1.5">{h.url}</a>}
                <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">{h.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 新增跑馬燈 Modal */}
      {showAddMarquee && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl shadow-xl w-full max-w-md p-6 border border-slate-700">
            <h2 className="text-lg font-bold text-slate-50 mb-5">新增跑馬燈</h2>
            <form onSubmit={handleAddMarquee} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">內容 <span className="text-red-400">*</span></label>
                <input required value={marqueeForm.text} onChange={(e) => setMarqueeForm({ ...marqueeForm, text: e.target.value })}
                  placeholder="例如：台積電法說會將於下週登場，市場關注財測展望"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3.5 py-2.5 text-sm text-slate-50 placeholder:text-slate-500 focus:border-indigo-500 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">排序（數字越小越前面）</label>
                <input type="number" value={marqueeForm.order} onChange={(e) => setMarqueeForm({ ...marqueeForm, order: e.target.value })}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3.5 py-2.5 text-sm text-slate-50 focus:border-indigo-500 transition-colors" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => { setShowAddMarquee(false); setMarqueeForm(EMPTY_MARQUEE_FORM); }}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-slate-600 text-slate-300 hover:bg-slate-700 transition-colors">
                  取消
                </button>
                <button type="submit" disabled={marqueeSaving}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-60">
                  {marqueeSaving ? "新增中..." : "新增"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 新增/編輯影片重點 Modal */}
      {showAddHighlight && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl shadow-xl w-full max-w-lg p-6 border border-slate-700 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-slate-50 mb-5">{editingHighlight ? "編輯影片重點紀錄" : "新增影片重點紀錄"}</h2>
            <form onSubmit={handleSaveHighlight} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">日期 <span className="text-red-400">*</span></label>
                <input required type="date" value={highlightForm.date} onChange={(e) => setHighlightForm({ ...highlightForm, date: e.target.value })}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3.5 py-2.5 text-sm text-slate-50 focus:border-indigo-500 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">標題（選填）</label>
                <input value={highlightForm.title} onChange={(e) => setHighlightForm({ ...highlightForm, title: e.target.value })}
                  placeholder="例如：XX分析師今日重點"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3.5 py-2.5 text-sm text-slate-50 placeholder:text-slate-500 focus:border-indigo-500 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">影片網址（選填）</label>
                <input value={highlightForm.url} onChange={(e) => setHighlightForm({ ...highlightForm, url: e.target.value })}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3.5 py-2.5 text-sm text-slate-50 placeholder:text-slate-500 focus:border-indigo-500 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">重點內容 <span className="text-red-400">*</span></label>
                <textarea required rows={8} value={highlightForm.content} onChange={(e) => setHighlightForm({ ...highlightForm, content: e.target.value })}
                  placeholder="貼上今天影片的重點整理..."
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3.5 py-2.5 text-sm text-slate-50 placeholder:text-slate-500 focus:border-indigo-500 transition-colors" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => { setShowAddHighlight(false); setEditingHighlight(null); setHighlightForm(EMPTY_HIGHLIGHT_FORM); }}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-slate-600 text-slate-300 hover:bg-slate-700 transition-colors">
                  取消
                </button>
                <button type="submit" disabled={highlightSaving}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-60">
                  {highlightSaving ? "儲存中..." : "儲存"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
