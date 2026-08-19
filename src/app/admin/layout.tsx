import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import AdminSidebar from "@/components/layout/AdminSidebar";
import MainArea from "@/components/layout/MainArea";
import { SidebarProvider } from "@/components/layout/SidebarContext";
import { AdminThemeProvider } from "@/components/layout/AdminThemeContext";
import AdminShell from "@/components/layout/AdminShell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  return (
    <AdminThemeProvider>
      <AdminShell>
        <SidebarProvider storageKey="admin-sidebar-collapsed">
          <AdminSidebar userName={session.user.name} isSuperAdmin={session.user.isSuperAdmin} />
          <MainArea>{children}</MainArea>
        </SidebarProvider>
      </AdminShell>
    </AdminThemeProvider>
  );
}
