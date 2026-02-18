// apps/server/src/routes/regiePdf.ts
import express from "express";
import path from "path";
import fs from "fs";

const router = express.Router();

// JSON body max ~20 MB
router.post(
  "/regie/export-pdf",
  express.json({ limit: "20mb" }),
  async (req, res) => {
    try {
      const { projectId, fileName, pdfBase64 } = req.body || {};

      if (!projectId || !pdfBase64) {
        return res
          .status(400)
          .json({ error: "projectId und pdfBase64 sind erforderlich." });
      }

      const safeName =
        typeof fileName === "string" && fileName.trim().length
          ? fileName.trim()
          : `Regiebericht_${projectId}.pdf`;

      // Basis: apps/server/data/projects/<projectId>
      const baseDir = path.join(__dirname, "..", "data", "projects");
      const projectDir = path.join(baseDir, projectId);

      await fs.promises.mkdir(projectDir, { recursive: true });

      const fullPath = path.join(projectDir, safeName);
      const buffer = Buffer.from(pdfBase64, "base64");
      await fs.promises.writeFile(fullPath, buffer);

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
