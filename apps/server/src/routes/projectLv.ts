// apps/server/src/routes/projectLv.ts
import express, { Request, Response } from "express";
import path from "path";
import fs from "fs";
import os from "os";
import { createHash, randomUUID } from "crypto";
import { pipeline } from "stream/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import unzipper from "unzipper";
import iconv from "iconv-lite";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import XLSX from "xlsx";
import pdfParse from "pdf-parse";
import { prisma } from "../lib/prisma";
import { buildGaebX83Xml as buildCertifiedGaebX83Xml, buildGaebX84Xml as buildCertifiedGaebX84Xml } from "../gaeb/gaebXml33";
import { buildGaebX31Xml } from "../gaeb/gaebX31";
import { evaluateReb23003Positions } from "../reb/reb23003";
import {
  archiveProjectFileVersion,
  archiveProjectBufferVersion
} from "../services/dmsArchive";

function archiveLvDms(
  project: { id: string; code?: string | null },
  filename: string,
  localPath: string,
  meta: Record<string, any>
) {
  void archiveProjectFileVersion({
    projectIdOrCode: project.id || String(project.code || ""),
    filename,
    kind: "LV",
    localPath,
    meta: {
      module: "KALKULATION",
      ...meta
    }
  }).catch((error) => {
    console.error("[kalkulation:dms]", error);
  });
}


function archiveLvBufferDms(
  project: { id: string; code?: string | null },
  filename: string,
  buffer: Buffer,
  meta: Record<string, any>
) {
  void archiveProjectBufferVersion({
    projectIdOrCode: project.id || String(project.code || ""),
    filename,
    kind: "LV",
    buffer,
    meta: { module: "KALKULATION", ...meta }
  }).catch((error) => {
    console.error("[kalkulation:dms:buffer]", error);
  });
}

const router = express.Router();
const execFileAsync = promisify(execFile);

router.use((req: any, res, next) => {
  if (req.method === "GET" || req.method === "HEAD") return next();
  const role = String(req?.auth?.companyRole || req?.auth?.role || "").trim().toUpperCase();
  if (!["ADMIN", "ADMINISTRATOR", "BAULEITER", "KALKULATOR"].includes(role)) {
    return res.status(403).json({ ok: false, error: "PROJECT_LV_WRITE_FORBIDDEN" });
  }
  return next();
});

function requireLvCollectionRole(req: any, res: any, next: any) {
  const role = String(req?.auth?.companyRole || req?.auth?.role || "").trim().toUpperCase();
  if (!["ADMIN", "ADMINISTRATOR", "BAULEITER", "KALKULATOR"].includes(role)) {
    return res.status(403).json({ ok: false, error: "LV_COLLECTION_FORBIDDEN" });
  }
  return next();
}

router.param("projectId", async (req: any, res: any, next: any, rawProjectId: string) => {
  try {
    const companyId = await ensureCompanyId(req);
    const role = String(req?.auth?.companyRole || req?.auth?.role || "").trim().toUpperCase();
    const privileged = role === "ADMIN" || role === "ADMINISTRATOR";
    const project = await resolveProject(
      companyId,
      String(rawProjectId || "").trim(),
      privileged
    );
    if (!project) return res.status(404).json({ ok: false, error: "Projekt nicht gefunden" });
    if (!privileged) {
      const userId = String(req?.auth?.sub || req?.auth?.userId || "").trim();
      if (!userId) return res.status(403).json({ ok: false, error: "USER_REQUIRED" });
      const member = await prisma.projectMember.findFirst({
        where: { projectId: project.id, userId },
        select: { id: true },
      });
      if (!member) return res.status(403).json({ ok: false, error: "PROJECT_MEMBER_REQUIRED" });
    }

    req.params.projectId = project.id;
    req.resolvedProjectId = project.id;
    req.resolvedProjectCode = project.code;
    return next();
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "PROJECT_ACCESS_CHECK_FAILED" });
  }
});

const PROJECTS_ROOT =
  process.env.PROJECTS_ROOT || path.join(process.cwd(), "data", "projects");

/** Log helper */
function log(...args: any[]) {
  console.log("[LV-API]", ...args);
}

/**
 * Garantisce che esista SEMPRE una companyId valida
 */
async function ensureCompanyId(req: Request): Promise<string> {
  const auth: any = (req as any).auth || {};
  const companyId = String(auth.companyId || auth.company || "").trim();

  if (companyId) {
    const found = await prisma.company.findUnique({ where: { id: companyId } });
    if (found) return found.id;
    throw new Error("AUTH_COMPANY_NOT_FOUND");
  }

  if (process.env.NODE_ENV !== "production" && (process.env.DEV_AUTH || "").toLowerCase() === "on") {
    const devCompanyId = String(process.env.DEV_COMPANY_ID || "").trim();
    if (!devCompanyId) throw new Error("DEV_COMPANY_ID_REQUIRED");
    const found = await prisma.company.findUnique({ where: { id: devCompanyId } });
    if (found) return found.id;
  }

  throw new Error("COMPANY_REQUIRED");
}

function xmlEscape(value: any): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizeOz(value: any): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/_/g, ".")
    .replace(/-+/g, "-");
}

type LvTreeNode = {
  key: string;
  oz: string;
  title: string;
  type: "chapter" | "position";
  item?: any;
  children: LvTreeNode[];
};

function deriveChapterPath(position: string): string[] {
  const oz = normalizeOz(position);
  if (!oz) return [];
  const parts = oz.split(".").filter(Boolean);

  if (parts.length <= 1) return [];
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("."));
}

function buildLvTree(items: any[]): LvTreeNode[] {
  const root = new Map<string, LvTreeNode>();

  function ensureChapter(pathOz: string): LvTreeNode {
    if (root.has(pathOz)) return root.get(pathOz)!;

    const node: LvTreeNode = {
      key: pathOz,
      oz: pathOz,
      title: `Kapitel ${pathOz}`,
      type: "chapter",
      children: [],
    };
    root.set(pathOz, node);
    return node;
  }

  const positionNodes: LvTreeNode[] = items.map((item) => ({
    key: `pos:${item.id ?? item.position ?? Math.random().toString(36).slice(2)}`,
    oz: normalizeOz(item.position),
    title: String(item.kurztext || ""),
    type: "position",
    item,
    children: [],
  }));

  for (const posNode of positionNodes) {
    const chapterPath = deriveChapterPath(posNode.oz);

    if (!chapterPath.length) {
      root.set(posNode.key, posNode);
      continue;
    }

    let parent: LvTreeNode | null = null;

    for (const chapterOz of chapterPath) {
      const chapter = ensureChapter(chapterOz);
      if (parent && !parent.children.find((c) => c.key === chapter.key)) {
        parent.children.push(chapter);
      }
      parent = chapter;
    }

    if (parent && !parent.children.find((c) => c.key === posNode.key)) {
      parent.children.push(posNode);
    }
  }

  const values = Array.from(root.values());

  const topLevel = values.filter((node) => {
    if (node.type === "position") return true;
    const chapterPath = deriveChapterPath(node.oz);
    return chapterPath.length <= 1;
  });

  function sortNodes(nodes: LvTreeNode[]) {
    nodes.sort((a, b) => a.oz.localeCompare(b.oz, "de", { numeric: true }));
    for (const n of nodes) sortNodes(n.children);
  }

  sortNodes(topLevel);
  return topLevel;
}

function renderGaebLikeTree(nodes: LvTreeNode[], level = 1): string {
  let out = "";

  for (const node of nodes) {
    if (node.type === "chapter") {
      out += `${"  ".repeat(level)}<BoQCtgy RNoPart="${xmlEscape(node.oz)}">\n`;
      out += `${"  ".repeat(level + 1)}<LblTx>${xmlEscape(node.title)}</LblTx>\n`;
      if (node.children.length) {
        out += renderGaebLikeTree(node.children, level + 1);
      }
      out += `${"  ".repeat(level)}</BoQCtgy>\n`;
      continue;
    }

    const p = node.item || {};
    out += `${"  ".repeat(level)}<Item RNoPart="${xmlEscape(node.oz)}">\n`;
    out += `${"  ".repeat(level + 1)}<Qty>${xmlEscape(p.menge ?? 0)}</Qty>\n`;
    out += `${"  ".repeat(level + 1)}<QU>${xmlEscape(p.einheit || "")}</QU>\n`;
    out += `${"  ".repeat(level + 1)}<UP>${xmlEscape(p.einzelpreis ?? 0)}</UP>\n`;
    out += `${"  ".repeat(level + 1)}<IT>${xmlEscape(p.kurztext || "")}</IT>\n`;
    if (p.langtext) {
      out += `${"  ".repeat(level + 1)}<OutlineText>\n`;
      out += `${"  ".repeat(level + 2)}<OutlTxt>\n`;
      out += `${"  ".repeat(level + 3)}<Text>${xmlEscape(p.langtext)}</Text>\n`;
      out += `${"  ".repeat(level + 2)}</OutlTxt>\n`;
      out += `${"  ".repeat(level + 1)}</OutlineText>\n`;
    }
    out += `${"  ".repeat(level)}</Item>\n`;
  }

  return out;
}

function toSafeNumber(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function gaebFileNameBase(projectCode: string, version: number) {
  return `lv_${projectCode}_v${version}`;
}

function ensureProjectExportDirs(projectCode: string) {
  const projectDir = path.join(PROJECTS_ROOT, projectCode);
  const exportsDir = path.join(projectDir, "exports");
  const gaebDir = path.join(projectDir, "gaeb");

  fs.mkdirSync(exportsDir, { recursive: true });
  fs.mkdirSync(gaebDir, { recursive: true });

  return { projectDir, exportsDir, gaebDir };
}

function deriveGaebCategoryTitle(pathOz: string): string {
  return `Kapitel ${pathOz}`;
}

function renderGaebX83Tree(nodes: LvTreeNode[], level = 4): string {
  let out = "";

  for (const node of nodes) {
    if (node.type === "chapter") {
      out += `${"  ".repeat(level)}<BoQCtgy RNoPart="${xmlEscape(node.oz)}">\n`;
      out += `${"  ".repeat(level + 1)}<LblTx>${xmlEscape(
        deriveGaebCategoryTitle(node.oz)
      )}</LblTx>\n`;
      out += renderGaebX83Tree(node.children, level + 1);
      out += `${"  ".repeat(level)}</BoQCtgy>\n`;
      continue;
    }

    const p = node.item || {};
    out += `${"  ".repeat(level)}<Item RNoPart="${xmlEscape(node.oz)}">\n`;
    out += `${"  ".repeat(level + 1)}<Qty>${xmlEscape(toSafeNumber(p.menge))}</Qty>\n`;
    out += `${"  ".repeat(level + 1)}<QU>${xmlEscape(p.einheit || "")}</QU>\n`;
    out += `${"  ".repeat(level + 1)}<IT>${xmlEscape(p.kurztext || "")}</IT>\n`;

    if (p.langtext) {
      out += `${"  ".repeat(level + 1)}<OutlineText>\n`;
      out += `${"  ".repeat(level + 2)}<OutlTxt>\n`;
      out += `${"  ".repeat(level + 3)}<Text>${xmlEscape(p.langtext)}</Text>\n`;
      out += `${"  ".repeat(level + 2)}</OutlTxt>\n`;
      out += `${"  ".repeat(level + 1)}</OutlineText>\n`;
    }

    out += `${"  ".repeat(level)}</Item>\n`;
  }

  return out;
}

function renderGaebX84Tree(nodes: LvTreeNode[], level = 4): string {
  let out = "";

  for (const node of nodes) {
    if (node.type === "chapter") {
      out += `${"  ".repeat(level)}<BoQCtgy RNoPart="${xmlEscape(node.oz)}">\n`;
      out += `${"  ".repeat(level + 1)}<LblTx>${xmlEscape(
        deriveGaebCategoryTitle(node.oz)
      )}</LblTx>\n`;
      out += renderGaebX84Tree(node.children, level + 1);
      out += `${"  ".repeat(level)}</BoQCtgy>\n`;
      continue;
    }

    const p = node.item || {};
    const qty = toSafeNumber(p.menge);
    const up = toSafeNumber(p.einzelpreis);
    const gp = toSafeNumber(p.gesamt || qty * up);

    out += `${"  ".repeat(level)}<Item RNoPart="${xmlEscape(node.oz)}">\n`;
    out += `${"  ".repeat(level + 1)}<Qty>${xmlEscape(qty)}</Qty>\n`;
    out += `${"  ".repeat(level + 1)}<QU>${xmlEscape(p.einheit || "")}</QU>\n`;
    out += `${"  ".repeat(level + 1)}<UP>${xmlEscape(up.toFixed(2))}</UP>\n`;
    out += `${"  ".repeat(level + 1)}<IT>${xmlEscape(p.kurztext || "")}</IT>\n`;
    out += `${"  ".repeat(level + 1)}<Total>${xmlEscape(gp.toFixed(2))}</Total>\n`;

    if (p.langtext) {
      out += `${"  ".repeat(level + 1)}<OutlineText>\n`;
      out += `${"  ".repeat(level + 2)}<OutlTxt>\n`;
      out += `${"  ".repeat(level + 3)}<Text>${xmlEscape(p.langtext)}</Text>\n`;
      out += `${"  ".repeat(level + 2)}</OutlTxt>\n`;
      out += `${"  ".repeat(level + 1)}</OutlineText>\n`;
    }

    out += `${"  ".repeat(level)}</Item>\n`;
  }

  return out;
}

function buildGaebX83Xml(input: {
  projectCode: string;
  projectName: string;
  headerId: string;
  headerTitle: string;
  version: number;
  nodes: LvTreeNode[];
}) {
  const { projectCode, projectName, headerId, headerTitle, version, nodes } = input;

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<GAEBInfo>\n`;
  xml += `  <GAEBVers>3.3</GAEBVers>\n`;
  xml += `  <VersDate>${new Date().toISOString()}</VersDate>\n`;
  xml += `  <PrjInfo>\n`;
  xml += `    <NamePrj>${xmlEscape(projectName)}</NamePrj>\n`;
  xml += `    <LblPrj>${xmlEscape(projectCode)}</LblPrj>\n`;
  xml += `  </PrjInfo>\n`;
  xml += `  <Award>\n`;
  xml += `    <BoQ ID="${xmlEscape(headerId)}" RNoPart="${xmlEscape(
    projectCode
  )}" IC="${xmlEscape(`${projectCode}-X83-V${version}`)}">\n`;
  xml += `      <LblBoQ>${xmlEscape(headerTitle)}</LblBoQ>\n`;
  xml += `      <BoQBody>\n`;
  xml += renderGaebX83Tree(nodes, 4);
  xml += `      </BoQBody>\n`;
  xml += `    </BoQ>\n`;
  xml += `  </Award>\n`;
  xml += `</GAEBInfo>\n`;

  return xml;
}

function buildGaebX84Xml(input: {
  projectCode: string;
  projectName: string;
  headerId: string;
  headerTitle: string;
  version: number;
  nodes: LvTreeNode[];
  items: any[];
}) {
  const { projectCode, projectName, headerId, headerTitle, version, nodes, items } = input;
  const total = items.reduce((sum, x) => {
    const qty = toSafeNumber(x.menge);
    const up = toSafeNumber(x.einzelpreis);
    const gp = toSafeNumber(x.gesamt || qty * up);
    return sum + gp;
  }, 0);

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<GAEBInfo>\n`;
  xml += `  <GAEBVers>3.3</GAEBVers>\n`;
  xml += `  <VersDate>${new Date().toISOString()}</VersDate>\n`;
  xml += `  <PrjInfo>\n`;
  xml += `    <NamePrj>${xmlEscape(projectName)}</NamePrj>\n`;
  xml += `    <LblPrj>${xmlEscape(projectCode)}</LblPrj>\n`;
  xml += `  </PrjInfo>\n`;
  xml += `  <Award>\n`;
  xml += `    <BoQ ID="${xmlEscape(headerId)}" RNoPart="${xmlEscape(
    projectCode
  )}" IC="${xmlEscape(`${projectCode}-X84-V${version}`)}">\n`;
  xml += `      <LblBoQ>${xmlEscape(headerTitle)} - Angebot</LblBoQ>\n`;
  xml += `      <BoQBody>\n`;
  xml += renderGaebX84Tree(nodes, 4);
  xml += `      </BoQBody>\n`;
  xml += `      <BoQInfo>\n`;
  xml += `        <Cur>EUR</Cur>\n`;
  xml += `        <Tot>${xmlEscape(total.toFixed(2))}</Tot>\n`;
  xml += `      </BoQInfo>\n`;
  xml += `    </BoQ>\n`;
  xml += `  </Award>\n`;
  xml += `</GAEBInfo>\n`;

  return xml;
}

type GaebValidationIssue = {
  level: "error" | "warning";
  code: string;
  message: string;
  position?: string;
};

const ALLOWED_UNITS = new Set([
  "m",
  "m2",
  "m²",
  "m3",
  "m³",
  "St",
  "Stk",
  "Psch",
  "kg",
  "t",
  "h",
  "d",
  "l",
]);

function normalizeUnit(unit: any): string {
  return String(unit ?? "").trim();
}

function validateGaebItems(items: any[], mode: "x83" | "x84") {
  const issues: GaebValidationIssue[] = [];
  const seen = new Set<string>();

  for (const raw of items) {
    const p = raw || {};
    const pos = String(p.position || "").trim();
    const kurz = String(p.kurztext || "").trim();
    const lang = String(p.langtext || "").trim();
    const unit = normalizeUnit(p.einheit);
    const qty = toSafeNumber(p.menge);
    const up = toSafeNumber(p.einzelpreis);
    const total = toSafeNumber(p.gesamt);

    if (!pos) {
      issues.push({
        level: "error",
        code: "POSITION_MISSING",
        message: "Positionsnummer fehlt",
      });
      continue;
    }

    if (seen.has(pos)) {
      issues.push({
        level: "error",
        code: "POSITION_DUPLICATE",
        message: `Doppelte Positionsnummer: ${pos}`,
        position: pos,
      });
    }
    seen.add(pos);

    const posParts = pos.split(".").filter(Boolean);
    const isTitlePosition = posParts.length <= 1;
    const isRealLvPosition = posParts.length >= 2;
    const isProjectCodePosition = /^BA-\d{4}-[A-Z0-9_-]+$/i.test(pos);

    const gaebOzValid = /^[0-9]+(?:\.[0-9]+)+(?:\.[0-9A-Za-z])?$/.test(pos);
    if (!isTitlePosition && !isProjectCodePosition && !gaebOzValid) {
      issues.push({
        level: "error",
        code: "POSITION_STRUCTURE",
        message: "Positionsnummer nicht GAEB-konform (z.B. 1.2.3)",
        position: pos,
      });
    }

    if (isTitlePosition) {
      if (!kurz && !lang) {
        issues.push({
          level: "warning",
          code: "TITLE_TEXT_MISSING",
          message: "Titel ohne Kurztext/Langtext",
          position: pos,
        });
      }

      continue;
    }

    if (isRealLvPosition && !kurz) {
      issues.push({
        level: "error",
        code: "KURZTEXT_MISSING",
        message: "Kurztext fehlt",
        position: pos,
      });
    }

    if (isRealLvPosition && !lang) {
      issues.push({
        level: "warning",
        code: "LANGTEXT_MISSING",
        message: "Langtext fehlt",
        position: pos,
      });
    }

    if (isRealLvPosition && !unit) {
      issues.push({
        level: "error",
        code: "UNIT_MISSING",
        message: "Einheit fehlt",
        position: pos,
      });
    } else if (isRealLvPosition && !ALLOWED_UNITS.has(unit)) {
      issues.push({
        level: "error",
        code: "UNIT_INVALID",
        message: `Nicht zulässige Einheit: ${unit}`,
        position: pos,
      });
    }

    if (isRealLvPosition && !(qty > 0)) {
      issues.push({
        level: "error",
        code: "QTY_INVALID",
        message: "Menge muss > 0 sein",
        position: pos,
      });
    }

    if (mode === "x84") {
      if (!(up >= 0)) {
        issues.push({
          level: "error",
          code: "PRICE_INVALID",
          message: "Einheitspreis ungültig",
          position: pos,
        });
      }

      const expected = Number((qty * up).toFixed(2));
      const actual = Number(total.toFixed(2));

      if (Math.abs(expected - actual) > 0.01) {
        issues.push({
          level: "error",
          code: "TOTAL_MISMATCH",
          message: `Gesamtpreis falsch (${actual} statt ${expected})`,
          position: pos,
        });
      }
    }
  }

  return {
    valid: !issues.some((x) => x.level === "error"),
    errors: issues.filter((x) => x.level === "error"),
    warnings: [] as GaebValidationIssue[],
    issues,
  };
}

function buildGaebValidationErrorResponse(validation: ReturnType<typeof validateGaebItems>) {
  return {
    ok: false,
    error: "GAEB validation failed",
    errorCount: validation.errors.length,
    errors: validation.errors,
  };
}

/* =========================================================
   resolve project by (companyId + id/code) with DEV fallback
========================================================= */
async function resolveProject(companyId: string, projectIdOrCode: string, allowSelfHeal = false) {
  const key = String(projectIdOrCode || "").trim();
  if (!key) return null;

  const scoped = await prisma.project.findFirst({
    where: {
      companyId,
      OR: [{ id: key }, { code: key }],
    },
  });
  if (scoped) return scoped;

  // RLC FS fallback:
  // /api/projects può mostrare progetti FS come BA-2026-021 con dbId nel project.json.
  // La route import deve quindi accettare anche fsKey/code e risolvere il vero DB id.
  // Per sicurezza, il fallback filesystem non accetta traversal o chiavi arbitrarie.
  if (!/^[A-Za-z0-9_.-]{1,120}$/.test(key) || key.includes("..")) return null;

  try {
    const fs = await import("node:fs/promises");
    const pathMod = await import("node:path");

    const projectsRoot =
      process.env.PROJECTS_ROOT ||
      process.env.RLC_PROJECTS_ROOT ||
      "/app/data/projects";

    const projectJsonPath = pathMod.join(projectsRoot, key, "project.json");
    const raw = await fs.readFile(projectJsonPath, "utf8");
    const meta = JSON.parse(raw);

    const dbId = String(meta.dbId || meta.id || "").trim();
    const code = String(meta.code || meta.projectCode || meta.fsKey || key).trim();

    const fsProject = await prisma.project.findFirst({
      where: {
        companyId,
        OR: [
          ...(dbId ? [{ id: dbId }] : []),
          ...(code ? [{ code }] : []),
          { code: key },
        ],
      },
    });

    if (fsProject) {
      log(
        "RLC FS project resolved.",
        "requested=",
        key,
        "dbId=",
        dbId,
        "code=",
        code,
        "project.id=",
        fsProject.id
      );
      return fsProject;
    }

    // RLC DB self-healing:
    // Il progetto esiste nel filesystem ma manca nella tabella Project.
    // Ricreiamo il record DB minimo, così import LV/GAEB può funzionare.
    if (allowSelfHeal && dbId && code) {
      const created = await prisma.project.create({
        data: {
          id: dbId,
          companyId,
          code,
          name: String(meta.name || meta.title || code),
        },
      });

      log(
        "RLC FS project recreated in DB.",
        "requested=",
        key,
        "project.id=",
        created.id,
        "code=",
        created.code
      );

      return created;
    }
  } catch (e: any) {
    log("RLC FS project fallback failed:", key, e?.message || e);
  }

  return null;
}


async function getLvHeaderByVersion(projectId: string, version?: number | null) {
  return prisma.lVHeader.findFirst({
    where: {
      projectId,
      ...(typeof version === "number" && Number.isFinite(version) ? { version } : {}),
    },
    orderBy: { version: "desc" },
  });
}

async function getLvForExport(projectId: string, version?: number | null) {
  const header = await getLvHeaderByVersion(projectId, version);

  if (!header) {
    return { header: null, items: [] as any[] };
  }

  const items = await prisma.lVPosition.findMany({
    where: { lvId: header.id },
    orderBy: { position: "asc" },
  });

  return { header, items };
}

function num(v: any): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/* =========================================================
   SEARCH LV (Prisma)
========================================================= */
async function handleLvSearch(req: Request, res: Response) {
  try {
    const companyId = await ensureCompanyId(req);

    const projectIdOrCode = String(req.params.projectId || "").trim();
    const q = String((req.query as any)?.q || "").trim();
    const take = Math.min(50, Math.max(1, Number((req.query as any)?.take || 20)));

    if (!projectIdOrCode) return res.status(400).json({ ok: false, error: "projectId fehlt" });
    if (!q) return res.json({ ok: true, items: [] });

    const project = await resolveProject(companyId, projectIdOrCode);
    if (!project) {
      return res.status(404).json({
        ok: false,
        error: "Projekt nicht gefunden",
        hint: "projectId può essere UUID oppure project.code (es. BA-2025-DEMO)",
      });
    }

    const projectId = project.id;

    const headerBase = await selectCleanOriginalLvHeader(projectId);
    const header = headerBase
      ? { id: headerBase.id, version: headerBase.version, title: headerBase.title }
      : null;

    if (!header) return res.json({ ok: true, items: [] });

    const items = await prisma.lVPosition.findMany({
      where: {
        lvId: header.id,
        OR: [
          { kurztext: { contains: q, mode: "insensitive" } },
          { langtext: { contains: q, mode: "insensitive" } },
          { position: { contains: q, mode: "insensitive" } },
          { einheit: { contains: q, mode: "insensitive" } },
        ],
      },
      orderBy: { position: "asc" },
      take,
      select: {
        id: true,
        position: true,
        kurztext: true,
        langtext: true,
        einheit: true,
        menge: true,
        einzelpreis: true,
      },
    });

    return res.json({
      ok: true,
      header,
      items: items.map((p) => ({
        id: p.id,
        pos: p.position,
        text: p.kurztext,
        langtext: p.langtext || "",
        unit: p.einheit,
        quantity: p.menge ?? 0,
        ep: p.einzelpreis ?? 0,
      })),
    });
  } catch (e: any) {
    console.error("[LV-API] search error", e);
    return res.status(500).json({ ok: false, error: e?.message || "search failed" });
  }
}

router.get("/projects/:projectId/lv/search", handleLvSearch);
router.get("/:projectId/lv/search", handleLvSearch);
router.get("/project-lv/:projectId/lv/search", handleLvSearch);


async function summarizeLvHeaderForSelection(headerId: string) {
  const rows = await prisma.lVPosition.findMany({
    where: { lvId: headerId },
    orderBy: { position: "asc" },
    select: {
      position: true,
      kurztext: true,
      menge: true,
      einzelpreis: true,
      gesamt: true,
    },
  });

  const total = rows.reduce((s, r) => {
    const qty = num(r.menge);
    const ep = num(r.einzelpreis);
    const gp = num(r.gesamt);
    return s + (gp > 0 ? gp : qty * ep);
  }, 0);

  return {
    count: rows.length,
    total,
    first: rows[0]?.position || "",
    sample: String(rows[0]?.kurztext || "").trim(),
  };
}

async function selectCleanOriginalLvHeader(projectId: string) {
  const headers = await prisma.lVHeader.findMany({
    where: { projectId },
    orderBy: { version: "asc" },
  });

  if (!headers.length) return null;

  // Il LV X83 con testi reali è la base tecnica. Un X84 senza testi o una
  // vecchia versione con placeholder non deve mai sostituirlo nel calcolo.
  const scored = await Promise.all(headers.map(async (header) => {
    const positions = await prisma.lVPosition.findMany({
      where: { lvId: header.id },
      select: { kurztext: true, langtext: true },
    });
    const meaningful = positions.filter((p) => {
      const text = `${p.kurztext || ""} ${p.langtext || ""}`.trim();
      return text.length >= 8 && !/^position\s+\d+(?:\.\d+)*$/i.test(text);
    }).length;
    return { header, score: positions.length ? meaningful / positions.length : 0, count: positions.length };
  }));

  return scored.sort((a, b) => b.score - a.score || b.count - a.count || a.header.version - b.header.version)[0]?.header || headers[0];
}


async function handleGetProjectLv(req: Request, res: Response) {
  try {
    const companyId = await ensureCompanyId(req);
    const projectIdOrCode = String(req.params.projectId || "").trim();

    if (!projectIdOrCode) {
      return res.status(400).json({ ok: false, error: "projectId fehlt" });
    }

    const project = await resolveProject(companyId, projectIdOrCode);

    if (!project) {
      return res.status(404).json({
        ok: false,
        error: "Projekt nicht gefunden",
        hint: "projectId può essere UUID oppure project.code (es. BA-2025-DEMO)",
      });
    }

    const projectId = project.id;

    const requestedVersion = Number((req.query as any)?.version);
    const header =
      Number.isFinite(requestedVersion) && requestedVersion > 0
        ? await prisma.lVHeader.findFirst({
            where: { projectId, version: requestedVersion },
          })
        : await selectCleanOriginalLvHeader(projectId);

    if (header) {
      const positions = await prisma.lVPosition.findMany({
        where: { lvId: header.id },
        orderBy: { position: "asc" },
      });

      log("LV aus DB gefunden. Header:", header.id, "Anzahl Pos:", positions.length);

        const mappedItems = positions.map((p) => ({
          id: p.id,
          pos: p.position,
          position: p.position,
          posNr: p.position,
          text: p.kurztext,
          kurztext: p.kurztext,
          langtext: p.langtext || "",
          unit: p.einheit,
          einheit: p.einheit,
          quantity: p.menge ?? 0,
          menge: p.menge ?? 0,
          ep: p.einzelpreis ?? 0,
          einzelpreis: p.einzelpreis ?? 0,
          preis: p.einzelpreis ?? 0,
          gesamt: p.gesamt ?? (Number(p.menge ?? 0) * Number(p.einzelpreis ?? 0)),
          x84UnitPrice: p.x84UnitPrice ?? 0,
          x84Total: p.x84Total ?? 0,
          gaebAlnGroupNo: p.gaebAlnGroupNo,
          gaebAlnSerNo: p.gaebAlnSerNo,
          gaebProvis: p.gaebProvis,
          gaebProvisAccpt: p.gaebProvisAccpt,
          gaebAccepted: p.gaebAccepted,
        }));

        return res.json({
          ok: true,
          source: "db",
          header: {
            id: header.id,
            title: header.title,
            currency: header.currency,
            version: header.version,
          },
          page: Number((req.query as any)?.page || 1),
          pageSize: Number((req.query as any)?.pageSize || mappedItems.length),
          total: mappedItems.length,
          rows: mappedItems,
          items: mappedItems,
        });
    }

    const folderById = path.join(PROJECTS_ROOT, project.id);

    const safeCode = project.code ? project.code.replace(/[^A-Za-z0-9_\-]/g, "_") : null;
    const folderByCode = safeCode ? path.join(PROJECTS_ROOT, safeCode) : null;

    const candidatePaths: string[] = [path.join(folderById, "lv.json")];
    if (folderByCode) candidatePaths.push(path.join(folderByCode, "lv.json"));

    let lvJsonPath: string | null = null;
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        lvJsonPath = p;
        break;
      }
    }

    if (!lvJsonPath) {
      log("Kein LV in DB und keine lv.json für Projekt gefunden:", projectIdOrCode);
      return res.json({ ok: true, source: "empty", header: null, items: [] });
    }

    log("lv.json gefunden unter:", lvJsonPath);

    const raw = fs.readFileSync(lvJsonPath, "utf8");
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error("[LV-API] lv.json ist kein gültiges JSON:", e);
      return res.status(500).json({ ok: false, error: "lv.json ist kein gültiges JSON" });
    }

    const itemsFromJson: any[] = Array.isArray(parsed.items) ? parsed.items : [];

    const newHeader = await prisma.lVHeader.create({
      data: {
        projectId,
        title: parsed.title || "LV aus Datei",
        currency: parsed.currency || "EUR",
        version: 1,
      },
    });

    const dataForDb = itemsFromJson
  .filter((p, idx) => {
    const pos = String(p.pos ?? p.position ?? p.id ?? idx + 1).trim();
    const text = String(p.text ?? p.kurztext ?? "").trim();
    const langtext = p.langtext ? String(p.langtext).trim() : "";
    if (!pos && !text && !langtext) return false;
    if (text === "EUR" && !langtext) return false;
    return true;
  })
  .map((p, idx) => {
    const mengeRaw =
      p.quantity !== undefined && p.quantity !== null ? Number(p.quantity) : Number(p.menge);
    const epRaw =
      p.ep !== undefined && p.ep !== null ? Number(p.ep) : Number(p.einzelpreis);

    const menge = Number.isFinite(mengeRaw) ? mengeRaw : 0;
    const einzelpreis = Number.isFinite(epRaw) ? epRaw : null;

    return {
      lvId: newHeader.id,
      position: String(p.pos ?? p.position ?? p.id ?? idx + 1).trim(),
      kurztext: String(p.text ?? p.kurztext ?? "").trim(),
      langtext: p.langtext ? String(p.langtext).trim() : "",
      einheit: String(p.unit ?? p.einheit ?? "").trim(),
      menge,
      einzelpreis,
      gesamt:
        typeof p.total === "number" && Number.isFinite(p.total)
          ? p.total
          : typeof einzelpreis === "number"
            ? Number((menge * einzelpreis).toFixed(2))
            : null,
      parentPos: p.parentPos ?? null,
      gaebAlnGroupNo: p.gaebAlnGroupNo ?? null,
      gaebAlnSerNo: p.gaebAlnSerNo ?? null,
      gaebProvis: p.gaebProvis ?? null,
      gaebProvisAccpt: p.gaebProvisAccpt ?? null,
      gaebAccepted: p.gaebAccepted ?? null,
    };
  });    

    if (dataForDb.length > 0) {
      await prisma.lVPosition.createMany({ data: dataForDb });
    }

    log(
      "LV aus lv.json in DB importiert. Header:",
      newHeader.id,
      "Anzahl Pos:",
      dataForDb.length
    );

    return res.json({
      ok: true,
      source: "lvjson",
      header: {
        id: newHeader.id,
        title: newHeader.title,
        currency: newHeader.currency,
        version: newHeader.version,
      },
      items: dataForDb.map((p, idx) => ({
        id: `import-${idx}`,
        pos: p.position,
        text: p.kurztext,
        langtext: p.langtext || "",
        unit: p.einheit,
        quantity: p.menge ?? 0,
        ep: p.einzelpreis ?? 0,
      })),
    });
  }catch (err: any) {
  console.error("[LV-IMPORT-FILE] error", err);

  const msg = String(err?.message || "");

  if (
    msg.includes("PDF beschädigt") ||
    msg.includes("nicht kompatibel") ||
    msg.includes("bad XRef entry") ||
    msg.includes("unsupported") ||
    msg.includes("invalid pdf")
  ) {
    return res.status(422).json({
      ok: false,
      error: msg || "PDF konnte nicht gelesen werden.",
    });
  }

  return res.status(500).json({
    ok: false,
    error: "Interner Serverfehler beim LV-Import.",
  });
}
}

router.get("/:projectId/lv", handleGetProjectLv);
router.get("/:projectId", (req, res) => {
  (req as any).params.projectId = req.params.projectId;
  return handleGetProjectLv(req, res);
});

router.get("/project-lv/:projectId", (req, res) => {
  (req as any).params.projectId = req.params.projectId;
  return handleGetProjectLv(req, res);
});

const multer = require("multer");
const xml2js = require("xml2js");

function arrify<T = any>(v: T | T[] | null | undefined): T[] {
  if (v === null || v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function txt(v: any): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return txt(v[0]);
  if (typeof v === "object") {
    if ("_" in v) return String(v._ ?? "").trim();
  }
  return "";
}

function firstDefined(...vals: any[]) {
  for (const v of vals) {
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return null;
}

function collectGaebItemsDeep(node: any, out: any[] = []) {
  if (!node || typeof node !== "object") return out;

  const positionNo =
    firstDefined(
      node?.RNoPart,
      node?.RNoIndex,
      node?.RNo,
      node?.ItemNumber,
      node?.OZ,
      node?.PositionNumber
    ) ?? "";

  const kurz =
    firstDefined(
      node?.ShortText,
      node?.Kurztext,
      node?.IT,
      node?.OutlineText,
      node?.Description
    ) ?? "";

  const lang =
    firstDefined(node?.LongText, node?.Langtext, node?.DetailText, node?.CompleteText) ?? "";

  const unit = firstDefined(node?.QU, node?.Unit, node?.Einheit, node?.UoM) ?? "";

  const qty = firstDefined(node?.Qty, node?.Quantity, node?.Menge) ?? null;

  const ep = firstDefined(node?.UP, node?.UnitRate, node?.EP, node?.Einzelpreis) ?? null;

  const posText = txt(positionNo);
  const kurzText = txt(kurz);
  const langText = txt(lang);
  const unitText = txt(unit);

  if (posText || kurzText) {
    out.push({
      pos: posText,
      text: kurzText,
      langtext: langText,
      unit: unitText,
      quantity: toImportNumber(txt(qty)),
      ep: toImportNumber(txt(ep)),
    });
  }

  for (const key of Object.keys(node)) {
    const value = node[key];
    if (Array.isArray(value)) {
      for (const entry of value) collectGaebItemsDeep(entry, out);
    } else if (value && typeof value === "object") {
      collectGaebItemsDeep(value, out);
    }
  }

  return out;
}

export async function parseGaebXmlImport(xmlText: string) {
  const parser = new xml2js.Parser({
    explicitArray: false,
    mergeAttrs: true,
    trim: true,
    explicitCharkey: true,
  });

  const parsed = await parser.parseStringPromise(xmlText);

  function arr<T = any>(v: T | T[] | null | undefined): T[] {
    if (Array.isArray(v)) return v;
    if (v === null || v === undefined) return [];
    return [v];
  }

  function deepText(v: any): string {
    if (v === null || v === undefined) return "";
    if (typeof v === "string" || typeof v === "number") return String(v).trim();
    if (Array.isArray(v)) return v.map(deepText).filter(Boolean).join(" ").trim();

    if (typeof v === "object") {
      if ("_" in v && String(v._ ?? "").trim()) return String(v._).trim();

      return Object.entries(v)
        .filter(([k]) => !String(k).startsWith("$") && String(k).toLowerCase() !== "image")
        .map(([, val]) => deepText(val))
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    }

    return "";
  }

  function cleanGaebTextValue(value: string): string {
      return String(value || "")
        .replace(/\btext-align\s*:\s*[^;\s]+;?/gi, " ")
        .replace(/\bmargin-(?:top|bottom|left|right)\s*:\s*[^;\s]+;?/gi, " ")
        .replace(/\bfont-family\s*:\s*[^;]+;?/gi, " ")
        .replace(/\b(?:width|widht)\s*:\s*[^;\s]+;?/gi, " ")
        .replace(/\bfont-size\s*:\s*[^;\s]+;?/gi, " ")
        .replace(/\b(?:font-weight|font-style|line-height)\s*:\s*[^;\s]+;?/gi, " ")
        .replace(/; +/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function firstText(...vals: any[]): string {
    for (const v of vals) {
      const t = cleanGaebTextValue(deepText(v));
      if (t) return t;
    }
    return "";
  }

  function firstValue(...vals: any[]): any {
    for (const v of vals) {
      const t = deepText(v);
      if (t) return v;
    }
    return null;
  }

  function looksLikeNumberText(v: any): boolean {
    const t = deepText(v).replace(/\s+/g, "").trim();
    if (!t) return false;
    return /^[-+]?\d+(?:[.,]\d+)?$/.test(t);
  }

  function firstNonNumericText(...vals: any[]): string {
    for (const v of vals) {
      const t = cleanGaebTextValue(deepText(v));
      if (t && !looksLikeNumberText(v)) return t;
    }
    return "";
  }

  function directGaebText(v: any): string {
    if (v === null || v === undefined) return "";
    if (typeof v === "string" || typeof v === "number") {
      return cleanGaebTextValue(String(v));
    }
    if (Array.isArray(v)) {
      return v.map(directGaebText).filter(Boolean).join(" ").trim();
    }
    if (typeof v === "object" && "_" in v) {
      return cleanGaebTextValue(String(v._ ?? ""));
    }
    return "";
  }

  function firstNonNumericDirectText(...vals: any[]): string {
    for (const v of vals) {
      const t = directGaebText(v);
      if (t && !/^[-+]?\d+(?:[.,]\d+)?$/.test(t.replace(/\s+/g, ""))) return t;
    }
    return "";
  }

  function deriveKurztextFromGaebText(value: string): string {
    const text = cleanGaebTextValue(value)
      .replace(/[-]{5,}/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!text) return "";
    if (text.length <= 140) return text;

    const parts = text
      .split(/(?:\.\s+|;\s+|\n+)/)
      .map((x) => cleanGaebTextValue(x))
      .filter((x) => x.length >= 8 && x.length <= 180);

    if (parts.length) return parts[parts.length - 1];

    return text.slice(0, 140).trim();
  }

  function normalizeGaebBidDate(value: any): string | null {
    const raw = deepText(value).trim();
    if (!raw) return null;

    const parsedDate = new Date(
      /^\\d{4}-\\d{2}-\\d{2}$/.test(raw)
        ? `${raw}T00:00:00.000Z`
        : raw
    );

    if (!Number.isFinite(parsedDate.getTime())) return null;

    return parsedDate.toISOString();
  }

  /*
   * GAEB 3.3:
   * AwardInfo/BidDate = Angebotsdatum.
   *
   * VersDate NON viene usato come Preisstand:
   * indica la versione/data tecnica del file GAEB.
   */
  const gaebBidDateRaw = firstValue(
    parsed?.GAEBInfo?.Award?.AwardInfo?.BidDate,
    parsed?.GAEB?.Award?.AwardInfo?.BidDate,
    parsed?.Award?.AwardInfo?.BidDate,
    parsed?.GAEBInfo?.AwardInfo?.BidDate,
    parsed?.GAEB?.AwardInfo?.BidDate
  );

  const priceDate = normalizeGaebBidDate(gaebBidDateRaw);
  const priceDateSource = priceDate
    ? "GAEB.Award.AwardInfo.BidDate"
    : null;

  function cleanOz(v: any): string {
    return firstText(v)
      .replace(/\s+/g, "")
      .replace(/_/g, ".")
      .replace(/^\.+|\.+$/g, "")
      .trim();
  }

  function joinOz(prefix: string, part: string): string {
    const a = cleanOz(prefix);
    const b = cleanOz(part);

    if (!a) return b;
    if (!b) return a;
    if (b === a || b.startsWith(a + ".")) return b;

    return `${a}.${b}`;
  }

  type GaebOzSpec = { type: string; length: number; numeric: boolean };

  function collectBoQBreakdowns(node: any, out: any[] = []): any[] {
    if (node === null || node === undefined) return out;
    if (Array.isArray(node)) {
      for (const entry of node) collectBoQBreakdowns(entry, out);
      return out;
    }
    if (typeof node !== "object") return out;
    if (node.BoQBkdn) out.push(...arr(node.BoQBkdn));
    for (const [key, value] of Object.entries(node)) {
      if (key === "BoQBkdn") continue;
      if (value && typeof value === "object") collectBoQBreakdowns(value, out);
    }
    return out;
  }

  const ozBreakdown: GaebOzSpec[] = collectBoQBreakdowns(parsed)
    .map((breakdown: any) => {
      const type = firstText(breakdown?.Type);
      const length = Number(firstText(breakdown?.Length) || 0);
      const num = firstText(breakdown?.Num);
      if (!type || !Number.isFinite(length) || length <= 0) return null;
      return {
        type,
        length,
        numeric: !/^(no|false|0|nein)$/i.test(num),
      } as GaebOzSpec;
    })
    .filter((spec: GaebOzSpec | null): spec is GaebOzSpec => spec !== null);

  const categorySpecs = ozBreakdown.filter((spec) => spec.type === "BoQLevel");
  const itemSpec = ozBreakdown.find((spec) => spec.type === "Item");
  const indexSpec = ozBreakdown.find((spec) => spec.type === "Index");

  function formatOzPart(value: string, spec?: GaebOzSpec): string {
    const clean = cleanOz(value);
    if (!clean || !spec?.length) return clean;
    if (spec.numeric && /^\d+$/.test(clean)) return clean.padStart(spec.length, "0");
    return clean;
  }
  function pickItemText(item: any): { kurztext: string; langtext: string } {
    /*
     * GAEB Textlogik:
     * IT / ShortText = Kurztext direkt.
     * DetailTxt / OutlineText = Langtext.
     * Wenn IT dennoch Langtext enthält, wird daraus ein kurzer Kurztext abgeleitet.
     */
    const kurzDirect = firstNonNumericText(
      item?.Description?.CompleteText?.OutlineText?.OutlTxt?.TextOutlTxt,
      item?.Description?.CompleteText?.OutlineText?.OutlTxt,
      item?.Description?.OutlineText?.OutlTxt?.TextOutlTxt,
      item?.Description?.OutlineText?.OutlTxt,
      item?.IT,
      item?.ShortText,
      item?.Kurztext,
      item?.LblTx
    );

    const langtext = firstNonNumericText(
      item?.Description?.CompleteText?.DetailTxt?.Text,
      item?.Description?.CompleteText?.DetailTxt,
      item?.Description?.DetailTxt?.Text,
      item?.Description?.DetailTxt,
      item?.DetailTxt?.Text,
      item?.DetailTxt,
      item?.DetailText,
      item?.LongText,
      item?.Langtext,
      item?.CompleteText,
      item?.ItemText,
      item?.DescriptionInfo,
      item?.Description?.CompleteText?.OutlineText?.OutlTxt?.TextOutlTxt,
      item?.OutlineText?.OutlTxt?.Text,
      item?.OutlineText?.OutlTxt,
      item?.OutlineText,
      item?.OutlineTextOutlTxt,
      item?.TextOutlTxt
    );

    const kurztext = deriveKurztextFromGaebText(kurzDirect || langtext);

    return {
      kurztext: kurztext || langtext,
      langtext: langtext || kurzDirect || kurztext || "",
    };
  }

  function collectGaebImages(node: any, out: any[] = []): any[] {
    if (node === null || node === undefined) return out;
    if (Array.isArray(node)) {
      node.forEach((entry) => collectGaebImages(entry, out));
      return out;
    }
    if (typeof node !== "object") return out;
    for (const [key, value] of Object.entries(node)) {
      if (String(key).toLowerCase() === "image") {
        for (const img of arr(value as any)) {
          const data = typeof img === "object" ? String((img as any)?._ || "").trim() : String(img || "").trim();
          out.push({
            name: firstText((img as any)?.Name) || null,
            type: firstText((img as any)?.Type) || null,
            width: firstText((img as any)?.width) || null,
            data,
          });
        }
      } else if (value && typeof value === "object") {
        collectGaebImages(value, out);
      }
    }
    return out;
  }

  function collectBidderComplements(item: any): any[] {
    const detail = item?.Description?.CompleteText?.DetailTxt ?? item?.Description?.DetailTxt ?? null;
    return arr(detail?.TextComplement)
      .filter((c: any) => String(firstText(c?.Kind)).toLowerCase() === "bidder")
      .map((c: any) => ({
        markLbl: firstText(c?.MarkLbl) || null,
        kind: firstText(c?.Kind) || "Bidder",
        caption: firstText(c?.ComplCaption),
        body: firstText(c?.ComplBody),
        tail: firstText(c?.ComplTail),
      }));
  }

  function collectQTakeoffRows(item: any): string[] {
    const rows: string[] = [];
    for (const qItem of arr(item?.QtyDeterm?.QDetermItem)) {
      for (const takeoff of arr(qItem?.QTakeoff)) {
        const rawRow =
          typeof takeoff?.Row === "string" ? takeoff.Row :
          typeof takeoff === "string" ? takeoff :
          typeof takeoff?._ === "string" ? takeoff._ :
          "";
        if (rawRow) rows.push(String(rawRow).padEnd(80, " ").slice(0, 80));
      }
    }
    return rows;
  }

  function collectSubDescriptions(item: any): any[] {
    return arr(item?.SubDescr).map((sub: any) => {
      const subText = pickItemText(sub);
      return {
        subDNo: firstText(sub?.SubDNo) || null,
        quantity: toImportNumber(firstText(sub?.Qty)),
        unit: firstText(sub?.QU),
        kurztext: subText.kurztext,
        langtext: subText.langtext,
      };
    });
  }

  function normalizeOneItem(item: any, prefix: string, fallbackNo: number, itemKind = "Item") {
    const rNo = cleanOz(
      firstValue(
        item?.RNoPart,
        item?.RNo,
        item?.ItemNumber,
        item?.PositionNumber,
        item?.OZ,
        item?.Nr,
        item?.No,
        item?.ID
      )
    );

    const prefixParts = cleanOz(prefix).split(".").filter(Boolean);
    const formattedPrefix = prefixParts.map((part, index) =>
      formatOzPart(part, categorySpecs[index])
    );
    const formattedItem = formatOzPart(rNo, itemSpec);
    const indexPart = cleanOz(firstValue(item?.RNoIndex));
    const formattedIndex = indexPart ? formatOzPart(indexPart, indexSpec) : "";
    const position = [...formattedPrefix, formattedItem, formattedIndex].filter(Boolean).join(".");

    if (!position) {
      return null;
    }
    const { kurztext, langtext } = pickItemText(item);

    const quantity = toImportNumber(
      firstText(item?.Qty, item?.QUANTITY, item?.Quantity, item?.V, item?.Menge)
    );

    const unit = firstText(item?.QU, item?.Unit, item?.U, item?.Einheit, item?.UoM);

    const ep = toImportNumber(
      itemKind === "MarkupItem"
        ? firstText(item?.Markup, item?.UP, item?.EP, item?.UnitPrice, item?.Price, item?.Einzelpreis, item?.UnitRate)
        : firstText(item?.UP, item?.EP, item?.UnitPrice, item?.Price, item?.Einzelpreis, item?.UnitRate)
    );
    const gaebMarkupBase = itemKind === "MarkupItem"
      ? toImportNumber(firstText(item?.ITMarkup))
      : null;

    const total = toImportNumber(
      firstText(item?.Total, item?.ITotal, item?.GP, item?.Gesamt, item?.Amount, item?.IT)
    );

    const gaebAlnGroupNoRaw = firstText(item?.ALNGroupNo);
    const gaebAlnSerNoRaw = firstText(item?.ALNSerNo);
    const gaebAlnGroupNo =
      gaebAlnGroupNoRaw !== "" && Number.isFinite(Number(gaebAlnGroupNoRaw))
        ? Number(gaebAlnGroupNoRaw)
        : null;
    const gaebAlnSerNo =
      gaebAlnSerNoRaw !== "" && Number.isFinite(Number(gaebAlnSerNoRaw))
        ? Number(gaebAlnSerNoRaw)
        : null;
    const gaebProvis = firstText(item?.Provis) || null;
    const gaebProvisAccpt = firstText(item?.ProvisAccpt) || null;
    const gaebAccepted = firstText(item?.Accepted) || null;

    if (!position && !kurztext && !langtext) return null;

    const safeKurztext = String(kurztext || "").trim();
    const safeLangtext = String(langtext || "").trim();

    /*
     * Wichtig für X84:
     * X84 enthält häufig nur Preis-/Mengeninformationen.
     * Wir erzeugen hier KEINEN künstlichen Text wie "Position 001".
     * Fehlende Texte werden später aus X81/X83 bzw. vorhandenem LV ergänzt.
     */
    return {
      pos: position,
      text: safeKurztext,
      langtext: safeLangtext,
      unit,
      quantity,
      ep,
      total,
      gaebAlnGroupNo,
      gaebAlnSerNo,
      gaebProvis,
      gaebProvisAccpt,
      gaebAccepted,
      gaebItemKind: itemKind,
      gaebMarkupType: firstText(item?.MarkupType) || null,
      gaebMarkupBase,
      gaebTextComplements: collectBidderComplements(item),
      gaebSubDescriptions: collectSubDescriptions(item),
      gaebImages: collectGaebImages(item?.Description),
      gaebQTakeoffRows: collectQTakeoffRows(item),
      gaebRawTextMissing: !safeKurztext && !safeLangtext,
    };
  }

  const gaebCategories: Array<{ path: string; level: number; label: string }> = [];

  function readItemsFromBoQ(root: any): any[] {
    const out: any[] = [];

    function pushItems(container: any, prefixParts: string[]) {
      const prefix = prefixParts.join('.');
      for (const item of arr(container?.Item)) {
        const row = normalizeOneItem(item, prefix, out.length + 1);
        if (row) out.push(row);
      }
      for (const item of arr(container?.Itemlist?.Item)) {
        const row = normalizeOneItem(item, prefix, out.length + 1, "Item");
        if (row) out.push(row);
      }
      for (const item of arr(container?.MarkupItem)) {
        const row = normalizeOneItem(item, prefix, out.length + 1, "MarkupItem");
        if (row) out.push(row);
      }
      for (const item of arr(container?.Itemlist?.MarkupItem)) {
        const row = normalizeOneItem(item, prefix, out.length + 1, "MarkupItem");
        if (row) out.push(row);
      }
    }

    function walkBody(body: any, prefixParts: string[]) {
      if (!body || typeof body !== 'object') return;

      pushItems(body, prefixParts);

      for (const ctgy of arr(body?.BoQCtgy)) {
        const raw = cleanOz(firstValue(ctgy?.RNoPart, ctgy?.RNo, ctgy?.Nr, ctgy?.No));
        const depth = prefixParts.length;
        const part = formatOzPart(raw, categorySpecs[depth]);
        const next = part ? [...prefixParts, part] : [...prefixParts];
        const categoryPath = next.join(".");
        if (categoryPath && !gaebCategories.some((c) => c.path === categoryPath)) {
          gaebCategories.push({
            path: categoryPath,
            level: next.length,
            label: firstText(ctgy?.LblTx, ctgy?.Description, ctgy?.Name, ctgy?.Text) || "",
          });
        }

        pushItems(ctgy, next);
        walkBody(ctgy?.BoQBody, next);
      }

      // Seltene GAEB-Varianten kapseln weitere BoQBody-Knoten direkt.
      for (const extra of arr(body?.BoQBody)) {
        walkBody(extra, prefixParts);
      }
    }

    const primaryBoQ =
      parsed?.GAEB?.Award?.BoQ ??
      parsed?.GAEB?.Award?.AwardInfo?.BoQ ??
      parsed?.GAEB?.QtyDeterm?.BoQ ??
      parsed?.GAEB?.BoQ ??
      parsed?.BoQ ??
      null;

    if (primaryBoQ) {
      for (const boq of arr(primaryBoQ)) {
        walkBody(boq?.BoQBody ?? boq, []);
      }
    }

    return out;
  }

  const title =
    firstText(
      parsed?.GAEB?.Award?.Project,
      parsed?.GAEB?.Award?.ProjectInfo?.Name,
      parsed?.GAEB?.PrjInfo?.NamePrj,
      parsed?.GAEB?.PrjInfo?.LblPrj,
      parsed?.GAEB?.Project,
      parsed?.Project
    ) || "GAEB Import";

  const currency =
    firstText(
      parsed?.GAEB?.Award?.Cur,
      parsed?.GAEB?.Award?.Currency,
      parsed?.GAEB?.Currency,
      parsed?.GAEB?.Award?.BoQ?.BoQInfo?.Cur
    ) || "EUR";

  const gaebRemarks: Array<{ text: string; detail: string; outline: string }> = [];
  const collectRemarks = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(collectRemarks);
      return;
    }
    for (const remark of arr((node as any)?.Remark)) {
      const detail = firstText(remark?.Description?.CompleteText?.DetailTxt?.Text);
      const outline = firstText(remark?.Description?.CompleteText?.OutlineText?.OutlTxt?.TextOutlTxt);
      const text = [outline, detail].filter(Boolean).join(" — ").trim();
      if (text && !gaebRemarks.some((r) => r.text === text)) gaebRemarks.push({ text, detail, outline });
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === "Remark") continue;
      if (value && typeof value === "object") collectRemarks(value);
    }
  };
  collectRemarks(parsed?.GAEB ?? parsed);

  let items = readItemsFromBoQ(parsed);


  if (!items.length) {
    items = collectGaebItemsDeep(parsed, []).filter(
      (x) => String(x?.pos || "").trim() || String(x?.text || "").trim()
    );
  }

  const seen = new Set<string>();
  items = items.filter((x) => {
    const pos = String(x?.pos || "").trim();
    const text = String(x?.text || "").trim();

    /*
     * GAEB large X83:
     * Durch Deep-Walk können identische Positionen aus mehreren XML-Wurzelknoten
     * erneut gefunden werden. Für LV-Import gilt: Positionsnummer ist eindeutig.
     */
    const key = pos ? `POS:${pos}` : `TEXT:${text}`;

    if (!pos && !text) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    title,
    currency,
    items,
    priceDate,
    priceDateSource,
    gaebVersion: firstText(parsed?.GAEB?.GAEBInfo?.Version, parsed?.GAEBInfo?.Version) || null,
    gaebVersDate: firstText(parsed?.GAEB?.GAEBInfo?.VersDate, parsed?.GAEBInfo?.VersDate) || null,
    gaebDp: firstText(parsed?.GAEB?.QtyDeterm?.DP, parsed?.GAEB?.Award?.DP, parsed?.QtyDeterm?.DP, parsed?.Award?.DP) || null,
    gaebBoQBreakdown: ozBreakdown.map((spec) => ({ type: spec.type, length: spec.length, numeric: spec.numeric })),
    gaebCategories,
    gaebRemarks,
  };
}

const lvImportUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 1,
  },
});

/*
 * Large GAEB collections are uploaded as several ZIP parts. Files go to disk
 * one part at a time, so a 500 MB collection is never held in Node memory.
 */
const GAEB_COLLECTION_ROOT = path.join(os.tmpdir(), "rlc-gaeb-collections");
fs.mkdirSync(GAEB_COLLECTION_ROOT, { recursive: true });

const GAEB_ARCHIVE_MAX_PARTS = 20;
const GAEB_ARCHIVE_MAX_COMPRESSED_BYTES = 1024 * 1024 * 1024; // 1 GB
const GAEB_ARCHIVE_MAX_FILES = 600;
const GAEB_ARCHIVE_MAX_ENTRY_BYTES = 64 * 1024 * 1024; // 64 MB
const GAEB_ARCHIVE_MAX_UNCOMPRESSED_BYTES = 512 * 1024 * 1024; // 512 MB

function zipEntrySize(entry: any): number {
  const value = Number(entry?.uncompressedSize ?? entry?.vars?.uncompressedSize ?? 0);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function assertZipArchiveLimits(entries: any[], label = "ZIP") {
  const files = entries.filter((entry: any) => entry?.type === "File");
  if (files.length > GAEB_ARCHIVE_MAX_FILES) {
    throw new Error(`${label}: Zu viele Dateien im Archiv (max. ${GAEB_ARCHIVE_MAX_FILES}).`);
  }
  let total = 0;
  for (const entry of files) {
    const name = String(entry?.path || "");
    if (name.includes("..") || name.startsWith("/") || name.startsWith("\\")) {
      throw new Error(`${label}: Unsicherer Archivpfad.`);
    }
    const size = zipEntrySize(entry);
    if (size > GAEB_ARCHIVE_MAX_ENTRY_BYTES) {
      throw new Error(`${label}: Datei zu groß: ${path.basename(name)}.`);
    }
    total += size;
    if (total > GAEB_ARCHIVE_MAX_UNCOMPRESSED_BYTES) {
      throw new Error(`${label}: Entpackte Gesamtgröße überschreitet 512 MB.`);
    }
  }
  return { files, total };
}

async function assert7zArchiveLimits(archivePath: string) {
  const result = await execFileAsync("7z", ["l", "-slt", archivePath], {
    maxBuffer: 8 * 1024 * 1024,
    timeout: 60_000,
  });
  const text = String(result.stdout || "");
  const records = text.split(/\r?\n\s*\r?\n/);
  let files = 0;
  let total = 0;
  for (const record of records) {
    const pathMatch = record.match(/^Path = (.+)$/m);
    const sizeMatch = record.match(/^Size = (\d+)$/m);
    const attrMatch = record.match(/^Attributes = (.+)$/m);
    if (!pathMatch || !sizeMatch) continue;
    const attrs = String(attrMatch?.[1] || "");
    if (/^D/i.test(attrs)) continue;
    if (/Symbolic Link =/i.test(record)) {
      throw new Error("7z: Symbolische Links sind nicht erlaubt.");
    }
    const entryPath = String(pathMatch[1] || "");
    if (entryPath.includes("..") || path.isAbsolute(entryPath)) {
      throw new Error("7z: Unsicherer Archivpfad.");
    }
    const size = Number(sizeMatch[1]);
    files += 1;
    if (files > GAEB_ARCHIVE_MAX_FILES) {
      throw new Error(`7z: Zu viele Dateien im Archiv (max. ${GAEB_ARCHIVE_MAX_FILES}).`);
    }
    if (size > GAEB_ARCHIVE_MAX_ENTRY_BYTES) {
      throw new Error(`7z: Datei zu groß: ${path.basename(entryPath)}.`);
    }
    total += size;
    if (total > GAEB_ARCHIVE_MAX_UNCOMPRESSED_BYTES) {
      throw new Error("7z: Entpackte Gesamtgröße überschreitet 512 MB.");
    }
  }
  return { files, total };
}

function assertCollectionParts(dir: string, partNames: string[]) {
  if (partNames.length > GAEB_ARCHIVE_MAX_PARTS) {
    throw new Error(`Zu viele Archivteile (max. ${GAEB_ARCHIVE_MAX_PARTS}).`);
  }
  const total = partNames.reduce((sum, name) => {
    const full = path.join(dir, name);
    return sum + (fs.existsSync(full) ? fs.statSync(full).size : 0);
  }, 0);
  if (total > GAEB_ARCHIVE_MAX_COMPRESSED_BYTES) {
    throw new Error("Komprimierte Archivgröße überschreitet 1 GB.");
  }
  return total;
}

function safeCollectionId(value: unknown): string | null {
  const id = String(value || "").trim();
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

function collectionDir(companyId: string, collectionId: string) {
  return path.join(GAEB_COLLECTION_ROOT, companyId, collectionId);
}

const gaebCollectionPartUpload = multer({
  storage: multer.diskStorage({
    destination: (req: any, _file: any, cb: any) => {
      const collectionId = safeCollectionId(req.params.collectionId);
      if (!collectionId) return cb(new Error("Ungültige Sammlungs-ID"), "");
      const dir = collectionDir(String((req as any).gaebCollectionCompanyId || "unknown"), collectionId);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req: any, file: any, cb: any) =>
      cb(null, path.basename(String(file.originalname || "teil.zip")).replace(/[^\w.\-]+/g, "_")),
  }),
  limits: { fileSize: 120 * 1024 * 1024, files: 1 },
});

function parseCsvLine(line: string, sep = ";"): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === sep && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur);
  return out;
}

function toImportNumber(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;

  let raw = String(v).trim();
  if (!raw) return null;

  raw = raw.replace(/\s+/g, "");

  if (raw.includes(",") && raw.includes(".")) {
    raw = raw.replace(/\./g, "").replace(",", ".");
  } else if (raw.includes(",")) {
    raw = raw.replace(",", ".");
  }

  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * GAEB 2000 / DA11 (P81-P86/P94): text container with #begin/#end blocks.
 * Independent from XML parsing because many real P83 files are Windows-1252
 * and contain RTF long texts.
 */
export function parseGaeb2000TextImport(source: string) {
  const field = (block: string, name: string) => {
    const re = new RegExp("\\[" + name + "\\]([\\s\\S]*?)\\[end\\]", "i");
    return String(block.match(re)?.[1] || "").trim();
  };
  const rtfToText = (value: string) =>
    String(value || "")
      .replace(/\\par[d]?/gi, "\n")
      .replace(/\\'([0-9a-f]{2})/gi, (_m, hex) =>
        iconv.decode(Buffer.from([parseInt(hex, 16)]), "cp1252"))
      .replace(/\\[a-z]+-?\d* ?/gi, "")
      .replace(/[{}]/g, "")
      .replace(/&#91;/g, "[").replace(/&#93;/g, "]")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

  type P83OzSpec = { type: "level" | "position" | "index" | "other"; length: number };

  const ozSpecs: P83OzSpec[] = Array.from(
    String(source || "").matchAll(/#begin\[LVGlied\]([\s\S]*?)#end\[LVGlied\]/gi)
  ).map((m) => {
    const block = String(m[1] || "");
    const typ = field(block, "Typ").toLowerCase();
    const length = Number(field(block, "Laenge") || 0);
    return {
      type: /lvstufe/i.test(typ) ? "level" : /position/i.test(typ) ? "position" : /index/i.test(typ) ? "index" : "other",
      length: Number.isFinite(length) ? length : 0,
    } as P83OzSpec;
  }).filter((x) => x.length > 0);

  const levelSpecs = ozSpecs.filter((x) => x.type === "level");
  const positionSpec = ozSpecs.find((x) => x.type === "position");
  const indexSpec = ozSpecs.find((x) => x.type === "index");

  const formatOz = (value: string) => {
    const original = String(value || "").trim();
    if (!original) return "";

    const tokens = original.split(/\s+/).filter(Boolean);
    const compact = tokens.join("");
    if (!ozSpecs.length) return original.replace(/\s+/g, "");
    const validCompact = indexSpec
      ? /^\d+[0-9A-Za-z]$/.test(compact)
      : /^\d+$/.test(compact);
    if (!validCompact) return original.replace(/\s+/g, "");

    const posLen = positionSpec?.length || 0;
    const indexLen = indexSpec?.length || 0;
    const tailLen = posLen + indexLen;
    if (!posLen || compact.length < posLen) return compact;

    const prefixLen = compact.length - tailLen;
    const out: string[] = [];
    let cursor = 0;

    for (const spec of levelSpecs) {
      if (cursor >= prefixLen) break;
      const remaining = prefixLen - cursor;
      if (remaining <= 0) break;
      const take = Math.min(spec.length, remaining);
      const part = compact.slice(cursor, cursor + take);
      if (part) out.push(/^\d+$/.test(part) ? part.padStart(spec.length, "0") : part);
      cursor += take;
    }

    // Falls ein reales P83 mehr Präfixstellen enthält als LVGlied-Level deklariert,
    // gehen diese nicht verloren, sondern bleiben als eigener OZ-Teil sichtbar.
    if (cursor < prefixLen) {
      const rest = compact.slice(cursor, prefixLen);
      if (rest) out.push(rest);
    }

    const posStart = prefixLen;
    const posPart = compact.slice(posStart, posStart + posLen);
    if (posPart) out.push(posPart.padStart(posLen, "0"));

    if (indexLen) {
      const idx = compact.slice(posStart + posLen, posStart + posLen + indexLen);
      if (idx) out.push(idx.padStart(indexLen, "0"));
    }

    return out.filter(Boolean).join(".");
  };

  const items: any[] = [];
  const positionRe = /#begin\[Position\]([\s\S]*?)#end\[Position\]/gi;
  let match: RegExpExecArray | null;
  while ((match = positionRe.exec(source))) {
    const block = match[1];
    const pos = formatOz(field(block, "OZ"));
    const text = rtfToText(field(block, "Kurztext"));
    const langtext = rtfToText(field(block, "Langtext"));
    if (!pos && !text && !langtext) continue;
    items.push({
      pos,
      text,
      langtext,
      unit: field(block, "ME"),
      quantity: toImportNumber(field(block, "Menge")),
      ep: toImportNumber(field(block, "EP") || field(block, "Einheitspreis")),
    });
  }

  return {
    title: field(source, "Beschreib") || field(source, "Bez") || "GAEB 2000 Import",
    currency: field(source, "Wae") || "EUR",
    items,
  };
}

/**
 * GAEB 90 (D81-D86): fixed records. Position header 21 is followed by
 * Kurztext records 25 and Langtext records 26 until the next structure/item.
 */
export function parseGaeb90TextImport(source: string) {
  const cp1252Map: Record<string, string> = {
    "\u0080": "€", "\u0082": "‚", "\u0084": "„", "\u0085": "…", "\u0086": "†",
    "\u0087": "‡", "\u0088": "ˆ", "\u0089": "‰", "\u008a": "Š", "\u008b": "‹",
    "\u008c": "Œ", "\u0091": "‘", "\u0092": "’", "\u0093": "“", "\u0094": "”",
    "\u0095": "•", "\u0096": "–", "\u0097": "—", "\u0098": "˜", "\u0099": "™",
    "\u009a": "š", "\u009b": "›", "\u009c": "œ", "\u009e": "ž", "\u009f": "Ÿ"
  };
  const cp1252 = (value: string) => String(value || "").replace(/[\u0080-\u009f]/g, (ch) => cp1252Map[ch] || ch);
  const clean = (line: string) => cp1252(String(line || "").slice(2, -6)).trim();
  const rawSource = String(source || "");
  const openingRecord = rawSource.split(/\r\n|\n|\r/).find((line) => line.startsWith("00")) || "";
  const ozMask = openingRecord.match(/([1234PIO0]{9})90(?=\s|$)/i)?.[1]?.toUpperCase() || "1122PPPPI";

  const formatOz = (raw: string) => {
    const field = String(raw || "").slice(0, 9).padEnd(9, " ");
    const parts: string[] = [];
    let i = 0;
    while (i < ozMask.length) {
      const token = ozMask[i];
      let j = i + 1;
      while (j < ozMask.length && ozMask[j] === token) j++;
      if (token !== "0" && /[1234PI]/.test(token)) {
        const width = j - i;
        const value = field.slice(i, j).trim();
        if (value) parts.push(/^\d+$/.test(value) ? value.padStart(width, "0") : value);
      }
      i = j;
    }
    if (parts.length) return parts.join(".");
    return String(raw || "").trim();
  };
  let lines = rawSource.split(/\r\n|\n|\r/).filter((line) => line.length > 0);

  // Reali GAEB-90 Dateien können als reine 80-Zeichen-Sätze ohne
  // klassische Zeilenumbrüche bzw. nur mit CR geliefert werden.
  // Falls dadurch nur ein langer Block entsteht, lesen wir ihn satzweise.
  if (lines.length <= 1 && rawSource.replace(/[\r\n]/g, "").length >= 80) {
    const compact = rawSource.replace(/[\r\n]/g, "");
    lines = [];
    for (let offset = 0; offset + 2 <= compact.length; offset += 80) {
      const record = compact.slice(offset, offset + 80);
      if (record.trim()) lines.push(record);
    }
  }

  // Auch bei gemischten Zeilenenden: überlange Blöcke werden in echte
  // GAEB-90-Sätze von 80 Zeichen zerlegt.
  lines = lines.flatMap((line) => {
    if (line.length <= 80) return [line];
    const out: string[] = [];
    for (let offset = 0; offset < line.length; offset += 80) {
      const record = line.slice(offset, offset + 80);
      if (record.trim()) out.push(record);
    }
    return out;
  });

  const items: any[] = [];
  let current: any = null;
  let title = "";

  for (const line of lines) {
    const type = line.slice(0, 2);
    if (type === "01" && !title) title = clean(line);
    if (type === "21") {
      if (current) items.push(current);
      const body = line.slice(2, -6);
      // GAEB 90 ME darf Ziffern enthalten (z.B. m2/m3). Die alte
      // Buchstaben-only Regex hat "m3" als "m" importiert und damit
      // Flächen-/Volumenpositionen fachlich verfälscht.
      const q = body.match(/(\d{11})([A-Za-z0-9²³.%/]{1,8})\s*(\d{11})?/);
      current = {
        pos: formatOz(body.slice(0, 9)),
        text: "",
        langtext: "",
        unit: q?.[2] || "",
        quantity: q ? Number(q[1]) / 1000 : null,
        ep: q?.[3] ? Number(q[3]) / 100 : null,
      };
      continue;
    }
    if (type === "22" || type === "23") {
      const body = line.slice(2, -6);
      const pos = formatOz(body.slice(0, 9));
      const priceMatch = body.slice(9).match(/^(\d{11})\s*(\d{12})?/);
      const ep = priceMatch?.[1] ? Number(priceMatch[1]) / 1000 : null;
      const total = priceMatch?.[2] ? Number(priceMatch[2]) / 100 : null;

      if (current && current.pos === pos) {
        current.ep = ep;
        current.total = total;
      } else {
        if (current) items.push(current);
        current = {
          pos,
          text: "",
          langtext: "",
          unit: "",
          quantity: null,
          ep,
          total,
        };
      }
      continue;
    }

    if (!current) continue;
    if (type === "25") current.text = (current.text + (current.text ? " " : "") + clean(line)).trim();
    if (type === "26") {
      const txt = clean(line);
      const marker = txt.match(/^RLC-Original-OZ:\s*(.+)$/i);
      if (marker?.[1]) current.pos = marker[1].trim();
      else current.langtext = (current.langtext + (current.langtext ? " " : "") + txt).trim();
    }
    if ([ "11", "12", "20", "31", "99" ].includes(type)) {
      if (current) items.push(current);
      current = null;
    }
  }
  if (current) items.push(current);

  return { title: title || "GAEB 90 Import", currency: "EUR", items };
}

/**
 * Outlook MSG is a CFB container. It is not itself a GAEB file: extract one
 * supported attachment and route it to the same GAEB/PDF/Excel parser.
 */
async function parseSupportedLvAttachment(filename: string, buffer: Buffer, depth = 0): Promise<any | null> {
  const lower = String(filename || "").toLowerCase();
  const legacy = buffer.toString("latin1");
  let parsed: any = null;
  let detectedType = "";

  if (/\.p(81|82|83|84|85|86|94)$/i.test(lower) || legacy.trimStart().startsWith("#begin[GAEB]")) {
    parsed = parseGaeb2000TextImport(iconv.decode(buffer, "cp1252"));
    const extMatch = lower.match(/\.p(81|82|83|84|85|86|94)$/i);
    detectedType = extMatch ? "p" + extMatch[1] : "p83";
  } else if (/\.d(81|82|83|84|85|86)$/i.test(lower) || /^00\s{8,}/m.test(legacy)) {
    parsed = parseGaeb90TextImport(iconv.decode(buffer, "cp850"));
    const extMatch = lower.match(/\.d(81|82|83|84|85|86)$/i);
    detectedType = extMatch ? "d" + extMatch[1] : "d83";
  } else if (/\.(x(80|81|82|83|84|85|86|89|94)|xml|gaeb)$/i.test(lower)) {
    parsed = await parseGaebXmlImport(buffer.toString("utf8"));
    const extMatch = lower.match(/\.x(80|81|82|83|84|85|86|89|94)$/i);
    detectedType = extMatch ? "x" + extMatch[1] : lower.endsWith(".gaeb") ? "gaeb" : "xml";
  } else if (/\.(xlsx|xls)$/i.test(lower)) {
    parsed = parseExcelImport(buffer, filename);
    detectedType = lower.endsWith(".xls") ? "xls" : "xlsx";
  } else if (lower.endsWith(".pdf")) {
    parsed = await parsePdfImport(buffer, filename);
    detectedType = "pdf";
  } else if (lower.endsWith(".zip") && depth < 2) {
    const archive = await unzipper.Open.buffer(buffer);
    assertZipArchiveLimits(archive.files, "ZIP-Anhang");
    const candidates = archive.files
      .filter((entry: any) => entry.type === "File")
      .filter((entry: any) =>
        /\.(x(80|81|82|83|84|85|86|89|94)|p(81|82|83|84|85|86|94)|d(81|82|83|84|85|86)|xml|gaeb|pdf|xlsx|xls|zip)$/i.test(String(entry.path || ""))
      );

    const priority = (name: string) => {
      const value = name.toLowerCase();
      if (/\.x83$/i.test(value)) return 100;
      if (/\.d83$/i.test(value)) return 95;
      if (/\.p83$/i.test(value)) return 90;
      if (/\.x8[0-9]$/i.test(value)) return 85;
      if (/\.d8[1-6]$/i.test(value)) return 80;
      if (/\.p(81|82|83|84|85|86|94)$/i.test(value)) return 75;
      if (/\.(xml|gaeb)$/i.test(value)) return 70;
      if (/\.(xlsx|xls)$/i.test(value)) return 50;
      if (/\.pdf$/i.test(value)) return 40;
      if (/\.zip$/i.test(value)) return 10;
      return 0;
    };

    candidates.sort((a: any, b: any) => priority(String(b.path || "")) - priority(String(a.path || "")));

    const tried: string[] = [];
    for (const entry of candidates) {
      const entryName = String(entry.path || "").trim();
      if (!entryName) continue;
      tried.push(entryName);
      const entryBuffer = await entry.buffer();
      try {
        const nested = await parseSupportedLvAttachment(entryName, entryBuffer, depth + 1);
        if (nested?.parsed?.items?.length) {
          return {
            ...nested,
            containerName: filename,
            sourcePath: [filename, nested.sourcePath || entryName].filter(Boolean).join(" → "),
            archiveEntries: candidates.map((x: any) => String(x.path || "")).filter(Boolean),
          };
        }
      } catch {
        // Prossimo allegato nello ZIP: un PDF non leggibile non deve bloccare
        // un GAEB valido presente nello stesso archivio.
      }
    }

    return {
      parsed: null,
      detectedType: "zip",
      sourceAttachmentName: filename,
      sourcePath: filename,
      archiveEntries: tried,
    };
  } else {
    return null;
  }

  return {
    parsed,
    detectedType,
    sourceAttachmentName: filename,
    sourcePath: filename,
  };
}

/**
 * Outlook MSG is a CFB container. It is not itself a GAEB file: extract one
 * supported attachment (anche dentro ZIP) and route it to the same parser.
 */
async function parseOutlookMsgImport(buffer: Buffer) {
  const CFB = (XLSX as any).CFB;
  if (!CFB?.read) throw new Error("MSG-Parser nicht verfügbar.");

  const cfb = CFB.read(buffer, { type: "buffer" });
  const paths: string[] = Array.isArray(cfb?.FullPaths) ? cfb.FullPaths : [];
  const entries: any[] = Array.isArray(cfb?.FileIndex) ? cfb.FileIndex : [];
  const readStream = (fullPath: string) => {
    const idx = paths.findIndex((p) => String(p).toLowerCase() === fullPath.toLowerCase());
    const content = idx >= 0 ? entries[idx]?.content : null;
    return content ? Buffer.from(content) : Buffer.alloc(0);
  };
  const decodeUnicode = (value: Buffer) =>
    value.length ? value.toString("utf16le").replace(/\u0000+$/g, "").trim() : "";
  const decodeAnsi = (value: Buffer) =>
    value.length ? value.toString("latin1").replace(/\u0000+$/g, "").trim() : "";
  const readStringProperty = (unicodeTag: RegExp, ansiTag: RegExp) => {
    const unicodePath = paths.find((p) => unicodeTag.test(String(p)));
    if (unicodePath) {
      const value = decodeUnicode(readStream(unicodePath));
      if (value) return value;
    }
    const ansiPath = paths.find((p) => ansiTag.test(String(p)));
    return ansiPath ? decodeAnsi(readStream(ansiPath)) : "";
  };

  const subject = readStringProperty(/__substg1\.0_0037001f$/i, /__substg1\.0_0037001e$/i);
  const senderName = readStringProperty(/__substg1\.0_0c1a001f$/i, /__substg1\.0_0c1a001e$/i);
  const senderEmail =
    readStringProperty(/__substg1\.0_5d01001f$/i, /__substg1\.0_5d01001e$/i) ||
    readStringProperty(/__substg1\.0_0c1f001f$/i, /__substg1\.0_0c1f001e$/i);

  const attachmentRoots = Array.from(new Set(paths
    .map((p) => String(p).match(/^(.*__attach_version1\.0_#\d+\/)/i)?.[1])
    .filter(Boolean) as string[]));

  const attachments = attachmentRoots.map((root) => {
    const filename =
      decodeUnicode(readStream(root + "__substg1.0_3707001F")) ||
      decodeUnicode(readStream(root + "__substg1.0_3704001F")) ||
      decodeAnsi(readStream(root + "__substg1.0_3707001E")) ||
      decodeAnsi(readStream(root + "__substg1.0_3704001E")) ||
      "Anhang";
    return {
      filename,
      buffer: readStream(root + "__substg1.0_37010102"),
    };
  }).filter((a) => a.buffer.length > 0);

  const candidates = attachments.filter((a) =>
    /\.(x(80|81|82|83|84|85|86|89|94)|p(81|82|83|84|85|86|94)|d(81|82|83|84|85|86)|xml|gaeb|pdf|xlsx|xls|zip)$/i.test(a.filename)
  );

  if (!candidates.length) {
    const names = attachments.map((a) => a.filename).filter(Boolean).join(", ");
    throw new Error(
      names
        ? "MSG enthält keinen importierbaren LV/GAEB-Anhang. Gefunden: " + names
        : "MSG enthält keine Dateianhänge."
    );
  }

  const priority = (name: string) => {
    const value = name.toLowerCase();
    if (/\.x83$/i.test(value)) return 100;
    if (/\.d83$/i.test(value)) return 95;
    if (/\.p83$/i.test(value)) return 90;
    if (/\.zip$/i.test(value)) return 88;
    if (/\.x8[0-9]$/i.test(value)) return 85;
    if (/\.d8[1-6]$/i.test(value)) return 80;
    if (/\.p(81|82|83|84|85|86|94)$/i.test(value)) return 75;
    if (/\.(xml|gaeb)$/i.test(value)) return 70;
    if (/\.(xlsx|xls)$/i.test(value)) return 50;
    if (/\.pdf$/i.test(value)) return 40;
    return 0;
  };
  candidates.sort((a, b) => priority(b.filename) - priority(a.filename));

  let selected: any = null;
  for (const candidate of candidates) {
    try {
      const result = await parseSupportedLvAttachment(candidate.filename, candidate.buffer, 0);
      if (result?.parsed?.items?.length) {
        selected = result;
        break;
      }
    } catch {
      // Un allegato non leggibile non deve impedire di usare il successivo.
    }
  }

  if (!selected?.parsed?.items?.length) {
    throw new Error(
      "MSG erkannt, aber weder direkte Anhänge noch ZIP-Inhalte enthalten importierbare LV-/GAEB-Positionen. Gefunden: " +
      candidates.map((a) => a.filename).join(", ")
    );
  }

  return {
    ...selected.parsed,
    title: String(selected.parsed?.title || subject || "Outlook MSG Import"),
    sourceAttachmentName: selected.sourceAttachmentName,
    sourcePath: selected.sourcePath || selected.sourceAttachmentName,
    archiveEntries: selected.archiveEntries || [],
    detectedType: selected.detectedType,
    msgMeta: {
      subject,
      senderName,
      senderEmail,
      attachments: attachments.map((a) => a.filename),
    },
  };
}

function normalizeImportItems(itemsRaw: any[]): any[] {
  return (Array.isArray(itemsRaw) ? itemsRaw : [])
    .map((p: any, i: number) => {
      const quantity =
        typeof p?.quantity === "number"
          ? p.quantity
          : typeof p?.menge === "number"
            ? p.menge
            : toImportNumber(p?.quantity ?? p?.menge);

      const ep =
        typeof p?.ep === "number"
          ? p.ep
          : typeof p?.einzelpreis === "number"
            ? p.einzelpreis
            : toImportNumber(p?.ep ?? p?.einzelpreis);

      const position = String(p?.pos ?? p?.position ?? i + 1).trim();
      const kurztext = String(p?.text ?? p?.kurztext ?? "").trim();
      const langtext = p?.langtext ? String(p.langtext).trim() : "";

      return {
        position,
        kurztext,
        langtext,
        einheit: String(p?.unit ?? p?.einheit ?? "").trim(),
        menge: quantity,
        einzelpreis: ep,

        // GAEB/X84-Metadaten: wichtig für spätere LV-Anreicherung und KI
        total:
          typeof p?.total === "number"
            ? p.total
            : toImportNumber(p?.total ?? p?.gesamt ?? p?.gp ?? p?.amount),
        gaebAlnGroupNo: Number.isFinite(Number(p?.gaebAlnGroupNo ?? p?.alnGroupNo)) ? Number(p?.gaebAlnGroupNo ?? p?.alnGroupNo) : null,
        gaebAlnSerNo: Number.isFinite(Number(p?.gaebAlnSerNo ?? p?.alnSerNo)) ? Number(p?.gaebAlnSerNo ?? p?.alnSerNo) : null,
        gaebProvis: p?.gaebProvis ? String(p.gaebProvis) : null,
        gaebProvisAccpt: p?.gaebProvisAccpt ? String(p.gaebProvisAccpt) : null,
        gaebAccepted: p?.gaebAccepted ? String(p.gaebAccepted) : null,
        gaebRawTextMissing: Boolean(p?.gaebRawTextMissing || (!kurztext && !langtext)),
      };
    })
    .filter((x) => x.position || x.kurztext);
}

function parseCsvImport(text: string) {
  const lines = String(text || "")
    .replace(/^\uFEFF/, "")
    .replace(/\r/g, "")
    .split("\n")
    .filter((l) => l.trim() !== "");

  if (!lines.length) {
    return {
      title: "Importiertes LV",
      currency: "EUR",
      items: [],
    };
  }

  const headers = parseCsvLine(lines[0], ";").map((s) => s.trim().toLowerCase());
  const idx = (alts: string[]) => headers.findIndex((h) => alts.includes(h));

  const iPos = idx(["posnr", "positionsnummer", "pos", "position"]);
  const iKurz = idx(["kurztext", "kurz", "bezeichnung", "text"]);
  const iLang = idx(["langtext", "beschreibung", "longtext"]);
  const iME = idx(["me", "einheit", "eh", "unit"]);
  const iMenge = idx(["menge", "qty", "quantity"]);
  const iEP = idx(["ep", "einheitspreis", "preis", "einzelpreis"]);

  const items: any[] = [];

  for (let r = 1; r < lines.length; r++) {
    const cols = parseCsvLine(lines[r], ";");
    if (cols.length === 1 && cols[0].trim() === "") continue;

    const row = {
      pos: String(iPos >= 0 ? cols[iPos] ?? "" : r).trim(),
      text: String(iKurz >= 0 ? cols[iKurz] ?? "" : "").trim(),
      langtext: String(iLang >= 0 ? cols[iLang] ?? "" : "").trim(),
      unit: String(iME >= 0 ? cols[iME] ?? "" : "").trim(),
      quantity: iMenge >= 0 ? toImportNumber(cols[iMenge]) : null,
      ep: iEP >= 0 ? toImportNumber(cols[iEP]) : null,
    };

    if (!row.pos && !row.text) continue;
    items.push(row);
  }

  return {
    title: "Importiertes LV",
    currency: "EUR",
    items,
  };
}

function parseJsonImport(text: string) {
  const parsed = JSON.parse(text);
  const title =
    typeof parsed?.title === "string" && parsed.title.trim()
      ? parsed.title.trim()
      : "Importiertes LV";

  const currency =
    typeof parsed?.currency === "string" && parsed.currency.trim()
      ? parsed.currency.trim().toUpperCase()
      : "EUR";

  const itemsRaw = Array.isArray(parsed?.items)
    ? parsed.items
    : Array.isArray(parsed)
      ? parsed
      : [];

  return {
    title,
    currency,
    items: itemsRaw,
  };
}

function fileBaseName(name: string) {
  return String(name || "Importiertes LV")
    .replace(/\.[^.]+$/, "")
    .trim();
}

function parseExcelImport(buffer: Buffer, filename = "Importiertes LV") {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = wb.SheetNames?.[0];

  if (!firstSheetName) {
    return {
      title: fileBaseName(filename),
      currency: "EUR",
      items: [],
    };
  }

  const ws = wb.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, {
    header: 1,
    defval: "",
    raw: false,
  });

  if (!Array.isArray(rows) || !rows.length) {
    return {
      title: fileBaseName(filename),
      currency: "EUR",
      items: [],
    };
  }

  const normalizedRows = rows.map((r) =>
    Array.isArray(r) ? r.map((x) => String(x ?? "").trim()) : []
  );

  const headerIndex = normalizedRows.findIndex((row) => {
    const joined = row.join(" ").toLowerCase();
    return (
      joined.includes("positionsnummer") ||
      joined.includes("pos") ||
      joined.includes("kurztext") ||
      joined.includes("einheit") ||
      joined.includes("menge") ||
      joined.includes("einheitspreis")
    );
  });

  const startHeader = headerIndex >= 0 ? headerIndex : 0;
  const headers = (normalizedRows[startHeader] || []).map((s) => s.toLowerCase());

  const idx = (alts: string[]) => headers.findIndex((h) => alts.includes(h));

  const iPos = idx(["posnr", "positionsnummer", "pos", "position"]);
  const iKurz = idx(["kurztext", "kurz", "bezeichnung", "text"]);
  const iLang = idx(["langtext", "beschreibung", "longtext"]);
  const iME = idx(["me", "einheit", "eh", "unit"]);
  const iMenge = idx(["menge", "qty", "quantity"]);
  const iEP = idx(["ep", "einheitspreis", "preis", "einzelpreis"]);

  const items: any[] = [];

  for (let r = startHeader + 1; r < normalizedRows.length; r++) {
    const cols = normalizedRows[r];
    if (!cols || !cols.some((x) => String(x || "").trim())) continue;

    const row = {
      pos: String(iPos >= 0 ? cols[iPos] ?? "" : r).trim(),
      text: String(iKurz >= 0 ? cols[iKurz] ?? "" : "").trim(),
      langtext: String(iLang >= 0 ? cols[iLang] ?? "" : "").trim(),
      unit: String(iME >= 0 ? cols[iME] ?? "" : "").trim(),
      quantity: iMenge >= 0 ? toImportNumber(cols[iMenge]) : null,
      ep: iEP >= 0 ? toImportNumber(cols[iEP]) : null,
    };

    if (!row.pos && !row.text) continue;
    items.push(row);
  }

  return {
    title: fileBaseName(filename),
    currency: "EUR",
    items,
  };
}

  async function parsePdfImport(buffer: Buffer, filename = "Importiertes LV") {
  let parsed: any;

  try {
    parsed = await pdfParse(buffer);
  } catch (err: any) {
    const msg = String(err?.message || "");

    console.error("[PDF-IMPORT] ERROR:", msg);

    if (
      msg.includes("bad XRef entry") ||
      msg.includes("Illegal character") ||
      msg.includes("FormatError")
    ) {
      throw new Error(
        "PDF beschädigt oder nicht kompatibel. Bitte PDF neu exportieren oder XLSX/GAEB verwenden."
      );
    }

    throw err;
  }
  const text = String(parsed?.text || "").replace(/\r/g, "");

  const lines = text
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const items: any[] = [];

  const ignoreLine = (line: string) => {
    const v = String(line || "").trim();
    if (!v) return true;

    return (
      [
        "Leistungsverzeichnis",
        "Pos",
        "Kurztext",
        "ME",
        "Menge",
        "EP",
        "Gesamt",
      ].includes(v) ||
      /^Projekt:/i.test(v) ||
      /^Version:/i.test(v) ||
      /^Titel:/i.test(v) ||
      /^Gesamtsumme:/i.test(v) ||
      /^[\d.,]+\s*EUR$/i.test(v)
    );
  };

  const isPos = (line: string) => /^\d+(?:\.\d+)+$/.test(String(line || "").trim());

  const isUnit = (line: string) =>
    /^(m|m2|m²|m3|m³|St|Stk|Psch|kg|t|h|d|l)$/i.test(String(line || "").trim());

  const isNumberLine = (line: string) =>
    /^[\d.,]+$/.test(String(line || "").trim());

  const cleaned = lines.filter((line) => !ignoreLine(line));

  // Variante 1: PDF a righe complete
  for (const line of cleaned) {
    const m = line.match(
      /^(\d+(?:\.\d+)+)\s+(.+?)\s+(m|m2|m²|m3|m³|St|Stk|Psch|kg|t|h|d|l)\s+([\d.,]+)\s+([\d.,]+)(?:\s+([\d.,]+))?$/i
    );

    if (m) {
      items.push({
        pos: String(m[1]).trim(),
        text: String(m[2]).trim(),
        langtext: "",
        unit: String(m[3]).trim(),
        quantity: toImportNumber(m[4]),
        ep: toImportNumber(m[5]),
        gesamt: m[6] ? toImportNumber(m[6]) : null,
      });
    }
  }

  // Variante 2: PDF a colonne verticali
  if (!items.length) {
    for (let i = 0; i < cleaned.length; i++) {
      const pos = String(cleaned[i] ?? "").trim();
      if (!isPos(pos)) continue;

      const textLine = String(cleaned[i + 1] ?? "").trim();
      const unitLine = String(cleaned[i + 2] ?? "").trim();
      const qtyLine = String(cleaned[i + 3] ?? "").trim();
      const epLine = String(cleaned[i + 4] ?? "").trim();
      const totalLine = String(cleaned[i + 5] ?? "").trim();

      if (!textLine) continue;
      if (!isUnit(unitLine)) continue;
      if (!isNumberLine(qtyLine)) continue;
      if (!isNumberLine(epLine)) continue;

      items.push({
        pos,
        text: textLine,
        langtext: "",
        unit: unitLine,
        quantity: toImportNumber(qtyLine),
        ep: toImportNumber(epLine),
        gesamt: isNumberLine(totalLine) ? toImportNumber(totalLine) : null,
      });

      i += 5;
    }
  }

  return {
    title: fileBaseName(filename),
    currency: "EUR",
    items,
  };
}

function gaebPositionKey(value: unknown): string {
  return String(value ?? "").trim().split(/[._]/).filter(Boolean).map((part) => String(Number(part))).join(".");
}

async function storeGaebX84Reference(projectId: string, items: any[]) {
  const header = await selectCleanOriginalLvHeader(projectId);
  if (!header?.id) throw new Error("X83-LV fehlt: X84 kann nicht zugeordnet werden.");

  const base = await prisma.lVPosition.findMany({
    where: { lvId: header.id }, orderBy: { position: "asc" },
  });
  const priced = items.filter((row: any) => num(row?.ep ?? row?.einzelpreis) > 0);
  const byExact = new Map(base.map((p) => [gaebPositionKey(p.position), p]));
  const pairs: Array<{ position: any; x84: any }> = [];
  const used = new Set<string>();

  for (const row of priced) {
    const position = byExact.get(gaebPositionKey(row?.pos ?? row?.position));
    if (position && !used.has(position.id)) {
      pairs.push({ position, x84: row }); used.add(position.id);
    }
  }

  // Alcuni generatori X84 omettono i livelli dell'OZ. Se file e LV hanno
  // lo stesso numero di posizioni, l'ordine GAEB è l'unico abbinamento sicuro.
  if (pairs.length < priced.length && priced.length === base.length) {
    pairs.length = 0;
    for (let index = 0; index < base.length; index += 1) pairs.push({ position: base[index], x84: priced[index] });
  }

  await prisma.$transaction(pairs.map(({ position, x84 }) => {
    const ep = num(x84?.ep ?? x84?.einzelpreis);
    const total = num(x84?.total ?? x84?.gesamt) || Number((Number(position.menge) * ep).toFixed(2));
    return prisma.lVPosition.update({ where: { id: position.id }, data: { x84UnitPrice: ep, x84Total: total } });
  }));

  const rows = await prisma.lVPosition.findMany({ where: { lvId: header.id }, orderBy: { position: "asc" } });
  return { header, count: pairs.length, rows, unmatched: Math.max(0, priced.length - pairs.length) };
}

async function importLvItemsIntoNewVersion(args: {
  projectId: string;
  title?: string;
  currency?: string;
  priceDate?: string | null;
  priceDateSource?: string | null;
  itemsRaw: any[];
}) {
  const last = await prisma.lVHeader.findFirst({
    where: { projectId: args.projectId },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  const nextVersion = (last?.version || 0) + 1;

  const parsedPriceDate = args.priceDate
    ? new Date(args.priceDate)
    : null;

  const safePriceDate =
    parsedPriceDate && Number.isFinite(parsedPriceDate.getTime())
      ? parsedPriceDate
      : null;

  const header = await prisma.lVHeader.create({
    data: {
      projectId: args.projectId,
      title: args.title || "Importiertes LV",
      currency: args.currency || "EUR",
      version: nextVersion,
      priceDate: safePriceDate,
      priceDateSource: safePriceDate
        ? args.priceDateSource || null
        : null,
    },
  });

  const normalized = normalizeImportItems(args.itemsRaw);

  const data = normalized
  .filter((p) => {
    const pos = String(p.position ?? "").trim();
    const text = String(p.kurztext ?? "").trim();
    const langtext = String(p.langtext ?? "").trim();
    if (!pos && !text && !langtext) return false;
    if (text === "EUR" && !langtext) return false;
    return true;
  })
  .map((p) => {
    const menge = typeof p.menge === "number" && Number.isFinite(p.menge) ? p.menge : 0;
    const einzelpreis =
      typeof p.einzelpreis === "number" && Number.isFinite(p.einzelpreis)
        ? p.einzelpreis
        : null;

    const total =
      typeof (p as any).total === "number" && Number.isFinite((p as any).total)
        ? Number((p as any).total)
        : null;

    return {
      lvId: header.id,
      position: String(p.position ?? "").trim(),
      kurztext: String(p.kurztext ?? "").trim(),
      langtext: String(p.langtext ?? "").trim(),
      einheit: String(p.einheit ?? "").trim(),
      menge,
      einzelpreis,
      gesamt:
        total !== null
          ? Number(total.toFixed(2))
          : typeof einzelpreis === "number"
            ? Number((menge * einzelpreis).toFixed(2))
            : null,
    };
  });

  if (data.length) {
    await prisma.lVPosition.createMany({ data });
  }

  return {
    header,
    count: data.length,
    items: normalized,
  };
}

/*
 * Collection upload: one 100 MB ZIP part per request, then server-side
 * reassembly and a non-destructive preview of the GAEB files inside.
 */
router.get("/collection/latest", requireLvCollectionRole, async (req, res) => {
  try {
    const companyId = await ensureCompanyId(req);
    const base = path.join(GAEB_COLLECTION_ROOT, companyId);
    const candidates = fs.existsSync(base)
      ? fs.readdirSync(base)
          .map((name) => ({ name, full: path.join(base, name) }))
          .filter((entry) => safeCollectionId(entry.name) && fs.statSync(entry.full).isDirectory())
          .filter((entry) => fs.readdirSync(entry.full).some((name) => /\.(?:zip|7z)(?:\.\d{3})?$/i.test(name)))
          .sort((a, b) => fs.statSync(b.full).mtimeMs - fs.statSync(a.full).mtimeMs)
      : [];
    return res.json({ ok: true, collectionId: candidates[0]?.name || null });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "Letzte Sammlung konnte nicht geöffnet werden." });
  }
});

router.post("/collection/start", requireLvCollectionRole, async (req, res) => {
  try {
    const companyId = await ensureCompanyId(req);
    const collectionId = randomUUID();
    fs.mkdirSync(collectionDir(companyId, collectionId), { recursive: true });
    return res.json({ ok: true, collectionId, partLimitMb: 120 });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "Sammlung konnte nicht gestartet werden." });
  }
});

router.post(
  "/collection/:collectionId/part",
  requireLvCollectionRole,
  async (req, res, next) => {
    try {
      (req as any).gaebCollectionCompanyId = await ensureCompanyId(req);
      next();
    } catch (e) {
      next(e);
    }
  },
  gaebCollectionPartUpload.single("file"),
  (req, res) => {
    const collectionId = safeCollectionId(req.params.collectionId);
    const file = (req as any).file;
    if (!collectionId || !file) return res.status(400).json({ ok: false, error: "ZIP-Teil fehlt." });
    const name = String(file.originalname || "").toLowerCase();
    if (!/\.(?:zip|7z)(?:\.\d{3})?$/i.test(name)) {
      fs.unlinkSync(file.path);
      return res.status(415).json({ ok: false, error: "Nur .zip/.7z oder geteilte Archive .zip.001/.7z.001 usw. sind erlaubt." });
    }
    return res.json({ ok: true, name: file.originalname, size: file.size });
  }
);

router.post("/collection/:collectionId/preview", requireLvCollectionRole, async (req, res) => {
  let combinedPath = "";
  try {
    const companyId = await ensureCompanyId(req);
    const collectionId = safeCollectionId(req.params.collectionId);
    if (!collectionId) return res.status(400).json({ ok: false, error: "Ungültige Sammlungs-ID." });
    const dir = collectionDir(companyId, collectionId);
    const partNames = fs.existsSync(dir)
      ? fs.readdirSync(dir).filter((name) => /\.(?:zip|7z)(?:\.\d{3})?$/i.test(name))
      : [];
    if (!partNames.length) return res.status(400).json({ ok: false, error: "Keine Archivteile hochgeladen." });
    assertCollectionParts(dir, partNames);

    const numbered = partNames.filter((name) => /\.(?:zip|7z)\.\d{3}$/i.test(name));
    const plainArchive = partNames.filter((name) => /\.(?:zip|7z)$/i.test(name));
    if (numbered.length && plainArchive.length) {
      return res.status(400).json({ ok: false, error: "Bitte entweder ein einzelnes Archiv oder alle Teile eines geteilten Archivs hochladen." });
    }
    const archiveExt = (numbered[0] || plainArchive[0] || "").match(/\.(zip|7z)(?:\.\d{3})?$/i)?.[1]?.toLowerCase();
    if (!archiveExt || partNames.some((name) => !new RegExp("\\." + archiveExt + "(?:\\.\\d{3})?$", "i").test(name))) {
      return res.status(400).json({ ok: false, error: "Eine Sammlung darf nicht ZIP- und 7z-Dateien mischen." });
    }

    if (numbered.length) {
      const ordered = numbered.sort((a, b) => Number(a.slice(-3)) - Number(b.slice(-3)));
      if (Number(ordered[0].slice(-3)) !== 1 || ordered.some((name, index) => Number(name.slice(-3)) !== index + 1)) {
        return res.status(400).json({ ok: false, error: "ZIP-Teile sind unvollständig. Erwartet werden fortlaufend .001, .002, …" });
      }
      combinedPath = path.join(dir, "__combined." + archiveExt);
      const output = fs.createWriteStream(combinedPath);
      for (const name of ordered) await pipeline(fs.createReadStream(path.join(dir, name)), output, { end: false });
      output.end();
      await new Promise<void>((resolve, reject) => { output.once("finish", resolve); output.once("error", reject); });
    } else {
      combinedPath = path.join(dir, plainArchive[0]);
    }

    const allowed = /\.(?:x(?:80|81|82|83|84|85|86|89|94)|p(?:81|82|83|84|85|86|94)|d(?:81|82|83|84|85|86)|xml|gaeb)$/i;
    let archiveFiles: Array<{ entryPath: string; size: number }> = [];
    if (archiveExt === "zip") {
      const zip = await unzipper.Open.file(combinedPath);
      assertZipArchiveLimits(zip.files, "GAEB-ZIP");
      archiveFiles = zip.files
        .filter((entry: any) => entry.type === "File" && allowed.test(entry.path) && !entry.path.includes(".."))
        .slice(0, 500)
        .map((entry: any) => ({ entryPath: String(entry.path), size: Number(entry.uncompressedSize || 0) }));
    } else {
      const extractDir = path.join(dir, "__extracted");
      fs.rmSync(extractDir, { recursive: true, force: true });
      fs.mkdirSync(extractDir, { recursive: true });
      await assert7zArchiveLimits(combinedPath);
      await execFileAsync("7z", ["x", "-y", "-o" + extractDir, combinedPath], { maxBuffer: 2 * 1024 * 1024, timeout: 180_000 });
      const extractRoot = path.resolve(extractDir) + path.sep;
      const walk = (base: string): string[] => fs.readdirSync(base, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(base, entry.name);
        const stat = fs.lstatSync(full);
        if (stat.isSymbolicLink()) throw new Error("7z: Symbolische Links sind nicht erlaubt.");
        const resolved = path.resolve(full);
        if (!resolved.startsWith(extractRoot)) throw new Error("7z: Unsicherer Extraktionspfad.");
        return stat.isDirectory() ? walk(full) : [full];
      });
      archiveFiles = walk(extractDir)
        .filter((full) => allowed.test(full))
        .slice(0, 500)
        .map((full) => ({ entryPath: path.relative(extractDir, full), size: fs.statSync(full).size }));
    }
    const canonicalGaebBaseName = (fileName: string) =>
      path.basename(fileName)
        .replace(/\.(?:x\d+|p\d+|d\d+|xml|gaeb)$/i, "")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();

    const files = archiveFiles.map((entry) => {
      const name = path.basename(entry.entryPath);
      const format = String(name.match(/\.(x\d+|p\d+|d\d+|xml|gaeb)$/i)?.[1] || "").toUpperCase();
      const m = name.match(/(BA[-_ ]?20\d{2}[-_ ]?\d{3})/i);
      const projectCode = m ? m[1].replace(/[_ ]/g, "-").toUpperCase() : "";
      const displayName = name.replace(/\.(?:x\d+|p\d+|d\d+|xml|gaeb)$/i, "");
      const nameKey = canonicalGaebBaseName(name);
      return { name, path: entry.entryPath, format, projectCode, displayName, nameKey, size: entry.size };
    });

    // Prefer an explicit RLC project code. Older external GAEB files usually
    // have no BA-… code, so pair their X83/X84 by the identical filename stem.
    const groupedFiles = files.reduce((map: Map<string, any[]>, file: any) => {
      const key = file.projectCode ? `project:${file.projectCode}` : `name:${file.nameKey || file.name}`;
      map.set(key, [...(map.get(key) || []), file]);
      return map;
    }, new Map<string, any[]>());

    const groups = (Array.from(groupedFiles.entries()) as Array<[string, any[]]>).map(([, groupFiles]) => {
      const first = groupFiles[0];
      return {
        projectCode: first.projectCode || first.displayName,
        grouping: first.projectCode ? "Projektcode" : "Dateiname",
        x83: groupFiles.filter((file: any) => /^(X83|P83|D83)$/i.test(file.format)).map((file: any) => file.name),
        x84: groupFiles.filter((file: any) => /^(X84|P84|D84)$/i.test(file.format)).map((file: any) => file.name),
        other: groupFiles.filter((file: any) => !/^(X83|P83|D83|X84|P84|D84)$/i.test(file.format)).map((file: any) => file.name),
      };
    });

    return res.json({ ok: true, collectionId, uploadedParts: partNames.length, files, groups });
  } catch (e: any) {
    console.error("[GAEB-COLLECTION] preview", e);
    return res.status(400).json({ ok: false, error: e?.message || "ZIP-Sammlung konnte nicht gelesen werden." });
  } finally {
    if (path.basename(combinedPath).startsWith("__combined.") && fs.existsSync(combinedPath)) fs.unlinkSync(combinedPath);
  }
});

function collectionNameKey(fileName: string) {
  return path.basename(fileName)
    .replace(/\.(?:x\d+|p\d+|d\d+|xml|gaeb)$/i, "")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function collectionProjectCode(displayName: string) {
  const clean = displayName
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 54);
  return `GAEB-${clean || "IMPORT"}`;
}

export async function parseCollectionGaebBuffer(buffer: Buffer, originalName: string) {
  const lower = originalName.toLowerCase();
  const text = buffer.toString("utf8");
  const legacyText = buffer.toString("latin1");
  if (/\.p(81|82|83|84|85|86|94)$/i.test(lower) || legacyText.trimStart().startsWith("#begin[GAEB]")) {
    const ext = lower.match(/\.p(81|82|83|84|85|86|94)$/i)?.[1];
    return { parsed: parseGaeb2000TextImport(iconv.decode(buffer, "cp1252")), type: ext ? `p${ext}` : "p83" };
  }
  if (/\.d(81|82|83|84|85|86)$/i.test(lower) || /^00\s{8,}/m.test(legacyText)) {
    const ext = lower.match(/\.d(81|82|83|84|85|86)$/i)?.[1];
    return { parsed: parseGaeb90TextImport(iconv.decode(buffer, "cp850")), type: ext ? `d${ext}` : "d83" };
  }
  if (/\.(x(80|81|82|83|84|85|86|89|94)|xml|gaeb)$/i.test(lower) || /<GAEB|<BoQ|<Item|RNoPart/i.test(text)) {
    const ext = lower.match(/\.x(80|81|82|83|84|85|86|89|94)$/i)?.[1];
    return { parsed: await parseGaebXmlImport(text), type: ext ? `x${ext}` : "x83" };
  }
  throw new Error("Nicht unterstützter GAEB-Dateityp: " + originalName);
}

/**
 * Creates one project per technical LV. X84/P84/D84 are stored only as
 * reference prices on the matching X83/P83/D83 project.
 */
router.post("/collection/:collectionId/import", requireLvCollectionRole, async (req, res) => {
  let combinedPath = "";
  let extractDir = "";
  try {
    const companyId = await ensureCompanyId(req);
    const collectionId = safeCollectionId(req.params.collectionId);
    if (!collectionId) return res.status(400).json({ ok: false, error: "Ungültige Sammlungs-ID." });
    const dir = collectionDir(companyId, collectionId);
    const partNames = fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => /\.(?:zip|7z)(?:\.\d{3})?$/i.test(name)) : [];
    if (!partNames.length) return res.status(400).json({ ok: false, error: "Keine Archivteile vorhanden." });
    assertCollectionParts(dir, partNames);

    const numbered = partNames.filter((name) => /\.(?:zip|7z)\.\d{3}$/i.test(name));
    const plain = partNames.filter((name) => /\.(?:zip|7z)$/i.test(name));
    const ext = (numbered[0] || plain[0] || "").match(/\.(zip|7z)(?:\.\d{3})?$/i)?.[1]?.toLowerCase();
    if (!ext || (numbered.length && plain.length)) return res.status(400).json({ ok: false, error: "Archivteile sind nicht eindeutig." });

    if (numbered.length) {
      const ordered = numbered.sort((a, b) => Number(a.slice(-3)) - Number(b.slice(-3)));
      if (Number(ordered[0].slice(-3)) !== 1 || ordered.some((name, index) => Number(name.slice(-3)) !== index + 1)) {
        return res.status(400).json({ ok: false, error: "Archivteile unvollständig: fortlaufende .001, .002, … erwartet." });
      }
      combinedPath = path.join(dir, "__import." + ext);
      const output = fs.createWriteStream(combinedPath);
      for (const name of ordered) await pipeline(fs.createReadStream(path.join(dir, name)), output, { end: false });
      output.end();
      await new Promise<void>((resolve, reject) => { output.once("finish", resolve); output.once("error", reject); });
    } else combinedPath = path.join(dir, plain[0]);

    const allowed = /\.(?:x83|p83|d83|x84|p84|d84)$/i;
    const source: Array<{ name: string; buffer: Buffer }> = [];
    if (ext === "zip") {
      const zip = await unzipper.Open.file(combinedPath);
      assertZipArchiveLimits(zip.files, "GAEB-ZIP");
      for (const entry of zip.files.filter((x: any) => x.type === "File" && allowed.test(x.path) && !x.path.includes(".."))) {
        source.push({ name: path.basename(entry.path), buffer: await (entry as any).buffer() });
      }
    } else {
      extractDir = path.join(dir, "__import_extract");
      fs.rmSync(extractDir, { recursive: true, force: true });
      fs.mkdirSync(extractDir, { recursive: true });
      await assert7zArchiveLimits(combinedPath);
      await execFileAsync("7z", ["x", "-y", "-o" + extractDir, combinedPath], { maxBuffer: 2 * 1024 * 1024, timeout: 180_000 });
      const extractRoot = path.resolve(extractDir) + path.sep;
      const walk = (base: string): string[] => fs.readdirSync(base, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(base, entry.name);
        const stat = fs.lstatSync(full);
        if (stat.isSymbolicLink()) throw new Error("7z: Symbolische Links sind nicht erlaubt.");
        const resolved = path.resolve(full);
        if (!resolved.startsWith(extractRoot)) throw new Error("7z: Unsicherer Extraktionspfad.");
        return stat.isDirectory() ? walk(full) : [full];
      });
      for (const full of walk(extractDir).filter((file) => allowed.test(file))) source.push({ name: path.basename(full), buffer: fs.readFileSync(full) });
    }

    const grouped = new Map<string, Array<{ name: string; buffer: Buffer }>>();
    for (const file of source) {
      const key = collectionNameKey(file.name);
      grouped.set(key, [...(grouped.get(key) || []), file]);
    }

    const importedTechnicalHashes = new Set<string>();
    if (fs.existsSync(PROJECTS_ROOT)) {
      for (const projectDir of fs.readdirSync(PROJECTS_ROOT)) {
        const importsDir = path.join(PROJECTS_ROOT, projectDir, "imports");
        if (!fs.existsSync(importsDir) || !fs.statSync(importsDir).isDirectory()) continue;
        for (const importName of fs.readdirSync(importsDir)) {
          if (!/\.(?:x83|p83|d83)$/i.test(importName)) continue;
          const importPath = path.join(importsDir, importName);
          try {
            const hash = createHash("sha256").update(fs.readFileSync(importPath)).digest("hex");
            importedTechnicalHashes.add(hash);
          } catch {
            // Ein defektes Alt-File darf den Sammelimport nicht blockieren.
          }
        }
      }
    }

    const results: any[] = [];
    for (const [key, files] of grouped) {
      const technical = files.find((f) => /\.x83$/i.test(f.name)) || files.find((f) => /\.p83$/i.test(f.name)) || files.find((f) => /\.d83$/i.test(f.name));
      if (!technical) {
        results.push({ name: key, status: "skipped", reason: "Kein technisches X83/P83/D83" });
        continue;
      }
      const technicalHash = createHash("sha256").update(technical.buffer).digest("hex");
      if (importedTechnicalHashes.has(technicalHash)) {
        results.push({ name: technical.name, status: "skipped", reason: "Identisches technisches LV bereits vorhanden" });
        continue;
      }
      const parsedTech = await parseCollectionGaebBuffer(technical.buffer, technical.name);
      const items = Array.isArray(parsedTech.parsed?.items)
        ? parsedTech.parsed.items.filter((row: any) => {
            const pos = String(row?.pos ?? row?.position ?? row?.RNoPart ?? row?.RNo ?? "").trim();
            const text = String(row?.text ?? row?.kurztext ?? "").trim();
            const langtext = String(row?.langtext ?? "").trim();
            const unit = String(row?.unit ?? row?.einheit ?? "").trim();
            const qty = Number(row?.quantity ?? row?.menge);
            return Boolean(pos || text || langtext || unit || Number.isFinite(qty));
          })
        : [];
      if (!items.length) {
        results.push({ name: technical.name, status: "error", reason: "Keine gültigen LV-Positionen" });
        continue;
      }
      const displayName = technical.name.replace(/\.(?:x83|p83|d83)$/i, "");
      const codeBase = collectionProjectCode(displayName);
      const alreadyImported = await prisma.project.findFirst({
        where: { companyId, code: codeBase, description: "GAEB-Sammelimport" },
        select: { id: true, code: true },
      });
      if (alreadyImported) {
        results.push({ name: displayName, status: "skipped", reason: "Technisches LV bereits importiert", projectCode: alreadyImported.code });
        continue;
      }
      let code = codeBase;
      let suffix = 2;
      while (await prisma.project.findFirst({ where: { companyId, code } })) code = `${codeBase.slice(0, 58)}-${suffix++}`;
      const project = await prisma.project.create({ data: { companyId, code, name: String(parsedTech.parsed?.title || displayName).slice(0, 180), description: "GAEB-Sammelimport" } });

      const creatorRole = String(req?.auth?.companyRole || req?.auth?.role || "").trim().toUpperCase();
      const creatorUserId = String(req?.auth?.sub || "").trim();
      if (creatorUserId && !["ADMIN", "ADMINISTRATOR"].includes(creatorRole)) {
        const projectRole = creatorRole === "KALKULATOR" ? "KALKULATOR" : "BAULEITER";
        await prisma.projectMember.upsert({
          where: { projectId_userId: { projectId: project.id, userId: creatorUserId } },
          update: { role: projectRole as any },
          create: {
            projectId: project.id,
            userId: creatorUserId,
            role: projectRole as any,
            canDownload: true,
          },
        });
      }

      const imported = await importLvItemsIntoNewVersion({ projectId: project.id, title: String(parsedTech.parsed?.title || displayName), currency: parsedTech.parsed?.currency || "EUR", itemsRaw: items });
      const sourcePath = path.join(PROJECTS_ROOT, project.id, "imports", technical.name.replace(/[^\w.\-]+/g, "_"));
      fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
      fs.writeFileSync(sourcePath, technical.buffer);
      importedTechnicalHashes.add(technicalHash);
      archiveLvDms(project, "LV-Import_" + path.basename(sourcePath), sourcePath, { source: "gaeb.collection", format: parsedTech.type, originalName: technical.name, lvVersion: imported.header.version });

      const benchmark = files.find((f) => /\.x84$/i.test(f.name)) || files.find((f) => /\.p84$/i.test(f.name)) || files.find((f) => /\.d84$/i.test(f.name));
      let benchmarkCount = 0;
      if (benchmark) {
        try {
          const parsedBenchmark = await parseCollectionGaebBuffer(benchmark.buffer, benchmark.name);
          const stored = await storeGaebX84Reference(project.id, parsedBenchmark.parsed.items || []);
          benchmarkCount = stored.count || 0;
          archiveLvBufferDms(project, "X84-Vergleich_" + benchmark.name.replace(/[^\w.\-]+/g, "_"), benchmark.buffer, { source: "gaeb.collection.reference", format: parsedBenchmark.type, originalName: benchmark.name });
        } catch (error: any) {
          results.push({ name: benchmark.name, status: "warning", reason: "X84 nicht verknüpft: " + (error?.message || error) });
        }
      }
      results.push({ name: displayName, status: "imported", projectCode: project.code, positions: imported.count, benchmarkCount });
    }
    return res.json({ ok: true, imported: results.filter((r) => r.status === "imported").length, skipped: results.filter((r) => r.status === "skipped").length, results });
  } catch (e: any) {
    console.error("[GAEB-COLLECTION] import", e);
    return res.status(400).json({ ok: false, error: e?.message || "Sammelübernahme fehlgeschlagen." });
  } finally {
    if (extractDir && fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
    if (combinedPath && path.basename(combinedPath).startsWith("__import.") && fs.existsSync(combinedPath)) fs.unlinkSync(combinedPath);
  }
});

router.post("/:projectId/import", async (req, res) => {
  try {
    const companyId = await ensureCompanyId(req);
    const projectIdOrCode = String(req.params.projectId || "").trim();

    if (!projectIdOrCode) {
      return res.status(400).json({ ok: false, error: "projectId fehlt" });
    }

    const project = await resolveProject(companyId, projectIdOrCode);

    if (!project) {
      return res.status(404).json({
        ok: false,
        error: "Projekt nicht gefunden",
      });
    }

    const projectId = project.id;
    const itemsRaw = Array.isArray(req.body?.items) ? req.body.items : (Array.isArray(req.body?.rows) ? req.body.rows : []);

    if (!itemsRaw.length) {
      return res.status(400).json({
        ok: false,
        error: "Keine LV items übergeben",
      });
    }

    const last = await prisma.lVHeader.findFirst({
      where: { projectId },
      orderBy: { version: "desc" },
      select: { version: true },
    });

    const nextVersion = (last?.version || 0) + 1;

    const header = await prisma.lVHeader.create({
      data: {
        projectId,
        title: req.body?.title || "Importiertes LV",
        currency: req.body?.currency || "EUR",
        version: nextVersion,
      },
    });

    const data = itemsRaw.map((p: any, i: number) => {
    const quantityRaw =
  typeof p.quantity === "number"
    ? p.quantity
    : typeof p.menge === "number"
      ? p.menge
      : Number(p.quantity ?? p.menge);

const epRaw =
  typeof p.ep === "number"
    ? p.ep
    : typeof p.einzelpreis === "number"
      ? p.einzelpreis
      : Number(p.ep ?? p.einzelpreis);

const quantity = Number.isFinite(quantityRaw) ? quantityRaw : 0;
const ep = Number.isFinite(epRaw) ? epRaw : null;

return {
  lvId: header.id,
  position: String(p.pos ?? p.position ?? i + 1).trim(),
  kurztext: String(p.text ?? p.kurztext ?? "").trim(),
  langtext: p.langtext ? String(p.langtext).trim() : "",
  einheit: String(p.unit ?? p.einheit ?? "").trim(),
  menge: quantity,
  einzelpreis: ep,
  gesamt:
    typeof ep === "number"
      ? Number((quantity * ep).toFixed(2))
      : null,
  gaebAlnGroupNo: Number.isFinite(Number(p.gaebAlnGroupNo ?? p.alnGroupNo)) ? Number(p.gaebAlnGroupNo ?? p.alnGroupNo) : null,
  gaebAlnSerNo: Number.isFinite(Number(p.gaebAlnSerNo ?? p.alnSerNo)) ? Number(p.gaebAlnSerNo ?? p.alnSerNo) : null,
  gaebProvis: p.gaebProvis ? String(p.gaebProvis) : null,
  gaebProvisAccpt: p.gaebProvisAccpt ? String(p.gaebProvisAccpt) : null,
  gaebAccepted: p.gaebAccepted ? String(p.gaebAccepted) : null,
};
    });

    if (data.length) {
      await prisma.lVPosition.createMany({ data });
    }

    return res.json({
      ok: true,
      headerId: header.id,
      count: data.length,
    });
  } catch (e) {
    console.error("[LV-IMPORT] error", e);
    return res.status(500).json({
      ok: false,
      error: "Import failed",
    });
  }
});

type GaebImportRole = "technical" | "bid-reference" | "trade-price-reference" | "transaction" | "generic";

function normalizeGaebDetectedType(value: string): string {
  const raw = String(value || "").toLowerCase();
  return raw.includes("/") ? raw.split("/").pop() || raw : raw;
}

export function gaebImportRole(value: string): GaebImportRole {
  const fmt = normalizeGaebDetectedType(value);
  if (/^[xpd](81|82|83)$/.test(fmt)) return "technical";
  if (/^[xpd]84$/.test(fmt)) return "bid-reference";
  if (/^[xp]94$/.test(fmt)) return "trade-price-reference";
  if (/^[xpd](85|86)$/.test(fmt) || /^x(89)$/.test(fmt)) return "transaction";
  return "generic";
}

router.post("/:projectId/parse-x31", lvImportUpload.single("file"), async (req, res) => {
  try {
    const companyId = await ensureCompanyId(req);
    const projectIdOrCode = String(req.params.projectId || "").trim();
    const project = await resolveProject(companyId, projectIdOrCode);
    if (!project) return res.status(404).json({ ok: false, error: "Projekt nicht gefunden" });
    const file = req.file;
    if (!file?.buffer?.length) return res.status(400).json({ ok: false, error: "X31-Datei fehlt" });
    const originalName = String(file.originalname || "mengenermittlung.x31");
    if (!/\.x31$/i.test(originalName)) return res.status(400).json({ ok: false, error: "Nur X31 wird hier unterstützt." });
    const xml = file.buffer.toString("utf8").replace(/^\uFEFF/, "");
    if (!/GAEB_DA_XML\/DA31\/3\.3/i.test(xml) || !/<DP>\s*31\s*<\/DP>/i.test(xml)) {
      return res.status(400).json({ ok: false, error: "Datei ist keine GAEB DA XML X31 (DP31)." });
    }
    const parsed: any = await parseGaebXmlImport(xml);
    const baseRows = (parsed.items || []).map((item: any) => ({
      pos: item.pos,
      qTakeoffRows: Array.isArray(item.gaebQTakeoffRows) ? item.gaebQTakeoffRows : [],
    }));
    const evaluation = evaluateReb23003Positions(baseRows);
    const rows = baseRows.map((row: any) => {
      const result = evaluation.get(row.pos);
      return {
        ...row,
        calculatedQuantity: result?.total ?? 0,
        rebErrors: result?.errors ?? [],
        imageRefs: result?.images ?? [],
        evaluatedLines: result?.lines ?? [],
      };
    });
    return res.json({
      ok: true,
      format: "x31",
      count: rows.length,
      rows,
      gaebVersion: parsed.gaebVersion || "3.3",
      gaebVersDate: parsed.gaebVersDate || null,
      gaebBoQBreakdown: parsed.gaebBoQBreakdown || [],
      sourceName: originalName,
    });
  } catch (e: any) {
    console.error("[GAEB-X31 PARSE]", e);
    return res.status(400).json({ ok: false, error: e?.message || "X31 konnte nicht gelesen werden." });
  }
});

router.post("/:projectId/export-x31", express.json({ limit: "20mb" }), async (req, res) => {
  try {
    const companyId = await ensureCompanyId(req);
    const projectIdOrCode = String(req.params.projectId || "").trim();
    const project = await resolveProject(companyId, projectIdOrCode);
    if (!project) return res.status(404).json({ ok: false, error: "Projekt nicht gefunden" });

    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ ok: false, error: "Keine X31-Aufmaßdaten vorhanden." });

    const versDateRaw = String(req.body?.versDate || "2023-01").trim();
    const versDate = versDateRaw === "2021-05" ? "2021-05" : "2023-01";
    const xml = buildGaebX31Xml({
      rows,
      project: { code: project.code, name: project.name },
      versDate,
      methodDescription: String(req.body?.methodDescription || "REB23003-2009"),
      awardNo: req.body?.awardNo ? String(req.body.awardNo) : null,
      dpNo: req.body?.dpNo ? String(req.body.dpNo) : null,
    });

    const sourceName = String(req.body?.sourceName || "").trim();
    const cleanSourceName = sourceName && /\.x31$/i.test(sourceName)
      ? sourceName.replace(/[^0-9A-Za-zÄÖÜäöüß._ -]+/g, "_")
      : "";
    const filename = cleanSourceName
      ? `Ex${cleanSourceName}`
      : `Mengenermittlung_${String(project.code || "Projekt").replace(/[^0-9A-Za-z._-]+/g, "_")}.X31`;
    archiveLvBufferDms(project, filename, Buffer.from(xml, "utf8"), {
      source: "aufmass.export.gaeb.x31",
      format: "x31",
      gaebVersion: "3.3",
      gaebVersDate: versDate,
    });

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("X-RLC-GAEB-Version", "3.3");
    res.setHeader("X-RLC-GAEB-Schema", `GAEB_DA_XML_31_3.3_${versDate}`);
    return res.send(xml);
  } catch (e: any) {
    console.error("[GAEB-X31 EXPORT]", e);
    return res.status(400).json({ ok: false, error: e?.message || "X31 konnte nicht exportiert werden." });
  }
});

router.post("/:projectId/import-file", lvImportUpload.single("file"), async (req, res) => {
  try {
    const companyId = await ensureCompanyId(req);
    const projectIdOrCode = String(req.params.projectId || "").trim();

    if (!projectIdOrCode) {
      return res.status(400).json({ ok: false, error: "projectId fehlt" });
    }

    const project = await resolveProject(companyId, projectIdOrCode);

    if (!project) {
      return res.status(404).json({
        ok: false,
        error: "Projekt nicht gefunden",
      });
    }

    const file = (req as any).file;
    if (!file) {
      return res.status(400).json({
        ok: false,
        error: "Datei fehlt",
      });
    }

    const originalName = String(file.originalname || "import.dat");
    const lower = originalName
      .toLowerCase()
      .replace(/[\u0000-\u001f\u007f]+/g, "")
      .trim();
    const text = Buffer.isBuffer(file.buffer) ? file.buffer.toString("utf8") : "";
    const legacyText = Buffer.isBuffer(file.buffer) ? file.buffer.toString("latin1") : "";
    const isGaeb2000Text =
      /\.p(81|82|83|84|85|86|94)$/i.test(lower) ||
      legacyText.trimStart().startsWith("#begin[GAEB]");
    const isGaeb90Text =
      /\.d(81|82|83|84|85|86)$/i.test(lower) ||
      /^00\s{8,}/m.test(legacyText);
    const isGaebXmlLike =
      /\.x(80|81|82|83|84|85|86|89|94)$/i.test(lower) ||
      lower.endsWith(".xml") ||
      lower.endsWith(".gaeb") ||
      text.includes("<GAEB") ||
      text.includes("<BoQ") ||
      text.includes("<Item") ||
      text.includes("RNoPart");

    let parsed: {
      title: string;
      currency: string;
      items: any[];
      priceDate?: string | null;
      priceDateSource?: string | null;
    } | null = null;
    let detectedType = "unknown";

    if (lower.endsWith(".json")) {
      parsed = parseJsonImport(text);
      detectedType = "json";
    } else if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
      parsed = parseCsvImport(text);
      detectedType = "csv";
    } else if (lower.endsWith(".msg")) {
      const msgImport = await parseOutlookMsgImport(file.buffer);
      parsed = msgImport;
      detectedType = "msg/" + msgImport.detectedType;
    } else if (isGaeb2000Text) {
      parsed = parseGaeb2000TextImport(iconv.decode(file.buffer, "cp1252"));
      const extMatch = lower.match(/\.p(81|82|83|84|85|86|94)$/i);
      detectedType = extMatch ? "p" + extMatch[1] : "p83";
    } else if (isGaeb90Text) {
      parsed = parseGaeb90TextImport(iconv.decode(file.buffer, "cp850"));
      const extMatch = lower.match(/\.d(81|82|83|84|85|86)$/i);
      detectedType = extMatch ? "d" + extMatch[1] : "d83";
    } else if (isGaebXmlLike) {
      parsed = await parseGaebXmlImport(text);
      const extMatch = lower.match(/\.x(80|81|82|83|84|85|86|89|94)$/i);
      detectedType = extMatch ? `x${extMatch[1]}` : lower.endsWith(".gaeb") ? "gaeb" : "xml";

        /*
         * X83 enthält LV-Texte.
         * Deep-Walk findet zusätzlich leere Struktur-/Mengenfragmente.
         * Diese dürfen bei X83 nicht als echte LV-Positionen gespeichert werden.
         * X84 bleibt unberührt, weil dort Texte fehlen können.
         */
        if (detectedType === "x83" && parsed?.items?.length) {
          parsed.items = parsed.items.filter((row: any) => {
            const text = String(row?.text || row?.kurztext || "").trim();
            const lang = String(row?.langtext || "").trim();
            return Boolean(text || lang);
          });
        }
    } else if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
      parsed = parseExcelImport(file.buffer, originalName);
      detectedType = lower.endsWith(".xls") ? "xls" : "xlsx";
    } else if (lower.endsWith(".pdf")) {
      parsed = await parsePdfImport(file.buffer, originalName);
      detectedType = "pdf";
    } else {
      return res.status(415).json({
        ok: false,
        error: "Nicht unterstützter Dateityp",
      });
    }

    if (!parsed || !Array.isArray(parsed.items) || !parsed.items.length) {
      return res.status(400).json({
        ok: false,
        error:
          detectedType.startsWith("msg/")
            ? "Outlook MSG erkannt. Der Anhang " + String((parsed as any)?.sourceAttachmentName || "") + " enthält keine gültigen LV-/GAEB-Positionen und kann deshalb nicht in der GAEB-Kalkulation importiert werden."
            : detectedType === "pdf"
              ? "PDF erkannt, aber keine LV-Positionen gefunden. Unterstützt wird aktuell nur textbasierter PDF-Inhalt, kein Scan/OCR."
              : "Datei erkannt, aber keine gültigen LV-Positionen gefunden.",
      });
    }

    const importRole = gaebImportRole(detectedType);
    let imported: any;

    if (importRole === "bid-reference" || importRole === "trade-price-reference") {
      try {
        imported = await storeGaebX84Reference(project.id, parsed.items);
        parsed.items = (imported as any).rows.map((p: any) => ({
          id: p.id, pos: p.position, position: p.position, text: p.kurztext,
          kurztext: p.kurztext, langtext: p.langtext || "", unit: p.einheit,
          einheit: p.einheit, quantity: p.menge, menge: p.menge,
          ep: p.x84UnitPrice ?? 0, einzelpreis: p.x84UnitPrice ?? 0,
          x84UnitPrice: p.x84UnitPrice ?? 0, x84Total: p.x84Total ?? 0,
        }));
      } catch (error: any) {
        const message = String(error?.message || error || "");
        if (!message.includes("X83-LV fehlt")) throw error;
        imported = {
          header: null,
          count: parsed.items.length,
          rows: parsed.items,
          unmatched: parsed.items.length,
          warning: "Basis-LV fehlt: Preise können erst nach Import des zugehörigen D83/P83/X83 zugeordnet werden."
        };
      }
    } else if (importRole === "transaction") {
      const header = await selectCleanOriginalLvHeader(project.id) ||
        await prisma.lVHeader.findFirst({ where: { projectId: project.id }, orderBy: { version: "desc" } });
      imported = { header, count: parsed.items.length, rows: parsed.items, unmatched: 0 };
    } else {
      imported = await importLvItemsIntoNewVersion({
        projectId: project.id,
        title: parsed.title,
        currency: parsed.currency,
        priceDate: parsed.priceDate ?? null,
        priceDateSource: parsed.priceDateSource ?? null,
        itemsRaw: parsed.items,
      });
    }

    const safeImportName =
      path.basename(originalName).replace(/[^\w.\-]+/g, "_") || "lv-import.dat";
    const importsDir = path.join(PROJECTS_ROOT, project.id, "imports");
    fs.mkdirSync(importsDir, { recursive: true });
    const importedSourcePath = path.join(importsDir, safeImportName);
    fs.writeFileSync(importedSourcePath, file.buffer);

    archiveLvDms(project, `LV-Import_${safeImportName}`, importedSourcePath, {
      source: "lv.import",
      format: detectedType,
      originalName,
      lvVersion: imported.header?.version ?? null,
      importRole
    });

    return res.json({
      ok: true,
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
      },
      headerId: imported.header?.id ?? null,
      version: imported.header?.version ?? null,
      count: imported.count,
      detectedType,
      format: detectedType,
      importRole,
      warning: imported?.warning ?? null,
      unmatched: imported?.unmatched ?? 0,
      priceDate: parsed.priceDate ?? null,
      priceDateSource: parsed.priceDateSource ?? null,
      sourceAttachmentName: (parsed as any).sourceAttachmentName ?? null,
      sourcePath: (parsed as any).sourcePath ?? null,
      archiveEntries: (parsed as any).archiveEntries ?? [],
      msgMeta: (parsed as any).msgMeta ?? null,
      gaebRemarks: (parsed as any).gaebRemarks ?? [],
      gaebVersion: (parsed as any).gaebVersion ?? null,
      gaebVersDate: (parsed as any).gaebVersDate ?? null,
      gaebBoQBreakdown: (parsed as any).gaebBoQBreakdown ?? [],
      gaebCategories: (parsed as any).gaebCategories ?? [],
      items: parsed.items,
      rows: parsed.items,
      positions: parsed.items,
    });
  } catch (e: any) {
    console.error("[LV-IMPORT-FILE] error", e);
    return res.status(500).json({
      ok: false,
      error: e?.message || "Import file failed",
    });
  }
});

async function getLatestLvHeaderOrCreate(projectId: string, title = "Importiertes LV") {
  const latest = await prisma.lVHeader.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
  });

  if (latest) return latest;

  return prisma.lVHeader.create({
    data: {
      projectId,
      title,
      currency: "EUR",
      version: 1,
    },
  });
}

function toNullableNumber(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function resolveProjectOrFail(req: Request, res: Response) {
  const companyId = await ensureCompanyId(req);
  const projectIdOrCode = String(req.params.projectId || "").trim();

  if (!projectIdOrCode) {
    res.status(400).json({ ok: false, error: "projectId fehlt" });
    return null;
  }

  const project = await resolveProject(companyId, projectIdOrCode);
  if (!project) {
    res.status(404).json({ ok: false, error: "Projekt nicht gefunden" });
    return null;
  }

  return project;
}

router.post("/:projectId/position", async (req, res) => {
  try {
    const project = await resolveProjectOrFail(req, res);
    if (!project) return;

    const header = await getLatestLvHeaderOrCreate(
      project.id,
      req.body?.headerTitle || "Importiertes LV"
    );

    const pos = String(req.body?.pos ?? req.body?.position ?? "").trim();
    const text = String(req.body?.text ?? req.body?.kurztext ?? "").trim();
    const langtext =
      req.body?.langtext !== undefined && req.body?.langtext !== null
        ? String(req.body.langtext)
        : "";
    const unit = String(req.body?.unit ?? req.body?.einheit ?? "").trim();

    const quantity = toNullableNumber(req.body?.quantity ?? req.body?.menge);
    const ep = toNullableNumber(req.body?.ep ?? req.body?.einzelpreis);
    const parentPos =
      req.body?.parentPos !== undefined && req.body?.parentPos !== null
        ? String(req.body.parentPos)
        : null;

    if (!pos) {
      return res.status(400).json({ ok: false, error: "Position fehlt" });
    }

    if (!text) {
      return res.status(400).json({ ok: false, error: "Kurztext fehlt" });
    }

    if (!unit) {
      return res.status(400).json({ ok: false, error: "Einheit fehlt" });
    }

    const created = await prisma.lVPosition.create({
      data: {
        lvId: header.id,
        position: pos,
        kurztext: text,
        langtext,
        einheit: unit,
        menge: quantity ?? 0,
        einzelpreis: ep,
        gesamt:
          typeof quantity === "number" && typeof ep === "number"
            ? Number((quantity * ep).toFixed(2))
            : null,
        parentPos,
      },
    });

    return res.json({
      ok: true,
      item: {
        id: created.id,
        pos: created.position,
        text: created.kurztext,
        langtext: created.langtext || "",
        unit: created.einheit,
        quantity: Number(created.menge ?? 0),
        ep: created.einzelpreis != null ? Number(created.einzelpreis) : 0,
      },
    });
  } catch (e: any) {
    console.error("[LV-POSITION-CREATE] error", e);
    return res.status(500).json({ ok: false, error: e?.message || "Create failed" });
  }
});

router.patch("/:projectId/position/:positionId", async (req, res) => {
  try {
    const project = await resolveProjectOrFail(req, res);
    if (!project) return;

    const positionId = String(req.params.positionId || "").trim();
    if (!positionId) {
      return res.status(400).json({ ok: false, error: "positionId fehlt" });
    }

    const latest = await prisma.lVHeader.findFirst({
      where: { projectId: project.id },
      orderBy: { version: "desc" },
      select: { id: true },
    });

    if (!latest) {
      return res.status(404).json({ ok: false, error: "Kein LV vorhanden" });
    }

    const existing = await prisma.lVPosition.findFirst({
      where: {
        id: positionId,
        lvId: latest.id,
      },
    });

    if (!existing) {
      return res.status(404).json({ ok: false, error: "Position nicht gefunden" });
    }

    const nextQuantityRaw =
      req.body?.quantity !== undefined ? req.body.quantity : req.body?.menge;
    const nextEpRaw = req.body?.ep !== undefined ? req.body.ep : req.body?.einzelpreis;

    const quantity =
      nextQuantityRaw !== undefined ? toNullableNumber(nextQuantityRaw) : Number(existing.menge);

    const ep =
      nextEpRaw !== undefined
        ? toNullableNumber(nextEpRaw)
        : existing.einzelpreis != null
          ? Number(existing.einzelpreis)
          : null;

    const updated = await prisma.lVPosition.update({
      where: { id: existing.id },
      data: {
        position:
          req.body?.pos !== undefined || req.body?.position !== undefined
            ? String(req.body?.pos ?? req.body?.position ?? existing.position)
            : undefined,
        kurztext:
          req.body?.text !== undefined || req.body?.kurztext !== undefined
            ? String(req.body?.text ?? req.body?.kurztext ?? existing.kurztext)
            : undefined,
        langtext:
          req.body?.langtext !== undefined
            ? req.body.langtext == null
              ? ""
              : String(req.body.langtext)
            : undefined,
        einheit:
          req.body?.unit !== undefined || req.body?.einheit !== undefined
            ? String(req.body?.unit ?? req.body?.einheit ?? existing.einheit)
            : undefined,
        menge: quantity ?? 0,
        einzelpreis: ep,
        gesamt:
          typeof quantity === "number" && typeof ep === "number"
            ? Number((quantity * ep).toFixed(2))
            : null,
        parentPos:
          req.body?.parentPos !== undefined
            ? req.body.parentPos == null
              ? null
              : String(req.body.parentPos)
            : undefined,
      },
    });

    return res.json({
      ok: true,
      item: {
        id: updated.id,
        pos: updated.position,
        text: updated.kurztext,
        langtext: updated.langtext || "",
        unit: updated.einheit,
        quantity: Number(updated.menge ?? 0),
        ep: updated.einzelpreis != null ? Number(updated.einzelpreis) : 0,
      },
    });
  } catch (e: any) {
    console.error("[LV-POSITION-PATCH] error", e);
    return res.status(500).json({ ok: false, error: e?.message || "Patch failed" });
  }
});

router.delete("/:projectId/position/:positionId", async (req, res) => {
  try {
    const project = await resolveProjectOrFail(req, res);
    if (!project) return;

    const positionId = String(req.params.positionId || "").trim();
    if (!positionId) {
      return res.status(400).json({ ok: false, error: "positionId fehlt" });
    }

    const latest = await prisma.lVHeader.findFirst({
      where: { projectId: project.id },
      orderBy: { version: "desc" },
      select: { id: true },
    });

    if (!latest) {
      return res.status(404).json({ ok: false, error: "Kein LV vorhanden" });
    }

    const existing = await prisma.lVPosition.findFirst({
      where: {
        id: positionId,
        lvId: latest.id,
      },
      select: { id: true },
    });

    if (!existing) {
      return res.status(404).json({ ok: false, error: "Position nicht gefunden" });
    }

    await prisma.lVPosition.delete({
      where: { id: existing.id },
    });

    return res.json({
      ok: true,
      deletedId: existing.id,
    });
  } catch (e: any) {
    console.error("[LV-POSITION-DELETE] error", e);
    return res.status(500).json({ ok: false, error: e?.message || "Delete failed" });
  }
});

router.get("/:projectId/versions", async (req, res) => {
  try {
    const project = await resolveProjectOrFail(req, res);
    if (!project) return;

    const versions = await prisma.lVHeader.findMany({
      where: { projectId: project.id },
      orderBy: { version: "desc" },
      select: {
        id: true,
        version: true,
        title: true,
        createdAt: true,
      },
    });

    return res.json({
      ok: true,
      versions,
    });
  } catch (e) {
    console.error("[LV-VERSIONS] error", e);
    return res.status(500).json({ ok: false });
  }
});

router.get("/:projectId/version/:version", async (req, res) => {
  try {
    const project = await resolveProjectOrFail(req, res);
    if (!project) return;

    const version = Number(req.params.version);

    const header = await prisma.lVHeader.findFirst({
      where: {
        projectId: project.id,
        version,
      },
    });

    if (!header) {
      return res.status(404).json({ ok: false, error: "Version not found" });
    }

    const positions = await prisma.lVPosition.findMany({
      where: { lvId: header.id },
      orderBy: { position: "asc" },
    });

    return res.json({
      ok: true,
      header,
      items: positions,
    });
  } catch (e) {
    console.error("[LV-VERSION-GET] error", e);
    return res.status(500).json({ ok: false });
  }
});

router.get("/:projectId/export/excel", async (req, res) => {
  try {
    const project = await resolveProjectOrFail(req, res);
    if (!project) return;

    const versionRaw = req.query?.version;
    const version =
      versionRaw !== undefined && versionRaw !== null && String(versionRaw).trim() !== ""
        ? Number(versionRaw)
        : null;

    const { header, items } = await getLvForExport(project.id, version);

    if (!header) {
      return res.status(404).json({ ok: false, error: "Kein LV vorhanden" });
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("LV");

    sheet.columns = [
      { header: "Position", key: "position", width: 18 },
      { header: "Kurztext", key: "kurztext", width: 40 },
      { header: "Langtext", key: "langtext", width: 60 },
      { header: "Einheit", key: "einheit", width: 12 },
      { header: "Menge", key: "menge", width: 14 },
      { header: "EP", key: "einzelpreis", width: 14 },
      { header: "Gesamt", key: "gesamt", width: 16 },
      { header: "ParentPos", key: "parentPos", width: 18 },
    ];

    sheet.getRow(1).font = { bold: true };

    for (const item of items) {
      sheet.addRow({
        position: item.position,
        kurztext: item.kurztext,
        langtext: item.langtext || "",
        einheit: item.einheit,
        menge: num(item.menge),
        einzelpreis: num(item.einzelpreis),
        gesamt: num(item.gesamt),
        parentPos: item.parentPos || "",
      });
    }

    const lastRow = sheet.addRow({
      position: "",
      kurztext: "",
      langtext: "",
      einheit: "",
      menge: "",
      einzelpreis: "Summe",
      gesamt: items.reduce((s, x) => s + num(x.gesamt), 0),
      parentPos: "",
    });
    lastRow.font = { bold: true };

    const { exportsDir } = ensureProjectExportDirs(project.id);
    const filePath = path.join(exportsDir, `lv_${project.code}_v${header.version}.xlsx`);
    await workbook.xlsx.writeFile(filePath);
    log("Excel saved:", filePath);

    archiveLvDms(project, "LV-Export.xlsx", filePath, {
      source: "lv.export.excel",
      lvVersion: header.version
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="lv_${project.code}_v${header.version}.xlsx"`
    );

    return res.download(filePath, `lv_${project.code}_v${header.version}.xlsx`);
  } catch (e: any) {
    console.error("[LV-EXPORT-EXCEL] error", e);
    return res.status(500).json({ ok: false, error: e?.message || "Excel export failed" });
  }
});

router.get("/:projectId/export/pdf", async (req, res) => {
  try {
    const project = await resolveProjectOrFail(req, res);
    if (!project) return;

    const versionRaw = req.query?.version;
    const version =
      versionRaw !== undefined && versionRaw !== null && String(versionRaw).trim() !== ""
        ? Number(versionRaw)
        : null;

    const { header, items } = await getLvForExport(project.id, version);

    if (!header) {
      return res.status(404).json({ ok: false, error: "Kein LV vorhanden" });
    }

    const { exportsDir } = ensureProjectExportDirs(project.id);
    const filePath = path.join(exportsDir, `lv_${project.code}_v${header.version}.pdf`);

    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const fileStream = fs.createWriteStream(filePath);

    doc.pipe(fileStream);

    doc.fontSize(18).text("Leistungsverzeichnis", { align: "left" });
    doc.moveDown(0.2);
    doc.fontSize(11).text(`Projekt: ${project.code} ${project.name}`);
    doc.text(`Version: ${header.version}`);
    doc.text(`Titel: ${header.title}`);
    doc.moveDown(0.5);

    let y = doc.y;
    doc.fontSize(10).text("Pos", 40, y, { width: 70 });
    doc.text("Kurztext", 110, y, { width: 180 });
    doc.text("ME", 290, y, { width: 35 });
    doc.text("Menge", 325, y, { width: 60, align: "right" });
    doc.text("EP", 390, y, { width: 70, align: "right" });
    doc.text("Gesamt", 465, y, { width: 90, align: "right" });
    doc.moveDown(0.3);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor("#cccccc").stroke();
    doc.moveDown(0.3);

    let sum = 0;

    for (const item of items) {
      const menge = num(item.menge);
      const ep = num(item.einzelpreis);
      const gesamt = num(item.gesamt);
      sum += gesamt;

      const rowY = doc.y;
      doc.fontSize(9);
      doc.text(String(item.position || ""), 40, rowY, { width: 70 });
      doc.text(String(item.kurztext || ""), 110, rowY, { width: 180 });
      doc.text(String(item.einheit || ""), 290, rowY, { width: 35 });
      doc.text(String(menge), 325, rowY, { width: 60, align: "right" });
      doc.text(String(ep), 390, rowY, { width: 70, align: "right" });
      doc.text(String(gesamt), 465, rowY, { width: 90, align: "right" });

      if (item.langtext) {
        doc.moveDown(0.1);
        doc.fontSize(8).fillColor("#555555");
        doc.text(String(item.langtext), 110, doc.y, { width: 345 });
        doc.fillColor("#000000");
      }

      doc.moveDown(0.35);

      if (doc.y > 730) {
        doc.addPage();
      }
    }

    doc.moveDown(0.3);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor("#999999").stroke();
    doc.moveDown(0.5);
    doc.fontSize(11).text(`Gesamtsumme: ${sum.toFixed(2)} EUR`, { align: "right" });

    doc.end();

    fileStream.on("finish", () => {
      log("PDF saved:", filePath);

      archiveLvDms(project, "LV-Export.pdf", filePath, {
        source: "lv.export.pdf",
        lvVersion: header.version
      });

      return res.download(filePath, `lv_${project.code}_v${header.version}.pdf`);
    });

    fileStream.on("error", (err) => {
      console.error("[LV-EXPORT-PDF] file stream error", err);
      if (!res.headersSent) {
        return res.status(500).json({ ok: false, error: "PDF export failed" });
      }
    });
  } catch (e: any) {
    console.error("[LV-EXPORT-PDF] error", e);
    return res.status(500).json({ ok: false, error: e?.message || "PDF export failed" });
  }
});

router.post("/:projectId/export/gaeb/validate", async (req, res) => {
  try {
    const project = await resolveProjectOrFail(req, res);
    if (!project) return;

    const modeRaw = String(req.body?.mode || req.query?.mode || "x83").toLowerCase();
    const mode: "x83" | "x84" = modeRaw === "x84" ? "x84" : "x83";

    const versionRaw = req.body?.version ?? req.query?.version;
    const version =
      versionRaw !== undefined && versionRaw !== null && String(versionRaw).trim() !== ""
        ? Number(versionRaw)
        : null;

    const { header, items } = await getLvForExport(project.id, version);

    if (!header) {
      return res.status(404).json({ ok: false, error: "Kein LV vorhanden" });
    }

    const result = validateGaebItems(items, mode);

    return res.json({
      ok: true,
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
      },
      lv: {
        id: header.id,
        title: header.title,
        version: header.version,
      },
      mode,
      valid: result.valid,
      errorCount: result.errors.length,
      warningCount: result.warnings.length,
      errors: result.errors,
      warnings: result.warnings,
      issues: result.issues,
    });
  } catch (e: any) {
    console.error("[GAEB-VALIDATE]", e);
    return res.status(500).json({ ok: false, error: e?.message || "GAEB validation failed" });
  }
});

async function prepareCertifiedX83Rows(projectId: string, projectCode: string, items: any[]) {
  const sourceMeta = await loadLatestImportedX83Meta(projectId, projectCode);
  const validationItems = items.filter((item: any) => {
    const meta = sourceMeta.get(String(item?.position || "").trim());
    return meta?.gaebItemKind !== "MarkupItem";
  });
  const rows = items.map((item: any) => {
    const pos = String(item?.position || "").trim();
    const meta = sourceMeta.get(pos) || {};
    return {
      posNr: pos,
      kurztext: item?.kurztext,
      langtext: item?.langtext,
      einheit: item?.einheit,
      menge: item?.menge,
      gaebItemKind: meta?.gaebItemKind,
      gaebMarkupType: meta?.gaebMarkupType,
      gaebAlnGroupNo: meta?.gaebAlnGroupNo,
      gaebAlnSerNo: meta?.gaebAlnSerNo,
      gaebProvis: meta?.gaebProvis,
      gaebProvisAccpt: meta?.gaebProvisAccpt,
      gaebTextComplements: meta?.gaebTextComplements || [],
      gaebImages: meta?.gaebImages || [],
      gaebSubDescriptions: meta?.gaebSubDescriptions || [],
    };
  });
  return { validationItems, rows };
}

router.get("/:projectId/export/gaeb/x83", async (req, res) => {
  try {
    const project = await resolveProjectOrFail(req, res);
    if (!project) return;

    const versionRaw = req.query?.version;
    const version =
      versionRaw !== undefined && versionRaw !== null && String(versionRaw).trim() !== ""
        ? Number(versionRaw)
        : null;

    const { header, items } = await getLvForExport(project.id, version);

    if (!header) {
      return res.status(404).json({ ok: false, error: "Kein LV vorhanden" });
    }

    const prepared = await prepareCertifiedX83Rows(project.id, project.code, items);
    const validation = validateGaebItems(prepared.validationItems, "x83");
    if (!validation.valid) {
      return res.status(400).json(buildGaebValidationErrorResponse(validation));
    }

    const xml = buildCertifiedGaebX83Xml({
      rows: prepared.rows,
      project: { code: project.code, name: project.name },
    });

    const { gaebDir } = ensureProjectExportDirs(project.id);
    const abs = path.join(gaebDir, "lv.X83");
    fs.writeFileSync(abs, xml, "utf8");

    archiveLvDms(
      project,
      /\.x84$/i.test(abs) ? "GAEB-X84-Export.X84" : "GAEB-X83-Export.X83",
      abs,
      {
        source: "lv.export.gaeb",
        format: path.extname(abs).replace(".", "").toLowerCase(),
        lvVersion: header.version
      }
    );

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${gaebFileNameBase(project.code, header.version)}.X83"`
    );

    archiveLvBufferDms(
      project,
      `${gaebFileNameBase(project.code, header.version)}.X83`,
      Buffer.from(xml, "utf8"),
      { source: "lv.export.gaeb.x83", lvVersion: header.version }
    );

    return res.send(xml);
  } catch (e: any) {
    console.error("[GAEB-X83 EXPORT]", e);
    return res.status(500).json({ ok: false, error: e?.message || "GAEB X83 export failed" });
  }
});

async function loadLatestImportedX83Meta(projectId: string, projectCode: string): Promise<Map<string, any>> {
  const result = new Map<string, any>();
  const dirs = [path.join(PROJECTS_ROOT, projectId, "imports")];

  if (projectCode && projectCode !== projectId) {
    const duplicateCount = await prisma.project.count({ where: { code: projectCode } });
    if (duplicateCount === 1) {
      dirs.push(path.join(PROJECTS_ROOT, projectCode, "imports"));
    }
  }

  const candidates = dirs
    .filter((dir) => fs.existsSync(dir))
    .flatMap((dir) =>
      fs.readdirSync(dir)
        .filter((name) => /\.x83$/i.test(name))
        .map((name) => ({ name, file: path.join(dir, name), mtime: fs.statSync(path.join(dir, name)).mtimeMs }))
    )
    .sort((a, b) => b.mtime - a.mtime);

  if (!candidates.length) return result;
  try {
    const parsed = await parseGaebXmlImport(fs.readFileSync(candidates[0].file, "utf8"));
    for (const row of parsed.items || []) {
      const pos = String(row?.pos || row?.position || "").trim();
      if (pos) result.set(pos, row);
    }
  } catch (error) {
    console.warn("[GAEB-X84] X83 source metadata could not be loaded", error);
  }
  return result;
}

router.get("/:projectId/export/gaeb/x84", async (req, res) => {
  try {
    const project = await resolveProjectOrFail(req, res);
    if (!project) return;

    const versionRaw = req.query?.version;
    const version =
      versionRaw !== undefined && versionRaw !== null && String(versionRaw).trim() !== ""
        ? Number(versionRaw)
        : null;

    const { header, items } = await getLvForExport(project.id, version);

    if (!header) {
      return res.status(404).json({ ok: false, error: "Kein LV vorhanden" });
    }

    const sourceMeta = await loadLatestImportedX83Meta(project.id, project.code);
    const validationItems = items.filter((item: any) => {
      const meta = sourceMeta.get(String(item?.position || "").trim());
      return meta?.gaebItemKind !== "MarkupItem";
    });
    const validation = validateGaebItems(validationItems, "x84");
    if (!validation.valid) {
      return res.status(400).json(buildGaebValidationErrorResponse(validation));
    }

    const company = await prisma.company.findUnique({
      where: { id: project.companyId },
      select: { name: true, address: true, email: true, phone: true },
    });
    if (!company) return res.status(404).json({ ok: false, error: "COMPANY_NOT_FOUND" });

    const certifiedRows = items.map((item: any) => {
      const pos = String(item?.position || "").trim();
      const meta = sourceMeta.get(pos) || {};
      return {
        posNr: pos,
        kurztext: item?.kurztext,
        langtext: item?.langtext,
        einheit: item?.einheit,
        menge: item?.menge,
        preis: item?.einzelpreis,
        gesamt: item?.gesamt,
        gaebItemKind: meta?.gaebItemKind,
        gaebMarkupType: meta?.gaebMarkupType,
        gaebMarkupBase: meta?.gaebMarkupBase ?? null,
        gaebTextComplements: meta?.gaebTextComplements || [],
        gaebSubDescriptions: meta?.gaebSubDescriptions || [],
      };
    });

    const xml = buildCertifiedGaebX84Xml({
      rows: certifiedRows,
      project: { code: project.code, name: project.name },
      company,
    });

    const { gaebDir } = ensureProjectExportDirs(project.id);
    const abs = path.join(gaebDir, "angebot.X84");
    fs.writeFileSync(abs, xml, "utf8");

    archiveLvDms(
      project,
      /\.x84$/i.test(abs) ? "GAEB-X84-Export.X84" : "GAEB-X83-Export.X83",
      abs,
      {
        source: "lv.export.gaeb",
        format: path.extname(abs).replace(".", "").toLowerCase(),
        lvVersion: header.version
      }
    );

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="angebot_${project.code}_v${header.version}.X84"`
    );

    archiveLvBufferDms(
      project,
      `angebot_${project.code}_v${header.version}.X84`,
      Buffer.from(xml, "utf8"),
      { source: "lv.export.gaeb.x84", lvVersion: header.version }
    );

    return res.send(xml);
  } catch (e: any) {
    console.error("[GAEB-X84 EXPORT]", e);
    return res.status(500).json({ ok: false, error: e?.message || "GAEB X84 export failed" });
  }
});

router.get("/:projectId/export/gaeb", async (req, res) => {
  try {
    const project = await resolveProjectOrFail(req, res);
    if (!project) return;

    const versionRaw = req.query?.version;
    const version =
      versionRaw !== undefined && versionRaw !== null && String(versionRaw).trim() !== ""
        ? Number(versionRaw)
        : null;

    const { header, items } = await getLvForExport(project.id, version);

    if (!header) {
      return res.status(404).json({ ok: false, error: "Kein LV vorhanden" });
    }

    const prepared = await prepareCertifiedX83Rows(project.id, project.code, items);
    const validation = validateGaebItems(prepared.validationItems, "x83");
    if (!validation.valid) {
      return res.status(400).json(buildGaebValidationErrorResponse(validation));
    }

    const xml = buildCertifiedGaebX83Xml({
      rows: prepared.rows,
      project: { code: project.code, name: project.name },
    });

    const { gaebDir } = ensureProjectExportDirs(project.id);
    const abs = path.join(gaebDir, "lv.X83");
    fs.writeFileSync(abs, xml, "utf8");

    archiveLvDms(
      project,
      /\.x84$/i.test(abs) ? "GAEB-X84-Export.X84" : "GAEB-X83-Export.X83",
      abs,
      {
        source: "lv.export.gaeb",
        format: path.extname(abs).replace(".", "").toLowerCase(),
        lvVersion: header.version
      }
    );

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${gaebFileNameBase(project.code, header.version)}.X83"`
    );

    archiveLvBufferDms(
      project,
      `${gaebFileNameBase(project.code, header.version)}.X83`,
      Buffer.from(xml, "utf8"),
      { source: "lv.export.gaeb.alias", lvVersion: header.version }
    );

    return res.send(xml);
  } catch (e: any) {
    console.error("[GAEB EXPORT LEGACY->X83]", e);
    return res.status(500).json({ ok: false, error: e?.message || "GAEB export failed" });
  }
});

export default router;
