import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

// 台灣股市頁串接付費/限流的外部資料源（永豐即時報價、證交所法人資料等），
// 跟其他頁面不同，明確排除在「未登入可瀏覽」範圍外，避免被匿名流量打爆。
export default async function TwStockLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");
  return <>{children}</>;
}
