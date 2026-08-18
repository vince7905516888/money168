import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// gemini-2.5-flash 對新用戶已經被下架（呼叫會直接404，官方訊息指名改用這個），
// 這裡固定用目前的正式版本，之後Google又下架的話要來這裡改。
const GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM_INSTRUCTION = `你是「MoneyFlow」記帳App裡的智能投資助理，用繁體中文回答，語氣專業但親切、簡潔。
你擅長回答投資相關知識問答：股票、ETF、基金、外匯、虛擬貨幣、貴金屬等名詞解釋、投資觀念、
一般市場常識。你沒有即時行情資料，如果使用者問「現在」「今天」的股價/匯率/金價這類即時數字，
不要憑空編造數字，提醒他們到App左側選單的「市場行情」查看即時K線圖。你的回答僅供知識參考，
不構成個人化的投資建議；遇到「我該不該買/賣」這類需要承擔個人財務風險的具體決策問題，
提醒使用者自行判斷或諮詢專業意見，不要直接下判斷。`;

const MAX_HISTORY_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 4000;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface GeminiPart {
  text?: string;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "尚未設定 GEMINI_API_KEY" }, { status: 500 });

  const body = await req.json().catch(() => null);
  const messages: ChatMessage[] = Array.isArray(body?.messages) ? body.messages : [];
  if (messages.length === 0) {
    return NextResponse.json({ error: "請輸入訊息" }, { status: 400 });
  }

  const contents = messages.slice(-MAX_HISTORY_MESSAGES).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: String(m.content ?? "").slice(0, MAX_MESSAGE_LENGTH) }],
  }));

  try {
    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      console.error("Gemini API error:", data);
      const message: string = data?.error?.message || "AI 服務目前無法回應";
      const friendly = /prepayment|billing|credit/i.test(message)
        ? "Gemini API 帳號額度不足，請到 Google AI Studio 設定計費後再試"
        : message;
      return NextResponse.json({ error: friendly }, { status: 502 });
    }

    const parts: GeminiPart[] = data?.candidates?.[0]?.content?.parts ?? [];
    const reply = parts.map((p) => p.text ?? "").join("");
    if (!reply) {
      return NextResponse.json({ error: "AI 沒有回應內容，請再試一次" }, { status: 502 });
    }

    return NextResponse.json({ reply });
  } catch (e) {
    console.error("Gemini fetch failed:", e);
    return NextResponse.json({ error: "連線 AI 服務失敗" }, { status: 502 });
  }
}
