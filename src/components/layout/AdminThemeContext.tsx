"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const NO_OVERRIDE = {};

// 淺色主題：後台頁面把卡片底色/邊框/文字寫死成 bg-slate-800、text-white 等深色 token，
// 這裡用 inline style 覆寫這幾個 CSS 變數（inline style 的優先權高於任何外部樣式表規則，
// 不受 Tailwind cascade layer 影響），讓既有 class 不用逐一改寫就整批翻成淺色。
const LIGHT_OVERRIDE: Record<string, string> = {
  "--color-slate-800": "var(--color-white)",
  "--color-slate-700": "var(--color-slate-200)",
  "--color-slate-600": "var(--color-slate-300)",
  "--color-slate-500": "var(--color-slate-400)",
  "--color-slate-400": "var(--color-slate-600)",
  "--color-slate-300": "var(--color-slate-700)",
  "--color-slate-50": "var(--color-slate-900)",
};

export const ADMIN_THEMES = {
  slate: { label: "深藍", swatch: "#0f172a", bg: "bg-slate-900", sidebar: "bg-slate-900", heading: "text-white", subheading: "text-slate-400", vars: NO_OVERRIDE },
  violet: { label: "深紫", swatch: "#2e1065", bg: "bg-violet-950", sidebar: "bg-violet-950", heading: "text-white", subheading: "text-slate-400", vars: NO_OVERRIDE },
  emerald: { label: "墨綠", swatch: "#022c22", bg: "bg-emerald-950", sidebar: "bg-emerald-950", heading: "text-white", subheading: "text-slate-400", vars: NO_OVERRIDE },
  black: { label: "純黑", swatch: "#000000", bg: "bg-black", sidebar: "bg-black", heading: "text-white", subheading: "text-slate-400", vars: NO_OVERRIDE },
  light: { label: "淺色", swatch: "#f1f5f9", bg: "bg-slate-100", sidebar: "bg-slate-900", heading: "text-slate-900", subheading: "text-slate-500", vars: LIGHT_OVERRIDE },
} as const;

export type AdminThemeKey = keyof typeof ADMIN_THEMES;

const STORAGE_KEY = "admin-bg-theme";

interface AdminThemeContextValue {
  themeKey: AdminThemeKey;
  setThemeKey: (key: AdminThemeKey) => void;
}

const AdminThemeContext = createContext<AdminThemeContextValue>({
  themeKey: "slate",
  setThemeKey: () => {},
});

export function AdminThemeProvider({ children }: { children: ReactNode }) {
  const [themeKey, setThemeKeyState] = useState<AdminThemeKey>("slate");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved in ADMIN_THEMES) setThemeKeyState(saved as AdminThemeKey);
  }, []);

  const setThemeKey = (key: AdminThemeKey) => {
    setThemeKeyState(key);
    localStorage.setItem(STORAGE_KEY, key);
  };

  return (
    <AdminThemeContext.Provider value={{ themeKey, setThemeKey }}>
      {children}
    </AdminThemeContext.Provider>
  );
}

export function useAdminTheme() {
  return useContext(AdminThemeContext);
}
