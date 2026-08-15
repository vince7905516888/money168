"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await signIn("credentials", {
      email: form.email,
      password: form.password,
      redirect: false,
    });

    setLoading(false);

    if (res?.error) {
      setError("Email 或密碼錯誤，請重試。");
      return;
    }

    // 根據 role 導向
    const meRes = await fetch("/api/me");
    if (meRes.ok) {
      const me = await meRes.json();
      if (me.role === "ADMIN") {
        router.push("/admin/dashboard");
      } else {
        router.push("/transactions");
      }
    } else {
      router.push("/transactions");
    }
  };

  return (
    <>
      <h2 className="text-2xl font-bold text-slate-900 mb-1">歡迎回來</h2>
      <p className="text-sm text-slate-500 mb-6">登入你的帳號繼續使用</p>

      {error && (
        <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg mb-4 border border-red-100">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Email
          </label>
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 transition-colors"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            密碼
          </label>
          <input
            type="password"
            required
            placeholder="••••••••"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 transition-colors"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-2"
        >
          {loading ? "登入中..." : "登入"}
        </button>
      </form>

      <p className="text-center text-sm text-slate-500 mt-6">
        還沒有帳號？{" "}
        <Link href="/register" className="text-indigo-600 font-medium hover:underline">
          免費註冊
        </Link>
      </p>
    </>
  );
}
