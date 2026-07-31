import express, { Request, Response } from "express";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { prisma } from "../lib/prisma";

const router = express.Router();

/**
 * GET /versionsvergleich/:projectId
 * Restituisce tutte le versioni esistenti per un progetto
 */
router.get("/:projectId", async (req: Request, res: Response) => {
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
router.get("/:projectId/excel", async (req: Request, res: Response) => {
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

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="versionsvergleich_${projectId}.xlsx"`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * EXPORT PDF
 */
router.get("/:projectId/pdf", async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId;

    const versions = await prisma.offerVersion.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
    });

    const doc = new PDFDocument({ margin: 40 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="versionsvergleich_${projectId}.pdf"`
    );

    doc.pipe(res);

    doc.fontSize(20).text("Versionsvergleich", { underline: true });
    doc.moveDown();

    versions.forEach((v) => {
      doc.fontSize(14).text(`Version ID: ${v.id}`);
      doc.text(`Datum: ${v.createdAt.toISOString()}`);
      doc.text(`Dateiname: ${v.filename || "—"}`);
      doc.moveDown();
    });

    doc.end();
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
