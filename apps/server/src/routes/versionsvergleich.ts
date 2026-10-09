import express, { Request, Response } from "express";
import ExcelJS from "exceljs";
import { prisma } from "../lib/prisma";
import { archiveProjectBufferVersion } from "../services/dmsArchive";
import { requireProjectMember } from "../middleware/guards";

const router = express.Router();

const requireVersionsProjectAccess = async (req:any,res:any,next:any) => {
  return requireProjectMember("projectId")(req,res,(err?:any)=>{
    if(err) return next(err);
    req.params.projectId = String(req.resolvedProjectId || req.params.projectId || "").trim();
    return next();
  });
};

/**
 * GET /versionsvergleich/:projectId
 * Restituisce tutte le versioni esistenti per un progetto
 */
router.get("/:projectId", requireVersionsProjectAccess, async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId; // STRING

    const versions = await prisma.offerVersion.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
    });

    return res.json({
      ok: true,
      count: versions.length,
      versions,
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * EXPORT EXCEL
 */
router.get("/:projectId/excel", requireVersionsProjectAccess, async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId;

    const versions = await prisma.offerVersion.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Versionsvergleich");

    sheet.addRow(["Version ID", "Datum", "Dateiname"]);

    versions.forEach((v) => {
      sheet.addRow([
        v.id,
        v.createdAt.toISOString(),
        v.filename || "",
      ]);
    });

    const fileName = `versionsvergleich_${projectId}.xlsx`;
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    void archiveProjectBufferVersion({
      projectIdOrCode: projectId,
      filename: fileName,
      kind: "DOC",
      buffer,
      meta: { module: "KALKULATION", source: "versionsvergleich.excel.export" },
    }).catch((error) => console.error("[versionsvergleich:xlsx:dms]", error));

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.send(buffer);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * EXPORT PDF
 */
router.get("/:projectId/pdf", requireVersionsProjectAccess, async (req: Request, res: Response) => {
  const projectId = encodeURIComponent(String(req.params.projectId || ""));
  return res.redirect(307, `/api/pdf/versionsvergleich/${projectId}`);
});

export default router;
