import Link from "next/link";
import { auth } from "@/lib/auth";
import StockHighlightsContent from "./StockHighlightsContent";

// 未登入訪客：側邊欄照樣看得到「股市要點」這個欄目，點進來也看得到頁面骨架，
// 但實際內容（跑馬燈公告、每日影片重點）鎖起來，提示需要尊榮會員才能瀏覽，
// 藉此吸引訪客註冊/升級，而不是直接導去登入頁讓人摸不著頭緒。
export default async function StockHighlightsPage() {
  const session = await auth();

  if (!session) {
    return (
      <div className="max-w-4xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">股市要點</h1>
          <p className="text-slate-500 text-sm mt-1">每日市場公告與分析師影片重點整理</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center">
          <div className="text-4xl mb-3">🔒</div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">尊榮會員專屬功能</h2>
          <p className="text-slate-500 text-sm mb-6 max-w-sm mx-auto">
            此頁面的公告與每日影片重點僅開放尊榮會員瀏覽，請登入或註冊帳號升級尊榮會員以解鎖完整內容。
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link href="/login"
              className="px-5 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
              登入
            </Link>
            <Link href="/register"
              className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">
              立即註冊
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <StockHighlightsContent />;
}
