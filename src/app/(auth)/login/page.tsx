"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [totpCode, setTotpCode] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const afterLogin = async () => {
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

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // 先只驗證帳密、確認是否需要輸入驗證碼，不建立 session
    const precheckRes = await fetch("/api/auth/precheck", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: form.email, password: form.password }),
    });
    const precheck = await precheckRes.json();

    if (!precheck.ok) {
      setLoading(false);
      setError("Email 或密碼錯誤，請重試。");
      return;
    }

    if (precheck.needsCode) {
      setLoading(false);
      setNeedsCode(true);
      return;
    }

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

    await afterLogin();
  };

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await signIn("credentials", {
      email: form.email,
      password: form.password,
      totpCode,
      redirect: false,
    });
    setLoading(false);

    if (res?.error) {
      setError("驗證碼不正確，請重試。");
      return;
    }

    await afterLogin();
  };

  if (needsCode) {
    return (
      <>
        <h2 className="text-2xl font-bold text-slate-900 mb-1">兩步驟驗證</h2>
        <p className="text-sm text-slate-500 mb-6">請輸入驗證器 App 上顯示的 6 位數驗證碼</p>

        {error && (
          <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg mb-4 border border-red-100">
            {error}
          </div>
        )}

        <form onSubmit={handleCodeSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">驗證碼</label>
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              required
              maxLength={6}
              placeholder="123456"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
              className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 transition-colors tracking-widest text-center text-lg"
            />
          </div>
          <button
            type="submit"
            disabled={loading || totpCode.length !== 6}
            className="w-full bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-2"
          >
            {loading ? "驗證中..." : "確認"}
          </button>
          <button
            type="button"
            onClick={() => { setNeedsCode(false); setTotpCode(""); setError(""); }}
            className="w-full text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            返回重新登入
          </button>
        </form>
      </>
    );
  }

  return (
    <>
      <h2 className="text-2xl font-bold text-slate-900 mb-1">歡迎回來</h2>
      <p className="text-sm text-slate-500 mb-6">登入你的帳號繼續使用</p>

      {error && (
        <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg mb-4 border border-red-100">
          {error}
        </div>
      )}

      <form onSubmit={handlePasswordSubmit} className="space-y-4">
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
