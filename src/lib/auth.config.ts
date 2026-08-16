import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string }).role;
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { role?: string; id?: string }).role = token.role as string;
        (session.user as { role?: string; id?: string }).id = token.id as string;
      }
      return session;
    },
    // 未登入訪客現在可以瀏覽大部分會員頁面（空白範例畫面），實際的頁面級存取控制
    // （台灣股市、會員資料管理需要登入、管理後台需要登入+管理員角色）都改在各自的
    // layout.tsx 做，這裡只保留「登入/註冊頁如果已經登入就導開」這個全站共用的行為，
    // 避免跟 layout.tsx 的邏輯出現兩套規則各自為政、彼此漂移不同步的問題。
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isAdmin = (auth?.user as { role?: string })?.role === "ADMIN";
      const pathname = nextUrl.pathname;

      const authRoutes = ["/login", "/register"];
      if (authRoutes.some((r) => pathname.startsWith(r))) {
        if (isLoggedIn) return Response.redirect(new URL(isAdmin ? "/admin/dashboard" : "/transactions", nextUrl));
        return true;
      }

      return true;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
