import nodemailer from "nodemailer";
import dns from "node:dns";
import { prisma } from "@/lib/prisma";

// Railway 容器對外沒有 IPv6 路由，但 smtp.gmail.com 的 DNS 解析常常優先回傳 IPv6，
// 連線就會直接 ENETUNREACH；把預設解析順序改成 IPv4 優先，寄信才連得出去。
dns.setDefaultResultOrder("ipv4first");

// 全站共用一組 Gmail SMTP 寄件帳號，設定存在 MailSetting（後台「寄信設定」頁維護，見
// /admin/config/mail），沒設定或密碼是空字串時视为寄信功能尚未啟用。
export async function getMailSetting() {
  return prisma.mailSetting.findFirst();
}

export async function sendMail(
  to: string,
  subject: string,
  text: string
): Promise<{ ok: boolean; error?: string }> {
  const setting = await getMailSetting();
  if (!setting?.gmailUser || !setting?.gmailPass) {
    return { ok: false, error: "尚未在後台「寄信設定」設定 Gmail 帳號與應用程式密碼" };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      // @types/nodemailer 沒有宣告 family，但實際上會透傳給底層 socket 連線；
      // 用來再保險一層強制走 IPv4
      family: 4,
      auth: { user: setting.gmailUser, pass: setting.gmailPass },
    } as nodemailer.TransportOptions);
    await transporter.sendMail({
      from: `MoneyFlow <${setting.gmailUser}>`,
      to,
      subject,
      text,
    });
    return { ok: true };
  } catch (err) {
    console.error("[mailer] 寄信失敗:", err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
