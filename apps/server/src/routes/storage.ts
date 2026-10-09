import { Router } from "express";
import { storage } from "../storage/storageService";

const router = Router();

router.get("/health", async (_req, res) => {
  const result = await storage.health();
  res.status(result.ok ? 200 : 503).json({ ok: result.ok, provider: result.provider });
});

export default router;
