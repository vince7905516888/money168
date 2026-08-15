"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav-items";
import { useVisibleNavItems } from "./NavPermissionContext";

export default function PagePermissionGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const visibleItems = useVisibleNavItems();

  const matched = NAV_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(item.href + "/")
  );
  const blocked = matched ? !visibleItems.some((i) => i.key === matched.key) : false;

  useEffect(() => {
    if (blocked) router.replace("/dashboard");
  }, [blocked, router]);

  if (blocked) return null;
  return <>{children}</>;
}
