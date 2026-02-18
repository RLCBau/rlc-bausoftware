// apps/server/src/server.ts
import express from "express";
import cors from "cors";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";

// ATTENZIONE: con NodeNext/ESM serve l'estensione .js negli import locali
import kiRouter from "./routes/ki.js";
import docsRouter from "./routes/docs.js";
import importRouter from "./routes/import.js";

const prisma = new PrismaClient();
const app = express();

// middlewares
app.use(cors());
app.use(express.json());

// health
app.get("/api/health", (_req, res) => {
  res.send("RLC API OK");
});

// routers
app.use("/api/ki", kiRouter);
app.use("/api/docs", docsRouter);
app.use("/api/import", importRouter);

// --- Progetti ---------------------------------------------------------------

// Lista progetti (ultimi per id desc)
app.get("/projects", async (_req, res, next) => {
  try {
    const projects = await prisma.project.findMany({ orderBy: { id: "desc" } });
    res.json(projects);
  } catch (err) {
    next(err);
  }
});

// Crea progetto
// Se nel tuo schema `Project` alcuni campi sono obbligatori (es. code, companyId)
// e non li passi, Prisma lancerà un errore. Qui li gestiamo come opzionali.
app.post("/projects", async (req, res, next) => {
  try {
    const schema = z.object({
      name: z.string().min(1),
      code: z.string().optional(),
      companyId: z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "name required" });
    }

    // NB: se nel tuo schema companyId NON è nullable, devi per forza passarlo.
    // In quel caso togli il `?? null`.
    const created = await prisma.project.create({
      data: {
        name: parsed.data.name,
        code: parsed.data.code ?? `P-${Date.now()}`,
        // Se Project ha sia il campo scalare `companyId` che la relation `company`,
        // è lecito assegnare direttamente lo scalare (come sotto).
        // Se invece preferisci la connect:
        // company: parsed.data.companyId ? { connect: { id: parsed.data.companyId } } : undefined,
        companyId: parsed.data.companyId ?? null,
      } as any, // allenta i types se companyId è opzionale nel tuo schema
    });

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// 404 generico (dopo tutte le route)
app.use((_req, res) => {
  res.status(404).json({ error: "Not Found" });
});

// error handler
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[API ERROR]", err);
  res.status(500).json({ error: "Internal Server Error" });
});

// start
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(PORT, () => {
  console.log(`🚀 RLC API listening on http://localhost:${PORT}`);
});
