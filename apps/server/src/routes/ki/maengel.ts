import { Router } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";

import { analyzeImageForDefects } from "../../services/ki/vision";
import PDF from "../../services/pdf/maengelPdf";
import { sendMangelMail } from "../../services/mailer";

const router = Router();

/* ---------- Upload (multer) ---------- */
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const projectId = String(req.body.projectId || "NO-PROJECT");
    const dir = path.join(process.cwd(), "uploads", projectId, "maengel");
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || ".jpg");
    cb(null, `${Date.now()}${ext}`);
  }
});
const upload = multer({ storage });

/* ---------- POST /upload (con KI) ---------- */
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const projectId = String(req.body.projectId || "");
    if (!projectId || !req.file) return res.status(400).send("projectId/file mancante");

    const localPath = path.join(process.cwd(), "uploads", projectId, "maengel", req.file.filename);
    const publicUrl = `/files/${projectId}/maengel/${req.file.filename}`;

    // Analisi KI (placeholder o reale, in services/ki/vision.ts)
    let detected = {
      title: "Mangel",
      desc: "",
      cat: "Allgemein",
      prio: "mittel",
      lv: ""
    } as any;

    try {
      const r = await analyzeImageForDefects(localPath);
      // mappa campi del risultato simulato/vision
      detected = {
        title: (r as any)?.results?.[0]?.label || "Mangel",
        desc: (r as any)?.message || "",
        cat: "Allgemein",
        prio: "mittel",
        lv: ""
      };
    } catch (e) {
      console.warn("[maengel/upload] Vision fallback:", (e as any)?.message);
    }

    res.json({ url: publicUrl, detected });
  } catch (e: any) {
    console.error(e);
    res.status(500).send("Upload/Erkennung fehlgeschlagen");
  }
});

/* ---------- Persistenza JSON ---------- */
router.post("/save", (req, res) => {
  try {
    const { projectId, items } = req.body as any;
    const dir = path.join(process.cwd(), "uploads", String(projectId), "maengel");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "maengel.json"), JSON.stringify({ items }, null, 2));
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).send("Speichern fehlgeschlagen");
  }
});

router.post("/load", (req, res) => {
  try {
    const { projectId } = req.body as any;
    const p = path.join(process.cwd(), "uploads", String(projectId), "maengel", "maengel.json");
    if (fs.existsSync(p)) return res.json(JSON.parse(fs.readFileSync(p, "utf8")));
    res.json({ items: [] });
  } catch (e) {
    console.error(e);
    res.status(500).send("Laden fehlgeschlagen");
  }
});

/* ---------- PDF Export ---------- */
router.post("/pdf", async (req, res) => {
  try {
    const { projectId, items } = req.body as any;
    const dir = path.join(process.cwd(), "uploads", String(projectId), "maengel");
    fs.mkdirSync(dir, { recursive: true });
    const pdfPath = path.join(dir, `Maengelprotokoll_${Date.now()}.pdf`);
    await PDF.create(items, pdfPath);
    res.json({ url: `/files/${projectId}/maengel/${path.basename(pdfPath)}` });
  } catch (e) {
    console.error(e);
    res.status(500).send("PDF-Export fehlgeschlagen");
  }
});

/* ---------- E-mail Notifica ---------- */
router.post("/notify", async (req, res) => {
  try {
    const { to, subject, html, attachPdf } = req.body as any;
    const attachments: { filename: string; path: string }[] = [];
    if (attachPdf?.path && fs.existsSync(attachPdf.path)) {
      attachments.push({ filename: attachPdf.filename || "Maengelprotokoll.pdf", path: attachPdf.path });
    }
    await sendMangelMail({ to, subject, html, attachments });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).send("E-Mail Versand fehlgeschlagen");
  }
});

export default router;
