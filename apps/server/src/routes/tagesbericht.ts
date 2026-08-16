// apps/server/src/routes/tagesbericht.ts
import { Router } from "express";
import path from "path";
import fs from "fs";
import { z } from "zod";
import { PROJECTS_ROOT } from "../lib/projectsRoot";
import { recordProjectSubmission } from "../lib/projectSubmission";
import { createTagesberichtPdf } from "../services/pdf/tagesberichtPdf";
import { createBautagebuchPdf } from "../services/pdf/bautagebuchPdf";
import { loadRlcPdfCompanyFromRequest } from "../services/pdf/pdfCompanyContext";

import {
  requireAuth,
  requireMode,
  requireEmailVerified,
} from "../middleware/requireAuth";

const router = Router();
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
  async (req, res) => {
    try {
      const body = Schema.parse(req.body);
      const fsKey = safeFsKey(body.projectCode || body.projectId);
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

router.post(
  "/bautagebuch/preview",
  requireAuth,
  requireMode("SERVER_SYNC"),
  requireEmailVerified,
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
  requireMode("SERVER_SYNC"),
  requireEmailVerified,
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
      const official = {
        ...source,
        sourceDocId: docId,
        projectCode: fsKey,
        projectFsKey: fsKey,
        date,
        reportId: names.reportId,
        workflowStatus: "FREIGEGEBEN",
        approvedAt: Date.now(),
        approvedBy: String(req.body?.approvedBy || "").trim() || null,
        pdfUrl: pdfResult.pdfUrl,
        pdfFileName: pdfResult.fileName,
      };
      writeJson(jsonPath, official);
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
  requireMode("SERVER_SYNC"),
  requireEmailVerified,
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
  async (req, res) => {
    const fsKey = safeFsKey(String(req.query.projectId || ""));
    const dir = officialDir(fsKey);
    ensureDir(dir);
    const items = fs
      .readdirSync(dir)
      .filter((file) => /^Tagesbericht_.*\.json$/i.test(file))
      .map((file) => {
        const data = readJson<any>(path.join(dir, file), null);
        return data ? { ...data, filename: file } : null;
      })
      .filter(Boolean)
      .sort((a: any, b: any) => Number(b?.approvedAt || 0) - Number(a?.approvedAt || 0));
    return res.json({ ok: true, items });
  }
);

router.get(
  "/read",
  requireAuth,
  requireMode("SERVER_SYNC"),
  requireEmailVerified,
  async (req, res) => {
    const fsKey = safeFsKey(String(req.query.projectId || ""));
    const filename = path.basename(String(req.query.filename || ""));
    const p = path.join(officialDir(fsKey), filename);
    if (!filename || !fs.existsSync(p)) return res.status(404).json({ ok: false, error: "Not Found" });
    return res.json({ ok: true, snapshot: readJson(p, null) });
  }
);

export default router;
