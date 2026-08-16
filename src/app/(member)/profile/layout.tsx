import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

// 會員資料管理是個人帳號設定（改密碼、兩步驟驗證等），沒有帳號就沒有意義，
// 明確排除在「未登入可瀏覽」範圍外。
export default async function ProfileLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");
  return <>{children}</>;
}
