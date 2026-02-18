import fs from "fs";
import path from "path";
import { prisma } from "../prisma";
const ROOT = process.env.PROJECTS_ROOT || "./data/projects";
type ProjectMeta = { id?: string; number: string; name: string; slug: string; createdAt?: string; updatedAt?: string; };

export function ensureDirs() {
  fs.mkdirSync(ROOT, { recursive: true });
}

function projectDir(number: string, slug: string) {
  return path.join(ROOT, `${number}_${slug}`);
}

export async function createProject(meta: ProjectMeta) {
  ensureDirs();
  const dir = projectDir(meta.number, meta.slug);
  fs.mkdirSync(dir, { recursive: true });
  [".rlc","cad","lv","abrechnung","regieberichte","lieferscheine","dokumente","images"]
    .forEach(d => fs.mkdirSync(path.join(dir, d), { recursive: true }));
  const now = new Date().toISOString();
  const metaFull: ProjectMeta = { ...meta, createdAt: now, updatedAt: now };
  fs.writeFileSync(path.join(dir, ".rlc", "project.json"), JSON.stringify(metaFull, null, 2));
  const db = await prisma.project.create({
    data: { number: meta.number, name: meta.name, slug: meta.slug, path: dir }
  });
  return db;
}

export async function listProjects() {
  ensureDirs();
  const entries = fs.readdirSync(ROOT, { withFileTypes: true }).filter(d => d.isDirectory());
  // DB first
  const db = await prisma.project.findMany({ orderBy: { createdAt: "desc" } });
  // auto-import cartelle mancanti
  for (const e of entries) {
    const pj = db.find(p => `${p.number}_${p.slug}` === e.name);
    if (!pj) {
      const pjMetaPath = path.join(ROOT, e.name, ".rlc", "project.json");
      if (fs.existsSync(pjMetaPath)) {
        const meta = JSON.parse(fs.readFileSync(pjMetaPath, "utf-8")) as ProjectMeta;
        await prisma.project.upsert({
          where: { slug: meta.slug },
          create: { number: meta.number, name: meta.name, slug: meta.slug, path: path.join(ROOT, e.name) },
          update: { path: path.join(ROOT, e.name), name: meta.name, number: meta.number }
        });
      }
    }
  }
  return prisma.project.findMany({ orderBy: { createdAt: "desc" } });
}

export async function saveFile(projectId: string, relPath: string, buffer: Buffer, kind: string) {
  const pj = await prisma.project.findUnique({ where: { id: projectId } });
  if (!pj) throw new Error("Project not found");
  const abs = path.join(pj.path, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, buffer);
  const stat = fs.statSync(abs);
  await prisma.projectFile.create({ data: { projectId, relPath, kind, size: stat.size } });
  return { relPath, size: stat.size, kind };
}
