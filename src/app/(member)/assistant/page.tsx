"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "什麼是本益比？",
  "定期定額適合什麼樣的投資人？",
  "ETF 跟基金差在哪裡？",
  "什麼情況適合用槓桿型ETF？",
];

export default function AssistantPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || loading) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
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
    <div className="max-w-3xl flex flex-col h-[75vh]">
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

        <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-slate-100 p-4 shrink-0">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="輸入投資相關問題..."
            className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:border-indigo-400 transition-colors"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            送出
          </button>
        </form>
      </div>
    </div>
  );
}
