// apps/server/src/routes/inboxWorkflow.ts
// @ts-nocheck

import { Router } from "express";
import fs from "fs";
import path from "path";
import { PROJECTS_ROOT } from "../lib/projectsRoot";
import { COMPANIES_ROOT } from "../lib/companiesRoot";
import { recordProjectSubmission } from "../lib/projectSubmission";
import { archiveProjectFileVersion, archiveProjectBufferVersion } from "../services/dmsArchive";
import { buildDeliveryPackage } from "../services/documentDeliveryService";
import { requireProjectMember } from "../middleware/guards";
import { prisma } from "../lib/prisma";

const router = Router();

router.use("/:projectKey", requireProjectMember("projectKey"), async (req:any, _res, next) => {
  const projectId=String(req.resolvedProjectId||"").trim();
  const projectCode=String(req.resolvedProjectCode||"").trim();
  if(!projectId) return next(new Error("RESOLVED_PROJECT_ID_MISSING"));
  if(projectCode && projectCode!==projectId){
    try{
      const duplicates=await prisma.project.count({where:{code:projectCode}});
      if(duplicates===1){
        const legacyRoot=path.join(PROJECTS_ROOT,projectCode);
        const canonicalRoot=path.join(PROJECTS_ROOT,projectId);
        for(const parts of [
          ["mobile-workflow"],
          ["privacy","employee-gps"],
          ["arbeitszeiten"],
          ["abschlaege.json"],
          ["kalkulation","ki-kalkulation.json"],
          ["ki","outlier-reports.json"],
        ]){
          const src=path.join(legacyRoot,...parts), dst=path.join(canonicalRoot,...parts);
          if(!fs.existsSync(src)||fs.existsSync(dst)) continue;
          fs.mkdirSync(path.dirname(dst),{recursive:true});
          if(fs.statSync(src).isDirectory()) fs.cpSync(src,dst,{recursive:true}); else fs.copyFileSync(src,dst);
        }
      }
    }catch(e){console.error("[inboxWorkflow] legacy tenant migration failed",e);}
  }
  req.params.projectKey=projectId;
  next();
});

type WorkflowType =
  | "ANGEBOT"
  | "MENGENERMITTLUNG"
  | "ABSCHLAGSRECHNUNG"
  | "RECHNUNG"
  | "KALKULATION"
  | "OUTLIER_REPORT"
  | "ARBEITSZEIT"
  | "BAUTAGEBUCH";

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
  BAUTAGEBUCH: "BAUTAGEBUCH",
  BAUTAGEBUECHER: "BAUTAGEBUCH",
};

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

function readEmployeeGpsPolicy(companyId: any) {
  const cid = safePart(companyId);
  if (!cid) return { employeeGpsEnabled: false, employeeGpsPurpose: "", employeeGpsLegalBasis: "", employeeGpsRetentionDays: 0 };
  const file = path.join(COMPANIES_ROOT, cid, "privacy-profile.json");
  const raw = readJson<any>(file, {});
  return {
    employeeGpsEnabled: raw?.employeeGpsEnabled === true,
    employeeGpsPurpose: String(raw?.employeeGpsPurpose || "").trim(),
    employeeGpsLegalBasis: String(raw?.employeeGpsLegalBasis || "").trim(),
    employeeGpsRetentionDays: Math.max(0, Math.min(365, Number(raw?.employeeGpsRetentionDays || 0))),
  };
}

function hasEmployeeGps(value: any): boolean {
  if (!value || typeof value !== "object") return false;
  if (value?.gps && typeof value.gps === "object") {
    const lat = Number(value.gps.latitude ?? value.gps.lat);
    const lng = Number(value.gps.longitude ?? value.gps.lng ?? value.gps.lon);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return true;
  }
  const lat = Number(value?.latitude ?? value?.lat);
  const lng = Number(value?.longitude ?? value?.lng ?? value?.lon);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return true;
  if (Array.isArray(value)) return value.some(hasEmployeeGps);
  return Object.values(value).some((entry) => entry && typeof entry === "object" && hasEmployeeGps(entry));
}

function gpsEvidence(value: any): any[] {
  const out: any[] = [];
  const events = Array.isArray(value?.events) ? value.events : Array.isArray(value?.timeEvents) ? value.timeEvents : [];
  for (const event of events) {
    const lat = Number(event?.gps?.latitude ?? event?.gps?.lat ?? event?.latitude ?? event?.lat);
    const lng = Number(event?.gps?.longitude ?? event?.gps?.lng ?? event?.gps?.lon ?? event?.longitude ?? event?.lng ?? event?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out.push({
      type: String(event?.type || event?.eventType || "").trim(),
      timestamp: event?.timestamp || event?.time || null,
      latitude: lat,
      longitude: lng,
      accuracy: event?.gps?.accuracy ?? event?.accuracy ?? null,
    });
  }
  return out;
}

function stripGpsFromWorktime(document: any) {
  const clone = JSON.parse(JSON.stringify(document || {}));
  const scrub = (entry: any) => {
    if (!entry || typeof entry !== "object") return;
    delete entry.gps;
    delete entry.latitude; delete entry.longitude; delete entry.lat; delete entry.lng; delete entry.lon; delete entry.accuracy;
  };
  scrub(clone);
  for (const key of ["events", "timeEvents"]) {
    if (Array.isArray(clone[key])) clone[key].forEach(scrub);
  }
  clone.employeeGpsSeparated = true;
  return clone;
}

function employeeGpsDir(projectKey: string) {
  return path.join(projectDir(projectKey), "privacy", "employee-gps");
}

function cleanupExpiredEmployeeGps(projectKey: string) {
  const dir = employeeGpsDir(projectKey);
  if (!fs.existsSync(dir)) return;
  const now = Date.now();
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    const file = path.join(dir, name);
    const row = readJson<any>(file, null);
    const expires = Date.parse(String(row?.expiresAt || ""));
    if (Number.isFinite(expires) && expires <= now) {
      try { fs.unlinkSync(file); } catch {}
    }
  }
}

function storeEmployeeGpsEvidence(projectKey: string, id: string, current: any, policy: any, actor: string, now: number) {
  cleanupExpiredEmployeeGps(projectKey);
  const evidence = gpsEvidence(current);
  if (!evidence.length) return null;
  const days = Math.max(1, Number(policy.employeeGpsRetentionDays || 0));
  const expiresAt = new Date(now + days * 86400000).toISOString();
  const file = path.join(employeeGpsDir(projectKey), `${safePart(id)}.json`);
  writeJson(file, {
    schema: "RLC-EMPLOYEE-GPS-EVIDENCE-1.0",
    projectKey,
    documentId: id,
    employee: workEmployeeKey(current),
    purpose: policy.employeeGpsPurpose,
    legalBasis: policy.employeeGpsLegalBasis,
    retentionDays: days,
    createdAt: new Date(now).toISOString(),
    expiresAt,
    separatedBy: actor || null,
    evidence,
  });
  return { count: evidence.length, expiresAt, purpose: policy.employeeGpsPurpose, legalBasis: policy.employeeGpsLegalBasis };
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

function parseWorkDate(value: any): Date | null {
  const raw = String(value || "").trim();
  let m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
  m = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 0, 0, 0, 0);
  return null;
}

function parseClockMinutes(value: any): number | null {
  const raw = String(value || "").trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function workEmployeeKey(document: any): string {
  return String(
    document?.employeeId ||
    document?.employeeName ||
    document?.mitarbeiterName ||
    document?.mitarbeiter ||
    document?.employee ||
    document?.submittedBy?.employeeId ||
    document?.submittedBy?.employeeName ||
    ""
  ).trim().toLocaleLowerCase("de-DE");
}

function addYears(date: Date, years: number): Date {
  const next = new Date(date.getTime());
  next.setFullYear(next.getFullYear() + years);
  return next;
}

function endOfCalendarYearPlusYears(value: any, years: number): string {
  const parsed = parseWorkDate(value) || new Date();
  return new Date(Date.UTC(parsed.getFullYear() + years, 11, 31, 23, 59, 59, 999)).toISOString();
}

function workflowRetentionMeta(type: WorkflowType, document: any): Record<string, any> {
  if (type === "RECHNUNG" || type === "ABSCHLAGSRECHNUNG") {
    return {
      retentionLocked: true,
      retentionUntil: endOfCalendarYearPlusYears(document?.date || document?.datum, 8),
      retentionReason: "§ 14b UStG / § 147 AO / § 257 HGB – Rechnungs-/Buchungsbeleg 8 Jahre",
      retentionCategory: "TAX_INVOICE_8Y",
    };
  }
  if (type === "ARBEITSZEIT") {
    return {
      retentionLocked: true,
      retentionUntil: document?.compliance?.retentionUntil || document?.retentionUntil || addYears(new Date(), 2).toISOString(),
      retentionReason: "MiLoG § 17 – Arbeitszeitaufzeichnungen mindestens 2 Jahre",
      retentionCategory: "WORKTIME_2Y",
    };
  }
  return {};
}

function validateArbeitszeitForApproval(projectKey: string, document: any, approvedAt: number) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const date = parseWorkDate(document?.date || document?.datum);
  const start = parseClockMinutes(document?.start || document?.arbeitsbeginn);
  const end = parseClockMinutes(document?.end || document?.arbeitsende);
  const breakMinutes = Math.max(0, num(document?.breakMinutes ?? document?.pauseMinutes, 0));

  if (!date) errors.push("Arbeitsdatum fehlt oder ist ungültig.");
  if (start === null) errors.push("Arbeitsbeginn fehlt oder ist ungültig.");
  if (end === null) errors.push("Arbeitsende fehlt oder ist ungültig.");

  let grossMinutes = 0;
  let netMinutes = 0;
  if (start !== null && end !== null) {
    grossMinutes = end - start;
    if (grossMinutes < 0) grossMinutes += 24 * 60;
    if (grossMinutes <= 0 || grossMinutes > 24 * 60) errors.push("Arbeitszeitspanne ist ungültig.");
    netMinutes = Math.max(0, grossMinutes - breakMinutes);

    if (netMinutes > 6 * 60 && netMinutes <= 9 * 60 && breakMinutes < 30) {
      errors.push("ArbZG § 4: Bei mehr als 6 bis 9 Stunden sind mindestens 30 Minuten Pause erforderlich.");
    }
    if (netMinutes > 9 * 60 && breakMinutes < 45) {
      errors.push("ArbZG § 4: Bei mehr als 9 Stunden sind mindestens 45 Minuten Pause erforderlich.");
    }

    if (netMinutes > 10 * 60) {
      const exceptionBasis = String(document?.arbzgExceptionBasis || document?.arbeitszeitExceptionBasis || "").trim();
      if (!exceptionBasis) {
        errors.push("ArbZG § 3: Mehr als 10 Stunden tägliche Arbeitszeit erfordern eine dokumentierte gesetzliche/tarifliche Ausnahmegrundlage.");
      } else {
        warnings.push(`Arbeitszeit > 10 h – Ausnahmegrundlage dokumentiert: ${exceptionBasis}`);
      }
    }

    const reportedHours = num(document?.hours ?? document?.netHours ?? document?.nettoHours, NaN);
    if (Number.isFinite(reportedHours)) {
      const calculatedHours = netMinutes / 60;
      if (Math.abs(reportedHours - calculatedHours) > 0.15) {
        errors.push(`Gemeldete Nettoarbeitszeit (${reportedHours.toFixed(2)} h) stimmt nicht mit Beginn/Ende/Pause (${calculatedHours.toFixed(2)} h) überein.`);
      }
    }
  }

  const employeeKey = workEmployeeKey(document);
  if (!employeeKey) errors.push("Mitarbeiter ist nicht eindeutig angegeben.");

  if (date && start !== null && employeeKey) {
    const officialFile = path.join(projectDir(projectKey), "arbeitszeiten", "arbeitszeiten.json");
    const previousRows = readJson<any[]>(officialFile, []);
    let previous: { date: Date; end: number; raw: any } | null = null;
    for (const row of Array.isArray(previousRows) ? previousRows : []) {
      if (workEmployeeKey(row) !== employeeKey) continue;
      const rowDate = parseWorkDate(row?.date || row?.datum);
      const rowEnd = parseClockMinutes(row?.end || row?.arbeitsende);
      if (!rowDate || rowEnd === null || rowDate >= date) continue;
      if (!previous || rowDate > previous.date) previous = { date: rowDate, end: rowEnd, raw: row };
    }
    if (previous) {
      const prevEnd = new Date(previous.date.getTime());
      prevEnd.setMinutes(previous.end);
      const currentStart = new Date(date.getTime());
      currentStart.setMinutes(start);
      const restHours = (currentStart.getTime() - prevEnd.getTime()) / 3600000;
      if (restHours < 11) {
        const exceptionBasis = String(document?.ruhezeitExceptionBasis || "").trim();
        if (!exceptionBasis) {
          errors.push(`ArbZG § 5: Ruhezeit zur vorherigen Schicht beträgt nur ${restHours.toFixed(2)} h; grundsätzlich sind 11 h erforderlich.`);
        } else {
          warnings.push(`Ruhezeit < 11 h – Ausnahmegrundlage dokumentiert: ${exceptionBasis}`);
        }
      }
    }
  }

  let lateRecording = false;
  if (date) {
    const submittedAt = Number(document?.submittedAt || document?.createdAt || approvedAt);
    const deadline = new Date(date.getTime());
    deadline.setDate(deadline.getDate() + 7);
    deadline.setHours(23, 59, 59, 999);
    if (submittedAt > deadline.getTime()) {
      lateRecording = true;
      warnings.push("MiLoG § 17: Arbeitszeit wurde später als bis zum Ablauf des 7. Folgetages aufgezeichnet/eingereicht.");
    }
  }

  const retentionBase = new Date(Number(document?.submittedAt || approvedAt));
  const retentionUntil = addYears(retentionBase, 2).toISOString();

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    grossMinutes,
    netMinutes,
    calculatedNetHours: Number((netMinutes / 60).toFixed(2)),
    lateRecording,
    retentionUntil,
    legalBasis: ["ArbZG §§ 3-5", "MiLoG § 17"],
  };
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
  const file = path.join(
    projectDir(projectKey),
    "arbeitszeiten",
    "arbeitszeiten.json"
  );

  const official = {
    ...document,
    id: String(document?.id || document?.docId),
    docId: String(document?.docId || document?.id),
    projectKey,
    projectCode: projectKey,
    type: "ARBEITSZEIT",
    docType: "ARBEITSZEIT",
    status: "FREIGEGEBEN",
    workflowStatus: "FREIGEGEBEN",
    mobileApprovedAt: document?.approvedAt || Date.now(),
    compliance: document?.compliance || null,
    retentionUntil: document?.compliance?.retentionUntil || document?.retentionUntil || null,
    retentionReason: "MiLoG § 17 – Arbeitszeitaufzeichnungen mindestens 2 Jahre",
  };

  writeOfficialList(file, official);

  return {
    module: "BUERO_ARBEITSZEITEN",
    file,
  };
}


function finalizeBautagebuch(projectKey: string, document: any) {
  const id = safePart(document?.id || document?.docId || `bautagebuch_${Date.now()}`);
  const file = path.join(
    projectDir(projectKey),
    "bautagebuch",
    `${id}.json`
  );

  const official = {
    ...document,
    id,
    docId: id,
    projectKey,
    projectCode: projectKey,
    type: "BAUTAGEBUCH",
    docType: "BAUTAGEBUCH",
    workflowStatus: "FREIGEGEBEN",
  };

  writeJson(file, official);

  return {
    module: "BUERO_BAUTAGEBUCH",
    file,
  };
}

function finalizeDocument(projectKey: string, type: WorkflowType, document: any) {
  if (type === "ARBEITSZEIT") {
    return finalizeArbeitszeit(projectKey, document);
  }

  if (type === "BAUTAGEBUCH") {
    return finalizeBautagebuch(projectKey, document);
  }

  if (type === "ANGEBOT") {
    return finalizeAngebot(projectKey, document);
  }

  if (type === "MENGENERMITTLUNG") {
    return finalizeMengenermittlung(projectKey, document);
  }

  if (type === "RECHNUNG") {
    return finalizeRechnung(projectKey, document);
  }

  if (type === "ABSCHLAGSRECHNUNG") {
    return finalizeAbschlagsrechnung(projectKey, document);
  }

  if (type === "KALKULATION") {
    return finalizeKalkulation(projectKey, document);
  }

  if (type === "OUTLIER_REPORT") {
    return finalizeOutlier(projectKey, document);
  }

  throw new Error(`UNSUPPORTED_WORKFLOW_TYPE:${type}`);
}


async function archiveApprovedWorkflowDocument(
  projectKey: string,
  type: WorkflowType,
  document: any,
  uploadedBy?: string | null
) {
  const id = safePart(
    document?.id ||
    document?.docId ||
    `${type.toLowerCase()}_${Date.now()}`
  );

  const date = String(
    document?.date ||
    document?.datum ||
    document?.createdAt ||
    new Date().toISOString()
  ).slice(0, 10);

  const labels: Record<WorkflowType, string> = {
    ANGEBOT: "Angebot",
    MENGENERMITTLUNG: "Mengenermittlung",
    ABSCHLAGSRECHNUNG: "Abschlagsrechnung",
    RECHNUNG: "Rechnung",
    KALKULATION: "Kalkulation",
    OUTLIER_REPORT: "Outlier_Report",
    ARBEITSZEIT: "Arbeitszeit",
    BAUTAGEBUCH: "Bautagebuch",
  };

  const modules: Record<WorkflowType, string> = {
    ANGEBOT: "angebot",
    MENGENERMITTLUNG: "mengenermittlung",
    ABSCHLAGSRECHNUNG: "abschlagsrechnung",
    RECHNUNG: "rechnung",
    KALKULATION: "kalkulation",
    OUTLIER_REPORT: "outlier",
    ARBEITSZEIT: "arbeitszeit",
    BAUTAGEBUCH: "bautagebuch",
  };

  const title = labels[type];
  const moduleKey = modules[type];
  const retentionMeta = workflowRetentionMeta(type, document);

  const result = await buildDeliveryPackage({
    projectId: projectKey,
    projectName: String(
      document?.projectName ||
      document?.projectTitle ||
      projectKey
    ),
    moduleKey,
    documentId: id,
    title,
    date,
    data: document,
    formats: ["pdf"],
    createdBy: uploadedBy || "workflow",
  });

  const pdf = result.files.find(
    (file: any) =>
      file?.mime === "application/pdf" ||
      String(file?.name || "").toLowerCase().endsWith(".pdf")
  );

  if (!pdf?.filePath || !fs.existsSync(pdf.filePath)) {
    throw new Error(`DMS_PDF_NOT_CREATED:${type}:${id}`);
  }

  const filename = `${title}_${id}.pdf`;

  const pdfArchive = await archiveProjectFileVersion({
    projectIdOrCode: projectKey,
    filename,
    kind: "PDF",
    localPath: pdf.filePath,
    uploadedBy: uploadedBy || null,
    meta: {
      source: "workflow",
      docType: type,
      documentId: id,
      date,
      tags: [
        type,
        title,
        moduleKey
      ],
      ...retentionMeta
    }
  });

  if (type === "ARBEITSZEIT") {
    const structured = await archiveProjectBufferVersion({
      projectIdOrCode: projectKey,
      filename: `${title}_${id}.json`,
      kind: "DOC",
      buffer: Buffer.from(JSON.stringify(document, null, 2), "utf8"),
      uploadedBy: uploadedBy || null,
      meta: {
        source: "workflow-structured",
        docType: type,
        documentId: id,
        date,
        ...retentionMeta
      }
    });
    return { ...pdfArchive, structured };
  }

  return pdfArchive;
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

router.post("/:projectKey/:type/submit", async (req, res, next) => {
  try {
    const { projectKey, type } = resolveParams(req);
    if (!type) return next();
    if (!projectKey) {
      return res.status(400).json({ ok: false, error: "PROJECT_KEY_REQUIRED" });
    }

    const incoming = req.body?.doc ?? req.body?.data ?? req.body ?? {};
    const gpsPolicy = type === "ARBEITSZEIT" ? readEmployeeGpsPolicy(req?.auth?.companyId) : null;
    const incomingHasGps = type === "ARBEITSZEIT" && hasEmployeeGps(incoming);

    if (incomingHasGps && gpsPolicy?.employeeGpsEnabled &&
        (!gpsPolicy.employeeGpsPurpose || !gpsPolicy.employeeGpsLegalBasis || gpsPolicy.employeeGpsRetentionDays < 1)) {
      return res.status(422).json({ ok: false, error: "GPS_PRIVACY_CONFIGURATION_INCOMPLETE" });
    }

    const raw = incomingHasGps && !gpsPolicy?.employeeGpsEnabled
      ? { ...stripGpsFromWorktime(incoming), employeeGpsRemovedByPrivacyPolicy: true }
      : incoming;
    const now = Date.now();
    const id = safePart(raw?.id || raw?.docId || `${type.toLowerCase()}_${now}`);
    if (!id) return res.status(400).json({ ok: false, error: "DOC_ID_REQUIRED" });

    const document = {
      ...raw,
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
      employeeGpsPrivacy: type === "ARBEITSZEIT" ? {
        enabled: Boolean(gpsPolicy?.employeeGpsEnabled),
        present: Boolean(incomingHasGps && gpsPolicy?.employeeGpsEnabled),
        purpose: gpsPolicy?.employeeGpsEnabled ? gpsPolicy.employeeGpsPurpose : null,
        legalBasis: gpsPolicy?.employeeGpsEnabled ? gpsPolicy.employeeGpsLegalBasis : null,
        retentionDays: gpsPolicy?.employeeGpsEnabled ? gpsPolicy.employeeGpsRetentionDays : 0,
      } : undefined,
    };

    writeJson(workflowDocFile(projectKey, type, "inbox", id), document);
    appendWorkflowLog(projectKey, {
      projectKey,
      type,
      id,
      action: "submit",
      workflowStatus: "EINGEREICHT",
      updatedAt: now,
    });

    await recordProjectSubmission(req, {
      projectToken: projectKey,
      source: "MOBILE",
      kind: type,
      entityId: id,
      title: String(document?.title || document?.name || type),
      meta: {
        projectCode: projectKey,
        workflowStatus: document.workflowStatus,
        docType: type,
      },
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

router.get("/:projectKey/ARBEITSZEIT/:id/gps-evidence", (req: any, res) => {
  const role = String(req?.auth?.companyRole || req?.auth?.role || "").trim().toUpperCase();
  if (!["ADMIN", "ADMINISTRATOR", "BAULEITER"].includes(role) && !(process.env.NODE_ENV !== "production" && (process.env.DEV_AUTH || "").toLowerCase() === "on")) {
    return res.status(403).json({ ok: false, error: "GPS_EVIDENCE_FORBIDDEN" });
  }
  const projectKey = safePart(req.params.projectKey);
  const id = safePart(req.params.id);
  cleanupExpiredEmployeeGps(projectKey);
  const file = path.join(employeeGpsDir(projectKey), `${id}.json`);
  const data = readJson<any>(file, null);
  if (!data) return res.status(404).json({ ok: false, error: "GPS_EVIDENCE_NOT_FOUND_OR_EXPIRED" });
  return res.json({ ok: true, data });
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

router.post("/:projectKey/:type/:id/approve", async (req, res, next) => {
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
    const actor = String(
      req?.auth?.email || req?.auth?.userId || req?.auth?.sub || req?.user?.email || req?.user?.id || ""
    ).trim();

    const compliance = type === "ARBEITSZEIT"
      ? validateArbeitszeitForApproval(projectKey, current, now)
      : null;

    if (compliance && !compliance.valid) {
      appendWorkflowLog(projectKey, {
        projectKey, type, id, action: "approve-blocked-compliance",
        actor: actor || null, errors: compliance.errors, warnings: compliance.warnings, updatedAt: now,
      });
      return res.status(422).json({
        ok: false,
        error: "ARBEITSZEIT_COMPLIANCE_FAILED",
        message: "Arbeitszeitnachweis erfüllt die gesetzlichen/konfigurierten Prüfkriterien nicht.",
        compliance,
      });
    }

    const approvalGpsPolicy = type === "ARBEITSZEIT" ? readEmployeeGpsPolicy(req?.auth?.companyId) : null;
    const gpsSummary = type === "ARBEITSZEIT" && approvalGpsPolicy?.employeeGpsEnabled
      ? storeEmployeeGpsEvidence(projectKey, id, current, approvalGpsPolicy, actor, now)
      : null;
    const approvalSource = type === "ARBEITSZEIT" ? stripGpsFromWorktime(current) : current;

    const approved = {
      ...approvalSource,
      workflowStatus: "FREIGEGEBEN",
      approvedAt: now,
      approvedBy: actor || null,
      compliance: compliance || current?.compliance || null,
      retentionUntil: compliance?.retentionUntil || current?.retentionUntil || null,
      employeeGpsEvidence: gpsSummary,
      rejectionReason: null,
      updatedAt: now,
    };

    const finalTarget = finalizeDocument(projectKey, type, approved);

    const dms = await archiveApprovedWorkflowDocument(
      projectKey,
      type,
      approved,
      approved.approvedBy
    );

    const completed = {
      ...approved,
      finalizedAt: now,
      finalTarget,
      dms: {
        documentId: dms.documentId,
        versionId: dms.versionId,
        version: dms.version,
      },
    };
    writeJson(workflowDocFile(projectKey, type, "approved", id), completed);
    fs.unlinkSync(inboxFile);

    appendWorkflowLog(projectKey, {
      projectKey,
      type,
      id,
      action: "approve",
      workflowStatus: "FREIGEGEBEN",
      actor: actor || null,
      compliance: compliance || null,
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
