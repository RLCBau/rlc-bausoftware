import { Router } from "express";
import { storage, storageConfig } from "../storage/storageService";

const router = Router();

router.get("/health", async (_req, res) => {
  const result = await storage.health();
  res.status(result.ok ? 200 : 503).json({
    ...result,
    localRoot: storageConfig.provider === "local" ? storageConfig.localRoot : undefined,
  });
});

export default router;
