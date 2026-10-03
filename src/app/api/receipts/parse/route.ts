import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// 拍照記帳：用 Gemini 讀發票／收據照片，回傳日期、店家、金額、幣別、品項與建議分類。
// 只做辨識、不寫入；會員在畫面上確認並選擇付款方式（信用卡／銀行／現金）後，
// 前端再呼叫既有的 /api/debts 或 /api/transactions 寫入，格式跟手動記帳完全一樣。
// 模型跟智能助理（/api/assistant/chat）用同一個版本，之後 Google 下架要一起改。
const GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const CATEGORIES = ["餐飲", "購物", "交通", "醫療", "娛樂", "其他支出"];

const PROMPT = `你是記帳助理，請讀取這張發票、收據或付款截圖，只輸出 JSON：
- date：消費日期，格式 YYYY-MM-DD；台灣發票的民國年要換算成西元（例如 115 年 = 2026 年）；看不出來就回傳空字串
- store：店家或商品名稱，簡短即可
- amount：實際付款總金額（數字，含稅、扣掉折扣後的總計，不是單一品項）
- currency：幣別代碼（TWD、CNY、USD、JPY…），台灣發票為 TWD
- items：主要品項名稱（最多 5 項）
- category：從 ${CATEGORIES.join("、")} 選一個最接近的
- cardHint：如果看得出付款的信用卡或銀行名稱（例如「國泰」「台新」），寫出來；否則空字串
看不清楚的欄位不要猜測，回傳空字串或 0。`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    date: { type: "STRING" },
    store: { type: "STRING" },
    amount: { type: "NUMBER" },
    currency: { type: "STRING" },
    items: { type: "ARRAY", items: { type: "STRING" } },
    category: { type: "STRING", enum: CATEGORIES },
    cardHint: { type: "STRING" },
  },
  required: ["date", "store", "amount", "currency", "items", "category", "cardHint"],
};

// 日期統一成西元 YYYY-MM-DD；AI 偶爾沒換算民國年（例如 115/10/04），這裡補換（年 < 1911 視為民國年 + 1911）
function normalizeDate(raw: string): string {
  const m = raw.trim().match(/^(\d{2,4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (!m) return "";
  let y = Number(m[1]);
  if (y < 1911) y += 1911;
  const mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return "";
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "尚未設定 GEMINI_API_KEY" }, { status: 500 });

  const body = await req.json().catch(() => null);
  const image = typeof body?.image === "string" ? body.image : "";
  const match = image.match(/^data:(image\/(?:jpeg|png|webp|heic|heif));base64,(.+)$/);
  if (!match) return NextResponse.json({ error: "請上傳 JPG、PNG 或 WebP 圖片" }, { status: 400 });
  const [, mimeType, data] = match;
  if (data.length * 0.75 > MAX_IMAGE_BYTES) return NextResponse.json({ error: "圖片太大，請重新拍攝或裁切" }, { status: 400 });

  try {
    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ inline_data: { mime_type: mimeType, data } }, { text: PROMPT }] }],
        // 讀發票不需要推理，關掉 thinking：辨識結果相同，token 約為原本的三分之一
        generationConfig: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA, temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
      }),
    });
    const result = await res.json();
    if (!res.ok) {
      console.error("Gemini receipt error:", result);
      const message: string = result?.error?.message || "AI 服務目前無法回應";
      const friendly = /prepayment|billing|credit/i.test(message) ? "Gemini API 帳號額度不足，請到 Google AI Studio 設定計費後再試" : message;
      return NextResponse.json({ error: friendly }, { status: 502 });
    }

    const text: string = (result?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
    const parsed = JSON.parse(text || "{}");

    // 記一筆 token 用量供後台「TOKEN使用量」彙總，記錄失敗不影響辨識結果
    const usage = result?.usageMetadata;
    if (usage) {
      await prisma.tokenUsageLog
        .create({
          data: {
            userId: session.user.id,
            feature: "receipt",
            model: GEMINI_MODEL,
            promptTokens: usage.promptTokenCount ?? 0,
            completionTokens: usage.candidatesTokenCount ?? 0,
            totalTokens: usage.totalTokenCount ?? 0,
          },
        })
        .catch((e) => console.error("token usage log failed:", e));
    }

    return NextResponse.json({
      date: normalizeDate(String(parsed.date ?? "")),
      store: String(parsed.store ?? "").slice(0, 60),
      amount: Number(parsed.amount) > 0 ? Number(parsed.amount) : 0,
      currency: /^[A-Z]{3}$/.test(parsed.currency ?? "") ? parsed.currency : "TWD",
      items: Array.isArray(parsed.items) ? parsed.items.map((x: unknown) => String(x).slice(0, 40)).slice(0, 5) : [],
      category: CATEGORIES.includes(parsed.category) ? parsed.category : "其他支出",
      cardHint: String(parsed.cardHint ?? "").slice(0, 30),
    });
  } catch (e) {
    console.error("receipt parse failed:", e);
    return NextResponse.json({ error: "辨識失敗，請再試一次或手動輸入" }, { status: 502 });
  }
}
