import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);
export { auth as proxy };

// 頁面級的存取控制都改在各自 layout.tsx 做（見 auth.config.ts 的說明），
// 這裡的 matcher 只需要涵蓋 authorized() 仍在處理的路由：已登入時把 /login、/register 導開。
export const config = {
  matcher: ["/login", "/register"],
};
