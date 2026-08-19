"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export const ADMIN_THEMES = {
  slate: { label: "深藍", swatch: "#0f172a", bg: "bg-slate-900", sidebar: "bg-slate-900", heading: "text-white", subheading: "text-slate-400" },
  violet: { label: "深紫", swatch: "#2e1065", bg: "bg-violet-950", sidebar: "bg-violet-950", heading: "text-white", subheading: "text-slate-400" },
  emerald: { label: "墨綠", swatch: "#022c22", bg: "bg-emerald-950", sidebar: "bg-emerald-950", heading: "text-white", subheading: "text-slate-400" },
  black: { label: "純黑", swatch: "#000000", bg: "bg-black", sidebar: "bg-black", heading: "text-white", subheading: "text-slate-400" },
  light: { label: "淺色", swatch: "#f1f5f9", bg: "bg-slate-100", sidebar: "bg-slate-900", heading: "text-slate-900", subheading: "text-slate-500" },
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
