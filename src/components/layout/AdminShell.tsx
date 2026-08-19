"use client";

import type { ReactNode } from "react";
import { useAdminTheme, ADMIN_THEMES } from "./AdminThemeContext";

export default function AdminShell({ children }: { children: ReactNode }) {
  const { themeKey } = useAdminTheme();
  return (
    <div className={`flex min-h-screen transition-colors duration-300 ${ADMIN_THEMES[themeKey].bg}`}>
      {children}
    </div>
  );
}
