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
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isAdmin = (auth?.user as { role?: string })?.role === "ADMIN";
      const pathname = nextUrl.pathname;

      const authRoutes = ["/login", "/register"];
      const adminRoutes = pathname.startsWith("/admin");
      const memberRoutes =
        pathname.startsWith("/dashboard") ||
        pathname.startsWith("/transactions") ||
        pathname.startsWith("/reports");

      if (authRoutes.some((r) => pathname.startsWith(r))) {
        if (isLoggedIn) return Response.redirect(new URL(isAdmin ? "/admin/dashboard" : "/dashboard", nextUrl));
        return true;
      }

      if (adminRoutes) {
        if (!isLoggedIn) return Response.redirect(new URL("/login", nextUrl));
        if (!isAdmin) return Response.redirect(new URL("/dashboard", nextUrl));
        return true;
      }

      if (memberRoutes) {
        if (!isLoggedIn) return Response.redirect(new URL("/login", nextUrl));
        return true;
      }

      return true;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
