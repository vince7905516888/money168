"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface Me {
  id: string;
  name: string;
  email: string;
  role: string;
  twoFactorEnabled: boolean;
}

interface TwoFactorSetup {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
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

  const [twofaSetup, setTwofaSetup] = useState<TwoFactorSetup | null>(null);
  const [twofaCode, setTwofaCode] = useState("");
  const [twofaSaving, setTwofaSaving] = useState(false);
  const [twofaMsg, setTwofaMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [showDisableModal, setShowDisableModal] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableSaving, setDisableSaving] = useState(false);
  const [disableMsg, setDisableMsg] = useState("");

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

  const handleStart2FA = async () => {
    setTwofaMsg(null);
    setTwofaSaving(true);
    const res = await fetch("/api/me/2fa/setup", { method: "POST" });
    const data = await res.json();
    setTwofaSaving(false);
    if (res.ok) {
      setTwofaSetup(data);
      setTwofaCode("");
    } else {
      setTwofaMsg({ type: "err", text: data.error ?? "產生驗證碼設定失敗" });
    }
  };

  const handleConfirm2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setTwofaMsg(null);
    setTwofaSaving(true);
    const res = await fetch("/api/me/2fa/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: twofaCode }),
    });
    const data = await res.json();
    setTwofaSaving(false);
    if (res.ok) {
      setTwofaSetup(null);
      setTwofaCode("");
      setTwofaMsg({ type: "ok", text: "兩步驟驗證已啟用" });
      setMe((prev) => (prev ? { ...prev, twoFactorEnabled: true } : prev));
    } else {
      setTwofaMsg({ type: "err", text: data.error ?? "驗證失敗" });
    }
  };

  const handleCancel2FA = () => {
    setTwofaSetup(null);
    setTwofaCode("");
    setTwofaMsg(null);
  };

  const handleDisable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setDisableMsg("");
    setDisableSaving(true);
    const res = await fetch("/api/me/2fa/disable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: disablePassword }),
    });
    const data = await res.json();
    setDisableSaving(false);
    if (res.ok) {
      setShowDisableModal(false);
      setDisablePassword("");
      setMe((prev) => (prev ? { ...prev, twoFactorEnabled: false } : prev));
      setTwofaMsg({ type: "ok", text: "兩步驟驗證已停用" });
    } else {
      setDisableMsg(data.error ?? "停用失敗");
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

      {/* 兩步驟驗證 */}
      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm mb-6">
        <h2 className="font-semibold text-slate-900 mb-4">兩步驟驗證</h2>

        {!twofaSetup ? (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <span className={`w-2 h-2 rounded-full ${me?.twoFactorEnabled ? "bg-emerald-500" : "bg-slate-300"}`} />
                <span className="text-slate-600">
                  {me?.twoFactorEnabled ? "已啟用" : "尚未啟用"}
                </span>
              </div>
              {me?.twoFactorEnabled ? (
                <button
                  onClick={() => { setShowDisableModal(true); setDisableMsg(""); setDisablePassword(""); }}
                  className="px-4 py-2 rounded-lg text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  停用
                </button>
              ) : (
                <button
                  onClick={handleStart2FA}
                  disabled={twofaSaving}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-60"
                >
                  {twofaSaving ? "產生中..." : "啟用兩步驟驗證"}
                </button>
              )}
            </div>
            {twofaMsg && (
              <p className={`text-xs mt-3 ${twofaMsg.type === "ok" ? "text-emerald-600" : "text-red-500"}`}>
                {twofaMsg.text}
              </p>
            )}
          </>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              用驗證器 App（如 Google Authenticator）掃描下方 QR Code，或手動輸入密鑰，然後輸入 App 產生的 6 位數驗證碼完成綁定。
            </p>
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={twofaSetup.qrCodeDataUrl} alt="兩步驟驗證 QR Code" className="w-48 h-48 border border-slate-100 rounded-lg" />
            </div>
            <div className="bg-slate-50 rounded-lg px-3.5 py-2.5 text-xs text-slate-500 break-all">
              手動輸入密鑰：<span className="font-mono text-slate-700">{twofaSetup.secret}</span>
            </div>
            <form onSubmit={handleConfirm2FA} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">驗證碼</label>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  maxLength={6}
                  placeholder="123456"
                  value={twofaCode}
                  onChange={(e) => setTwofaCode(e.target.value.replace(/\D/g, ""))}
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm text-center tracking-widest focus:border-indigo-400 transition-colors"
                />
              </div>
              {twofaMsg && (
                <p className={`text-xs ${twofaMsg.type === "ok" ? "text-emerald-600" : "text-red-500"}`}>
                  {twofaMsg.text}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCancel2FA}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={twofaSaving || twofaCode.length !== 6}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-60"
                >
                  {twofaSaving ? "確認中..." : "確認綁定"}
                </button>
              </div>
            </form>
          </div>
        )}
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

      {/* 停用兩步驟驗證確認 */}
      {showDisableModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-1">停用兩步驟驗證</h2>
            <p className="text-sm text-slate-500 mb-5">請輸入目前密碼以確認停用</p>
            <form onSubmit={handleDisable2FA} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">目前密碼</label>
                <input
                  type="password"
                  required
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors"
                />
              </div>
              {disableMsg && <p className="text-xs text-red-500">{disableMsg}</p>}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowDisableModal(false)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={disableSaving}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-60"
                >
                  {disableSaving ? "處理中..." : "確認停用"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
