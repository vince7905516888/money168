"use client";

import { useState } from "react";
import Combobox from "./Combobox";

interface PickerWithAddProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder: string;
  addPlaceholder: string;
  addButtonLabel: string;
  onAdd: (name: string) => Promise<boolean>;
}

// Combobox 加上「找不到可以申請新增」的內嵌小表單，新增狀態封裝在元件自己裡面
// （不用像以前那樣在頁面上用 addBankTarget 這種欄位去追蹤是哪一個選單在新增）。
export default function PickerWithAdd({ value, onChange, options, placeholder, addPlaceholder, addButtonLabel, onAdd }: PickerWithAddProps) {
  const [adding, setAdding] = useState(false);
  const [addInput, setAddInput] = useState("");
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!addInput.trim()) return;
    setSaving(true);
    const ok = await onAdd(addInput.trim());
    setSaving(false);
    if (ok) {
      onChange(addInput.trim());
      setAddInput("");
      setAdding(false);
    }
  };

  return (
    <div>
      <Combobox value={value} onChange={onChange} options={options} placeholder={placeholder} />
      {adding ? (
        <div className="flex gap-2 mt-2">
          <input
            value={addInput}
            onChange={(e) => setAddInput(e.target.value)}
            placeholder={addPlaceholder}
            className="flex-1 border border-indigo-300 rounded-lg px-3 py-2 text-sm focus:border-indigo-400"
          />
          <button type="button" onClick={handleAdd} disabled={saving}
            className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60">
            {saving ? "..." : "新增"}
          </button>
          <button type="button" onClick={() => { setAdding(false); setAddInput(""); }}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-500 hover:bg-slate-50">取消</button>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)}
          className="mt-1.5 text-xs text-indigo-500 hover:text-indigo-700 hover:underline">
          {addButtonLabel}
        </button>
      )}
    </div>
  );
}
