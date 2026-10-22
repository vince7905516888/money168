import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeUserAssetSummary, computeUserHoldingsDetail } from "@/lib/user-asset-summary";

// gemini-2.5-flash 對新用戶已經被下架（呼叫會直接404，官方訊息指名改用這個），
// 這裡固定用目前的正式版本，之後Google又下架的話要來這裡改。
const GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM_INSTRUCTION = `你是「MoneyFlow」記帳App裡的智能投資助理，用繁體中文回答，語氣專業但親切、簡潔。
你擅長回答投資相關知識問答：股票、ETF、基金、外匯、虛擬貨幣、貴金屬等名詞解釋、投資觀念、
一般市場常識。你沒有即時行情資料，如果使用者問「現在」「今天」的股價/匯率/金價這類即時數字，
不要憑空編造數字，提醒他們到App左側選單的「市場行情」查看即時K線圖。
系統會在這段指示最後附上【使用者目前資產與收支資料】與【目前持有商品明細】，是從使用者
自己在App裡記錄的收支、投資、負債資料即時計算出來的真實數字，包含具體持有哪些股票/基金/
幣種及其數量與成本，你可以依據這些數字做個人化分析，例如資產配置是否集中在少數標的、
本月支出是否偏高、淨資產趨勢等，主動點出數字背後的意義，不要只是覆誦清單。
但你仍然不是正式理財顧問，遇到「我該不該買/賣」這類需要承擔個人財務風險的具體決策問題，
提醒使用者自行判斷或諮詢專業意見，不要直接下判斷。使用者有時會上傳圖片（例如K線圖截圖、
報表截圖），你可以根據圖片內容回答，但一樣不構成個人化投資建議。`;

function fmtTwd(n: number): string {
  return Math.round(n).toLocaleString("zh-TW");
}

function fmtNum(n: number, digits = 2): string {
  return n.toLocaleString("zh-TW", { maximumFractionDigits: digits });
}

// 把一組持有明細整理成一行文字，依排序鍵由大到小取前 N 項，避免商品太多時把 prompt 撐爆
function formatHoldingsList<T>(items: T[], label: (item: T) => string, sortKey: (item: T) => number, limit = 10): string {
  if (items.length === 0) return "無";
  const sorted = [...items].sort((a, b) => sortKey(b) - sortKey(a));
  const shown = sorted.slice(0, limit).map(label).join("、");
  return sorted.length > limit ? `${shown}（等共${sorted.length}項，僅列出前${limit}大）` : shown;
}

// 幫智能助理組一段使用者自己的資產/負債/本月收支摘要，跟「資產總攬」頁面同一套算法
// （computeUserAssetSummary），數字才會跟使用者畫面上看到的一致。
async function buildUserContext(userId: string): Promise<string> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [summary, holdings, monthTx, debts] = await Promise.all([
    computeUserAssetSummary(userId),
    computeUserHoldingsDetail(userId),
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

  const stockList = formatHoldingsList(
    holdings.stock,
    (h) => `${h.name}(${h.code}) ${fmtNum(h.quantity, 0)}股 均價${fmtNum(h.avgPrice)} 成本NT$${fmtTwd(h.cost)}`,
    (h) => h.cost
  );
  const usstockList = formatHoldingsList(
    holdings.usstock,
    (h) => `${h.name}(${h.code}) ${fmtNum(h.quantity)}股 均價${fmtNum(h.avgPrice)}${h.currency} 成本${fmtNum(h.cost, 0)}${h.currency}`,
    (h) => h.cost
  );
  const fundList = formatHoldingsList(
    holdings.fund,
    (f) => `${f.name} ${fmtNum(f.amount, 0)}${f.currency}`,
    (f) => Math.abs(f.amount)
  );
  const forexList = formatHoldingsList(
    holdings.forex,
    (f) => `${f.currency} ${fmtNum(f.quantity)}`,
    (f) => Math.abs(f.quantity)
  );
  const cryptoList = formatHoldingsList(
    holdings.crypto,
    (c) => `${c.name}(${c.code}) ${fmtNum(c.quantity, 6)}顆 成本NT$${fmtTwd(c.cost)}`,
    (c) => c.cost
  );
  const goldList = formatHoldingsList(
    holdings.gold,
    (g) => `${g.name} ${fmtNum(g.quantity)}克 成本NT$${fmtTwd(g.cost)}`,
    (g) => g.cost
  );
  const realestateList = formatHoldingsList(
    holdings.realestate,
    (r) => `${r.name} NT$${fmtTwd(r.amount)}`,
    (r) => r.amount
  );
  const insuranceList = formatHoldingsList(
    holdings.insurance,
    (i) => `${i.name} NT$${fmtTwd(i.amount)}`,
    (i) => i.amount
  );

  return `【使用者目前資產與收支資料，由系統自動帶入的真實數字，回答時可直接引用】
淨資產：NT$${fmtTwd(summary.netWorth)}
資產總計：NT$${fmtTwd(summary.positiveAssetsTotal)}（現金 NT$${fmtTwd(summary.cashBalance)}、銀行 NT$${fmtTwd(summary.bankTotal)}、股票 NT$${fmtTwd(summary.stockTotal)}、美股(折台幣) NT$${fmtTwd(summary.usstockTwdTotal)}、基金(折台幣) NT$${fmtTwd(summary.fundTwdTotal)}、外匯(折台幣) NT$${fmtTwd(summary.forexTwdTotal)}、虛擬貨幣 NT$${fmtTwd(summary.cryptoTotal)}、黃金 NT$${fmtTwd(summary.goldTotal)}、不動產 NT$${fmtTwd(summary.realestateTotal)}、保險 NT$${fmtTwd(summary.insuranceTotal)}）
負債總計：NT$${fmtTwd(summary.debtTotal)}（${topDebts}）
本月（${monthLabel}）收支：收入 NT$${fmtTwd(income)}、支出 NT$${fmtTwd(expense)}、結餘 NT$${fmtTwd(income - expense)}
本月支出前5大分類：${topExpenses}

【目前持有商品明細】
股票：${stockList}
美股：${usstockList}
基金：${fundList}
外匯餘額：${forexList}
虛擬貨幣：${cryptoList}
黃金：${goldList}
不動產：${realestateList}
保險：${insuranceList}`;
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
  const conversationId: string | undefined = typeof body?.conversationId === "string" ? body.conversationId : undefined;
  const content: string = typeof body?.content === "string" ? body.content : "";
  const image: ChatImage | undefined =
    body?.image && ALLOWED_IMAGE_TYPES.has(body.image.mimeType) && typeof body.image.data === "string"
      ? { mimeType: body.image.mimeType, data: body.image.data }
      : undefined;

  if (!conversationId) return NextResponse.json({ error: "缺少對話ID" }, { status: 400 });
  if (!content.trim() && !image) return NextResponse.json({ error: "請輸入訊息" }, { status: 400 });

  const conversation = await prisma.assistantConversation.findFirst({
    where: { id: conversationId, userId: session.user.id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!conversation) return NextResponse.json({ error: "找不到對話" }, { status: 404 });

  const history: ChatMessage[] = conversation.messages.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
    image: m.imageMimeType && m.imageData ? { mimeType: m.imageMimeType, data: m.imageData } : undefined,
  }));
  const newMessage: ChatMessage = { role: "user", content: content.trim(), image };
  const messages: ChatMessage[] = [...history, newMessage];

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

    // 對話記錄：使用者這輪的訊息跟AI回覆一起存，第一則訊息順便把對話標題改成內容摘要
    const isFirstMessage = conversation.messages.length === 0;
    const title = isFirstMessage ? (content.trim() ? content.trim().slice(0, 24) : "圖片提問") : conversation.title;
    await prisma.$transaction([
      prisma.assistantMessage.create({
        data: { conversationId, role: "user", content: content.trim(), imageMimeType: image?.mimeType, imageData: image?.data },
      }),
      prisma.assistantMessage.create({
        data: { conversationId, role: "assistant", content: reply },
      }),
      prisma.assistantConversation.update({ where: { id: conversationId }, data: { title } }),
    ]);

    return NextResponse.json({ reply, title });
  } catch (e) {
    console.error("Gemini fetch failed:", e);
    return NextResponse.json({ error: "連線 AI 服務失敗" }, { status: 502 });
  }
}
