import fs from "fs";
import path from "path";
import { PROJECTS_ROOT } from "./projectsRoot";

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function writeJsonIfMissing(filePath: string, data: any) {
  if (fs.existsSync(filePath)) return;
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

export function ensureProjectStructure(projectCode: string) {
  const code = String(projectCode || "").trim();
  if (!code) throw new Error("missing projectCode");

  const root = path.join(PROJECTS_ROOT, code);

  const dirs = [
    "auto-ki",
    "bricscad",
    "cad",
    "eingangspruefung",
    "eingangspruefung/regie",
    "eingangspruefung/fotos",
    "eingangspruefung/ls",
    "fotos",
    "fotos/files",
    "gps",
    "inbox",
    "inbox/regie",
    "inbox/fotos",
    "inbox/ls",
    "kalkulation",
    "ki",
    "ki/vision",
    "lieferscheine",
    "lieferscheine/files",
    "ls",
    "raw",
    "regie",
    "regieberichte",
    "verknuepfung",
  ];

  ensureDir(root);
  for (const d of dirs) ensureDir(path.join(root, d));

  writeJsonIfMissing(path.join(root, "project.json"), {
    code,
    createdAt: new Date().toISOString(),
    version: 1,
  });

  writeJsonIfMissing(path.join(root, "aufmass.json"), { rows: [] });
  writeJsonIfMissing(path.join(root, "aufmass-history.json"), { items: [] });
  writeJsonIfMissing(path.join(root, "abschlaege.json"), { items: [] });
  writeJsonIfMissing(path.join(root, "soll-ist.json"), { items: [] });
  writeJsonIfMissing(path.join(root, "soll-ist-history.json"), { items: [] });
  writeJsonIfMissing(path.join(root, "lv.json"), { items: [] });
  writeJsonIfMissing(path.join(root, "gps-assignments.json"), { items: [] });

  return root;
}
