// apps/server/src/index.ts
import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import mime from "mime-types";
import { prisma } from "./lib/prisma";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { PROJECTS_ROOT } from "./lib/projectsRoot";
import { COMPANIES_ROOT } from "./lib/companiesRoot"; // ✅ NEW (company logo/header storage root)

// ✅ MAILER VERIFY (punto 2)
import { verifyMailerOnce } from "./lib/mailer";

/* ---- ROUTES (base) ---- */
import aufmassRoutes from "./routes/aufmass";
import importRoutes from "./routes/import";
import gpsRoutes from "./routes/gps";
import supportChatRoutes from "./routes/support.chat";

/* ---- ROUTES (auth + core) ---- */
import authRoutes from "./routes/auth.routes";
import mailRoutes from "./routes/mail.routes";
import openaiRoutes from "./routes/openai.routes";
import whoamiRoutes from "./routes/whoami";

/* ---- ROUTES (domain) ---- */
import gaebRoutes from "./routes/gaeb.routes";
import versionsvergleichRoutes from "./routes/versionsvergleich";
import kiRoutes from "./routes/ki";
import abrechnungRoutes from "./routes/abrechnung";
import buchhaltungRoutes from "./routes/buchhaltung";
import pdfRoutes from "./routes/pdf";
import lookupRoutes from "./routes/lookup";

import optimierungRoutes from "./routes/ki/optimierung";
import maengelRoutes from "./routes/ki/maengel";
import bauzeitenplanRoutes from "./routes/buero/bauzeitenplan";

import verknuepfungRoutes from "./routes/verknuepfung";
import pdfNachtraegeRoutes from "./routes/pdfNachtraege";
import abschlagRoutes from "./routes/abschlag";
import historieRoutes from "./routes/historie";

import projectsRoutes from "./routes/projects";
import lvRoutes from "./routes/lv";
import projectLvRoutes from "./routes/projectLv";

import fileRoutes from "./routes/files";
import filesStaticRoutes from "./routes/filesStatic";

import regieRoutes from "./routes/regie";
import lsRoutes from "./routes/ls";
import fotosRoutes from "./routes/fotos";
import inboxRouter from "./routes/inbox";
import photosRouter from "./routes/photos"; // legacy (lo teniamo come /api/photos-legacy)
import regiePdfRoutes from "./routes/regiePdf";

import sollistRoutes from "./routes/sollist";

import cadRoutes from "./routes/cad";
import cadTakeoffRoutes from "./routes/cad.takeoff";
import bricscadRoutes from "./routes/bricscad";
import autoKiRouter from "./routes/autoKi";

import kalkulationRecipesRoutes from "./routes/kalkulation.recipes";
import kalkulationVariantsRoutes from "./routes/kalkulation.variants";
import companyPricesRouter from "./routes/companyPrices";
import kalkulationKiHandoffRoutes from "./routes/kalkulationKiHandoff";
import adminAuthRoutes from "./routes/admin.auth";

import { requireAuth, requireVerifiedEmail } from "./middleware/auth";

/* ✅ LICENSE (Server Upgrade) */
import { requireServerLicense } from "./middleware/license";
import licenseRoutes from "./routes/license";

/* ✅ COMPANY + SUBSCRIPTION (blocco totale) */
import { requireCompany, requireActiveSubscription } from "./middleware/guards";
import companyInvitesRoutes from "./routes/company.invites";
import companyAdminRoutes from "./routes/company.admin";
import kiLs from "./routes/ki.lieferschein";
import kiDebug from "./routes/ki.debug";

/* ======================= CRASH SHIELD (NO BREAKING CHANGES) ======================= */
const DEBUG_MEMORY = (process.env.DEBUG_MEMORY || "").toLowerCase() === "on";

function fmtMB(n: number) {
  return `${Math.round((n / 1024 / 1024) * 10) / 10}MB`;
}
function memSnapshot() {
  const m = process.memoryUsage();
  return {
    rss: fmtMB(m.rss),
    heapTotal: fmtMB(m.heapTotal),
    heapUsed: fmtMB(m.heapUsed),
    external: fmtMB(m.external),
  };
}

process.on("unhandledRejection", (reason: any) => {
  console.error("❌ unhandledRejection:", reason);
  if (DEBUG_MEMORY) console.error("   mem:", memSnapshot());
});

process.on("uncaughtException", (err: any) => {
  console.error("❌ uncaughtException:", err);
  if (DEBUG_MEMORY) console.error("   mem:", memSnapshot());
});

process.on("warning", (w: any) => {
  console.warn("⚠️ process warning:", w?.message || w);
  if (DEBUG_MEMORY) console.warn("   mem:", memSnapshot());
});

if (DEBUG_MEMORY) {
  setInterval(() => {
    console.log("🧠 mem:", memSnapshot());
  }, 30_000).unref?.();
}
/* ======================= /CRASH SHIELD ======================= */

function requestId() {
  return (req: any, res: any, next: any) => {
    const id =
      globalThis.crypto && "randomUUID" in globalThis.crypto
        ? (globalThis.crypto as any).randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    req.id = id;
    res.setHeader("X-Request-Id", id);
    next();
  };
}

const app = express();
const PORT = Number(process.env.PORT || 4000);

/* ======================= MINI DEBUG ENV (non-breaking) ======================= */
const __devAuthOn = (process.env.DEV_AUTH || "").toLowerCase() === "on";
const __devCompanyIdEffective =
  (process.env.DEV_COMPANY_ID || "").trim() || "dev-company";
console.log("[ENV] PORT=", PORT);
console.log("[ENV] DEV_AUTH=", __devAuthOn ? "on" : "off");
console.log("[ENV] DEV_COMPANY_ID=", __devCompanyIdEffective);
/* ======================= /MINI DEBUG ENV ======================= */

async function ensureDevCompany() {
  const devOn = (process.env.DEV_AUTH || "").toLowerCase() === "on";
  const companyId = (process.env.DEV_COMPANY_ID || "").trim() || "dev-company";
  if (!devOn) return;

  try {
    await prisma.company.upsert({
      where: { id: companyId },
      update: { name: "DEV COMPANY" },
      create: { id: companyId, name: "DEV COMPANY", code: "DEV" },
    });

    console.log(`👤 DEV company ready: ${companyId}`);
  } catch (e: any) {
    console.warn(
      "⚠️  DEV company upsert skipped (DB non raggiungibile). Il server continua in modalità file-based.\n" +
        (e?.message || e)
    );
  }
}

/* ======================= Projects Root (FS) ======================= */
fs.mkdirSync(PROJECTS_ROOT, { recursive: true });
fs.mkdirSync(COMPANIES_ROOT, { recursive: true }); // ✅ NEW: ensure company storage root exists

/* ======================= Core Middleware ======================= */
app.set("trust proxy", 1);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(compression());
app.use(requestId());
app.use(morgan("combined"));

const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const maxReq = Number(process.env.RATE_LIMIT_MAX || 600);
app.use(
  rateLimit({
    windowMs,
    max: maxReq,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

/* ----------------------- CORS ----------------------- */
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN?.trim();
const ORIGIN_RE = [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/];

app.use(
  cors({
    origin: (
      origin: string | undefined,
      cb: (err: Error | null, allow?: boolean) => void
    ) => {
      if (!origin) return cb(null, true);
      if (FRONTEND_ORIGIN && origin === FRONTEND_ORIGIN) return cb(null, true);
      if (ORIGIN_RE.some((r) => r.test(origin))) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "X-Request-Id",
      "x-company-id",
      "x-pricing-date",
      "X-App-Version",
      "X-App-Build",
    ],
    exposedHeaders: ["Content-Disposition", "X-Request-Id"],
    maxAge: 86400,
  })
);

// ✅ preflight
app.options(/.*/, cors());

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

/* ======================= Project PDFs (mobile) ======================= */
function isSafeFsKey(x: string) {
  return /^[A-Za-z0-9_\-]{1,120}$/.test(x);
}

function collectPdfFiles(rootAbs: string) {
  const items: Array<{ name: string; rel: string; folder: string; mtime: string }> =
    [];

  const EXCLUDE_DIRS = new Set([
    "_staging",
    "raw",
    "inbox",
    "photos", // se vuoi includere pdf anche lì, togli questa riga
  ]);

  function walk(dirAbs: string, depth: number) {
    if (depth > 4) return;
    if (!fs.existsSync(dirAbs)) return;

    const entries = fs.readdirSync(dirAbs, { withFileTypes: true });
    for (const e of entries) {
      const abs = path.join(dirAbs, e.name);

      if (e.isDirectory()) {
        if (EXCLUDE_DIRS.has(e.name)) continue;
        walk(abs, depth + 1);
        continue;
      }

      if (!e.isFile()) continue;
      if (!e.name.toLowerCase().endsWith(".pdf")) continue;

      const st = fs.statSync(abs);
      const rel = path.relative(rootAbs, abs).replace(/\\/g, "/");
      const folder = rel.includes("/") ? rel.split("/")[0] : "";
      items.push({
        name: e.name,
        rel,
        folder,
        mtime: st.mtime.toISOString(),
      });
    }
  }

  walk(rootAbs, 0);

  items.sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
  return items;
}

/* ======================= DEBUG MEMORY HEADER (optional) ======================= */
if (DEBUG_MEMORY) {
  app.use((req, res, next) => {
    const m = process.memoryUsage();
    res.setHeader(
      "X-Process-Mem",
      `rss=${m.rss};heapUsed=${m.heapUsed};heapTotal=${m.heapTotal};ext=${m.external}`
    );
    next();
  });
}
/* ======================= /DEBUG MEMORY HEADER ======================= */

/* ======================= DEV-AUTH (solo locale) ======================= */
app.use((req, _res, next) => {
  if ((process.env.DEV_AUTH || "").toLowerCase() === "on") {
    // @ts-ignore
    req.auth = {
      sub: "dev-user",
      role: "ADMIN",
      company: (process.env.DEV_COMPANY_ID || "").trim() || "dev-company",
    };

    (req as any).user = {
      id: "dev-user",
      email: "dev@rlc.local",
      mode: "SERVER_SYNC",
      emailVerifiedAt: new Date().toISOString(),
    };
  }
  next();
});

/* ======================= Static ======================= */
app.use("/projects", express.static(PROJECTS_ROOT, { fallthrough: true }));
app.use("/files", express.static(PROJECTS_ROOT, { fallthrough: true }));

/* ======================= Health / Debug ======================= */
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "rlc-api", ts: Date.now() });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "rlc-api", ts: Date.now(), alias: true });
});

app.get("/api/health/projects", (_req, res) => {
  res.json({
    ok: true,
    root: PROJECTS_ROOT,
    exists: fs.existsSync(PROJECTS_ROOT),
  });
});

app.get("/api/debug", (_req, res) => {
  res.json({
    ok: true,
    PROJECTS_ROOT,
    exists: fs.existsSync(PROJECTS_ROOT),
    cwd: process.cwd(),
    env_PROJECTS_ROOT: process.env.PROJECTS_ROOT ?? null,
    devAuth: (process.env.DEV_AUTH || "").toLowerCase() === "on",
    DEBUG_MEMORY,
    mem: DEBUG_MEMORY ? memSnapshot() : undefined,
  });
});

/* ======================= S3 / MinIO ======================= */
const S3_ENABLED = !!process.env.S3_ENDPOINT;
const S3_BUCKET = process.env.S3_BUCKET || "rlc-storage";
const s3 = S3_ENABLED
  ? new S3Client({
      region: process.env.S3_REGION || "eu-central-1",
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY || "minioadmin",
        secretAccessKey: process.env.S3_SECRET_KEY || "minioadmin",
      },
    })
  : null;

/* ======================= PROJEKTLISTE: DB → fallback FS ======================= */
function safeJsonParse<T>(buf: Buffer, fallback: T): T {
  try {
    return JSON.parse(buf.toString("utf8")) as T;
  } catch {
    return fallback;
  }
}

function listProjectsFromFs() {
  const out: any[] = [];
  if (!fs.existsSync(PROJECTS_ROOT)) return out;

  const entries = fs.readdirSync(PROJECTS_ROOT, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;

    const dir = path.join(PROJECTS_ROOT, e.name);
    const pj = path.join(dir, "project.json");
    if (!fs.existsSync(pj)) continue;

    const data = safeJsonParse<any>(fs.readFileSync(pj), null);
    if (!data) continue;

    const fsKey = e.name;

    const code = data.code || data.projektnummer || data.projectNumber || fsKey;
    const name = data.name || data.projektname || data.projectName || fsKey;

    const ort = data.place || data.ort || data.location || "";
    const kunde =
      data.client || data.kunde || data.customer || data.auftraggeber || "";

    out.push({
      id: fsKey,
      fsKey,
      dbId: data.id || null,
      code,
      name,
      number: data.number || data.baustellenNummer || null,
      ort,
      kunde,
      source: "FS",
    });
  }

  out.sort((a, b) => String(b.code).localeCompare(String(a.code)));
  return out;
}

/**
 * ✅ projects list
 */
app.get(
  "/api/projects",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  async (_req, res) => {
    const fsProjects = listProjectsFromFs();

    try {
      const devOn = (process.env.DEV_AUTH || "").toLowerCase() === "on";
      const companyId = devOn
        ? (process.env.DEV_COMPANY_ID || "").trim() || "dev-company"
        : null;
      const where = companyId ? { companyId } : {};

      const rows = await prisma.project.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 500,
        select: {
          id: true,
          code: true,
          name: true,
          number: true,
          client: true,
          place: true,
          createdAt: true,
        },
      });

      if (!rows || rows.length === 0) {
        if (fsProjects.length > 0) {
          return res.json({ ok: true, source: "FS", projects: fsProjects });
        }
        return res.json({ ok: true, source: "DB", projects: [] });
      }

      return res.json({
        ok: true,
        source: "DB",
        projects: rows.map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          number: p.number ?? null,
          ort: p.place || "",
          kunde: p.client || "",
        })),
      });
    } catch {
      return res.json({ ok: true, source: "FS", projects: fsProjects });
    }
  }
);

/**
 * ✅ Mobile: lista PDF presenti in data/projects/<fsKey>/...
 * GET /api/projects/:fsKey/pdfs
 */
app.get(
  "/api/projects/:fsKey/pdfs",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  async (req, res) => {
    try {
      const fsKey = String(req.params.fsKey || "").trim();
      if (!fsKey || !isSafeFsKey(fsKey)) {
        return res.status(400).json({ ok: false, error: "invalid fsKey" });
      }

      const rootAbs = path.join(PROJECTS_ROOT, fsKey);
      if (!fs.existsSync(rootAbs)) {
        return res.json({ ok: true, items: [] });
      }

      const files = collectPdfFiles(rootAbs);

      const items = files.map((f) => ({
        name: f.name,
        folder: f.folder || undefined,
        mtime: f.mtime,
        url: `/projects/${encodeURIComponent(fsKey)}/${f.rel
          .split("/")
          .map((p) => encodeURIComponent(p))
          .join("/")}`,
      }));

      return res.json({ ok: true, items });
    } catch (e: any) {
      console.error("GET /api/projects/:fsKey/pdfs failed:", e);
      return res.status(500).json({
        ok: false,
        error: e?.message || "pdf list failed",
      });
    }
  }
);

/* ======================= Projekt Bootstrap (DB) ======================= */
app.get(
  "/api/projects/:id/bootstrap",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  async (req, res) => {
    try {
      const projectId = String(req.params.id);
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: {
          id: true,
          name: true,
          code: true,
          documents: {
            where: { deletedAt: null },
            select: {
              id: true,
              name: true,
              kind: true,
              current: { select: { storageId: true, id: true } },
            },
          },
          lvSets: {
            orderBy: { version: "desc" },
            take: 1,
            select: {
              id: true,
              title: true,
              version: true,
              positions: {
                select: {
                  id: true,
                  position: true,
                  kurztext: true,
                  langtext: true,
                  einheit: true,
                  menge: true,
                  einzelpreis: true,
                  gesamt: true,
                },
              },
            },
          },
          measSets: {
            orderBy: { createdAt: "desc" },
            take: 5,
            select: {
              id: true,
              title: true,
              rows: {
                select: {
                  id: true,
                  source: true,
                  formula: true,
                  quantity: true,
                  unit: true,
                  context: true,
                  lvPositionId: true,
                },
              },
            },
          },
          accounting: {
            select: {
              invoices: {
                select: {
                  id: true,
                  number: true,
                  date: true,
                  netAmount: true,
                  status: true,
                },
              },
              vendorBills: {
                select: {
                  id: true,
                  number: true,
                  date: true,
                  netAmount: true,
                  status: true,
                },
              },
              payments: {
                select: {
                  id: true,
                  date: true,
                  amount: true,
                  direction: true,
                },
              },
            },
          },
          sectionStates: { select: { section: true, data: true } },
        },
      });

      if (!project)
        return res.status(404).json({ error: "Projekt nicht gefunden" });

      const filesByKind: Record<string, any[]> = {};
      for (const d of project.documents) {
        (filesByKind[d.kind] ||= []).push({
          id: d.id,
          name: d.name,
          kind: d.kind,
          storage: d.current?.storageId ? { key: d.current.storageId } : null,
        });
      }

      res.json({
        ok: true,
        project: { id: project.id, name: project.name, code: project.code },
        filesByKind,
        sections: {
          KALKULATION: {
            lv: project.lvSets.map((s) => ({
              id: s.id,
              title: s.title,
              version: s.version,
              items: s.positions,
            })),
          },
          MASSENERMITTLUNG: {
            meas: project.measSets.map((ms) => ({
              id: ms.id,
              title: ms.title,
              rows: ms.rows,
            })),
          },
          CAD: { cadFiles: filesByKind["CAD"] || [] },
          BUERO: {
            docs: [...(filesByKind["PDF"] || []), ...(filesByKind["DOC"] || [])],
          },
          KI: {},
          INFO: {},
          BUCHHALTUNG: {
            invoices: project.accounting?.invoices ?? [],
            vendorBills: project.accounting?.vendorBills ?? [],
            payments: project.accounting?.payments ?? [],
          },
        },
        states: project.sectionStates.map((s) => ({
          section: s.section,
          data: s.data,
        })),
      });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e?.message || "Bootstrap fehlgeschlagen" });
    }
  }
);

/* ======================= Presigned URL (S3/FS) ======================= */
app.get(
  "/api/:projectId/documents/:docId/url",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  async (req, res) => {
    try {
      const { projectId, docId } = req.params;
      const doc = await prisma.document.findFirst({
        where: { id: docId, projectId, deletedAt: null },
        select: {
          id: true,
          name: true,
          kind: true,
          current: { select: { storageId: true } },
        },
      });
      if (!doc?.current?.storageId)
        return res.status(404).json({ error: "Dokument nicht gefunden" });

      const storage = await prisma.storageObject.findUnique({
        where: { id: doc.current.storageId },
      });
      if (!storage)
        return res.status(404).json({ error: "Storage nicht gefunden" });

      const [bucket, ...keyParts] = storage.id.split("/");
      const keyFromId = keyParts.join("/");
      const key = storage.key || keyFromId;

      if (S3_ENABLED && s3 && bucket && key) {
        const cmd = new GetObjectCommand({
          Bucket: bucket,
          Key: key,
          ResponseContentType:
            storage.mime || mime.lookup(doc.name) || "application/octet-stream",
        });

        const url = await getSignedUrl(s3, cmd, { expiresIn: 60 * 15 });
        return res.json({ ok: true, url });
      }

      if (key.startsWith("projects/")) {
        const rel = key.substring("projects/".length);
        const localUrl = `/projects/${rel}`;
        return res.json({ ok: true, url: localUrl });
      }

      const normalized = key.replace(/^LOCAL\//, "");
      const localUrl = `/files/${normalized}`;
      return res.json({ ok: true, url: localUrl });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e?.message || "Presign fehlgeschlagen" });
    }
  }
);

/* ======================= Route Registration ======================= */
app.use("/api/aufmass", aufmassRoutes);
app.use("/api/import", importRoutes);
app.use("/api/gps", gpsRoutes);

/* auth */
app.use("/api/auth", adminAuthRoutes);
app.use("/api/auth", authRoutes);

/* whoami + license */
app.use("/api/whoami", requireAuth, whoamiRoutes);
app.use("/api/license", requireAuth, licenseRoutes);

/* mail (SERVER upgrade required + verified) */
app.use(
  "/api/mail",
  requireAuth,
  requireServerLicense(),
  requireVerifiedEmail,
  mailRoutes
);

app.use("/api/openai", openaiRoutes);

/* ✅ Tutto ciò che è "core app" va dietro Company + Abo */
app.use(
  "/api/gaeb",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  gaebRoutes
);
app.use(
  "/api/versionsvergleich",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  versionsvergleichRoutes
);
app.use(
  "/api/ki",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  kiRoutes
);

app.use(
  "/api/ki/optimierung",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  optimierungRoutes
);
app.use(
  "/api/ki/maengel",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  maengelRoutes
);

app.use(
  "/api/abrechnung",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  abrechnungRoutes
);
app.use(
  "/api/buchhaltung",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  buchhaltungRoutes
);
app.use(
  "/api/pdf",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  pdfRoutes
);

app.use(
  "/api/buero/bauzeitenplan",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  bauzeitenplanRoutes
);
app.use(
  "/api/lookup",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  lookupRoutes
);
app.use("/api/company", companyInvitesRoutes);
app.use("/api/company", companyAdminRoutes);

/* misc */
app.use(
  "/api",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  verknuepfungRoutes
);
app.use(
  "/api/pdf",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  pdfNachtraegeRoutes
);
app.use(
  "/api",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  abschlagRoutes
);
app.use(
  "/api",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  historieRoutes
);

/* CAD */
app.use(
  "/api/cad",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  cadRoutes
);
app.use(
  "/api/cad",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  cadTakeoffRoutes
);
app.use(
  "/api/bricscad",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  bricscadRoutes
);
app.use(
  "/api",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  autoKiRouter
);

/* inbox + workflows (SERVER upgrade required) */
app.use(
  "/api/inbox",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  requireServerLicense(),
  inboxRouter
);

/**
 * =========================================================
 * ✅ FIX CRITICO (FOTOS INBOX):
 * L'app chiama /api/photos/inbox/list ma i dati stanno in routes/fotos.ts
 * Quindi montiamo lo STESSO router anche su /api/photos.
 *
 * IMPORTANTE: /api/photos NON deve puntare al vecchio photosRouter,
 * altrimenti intercetta la request e restituisce 96/Not Found.
 * Per compatibilità teniamo il vecchio router come /api/photos-legacy.
 * =========================================================
 */
app.use(
  "/api/photos",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  requireServerLicense(),
  fotosRoutes // ✅ alias: /api/photos/inbox/list -> routes/fotos.ts
);
app.use(
  "/api/photos-legacy",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  requireServerLicense(),
  photosRouter
);

/**
 * ✅ Mobile chiama /api/fotos/...
 */
app.use(
  "/api/fotos",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  requireServerLicense(),
  fotosRoutes
);

/**
 * ✅ (compat) alcune vecchie chiamate potrebbero usare /api/... diretto
 */
app.use(
  "/api",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  requireServerLicense(),
  fotosRoutes
);

/* regie (SERVER upgrade required) */
app.use(
  "/api/regie",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  requireServerLicense(),
  regieRoutes
);
app.use(
  "/api/ki/regie",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  requireServerLicense(),
  regieRoutes
);

/* LS (SERVER upgrade required) */
app.use(
  "/api/ls",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  requireServerLicense(),
  lsRoutes
);

/* Regie-PDF (SERVER upgrade required) */
app.use(
  "/api",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  requireServerLicense(),
  regiePdfRoutes
);

/* Soll-Ist */
app.use(
  "/api/sollist",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  sollistRoutes
);

/* ✅ project-lv API */
app.use(
  "/api",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  projectLvRoutes
);

/* ✅ files API */
app.use(
  "/api/files",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  fileRoutes
);

/* support chat (SERVER upgrade required) */
app.use(
  "/api/support",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  requireServerLicense(),
  supportChatRoutes
);

/**
 * ✅ FIX CRITICO:
 * Prima projectsRoutes, poi lvRoutes (così /api/projects NON si rompe)
 */
app.use(
  "/api/projects",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  projectsRoutes
);
app.use(
  "/api/projects",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  lvRoutes
);

/* kalkulation */
app.use(
  "/api/kalkulation",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  kalkulationRecipesRoutes
);
app.use(
  "/api/kalkulation",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  kalkulationVariantsRoutes
);
app.use(
  "/api/company-prices",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  companyPricesRouter
);
app.use(
  "/api",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  kalkulationKiHandoffRoutes
);
app.use("/api/ki", kiLs);

/* static helper (extra) */
app.use("/files", filesStaticRoutes);
app.use(kiDebug);

/* ==== Alias/health per l’import ==== */
app.get("/api/import/_ping", (_req, res) => res.json({ ok: true }));
app.get("/api/import/_projects-check", async (_req, res) => {
  try {
    const devOn = (process.env.DEV_AUTH || "").toLowerCase() === "on";
    const companyId = devOn
      ? (process.env.DEV_COMPANY_ID || "").trim() || "dev-company"
      : undefined;
    const where = companyId ? { companyId } : {};

    const projects = await prisma.project.findMany({
      where,
      take: 5,
      orderBy: { createdAt: "desc" },
    });

    res.json({
      ok: true,
      count: projects.length,
      sample: projects.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
      })),
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "check failed" });
  }
});

/* ======================= 404 & Error Handler ======================= */
app.use((_req, res) => res.status(404).json({ error: "Not Found" }));
app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("❌ Unhandled Error:", err);
    if (DEBUG_MEMORY) console.error("   mem:", memSnapshot());
    res
      .status(500)
      .json({ error: "Internal Server Error", requestId: (req as any).id });
  }
);

/* ======================= START ======================= */
(async () => {
  try {
    await ensureDevCompany();

    // ✅ MAILER VERIFY (punto 2): logga subito se SMTP è rotto
    // Non blocca la partenza: se fallisce, stampa errore e continua.
    try {
      await verifyMailerOnce();
    } catch (e: any) {
      console.error(
        "⚠️ [startup] SMTP verify failed (server continues):",
        e?.message || e
      );
    }

    app.listen(PORT, () => {
      console.log(`[RLC-API] listening on http://localhost:${PORT}`);
      console.log(`📁 Projects root: ${PROJECTS_ROOT} (static: /projects)`);
      if (FRONTEND_ORIGIN)
        console.log(`🌐 FRONTEND_ORIGIN allowed: ${FRONTEND_ORIGIN}`);
      if (DEBUG_MEMORY) console.log(`🧠 DEBUG_MEMORY=on (mem logging enabled)`);
    });
  } catch (e) {
    console.error("Startup error:", e);
    process.exit(1);
  }
})();

export default app;
