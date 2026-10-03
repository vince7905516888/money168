import { NextRequest, NextResponse } from "next/server";
import { publicEncrypt, constants } from "node:crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logMemberActivity } from "@/lib/activity-log";

// 會員自行設定的幣安 API 金鑰（選填）。
// 網站只持有公鑰：金鑰用 RSA-OAEP 加密後存進資料庫，網站本身無法解密，也永遠不會回傳金鑰內容；
// 只有新加坡的同步排程工作（services/binance-sync）持有私鑰，能解開去讀幣安。
function encrypt(text: string): string {
  const pem = Buffer.from(process.env.BINANCE_CRED_PUBLIC_KEY ?? "", "base64").toString("utf8");
  if (!pem.includes("PUBLIC KEY")) throw new Error("伺服器尚未設定加密公鑰");
  return publicEncrypt({ key: pem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, Buffer.from(text, "utf8")).toString("base64");
}

// 幣安 API Key / Secret 皆為 64 碼英數字
const KEY_FORMAT = /^[A-Za-z0-9]{64}$/;

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const cred = await prisma.binanceCredential.findUnique({
    where: { userId: session.user.id },
    select: { apiKeyHint: true, updatedAt: true },
  });
  return NextResponse.json(cred ? { connected: true, apiKeyHint: cred.apiKeyHint, updatedAt: cred.updatedAt } : { connected: false });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { apiKey, apiSecret } = await req.json();
  const key = typeof apiKey === "string" ? apiKey.trim() : "";
  const secret = typeof apiSecret === "string" ? apiSecret.trim() : "";
  if (!KEY_FORMAT.test(key) || !KEY_FORMAT.test(secret)) {
    return NextResponse.json({ error: "API Key 與 Secret Key 應為 64 碼英數字，請確認是否複製完整" }, { status: 400 });
  }

  let apiKeyEnc: string, apiSecretEnc: string;
  try {
    apiKeyEnc = encrypt(key);
    apiSecretEnc = encrypt(secret);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const apiKeyHint = key.slice(-4);
  await prisma.binanceCredential.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, apiKeyEnc, apiSecretEnc, apiKeyHint },
    update: { apiKeyEnc, apiSecretEnc, apiKeyHint },
  });
  await logMemberActivity(session.user.id, "SET_BINANCE_API", "binance", `設定幣安 API 金鑰（末 4 碼 ${apiKeyHint}）`);

  return NextResponse.json({ connected: true, apiKeyHint });
}

export async function DELETE() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  await prisma.binanceCredential.deleteMany({ where: { userId: session.user.id } });
  await logMemberActivity(session.user.id, "REMOVE_BINANCE_API", "binance", "移除幣安 API 金鑰");

  return NextResponse.json({ connected: false });
}
