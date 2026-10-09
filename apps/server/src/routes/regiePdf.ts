// apps/server/src/routes/regiePdf.ts
import express from "express";
import path from "path";
import fs from "fs";
import { requireProjectMember } from "../middleware/guards";
import { PROJECTS_ROOT } from "../lib/projectsRoot";
import { prisma } from "../lib/prisma";

const router = express.Router();

const requireRegiePdfProjectAccess = async (req:any,res:any,next:any) => {
  const token = String(req.body?.projectId || "").trim();
  if(!token) return res.status(400).json({error:"projectId und pdfBase64 sind erforderlich."});
  req.params = req.params || {};
  req.params.__regiePdfProject = token;
  return requireProjectMember("__regiePdfProject")(req,res,async (err?:any)=>{
    if(err) return next(err);
    const projectId=String(req.resolvedProjectId||"").trim();
    const projectCode=String(req.resolvedProjectCode||"").trim();
    if(!projectId) return res.status(403).json({error:"PROJECT_RESOLUTION_FAILED"});
    if(projectCode && projectCode!==projectId){
      try{
        const duplicates=await prisma.project.count({where:{code:projectCode}});
        if(duplicates===1){
          const legacyRoot=path.join(PROJECTS_ROOT,projectCode);
          const canonicalRoot=path.join(PROJECTS_ROOT,projectId);
          for(const name of fs.existsSync(legacyRoot)?fs.readdirSync(legacyRoot):[]){
            if(!/^Regiebericht_.*\.pdf$/i.test(name)) continue;
            const src=path.join(legacyRoot,name), dst=path.join(canonicalRoot,name);
            if(!fs.existsSync(dst)){fs.mkdirSync(canonicalRoot,{recursive:true});fs.copyFileSync(src,dst);}
          }
        }
      }catch(e){console.error("[regiePdf] legacy tenant migration failed",e);}
    }
    req.body.projectId=projectId;
    req.body.projectCode=projectCode;
    return next();
  });
};

// JSON body max ~20 MB
router.post(
  "/regie/export-pdf",
  express.json({ limit: "20mb" }),
  requireRegiePdfProjectAccess,
  async (req, res) => {
    try {
      const { projectId, fileName, pdfBase64 } = req.body || {};

      if (!projectId || !pdfBase64) {
        return res
          .status(400)
          .json({ error: "projectId und pdfBase64 sind erforderlich." });
      }

      const rawName =
        typeof fileName === "string" && fileName.trim().length
          ? fileName.trim()
          : `Regiebericht_${projectId}.pdf`;
      const baseName = path.basename(rawName).replace(/[^A-Za-z0-9ÄÖÜäöüß._-]/g, "_");
      const safeName = /\.pdf$/i.test(baseName) ? baseName : `${baseName}.pdf`;

      const projectDir = path.join(PROJECTS_ROOT, projectId);
      const resolvedRoot = path.resolve(PROJECTS_ROOT) + path.sep;
      const resolvedProjectDir = path.resolve(projectDir);
      if (!resolvedProjectDir.startsWith(resolvedRoot)) {
        return res.status(400).json({ error: "Ungültiges Projektverzeichnis." });
      }

      await fs.promises.mkdir(resolvedProjectDir, { recursive: true });

      const fullPath = path.join(resolvedProjectDir, safeName);
      const buffer = Buffer.from(pdfBase64, "base64");
      if (buffer.length < 5 || buffer.subarray(0,5).toString("ascii") !== "%PDF-") {
        return res.status(415).json({ error: "Ungültige PDF-Datei." });
      }
      await fs.promises.writeFile(fullPath, buffer);

      try {
        const { archiveProjectFileVersion } = await import("../services/dmsArchive");
        await archiveProjectFileVersion({
          projectIdOrCode: String(projectId),
          filename: safeName,
          kind: "PDF",
          localPath: fullPath,
          uploadedBy: String(
            (req as any)?.auth?.email ||
            (req as any)?.auth?.userId ||
            (req as any)?.user?.email ||
            (req as any)?.user?.id ||
            ""
          ).trim() || null,
          meta: {
            module: "REGIE",
            source: "regie.export-pdf"
          }
        });
      } catch (dmsError) {
        console.error("[regie:export-pdf:dms]", dmsError);
      }

      console.log("Regiebericht PDF gespeichert:", fullPath);

      return res.json({ ok: true, filePath: fullPath });
    } catch (err: any) {
      console.error("Fehler beim Speichern des Regiebericht-PDF:", err);
      return res
        .status(500)
        .json({ error: err?.message || "Fehler beim Speichern des PDFs" });
    }
  }
);

export default router;
