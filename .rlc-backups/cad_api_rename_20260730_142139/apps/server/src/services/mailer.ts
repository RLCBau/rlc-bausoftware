// apps/server/src/services/mailer.ts
import type { SentMessageInfo } from "nodemailer";
import { sendMailLogged } from "../lib/mailer";

type MailAttachment = { filename: string; path: string };

export type MailResult =
  | {
      ok: true;
      skipped?: true;
      messageId?: string;
      accepted?: any;
      rejected?: any;
      response?: string;
    }
  | { ok: false; error: string };

function env(name: string) {
  return String(process.env[name] || "").trim();
}

function isDev() {
  return (process.env.NODE_ENV || "").toLowerCase() !== "production";
}

function disabled() {
  return env("DISABLE_EMAIL") === "1";
}

/**
 * ✅ Single source of truth:
 * - Invio reale delegato a lib/mailer.ts (transport + logging)
 * - Qui solo wrapper + tipo risultato
 */
export async function verifyMailerOnce() {
  // opzionale: se vuoi, puoi chiamare verifyMailerOnce del lib
  // ma non è obbligatorio; teniamo "no-crash"
  if (disabled()) {
    console.log("[MAIL] DISABLE_EMAIL=1 -> verify skipped");
    return;
  }
  try {
    // import lazy per evitare circular/edge cases
    const { verifyMailerOnce: verifyCore } = await import("../lib/mailer");
    await verifyCore();
  } catch (e: any) {
    console.error("[MAIL] verify FAILED:", String(e?.message || e));
    throw e;
  }
}

export async function sendMangelMail(opts: {
  to: string;
  subject: string;
  html: string;
  attachments?: MailAttachment[];
}): Promise<MailResult> {
  if (disabled()) {
    console.log("[MAIL] disabled -> skip", {
      to: opts.to,
      subject: opts.subject,
      hasAttachments: !!opts.attachments?.length,
    });
    return { ok: true, skipped: true };
  }

  try {
    // lib/mailer.ts già logga accepted/rejected/response
    const info: SentMessageInfo = await sendMailLogged({
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      // text opzionale: puoi aggiungerlo se vuoi
    });

    // In DEV ritorniamo più info utili anche al chiamante
    if (isDev()) {
      return {
        ok: true,
        messageId: (info as any)?.messageId,
        accepted: (info as any)?.accepted,
        rejected: (info as any)?.rejected,
        response: (info as any)?.response,
      };
    }

    return { ok: true, messageId: (info as any)?.messageId };
  } catch (e: any) {
    const msg = String(e?.message || e || "MAIL_SEND_FAILED");
    console.error("[MAIL] send FAILED:", msg);
    return { ok: false, error: msg };
  }
}

