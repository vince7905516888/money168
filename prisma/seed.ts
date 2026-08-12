import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import "dotenv/config";

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const bankCategories = [
  { name: "銀行", type: "INCOME" as const, icon: "🏦", color: "#0ea5e9" },
  { name: "銀行", type: "EXPENSE" as const, icon: "🏦", color: "#0ea5e9" },
  { name: "投資", type: "EXPENSE" as const, icon: "📊", color: "#6366f1" },
];

async function main() {
  const adminPassword = await bcrypt.hash("admin123456", 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@moneyflow.com" },
    update: {},
    create: {
      name: "系統管理員",
      email: "admin@moneyflow.com",
      password: adminPassword,
      role: "ADMIN",
    },
  });

  console.log("✓ 管理員帳號已建立:", admin.email);
  console.log("  密碼: admin123456");
  console.log("  請登入後台後立即更改密碼！");

  // 幫所有現有用戶補上銀行分類（若尚未有的話）
  const users = await prisma.user.findMany({ select: { id: true } });
  for (const user of users) {
    for (const cat of bankCategories) {
      const existing = await prisma.category.findFirst({
        where: { userId: user.id, name: cat.name, type: cat.type },
      });
      if (!existing) {
        await prisma.category.create({ data: { ...cat, userId: user.id } });
      }
    }
  }
  console.log("✓ 銀行分類已補充至所有用戶");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
