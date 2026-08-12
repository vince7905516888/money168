import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import AdminSidebar from "@/components/layout/AdminSidebar";

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
      <AdminSidebar userName={session.user.name} />
      <main className="ml-60 flex-1 p-8">{children}</main>
    </div>
  );
}
