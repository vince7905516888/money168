import Link from "next/link";
import { auth } from "@/lib/auth";
import CourseContent from "./CourseContent";

// 未登入訪客：側邊欄照樣看得到「股市課程」這個欄目，點進來也看得到頁面骨架，
// 但實際課程內容鎖起來，提示需要進階會員才能瀏覽（見 market/stock-highlights/page.tsx
// 同樣的鎖定模式，那邊要求的是尊榮會員）。
export default async function StockCoursePage() {
  const session = await auth();

  if (!session) {
    return (
      <div className="max-w-4xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-900">股市課程</h1>
          <p className="text-slate-500 text-base mt-1.5">
            K線判讀、量價關係、型態學、波浪理論、均線與技術指標、基本面選股——完整技術分析課程講義
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center">
          <div className="text-4xl mb-3">🔒</div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">進階會員專屬功能</h2>
          <p className="text-slate-500 text-sm mb-6 max-w-sm mx-auto">
            此課程內容僅開放進階會員瀏覽，請登入或註冊帳號升級進階會員以解鎖完整內容。
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

  return <CourseContent />;
}
