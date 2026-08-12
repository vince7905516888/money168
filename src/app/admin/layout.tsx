import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import AdminSidebar from "@/components/layout/AdminSidebar";
import MainArea from "@/components/layout/MainArea";
import { SidebarProvider } from "@/components/layout/SidebarContext";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  return (
    <div className="flex min-h-screen bg-slate-900">
      <SidebarProvider storageKey="admin-sidebar-collapsed">
        <AdminSidebar userName={session.user.name} />
        <MainArea>{children}</MainArea>
      </SidebarProvider>
    </div>
  );
}
