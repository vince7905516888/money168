import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import MemberSidebar from "@/components/layout/MemberSidebar";

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
      <MemberSidebar userName={session.user.name} />
      <main className="ml-60 flex-1 p-8">{children}</main>
    </div>
  );
}
