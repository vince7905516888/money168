import { prisma } from "@/lib/prisma";

// 全站共用一組 Resend 寄信設定，存在 MailSetting（後台「寄信設定」頁維護，見
// /admin/config/mail），沒設定 API Key 時视为寄信功能尚未啟用。
//
// 用 Resend 的 HTTPS API 而不是 SMTP：實測 Railway 對外網路把 SMTP 埠（25/465/587）
// 整個擋掉了，不管走 IPv4 還是 IPv6 都連不出去；HTTPS（443）完全暢通（app 本來就一直
// 靠 fetch 打 Kraken／Twelve Data／證交所這些 API），所以改用一般 HTTPS API 寄信才行得通。
export async function getMailSetting() {
  return prisma.mailSetting.findFirst();
}

export async function sendMail(
  to: string,
  subject: string,
  text: string
): Promise<{ ok: boolean; error?: string }> {
  const setting = await getMailSetting();
  if (!setting?.resendApiKey) {
    return { ok: false, error: "尚未在後台「寄信設定」設定 Resend API Key" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${setting.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: setting.fromEmail,
        to: [to],
        subject,
        text,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return { ok: false, error: body?.message || `Resend API 錯誤（HTTP ${res.status}）` };
    }
    return { ok: true };
  } catch (err) {
    console.error("[mailer] 寄信失敗:", err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
