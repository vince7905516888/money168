"use client";

import { useEffect, useState, useCallback } from "react";

const TIERS = [
  { key: "FREE", label: "一般會員" },
  { key: "BASIC", label: "進階會員" },
  { key: "PRO", label: "尊榮會員" },
] as const;

interface MatrixRow {
  key: string;
  label: string;
  section: string | null;
  tiers: Record<string, boolean>;
}

export default function TiersPage() {
  const [rows, setRows] = useState<MatrixRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const fetchMatrix = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/tier-access");
    const data = await res.json();
    setRows(Array.isArray(data) ? data : []);
    setLoading(false);
    setDirty(false);
  }, []);

  useEffect(() => { fetchMatrix(); }, [fetchMatrix]);

  const toggle = (pageKey: string, tier: string) => {
    setRows((prev) =>
      prev.map((row) =>
        row.key === pageKey ? { ...row, tiers: { ...row.tiers, [tier]: !row.tiers[tier] } } : row
      )
    );
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const items = rows.flatMap((row) =>
      TIERS.map((t) => ({ tier: t.key, pageKey: row.key, allowed: row.tiers[t.key] }))
    );
    await fetch("/api/admin/tier-access", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    setSaving(false);
    fetchMatrix();
  };

  return (
    <div className="max-w-3xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">會員等級設定</h1>
          <p className="text-slate-400 text-sm mt-1">設定每個會員等級預設能看到哪些前台欄目、能用哪些子功能</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50"
        >
          {saving ? "儲存中..." : "儲存變更"}
        </button>
      </div>

      {loading ? (
        <div className="text-slate-400 text-sm">載入中...</div>
      ) : (
        <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
          <div className="grid grid-cols-12 px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-700">
            <div className="col-span-6">項目</div>
            {TIERS.map((t) => (
              <div key={t.key} className="col-span-2 text-center">{t.label}</div>
            ))}
          </div>
          <div className="divide-y divide-slate-700">
            {rows.map((row) => (
              <div key={row.key} className="grid grid-cols-12 items-center px-5 py-3.5 hover:bg-slate-700/40 transition-colors">
                <div className="col-span-6">
                  <div className="text-sm font-medium text-white">{row.label}</div>
                  {row.section && <div className="text-xs text-slate-500 mt-0.5">{row.section}</div>}
                </div>
                {TIERS.map((t) => (
                  <div key={t.key} className="col-span-2 flex justify-center">
                    <input
                      type="checkbox"
                      checked={row.tiers[t.key] ?? true}
                      onChange={() => toggle(row.key, t.key)}
                      className="accent-indigo-500 w-4 h-4"
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
