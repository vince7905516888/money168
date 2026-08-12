"use client";

import type { ReactNode } from "react";
import { useSidebar } from "./SidebarContext";

export default function MainArea({ children }: { children: ReactNode }) {
  const { collapsed } = useSidebar();
  return (
    <main className={`flex-1 p-8 transition-all duration-200 ${collapsed ? "ml-16" : "ml-60"}`}>
      {children}
    </main>
  );
}
