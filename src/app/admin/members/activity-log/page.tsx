"use client";

import { useEffect, useState, useCallback } from "react";
import { useAdminTheme, ADMIN_THEMES } from "@/components/layout/AdminThemeContext";

interface ActivityLog {
  id: string;
  action: string;
  detail: string | null;
  createdAt: string;
  user: { name: string; email: string };
}

const ACTION_LABEL: Record<string, string> = {
  CREATE_MARTINGALE_STRATEGY: "新增自訂策略",
  DELETE_MARTINGALE_STRATEGY: "刪除自訂策略",
};

export default function MemberActivityLogPage() {
  const { themeKey } = useAdminTheme();
  const skin = ADMIN_THEMES[themeKey];
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/member-activity-log");
    const data = await res.json();
    setLogs(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className={`text-2xl font-bold ${skin.heading}`}>會員變動紀錄</h1>
        <p className={`${skin.subheading} text-sm mt-1`}>會員在前台自行新增/刪除的內容（例如自訂馬丁格爾策略）會記錄在這裡</p>
      </div>

      <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm">載入中...</div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">目前沒有任何變動紀錄</div>
        ) : (
          <div className="divide-y divide-slate-700">
            {logs.map((log) => (
              <div key={log.id} className="flex items-center justify-between px-5 py-4 hover:bg-slate-700/50 transition-colors">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-900 text-indigo-300 shrink-0">
                      {ACTION_LABEL[log.action] ?? log.action}
                    </span>
                    <span className="text-sm text-slate-50">{log.user.name}</span>
                    <span className="text-xs text-slate-500">{log.user.email}</span>
                  </div>
                  {log.detail && <div className="text-xs text-slate-400 mt-1">{log.detail}</div>}
                </div>
                <span className="text-xs text-slate-500 shrink-0">{new Date(log.createdAt).toLocaleString("zh-TW")}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="text-xs text-slate-500 mt-3 px-1">最多顯示最近 300 筆紀錄</p>
    </div>
  );
}
