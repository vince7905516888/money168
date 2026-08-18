"use client";

import { useEffect, useState } from "react";

interface UsageRow {
  userId: string;
  name: string;
  email: string;
  role: string;
  requestCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  lastUsedAt: string | null;
}

export default function TokenUsagePage() {
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/token-usage")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setRows(Array.isArray(data?.rows) ? data.rows : []);
        setGrandTotal(data?.grandTotal ?? 0);
      })
      .finally(() => setLoading(false));
  }, []);

  const fmt = (n: number) => n.toLocaleString("zh-TW");

  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">TOKEN使用量</h1>
        <p className="text-slate-400 text-sm mt-1">依會員帳號彙總智能助理（Gemini）的token用量</p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700">
          <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">全站累計TOKEN</div>
          <div className="text-2xl font-bold text-white">{fmt(grandTotal)}</div>
        </div>
        <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700">
          <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">有使用紀錄的會員數</div>
          <div className="text-2xl font-bold text-white">{rows.length} <span className="text-sm font-normal text-slate-400">人</span></div>
        </div>
      </div>

      <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm">載入中...</div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">目前還沒有任何使用紀錄</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-400 uppercase tracking-wider border-b border-slate-700">
                  <th className="text-left font-semibold px-5 py-3">會員</th>
                  <th className="text-right font-semibold px-5 py-3">呼叫次數</th>
                  <th className="text-right font-semibold px-5 py-3">輸入 Tokens</th>
                  <th className="text-right font-semibold px-5 py-3">輸出 Tokens</th>
                  <th className="text-right font-semibold px-5 py-3">總計 Tokens</th>
                  <th className="text-right font-semibold px-5 py-3">最後使用時間</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {rows.map((r) => (
                  <tr key={r.userId} className="hover:bg-slate-700/40 transition-colors">
                    <td className="px-5 py-3">
                      <div className="text-white font-medium">{r.name}</div>
                      <div className="text-xs text-slate-400">{r.email}</div>
                    </td>
                    <td className="px-5 py-3 text-right text-slate-300">{fmt(r.requestCount)}</td>
                    <td className="px-5 py-3 text-right text-slate-300">{fmt(r.promptTokens)}</td>
                    <td className="px-5 py-3 text-right text-slate-300">{fmt(r.completionTokens)}</td>
                    <td className="px-5 py-3 text-right font-semibold text-amber-400">{fmt(r.totalTokens)}</td>
                    <td className="px-5 py-3 text-right text-slate-400 text-xs">
                      {r.lastUsedAt ? new Date(r.lastUsedAt).toLocaleString("zh-TW") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[11px] text-slate-500 mt-3">目前只記錄「智能助理」（Gemini）的呼叫用量，依「總計 Tokens」由高到低排序</p>
    </div>
  );
}
