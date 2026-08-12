import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex flex-col">
      {/* Navbar */}
      <nav className="px-8 py-5 flex items-center justify-between border-b border-slate-100 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">
            M
          </div>
          <span className="text-lg font-semibold text-slate-900">MoneyFlow</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm text-slate-600 hover:text-slate-900 font-medium transition-colors px-4 py-2"
          >
            登入
          </Link>
          <Link
            href="/register"
            className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors"
          >
            免費註冊
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 py-24 text-center">
        <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-6 border border-indigo-100">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
          簡單、智慧、美觀的記帳體驗
        </div>
        <h1 className="text-5xl font-bold text-slate-900 max-w-2xl leading-tight mb-6">
          掌握你的<span className="text-indigo-600">每一分錢</span>
        </h1>
        <p className="text-lg text-slate-500 max-w-xl mb-10 leading-relaxed">
          MoneyFlow 讓記帳變得輕鬆有趣。清晰的圖表、直覺的介面，幫助你建立健康的財務習慣。
        </p>
        <div className="flex items-center gap-4">
          <Link
            href="/register"
            className="bg-indigo-600 text-white px-8 py-3.5 rounded-xl font-semibold hover:bg-indigo-700 transition-all hover:shadow-lg hover:shadow-indigo-200 text-sm"
          >
            立即開始 — 免費
          </Link>
          <Link
            href="/login"
            className="text-slate-600 px-8 py-3.5 rounded-xl font-semibold border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all text-sm"
          >
            登入帳號
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-16 bg-white/60">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              icon: "📊",
              title: "視覺化報表",
              desc: "清晰的圖表讓你一眼看清收支狀況，每月花費一目了然。",
            },
            {
              icon: "🗂️",
              title: "智慧分類",
              desc: "預設多種分類，也可自訂專屬分類，讓帳目井然有序。",
            },
            {
              icon: "🔒",
              title: "安全可靠",
              desc: "資料加密儲存，你的財務資訊完全私密、安全有保障。",
            },
          ].map((f) => (
            <div key={f.title} className="p-6 rounded-2xl border border-slate-100 bg-white shadow-sm">
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="font-semibold text-slate-900 mb-2">{f.title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="text-center py-8 text-xs text-slate-400 border-t border-slate-100">
        © 2025 MoneyFlow. 版權所有。
      </footer>
    </main>
  );
}
