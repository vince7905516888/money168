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

// 第一次檢查時間（台灣時間整點 0–23），null 代表不指定（設定後立即同步）
function parseSyncHour(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : undefined;
}

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const cred = await prisma.binanceCredential.findUnique({
    where: { userId: session.user.id },
    select: { apiKeyHint: true, keyChangedAt: true, syncHour: true },
  });
  return NextResponse.json(cred ? { connected: true, apiKeyHint: cred.apiKeyHint, keyChangedAt: cred.keyChangedAt, syncHour: cred.syncHour } : { connected: false });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { apiKey, apiSecret, syncHour: rawHour } = await req.json();
  const syncHour = parseSyncHour(rawHour) ?? null;
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
    create: { userId: session.user.id, apiKeyEnc, apiSecretEnc, apiKeyHint, syncHour },
    update: { apiKeyEnc, apiSecretEnc, apiKeyHint, syncHour, keyChangedAt: new Date() },
  });
  await logMemberActivity(session.user.id, "SET_BINANCE_API", "binance", `設定幣安 API 金鑰（末 4 碼 ${apiKeyHint}）`);

  return NextResponse.json({ connected: true, apiKeyHint, syncHour });
}

// 只修改第一次檢查時間（不用重新輸入金鑰）
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { syncHour: rawHour } = await req.json();
  const syncHour = parseSyncHour(rawHour);
  if (syncHour === undefined) return NextResponse.json({ error: "時間格式不正確" }, { status: 400 });

  const updated = await prisma.binanceCredential.updateMany({ where: { userId: session.user.id }, data: { syncHour } });
  if (updated.count === 0) return NextResponse.json({ error: "尚未連結幣安 API" }, { status: 404 });
  return NextResponse.json({ syncHour });
}

export async function DELETE() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  await prisma.binanceCredential.deleteMany({ where: { userId: session.user.id } });
  await logMemberActivity(session.user.id, "REMOVE_BINANCE_API", "binance", "移除幣安 API 金鑰");

  return NextResponse.json({ connected: false });
}
