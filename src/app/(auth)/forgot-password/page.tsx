"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();

    setLoading(false);
    if (res.ok) {
      setDone(true);
    } else {
      setError(data.error ?? "發生錯誤，請稍後再試");
    }
  };

  if (done) {
    return (
      <>
        <h2 className="text-2xl font-bold text-slate-900 mb-1">請檢查你的信箱</h2>
        <p className="text-sm text-slate-500 mb-6">
          如果 <span className="text-slate-700">{email}</span> 是已註冊的帳號，重設密碼信件已經寄出，請於 1 小時內點擊信中連結完成重設。
        </p>
        <Link href="/login" className="text-indigo-600 font-medium text-sm hover:underline">
          返回登入
        </Link>
      </>
    );
  }

  return (
    <>
      <h2 className="text-2xl font-bold text-slate-900 mb-1">忘記密碼</h2>
      <p className="text-sm text-slate-500 mb-6">輸入你的 Email，我們會寄送重設密碼連結給你</p>

      {error && (
        <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg mb-4 border border-red-100">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 transition-colors"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-2"
        >
          {loading ? "寄送中..." : "寄送重設連結"}
        </button>
      </form>

      <p className="text-center text-sm text-slate-500 mt-6">
        想起密碼了？{" "}
        <Link href="/login" className="text-indigo-600 font-medium hover:underline">
          返回登入
        </Link>
      </p>
    </>
  );
}
