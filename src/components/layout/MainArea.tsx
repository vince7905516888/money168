"use client";

import type { CSSProperties, ReactNode } from "react";
import { useSidebar } from "./SidebarContext";
import { useAdminTheme, ADMIN_THEMES } from "./AdminThemeContext";

export default function MainArea({ children }: { children: ReactNode }) {
  const { collapsed } = useSidebar();
  const { themeKey } = useAdminTheme();
  return (
    <main
      style={ADMIN_THEMES[themeKey].vars as CSSProperties}
      className={`flex-1 min-w-0 p-8 transition-all duration-200 ${collapsed ? "ml-16" : "ml-60"}`}
    >
      {children}
    </main>
  );
}
