// apps/mobile/src/lib/exporters/regiePdf.ts

/**
 * ✅ Facade / Re-export stabile
 * - InboxScreen / RegieScreen importano da qui
 * - Implementazioni reali in ./projectExport
 *
 * ✅ FIX:
 * - projectExport ritorna { pdfUri, fileName, date }
 * - Manteniamo backward-compat: aggiungiamo "attachments: [pdfUri]" nei wrapper
 * - Ignoriamo wantCsv (non supportato qui)
 *
 * ✅ NEW (docType):
 * - Se row contiene docType (REGIE / TAGESBERICHT / BAUTAGEBUCH),
 *   usiamo subject/body coerenti.
 */

import {
  exportRegiePdfToProject,
  exportPhotosPdfToProject,
  exportLieferscheinPdfToProject,
  emailPdf,
} from "./projectExport";

export {
  exportRegiePdfToProject,
  exportPhotosPdfToProject,
  exportLieferscheinPdfToProject,
  emailPdf,
};

type CreateRegiePdfInput = {
  projectFsKey: string; // BA-... o local-...
  projectTitle?: string;
  filenameHint?: string;
  row: any;

  // legacy (ignorato)
  wantCsv?: boolean;

  // email (opzionale)
  sendEmail?: boolean;
  emailTo?: string[];
  emailCc?: string[];
  emailBcc?: string[];
  emailBody?: string;
};

type ExportCompat = {
  pdfUri: string;
  fileName: string;
  date: string;
  attachments: string[]; // ✅ compat: sempre [pdfUri]
};

type RegieDocType = "REGIE" | "TAGESBERICHT" | "BAUTAGEBUCH";

function normDocType(v: any): RegieDocType {
  const s = String(v || "").trim().toUpperCase();
  if (s === "TAGESBERICHT") return "TAGESBERICHT";
  if (s === "BAUTAGEBUCH") return "BAUTAGEBUCH";
  return "REGIE";
}

function labelDocType(t: RegieDocType) {
  if (t === "TAGESBERICHT") return "Tagesbericht";
  if (t === "BAUTAGEBUCH") return "Bautagebuch";
  return "Regiebericht";
}

function extractDocTypeFromRow(row: any): RegieDocType {
  // row è spesso: { kind, payload: { docType, row: {...} } }
  const dt =
    row?.payload?.docType ??
    row?.payload?.row?.docType ??
    row?.docType ??
    row?.row?.docType ??
    undefined;

  return normDocType(dt);
}

export async function createRegiePdf(
  input: Omit<CreateRegiePdfInput, "sendEmail">
): Promise<ExportCompat> {
  if (!input?.projectFsKey) throw new Error("projectFsKey fehlt");
  if (!input?.row) throw new Error("Regie row fehlt");

  const docType = extractDocTypeFromRow(input.row);

  const res = await exportRegiePdfToProject({
    projectFsKey: input.projectFsKey,
    projectTitle: input.projectTitle,
    // ✅ se non arriva filenameHint, almeno mettiamo un default coerente
    filenameHint:
      input.filenameHint ||
      `${labelDocType(docType)}_${input.projectFsKey}`,
    row: input.row,
  });

  return { ...res, attachments: [res.pdfUri] };
}

/**
 * PDF + apertura Mail-App
 */
export async function createAndEmailRegiePdf(
  input: CreateRegiePdfInput
): Promise<ExportCompat> {
  if (!input?.projectFsKey) throw new Error("projectFsKey fehlt");
  if (!input?.row) throw new Error("Regie row fehlt");

  const docType = extractDocTypeFromRow(input.row);
  const docLabel = labelDocType(docType);

  const res = await exportRegiePdfToProject({
    projectFsKey: input.projectFsKey,
    projectTitle: input.projectTitle,
    filenameHint:
      input.filenameHint ||
      `${docLabel}_${input.projectFsKey}`,
    row: input.row,
  });

  const out: ExportCompat = { ...res, attachments: [res.pdfUri] };

  if (!input.sendEmail) return out;

  const attachments = out.attachments.filter(
    (u) => typeof u === "string" && u.startsWith("file://")
  );
  if (!attachments.length) throw new Error("Kein gültiger PDF-Anhang (file://)");

  await emailPdf({
    subject:
      input.filenameHint ||
      out.fileName ||
      `${docLabel} ${input.projectFsKey}`,
    body:
      input.emailBody ||
      `Im Anhang finden Sie den ${docLabel} als PDF.\nProjekt: ${input.projectFsKey}\nDatum: ${out.date || ""}`.trim(),
    attachments,
    to: input.emailTo,
    cc: input.emailCc,
    bcc: input.emailBcc,
  });

  return out;
}
