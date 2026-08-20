"use client";

import PickerWithAdd from "@/components/ui/PickerWithAdd";

export type PaymentMethod = "" | "現金" | "銀行" | "第三方支付";

interface TransferSideProps {
  label: string;
  type: PaymentMethod;
  detail: string;
  onTypeChange: (pm: PaymentMethod) => void;
  onDetailChange: (v: string) => void;
  bankOptions: string[];
  thirdPartyOptions: string[];
  onAddBank: (name: string) => Promise<boolean>;
  onAddThirdParty: (name: string) => Promise<boolean>;
}

// 調帳「從／至」其中一側的選擇器：現金／銀行／第三方支付。
// 定義在模組層級（不是塞在頁面元件裡面），元件的身份在每次重新渲染時保持穩定，
// 底下的輸入框才不會因為父層打字觸發 re-render 就被整個拆掉重新掛載、失去焦點。
export default function TransferSide({
  label, type, detail, onTypeChange, onDetailChange, bankOptions, thirdPartyOptions, onAddBank, onAddThirdParty,
}: TransferSideProps) {
  return (
    <div className="flex-1">
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{label}</label>
      <div className="flex gap-1.5 mb-2">
        {(["現金", "銀行", "第三方支付"] as PaymentMethod[]).map((pm) => (
          <button key={pm} type="button"
            onClick={() => { onTypeChange(pm); onDetailChange(""); }}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              type === pm ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}>
            {pm === "現金" ? "💵" : pm === "銀行" ? "🏦" : "📱"}
            <div className="text-[10px] mt-0.5">{pm === "第三方支付" ? "第三方" : pm}</div>
          </button>
        ))}
      </div>
      {type === "銀行" && (
        <PickerWithAdd
          value={detail}
          onChange={onDetailChange}
          options={bankOptions}
          placeholder="搜尋或輸入銀行名稱"
          addPlaceholder="輸入銀行名稱"
          addButtonLabel="+ 找不到？申請新增銀行"
          onAdd={onAddBank}
        />
      )}
      {type === "第三方支付" && (
        <PickerWithAdd
          value={detail}
          onChange={onDetailChange}
          options={thirdPartyOptions}
          placeholder="搜尋或輸入第三方名稱"
          addPlaceholder="輸入第三方名稱"
          addButtonLabel="+ 找不到？申請新增第三方"
          onAdd={onAddThirdParty}
        />
      )}
    </div>
  );
}
