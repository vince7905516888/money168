import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import dns from "node:dns";
import { prisma } from "@/lib/prisma";

// 全站共用一組 Gmail SMTP 寄件帳號，設定存在 MailSetting（後台「寄信設定」頁維護，見
// /admin/config/mail），沒設定或密碼是空字串時视为寄信功能尚未啟用。
export async function getMailSetting() {
  return prisma.mailSetting.findFirst();
}

// nodemailer 8.x 內部（lib/shared/index.js resolveHostname）會同時解析 smtp.gmail.com 的
// IPv4 與 IPv6 位址，合併後用 Math.random() 隨機挑一個來連線，完全不理會 family 選項，
// Node 的 dns.setDefaultResultOrder 也管不到它自己另外做的 DNS 查詢。Railway 容器對外沒有
// IPv6 路由，抽到 IPv6 就會 ENETUNREACH。解法是我們自己先把主機名稱解析成 IPv4 位址，
// 直接把 IP 當 host 傳給 nodemailer——host 本身已經是 IP 時，nodemailer 會跳過它自己的
// 解析邏輯直接連線；servername 另外明講，TLS 憑證驗證才會照 smtp.gmail.com 走，不會因為
// host 變成 IP 而失敗。每次寄信都重新解析一次，避免 Google 那端 IP 輪替造成位址過期。
async function resolveGmailSmtpIPv4(): Promise<string> {
  const addresses = await dns.promises.resolve4("smtp.gmail.com");
  if (!addresses.length) throw new Error("無法解析 smtp.gmail.com 的 IPv4 位址");
  return addresses[Math.floor(Math.random() * addresses.length)];
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
    const host = await resolveGmailSmtpIPv4();
    // @types/nodemailer 沒有宣告 servername，但 smtp-connection/index.js 實際上會讀
    // this.options.servername 當作 TLS SNI／憑證驗證用的名稱，這裡用交集型別補上
    const options: SMTPTransport.Options & { servername: string } = {
      host,
      servername: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: setting.gmailUser, pass: setting.gmailPass },
    };
    const transporter = nodemailer.createTransport(options);
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
