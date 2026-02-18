// scripts/fs-sync.js (ESM)
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { fileURLToPath } from "url";

const prisma = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.PROJECTS_ROOT || path.resolve(__dirname, "..", "data", "projects");
const SUBS = ["cad","lv","abrechnung","regieberichte","lieferscheine","dokumente","images"];

const slugify = (s) =>
  String(s||"")
    .toLowerCase()
    .replace(/ß/g,"ss")
    .replace(/[^a-z0-9\- ]+/g,"")
    .replace(/\s+/g,"-");

function readJsonSafe(file) {
  let raw = fs.readFileSync(file, "utf8");
  raw = raw.replace(/^\uFEFF/, "").trim();
  raw = raw.replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(raw);
}

// 👉 trova/crea una Company e restituisce l'ID
async function resolveCompanyId() {
  if (process.env.COMPANY_ID) return process.env.COMPANY_ID;
  let c = await prisma.company.findFirst();
  if (!c) {
    const name = process.env.COMPANY_NAME || "RLC Default";
    c = await prisma.company.create({ data: { name, slug: slugify(name) } });
  }
  return c.id;
}

async function walkAndIndex(dir, projectId, baseLen) {
  const kinds = new Set(SUBS);
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) await walkAndIndex(abs, projectId, baseLen);
    else {
      const rel = abs.slice(baseLen).replace(/\\/g,"/");
      if (rel.startsWith(".rlc/")) continue;
      const top = rel.split("/")[0];
      const kind = kinds.has(top) ? top : "other";
      const size = fs.statSync(abs).size;
      await prisma.projectFile.create({ data: { projectId, relPath: rel, kind, size } }).catch(()=>{});
    }
  }
}

(async () => {
  try {
    const companyId = await resolveCompanyId(); // ✨
    for (const d of fs.readdirSync(ROOT, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const dir  = path.join(ROOT, d.name);
      const meta = path.join(dir, ".rlc", "project.json");
      if (!fs.existsSync(meta)) continue;

      const pj   = readJsonSafe(meta);
      const slug = slugify(pj.slug || pj.name || d.name);

      fs.mkdirSync(path.join(dir, ".rlc"), { recursive: true });
      for (const s of SUBS) fs.mkdirSync(path.join(dir, s), { recursive: true });

      // usa companyId obbligatorio
      let p = await prisma.project.findFirst({ where: { code: pj.code } });
      if (p) {
        p = await prisma.project.update({
          where: { id: p.id },
          data: { name: pj.name, slug, path: dir, companyId }
        });
      } else {
        p = await prisma.project.create({
          data: { code: pj.code, name: pj.name, slug, path: dir, companyId }
        });
      }

      await walkAndIndex(dir, p.id, dir.length + 1);
      console.log("✅ Indexed:", pj.code, pj.name);
    }
    console.log("✅ Sync completato");
  } catch (e) {
    console.error("❌ Sync error:", e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
