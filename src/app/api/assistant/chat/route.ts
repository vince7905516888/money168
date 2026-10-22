import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeUserAssetSummary } from "@/lib/user-asset-summary";

// gemini-2.5-flash 對新用戶已經被下架（呼叫會直接404，官方訊息指名改用這個），
// 這裡固定用目前的正式版本，之後Google又下架的話要來這裡改。
const GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM_INSTRUCTION = `你是「MoneyFlow」記帳App裡的智能投資助理，用繁體中文回答，語氣專業但親切、簡潔。
你擅長回答投資相關知識問答：股票、ETF、基金、外匯、虛擬貨幣、貴金屬等名詞解釋、投資觀念、
一般市場常識。你沒有即時行情資料，如果使用者問「現在」「今天」的股價/匯率/金價這類即時數字，
不要憑空編造數字，提醒他們到App左側選單的「市場行情」查看即時K線圖。
系統會在這段指示最後附上一段【使用者目前資產與收支資料】，是從使用者自己在App裡記錄的
收支、投資、負債資料即時計算出來的真實數字，你可以依據這些數字做個人化分析，例如資產配置
是否集中、本月支出是否偏高、淨資產趨勢等，主動點出數字背後的意義，不要只是覆誦清單。
但你仍然不是正式理財顧問，遇到「我該不該買/賣」這類需要承擔個人財務風險的具體決策問題，
提醒使用者自行判斷或諮詢專業意見，不要直接下判斷。使用者有時會上傳圖片（例如K線圖截圖、
報表截圖），你可以根據圖片內容回答，但一樣不構成個人化投資建議。`;

function fmtTwd(n: number): string {
  return Math.round(n).toLocaleString("zh-TW");
}

// 幫智能助理組一段使用者自己的資產/負債/本月收支摘要，跟「資產總攬」頁面同一套算法
// （computeUserAssetSummary），數字才會跟使用者畫面上看到的一致。
async function buildUserContext(userId: string): Promise<string> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [summary, monthTx, debts] = await Promise.all([
    computeUserAssetSummary(userId),
    prisma.transaction.findMany({
      where: { userId, source: "CASH", date: { gte: monthStart } },
      include: { category: { select: { name: true } } },
    }),
    prisma.debt.findMany({ where: { userId } }),
  ]);

  let income = 0;
  let expense = 0;
  const expenseByCategory: Record<string, number> = {};
  for (const t of monthTx) {
    if (t.type === "INCOME") income += t.amount;
    else if (t.type === "EXPENSE") {
      expense += t.amount;
      const cat = t.category?.name ?? "未分類";
      expenseByCategory[cat] = (expenseByCategory[cat] ?? 0) + t.amount;
    }
  }
  const topExpenses =
    Object.entries(expenseByCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, amt]) => `${name} NT$${fmtTwd(amt)}`)
      .join("、") || "本月尚無支出記錄";

  const topDebts =
    debts
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
      .map((d) => `${d.category}${d.bankName ? `(${d.bankName})` : ""} NT$${fmtTwd(d.amount)}`)
      .join("、") || "無";

  const monthLabel = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  return `【使用者目前資產與收支資料，由系統自動帶入的真實數字，回答時可直接引用】
淨資產：NT$${fmtTwd(summary.netWorth)}
資產總計：NT$${fmtTwd(summary.positiveAssetsTotal)}（現金 NT$${fmtTwd(summary.cashBalance)}、銀行 NT$${fmtTwd(summary.bankTotal)}、股票 NT$${fmtTwd(summary.stockTotal)}、美股(折台幣) NT$${fmtTwd(summary.usstockTwdTotal)}、基金(折台幣) NT$${fmtTwd(summary.fundTwdTotal)}、外匯(折台幣) NT$${fmtTwd(summary.forexTwdTotal)}、虛擬貨幣 NT$${fmtTwd(summary.cryptoTotal)}、黃金 NT$${fmtTwd(summary.goldTotal)}、不動產 NT$${fmtTwd(summary.realestateTotal)}、保險 NT$${fmtTwd(summary.insuranceTotal)}）
負債總計：NT$${fmtTwd(summary.debtTotal)}（${topDebts}）
本月（${monthLabel}）收支：收入 NT$${fmtTwd(income)}、支出 NT$${fmtTwd(expense)}、結餘 NT$${fmtTwd(income - expense)}
本月支出前5大分類：${topExpenses}`;
}

const MAX_HISTORY_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 4000;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // base64 解碼後上限 4MB
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"]);

interface ChatImage {
  mimeType: string;
  data: string; // base64，不含 data: 前綴
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  image?: ChatImage;
}

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
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

  const contents = messages.slice(-MAX_HISTORY_MESSAGES).map((m) => {
    const parts: GeminiPart[] = [];
    const text = String(m.content ?? "").slice(0, MAX_MESSAGE_LENGTH);
    if (text) parts.push({ text });
    if (
      m.image &&
      ALLOWED_IMAGE_TYPES.has(m.image.mimeType) &&
      Buffer.byteLength(m.image.data, "base64") <= MAX_IMAGE_BYTES
    ) {
      parts.push({ inlineData: { mimeType: m.image.mimeType, data: m.image.data } });
    }
    if (parts.length === 0) parts.push({ text: "" });
    return { role: m.role === "assistant" ? "model" : "user", parts };
  });

  const userContext = await buildUserContext(session.user.id).catch((e) => {
    console.error("assistant user context failed:", e);
    return "";
  });
  const systemText = userContext ? `${SYSTEM_INSTRUCTION}\n\n${userContext}` : SYSTEM_INSTRUCTION;

  try {
    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemText }] },
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

    // 記一筆token用量供後台「TOKEN使用量」頁面彙總查詢，記錄失敗不影響本次回覆
    const usage = data?.usageMetadata;
    if (usage) {
      await prisma.tokenUsageLog
        .create({
          data: {
            userId: session.user.id,
            model: GEMINI_MODEL,
            promptTokens: usage.promptTokenCount ?? 0,
            completionTokens: usage.candidatesTokenCount ?? 0,
            totalTokens: usage.totalTokenCount ?? 0,
          },
        })
        .catch((e) => console.error("token usage log failed:", e));
    }

    return NextResponse.json({ reply });
  } catch (e) {
    console.error("Gemini fetch failed:", e);
    return NextResponse.json({ error: "連線 AI 服務失敗" }, { status: 502 });
  }
}
