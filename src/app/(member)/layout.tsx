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
  if (!session) redirect("/login");
  if (session.user.role === "ADMIN") redirect("/admin/dashboard");

  const visibleItems = await getVisibleNavItems(session.user.id, session.user.role);

  return (
    <div className="flex min-h-screen bg-slate-50">
      <NavPermissionProvider visibleItems={visibleItems}>
        <SidebarProvider storageKey="member-sidebar-collapsed">
          <MemberSidebar userName={session.user.name} />
          <MainArea>
            <PagePermissionGuard>{children}</PagePermissionGuard>
          </MainArea>
        </SidebarProvider>
      </NavPermissionProvider>
    </div>
  );
}
