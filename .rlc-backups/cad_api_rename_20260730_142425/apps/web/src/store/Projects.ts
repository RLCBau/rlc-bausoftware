import { Router } from "express";
import path from "path";
import fs from "fs";

const router = Router();

// prendi la stessa root usata in index.ts
const PROJECTS_ROOT =
  process.env.PROJECTS_ROOT || path.join(process.cwd(), "data", "projects");
fs.mkdirSync(PROJECTS_ROOT, { recursive: true });

type ProjectFS = {
  id: string;
  code: string;
  name: string;
  number?: string | null;
  customer?: string | null;
  city?: string | null;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
};

// util
function safeSlug(s: string) {
  return (s || "").toLowerCase().replace(/[^a-z0-9-_]/g, "-");
}
function projDir(p: ProjectFS) {
  return path.join(PROJECTS_ROOT, `${safeSlug(p.code || p.id)}`);
}
function projJsonPath(p: ProjectFS) {
  return path.join(projDir(p), "project.json");
}
function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

// GET /api/projects?page=1&pageSize=200
router.get("/", (req, res) => {
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || 50);

  const dirs = fs
    .readdirSync(PROJECTS_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(PROJECTS_ROOT, d.name));

  const items: ProjectFS[] = [];
  for (const d of dirs) {
    const f = path.join(d, "project.json");
    if (fs.existsSync(f)) {
      try {
        const j = JSON.parse(fs.readFileSync(f, "utf8"));
        items.push({
          id: j.id,
          code: j.code,
          name: j.name,
          number: j.number ?? null,
          customer: j.customer ?? null,
          city: j.city ?? null,
          status: j.status ?? "active",
          createdAt: j.createdAt ?? null,
          updatedAt: j.updatedAt ?? null,
        });
      } catch {}
    }
  }

  const total = items.length;
  const start = (page - 1) * pageSize;
  const paged = items.slice(start, start + pageSize);

  res.json({ ok: true, page, pageSize, total, items: paged });
});

// POST /api/projects  {code,name,number?,customer?,city?}
router.post("/", express.json(), (req, res) => {
  const { code, name, number, customer, city } = req.body || {};
  if (!code || !name) {
    return res.status(400).json({ ok: false, error: "code und name sind Pflicht" });
  }

  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const proj: ProjectFS = {
    id,
    code,
    name,
    number: number ?? null,
    customer: customer ?? null,
    city: city ?? null,
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const dir = projDir(proj);
  ensureDir(dir);
  fs.writeFileSync(projJsonPath(proj), JSON.stringify(proj, null, 2), "utf8");

  res.json({ ok: true, project: proj });
});

// DELETE /api/projects/:id
router.delete("/:id", (req, res) => {
  const id = String(req.params.id);
  // trova cartella per id o code
  const dirs = fs
    .readdirSync(PROJECTS_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory());

  let foundPath: string | null = null;
  for (const d of dirs) {
    const folder = path.join(PROJECTS_ROOT, d.name);
    const pj = path.join(folder, "project.json");
    if (fs.existsSync(pj)) {
      try {
        const j = JSON.parse(fs.readFileSync(pj, "utf8"));
        if (j.id === id || j.code === id) {
          foundPath = folder;
          break;
        }
      } catch {}
    }
  }

  if (!foundPath) return res.status(404).json({ ok: false, error: "Projekt nicht gefunden" });

  // elimina ricorsivamente
  fs.rmSync(foundPath, { recursive: true, force: true });
  res.json({ ok: true });
});

export default router;
