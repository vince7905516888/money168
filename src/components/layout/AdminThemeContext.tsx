"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const NO_OVERRIDE = {};

// 淺色主題：後台頁面把卡片底色/邊框/文字寫死成 bg-slate-800、text-white 等深色 token，
// 這裡用 inline style 覆寫這幾個 CSS 變數，讓既有 class 不用逐一改寫就整批翻成淺色。
// 注意：這幾個 token 全部寫死成「色碼字面值」而不是互相 var() 參照——同一個元素上
// 這些變數是同時生效的，如果用 var(--color-slate-700) 這種方式互相參照，會因為
// slate-700 自己也被這裡改寫而連鎖解析成同一個淺色，導致每一階都變成同一種顏色
// （之前的版本就是踩到這個坑，卡片文字全部變成同一種淺灰色）。
const LIGHT_OVERRIDE: Record<string, string> = {
  "--color-slate-800": "#ffffff", // 卡片底色
  "--color-slate-700": "#e2e8f0", // 邊框／分隔線／輸入框底色
  "--color-slate-600": "#cad5e2", // 輸入框邊框／切換開關關閉狀態
  "--color-slate-500": "#90a1b9", // 淡文字（placeholder）
  "--color-slate-400": "#45556c", // 次要文字（標籤、說明文字）
  "--color-slate-300": "#314158", // 卡片內主要文字
  "--color-slate-50": "#0f172b", // 標題／數值等強調文字
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
