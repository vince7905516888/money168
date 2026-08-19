"use client";

import type { ReactNode } from "react";
import { useSidebar } from "./SidebarContext";
import { useAdminTheme } from "./AdminThemeContext";

export default function MainArea({ children }: { children: ReactNode }) {
  const { collapsed } = useSidebar();
  const { themeKey } = useAdminTheme();
  return (
    <main
      data-admin-theme={themeKey}
      className={`flex-1 min-w-0 p-8 transition-all duration-200 ${collapsed ? "ml-16" : "ml-60"}`}
    >
      {children}
    </main>
  );
}
