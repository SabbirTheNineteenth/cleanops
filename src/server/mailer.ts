export function appUrl(): string {
  const raw =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

export function mailerConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface MailResult {
  sent: boolean;
  via: "resend" | "log";
}

export async function sendMail(message: MailMessage): Promise<MailResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || "CleanOps <onboarding@resend.dev>";

  if (!key) {
    console.info(`[mail:log] to=${message.to} subject=${message.subject}\n${message.text}`);
    return { sent: false, via: "log" };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.error(`[mail] resend rejected the request (${res.status})`);
      return { sent: false, via: "log" };
    }
    return { sent: true, via: "resend" };
  } catch (err) {
    console.error("[mail] send failed:", err);
    return { sent: false, via: "log" };
  }
}

export function verificationLink(token: string): string {
  return `${appUrl()}/verify?token=${encodeURIComponent(token)}`;
}

export function verificationMail(name: string, link: string): Omit<MailMessage, "to"> {
  return {
    subject: "Verify your CleanOps email",
    text: [
      `Hi ${name},`,
      "",
      "Confirm this address so an administrator can approve your CleanOps account:",
      link,
      "",
      "The link expires in 24 hours. If you did not create this account you can ignore this email.",
      "",
      "— CleanOps Operations Console",
    ].join("\n"),
  };
}
