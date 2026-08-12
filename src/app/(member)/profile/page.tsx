"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface Me {
  id: string;
  name: string;
  email: string;
  role: string;
}

export default function ProfilePage() {
  const { update } = useSession();
  const router = useRouter();

  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const [nickname, setNickname] = useState("");
  const [nicknameSaving, setNicknameSaving] = useState(false);
  const [nicknameMsg, setNicknameMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((res) => res.json())
      .then((data) => {
        if (data?.id) {
          setMe(data);
          setNickname(data.name);
        }
        setLoading(false);
      });
  }, []);

  const handleSaveNickname = async (e: React.FormEvent) => {
    e.preventDefault();
    setNicknameMsg(null);
    if (!nickname.trim()) {
      setNicknameMsg({ type: "err", text: "暱稱不可為空" });
      return;
    }
    setNicknameSaving(true);
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nickname.trim() }),
    });
    const data = await res.json();
    setNicknameSaving(false);
    if (res.ok) {
      setMe(data);
      setNicknameMsg({ type: "ok", text: "暱稱已更新" });
      await update({ name: data.name });
      router.refresh();
    } else {
      setNicknameMsg({ type: "err", text: data.error ?? "更新失敗" });
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    if (newPassword.length < 6) {
      setPwMsg({ type: "err", text: "新密碼至少需要 6 個字元" });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwMsg({ type: "err", text: "兩次輸入的新密碼不一致" });
      return;
    }
    setPwSaving(true);
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json();
    setPwSaving(false);
    if (res.ok) {
      setPwMsg({ type: "ok", text: "密碼已更新" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } else {
      setPwMsg({ type: "err", text: data.error ?? "更新失敗" });
    }
  };

  if (loading) {
    return <div className="max-w-2xl py-16 text-center text-slate-400 text-sm">載入中...</div>;
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">會員資料管理</h1>
        <p className="text-slate-500 text-sm mt-1">管理你的暱稱與密碼</p>
      </div>

      {/* 帳號資訊 */}
      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm mb-6">
        <h2 className="font-semibold text-slate-900 mb-4">帳號資訊</h2>
        <div className="text-sm text-slate-500">
          Email：<span className="text-slate-700">{me?.email}</span>
        </div>
      </div>

      {/* 暱稱 */}
      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm mb-6">
        <h2 className="font-semibold text-slate-900 mb-4">暱稱</h2>
        <form onSubmit={handleSaveNickname} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">顯示暱稱</label>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="你的暱稱"
              className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors"
            />
          </div>
          {nicknameMsg && (
            <p className={`text-xs ${nicknameMsg.type === "ok" ? "text-emerald-600" : "text-red-500"}`}>
              {nicknameMsg.text}
            </p>
          )}
          <button
            type="submit"
            disabled={nicknameSaving}
            className="px-4 py-2.5 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-60"
          >
            {nicknameSaving ? "儲存中..." : "儲存暱稱"}
          </button>
        </form>
      </div>

      {/* 修改密碼 */}
      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
        <h2 className="font-semibold text-slate-900 mb-4">修改密碼</h2>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">目前密碼</label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">新密碼</label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="至少 6 個字元"
              className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">確認新密碼</label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors"
            />
          </div>
          {pwMsg && (
            <p className={`text-xs ${pwMsg.type === "ok" ? "text-emerald-600" : "text-red-500"}`}>
              {pwMsg.text}
            </p>
          )}
          <button
            type="submit"
            disabled={pwSaving}
            className="px-4 py-2.5 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-60"
          >
            {pwSaving ? "儲存中..." : "更新密碼"}
          </button>
        </form>
      </div>
    </div>
  );
}
