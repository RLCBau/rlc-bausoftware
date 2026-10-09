// apps/server/src/routes/tagesbericht.ts
import {normalizeDiaryReport} from "../domain/diaryTimeExport";
import { Router } from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { z } from "zod";
import { PROJECTS_ROOT } from "../lib/projectsRoot";
import { prisma } from "../lib/prisma";
import { recordProjectSubmission } from "../lib/projectSubmission";
import { createTagesberichtPdf } from "../services/pdf/tagesberichtPdf";
import { createBautagebuchPdf } from "../services/pdf/bautagebuchPdf";
import { loadRlcPdfCompanyFromRequest } from "../services/pdf/pdfCompanyContext";
import { archiveProjectFileVersion } from "../services/dmsArchive";
import { requireProjectMember } from "../middleware/guards";

import {
  requireAuth,
  requireMode,
  requireEmailVerified,
} from "../middleware/requireAuth";

const router = Router();

router.use((req:any,res,next)=>{
  if(req.method==="GET" || req.method==="HEAD") return next();
  const role=String(req?.auth?.companyRole||req?.auth?.role||"").trim().toUpperCase();
  if(!["ADMIN","ADMINISTRATOR","BAULEITER","CAPOCANTIERE","MITARBEITER"].includes(role)){
    return res.status(403).json({ok:false,error:"REPORT_WRITE_FORBIDDEN"});
  }
  return next();
});

function requireReportApprovalRole(req:any,res:any,next:any){
  const role=String(req?.auth?.companyRole||req?.auth?.role||"").trim().toUpperCase();
  if(!["ADMIN","ADMINISTRATOR","BAULEITER"].includes(role)){
    return res.status(403).json({ok:false,error:"REPORT_APPROVAL_FORBIDDEN"});
  }
  return next();
}

const requireTagesberichtProjectAccess = async (req:any,res:any,next:any) => {
  const token=String(
    req.query?.projectId ||
    req.body?.projectId ||
    req.body?.projectCode ||
    ""
  ).trim();
  if(!token) return res.status(400).json({ok:false,error:"projectId required"});
  req.params=req.params||{};
  req.params.__tagesberichtProject=token;
  return requireProjectMember("__tagesberichtProject")(req,res,async (err?:any)=>{
    if(err) return next(err);

    const resolvedId=String(req.resolvedProjectId||token).trim();
    const resolvedCode=String(req.resolvedProjectCode||"").trim();

    if(resolvedCode && resolvedCode !== resolvedId){
      try{
        const duplicates=await prisma.project.count({where:{code:resolvedCode}});
        if(duplicates===1){
          const legacyRoot=path.join(PROJECTS_ROOT,resolvedCode);
          const canonicalRoot=path.join(PROJECTS_ROOT,resolvedId);
          for(const parts of [["eingangspruefung","tagesbericht"],["tagesbericht"]]){
            const src=path.join(legacyRoot,...parts);
            const dst=path.join(canonicalRoot,...parts);
            if(fs.existsSync(src)&&!fs.existsSync(dst)){
              fs.mkdirSync(path.dirname(dst),{recursive:true});
              fs.cpSync(src,dst,{recursive:true});
            }
          }
        }
      }catch(migrationError){
        console.error("[tagesbericht] legacy tenant migration failed",migrationError);
      }
    }

    if(req.body && typeof req.body==="object"){
      req.body.projectId=resolvedId;
      if(resolvedCode) req.body.projectCode=resolvedCode;
    }
    try{
      if(req.query && typeof req.query==="object"){
        req.query.projectId=resolvedId;
        if(resolvedCode) req.query.projectCode=resolvedCode;
      }
    }catch{}

    return next();
  });
};
console.log("[tagesbericht] router loaded");

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeFsKey(input: string) {
  return String(input || "")
    .trim()
    .replace(/[^A-Za-z0-9_\-]/g, "_")
    .slice(0, 120);
}

function safeDate(value?: string) {
  const raw = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? raw
    : new Date().toISOString().slice(0, 10);
}

function safeName(value: string) {
  return String(value || "")
    .replace(/[^A-Za-z0-9_.\-]/g, "_")
    .slice(0, 140);
}

function readJson<T>(p: string, fallback: T): T {
  try {
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(p: string, obj: unknown) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
}

function rid() {
  return `tb_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function projectRoot(fsKey: string) {
  return path.join(PROJECTS_ROOT, fsKey);
}

function inboxDir(fsKey: string) {
  return path.join(projectRoot(fsKey), "eingangspruefung", "tagesbericht");
}

function officialDir(fsKey: string) {
  return path.join(projectRoot(fsKey), "tagesbericht");
}

function bautagebuchFinalDir(fsKey: string) {
  return path.join(officialDir(fsKey), "bautagebuch", "final");
}
function sha256File(file: string) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}
function sha256Json(value: any) {
  return crypto.createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}
function monthPattern(value: any) {
  const month = String(value || "").trim();
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  return month;
}
function approvedTagesberichteForMonth(fsKey: string, month: string) {
  const dir = officialDir(fsKey);
  ensureDir(dir);
  return fs.readdirSync(dir)
    .filter((name) => new RegExp(`^Tagesbericht_${month}-\\d{2}_\\d+\\.json$`, "i").test(name))
    .map((name) => {const raw=readJson<any>(path.join(dir,name),null);return {name,file:path.join(dir,name),data:raw?normalizeDiaryReport(raw,name):null};})
    .filter((x) => x.data && String(x.data.workflowStatus || "").toUpperCase() === "FREIGEGEBEN")
    .sort((a,b) => String(a.data.date||"").localeCompare(String(b.data.date||"")) || a.name.localeCompare(b.name));
}

function nextOfficialNames(fsKey: string, date: string) {
  const dir = officialDir(fsKey);
  ensureDir(dir);
  const prefix = `Tagesbericht_${safeDate(date)}`;
  const numbers = fs
    .readdirSync(dir)
    .map((name) => name.match(new RegExp(`^${prefix}_(\\d+)\\.json$`, "i"))?.[1])
    .filter(Boolean)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  const number = String((numbers.length ? Math.max(...numbers) : 0) + 1).padStart(3, "0");
  return {
    reportId: number,
    jsonName: `${prefix}_${number}.json`,
    pdfName: `${prefix}_${number}.pdf`,
  };
}

const Schema = z
  .object({
    id: z.string().optional(),
    projectId: z.string().min(1),
    projectCode: z.string().optional(),
    projectName: z.string().optional(),
    projectTitle: z.string().optional(),
    date: z.string().optional(),
    weather: z.string().optional(),
    temperature: z.string().optional(),
    workers: z.string().optional(),
    mitarbeiter: z.string().optional(),
    machines: z.string().optional(),
    maschinen: z.string().optional(),
    materials: z.string().optional(),
    materialien: z.string().optional(),
    workDone: z.string().optional(),
    taetigkeiten: z.string().optional(),
    issues: z.string().optional(),
    vorkommnisse: z.string().optional(),
    notes: z.string().optional(),
    bemerkungen: z.string().optional(),
    attachments: z.array(z.any()).optional(),
    photos: z.array(z.any()).optional(),
    files: z.array(z.any()).optional(),
    createdAt: z.number().optional(),
  })
  .passthrough();

function pdfInput(opts: {
  pdfPath: string;
  fsKey: string;
  source: any;
  company?: any;
}) {
  const source = opts.source || {};
  return {
    pdfPath: opts.pdfPath,
    projectId: opts.fsKey,
    projectName: String(
      source.projectName || source.projectTitle || source.baustelle || opts.fsKey
    ),
    date: safeDate(source.date),
    weather: String(source.weather || source.wetter || ""),
    temperature: String(source.temperature || source.temperatur || ""),
    workers: String(source.workers || source.mitarbeiter || ""),
    machines: String(source.machines || source.maschinen || ""),
    materials: String(source.materials || source.materialien || ""),
    workDone: String(source.workDone || source.taetigkeiten || source.arbeiten || ""),
    issues: String(source.issues || source.vorkommnisse || source.stoerungen || ""),
    notes: String(source.notes || source.bemerkungen || source.comment || ""),
    attachments: [
      ...(Array.isArray(source.attachments) ? source.attachments : []),
      ...(Array.isArray(source.photos) ? source.photos : []),
      ...(Array.isArray(source.files) ? source.files : []),
    ],
    company: opts.company || source.company || source.meta?.company || undefined,
  };
}

router.post(
  "/",
  requireAuth,
  requireMode("SERVER_SYNC"),
  requireEmailVerified,
  requireTagesberichtProjectAccess,
  async (req, res) => {
    try {
      const body = Schema.parse(req.body);
      const fsKey = safeFsKey(String(body.projectId || body.projectCode || ""));
      const dir = inboxDir(fsKey);
      ensureDir(dir);
      const id = body.id || rid();
      const payload = {
        ...body,
        id,
        projectFsKey: fsKey,
        workflowStatus: "EINGEREICHT",
        reportType: "TAGESBERICHT",
        submittedAt: Date.now(),
      };
      writeJson(path.join(dir, `${safeName(id)}.json`), payload);
      await recordProjectSubmission(req, {
        projectToken: body.projectId,
        source: "MOBILE",
        kind: "TAGESBERICHT",
        entityId: id,
        title: `Tagesbericht ${String(body.date || "").slice(0, 10)}`,
        meta: {
          projectCode: body.projectCode || fsKey,
          reportType: payload.reportType,
          workflowStatus: payload.workflowStatus,
        },
      });
      return res.json({ ok: true, id, snapshot: payload });
    } catch (e: any) {
      console.error("tagesbericht submit failed:", e);
      return res.status(500).json({ ok: false, error: e?.message || "Submit failed" });
    }
  }
);

router.get(
  "/inbox/list",
  requireAuth,
  requireMode("SERVER_SYNC"),
  requireEmailVerified,
  requireTagesberichtProjectAccess,
  async (req, res) => {
    try {
      const fsKey = safeFsKey(String(req.query.projectId || ""));
      const dir = inboxDir(fsKey);
      ensureDir(dir);
      const items = fs
        .readdirSync(dir)
        .filter((file) => file.endsWith(".json"))
        .map((file) => readJson<any>(path.join(dir, file), null))
        .filter(Boolean)
        .sort((a, b) => Number(b?.submittedAt || 0) - Number(a?.submittedAt || 0));
      return res.json({ ok: true, items });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e?.message || "List failed" });
    }
  }
);

router.get(
  "/inbox/read",
  requireAuth,
  requireMode("SERVER_SYNC"),
  requireEmailVerified,
  requireTagesberichtProjectAccess,
  async (req, res) => {
    const fsKey = safeFsKey(String(req.query.projectId || ""));
    const docId = safeName(String(req.query.docId || ""));
    const p = path.join(inboxDir(fsKey), `${docId}.json`);
    if (!fs.existsSync(p)) return res.status(404).json({ ok: false, error: "Not Found" });
    return res.json({ ok: true, snapshot: readJson(p, null) });
  }
);

router.post(
  "/inbox/update",
  requireAuth,
  requireMode("SERVER_SYNC"),
  requireEmailVerified,
  requireTagesberichtProjectAccess,
  async (req, res) => {
    try {
      const projectId = String(req.body?.projectId || req.body?.projectCode || "").trim();
      const docId = safeName(String(req.body?.docId || req.body?.id || ""));
      if (!projectId || !docId) {
        return res.status(400).json({ ok: false, error: "projectId/docId required" });
      }
      const fsKey = safeFsKey(projectId);
      const p = path.join(inboxDir(fsKey), `${docId}.json`);
      const previous = readJson<any>(p, null);
      if (!previous) return res.status(404).json({ ok: false, error: "Not Found" });
      const next = {
        ...previous,
        ...req.body,
        id: docId,
        projectFsKey: fsKey,
        updatedAt: Date.now(),
      };
      writeJson(p, next);
      return res.json({ ok: true, snapshot: next });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e?.message || "Update failed" });
    }
  }
);

router.post(
  "/preview",
  requireAuth,
  requireMode("SERVER_SYNC"),
  requireEmailVerified,
  requireTagesberichtProjectAccess,
  async (req, res) => {
    try {
      const projectId = String(req.body?.projectId || req.body?.projectCode || "").trim();
      if (!projectId) return res.status(400).json({ ok: false, error: "projectId required" });
      const fsKey = safeFsKey(projectId);
      const dir = path.join(officialDir(fsKey), "preview");
      ensureDir(dir);
      const date = safeDate(req.body?.date);
      const pdfPath = path.join(dir, `Tagesbericht_Vorschau_${date}_${Date.now()}.pdf`);
      const company = await loadRlcPdfCompanyFromRequest(req);
      const result = await createTagesberichtPdf(pdfInput({ pdfPath, fsKey, source: req.body, company }));
      return res.json({ ok: true, ...result });
    } catch (e: any) {
      console.error("POST /api/tagesbericht/preview failed:", e);
      return res.status(500).json({ ok: false, error: e?.message || "PDF preview failed" });
    }
  }
);

router.get(
  "/bautagebuch/final-status",
  requireAuth,
  requireMode("SERVER_SYNC"),
  requireEmailVerified,
  requireTagesberichtProjectAccess,
  async (req, res) => {
    const projectId = String(req.query.projectId || "").trim();
    const month = monthPattern(req.query.month);
    if (!projectId || !month) return res.status(400).json({ ok:false, error:"projectId/month required (YYYY-MM)" });
    const fsKey = safeFsKey(projectId);
    const manifestPath = path.join(bautagebuchFinalDir(fsKey), `Bautagebuch_${month}.manifest.json`);
    const manifest = readJson<any>(manifestPath, null);
    return res.json({ ok:true, finalized:Boolean(manifest), manifest });
  }
);

router.post(
  "/bautagebuch/finalize",
  requireAuth,
  requireReportApprovalRole,
  requireMode("SERVER_SYNC"),
  requireEmailVerified,
  requireTagesberichtProjectAccess,
  async (req:any, res) => {
    try {
      const projectId = String(req.body?.projectId || req.body?.projectCode || "").trim();
      const month = monthPattern(req.body?.month);
      if (!projectId || !month) return res.status(400).json({ ok:false, error:"projectId/month required (YYYY-MM)" });
      const fsKey = safeFsKey(projectId);
      const finalDir = bautagebuchFinalDir(fsKey);
      ensureDir(finalDir);
      const manifestName = `Bautagebuch_${month}.manifest.json`;
      const manifestPath = path.join(finalDir, manifestName);
      if (fs.existsSync(manifestPath)) {
        return res.status(409).json({ ok:false, error:"BAUTAGEBUCH_ALREADY_FINALIZED", manifest:readJson(manifestPath,null) });
      }
      const approved = approvedTagesberichteForMonth(fsKey, month);
      if (!approved.length) return res.status(422).json({ ok:false, error:"NO_APPROVED_TAGESBERICHTE_FOR_MONTH" });
      const pdfName = `Bautagebuch_${month}_FINAL.pdf`;
      const pdfPath = path.join(finalDir, pdfName);
      const company = await loadRlcPdfCompanyFromRequest(req);
      const pdfResult = await createBautagebuchPdf({
        pdfPath,
        projectId: fsKey,
        projectName: String(req.body?.projectName || req.body?.projectTitle || fsKey),
        period: month,
        reports: approved.map((x) => x.data),
        company,
      });
      const approvedBy = String(req.auth?.email || req.auth?.sub || req.auth?.userId || "").trim() || null;
      const reportRefs = approved.map((x) => ({
        fileName:x.name,
        reportId:String(x.data?.reportId || x.data?.id || ""),
        date:String(x.data?.date || "").slice(0,10),
        approvedAt:x.data?.approvedAt || null,
        approvedBy:x.data?.approvedBy || null,
        sha256:sha256File(x.file),
      }));
      const snapshot = { projectId:fsKey, month, reports:reportRefs };
      const finalizedAt = new Date().toISOString();
      const manifest:any = {
        documentType:"BAUTAGEBUCH_FINAL",
        projectId:fsKey,
        month,
        reportCount:reportRefs.length,
        reports:reportRefs,
        snapshotHash:sha256Json(snapshot),
        pdfFileName:pdfName,
        pdfSha256:sha256File(pdfPath),
        finalizedAt,
        finalizedBy:approvedBy,
        evidenceLocked:true,
        lockReason:"Bautagebuch Monatsabschluss – nur freigegebene Tagesberichte",
      };
      writeJson(manifestPath, manifest);
      await archiveProjectFileVersion({ projectIdOrCode:projectId, filename:pdfName, kind:"PDF", localPath:pdfPath, uploadedBy:approvedBy, meta:{source:"bautagebuch-final",month,evidenceLocked:true,evidenceHash:manifest.pdfSha256,reportCount:reportRefs.length} });
      await archiveProjectFileVersion({ projectIdOrCode:projectId, filename:manifestName, kind:"DOC", localPath:manifestPath, uploadedBy:approvedBy, meta:{source:"bautagebuch-final-manifest",month,evidenceLocked:true,evidenceHash:manifest.snapshotHash,reportCount:reportRefs.length} });
      return res.json({ ok:true, manifest, pdfUrl:pdfResult.pdfUrl, fileName:pdfName });
    } catch (e:any) {
      console.error("POST /api/tagesbericht/bautagebuch/finalize failed:", e);
      return res.status(500).json({ok:false,error:e?.message || "Bautagebuch finalize failed"});
    }
  }
);

router.post(
  "/bautagebuch/preview",
  requireAuth,
  requireMode("SERVER_SYNC"),
  requireEmailVerified,
  requireTagesberichtProjectAccess,
  async (req, res) => {
    try {
      const projectId = String(
        req.body?.projectId || req.body?.projectCode || ""
      ).trim();
      const reports = Array.isArray(req.body?.reports)
        ? req.body.reports
        : [];

      if (!projectId) {
        return res.status(400).json({
          ok: false,
          error: "projectId required",
        });
      }

      if (!reports.length) {
        return res.status(400).json({
          ok: false,
          error: "reports required",
        });
      }

      const fsKey = safeFsKey(projectId);
      const dir = path.join(
        officialDir(fsKey),
        "bautagebuch",
        "preview",
      );

      ensureDir(dir);

      const dates = reports
        .map((report: any) =>
          safeDate(report?.date || report?.datum),
        )
        .sort();

      const lastDate =
        dates[dates.length - 1] ||
        new Date().toISOString().slice(0, 10);

      const period = String(
        req.body?.month || req.body?.period || "",
      ).trim();

      const safePeriod = safeName(period || lastDate);
      const pdfPath = path.join(
        dir,
        `Bautagebuch_${safePeriod}_${Date.now()}.pdf`,
      );

      const company = await loadRlcPdfCompanyFromRequest(req);

      const result = await createBautagebuchPdf({
        pdfPath,
        projectId: fsKey,
        projectName: String(
          req.body?.projectName ||
            req.body?.projectTitle ||
            fsKey,
        ),
        period,
        reports,
        company,
      });

      return res.json({ ok: true, ...result });
    } catch (e: any) {
      console.error(
        "POST /api/tagesbericht/bautagebuch/preview failed:",
        e,
      );

      return res.status(500).json({
        ok: false,
        error:
          e?.message ||
          "Bautagebuch PDF preview failed",
      });
    }
  },
);

router.post(
  "/inbox/approve",
  requireAuth,
  requireReportApprovalRole,
  requireMode("SERVER_SYNC"),
  requireEmailVerified,
  requireTagesberichtProjectAccess,
  async (req, res) => {
    try {
      const projectId = String(req.body?.projectId || req.body?.projectCode || "").trim();
      const docId = safeName(String(req.body?.docId || req.body?.id || ""));
      if (!projectId || !docId) {
        return res.status(400).json({ ok: false, error: "projectId/docId required" });
      }
      const fsKey = safeFsKey(projectId);
      const src = path.join(inboxDir(fsKey), `${docId}.json`);
      if (!fs.existsSync(src)) return res.status(404).json({ ok: false, error: "Not Found" });
      const source = readJson<any>(src, null);
      if (!source) return res.status(500).json({ ok: false, error: "Invalid JSON" });

      const date = safeDate(source.date);
      const names = nextOfficialNames(fsKey, date);
      const jsonPath = path.join(officialDir(fsKey), names.jsonName);
      const pdfPath = path.join(officialDir(fsKey), names.pdfName);
      const company = await loadRlcPdfCompanyFromRequest(req);
      const pdfResult = await createTagesberichtPdf(pdfInput({ pdfPath, fsKey, source, company }));
      const approvedAt = Date.now();
      const officialBase = {
        ...source,
        sourceDocId: docId,
        projectCode: fsKey,
        projectFsKey: fsKey,
        date,
        reportId: names.reportId,
        workflowStatus: "FREIGEGEBEN",
        approvedAt,
        approvedBy: String((req as any)?.auth?.email || (req as any)?.auth?.sub || (req as any)?.auth?.userId || "").trim() || null,
        pdfUrl: pdfResult.pdfUrl,
        pdfFileName: pdfResult.fileName,
      };
      const evidenceHash = crypto.createHash("sha256").update(JSON.stringify(officialBase), "utf8").digest("hex");
      const official = {
        ...officialBase,
        evidenceLock: {
          hash: evidenceHash,
          lockedAt: new Date(approvedAt).toISOString(),
          reason: "Tagesbericht freigegeben – Original unveränderlich",
        },
      };
      writeJson(jsonPath, official);

      await archiveProjectFileVersion({
        projectIdOrCode: projectId,
        filename: names.jsonName,
        kind: "DOC",
        localPath: jsonPath,
        uploadedBy: official.approvedBy,
        meta: {
          source: "tagesbericht",
          reportId: names.reportId,
          date,
          evidenceLocked: true,
          evidenceHash
        }
      });

      await archiveProjectFileVersion({
        projectIdOrCode: projectId,
        filename: names.pdfName,
        kind: "PDF",
        localPath: pdfPath,
        uploadedBy: official.approvedBy,
        meta: {
          source: "tagesbericht",
          reportId: names.reportId,
          date,
          evidenceLocked: true,
          evidenceHash
        }
      });

      fs.unlinkSync(src);
      return res.json({
        ok: true,
        docId,
        reportId: names.reportId,
        filename: names.jsonName,
        pdfUrl: pdfResult.pdfUrl,
      });
    } catch (e: any) {
      console.error("POST /api/tagesbericht/inbox/approve failed:", e);
      return res.status(500).json({ ok: false, error: e?.message || "Approve failed" });
    }
  }
);

router.post(
  "/inbox/reject",
  requireAuth,
  requireReportApprovalRole,
  requireMode("SERVER_SYNC"),
  requireEmailVerified,
  requireTagesberichtProjectAccess,
  async (req, res) => {
    const projectId = String(req.body?.projectId || req.body?.projectCode || "").trim();
    const docId = safeName(String(req.body?.docId || req.body?.id || ""));
    const fsKey = safeFsKey(projectId);
    const p = path.join(inboxDir(fsKey), `${docId}.json`);
    const obj = readJson<any>(p, null);
    if (!obj) return res.status(404).json({ ok: false, error: "Not Found" });
    const next = {
      ...obj,
      workflowStatus: "ABGELEHNT",
      rejectionReason: String(req.body?.reason || "").trim(),
      rejectedAt: Date.now(),
    };
    writeJson(p, next);
    return res.json({ ok: true, snapshot: next });
  }
);

router.get(
  "/list",
  requireAuth,
  requireMode("SERVER_SYNC"),
  requireEmailVerified,
  requireTagesberichtProjectAccess,
  async (req, res) => {
    try {
    const fsKey = safeFsKey(String(req.query.projectId || ""));
    const dir = officialDir(fsKey);
    ensureDir(dir);
    const items = fs
      .readdirSync(dir)
      .filter((file) => /^Tagesbericht_.*\.json$/i.test(file))
      .map((file) => {
        const source=path.join(dir,file);
        if(fs.lstatSync(source).isSymbolicLink()||fs.statSync(source).size>10*1024*1024)throw new Error('REPORT_SOURCE_UNAVAILABLE');
        const data=JSON.parse(fs.readFileSync(source,'utf8'));
        if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('REPORT_SOURCE_INVALID');
        return {...data,filename:file};
      })
      .filter(Boolean)
      .sort((a: any, b: any) => Number(b?.approvedAt || 0) - Number(a?.approvedAt || 0));
    return res.json({ ok: true, items });
    }catch(e:any){console.error("Approved report list failed",e?.name);return res.status(503).json({ok:false,error:"Freigegebene Berichte derzeit nicht verfügbar. Quellen prüfen."});}
  }
);

router.get(
  "/read",
  requireAuth,
  requireMode("SERVER_SYNC"),
  requireEmailVerified,
  requireTagesberichtProjectAccess,
  async (req, res) => {
    const fsKey = safeFsKey(String(req.query.projectId || ""));
    const filename = path.basename(String(req.query.filename || ""));
    const p = path.join(officialDir(fsKey), filename);
    if (!filename || !fs.existsSync(p)) return res.status(404).json({ ok: false, error: "Not Found" });
    return res.json({ ok: true, snapshot: readJson(p, null) });
  }
);

export default router;
