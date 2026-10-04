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

const PROMPT = `你是記帳助理，請讀取這張發票、收據、付款截圖或購物／團購 App 的訂單截圖，只輸出 JSON：
- isGroupBuy：是否為團購 App 的訂單／取貨截圖（true／false）
- orders：截圖裡每一筆獨立的訂單或發票各一筆（一般發票、收據只有一筆）；每筆包含：
  - date：消費日期，格式 YYYY-MM-DD；台灣發票的民國年要換算成西元（例如 115 年 = 2026 年）；看不出來就回傳空字串
  - store：店家或平台名稱，簡短即可（例如「全聯」「有購省團購」）
  - amount：這筆實際付款總金額（數字，含稅、扣掉折扣後的總計；團購訂單用「應付總額」）
  - currency：幣別代碼（TWD、CNY、USD、JPY…），台灣的單據為 TWD
  - items：品項名稱（最多 5 項）；團購訂單沒有文字品名時，從商品圖片上的文字判斷
  - orderNo：訂單或出貨單編號、發票號碼，沒有就空字串
  - category：從 ${CATEGORIES.join("、")} 選一個最接近的
  - cardHint：如果看得出付款的信用卡或銀行名稱（例如「國泰」「台新」），寫出來；否則空字串
  - uncertain：這筆被截斷、金額或內容看不完整時為 true
看不清楚的欄位不要猜測，回傳空字串或 0。`;

const ORDER_SCHEMA = {
  type: "OBJECT",
  properties: {
    date: { type: "STRING" },
    store: { type: "STRING" },
    amount: { type: "NUMBER" },
    currency: { type: "STRING" },
    items: { type: "ARRAY", items: { type: "STRING" } },
    orderNo: { type: "STRING" },
    category: { type: "STRING", enum: CATEGORIES },
    cardHint: { type: "STRING" },
    uncertain: { type: "BOOLEAN" },
  },
  required: ["date", "store", "amount", "currency", "items", "orderNo", "category", "cardHint", "uncertain"],
};
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: { isGroupBuy: { type: "BOOLEAN" }, orders: { type: "ARRAY", items: ORDER_SCHEMA } },
  required: ["isGroupBuy", "orders"],
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orders = (Array.isArray(parsed.orders) ? parsed.orders : []).slice(0, 20).map((o: any) => ({
      date: normalizeDate(String(o.date ?? "")),
      store: String(o.store ?? "").slice(0, 60),
      amount: Number(o.amount) > 0 ? Number(o.amount) : 0,
      currency: /^[A-Z]{3}$/.test(o.currency ?? "") ? o.currency : "TWD",
      items: Array.isArray(o.items) ? o.items.map((x: unknown) => String(x).slice(0, 40)).slice(0, 5) : [],
      orderNo: String(o.orderNo ?? "").replace(/^#/, "").slice(0, 40),
      category: CATEGORIES.includes(o.category) ? o.category : "其他支出",
      cardHint: String(o.cardHint ?? "").slice(0, 30),
      uncertain: !!o.uncertain || !(Number(o.amount) > 0),
    }));
    return NextResponse.json({ isGroupBuy: !!parsed.isGroupBuy, orders });
  } catch (e) {
    console.error("receipt parse failed:", e);
    return NextResponse.json({ error: "辨識失敗，請再試一次或手動輸入" }, { status: 502 });
  }
}
