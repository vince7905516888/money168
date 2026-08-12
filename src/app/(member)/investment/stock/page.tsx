import InvestmentTypeList from "../_components/InvestmentTypeList";

export default function StockPage() {
  return (
    <InvestmentTypeList
      type="STOCK"
      title="股票投資"
      description="管理你的股票投資記錄"
    />
  );
}
