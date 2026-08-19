"use client";

import { useEffect, useState, useCallback } from "react";
import { useAdminTheme, ADMIN_THEMES } from "@/components/layout/AdminThemeContext";

interface NavConfigItem {
  key: string;
  label: string;
  href: string;
  section: string | null;
  enabled: boolean;
  order: number;
}

export default function NavLayoutPage() {
  const { themeKey } = useAdminTheme();
  const skin = ADMIN_THEMES[themeKey];
  const [items, setItems] = useState<NavConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/nav-config");
    const data = await res.json();
    setItems(Array.isArray(data) ? data : []);
    setLoading(false);
    setDirty(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const normalizeOrder = (list: NavConfigItem[]) =>
    list.map((item, index) => ({ ...item, order: index }));

  const toggleEnabled = (key: string) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, enabled: !it.enabled } : it)));
    setDirty(true);
  };

  const move = (index: number, dir: -1 | 1) => {
    setItems((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return normalizeOrder(next);
    });
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    await fetch("/api/admin/nav-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: normalizeOrder(items) }),
    });
    setSaving(false);
    fetchItems();
  };

  return (
    <div className="max-w-3xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className={`text-2xl font-bold ${skin.heading}`}>前台欄目排版</h1>
          <p className={`${skin.subheading} text-sm mt-1`}>調整前台側邊欄選單的顯示順序與開關（全站預設，個人權限請至「權限管理」）</p>
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
        <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden divide-y divide-slate-700">
          {items.map((item, index) => (
            <div key={item.key} className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-700/40 transition-colors">
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    className="text-slate-500 hover:text-slate-50 disabled:opacity-20 disabled:hover:text-slate-500 text-xs leading-none px-1"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => move(index, 1)}
                    disabled={index === items.length - 1}
                    className="text-slate-500 hover:text-slate-50 disabled:opacity-20 disabled:hover:text-slate-500 text-xs leading-none px-1"
                  >
                    ▼
                  </button>
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-50">{item.label}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {item.section ? `${item.section} · ` : ""}
                    <span className="font-mono">{item.href}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => toggleEnabled(item.key)}
                className={`relative w-11 h-6 rounded-full transition-colors ${item.enabled ? "bg-indigo-600" : "bg-slate-600"}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                    item.enabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
