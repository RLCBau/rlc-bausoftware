// apps/mobile/src/lib/mailComposer.ts
import * as MailComposer from "expo-mail-composer";

export async function sendMailWithAttachments(opts: {
  to?: string[];         // opzionale
  subject: string;
  body?: string;
  attachments: string[]; // local file URIs
}) {
  const isAvailable = await MailComposer.isAvailableAsync().catch(() => false);
  if (!isAvailable) {
    throw new Error("MailComposer nicht verfügbar (kein Mail-Account konfiguriert?).");
  }

  return MailComposer.composeAsync({
    recipients: opts.to?.filter(Boolean),
    subject: opts.subject,
    body: opts.body || "",
    attachments: opts.attachments.filter(Boolean),
  });
}
