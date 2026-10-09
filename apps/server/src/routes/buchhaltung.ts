import { Router } from "express";
import { prisma } from "../lib/prisma";

const router = Router();

type BuchhaltungEintrag = {
  companyId: string;
  projectId: string;
  datum: string;
  summeNetto: number;
  summeBrutto: number;
  quelle: string;
};

const byProject = new Map<string, BuchhaltungEintrag[]>();

function roleOf(req: any): string {
  return String(req?.auth?.companyRole || req?.auth?.role || "").trim().toUpperCase();
}

function companyId(req: any): string {
  return String(req?.auth?.companyId || req?.auth?.company || "").trim();
}

async function requireBookkeepingProject(req: any, res: any, projectId: string, write: boolean) {
  const cid = companyId(req);
  const userId = String(req?.auth?.sub || req?.auth?.userId || "").trim();
  const role = roleOf(req);
  if (!cid || !userId) {
    res.status(403).json({ error: "COMPANY_REQUIRED" });
    return null;
  }

  const writeRoles = new Set(["ADMIN", "ADMINISTRATOR", "BUCHHALTUNG", "BAULEITER"]);
  const readRoles = writeRoles;
  if (!(write ? writeRoles : readRoles).has(role)) {
    res.status(403).json({ error: "BUCHHALTUNG_FORBIDDEN" });
    return null;
  }

  const privileged = role === "ADMIN" || role === "ADMINISTRATOR" || role === "BUCHHALTUNG";
  const project = await prisma.project.findFirst({
    where: {
      companyId: cid,
      OR: [{ id: projectId }, { code: projectId }],
      ...(privileged ? {} : { members: { some: { userId } } }),
    },
    select: { id: true, code: true },
  });
  if (!project) {
    res.status(403).json({ error: "PROJECT_FORBIDDEN" });
    return null;
  }
  return { cid, project };
}

router.post("/save", async (req: any, res) => {
  const { projectId, summeNetto, summeBrutto, quelle } = req.body || {};
  if (!projectId || summeNetto == null || summeBrutto == null) {
    return res.status(400).json({ error: "projectId, summeNetto, summeBrutto sind Pflicht." });
  }

  const access = await requireBookkeepingProject(req, res, String(projectId), true);
  if (!access) return;

  const netto = Number(summeNetto);
  const brutto = Number(summeBrutto);
  if (!Number.isFinite(netto) || !Number.isFinite(brutto)) {
    return res.status(400).json({ error: "Ungültige Summen." });
  }

  const canonicalProjectId = access.project.id;
  const key = access.cid + ":" + canonicalProjectId;
  const list = byProject.get(key) || [];
  const item: BuchhaltungEintrag = {
    companyId: access.cid,
    projectId: canonicalProjectId,
    datum: new Date().toISOString().slice(0, 10),
    summeNetto: netto,
    summeBrutto: brutto,
    quelle: String(quelle || "Abrechnung").slice(0, 200),
  };
  list.push(item);
  byProject.set(key, list);
  return res.json({ ok: true, item });
});

router.get("/by-project/:projectId", async (req: any, res) => {
  const access = await requireBookkeepingProject(req, res, String(req.params.projectId), false);
  if (!access) return;
  const key = access.cid + ":" + access.project.id;
  return res.json({ projectId: access.project.id, items: byProject.get(key) || [] });
});

export default router;
