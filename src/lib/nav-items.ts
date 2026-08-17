export interface NavItem {
  key: string;
  label: string;
  href: string;
  section: string | null;
  order?: number;
}

export const NAV_ITEMS: NavItem[] = [
  { key: "transactions", label: "收支記錄", href: "/transactions", section: "現金系統" },
  { key: "banks", label: "銀行資金管理", href: "/banks", section: "現金系統" },
  { key: "reports", label: "報表分析", href: "/reports", section: null },
  { key: "debts", label: "負債表", href: "/debts", section: null },
  { key: "investment.overview", label: "資產總攬", href: "/investment/overview", section: null },
  { key: "investment.stock", label: "股票投資", href: "/investment/stock", section: "投資" },
  { key: "investment.fund", label: "基金投資", href: "/investment/fund", section: "投資" },
  { key: "investment.forex", label: "外匯投資", href: "/investment/forex", section: "投資" },
  { key: "investment.crypto", label: "虛擬貨幣", href: "/investment/crypto", section: "投資" },
  { key: "investment.gold", label: "黃金投資", href: "/investment/gold", section: "投資" },
  { key: "investment.realestate", label: "不動產投資", href: "/investment/realestate", section: "投資" },
  { key: "investment.insurance", label: "保險投資", href: "/investment/insurance", section: "投資" },
  { key: "market.tw-stock", label: "台灣股市", href: "/market/tw-stock", section: "市場行情" },
  { key: "market.strategy", label: "投資策略", href: "/market/strategy", section: "市場行情" },
  { key: "market.crypto", label: "虛擬貨幣", href: "/market/crypto", section: "市場行情" },
  { key: "profile", label: "會員資料管理", href: "/profile", section: null },
];

// 功能權限：不是獨立頁面、而是某個頁面內的子功能，一樣可以在後台會員等級設定裡依會員等級開關。
export interface FeatureItem {
  key: string;
  label: string;
}

export const FEATURE_ITEMS: FeatureItem[] = [
  { key: "feature.tw-stock-watchlist", label: "股票觀察名單" },
];
