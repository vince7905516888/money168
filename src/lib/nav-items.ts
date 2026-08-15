export interface NavItem {
  key: string;
  label: string;
  href: string;
  section: string | null;
  order?: number;
}

export const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", label: "總覽", href: "/dashboard", section: null },
  { key: "transactions", label: "收支記錄", href: "/transactions", section: "現金系統" },
  { key: "banks", label: "銀行資金管理", href: "/banks", section: "現金系統" },
  { key: "reports", label: "報表分析", href: "/reports", section: null },
  { key: "investment.overview", label: "投資總攬", href: "/investment/overview", section: "投資" },
  { key: "investment.stock", label: "股票投資", href: "/investment/stock", section: "投資" },
  { key: "investment.fund", label: "基金投資", href: "/investment/fund", section: "投資" },
  { key: "investment.forex", label: "外匯投資", href: "/investment/forex", section: "投資" },
  { key: "investment.crypto", label: "虛擬貨幣", href: "/investment/crypto", section: "投資" },
  { key: "investment.gold", label: "黃金投資", href: "/investment/gold", section: "投資" },
  { key: "market.tw-stock", label: "台灣股市", href: "/market/tw-stock", section: "市場行情" },
  { key: "profile", label: "會員資料管理", href: "/profile", section: null },
];
