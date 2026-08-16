"use client";

// 未登入訪客現在也能瀏覽大部分頁面（空白範例畫面），但實際的新增/編輯/刪除等寫入操作
// 一律需要登入。這個 fetch 包裝專門給「寫入」呼叫（POST/PUT/PATCH/DELETE）用：
// 後端本來就會回 401，這裡收到 401 就直接導去登入頁，不用在每個頁面各自判斷 session 狀態。
// 讀取用的 GET 呼叫不用換成這個——現有頁面對非陣列回應已經有 Array.isArray 防呆，
// 未登入時 API 回 401 物件，會自然降級成空清單/空狀態，不需要特別處理。
export async function authFetch(input: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.href = "/login";
  }
  return res;
}
