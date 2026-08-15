import { Router } from "express";
import rateLimit from "express-rate-limit";
import { sendMailLogged } from "../lib/mailer";

const router = Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "TOO_MANY_REQUESTS",
    message: "Zu viele Anfragen. Bitte versuchen Sie es sp\u00e4ter erneut.",
  },
});

function value(input: unknown, maxLength: number): string {
  return String(input ?? "").trim().slice(0, maxLength);
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

router.post("/", limiter, async (req, res) => {
  try {
    const company = value(req.body?.company, 160);
    const name = value(req.body?.name, 160);
    const email = value(req.body?.email, 200).toLowerCase();
    const phone = value(req.body?.phone, 80);
    const employees = value(req.body?.employees, 80);
    const interest = value(req.body?.interest, 200);
    const message = value(req.body?.message, 4000);
    const privacyAccepted = req.body?.privacyAccepted === true;
    const website = value(req.body?.website, 200); // Honeypot

    // Bots erhalten absichtlich eine neutrale Erfolgsantwort.
    if (website) {
      return res.json({ ok: true });
    }

    if (!name || !validEmail(email) || !privacyAccepted) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_FORM",
        message:
          "Bitte Name, g\u00fcltige E-Mail-Adresse und Datenschutz-Zustimmung pr\u00fcfen.",
      });
    }

    const subject = `Neue Demo-Anfrage ? ${company || name}`;

    const text = [
      "Neue Demo-Anfrage ?ber rlcbausoftware.com",
      "",
      `Firma: ${company || "?"}`,
      `Name: ${name}`,
      `E-Mail: ${email}`,
      `Telefon: ${phone || "?"}`,
      `Mitarbeiter: ${employees || "?"}`,
      `Interesse: ${interest || "?"}`,
      "",
      "Nachricht:",
      message || "?",
      "",
      `IP: ${req.ip || "?"}`,
      `Zeitpunkt: ${new Date().toISOString()}`,
    ].join("\n");

    const html = `
      <div style="font-family:Arial,sans-serif;color:#172033;line-height:1.6">
        <h2 style="color:#0f1f3d">Neue Demo-Anfrage</h2>

        <table style="border-collapse:collapse;width:100%;max-width:720px">
          <tr><td style="padding:8px;border-bottom:1px solid #ddd"><b>Firma</b></td><td style="padding:8px;border-bottom:1px solid #ddd">${escapeHtml(company || "?")}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #ddd"><b>Name</b></td><td style="padding:8px;border-bottom:1px solid #ddd">${escapeHtml(name)}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #ddd"><b>E-Mail</b></td><td style="padding:8px;border-bottom:1px solid #ddd">${escapeHtml(email)}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #ddd"><b>Telefon</b></td><td style="padding:8px;border-bottom:1px solid #ddd">${escapeHtml(phone || "?")}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #ddd"><b>Mitarbeiter</b></td><td style="padding:8px;border-bottom:1px solid #ddd">${escapeHtml(employees || "?")}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #ddd"><b>Interesse</b></td><td style="padding:8px;border-bottom:1px solid #ddd">${escapeHtml(interest || "?")}</td></tr>
        </table>

        <h3 style="margin-top:24px;color:#0f1f3d">Nachricht</h3>
        <div style="padding:16px;background:#f5f8fc;border-radius:12px;white-space:pre-wrap">${escapeHtml(message || "?")}</div>

        <p style="margin-top:22px;font-size:12px;color:#647087">
          Gesendet: ${escapeHtml(new Date().toLocaleString("de-DE"))}
        </p>
      </div>
    `;

    await sendMailLogged({
      to: "info@rlcbausoftware.com",
      replyTo: email,
      subject,
      text,
      html,
    });

    return res.json({
      ok: true,
      message: "Vielen Dank. Ihre Anfrage wurde erfolgreich gesendet.",
    });
  } catch (error: any) {
    console.error("[public-demo] send failed:", error?.message || error);

    return res.status(500).json({
      ok: false,
      error: "SEND_FAILED",
      message:
        "Die Anfrage konnte momentan nicht gesendet werden. Bitte versuchen Sie es sp\u00e4ter erneut.",
    });
  }
});

export default router;
