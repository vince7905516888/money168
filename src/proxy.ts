import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);
export { auth as proxy };

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/transactions/:path*",
    "/reports/:path*",
    "/admin/:path*",
    "/login",
    "/register",
  ],
};
