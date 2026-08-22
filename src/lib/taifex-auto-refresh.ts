import { prisma } from "@/lib/prisma";
import { fetchFuturesPositions } from "@/lib/taifex";

// 只自動排程期貨未平倉這一項——跟之前導致開機當機的全市場排程（tw-stock-refresh-all.ts）
// 完全不同量級：這裡只是單一支小型外部API（期貨未平倉，約十幾筆資料），不會抓整個市場、
// 不會一次載入好幾份幾千筆的大檔案，開機後立即執行也不會造成記憶體尖峰。
// 之後每小時檢查一次「今天」的快照存在與否，不存在才抓一次。
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

function todayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function startFuturesAutoRefresh() {
  const tick = async () => {
    try {
      const today = todayDateStr();
      const existing = await prisma.futuresPositionSnapshot.findFirst({ where: { date: today } });
      if (existing) return;

      console.log("[futures-auto-refresh] 今天尚未抓過期貨未平倉資料，開始抓取...");
      const result = await fetchFuturesPositions();
      console.log("[futures-auto-refresh] 完成:", result ? `已存 ${result.positions.length} 筆` : "無資料");
    } catch (e) {
      console.error("[futures-auto-refresh] 執行失敗:", e);
    }
  };

  tick();
  setInterval(tick, CHECK_INTERVAL_MS);
}
