"use client";

import { useState, useRef, useEffect } from "react";

interface ChatImage {
  mimeType: string;
  data: string; // base64，不含 data: 前綴
  dataUrl: string; // 完整 data URL，用於畫面顯示
}

interface Message {
  role: "user" | "assistant";
  content: string;
  image?: ChatImage;
}

const SUGGESTIONS = [
  "什麼是本益比？",
  "定期定額適合什麼樣的投資人？",
  "ETF 跟基金差在哪裡？",
  "什麼情況適合用槓桿型ETF？",
];

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"];

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function AssistantPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pendingImage, setPendingImage] = useState<ChatImage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setError("只支援 PNG / JPEG / WEBP / HEIC 格式的圖片");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("圖片大小不能超過 4MB");
      return;
    }
    const dataUrl = await fileToDataUrl(file);
    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    setPendingImage({ mimeType: file.type, data: base64, dataUrl });
  };

  const send = async (text: string) => {
    const content = text.trim();
    if ((!content && !pendingImage) || loading) return;
    const userMessage: Message = { role: "user", content, image: pendingImage ?? undefined };
    const next = [...messages, userMessage];
    setMessages(next);
    setInput("");
    setPendingImage(null);
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map((m) => ({
            role: m.role,
            content: m.content,
            image: m.image ? { mimeType: m.image.mimeType, data: m.image.data } : undefined,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "回應失敗");
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "回應失敗");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send(input);
  };

  return (
    <div className="w-full max-w-7xl flex flex-col h-[75vh]">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">智能助理</h1>
        <p className="text-slate-500 text-sm mt-1">投資相關知識問答，AI 回覆僅供參考，不構成個人化投資建議</p>
      </div>

      <div className="flex-1 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4">
              <div className="text-4xl">🤖</div>
              <p className="text-slate-400 text-sm">你可以問我投資相關的問題，例如：</p>
              <div className="flex flex-wrap justify-center gap-2 max-w-md">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="text-xs px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                    m.role === "user" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-800"
                  }`}
                >
                  {m.image && (
                    <img
                      src={m.image.dataUrl}
                      alt="上傳的圖片"
                      className="max-w-full max-h-64 rounded-lg mb-2 object-contain"
                    />
                  )}
                  {m.content}
                </div>
              </div>
            ))
          )}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-slate-100 text-slate-400 rounded-2xl px-4 py-2.5 text-sm">思考中...</div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {error && <div className="px-5 py-2 text-xs text-red-500 border-t border-red-50 bg-red-50">{error}</div>}

        {pendingImage && (
          <div className="px-4 pt-3 border-t border-slate-100 shrink-0">
            <div className="relative inline-block">
              <img src={pendingImage.dataUrl} alt="預覽圖片" className="h-20 rounded-lg border border-slate-200 object-cover" />
              <button
                type="button"
                onClick={() => setPendingImage(null)}
                title="移除圖片"
                className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-slate-700 text-white text-xs leading-5 text-center hover:bg-slate-900"
              >
                ×
              </button>
            </div>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className={`flex items-center gap-2 p-4 shrink-0 ${pendingImage ? "" : "border-t border-slate-100"}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            title="上傳圖片"
            className="shrink-0 w-10 h-10 flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors disabled:opacity-50"
          >
            📷
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="輸入投資相關問題..."
            className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:border-indigo-400 transition-colors"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || (!input.trim() && !pendingImage)}
            className="bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            送出
          </button>
        </form>
      </div>
    </div>
  );
}
