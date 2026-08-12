export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-600 text-white text-xl font-bold mb-3">
            M
          </div>
          <h1 className="text-xl font-bold text-slate-900">MoneyFlow</h1>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
