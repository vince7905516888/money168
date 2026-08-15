import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AdminSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") redirect("/login");
  if (!session.user.isSuperAdmin) redirect("/admin/dashboard");

  return <>{children}</>;
}
