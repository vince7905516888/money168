"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { NavItem } from "@/lib/nav-items";

const NavPermissionContext = createContext<NavItem[]>([]);

export function NavPermissionProvider({
  visibleItems,
  children,
}: {
  visibleItems: NavItem[];
  children: ReactNode;
}) {
  return <NavPermissionContext.Provider value={visibleItems}>{children}</NavPermissionContext.Provider>;
}

export function useVisibleNavItems() {
  return useContext(NavPermissionContext);
}
