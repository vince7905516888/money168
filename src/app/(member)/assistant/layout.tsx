import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

// 呼叫Gemini API是計費/計量的外部服務，明確排除在「未登入可瀏覽」範圍外，
// 避免被匿名流量打爆額度（見 market/tw-stock/layout.tsx 同樣的理由）。
export default async function AssistantLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");
  return <>{children}</>;
}
