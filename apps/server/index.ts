// apps/server/src/index.ts
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

import pdfRoutes from "./routes/pdf";
import historieRoutes from "./routes/historie";
import regieRoutes from "./routes/regie";
import importRouter from "./routes/import";
import projectRoutes from "./routes/projects";

import { prisma } from "./lib/prisma";
import { devAuth } from "./middleware/devAuth";

dotenv.config();

// === BASIS-KONFIGURATION ==========================================
const app = express();
const PORT = Number(process.env.PORT) || 4000;

// Projekt-Datei-Root (wie bisher im Server-Log angezeigt)
export const PROJECTS_ROOT =
  process.env.PROJECTS_ROOT || path.join(process.cwd(), "data", "projects");

fs.mkdirSync(PROJECTS_ROOT, { recursive: true });

// === CORS + BODY PARSER ============================================
app.use(
  cors({
    origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// === DEV-AUTH (setzt req.auth.company = DEV_COMPANY_ID) ===========
app.use(devAuth);

// === STATICHE PROJEKTDATEN ========================================
app.use("/projects", express.static(PROJECTS_ROOT));

// === ROUTES =======================================================
app.use("/api/pdf", pdfRoutes);
app.use("/api/historie", historieRoutes);
app.use("/api/regie", regieRoutes);
app.use("/api/import", importRouter);
app.use("/api/projects", projectRoutes);

// Healthcheck (optional)
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// === DEV-COMPANY SICHERSTELLEN ====================================
async function ensureDevCompany() {
  const devId = process.env.DEV_COMPANY_ID;
  if (!devId) return;

  await prisma.company.upsert({
    where: { id: devId },
    update: {
      name: "RLC Bausoftware (DEV)",
      code: "dev",
      address: "Bischofswiesen",
    },
    create: {
      id: devId,
      name: "RLC Bausoftware (DEV)",
      code: "dev",
      address: "Bischofswiesen",
    },
  });

  console.log("  DEV company ready:", devId);
}

ensureDevCompany().catch((err) => {
  console.error("Fehler bei ensureDevCompany:", err);
});

// === ERROR-HANDLING ===============================================
app.use((req: Request, res: Response) => {
  res.status(404).json({ ok: false, error: "Not found" });
});

app.use(
  (err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error("Global error:", err);
    res
      .status(500)
      .json({ ok: false, error: err?.message || "Serverfehler" });
  }
);

// === SERVER STARTEN ===============================================
app.listen(PORT, () => {
  console.log(`[RLC-API] listening on http://localhost:${PORT}`);
  console.log(`  Projects root: ${PROJECTS_ROOT} (static: /projects)`);
});

export default app;
