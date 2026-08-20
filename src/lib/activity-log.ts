import { prisma } from "@/lib/prisma";

export async function logMemberActivity(userId: string, action: string, category: string, detail: string) {
  await prisma.memberActivityLog
    .create({ data: { userId, action, category, detail } })
    .catch((e) => console.error("member activity log failed:", e));
}
