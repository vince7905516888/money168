"use client";

import { useEffect, useState, useCallback } from "react";
import { useAdminTheme, ADMIN_THEMES } from "@/components/layout/AdminThemeContext";

export default function MailSettingsPage() {
  const { themeKey } = useAdminTheme();
  const skin = ADMIN_THEMES[themeKey];

  const [gmailUser, setGmailUser] = useState("");
  const [gmailPass, setGmailPass] = useState("");
  const [hasPassword, setHasPassword] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [testTo, setTestTo] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const fetchSetting = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/mail-settings");
    if (res.ok) {
      const data = await res.json();
      setGmailUser(data.gmailUser ?? "");
      setHasPassword(!!data.hasPassword);
      setUpdatedAt(data.updatedAt ?? null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchSetting(); }, [fetchSetting]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setTestResult(null);
    const res = await fetch("/api/admin/mail-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gmailUser, gmailPass }),
    });
    setSaving(false);
    if (res.ok) {
      setGmailPass("");
      fetchSetting();
    } else {
      const err = await res.json().catch(() => null);
      alert(err?.error || "儲存失敗");
    }
  };

  const handleTest = async () => {
    setTestSending(true);
    setTestResult(null);
    const res = await fetch("/api/admin/mail-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: testTo || undefined }),
    });
    const data = await res.json().catch(() => null);
    setTestSending(false);
    setTestResult({ ok: res.ok, message: res.ok ? data?.message : (data?.error || "寄送失敗") });
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className={`text-2xl font-bold ${skin.heading}`}>寄信設定</h1>
        <p className={`${skin.subheading} text-sm mt-1`}>
          設定全站共用的 Gmail 寄件帳號，用於「投資策略」加碼價通知等系統信件
        </p>
      </div>

      {loading ? (
        <div className="text-slate-400 text-sm">載入中...</div>
      ) : (
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6">
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Gmail 帳號</label>
              <input
                type="email"
                required
                value={gmailUser}
                onChange={(e) => setGmailUser(e.target.value)}
                placeholder="例如：yourname@gmail.com"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3.5 py-2.5 text-sm text-slate-50 placeholder:text-slate-500 focus:border-indigo-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">應用程式密碼（App Password）</label>
              <input
                type="password"
                value={gmailPass}
                onChange={(e) => setGmailPass(e.target.value)}
                placeholder={hasPassword ? "已設定，留空表示不修改" : "請至 Google 帳號設定申請應用程式密碼"}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3.5 py-2.5 text-sm text-slate-50 placeholder:text-slate-500 focus:border-indigo-500 transition-colors"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                需先在 Google 帳號開啟兩步驟驗證，才能在「應用程式密碼」頁面產生 16 碼密碼，不是 Gmail 登入密碼本身
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className={`w-2 h-2 rounded-full ${hasPassword ? "bg-emerald-400" : "bg-slate-500"}`} />
              {hasPassword ? "目前已設定，寄信功能已啟用" : "尚未設定應用程式密碼，寄信功能尚未啟用"}
              {updatedAt && <span className="text-slate-500">· 最後更新 {new Date(updatedAt).toLocaleString("zh-TW")}</span>}
            </div>
            <div className="pt-2">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-60"
              >
                {saving ? "儲存中..." : "儲存"}
              </button>
            </div>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-700">
            <label className="block text-sm font-medium text-slate-300 mb-1.5">寄送測試信</label>
            <div className="flex gap-2">
              <input
                type="email"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="留空則寄到目前登入的管理員信箱"
                className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3.5 py-2.5 text-sm text-slate-50 placeholder:text-slate-500 focus:border-indigo-500 transition-colors"
              />
              <button
                type="button"
                onClick={handleTest}
                disabled={testSending}
                className="px-4 py-2.5 rounded-lg text-sm font-semibold border border-slate-600 text-slate-200 hover:bg-slate-700 transition-colors disabled:opacity-60 whitespace-nowrap"
              >
                {testSending ? "寄送中..." : "寄送測試信"}
              </button>
            </div>
            {testResult && (
              <p className={`text-xs mt-2 ${testResult.ok ? "text-emerald-400" : "text-red-400"}`}>
                {testResult.message}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="mt-4 bg-slate-800/50 rounded-xl px-5 py-4 border border-slate-700/50">
        <p className="text-xs text-slate-400">
          <span className="text-slate-300 font-medium">用途</span>：「投資策略」頁的股票/虛擬貨幣加碼價通知會用這組帳號寄信，
          背景排程每 30 分鐘檢查一次，同一批只會通知一次，除非目標價被改過
        </p>
      </div>
    </div>
  );
}
