import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      role: string;
      isSuperAdmin: boolean;
    };
  }

  interface User {
    id: string;
    name: string;
    email: string;
    role: string;
    isSuperAdmin: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string;
    isSuperAdmin: boolean;
  }
}
