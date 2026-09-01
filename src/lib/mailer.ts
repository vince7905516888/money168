import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";

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
      service: "gmail",
      auth: { user: setting.gmailUser, pass: setting.gmailPass },
    });
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
