// apps/server/src/routes/inboxWorkflow.ts
// @ts-nocheck

import { Router } from "express";
import fs from "fs";
import path from "path";
import { PROJECTS_ROOT } from "../lib/projectsRoot";

const router = Router();

type WorkflowType =
  | "ANGEBOT"
  | "MENGENERMITTLUNG"
  | "ABSCHLAGSRECHNUNG"
  | "RECHNUNG"
  | "KALKULATION"
  | "OUTLIER_REPORT"
  | "ARBEITSZEIT";

type WorkflowStage = "inbox" | "approved";

const TYPE_ALIASES: Record<string, WorkflowType> = {
  ANGEBOT: "ANGEBOT",
  ANGEBOTE: "ANGEBOT",
  MENGEN: "MENGENERMITTLUNG",
  MENGENERMITTLUNG: "MENGENERMITTLUNG",
  ABSCHLAG: "ABSCHLAGSRECHNUNG",
  ABSCHLAGSRECHNUNG: "ABSCHLAGSRECHNUNG",
  ABSCHLAGSRECHNUNGEN: "ABSCHLAGSRECHNUNG",
  RECHNUNG: "RECHNUNG",
  RECHNUNGEN: "RECHNUNG",
  KALKULATION: "KALKULATION",
  OUTLIER: "OUTLIER_REPORT",
  OUTLIER_REPORT: "OUTLIER_REPORT",
  "OUTLIER-REPORT": "OUTLIER_REPORT",
  ARBEITSZEIT: "ARBEITSZEIT",
  ARBEITSZEITEN: "ARBEITSZEIT",
  ZEITERFASSUNG: "ARBEITSZEIT",
};


function firstText(...values: any[]) {
  for (const value of values) {
    const current = String(value ?? "").trim();
    if (current) return current;
  }
  return "";
}

function normalizeSubmittedBy(raw: any, req: any) {
  const source = raw?.submittedBy || raw?.sender || raw?.creator || {};
  const employee = raw?.employee || raw?.mitarbeiter || raw?.personal || {};
  const authUser = req?.user || req?.auth || {};

  const employeeId = firstText(
    source?.employeeId, source?.mitarbeiterId, employee?.id, employee?.employeeId,
    employee?.mitarbeiterId, raw?.employeeId, raw?.mitarbeiterId, raw?.personalId
  );
  const employeeName = firstText(
    source?.employeeName, source?.mitarbeiterName, employee?.name, employee?.fullName,
    employee?.displayName, raw?.employeeName, raw?.mitarbeiterName,
    typeof raw?.mitarbeiter === "string" ? raw.mitarbeiter : "",
    typeof raw?.employee === "string" ? raw.employee : ""
  );
  const userId = firstText(source?.userId, source?.id, raw?.userId, authUser?.id, authUser?.userId, authUser?.sub);
  const userName = firstText(source?.userName, source?.name, raw?.userName, authUser?.name, authUser?.displayName, authUser?.email);

  return {
    userId,
    userName,
    employeeId,
    employeeName,
    displayName: employeeName || userName || "Unbekannter Mitarbeiter",
  };
}

function safePart(value: any) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 160);
}

function normalizeType(value: any): WorkflowType | null {
  const key = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  return TYPE_ALIASES[key] || null;
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, "utf8");
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, value: any) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

function projectDir(projectKey: string) {
  return path.join(PROJECTS_ROOT, safePart(projectKey));
}

function workflowDir(projectKey: string, type: WorkflowType, stage: WorkflowStage) {
  return path.join(projectDir(projectKey), "mobile-workflow", type.toLowerCase(), stage);
}

function workflowDocFile(
  projectKey: string,
  type: WorkflowType,
  stage: WorkflowStage,
  id: string
) {
  return path.join(workflowDir(projectKey, type, stage), `${safePart(id)}.json`);
}

function listStage(projectKey: string, type: WorkflowType, stage: WorkflowStage) {
  const dir = workflowDir(projectKey, type, stage);
  ensureDir(dir);

  return fs
    .readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .map((name) => readJson<any>(path.join(dir, name), null))
    .filter(Boolean)
    .sort(
      (a, b) =>
        Number(b?.approvedAt || b?.submittedAt || b?.updatedAt || 0) -
        Number(a?.approvedAt || a?.submittedAt || a?.updatedAt || 0)
    );
}

function workflowLogFile(projectKey: string) {
  return path.join(projectDir(projectKey), "mobile-workflow", "workflow.json");
}

function appendWorkflowLog(projectKey: string, row: any) {
  const file = workflowLogFile(projectKey);
  const rows = readJson<any[]>(file, []);
  const next = [row, ...rows].slice(0, 5000);
  writeJson(file, next);
}

function num(value: any, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw.replace(/\s/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function upsertById(list: any[], document: any) {
  const id = String(document?.id || document?.docId || "").trim();
  const index = list.findIndex(
    (item) => String(item?.id || item?.docId || "").trim() === id
  );
  if (index < 0) return [document, ...list];
  const next = [...list];
  next[index] = { ...next[index], ...document };
  return next;
}

function writeOfficialList(file: string, document: any) {
  const list = readJson<any[]>(file, []);
  const next = upsertById(Array.isArray(list) ? list : [], document);
  writeJson(file, next);
  return next;
}

function finalizeAngebot(projectKey: string, document: any) {
  const file = path.join(
    projectDir(projectKey),
    "kalkulation",
    "angebot",
    "angebote.json"
  );
  const official = {
    ...document,
    id: String(document?.id || document?.docId),
    projectKey,
    projectCode: projectKey,
    status: "Freigegeben",
    workflowStatus: "FREIGEGEBEN",
    mobileApprovedAt: document?.approvedAt || Date.now(),
  };
  writeOfficialList(file, official);
  return { module: "KALKULATION_ANGEBOT", file };
}

function normalizeAufmassEntry(projectKey: string, doc: any, row: any, index: number) {
  const qty = num(row?.qty ?? row?.quantity ?? row?.menge, 0);
  const factor = num(row?.factor, 1) || 1;
  const sourceId = String(row?.id || `${doc.id}-${index + 1}`);
  const formula = String(row?.formula || qty || "0");
  return {
    id: `mobile_${safePart(doc.id)}_${safePart(sourceId)}`,
    label: String(doc?.title || `Mobile-Aufmaß ${index + 1}`),
    formula,
    menge: qty * factor,
    note: String(row?.note || `Mobile · ${doc?.datum || doc?.date || ""}`).trim(),
    factor,
    unit: String(row?.unit || row?.einheit || "m"),
    ep: num(row?.ep ?? row?.price ?? row?.einzelpreis, 0),
    createdAt: new Date(
      Number(doc?.approvedAt || doc?.updatedAt || doc?.createdAt || Date.now())
    ).toISOString(),
    sourceId,
    source: "mobile-mengenermittlung",
    kreis: num(row?.kreis, 1) || 1,
    blatt: num(row?.blatt, 1) || 1,
    nr: num(row?.nr, index + 1) || index + 1,
    reb: String(row?.reb || `000${String(index + 1).padStart(2, "0")}`),
    messzahl: num(row?.messzahl, 91) || 91,
  };
}

function finalizeMengenermittlung(projectKey: string, document: any) {
  const projectRoot = projectDir(projectKey);
  const mobileFile = path.join(
    projectRoot,
    "kalkulation",
    "mengen",
    "mengen.json"
  );
  const officialDoc = {
    ...document,
    id: String(document?.id || document?.docId),
    projectKey,
    projectCode: projectKey,
    workflowStatus: "FREIGEGEBEN",
    mobileApprovedAt: document?.approvedAt || Date.now(),
  };
  writeOfficialList(mobileFile, officialDoc);

  const aufmassFile = path.join(projectRoot, "aufmass.json");
  const existing = readJson<any[]>(aufmassFile, []);
  const rows = Array.isArray(existing) ? [...existing] : [];
  const mobileRows = Array.isArray(document?.rows) ? document.rows : [];

  mobileRows.forEach((mobileRow: any, index: number) => {
    const pos = String(
      mobileRow?.pos ?? mobileRow?.posNr ?? mobileRow?.positionsnummer ?? index + 1
    ).trim();
    if (!pos) return;

    const entry = normalizeAufmassEntry(projectKey, document, mobileRow, index);
    const rowIndex = rows.findIndex((row) => String(row?.pos || "").trim() === pos);
    const previous = rowIndex >= 0 ? rows[rowIndex] : null;
    const previousEntries = Array.isArray(previous?.entries) ? previous.entries : [];
    const withoutSameSource = previousEntries.filter(
      (item: any) => String(item?.sourceId || "") !== String(entry.sourceId)
    );
    const entries = [...withoutSameSource, entry];
    const ist = entries.reduce((sum: number, item: any) => sum + num(item?.menge, 0), 0);

    const nextRow = {
      ...(previous || {}),
      id: String(previous?.id || mobileRow?.id || `mobile-pos-${safePart(pos)}`),
      pos,
      text: String(
        mobileRow?.text || mobileRow?.beschreibung || previous?.text || "Mobile-Aufmaß"
      ),
      unit: String(mobileRow?.unit || mobileRow?.einheit || previous?.unit || "m"),
      soll: num(previous?.soll ?? mobileRow?.soll, 0),
      ist,
      ep: num(mobileRow?.ep ?? previous?.ep, 0),
      formula: entries.map((item: any) => String(item?.formula || "")).filter(Boolean).join("\n"),
      note: [previous?.note, `Mobile-Freigabe ${document?.id || ""}`]
        .filter(Boolean)
        .join(" | "),
      factor: 1,
      langtext: String(mobileRow?.langtext || previous?.langtext || ""),
      entries,
    };

    if (rowIndex >= 0) rows[rowIndex] = nextRow;
    else rows.unshift(nextRow);
  });

  writeJson(aufmassFile, rows);
  return { module: "AUFMASS_EDITOR", file: aufmassFile, importedRows: mobileRows.length };
}

function invoiceRows(document: any) {
  const rows = Array.isArray(document?.rows)
    ? document.rows
    : Array.isArray(document?.positions)
    ? document.positions
    : [];
  return rows.map((row: any, index: number) => {
    const qty = num(row?.qty ?? row?.quantity ?? row?.menge, 0);
    const ep = num(row?.ep ?? row?.price ?? row?.einzelpreis, 0);
    const factor = num(row?.factor, 1) || 1;
    return {
      ...row,
      id: String(row?.id || `${document?.id}-row-${index + 1}`),
      pos: String(row?.pos || row?.position || index + 1),
      text: String(row?.text || row?.beschreibung || row?.kurztext || ""),
      unit: String(row?.unit || row?.einheit || ""),
      qty,
      ep,
      factor,
      total: qty * ep * factor,
    };
  });
}

function finalizeRechnung(projectKey: string, document: any) {
  const file = path.join(
    projectDir(projectKey),
    "kalkulation",
    "rechnung",
    "rechnungen.json"
  );
  const positions = invoiceRows(document);
  const netto =
    num(document?.netto, 0) ||
    positions.reduce((sum: number, row: any) => sum + num(row?.total, 0), 0);
  const official = {
    ...document,
    id: String(document?.id || document?.docId),
    nr: String(document?.nr || document?.rechnungNr || ""),
    rechnungNr: String(document?.rechnungNr || document?.nr || ""),
    datum: String(document?.datum || document?.date || ""),
    kunde: String(document?.kunde || document?.customerName || ""),
    customerName: String(document?.customerName || document?.kunde || ""),
    netto,
    mwstPct: num(document?.mwstPct, 19),
    gezahlt: num(document?.gezahlt, 0),
    typ: document?.typ || "RECHNUNG",
    projectId: String(document?.projectId || projectKey),
    projectCode: projectKey,
    positions,
    rows: positions,
    workflowStatus: "FREIGEGEBEN",
    mobileApprovedAt: document?.approvedAt || Date.now(),
  };
  writeOfficialList(file, official);
  return { module: "BUCHHALTUNG_RECHNUNGEN", file };
}

function finalizeAbschlagsrechnung(projectKey: string, document: any) {
  const mwst = num(document?.mwst ?? document?.mwstPct, 19);
  const brutto = num(document?.brutto ?? document?.betrag, 0);
  const netto = num(document?.netto, 0) || (brutto ? brutto / (1 + mwst / 100) : 0);
  const rows = Array.isArray(document?.rows)
    ? document.rows.map((row: any) => ({
        lvPos: String(row?.lvPos || row?.pos || ""),
        kurztext: String(row?.kurztext || row?.text || ""),
        einheit: String(row?.einheit || row?.unit || ""),
        qty: num(row?.qty ?? row?.quantity, 0),
        ep: num(row?.ep, 0),
        total: num(row?.total, 0) || num(row?.qty, 0) * num(row?.ep, 0),
      }))
    : [];

  const official = {
    ...document,
    id: String(document?.id || document?.docId),
    projectId: String(document?.projectId || projectKey),
    projectCode: projectKey,
    nr: num(document?.nr ?? document?.nummer ?? document?.abschlagNr, 0),
    date: String(document?.date || document?.datum || ""),
    title: String(
      document?.title ||
        `Abschlagsrechnung ${document?.nummer || document?.abschlagNr || ""}`
    ).trim(),
    netto,
    mwst,
    brutto: brutto || netto * (1 + mwst / 100),
    status: "Freigegeben",
    rows,
    workflowStatus: "FREIGEGEBEN",
    mobileApprovedAt: document?.approvedAt || Date.now(),
  };

  const file = path.join(projectDir(projectKey), "abschlaege.json");
  writeOfficialList(file, official);

  const invoiceFile = path.join(
    projectDir(projectKey),
    "kalkulation",
    "rechnung",
    "rechnungen.json"
  );
  const invoices = readJson<any[]>(invoiceFile, []);
  const invoiceIndex = invoices.findIndex(
    (invoice: any) => String(invoice?.id || "") === String(document?.rechnungId || "")
  );
  if (invoiceIndex >= 0) {
    const previous = Array.isArray(invoices[invoiceIndex]?.abschlaege)
      ? invoices[invoiceIndex].abschlaege
      : [];
    invoices[invoiceIndex] = {
      ...invoices[invoiceIndex],
      abschlaege: upsertById(previous, {
        id: official.id,
        nummer: official.nr,
        datum: official.date,
        betrag: official.brutto,
        prozent: num(document?.prozent ?? document?.percent, 0),
        note: String(document?.note || ""),
        createdAt: Number(document?.createdAt || Date.now()),
      }),
    };
    writeJson(invoiceFile, invoices);
  }

  return { module: "BUCHHALTUNG_ABSCHLAGSRECHNUNGEN", file };
}

function finalizeKalkulation(projectKey: string, document: any) {
  const file = path.join(projectDir(projectKey), "kalkulation", "ki-kalkulation.json");
  writeJson(file, {
    ...document,
    projectKey,
    projectCode: projectKey,
    workflowStatus: "FREIGEGEBEN",
  });
  return { module: "KALKULATION_MIT_KI", file };
}

function finalizeOutlier(projectKey: string, document: any) {
  const file = path.join(projectDir(projectKey), "ki", "outlier-reports.json");
  writeOfficialList(file, {
    ...document,
    id: String(document?.id || document?.docId),
    projectKey,
    projectCode: projectKey,
    workflowStatus: "FREIGEGEBEN",
  });
  return { module: "KI_OUTLIER_REPORT", file };
}


function finalizeArbeitszeit(projectKey: string, document: any) {
  const file = path.join(projectDir(projectKey), "personal", "arbeitszeiten.json");
  const official = {
    ...document,
    id: String(document?.id || document?.docId),
    projectKey,
    projectCode: projectKey,
    employee: String(document?.employee || document?.mitarbeiter || ""),
    date: String(document?.date || document?.datum || ""),
    start: String(document?.start || document?.arbeitsbeginn || ""),
    end: String(document?.end || document?.arbeitsende || ""),
    breakMinutes: num(document?.breakMinutes ?? document?.pauseMinutes, 0),
    hours: num(document?.hours, 0),
    activity: String(document?.activity || document?.taetigkeit || ""),
    machines: String(document?.machines || document?.maschinen || ""),
    materials: String(document?.materials || document?.material || ""),
    workflowStatus: "FREIGEGEBEN",
    mobileApprovedAt: document?.approvedAt || Date.now(),
  };
  writeOfficialList(file, official);
  return { module: "PERSONAL_ARBEITSZEITEN", file };
}
function finalizeDocument(projectKey: string, type: WorkflowType, document: any) {
  if (type === "ANGEBOT") return finalizeAngebot(projectKey, document);
  if (type === "MENGENERMITTLUNG") {
    return finalizeMengenermittlung(projectKey, document);
  }
  if (type === "RECHNUNG") return finalizeRechnung(projectKey, document);
  if (type === "ABSCHLAGSRECHNUNG") {
    return finalizeAbschlagsrechnung(projectKey, document);
  }
  if (type === "KALKULATION") return finalizeKalkulation(projectKey, document);
  if (type === "ARBEITSZEIT") return finalizeArbeitszeit(projectKey, document);
  return finalizeOutlier(projectKey, document);
}

function resolveParams(req: any) {
  const projectKey = safePart(
    req.params?.projectKey || req.body?.projectKey || req.body?.projectCode
  );
  const type = normalizeType(req.params?.type || req.body?.type || req.body?.docType);
  return { projectKey, type };
}

router.get("/:projectKey/workflow", (req, res) => {
  const projectKey = safePart(req.params.projectKey);
  if (!projectKey) return res.status(400).json({ ok: false, error: "PROJECT_KEY_REQUIRED" });
  return res.json({
    ok: true,
    projectKey,
    rows: readJson<any[]>(workflowLogFile(projectKey), []),
  });
});

router.post("/:projectKey/:type/submit", (req, res, next) => {
  try {
    const { projectKey, type } = resolveParams(req);
    if (!type) return next();
    if (!projectKey) {
      return res.status(400).json({ ok: false, error: "PROJECT_KEY_REQUIRED" });
    }

    const raw = req.body?.doc ?? req.body?.data ?? req.body ?? {};
    const now = Date.now();
    const id = safePart(raw?.id || raw?.docId || `${type.toLowerCase()}_${now}`);
    if (!id) return res.status(400).json({ ok: false, error: "DOC_ID_REQUIRED" });

    const submittedBy = normalizeSubmittedBy(raw, req);
    const document = {
      ...raw,
      submittedBy,
      employeeId: raw?.employeeId || submittedBy.employeeId || undefined,
      employeeName: raw?.employeeName || submittedBy.employeeName || undefined,
      id,
      docId: id,
      type,
      docType: type,
      projectKey,
      projectCode: projectKey,
      workflowStatus: "EINGEREICHT",
      rejectionReason: null,
      submittedAt: Number(raw?.submittedAt || now),
      createdAt: raw?.createdAt || now,
      updatedAt: now,
      source: raw?.source || "RLC_MOBILE",
    };

    writeJson(workflowDocFile(projectKey, type, "inbox", id), document);
    appendWorkflowLog(projectKey, {
      projectKey,
      type,
      id,
      action: "submit",
      workflowStatus: "EINGEREICHT",
      submittedBy,
      updatedAt: now,
    });

    return res.json({ ok: true, projectKey, type, id, document });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: "MOBILE_WORKFLOW_SUBMIT_FAILED",
      message: String(error?.message || error),
    });
  }
});

router.get("/:projectKey/:type/approved", (req, res, next) => {
  const { projectKey, type } = resolveParams(req);
  if (!type) return next();
  if (!projectKey) return res.status(400).json({ ok: false, error: "PROJECT_KEY_REQUIRED" });
  const items = listStage(projectKey, type, "approved");
  return res.json({ ok: true, projectKey, type, items, count: items.length });
});

router.get("/:projectKey/:type/final", (req, res, next) => {
  const { projectKey, type } = resolveParams(req);
  if (!type) return next();
  if (!projectKey) return res.status(400).json({ ok: false, error: "PROJECT_KEY_REQUIRED" });
  const items = listStage(projectKey, type, "approved").filter(
    (item: any) => item?.finalizedAt || item?.finalTarget
  );
  return res.json({ ok: true, projectKey, type, items, count: items.length });
});

router.get("/:projectKey/:type/:stage/:id", (req, res, next) => {
  const { projectKey, type } = resolveParams(req);
  if (!type) return next();
  const stage = req.params.stage === "approved" ? "approved" : "inbox";
  const id = safePart(req.params.id);
  const document = readJson<any>(workflowDocFile(projectKey, type, stage, id), null);
  if (!document) return res.status(404).json({ ok: false, error: "DOC_NOT_FOUND" });
  return res.json({ ok: true, projectKey, type, stage, document });
});

router.get("/:projectKey/:type", (req, res, next) => {
  const { projectKey, type } = resolveParams(req);
  if (!type) return next();
  if (!projectKey) return res.status(400).json({ ok: false, error: "PROJECT_KEY_REQUIRED" });
  const items = listStage(projectKey, type, "inbox");
  return res.json({ ok: true, projectKey, type, items, count: items.length });
});

router.post("/:projectKey/:type/:id/approve", (req, res, next) => {
  try {
    const { projectKey, type } = resolveParams(req);
    if (!type) return next();
    const id = safePart(req.params.id || req.body?.id || req.body?.docId);
    if (!projectKey || !id) {
      return res.status(400).json({ ok: false, error: "PROJECT_KEY_AND_DOC_ID_REQUIRED" });
    }

    const inboxFile = workflowDocFile(projectKey, type, "inbox", id);
    const current = readJson<any>(inboxFile, null);
    if (!current) return res.status(404).json({ ok: false, error: "DOC_NOT_FOUND" });

    const now = Date.now();
    const approved = {
      ...current,
      workflowStatus: "FREIGEGEBEN",
      approvedAt: now,
      approvedBy: String(req.body?.approvedBy || "").trim() || null,
      rejectionReason: null,
      updatedAt: now,
    };

    const finalTarget = finalizeDocument(projectKey, type, approved);
    const completed = {
      ...approved,
      finalizedAt: now,
      finalTarget,
    };
    writeJson(workflowDocFile(projectKey, type, "approved", id), completed);
    fs.unlinkSync(inboxFile);

    appendWorkflowLog(projectKey, {
      projectKey,
      type,
      id,
      action: "approve",
      workflowStatus: "FREIGEGEBEN",
      finalTarget,
      updatedAt: now,
    });

    return res.json({ ok: true, projectKey, type, id, document: completed, finalTarget });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: "MOBILE_WORKFLOW_APPROVE_FAILED",
      message: String(error?.message || error),
    });
  }
});

router.post("/:projectKey/:type/:id/reject", (req, res, next) => {
  try {
    const { projectKey, type } = resolveParams(req);
    if (!type) return next();
    const id = safePart(req.params.id || req.body?.id || req.body?.docId);
    const file = workflowDocFile(projectKey, type, "inbox", id);
    const current = readJson<any>(file, null);
    if (!current) return res.status(404).json({ ok: false, error: "DOC_NOT_FOUND" });

    const now = Date.now();
    const rejected = {
      ...current,
      workflowStatus: "ABGELEHNT",
      rejectionReason: String(req.body?.reason || "Keine Angabe"),
      rejectedAt: now,
      updatedAt: now,
    };
    writeJson(file, rejected);
    appendWorkflowLog(projectKey, {
      projectKey,
      type,
      id,
      action: "reject",
      workflowStatus: "ABGELEHNT",
      reason: rejected.rejectionReason,
      updatedAt: now,
    });
    return res.json({ ok: true, projectKey, type, id, document: rejected });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: "MOBILE_WORKFLOW_REJECT_FAILED",
      message: String(error?.message || error),
    });
  }
});

export default router;
