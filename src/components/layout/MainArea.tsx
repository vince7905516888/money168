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
      // 手機（< md）側邊欄展開時是蓋在內容上面，內容區固定只讓出收合寬度 64px；平板以上才依收合狀態讓出 64／240px
      className={`flex-1 min-w-0 p-4 sm:p-6 lg:p-8 transition-all duration-200 ml-16 ${collapsed ? "md:ml-16" : "md:ml-60"}`}
    >
      {children}
    </main>
  );
}
