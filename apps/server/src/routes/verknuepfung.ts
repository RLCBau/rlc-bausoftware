// apps/server/src/routes/verknuepfung.ts
// @ts-nocheck

import { Router } from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { PROJECTS_ROOT as PROJECTS_ROOT_LIB } from "../lib/projectsRoot";
import { requireProjectMember } from "../middleware/guards";

const r = Router();

function verknuepfungRole(req:any): string {
  return String(req?.auth?.companyRole || req?.auth?.role || "").trim().toUpperCase();
}
function requireNachtragWrite(req:any,res:any,next:any){
  if(!["ADMIN","ADMINISTRATOR","BAULEITER","KALKULATOR"].includes(verknuepfungRole(req))){
    return res.status(403).json({ok:false,error:"NACHTRAG_WRITE_FORBIDDEN"});
  }
  return next();
}
function requireNachtragApproval(req:any,res:any,next:any){
  if(!["ADMIN","ADMINISTRATOR","BAULEITER"].includes(verknuepfungRole(req))){
    return res.status(403).json({ok:false,error:"NACHTRAG_APPROVAL_FORBIDDEN"});
  }
  return next();
}
function requireAbschlagWrite(req:any,res:any,next:any){
  if(!["ADMIN","ADMINISTRATOR","BAULEITER","BUCHHALTUNG"].includes(verknuepfungRole(req))){
    return res.status(403).json({ok:false,error:"ABSCHLAG_WRITE_FORBIDDEN"});
  }
  return next();
}

const PROJECTS_ROOT =
  process.env.PROJECTS_ROOT ||
  PROJECTS_ROOT_LIB ||
  path.join(process.cwd(), "data", "projects");

/* ================= BASIC HELPERS ================= */

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function readJson<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, data: any) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}

function rid() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function safeNum(x: any) {
  if (x === null || x === undefined || x === "") return 0;

  const raw = String(x).trim();
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;

  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function s(x: any) {
  return String(x ?? "").trim();
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function round2(v: number) {
  return Math.round((safeNum(v) + Number.EPSILON) * 100) / 100;
}

/* ================= FS-KEY HELPERS ================= */

function safeFsKey(input: string) {
  return String(input || "")
    .trim()
    .replace(/[^A-Za-z0-9_\-]/g, "_")
    .slice(0, 120);
}

async function resolveProjectFsKey(input: string): Promise<string> {
  const trimmed=String(input||"").trim();
  if(!trimmed) return "UNKNOWN";
  try{
    let project=await prisma.project.findUnique({where:{id:trimmed},select:{id:true,code:true}});
    if(!project){
      const matches=await prisma.project.findMany({where:{code:trimmed},select:{id:true,code:true},take:2});
      if(matches.length!==1) return "UNKNOWN";
      project=matches[0];
    }
    const canonical=safeFsKey(project.id);
    const legacy=String(project.code||"").trim();
    if(legacy && legacy!==project.id){
      const duplicates=await prisma.project.count({where:{code:legacy}});
      if(duplicates===1){
        const legacyRoot=path.join(PROJECTS_ROOT,safeFsKey(legacy));
        const canonicalRoot=path.join(PROJECTS_ROOT,canonical);
        for(const parts of [["verknuepfung"],["soll-ist.json"],["aufmass","soll-ist.json"],["abschlaege.json"]]){
          const src=path.join(legacyRoot,...parts), dst=path.join(canonicalRoot,...parts);
          if(!fs.existsSync(src)||fs.existsSync(dst)) continue;
          fs.mkdirSync(path.dirname(dst),{recursive:true});
          if(fs.statSync(src).isDirectory()) fs.cpSync(src,dst,{recursive:true}); else fs.copyFileSync(src,dst);
        }
      }
    }
    return canonical;
  }catch(e){
    console.error("[verknuepfung] resolveProjectFsKey failed",e);
    return "UNKNOWN";
  }
}

function pProjectResolved(fsKey: string) {
  return path.join(PROJECTS_ROOT, fsKey);
}

/* ================= TYPES ================= */

type SollIstRow = {
  pos: string;
  text: string;
  unit: string;
  soll: number;
  ist: number;
  ep: number;
};

import { archiveProjectFileVersion } from "../services/dmsArchive";

type NachtragStatus =
  | "offen"
  | "inBearbeitung"
  | "freigegeben"
  | "abgelehnt";

type Nachtrag = {
  id: string;
  projectKey: string;
  lvPos: string;
  number: string;
  title: string;
  langtext?: string;
  qty: number;
  unit: string;
  ep: number;
  total: number;
  status: NachtragStatus;
  note?: string;
  contractBasis?: "BGB" | "VOBB" | "OTHER";
  changeRequestDate?: string;
  changeRequestReceivedAt?: string;
  bgbAgreementDeadline?: string;
  agreementStatus?: "PENDING" | "AGREED" | "ORDERED" | "DISPUTED";
  orderDate?: string;
  orderTextFormConfirmed?: boolean;
  orderReference?: string;
  priceBasis?: "ACTUAL_COSTS_650C" | "URKALKULATION" | "VOBB" | "OTHER";
  planningProvided?: boolean;
  legalNote?: string;
  createdAt: string;
  updatedAt: string;
};

type AbschlagStatus = "Entwurf" | "Freigegeben" | "Gebucht";

type AbschlagItemRow = {
  lvPos: string;
  kurztext: string;
  einheit: string;
  qty: number;
  ep: number;
  total: number;
};

type AbschlagItem = {
  id: string;
  projectId: string;
  nr: number;
  date: string;
  title?: string;
  netto: number;
  mwst: number;
  brutto: number;
  status: AbschlagStatus;
  rows: AbschlagItemRow[];
};

/* ================= PATHS ================= */

function files(fsKey: string) {
  const root = pProjectResolved(fsKey);

  const sollIstRoot = path.join(root, "soll-ist.json");
  const sollIstLegacy = path.join(root, "aufmass", "soll-ist.json");

  const vRoot = path.join(root, "verknuepfung");
  const nachtraege = path.join(vRoot, "nachtraege.json");

  const abschlaege = path.join(root, "abschlaege.json");

  return {
    root,
    vRoot,
    sollIstRoot,
    sollIstLegacy,
    nachtraege,
    abschlaege,
  };
}

function ensureProjectStructure(fsKey: string) {
  const f = files(fsKey);

  ensureDir(f.root);
  ensureDir(f.vRoot);

  if (!fs.existsSync(f.nachtraege)) {
    writeJson(f.nachtraege, { items: [] });
  }

  if (!fs.existsSync(f.abschlaege)) {
    writeJson(f.abschlaege, []);
  }

  return f;
}

/* ================= NORMALIZER ================= */

function normalizeSollIstRow(x: any): SollIstRow | null {
  const pos = s(x?.pos ?? x?.lvPos ?? x?.posNr);
  if (!pos) return null;

  return {
    pos,
    text: String(x?.text ?? x?.kurztext ?? x?.title ?? ""),
    unit: String(x?.unit ?? x?.einheit ?? "m"),
    soll: safeNum(x?.soll),
    ist: safeNum(x?.ist),
    ep: safeNum(x?.ep ?? x?.preis),
  };
}

function readSollIstRows(fsKey: string): SollIstRow[] {
  const { sollIstRoot, sollIstLegacy } = files(fsKey);

  const pick = fs.existsSync(sollIstRoot) ? sollIstRoot : sollIstLegacy;
  if (!pick || !fs.existsSync(pick)) return [];

  const raw = readJson<any>(pick, null);
  const arr = Array.isArray(raw)
    ? raw
    : raw && Array.isArray(raw.rows)
    ? raw.rows
    : [];

  const out: SollIstRow[] = [];

  for (const item of arr) {
    const row = normalizeSollIstRow(item);
    if (row) out.push(row);
  }

  return out;
}

function nextNachtragNumber(existing: Nachtrag[]) {
  let max = 0;

  for (const n of existing || []) {
    const m = String(n.number || "").match(/(\d+)/);
    if (m) max = Math.max(max, Number(m[1] || 0));
  }

  return `N${String(max + 1).padStart(2, "0")}`;
}

function normalizeNachtragStatus(x: any): NachtragStatus {
  const v = String(x ?? "").trim().toLowerCase();

  if (!v) return "offen";
  if (v === "offen" || v === "open") return "offen";
  if (v === "inbearbeitung" || v === "in_bearbeitung" || v === "bearbeitung")
    return "inBearbeitung";
  if (v === "freigegeben" || v === "approved" || v === "ok")
    return "freigegeben";
  if (v === "abgelehnt" || v === "rejected" || v === "nein")
    return "abgelehnt";

  if (v.includes("entwurf")) return "offen";
  if (v.includes("abgegeben")) return "inBearbeitung";
  if (v.includes("beauftragt")) return "freigegeben";

  return "offen";
}

function isoDateOrEmpty(value:any){const raw=String(value||"").trim();if(!raw)return "";const d=new Date(raw);return Number.isNaN(d.getTime())?raw:d.toISOString();}
function plusDaysIso(value:any,days:number){const raw=String(value||"").trim();if(!raw)return "";const d=new Date(raw);if(Number.isNaN(d.getTime()))return "";d.setDate(d.getDate()+days);return d.toISOString();}
function isLockedNachtrag(row:any){return normalizeNachtragStatus(row?.status)==="freigegeben";}
function nachtragCanonical(row:any){const copy=JSON.parse(JSON.stringify(row||{}));delete copy.updatedAt;return JSON.stringify(Object.keys(copy).sort().reduce((a:any,k)=>{a[k]=copy[k];return a;},{}));}
function validateNachtragLegal(row:any){const errors:string[]=[];const warnings:string[]=[];const basis=String(row?.contractBasis||"").toUpperCase();if(!basis)errors.push("Vertragsgrundlage fehlt (BGB/VOB/B/sonstige).");if(!String(row?.note||"").trim())errors.push("Begründung des Nachtrags fehlt.");if(!String(row?.priceBasis||"").trim())errors.push("Preis-/Vergütungsgrundlage fehlt.");if(!String(row?.changeRequestReceivedAt||"").trim())errors.push("Eingang des Änderungsbegehrens ist nicht dokumentiert.");if(basis==="BGB"){const deadline=String(row?.bgbAgreementDeadline||"");if(deadline&&Date.parse(deadline)<Date.now()&&!row?.orderTextFormConfirmed&&String(row?.agreementStatus||"")!=="AGREED")warnings.push("BGB §650b: 30-Tage-Einigungsphase ist abgelaufen; Anordnung/weiteres Vorgehen dokumentieren.");if(String(row?.agreementStatus||"")==="ORDERED"&&!row?.orderTextFormConfirmed)errors.push("BGB §650b: Anordnung in Textform ist nicht bestätigt.");}if(basis==="VOBB")warnings.push("VOB/B gilt nur, wenn sie wirksam Vertragsbestandteil ist; Vertragsgrundlage prüfen.");return {valid:errors.length===0,errors,warnings};}

function normalizeNachtrag(x: any, fsKey: string, existing?: Nachtrag[]): Nachtrag {
  const now = new Date().toISOString();
  const existingRows = Array.isArray(existing) ? existing : [];
  const id = String(x?.id || rid());

  const prev =
    existingRows.find((n) => String(n.id) === id) ||
    existingRows.find(
      (n) =>
        s(n.lvPos) &&
        s(n.lvPos) === s(x?.lvPos ?? x?.posNr ?? x?.pos)
    ) ||
    null;

  const lvPos = s(x?.lvPos ?? x?.posNr ?? x?.pos ?? prev?.lvPos);
  const title = String(x?.title ?? x?.kurztext ?? prev?.title ?? "");
  const langtext = String(
    x?.langtext ?? x?.longText ?? x?.beschreibung ?? prev?.langtext ?? ""
  );

  const unit = String(x?.unit ?? x?.einheit ?? prev?.unit ?? "m");
  const qty = safeNum(x?.qty ?? x?.mengeDelta ?? x?.menge ?? prev?.qty);
  const ep = safeNum(x?.ep ?? x?.preis ?? prev?.ep);

  const total =
    Number.isFinite(Number(x?.total)) && x?.total !== ""
      ? round2(safeNum(x?.total))
      : round2(qty * ep);

  let number = String(x?.number ?? prev?.number ?? "");
  if (!number) number = nextNachtragNumber(existingRows);

  const note = String(
    x?.note ?? x?.begruendung ?? x?.reason ?? prev?.note ?? ""
  );

  const contractBasisRaw=String(x?.contractBasis ?? prev?.contractBasis ?? "").toUpperCase();
  const contractBasis=(contractBasisRaw==="BGB"||contractBasisRaw==="VOBB"?contractBasisRaw:(contractBasisRaw?"OTHER":undefined)) as Nachtrag["contractBasis"];
  const changeRequestReceivedAt=isoDateOrEmpty(x?.changeRequestReceivedAt ?? prev?.changeRequestReceivedAt);
  const bgbAgreementDeadline=contractBasis==="BGB"&&changeRequestReceivedAt?plusDaysIso(changeRequestReceivedAt,30):String(x?.bgbAgreementDeadline ?? prev?.bgbAgreementDeadline ?? "");
  return {
    id,
    projectKey: fsKey,
    lvPos,
    number,
    title,
    langtext,
    qty,
    unit,
    ep,
    total,
    status: normalizeNachtragStatus(x?.status ?? prev?.status),
    note,
    contractBasis,
    changeRequestDate: isoDateOrEmpty(x?.changeRequestDate ?? prev?.changeRequestDate),
    changeRequestReceivedAt,
    bgbAgreementDeadline,
    agreementStatus: String(x?.agreementStatus ?? prev?.agreementStatus ?? "PENDING").toUpperCase() as Nachtrag["agreementStatus"],
    orderDate: isoDateOrEmpty(x?.orderDate ?? prev?.orderDate),
    orderTextFormConfirmed: Boolean(x?.orderTextFormConfirmed ?? prev?.orderTextFormConfirmed ?? false),
    orderReference: String(x?.orderReference ?? prev?.orderReference ?? ""),
    priceBasis: String(x?.priceBasis ?? prev?.priceBasis ?? "").toUpperCase() as Nachtrag["priceBasis"],
    planningProvided: Boolean(x?.planningProvided ?? prev?.planningProvided ?? false),
    legalNote: String(x?.legalNote ?? prev?.legalNote ?? ""),
    createdAt: String(x?.createdAt ?? prev?.createdAt ?? now),
    updatedAt: now,
  };
}

function readNachtraege(fsKey: string): Nachtrag[] {
  const { nachtraege } = ensureProjectStructure(fsKey);
  const data = readJson<{ items: Nachtrag[] }>(nachtraege, { items: [] });
  return Array.isArray(data.items) ? data.items : [];
}

function writeNachtraege(fsKey: string, items: Nachtrag[]) {
  const { nachtraege } = ensureProjectStructure(fsKey);
  writeJson(nachtraege, { items: Array.isArray(items) ? items : [] });
}

function archiveNachtraegeDms(fsKey: string) {
  const { nachtraege } = ensureProjectStructure(fsKey);

  void archiveProjectFileVersion({
    projectIdOrCode: fsKey,
    filename: "Nachtraege.json",
    kind: "LV",
    localPath: nachtraege,
    meta: {
      module: "KALKULATION",
      source: "verknuepfung.nachtraege"
    }
  }).catch((error) => {
    console.error("[nachtraege:dms]", error);
  });
}

function readAbschlaegeArray(fsKey: string): { items: AbschlagItem[]; file: string } {
  const { abschlaege } = ensureProjectStructure(fsKey);
  const data = readJson<any>(abschlaege, []);
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.items)
    ? data.items
    : [];

  return { items: arr as AbschlagItem[], file: abschlaege };
}

function writeAbschlaegeArray(fsKey: string, items: AbschlagItem[]) {
  const { abschlaege } = ensureProjectStructure(fsKey);
  writeJson(abschlaege, items);
}

function recalcAbschlagTotals(a: AbschlagItem) {
  const netto = (a.rows || []).reduce((sum, row) => sum + safeNum(row.total), 0);
  const mwst = safeNum(a.mwst);
  const brutto = netto * (1 + mwst / 100);

  a.netto = round2(netto);
  a.brutto = round2(brutto);
}

/* ================= LINKING ================= */

function buildLinking(fsKey: string) {
  ensureProjectStructure(fsKey);

  const sollRows = readSollIstRows(fsKey);
  const nachtraege = readNachtraege(fsKey);
  const { items: abschlaege } = readAbschlaegeArray(fsKey);

  const ntByPos = new Map<string, Nachtrag[]>();

  for (const n of nachtraege) {
    const k = s(n.lvPos);
    if (!k) continue;
    const arr = ntByPos.get(k) || [];
    arr.push(n);
    ntByPos.set(k, arr);
  }

  const abByPos = new Map<string, number>();

  for (const a of abschlaege || []) {
    for (const row of a.rows || []) {
      const k = s(row.lvPos);
      if (k) abByPos.set(k, a.nr);
    }
  }

  const rows = (sollRows || []).map((r0) => {
    const pos = s(r0.pos);
    const soll = safeNum(r0.soll);
    const ist = safeNum(r0.ist);
    const ep = safeNum(r0.ep);
    const diff = ist - soll;

    const status = diff === 0 ? "OK" : diff > 0 ? "UEBERMASS" : "FEHLMENGE";

    const nts = ntByPos.get(pos) || [];
    const best = nts.find((x) => x.status !== "abgelehnt") || nts[0] || null;

    const abschlagNr = abByPos.get(pos) ?? null;

    return {
      id: `lv:${pos}`,
      lvPos: pos,
      text: String(r0.text || ""),
      unit: String(r0.unit || ""),
      soll,
      ist,
      ep,
      diff,
      status,
      nachtragId: best?.id || null,
      nachtragNr: best?.number || null,
      nachtragStatus: best?.status || null,
      nachtragTotal: best?.total || null,
      abschlagNr,
    };
  });

  return {
    rows,
    nachtraege,
    abschlaege,
  };
}

/* ================= ROUTES ================= */

/**
 * GET /api/verknuepfung/list/:projectKey
 */
r.get("/verknuepfung/list/:projectKey", requireProjectMember("projectKey"), async (req, res) => {
  try {
    const inputKey = s((req as any).resolvedProjectId || req.params.projectKey);
    if (!inputKey) {
      return res.status(400).json({ ok: false, error: "projectKey fehlt" });
    }

    const fsKey = await resolveProjectFsKey(inputKey);
    ensureProjectStructure(fsKey);

    const out = buildLinking(fsKey);

    let sollSum = 0;
    let istSum = 0;
    let offenNachtragEUR = 0;
    let abrechenbarEUR = 0;

    for (const row of out.rows) {
      sollSum += safeNum(row.soll);
      istSum += safeNum(row.ist);
      abrechenbarEUR += safeNum(row.ist) * safeNum(row.ep);

      if (safeNum(row.diff) > 0 && !row.nachtragNr) {
        offenNachtragEUR += safeNum(row.diff) * safeNum(row.ep);
      }
    }

    const f = files(fsKey);
    const sourceSollIstFile = fs.existsSync(f.sollIstRoot)
      ? f.sollIstRoot
      : fs.existsSync(f.sollIstLegacy)
      ? f.sollIstLegacy
      : null;

    return res.json({
      ok: true,
      projectKey: inputKey,
      fsKey,
      kpi: {
        sollSum: round2(sollSum),
        istSum: round2(istSum),
        offenNachtragEUR: round2(offenNachtragEUR),
        abrechenbarEUR: round2(abrechenbarEUR),
      },
      items: out.rows,
      sourceSollIstFile,
    });
  } catch (e: any) {
    console.error("[verknuepfung:list:GET]", e);
    return res.status(500).json({
      ok: false,
      error: e?.message || "Verknüpfung konnte nicht geladen werden",
    });
  }
});

/**
 * GET /api/verknuepfung/nachtraege/:projectKey
 */
r.get("/verknuepfung/nachtraege/:projectKey", requireProjectMember("projectKey"), async (req, res) => {
  try {
    const inputKey = s((req as any).resolvedProjectId || req.params.projectKey);
    if (!inputKey) {
      return res.status(400).json({ ok: false, error: "projectKey fehlt" });
    }

    const fsKey = /^BA[-_]/i.test(inputKey) ? safeFsKey(inputKey) : await resolveProjectFsKey(inputKey);
    const f = ensureProjectStructure(fsKey);
    const data = readJson<{ items: Nachtrag[] }>(f.nachtraege, { items: [] });
    const items = Array.isArray(data.items) ? data.items : [];

    return res.json({
      ok: true,
      projectKey: inputKey,
      fsKey,
      items,
    });
  } catch (e: any) {
    console.error("[verknuepfung:nachtraege:GET]", e);
    return res.status(500).json({
      ok: false,
      error: e?.message || "Nachträge konnten nicht geladen werden",
    });
  }
});

/**
 * PUT /api/verknuepfung/nachtraege/:projectKey
 * body: { items: Nachtrag[] }
 */
r.put("/verknuepfung/nachtraege/:projectKey", requireProjectMember("projectKey"), requireNachtragWrite, async (req, res) => {
  try {
    const inputKey = s((req as any).resolvedProjectId || req.params.projectKey);
    if (!inputKey) {
      return res.status(400).json({ ok: false, error: "projectKey fehlt" });
    }

    const fsKey = await resolveProjectFsKey(inputKey);
    ensureProjectStructure(fsKey);

    const incoming: any[] = Array.isArray(req.body?.items)
      ? req.body.items
      : [];

    const existing = readNachtraege(fsKey);

    const incomingIds=new Set(incoming.map((x:any)=>String(x?.id||"")));
    for(const oldRow of existing){if(isLockedNachtrag(oldRow)&&!incomingIds.has(String(oldRow.id))){return res.status(409).json({ok:false,error:"NACHTRAG_LOCKED",message:`Freigegebener Nachtrag ${oldRow.number} darf nicht gelöscht werden.`});}}

    const cleaned: Nachtrag[] = incoming
      .map((x) => normalizeNachtrag(x, fsKey, existing))
      .filter(
        (n) =>
          s(n.lvPos).length > 0 ||
          String(n.title || "").trim().length > 0 ||
          String(n.langtext || "").trim().length > 0 ||
          String(n.note || "").trim().length > 0
      );

    for(const oldRow of existing){
      if(!isLockedNachtrag(oldRow)) continue;
      const candidate=cleaned.find((x)=>String(x.id)===String(oldRow.id));
      if(candidate&&nachtragCanonical(normalizeNachtrag(oldRow,fsKey,existing))!==nachtragCanonical(candidate)){return res.status(409).json({ok:false,error:"NACHTRAG_LOCKED",message:`Freigegebener Nachtrag ${oldRow.number} darf nicht verändert werden.`});}
    }
    const compliance=cleaned.map((row)=>({id:row.id,number:row.number,...validateNachtragLegal(row)}));
    for(const row of cleaned){if(isLockedNachtrag(row)){const check=validateNachtragLegal(row);if(!check.valid)return res.status(422).json({ok:false,error:"NACHTRAG_LEGAL_VALIDATION_FAILED",id:row.id,number:row.number,errors:check.errors,warnings:check.warnings});}}

    writeNachtraege(fsKey, cleaned);

    archiveNachtraegeDms(fsKey);

    return res.json({
      ok: true,
      projectKey: inputKey,
      fsKey,
      items: cleaned,
      count: cleaned.length,
      compliance,
    });
  } catch (e: any) {
    console.error("[verknuepfung:nachtraege:PUT]", e);
    return res.status(500).json({
      ok: false,
      error: e?.message || "Nachträge konnten nicht gespeichert werden",
    });
  }
});

/**
 * POST /api/verknuepfung/nachtrag/:projectKey
 * body: { lvPos: string[] }
 */
r.post("/verknuepfung/nachtrag/:projectKey", requireProjectMember("projectKey"), requireNachtragWrite, async (req, res) => {
  try {
    const inputKey = s((req as any).resolvedProjectId || req.params.projectKey);
    const lvPos: string[] = Array.isArray(req.body?.lvPos)
      ? req.body.lvPos
      : [];

    if (!inputKey) {
      return res.status(400).json({ ok: false, error: "projectKey fehlt" });
    }

    if (!lvPos.length) {
      return res.status(400).json({ ok: false, error: "lvPos[] fehlt" });
    }

    const fsKey = await resolveProjectFsKey(inputKey);
    ensureProjectStructure(fsKey);

    const nachtraege = readNachtraege(fsKey);
    const sollRows = readSollIstRows(fsKey);

    const byPos = new Map<string, SollIstRow>();
    for (const row of sollRows) byPos.set(s(row.pos), row);

    const created: Nachtrag[] = [];
    const now = new Date().toISOString();

    for (const pos of lvPos.map((x) => s(x)).filter(Boolean)) {
      const row = byPos.get(pos);
      if (!row) continue;

      const diff = safeNum(row.ist) - safeNum(row.soll);
      if (diff <= 0) continue;

      const exists = nachtraege.find(
        (n) => s(n.lvPos) === pos && n.status !== "abgelehnt"
      );

      if (exists) continue;

      const ep = safeNum(row.ep);

      const nt: Nachtrag = {
        id: rid(),
        projectKey: fsKey,
        lvPos: pos,
        number: nextNachtragNumber([...nachtraege, ...created]),
        title: `Nachtrag zu LV ${pos}`,
        langtext: "",
        qty: diff,
        unit: String(row.unit || "m"),
        ep,
        total: round2(diff * ep),
        status: "offen",
        note: `Automatisch erstellt aus Soll/Ist. Differenz: ${diff}`,
        contractBasis: undefined,
        agreementStatus: "PENDING",
        orderTextFormConfirmed: false,
        priceBasis: "URKALKULATION",
        planningProvided: false,
        createdAt: now,
        updatedAt: now,
      };

      created.push(nt);
    }

    const next = [...created, ...nachtraege];
    writeNachtraege(fsKey, next);
    archiveNachtraegeDms(fsKey);

    return res.json({
      ok: true,
      projectKey: inputKey,
      fsKey,
      created,
      items: next,
    });
  } catch (e: any) {
    console.error("[verknuepfung:nachtrag:POST]", e);
    return res.status(500).json({
      ok: false,
      error: e?.message || "Nachtrag konnte nicht erstellt werden",
    });
  }
});

/**
 * POST /api/verknuepfung/freigeben/:projectKey
 */
r.post("/verknuepfung/freigeben/:projectKey", requireProjectMember("projectKey"), requireNachtragApproval, async (req, res) => {
  try {
    const inputKey = s((req as any).resolvedProjectId || req.params.projectKey);
    if (!inputKey) {
      return res.status(400).json({ ok: false, error: "projectKey fehlt" });
    }

    const fsKey = await resolveProjectFsKey(inputKey);
    ensureProjectStructure(fsKey);

    const nachtragIds: string[] = Array.isArray(req.body?.nachtragIds)
      ? req.body.nachtragIds
      : [];

    const lvPos: string[] = Array.isArray(req.body?.lvPos)
      ? req.body.lvPos
      : [];

    const idSet = new Set(nachtragIds.map(String));
    const posSet = new Set(lvPos.map((x) => s(x)));

    const now = new Date().toISOString();
    const actor = String((req as any)?.auth?.email || (req as any)?.auth?.sub || (req as any)?.auth?.userId || "").trim() || null;
    let updated = 0;
    const current = readNachtraege(fsKey);

    const selected = current.filter((n) =>
      (n.id && idSet.has(String(n.id))) ||
      (n.lvPos && posSet.has(s(n.lvPos)))
    );
    for (const row of selected) {
      const candidate:any = { ...row, status: "freigegeben", updatedAt: now, approvedAt: now, approvedBy: actor };
      const check = validateNachtragLegal(candidate);
      if (!check.valid) {
        return res.status(422).json({
          ok:false,
          error:"NACHTRAG_LEGAL_VALIDATION_FAILED",
          id:row.id,
          number:row.number,
          errors:check.errors,
          warnings:check.warnings
        });
      }
    }

    const next = current.map((n) => {
      const match =
        (n.id && idSet.has(String(n.id))) ||
        (n.lvPos && posSet.has(s(n.lvPos)));

      if (!match) return n;

      updated += 1;

      return {
        ...n,
        status: "freigegeben" as NachtragStatus,
        updatedAt: now,
        approvedAt: now,
        approvedBy: actor,
      } as any;
    });

    writeNachtraege(fsKey, next);

    archiveNachtraegeDms(fsKey);

    return res.json({
      ok: true,
      projectKey: inputKey,
      fsKey,
      updated,
      items: next,
    });
  } catch (e: any) {
    console.error("[verknuepfung:freigeben:POST]", e);
    return res.status(500).json({
      ok: false,
      error: e?.message || "Nachträge konnten nicht freigegeben werden",
    });
  }
});

/**
 * POST /api/verknuepfung/abschlag/:projectKey
 * body: { lvPos: string[], nr?: number | null }
 */
r.post("/verknuepfung/abschlag/:projectKey", requireProjectMember("projectKey"), requireAbschlagWrite, async (req, res) => {
  try {
    const inputKey = s((req as any).resolvedProjectId || req.params.projectKey);
    const lvPos: string[] = Array.isArray(req.body?.lvPos)
      ? req.body.lvPos
      : [];

    const wantedNr =
      req.body?.nr !== undefined && req.body?.nr !== null
        ? Number(req.body.nr)
        : null;

    if (!inputKey) {
      return res.status(400).json({ ok: false, error: "projectKey fehlt" });
    }

    if (!lvPos.length) {
      return res.status(400).json({ ok: false, error: "lvPos[] fehlt" });
    }

    const fsKey = await resolveProjectFsKey(inputKey);
    ensureProjectStructure(fsKey);

    const sollRows = readSollIstRows(fsKey);
    const byPos = new Map<string, SollIstRow>();

    for (const row of sollRows) byPos.set(s(row.pos), row);

    const { items: abItems, file } = readAbschlaegeArray(fsKey);

    let abschlag: AbschlagItem | null = null;

    if (wantedNr && Number.isFinite(wantedNr) && wantedNr > 0) {
      abschlag =
        (abItems || []).find((a) => Number(a.nr) === wantedNr) || null;
    }

    if (!abschlag) {
      const maxNr = (abItems || []).reduce(
        (m, a) => Math.max(m, Number(a.nr) || 0),
        0
      );

      const nextNr = maxNr + 1;

      abschlag = {
        id: rid(),
        projectId: fsKey,
        nr: nextNr,
        date: todayIso(),
        title: `Abschlagsrechnung ${nextNr}`,
        netto: 0,
        mwst: 19,
        brutto: 0,
        status: "Entwurf",
        rows: [],
      };

      abItems.unshift(abschlag);
    } else {
      if (String(abschlag.status || "Entwurf").toLowerCase() !== "entwurf") {
        return res.status(409).json({ ok:false, error:"ABSCHLAG_LOCKED", message:"Freigegebene oder gebuchte Abschläge dürfen nicht über die Positionsauswahl verändert werden." });
      }
      abschlag.rows = Array.isArray(abschlag.rows) ? abschlag.rows : [];
      if (!abschlag.mwst && abschlag.mwst !== 0) abschlag.mwst = 19;
      if (!abschlag.status) abschlag.status = "Entwurf";
      if (!abschlag.date) abschlag.date = todayIso();
      if (!abschlag.title) {
        abschlag.title = `Abschlagsrechnung ${abschlag.nr}`;
      }
    }

    const selSet = new Set(lvPos.map((x) => s(x)).filter(Boolean));

    abschlag.rows = (abschlag.rows || []).filter(
      (row) => !selSet.has(s(row.lvPos))
    );

    for (const pos of selSet) {
      const row = byPos.get(pos);
      if (!row) continue;

      const qty = safeNum(row.ist);
      const ep = safeNum(row.ep);
      const total = round2(qty * ep);

      abschlag.rows.push({
        lvPos: pos,
        kurztext: String(row.text || ""),
        einheit: String(row.unit || ""),
        qty,
        ep,
        total,
      });
    }

    recalcAbschlagTotals(abschlag);
    writeAbschlaegeArray(fsKey, abItems);

    return res.json({
      ok: true,
      projectKey: inputKey,
      fsKey,
      nr: abschlag.nr,
      id: abschlag.id,
      rows: abschlag.rows?.length || 0,
      netto: abschlag.netto,
      brutto: abschlag.brutto,
      file,
    });
  } catch (e: any) {
    console.error("[verknuepfung:abschlag:POST]", e);
    return res.status(500).json({
      ok: false,
      error: e?.message || "Abschlag konnte nicht erstellt werden",
    });
  }
});

export default r;
