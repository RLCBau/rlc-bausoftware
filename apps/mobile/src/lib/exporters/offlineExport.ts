// apps/mobile/src/lib/exporters/offlineExport.ts
import * as Print from "expo-print";
import { moveExportFile, writeExportTextFile, type ExportKind } from "../exportStorage";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function safe(s: any) {
  return String(s ?? "").trim();
}

/**
 * Minimal HTML template (placeholder).
 * Quando mi mandi i PDF generator del server, lo facciamo 1:1.
 */
function buildHtml(kind: ExportKind, ctx: any) {
  const title = kind.toUpperCase();
  const project = safe(ctx?.projectTitle || ctx?.title || ctx?.projectCode || ctx?.projectId);

  const rows = Object.entries(ctx || {})
    .filter(([k]) => !["photos", "attachments", "files"].includes(k))
    .slice(0, 40)
    .map(([k, v]) => `<tr><td style="padding:6px;border:1px solid #ddd;"><b>${k}</b></td><td style="padding:6px;border:1px solid #ddd;">${safe(v)}</td></tr>`)
    .join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
body { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Arial; padding: 18px; }
h1 { margin: 0 0 6px 0; font-size: 18px; }
h2 { margin: 0 0 14px 0; font-size: 12px; color: #555; font-weight: 600; }
table { border-collapse: collapse; width: 100%; font-size: 12px; }
</style>
</head>
<body>
  <h1>${title}</h1>
  <h2>${project}</h2>
  <table>${rows}</table>
  <p style="margin-top:14px;font-size:11px;color:#666">Offline Export • ${safe(ctx?.createdAt || "")}</p>
</body>
</html>`;
}

function buildCsv(kind: ExportKind, ctx: any) {
  // CSV semplice: key;value (compatibile Excel DE con ;)
  const lines: string[] = [];
  lines.push("key;value");
  const flat = ctx || {};
  for (const k of Object.keys(flat)) {
    const v = flat[k];
    if (typeof v === "object") continue;
    lines.push(`${String(k).replace(/;/g, ",")};${String(v ?? "").replace(/;/g, ",")}`);
  }
  return lines.join("\n");
}

export async function exportOfflineDoc(opts: {
  projectFsKey: string;   // BA-... or local-...
  kind: ExportKind;       // regie | lieferschein | photos
  doc: any;               // record offline
  projectTitle?: string;
  wantCsv?: boolean;
}): Promise<{ pdf: { uri: string; name: string }; csv?: { uri: string; name: string } }> {
  const now = new Date();
  const date = ymd(now);

  const idPart = safe(opts.doc?.id || opts.doc?.docId || "").slice(0, 18);
  const baseName = `${opts.kind}_${safe(opts.projectFsKey)}_${date}${idPart ? "_" + idPart : ""}`;

  const html = buildHtml(opts.kind, {
    ...opts.doc,
    projectTitle: opts.projectTitle,
    projectCode: opts.projectFsKey,
    createdAt: opts.doc?.createdAt || now.toISOString(),
  });

  // 1) PDF (temp)
  const printed = await Print.printToFileAsync({
    html,
    base64: false,
  });

  const pdfName = `${baseName}.pdf`;
  const pdf = await moveExportFile({
    projectFsKey: opts.projectFsKey,
    kind: opts.kind,
    filename: pdfName,
    fromUri: printed.uri,
  });

  // 2) CSV (optional)
  let csv: { uri: string; name: string } | undefined;
  if (opts.wantCsv) {
    const csvText = buildCsv(opts.kind, opts.doc);
    const csvName = `${baseName}.csv`;
    csv = await writeExportTextFile({
      projectFsKey: opts.projectFsKey,
      kind: opts.kind,
      filename: csvName,
      content: csvText,
    });
  }

  return { pdf, csv };
}
