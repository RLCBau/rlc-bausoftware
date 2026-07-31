// apps/server/src/lib/mailer.ts
import nodemailer, { Transporter } from "nodemailer";

function env(name: string) {
  return String(process.env[name] || "").trim();
}

const DISABLE_EMAIL = env("DISABLE_EMAIL") === "1";

// NOTA: non usare must() qui, altrimenti crasha il server all'import
const SMTP_HOST = env("SMTP_HOST");
const SMTP_PORT = Number(env("SMTP_PORT") || "587");
const SMTP_USER = env("SMTP_USER");
const SMTP_PASS = env("SMTP_PASS");

// Se 465 => secure true. Se 587 => secure false (STARTTLS)
const secure = SMTP_PORT === 465;

export const MAIL_FROM =
  env("MAIL_FROM") || env("SMTP_FROM") || SMTP_USER || '"RLC Bausoftware" <noreply@rlc.local>';

let _transporter: Transporter | null = null;

export function getTransporter(): Transporter {
  if (_transporter) return _transporter;

  if (DISABLE_EMAIL) {
    // dummy transporter che non invia; i caller gestiscono DISABLE_EMAIL prima
    _transporter = nodemailer.createTransport({ jsonTransport: true });
    return _transporter;
  }

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    // niente crash: lasciamo che i caller decidano cosa fare
    throw new Error(
      `SMTP not configured (need SMTP_HOST/SMTP_USER/SMTP_PASS). host=${!!SMTP_HOST} user=${!!SMTP_USER} pass=${!!SMTP_PASS}`
    );
  }

  _transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    tls: { minVersion: "TLSv1.2" },
  });

  return _transporter;
}

export async function verifyMailerOnce() {
  if (DISABLE_EMAIL) {
    console.log("[mailer] DISABLE_EMAIL=1 -> verify skipped");
    return;
  }
  const t = getTransporter();
  await t.verify();
  console.log("[mailer] SMTP verify OK", { host: SMTP_HOST, port: SMTP_PORT, secure });
}

export async function sendMailLogged(opts: {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}) {
  if (DISABLE_EMAIL) {
    console.log("[mailer] DISABLE_EMAIL=1 -> send skipped", {
      to: opts.to,
      subject: opts.subject,
    });
    return {
      messageId: "skipped",
      accepted: [opts.to],
      rejected: [],
      response: "DISABLE_EMAIL=1",
    } as any;
  }

  const t = getTransporter();
  const info = await t.sendMail({
    from: MAIL_FROM,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });

  console.log("[mailer] sendMail OK", {
    messageId: info.messageId,
    accepted: info.accepted,
    rejected: info.rejected,
    response: info.response,
  });

  return info;
}
