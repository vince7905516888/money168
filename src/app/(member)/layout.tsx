import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import MemberSidebar from "@/components/layout/MemberSidebar";
import MainArea from "@/components/layout/MainArea";
import { SidebarProvider } from "@/components/layout/SidebarContext";
import { NavPermissionProvider } from "@/components/layout/NavPermissionContext";
import PagePermissionGuard from "@/components/layout/PagePermissionGuard";
import { getVisibleNavItems } from "@/lib/permissions";

export default async function MemberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (session?.user.role === "ADMIN") redirect("/admin/dashboard");

  // 未登入訪客也能瀏覽大部分頁面（空白範例畫面），實際寫入操作會在頁面內被 API 擋下導去登入頁
  const visibleItems = await getVisibleNavItems(session?.user.id ?? null, session?.user.role ?? null);

  return (
    <div className="flex min-h-screen bg-slate-50">
      <NavPermissionProvider visibleItems={visibleItems}>
        <SidebarProvider storageKey="member-sidebar-collapsed">
          <MemberSidebar userName={session?.user.name ?? null} />
          <MainArea>
            <PagePermissionGuard>{children}</PagePermissionGuard>
          </MainArea>
        </SidebarProvider>
      </NavPermissionProvider>
    </div>
  );
}
