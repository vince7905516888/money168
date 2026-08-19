"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export const ADMIN_THEMES = {
  slate: { label: "深藍", swatch: "#0f172a", bg: "bg-slate-900" },
  violet: { label: "深紫", swatch: "#2e1065", bg: "bg-violet-950" },
  emerald: { label: "墨綠", swatch: "#022c22", bg: "bg-emerald-950" },
  black: { label: "純黑", swatch: "#000000", bg: "bg-black" },
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
