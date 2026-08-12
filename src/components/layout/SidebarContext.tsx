"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface SidebarContextValue {
  collapsed: boolean;
  toggle: () => void;
  expand: () => void;
}

const SidebarContext = createContext<SidebarContextValue>({
  collapsed: false,
  toggle: () => {},
  expand: () => {},
});

export function SidebarProvider({ children, storageKey }: { children: ReactNode; storageKey: string }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(storageKey) === "1") setCollapsed(true);
  }, [storageKey]);

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(storageKey, next ? "1" : "0");
      return next;
    });
  };

  const expand = () => {
    setCollapsed(false);
    localStorage.setItem(storageKey, "0");
  };

  return (
    <SidebarContext.Provider value={{ collapsed, toggle, expand }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}
