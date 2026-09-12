import nodemailer from "nodemailer";

// Sends email via SMTP if configured (SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS
// env vars — a free Gmail "app password" works fine for a small shop). If
// those aren't set, this silently no-ops so the rest of the app keeps
// working without email set up — low-stock alerts and backups just won't
// be sent until you add the env vars. See .env.example.
function getTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  const port = Number(SMTP_PORT) || 587;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: { filename: string; content: string }[];
}): Promise<boolean> {
  const transport = getTransport();
  if (!transport) {
    console.warn(`Email not sent (SMTP not configured): "${opts.subject}" to ${opts.to}`);
    return false;
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER!;
  try {
    await transport.sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      attachments: opts.attachments,
    });
    return true;
  } catch (err) {
    console.error("Failed to send email:", err);
    return false;
  }
}
