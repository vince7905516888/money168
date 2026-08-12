import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import MemberSidebar from "@/components/layout/MemberSidebar";
import MainArea from "@/components/layout/MainArea";
import { SidebarProvider } from "@/components/layout/SidebarContext";

export default async function MemberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role === "ADMIN") redirect("/admin/dashboard");

  return (
    <div className="flex min-h-screen bg-slate-50">
      <SidebarProvider storageKey="member-sidebar-collapsed">
        <MemberSidebar userName={session.user.name} />
        <MainArea>{children}</MainArea>
      </SidebarProvider>
    </div>
  );
}
