import express, { Router } from "express";
import fs from "fs";
import path from "path";

const router = Router();
router.use(express.json({ limit: "50mb" }));

const PROJECTS_ROOT =
  process.env.PROJECTS_ROOT ||
  path.resolve(process.cwd(), "data", "projects");

function safeProjectId(value: unknown) {
  const projectId = String(value || "").trim();
  if (!projectId || !/^[a-z0-9._-]+$/i.test(projectId)) {
    throw new Error("Ungültige projectId.");
  }
  return projectId;
}

function projectFileCandidates(projectId: string) {
  const root = path.join(PROJECTS_ROOT, projectId);
  return [
    path.join(root, "cad", "cad.json"),
    path.join(root, "cad", "takeoff.json"),
    path.join(root, "bricscad", "takeoff.json"),
    path.join(root, "bricscad", "imports", "latest-import.json"),
  ];
}

function readFirstCadFile(projectId: string) {
  const candidates = projectFileCandidates(projectId);
  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return { data, filePath };
  }
  return { data: null, filePath: "", candidates };
}

router.get(["/load", "/takeoff"], (req, res) => {
  try {
    const projectId = safeProjectId(req.query.projectId);
    const result = readFirstCadFile(projectId);
    if (!result.data) {
      return res.status(404).json({
        ok: false,
        message: "Keine RLC-CAD- oder Mengenermittlungsdatei gefunden.",
        candidates: result.candidates,
      });
    }
    return res.json({
      ok: true,
      data: result.data,
      source: path.relative(PROJECTS_ROOT, result.filePath),
    });
  } catch (error: any) {
    return res.status(400).json({
      ok: false,
      message: error?.message || "CAD konnte nicht geladen werden.",
    });
  }
});

router.get("/paths", (req, res) => {
  try {
    const projectId = safeProjectId(req.query.projectId);
    return res.json({
      ok: true,
      projectId,
      candidates: projectFileCandidates(projectId).map((filePath) => ({
        path: filePath,
        exists: fs.existsSync(filePath),
      })),
    });
  } catch (error: any) {
    return res.status(400).json({
      ok: false,
      message: error?.message || "CAD-Pfade konnten nicht geprüft werden.",
    });
  }
});

router.post("/save", (req, res) => {
  try {
    const projectId = safeProjectId(
      req.body?.projectId || req.query.projectId
    );
    const data = req.body?.data || req.body?.document || req.body;
    if (!data || typeof data !== "object") {
      return res.status(400).json({
        ok: false,
        message: "CAD-Dokument fehlt.",
      });
    }

    const cadDir = path.join(PROJECTS_ROOT, projectId, "cad");
    const filePath = path.join(cadDir, "cad.json");
    fs.mkdirSync(cadDir, { recursive: true });
    fs.writeFileSync(
      filePath,
      JSON.stringify(
        {
          ...data,
          projectId,
          updatedAt: new Date().toISOString(),
        },
        null,
        2
      ),
      "utf8"
    );

    return res.json({
      ok: true,
      projectId,
      path: path.relative(PROJECTS_ROOT, filePath),
    });
  } catch (error: any) {
    return res.status(400).json({
      ok: false,
      message: error?.message || "CAD konnte nicht gespeichert werden.",
    });
  }
});

export default router;
