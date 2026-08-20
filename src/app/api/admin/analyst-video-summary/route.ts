import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// 與 /api/assistant/chat 共用同一個正式版本，Google 下架舊版時要一併來這裡改。
const GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM_INSTRUCTION = `你是投資分析助理，會收到一段 YouTube 影片（通常是財經/股市分析師的節目）。
請用繁體中文整理影片重點，輸出格式固定如下：

【重點摘要】
（3-6 條重點，簡潔條列）

【提到的股票／標的】
（列出提到的股票代碼或名稱，以及影片中對它的看法；沒有提到就寫「無」）

【操作建議】
（影片中提到的買賣/操作建議，原文轉述即可；沒有明確建議就寫「影片未提出具體操作建議」）

最後加一行：「以上為影片內容摘要，僅供參考，不構成投資建議。」`;

const YOUTUBE_URL_PATTERN = /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)/i;

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "無權限" }, { status: 403 });
  }

  const items = await prisma.analystVideoSummary.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "無權限" }, { status: 403 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "尚未設定 GEMINI_API_KEY" }, { status: 500 });

  const { url } = await req.json().catch(() => ({}));
  if (!url || !YOUTUBE_URL_PATTERN.test(url)) {
    return NextResponse.json({ error: "請貼上有效的 YouTube 影片網址" }, { status: 400 });
  }

  try {
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [{
        role: "user",
        parts: [
          { fileData: { fileUri: url } },
          { text: "請依照系統指示整理這部影片的重點。" },
        ],
      }],
    });

    // Gemini 在模型忙碌時會回 503「currently experiencing high demand」，屬於暫時性狀況，
    // 影片摘要（fileData 讀取 YouTube 影片）比純文字請求更吃資源，忙碌時比一般對話更容易碰到，
    // 所以重試次數與總等待時間都拉長一點，提高在忙碌高峰期間仍能成功的機會。
    let res: Response;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any;
    const delaysMs = [2000, 4000, 8000, 15000, 20000];
    const maxAttempts = delaysMs.length + 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      data = await res.json();

      const isOverloaded = res.status === 503 || /overload|high demand/i.test(data?.error?.message ?? "");
      if (res.ok || !isOverloaded || attempt === maxAttempts) break;
      await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt - 1]));
    }

    if (!res!.ok) {
      console.error("Gemini video summary error:", data);
      const message: string = data?.error?.message || "AI 服務目前無法回應";
      const friendly = /prepayment|billing|credit/i.test(message)
        ? "Gemini API 帳號額度不足，請到 Google AI Studio 設定計費後再試"
        : /overload|high demand/i.test(message)
        ? "Gemini 模型目前處於高峰忙碌狀態，已自動重試多次仍失敗（這是 Google 那邊的暫時性問題，不是本站故障），建議過幾分鐘後再試一次"
        : message;
      return NextResponse.json({ error: friendly }, { status: 502 });
    }

    const parts: { text?: string }[] = data?.candidates?.[0]?.content?.parts ?? [];
    const summary = parts.map((p) => p.text ?? "").join("");
    if (!summary) {
      return NextResponse.json({ error: "AI 沒有回應內容，請確認影片是公開可觀看的，再試一次" }, { status: 502 });
    }

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

    const saved = await prisma.analystVideoSummary.create({
      data: { url, summary },
    });

    return NextResponse.json(saved, { status: 201 });
  } catch (e) {
    console.error("Gemini video summary fetch failed:", e);
    return NextResponse.json({ error: "連線 AI 服務失敗" }, { status: 502 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "無權限" }, { status: 403 });
  }

  const { id } = await req.json();
  await prisma.analystVideoSummary.delete({ where: { id } });
  return NextResponse.json({ message: "已刪除" });
}
