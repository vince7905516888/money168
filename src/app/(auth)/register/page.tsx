"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirm) {
      setError("兩次輸入的密碼不一致。");
      return;
    }
    if (form.password.length < 6) {
      setError("密碼至少需要 6 個字元。");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.name, email: form.email, password: form.password }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "註冊失敗，請重試。");
      return;
    }

    router.push("/login?registered=1");
  };

  return (
    <>
      <h2 className="text-2xl font-bold text-slate-900 mb-1">建立帳號</h2>
      <p className="text-sm text-slate-500 mb-6">開始你的財務管理之旅</p>

      {error && (
        <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg mb-4 border border-red-100">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">姓名</label>
          <input
            type="text"
            required
            placeholder="你的名字"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 transition-colors"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
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
          <label className="block text-sm font-medium text-slate-700 mb-1.5">密碼</label>
          <input
            type="password"
            required
            placeholder="至少 6 個字元"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 transition-colors"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">確認密碼</label>
          <input
            type="password"
            required
            placeholder="再輸入一次密碼"
            value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })}
            className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 transition-colors"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-2"
        >
          {loading ? "建立中..." : "建立帳號"}
        </button>
      </form>

      <p className="text-center text-sm text-slate-500 mt-6">
        已有帳號？{" "}
        <Link href="/login" className="text-indigo-600 font-medium hover:underline">
          立即登入
        </Link>
      </p>
    </>
  );
}
