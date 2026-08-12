"use client";

import { useEffect, useState, useCallback } from "react";

interface FeeSetting {
  id: string;
  key: string;
  label: string;
  rate: number;
  fixedAmount: number;
  note: string | null;
}

const EMPTY_FORM = { key: "", label: "", rate: "", fixedAmount: "", note: "" };

export default function FeeSettingsPage() {
  const [fees, setFees] = useState<FeeSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<FeeSetting | null>(null);
  const [editForm, setEditForm] = useState({ rate: "", fixedAmount: "", note: "" });
  const [saving, setSaving] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_FORM);
  const [addSaving, setAddSaving] = useState(false);

  const fetchFees = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/fee-settings");
    const data = await res.json();
    setFees(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchFees(); }, [fetchFees]);

  const openEdit = (fee: FeeSetting) => {
    setEditing(fee);
    setEditForm({
      rate: String(fee.rate),
      fixedAmount: String(fee.fixedAmount),
      note: fee.note ?? "",
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    await fetch("/api/admin/fee-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editing.id, ...editForm }),
    });
    setSaving(false);
    setEditing(null);
    fetchFees();
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddSaving(true);
    await fetch("/api/admin/fee-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(addForm),
    });
    setAddSaving(false);
    setShowAddModal(false);
    setAddForm(EMPTY_FORM);
    fetchFees();
  };

  const handleDelete = async (fee: FeeSetting) => {
    if (!confirm(`確定要刪除「${fee.label}」？`)) return;
    await fetch("/api/admin/fee-settings", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: fee.id }),
    });
    fetchFees();
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">手續費設定</h1>
          <p className="text-slate-400 text-sm mt-1">管理各類交易的手續費率與固定費用</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors"
        >
          + 新增費用項目
        </button>
      </div>

      {loading ? (
        <div className="text-slate-400 text-sm">載入中...</div>
      ) : (
        <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
          <div className="grid grid-cols-12 px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-700">
            <div className="col-span-4">費用項目</div>
            <div className="col-span-2 text-center">費率 (%)</div>
            <div className="col-span-2 text-center">固定費用</div>
            <div className="col-span-3">備註</div>
            <div className="col-span-1 text-right">操作</div>
          </div>

          {fees.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">目前沒有費用設定</div>
          ) : (
            <div className="divide-y divide-slate-700">
              {fees.map((fee) => (
                <div key={fee.id} className="grid grid-cols-12 items-center px-5 py-4 hover:bg-slate-700/50 transition-colors">
                  <div className="col-span-4">
                    <div className="text-sm font-medium text-white">{fee.label}</div>
                    <div className="text-xs text-slate-500 font-mono mt-0.5">{fee.key}</div>
                  </div>
                  <div className="col-span-2 text-center">
                    <span className={`text-sm font-semibold ${fee.rate > 0 ? "text-amber-400" : "text-slate-500"}`}>
                      {fee.rate > 0 ? `${fee.rate}%` : "—"}
                    </span>
                  </div>
                  <div className="col-span-2 text-center">
                    <span className={`text-sm font-semibold ${fee.fixedAmount > 0 ? "text-amber-400" : "text-slate-500"}`}>
                      {fee.fixedAmount > 0
                        ? new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(fee.fixedAmount)
                        : "—"}
                    </span>
                  </div>
                  <div className="col-span-3">
                    <span className="text-xs text-slate-400">{fee.note || "—"}</span>
                  </div>
                  <div className="col-span-1 flex justify-end gap-1">
                    <button
                      onClick={() => openEdit(fee)}
                      className="text-xs px-2 py-1 rounded-lg text-indigo-400 hover:bg-indigo-900/30 transition-colors"
                    >
                      編輯
                    </button>
                    <button
                      onClick={() => handleDelete(fee)}
                      className="text-xs px-2 py-1 rounded-lg text-red-400 hover:bg-red-900/30 transition-colors"
                    >
                      刪除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 說明 */}
      <div className="mt-4 bg-slate-800/50 rounded-xl px-5 py-4 border border-slate-700/50">
        <p className="text-xs text-slate-400">
          <span className="text-slate-300 font-medium">費率（%）</span>：按交易金額的百分比計算手續費。例如：0.1425% 代表每 100 萬交易收取 1,425 元。
        </p>
        <p className="text-xs text-slate-400 mt-1">
          <span className="text-slate-300 font-medium">固定費用</span>：每筆交易固定收取的金額，不依交易金額比例計算。
        </p>
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl shadow-xl w-full max-w-md p-6 border border-slate-700">
            <h2 className="text-lg font-bold text-white mb-1">編輯費用設定</h2>
            <p className="text-slate-400 text-sm mb-5">{editing.label}</p>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">費率 (%)</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={editForm.rate}
                  onChange={(e) => setEditForm({ ...editForm, rate: e.target.value })}
                  placeholder="例如：0.1425"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">固定費用（元）</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={editForm.fixedAmount}
                  onChange={(e) => setEditForm({ ...editForm, fixedAmount: e.target.value })}
                  placeholder="例如：30"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">備註（選填）</label>
                <input
                  value={editForm.note}
                  onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
                  placeholder="說明或備註..."
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500 transition-colors"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-slate-600 text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-60"
                >
                  {saving ? "儲存中..." : "儲存"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl shadow-xl w-full max-w-md p-6 border border-slate-700">
            <h2 className="text-lg font-bold text-white mb-5">新增費用項目</h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">項目名稱 <span className="text-red-400">*</span></label>
                <input
                  required
                  value={addForm.label}
                  onChange={(e) => setAddForm({ ...addForm, label: e.target.value })}
                  placeholder="例如：ETF 申購手續費"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">識別代碼 <span className="text-red-400">*</span></label>
                <input
                  required
                  value={addForm.key}
                  onChange={(e) => setAddForm({ ...addForm, key: e.target.value.toLowerCase().replace(/\s+/g, "_") })}
                  placeholder="例如：etf_commission（英文小寫，底線連接）"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 font-mono focus:border-indigo-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">費率 (%)</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={addForm.rate}
                  onChange={(e) => setAddForm({ ...addForm, rate: e.target.value })}
                  placeholder="0"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">固定費用（元）</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={addForm.fixedAmount}
                  onChange={(e) => setAddForm({ ...addForm, fixedAmount: e.target.value })}
                  placeholder="0"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">備註（選填）</label>
                <input
                  value={addForm.note}
                  onChange={(e) => setAddForm({ ...addForm, note: e.target.value })}
                  placeholder="說明或備註..."
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500 transition-colors"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowAddModal(false); setAddForm(EMPTY_FORM); }}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-slate-600 text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={addSaving}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-60"
                >
                  {addSaving ? "新增中..." : "新增"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
