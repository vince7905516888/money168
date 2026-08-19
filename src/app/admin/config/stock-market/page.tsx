"use client";

import { useEffect, useState, useCallback } from "react";
import { useAdminTheme, ADMIN_THEMES } from "@/components/layout/AdminThemeContext";

interface SignalRule {
  id: string;
  code: string;
  name: string | null;
  condition: "ABOVE" | "BELOW";
  value: number;
  note: string | null;
  enabled: boolean;
}

interface VideoSummary {
  id: string;
  url: string;
  summary: string;
  createdAt: string;
}

interface MartingaleStrategy {
  id: string;
  name: string;
  ratios: number[];
  note: string | null;
}

const EMPTY_RULE_FORM = { code: "", name: "", condition: "ABOVE" as "ABOVE" | "BELOW", value: "", note: "" };
const MAX_MARTINGALE_STEPS = 8;
const MIN_MARTINGALE_STEPS = 2;
const EMPTY_MARTINGALE_FORM = { name: "", note: "", ratios: ["1", "1"] };

export default function StockMarketSettingsPage() {
  const { themeKey } = useAdminTheme();
  const skin = ADMIN_THEMES[themeKey];
  const [rules, setRules] = useState<SignalRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [showAddRule, setShowAddRule] = useState(false);
  const [ruleForm, setRuleForm] = useState(EMPTY_RULE_FORM);
  const [ruleSaving, setRuleSaving] = useState(false);
  const [editingRule, setEditingRule] = useState<SignalRule | null>(null);
  const [editRuleForm, setEditRuleForm] = useState({ code: "", name: "", condition: "ABOVE" as "ABOVE" | "BELOW", value: "", note: "" });

  const [summaries, setSummaries] = useState<VideoSummary[]>([]);
  const [summariesLoading, setSummariesLoading] = useState(true);
  const [videoUrl, setVideoUrl] = useState("");
  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState("");

  const [martingales, setMartingales] = useState<MartingaleStrategy[]>([]);
  const [martingalesLoading, setMartingalesLoading] = useState(true);
  const [showAddMartingale, setShowAddMartingale] = useState(false);
  const [martingaleForm, setMartingaleForm] = useState(EMPTY_MARTINGALE_FORM);
  const [martingaleSaving, setMartingaleSaving] = useState(false);
  const [editingMartingale, setEditingMartingale] = useState<MartingaleStrategy | null>(null);
  const [editMartingaleForm, setEditMartingaleForm] = useState(EMPTY_MARTINGALE_FORM);

  const fetchRules = useCallback(async () => {
    setRulesLoading(true);
    const res = await fetch("/api/admin/stock-signal-rules");
    const data = await res.json();
    setRules(Array.isArray(data) ? data : []);
    setRulesLoading(false);
  }, []);

  const fetchSummaries = useCallback(async () => {
    setSummariesLoading(true);
    const res = await fetch("/api/admin/analyst-video-summary");
    const data = await res.json();
    setSummaries(Array.isArray(data) ? data : []);
    setSummariesLoading(false);
  }, []);

  const fetchMartingales = useCallback(async () => {
    setMartingalesLoading(true);
    const res = await fetch("/api/admin/martingale-strategies");
    const data = await res.json();
    setMartingales(Array.isArray(data) ? data : []);
    setMartingalesLoading(false);
  }, []);

  useEffect(() => { fetchRules(); fetchSummaries(); fetchMartingales(); }, [fetchRules, fetchSummaries, fetchMartingales]);

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setRuleSaving(true);
    const res = await fetch("/api/admin/stock-signal-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ruleForm),
    });
    setRuleSaving(false);
    if (res.ok) {
      setShowAddRule(false);
      setRuleForm(EMPTY_RULE_FORM);
      fetchRules();
    } else {
      const err = await res.json().catch(() => null);
      alert(err?.error || "新增失敗");
    }
  };

  const openEditRule = (rule: SignalRule) => {
    setEditingRule(rule);
    setEditRuleForm({ code: rule.code, name: rule.name ?? "", condition: rule.condition, value: String(rule.value), note: rule.note ?? "" });
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRule) return;
    setRuleSaving(true);
    await fetch("/api/admin/stock-signal-rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editingRule.id, ...editRuleForm }),
    });
    setRuleSaving(false);
    setEditingRule(null);
    fetchRules();
  };

  const handleToggleRule = async (rule: SignalRule) => {
    await fetch("/api/admin/stock-signal-rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rule.id, enabled: !rule.enabled }),
    });
    fetchRules();
  };

  const handleDeleteRule = async (rule: SignalRule) => {
    if (!confirm(`確定要刪除「${rule.code}」這條訊號規則？`)) return;
    await fetch("/api/admin/stock-signal-rules", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rule.id }),
    });
    fetchRules();
  };

  const handleSummarize = async (e: React.FormEvent) => {
    e.preventDefault();
    setSummaryError("");
    setSummarizing(true);
    const res = await fetch("/api/admin/analyst-video-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: videoUrl.trim() }),
    });
    setSummarizing(false);
    if (res.ok) {
      setVideoUrl("");
      fetchSummaries();
    } else {
      const err = await res.json().catch(() => null);
      setSummaryError(err?.error || "摘要失敗，請稍後再試");
    }
  };

  const handleDeleteSummary = async (id: string) => {
    if (!confirm("確定要刪除這筆影片摘要？")) return;
    await fetch("/api/admin/analyst-video-summary", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchSummaries();
  };

  const addRatioField = (setForm: typeof setMartingaleForm) =>
    setForm((f) => (f.ratios.length >= MAX_MARTINGALE_STEPS ? f : { ...f, ratios: [...f.ratios, ""] }));

  const removeRatioField = (setForm: typeof setMartingaleForm, index: number) =>
    setForm((f) => (f.ratios.length <= MIN_MARTINGALE_STEPS ? f : { ...f, ratios: f.ratios.filter((_, i) => i !== index) }));

  const updateRatioField = (setForm: typeof setMartingaleForm, index: number, value: string) =>
    setForm((f) => ({ ...f, ratios: f.ratios.map((r, i) => (i === index ? value : r)) }));

  const handleAddMartingale = async (e: React.FormEvent) => {
    e.preventDefault();
    setMartingaleSaving(true);
    const res = await fetch("/api/admin/martingale-strategies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...martingaleForm, ratios: martingaleForm.ratios.map((r) => parseFloat(r)) }),
    });
    setMartingaleSaving(false);
    if (res.ok) {
      setShowAddMartingale(false);
      setMartingaleForm(EMPTY_MARTINGALE_FORM);
      fetchMartingales();
    } else {
      const err = await res.json().catch(() => null);
      alert(err?.error || "新增失敗");
    }
  };

  const openEditMartingale = (m: MartingaleStrategy) => {
    setEditingMartingale(m);
    setEditMartingaleForm({ name: m.name, note: m.note ?? "", ratios: m.ratios.map((r) => String(r)) });
  };

  const handleSaveMartingale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMartingale) return;
    setMartingaleSaving(true);
    const res = await fetch("/api/admin/martingale-strategies", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editingMartingale.id, ...editMartingaleForm, ratios: editMartingaleForm.ratios.map((r) => parseFloat(r)) }),
    });
    setMartingaleSaving(false);
    if (res.ok) {
      setEditingMartingale(null);
      fetchMartingales();
    } else {
      const err = await res.json().catch(() => null);
      alert(err?.error || "儲存失敗");
    }
  };

  const handleDeleteMartingale = async (m: MartingaleStrategy) => {
    if (!confirm(`確定要刪除「${m.name}」這個馬丁格爾策略？`)) return;
    await fetch("/api/admin/martingale-strategies", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: m.id }),
    });
    fetchMartingales();
  };

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className={`text-2xl font-bold ${skin.heading}`}>股市設定</h1>
        <p className={`${skin.subheading} text-sm mt-1`}>買賣訊號條件設定、馬丁格爾策略模版與分析師影片重點整理</p>
      </div>

      {/* 買賣訊號設定 */}
      <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden mb-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <div>
            <h2 className="font-semibold text-slate-50">買賣訊號設定</h2>
            <p className="text-xs text-slate-400 mt-0.5">設定股票代碼與價格條件，之後可依此觸發通知</p>
          </div>
          <button
            onClick={() => setShowAddRule(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors"
          >
            + 新增規則
          </button>
        </div>

        {rulesLoading ? (
          <div className="py-10 text-center text-slate-400 text-sm">載入中...</div>
        ) : rules.length === 0 ? (
          <div className="py-10 text-center text-slate-400 text-sm">尚未設定任何買賣訊號規則</div>
        ) : (
          <div className="divide-y divide-slate-700">
            {rules.map((rule) => (
              <div key={rule.id} className="flex items-center justify-between px-5 py-4 hover:bg-slate-700/50 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    onClick={() => handleToggleRule(rule)}
                    title={rule.enabled ? "啟用中，點擊停用" : "已停用，點擊啟用"}
                    className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${rule.enabled ? "bg-emerald-500" : "bg-slate-600"}`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                        rule.enabled ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-50 flex items-center gap-2">
                      <span className="font-mono">{rule.code}</span>
                      {rule.name && <span className="text-slate-400">{rule.name}</span>}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      價格{rule.condition === "ABOVE" ? "高於" : "低於"} <span className="text-amber-400 font-semibold">{rule.value}</span>
                      {rule.note && ` · ${rule.note}`}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openEditRule(rule)} className="text-xs px-2 py-1 rounded-lg text-indigo-400 hover:bg-indigo-900/30 transition-colors">編輯</button>
                  <button onClick={() => handleDeleteRule(rule)} className="text-xs px-2 py-1 rounded-lg text-red-400 hover:bg-red-900/30 transition-colors">刪除</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="text-xs text-slate-500 mb-8 px-1">
        目前僅提供規則的新增/管理，尚未串接「自動監控股價並發送通知」的機制，之後可以再依需求加上。
      </p>

      {/* 馬丁格爾策略模版 */}
      <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden mb-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <div>
            <h2 className="font-semibold text-slate-50">馬丁格爾策略模版</h2>
            <p className="text-xs text-slate-400 mt-0.5">設定加碼比例模版，最少 2 次、最多 8 次補投入</p>
          </div>
          <button
            onClick={() => setShowAddMartingale(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors"
          >
            + 新增策略
          </button>
        </div>

        {martingalesLoading ? (
          <div className="py-10 text-center text-slate-400 text-sm">載入中...</div>
        ) : martingales.length === 0 ? (
          <div className="py-10 text-center text-slate-400 text-sm">尚未設定任何馬丁格爾策略模版</div>
        ) : (
          <div className="divide-y divide-slate-700">
            {martingales.map((m) => (
              <div key={m.id} className="flex items-center justify-between px-5 py-4 hover:bg-slate-700/50 transition-colors">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-50">{m.name}</div>
                  <div className="text-xs text-amber-400 font-mono mt-0.5">{m.ratios.join(" : ")}</div>
                  {m.note && <div className="text-xs text-slate-500 mt-0.5">{m.note}</div>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openEditMartingale(m)} className="text-xs px-2 py-1 rounded-lg text-indigo-400 hover:bg-indigo-900/30 transition-colors">編輯</button>
                  <button onClick={() => handleDeleteMartingale(m)} className="text-xs px-2 py-1 rounded-lg text-red-400 hover:bg-red-900/30 transition-colors">刪除</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="text-xs text-slate-500 mb-8 px-1">
        核心邏輯（股數比例）依序代表第 1 次到第 N 次投入的相對股數，例如「1 : 1 : 3 : 5」代表第 3 次補投入是第 1 次的 3 倍。
      </p>

      {/* YouTube 分析師影片摘要 */}
      <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden mb-4">
        <div className="px-5 py-4 border-b border-slate-700">
          <h2 className="font-semibold text-slate-50">分析師影片重點整理</h2>
          <p className="text-xs text-slate-400 mt-0.5">貼上 YouTube 影片網址，由 AI 摘要重點、提到的標的與操作建議</p>
        </div>
        <form onSubmit={handleSummarize} className="flex gap-2 px-5 py-4 border-b border-slate-700">
          <input
            required
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="貼上 YouTube 影片網址，例如：https://www.youtube.com/watch?v=..."
            className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3.5 py-2.5 text-sm text-slate-50 placeholder:text-slate-500 focus:border-indigo-500 transition-colors"
          />
          <button
            type="submit"
            disabled={summarizing}
            className="px-4 py-2.5 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-60 shrink-0"
          >
            {summarizing ? "摘要中..." : "AI 摘要"}
          </button>
        </form>
        {summaryError && (
          <div className="px-5 pb-3 text-xs text-red-400">{summaryError}</div>
        )}

        {summariesLoading ? (
          <div className="py-10 text-center text-slate-400 text-sm">載入中...</div>
        ) : summaries.length === 0 ? (
          <div className="py-10 text-center text-slate-400 text-sm">還沒有摘要過任何影片</div>
        ) : (
          <div className="divide-y divide-slate-700">
            {summaries.map((s) => (
              <div key={s.id} className="px-5 py-4">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-400 hover:underline truncate">{s.url}</a>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-slate-500">{new Date(s.createdAt).toLocaleString("zh-TW")}</span>
                    <button onClick={() => handleDeleteSummary(s.id)} className="text-xs px-2 py-1 rounded-lg text-red-400 hover:bg-red-900/30 transition-colors">刪除</button>
                  </div>
                </div>
                <pre className="text-xs text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">{s.summary}</pre>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="text-xs text-slate-500 px-1">
        影片內容由 Gemini 直接讀取 YouTube 網址進行摘要（僅限公開可觀看的影片），不會下載或儲存影片檔案本身。
      </p>

      {/* 新增規則 Modal */}
      {showAddRule && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl shadow-xl w-full max-w-md p-6 border border-slate-700">
            <h2 className="text-lg font-bold text-slate-50 mb-5">新增買賣訊號規則</h2>
            <form onSubmit={handleAddRule} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">股票代碼 <span className="text-red-400">*</span></label>
                <input required value={ruleForm.code} onChange={(e) => setRuleForm({ ...ruleForm, code: e.target.value })}
                  placeholder="例如：2330"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3.5 py-2.5 text-sm text-slate-50 placeholder:text-slate-500 font-mono focus:border-indigo-500 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">名稱（選填）</label>
                <input value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
                  placeholder="例如：台積電"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3.5 py-2.5 text-sm text-slate-50 placeholder:text-slate-500 focus:border-indigo-500 transition-colors" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">條件</label>
                  <select value={ruleForm.condition} onChange={(e) => setRuleForm({ ...ruleForm, condition: e.target.value as "ABOVE" | "BELOW" })}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3.5 py-2.5 text-sm text-slate-50 focus:border-indigo-500 transition-colors">
                    <option value="ABOVE">價格高於</option>
                    <option value="BELOW">價格低於</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">門檻價格 <span className="text-red-400">*</span></label>
                  <input required type="number" min="0" step="any" value={ruleForm.value} onChange={(e) => setRuleForm({ ...ruleForm, value: e.target.value })}
                    placeholder="例如：600"
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3.5 py-2.5 text-sm text-slate-50 placeholder:text-slate-500 focus:border-indigo-500 transition-colors" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">備註（選填）</label>
                <input value={ruleForm.note} onChange={(e) => setRuleForm({ ...ruleForm, note: e.target.value })}
                  placeholder="說明或備註..."
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3.5 py-2.5 text-sm text-slate-50 placeholder:text-slate-500 focus:border-indigo-500 transition-colors" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => { setShowAddRule(false); setRuleForm(EMPTY_RULE_FORM); }}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-slate-600 text-slate-300 hover:bg-slate-700 transition-colors">
                  取消
                </button>
                <button type="submit" disabled={ruleSaving}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-60">
                  {ruleSaving ? "新增中..." : "新增"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 編輯規則 Modal */}
      {editingRule && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl shadow-xl w-full max-w-md p-6 border border-slate-700">
            <h2 className="text-lg font-bold text-slate-50 mb-5">編輯買賣訊號規則</h2>
            <form onSubmit={handleSaveRule} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">股票代碼</label>
                <input required value={editRuleForm.code} onChange={(e) => setEditRuleForm({ ...editRuleForm, code: e.target.value })}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3.5 py-2.5 text-sm text-slate-50 font-mono focus:border-indigo-500 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">名稱（選填）</label>
                <input value={editRuleForm.name} onChange={(e) => setEditRuleForm({ ...editRuleForm, name: e.target.value })}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3.5 py-2.5 text-sm text-slate-50 focus:border-indigo-500 transition-colors" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">條件</label>
                  <select value={editRuleForm.condition} onChange={(e) => setEditRuleForm({ ...editRuleForm, condition: e.target.value as "ABOVE" | "BELOW" })}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3.5 py-2.5 text-sm text-slate-50 focus:border-indigo-500 transition-colors">
                    <option value="ABOVE">價格高於</option>
                    <option value="BELOW">價格低於</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">門檻價格</label>
                  <input required type="number" min="0" step="any" value={editRuleForm.value} onChange={(e) => setEditRuleForm({ ...editRuleForm, value: e.target.value })}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3.5 py-2.5 text-sm text-slate-50 focus:border-indigo-500 transition-colors" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">備註（選填）</label>
                <input value={editRuleForm.note} onChange={(e) => setEditRuleForm({ ...editRuleForm, note: e.target.value })}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3.5 py-2.5 text-sm text-slate-50 focus:border-indigo-500 transition-colors" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setEditingRule(null)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-slate-600 text-slate-300 hover:bg-slate-700 transition-colors">
                  取消
                </button>
                <button type="submit" disabled={ruleSaving}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-60">
                  {ruleSaving ? "儲存中..." : "儲存"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 新增馬丁格爾策略 Modal */}
      {showAddMartingale && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl shadow-xl w-full max-w-md p-6 border border-slate-700">
            <h2 className="text-lg font-bold text-slate-50 mb-5">新增馬丁格爾策略</h2>
            <form onSubmit={handleAddMartingale} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">方案名稱 <span className="text-red-400">*</span></label>
                <input required value={martingaleForm.name} onChange={(e) => setMartingaleForm({ ...martingaleForm, name: e.target.value })}
                  placeholder="例如：強化平衡"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3.5 py-2.5 text-sm text-slate-50 placeholder:text-slate-500 focus:border-indigo-500 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  核心邏輯（股數比例）<span className="text-red-400">*</span>
                  <span className="text-slate-500 font-normal ml-1">最少 {MIN_MARTINGALE_STEPS} 次、最多 {MAX_MARTINGALE_STEPS} 次補投入</span>
                </label>
                <div className="space-y-2">
                  {martingaleForm.ratios.map((r, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 w-14 shrink-0">第 {i + 1} 次</span>
                      <input required type="number" min="0" step="any" value={r}
                        onChange={(e) => updateRatioField(setMartingaleForm, i, e.target.value)}
                        placeholder="比例"
                        className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3.5 py-2 text-sm text-slate-50 focus:border-indigo-500 transition-colors" />
                      <button type="button" onClick={() => removeRatioField(setMartingaleForm, i)}
                        disabled={martingaleForm.ratios.length <= MIN_MARTINGALE_STEPS}
                        className="text-slate-500 hover:text-red-400 disabled:opacity-20 disabled:hover:text-slate-500 text-xs px-1 shrink-0">
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => addRatioField(setMartingaleForm)}
                  disabled={martingaleForm.ratios.length >= MAX_MARTINGALE_STEPS}
                  className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 hover:underline disabled:opacity-30 disabled:hover:no-underline">
                  + 新增一次補投入
                </button>
                <p className="text-xs text-amber-400 font-mono mt-2">{martingaleForm.ratios.filter((r) => r !== "").join(" : ") || "—"}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">備註（選填）</label>
                <input value={martingaleForm.note} onChange={(e) => setMartingaleForm({ ...martingaleForm, note: e.target.value })}
                  placeholder="說明或備註..."
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3.5 py-2.5 text-sm text-slate-50 placeholder:text-slate-500 focus:border-indigo-500 transition-colors" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => { setShowAddMartingale(false); setMartingaleForm(EMPTY_MARTINGALE_FORM); }}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-slate-600 text-slate-300 hover:bg-slate-700 transition-colors">
                  取消
                </button>
                <button type="submit" disabled={martingaleSaving}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-60">
                  {martingaleSaving ? "新增中..." : "新增"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 編輯馬丁格爾策略 Modal */}
      {editingMartingale && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl shadow-xl w-full max-w-md p-6 border border-slate-700">
            <h2 className="text-lg font-bold text-slate-50 mb-5">編輯馬丁格爾策略</h2>
            <form onSubmit={handleSaveMartingale} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">方案名稱</label>
                <input required value={editMartingaleForm.name} onChange={(e) => setEditMartingaleForm({ ...editMartingaleForm, name: e.target.value })}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3.5 py-2.5 text-sm text-slate-50 focus:border-indigo-500 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  核心邏輯（股數比例）
                  <span className="text-slate-500 font-normal ml-1">最少 {MIN_MARTINGALE_STEPS} 次、最多 {MAX_MARTINGALE_STEPS} 次補投入</span>
                </label>
                <div className="space-y-2">
                  {editMartingaleForm.ratios.map((r, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 w-14 shrink-0">第 {i + 1} 次</span>
                      <input required type="number" min="0" step="any" value={r}
                        onChange={(e) => updateRatioField(setEditMartingaleForm, i, e.target.value)}
                        className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3.5 py-2 text-sm text-slate-50 focus:border-indigo-500 transition-colors" />
                      <button type="button" onClick={() => removeRatioField(setEditMartingaleForm, i)}
                        disabled={editMartingaleForm.ratios.length <= MIN_MARTINGALE_STEPS}
                        className="text-slate-500 hover:text-red-400 disabled:opacity-20 disabled:hover:text-slate-500 text-xs px-1 shrink-0">
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => addRatioField(setEditMartingaleForm)}
                  disabled={editMartingaleForm.ratios.length >= MAX_MARTINGALE_STEPS}
                  className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 hover:underline disabled:opacity-30 disabled:hover:no-underline">
                  + 新增一次補投入
                </button>
                <p className="text-xs text-amber-400 font-mono mt-2">{editMartingaleForm.ratios.filter((r) => r !== "").join(" : ") || "—"}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">備註（選填）</label>
                <input value={editMartingaleForm.note} onChange={(e) => setEditMartingaleForm({ ...editMartingaleForm, note: e.target.value })}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3.5 py-2.5 text-sm text-slate-50 focus:border-indigo-500 transition-colors" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setEditingMartingale(null)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-slate-600 text-slate-300 hover:bg-slate-700 transition-colors">
                  取消
                </button>
                <button type="submit" disabled={martingaleSaving}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-60">
                  {martingaleSaving ? "儲存中..." : "儲存"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
