import { Router } from "express";
import {
  getInternetIntelligenceEvents,
  getInternetIntelligenceRejections,
  getInternetIntelligenceStatus,
  runInternetIntelligenceCycle,
  startInternetIntelligenceAgent,
} from "../kalkulation/autonomous/internetIntelligenceAgent";
import {
  getAutonomousActivities,
  getAutonomousStatus,
  runAutonomousAgentNow,
  startAutonomousAgent,
} from "../kalkulation/autonomous/autonomousAgent";


import {
  applyMarketCandidate,
  getMarketDashboard,
  listMarketCandidates,
  reviewMarketCandidate,
  synchronizeMarketIntelligence,
} from "../kalkulation/autonomous/marketIntelligenceService";

import { analyzeMarketCandidateImpact } from "../kalkulation/autonomous/marketImpactEngine";

const router = Router();

startAutonomousAgent();
startInternetIntelligenceAgent();

router.get("/status", (_req, res) => {
  res.json(getAutonomousStatus());
});

router.get("/market/status", async (_req, res) => {
  res.json(await getInternetIntelligenceStatus());
});

router.get("/market/events", async (req, res) => {
  const limit = Number(req.query.limit || 100);
  res.json({ items: await getInternetIntelligenceEvents(limit) });
});

router.get("/market/rejections", async (req, res) => {
  const limit = Number(req.query.limit || 100);
  res.json({ items: await getInternetIntelligenceRejections(limit) });
});

router.post("/market/run", async (req, res) => {
  const configuredKey = String(process.env.RLC_AUTONOMOUS_RUN_KEY || "");
  const suppliedKey = String(req.header("x-rlc-autonomous-key") || "");
  if (!configuredKey || suppliedKey !== configuredKey) {
    return res.status(403).json({
      error: "MARKET_RUN_FORBIDDEN",
      message: "Manueller Lauf ist nur mit RLC_AUTONOMOUS_RUN_KEY erlaubt.",
    });
  }
  return res.json(await runInternetIntelligenceCycle(true));
});


router.get("/market/dashboard", async (_req, res) => {
  try { res.json(await getMarketDashboard()); }
  catch (error: any) { res.status(500).json({ error: "MARKET_DASHBOARD_FAILED", message: error?.message || String(error) }); }
});

router.post("/market/synchronize", async (_req, res) => {
  try { res.json(await synchronizeMarketIntelligence()); }
  catch (error: any) { res.status(500).json({ error: "MARKET_SYNC_FAILED", message: error?.message || String(error) }); }
});

router.get("/market/candidates", async (req, res) => {
  try { res.json({ items: await listMarketCandidates(String(req.query.status || "") || undefined, String(req.query.type || "") || undefined, Number(req.query.limit || 100)) }); }
  catch (error: any) { res.status(500).json({ error: "MARKET_CANDIDATES_FAILED", message: error?.message || String(error) }); }
});

router.post("/market/candidates/:id/review", async (req, res) => {
  try {
    const action = String(req.body?.action || "");
    if (action !== "APPROVE" && action !== "REJECT") return res.status(400).json({ error: "INVALID_REVIEW_ACTION" });
    res.json(await reviewMarketCandidate(req.params.id, action, req.body?.note, (req as any).user?.id));
  } catch (error: any) { res.status(500).json({ error: "MARKET_REVIEW_FAILED", message: error?.message || String(error) }); }
});

router.post("/market/candidates/:id/apply", async (req, res) => {
  try {
    const companyId = String(req.body?.companyId || (req as any).user?.companyId || (req as any).auth?.company || "");
    if (!companyId) return res.status(400).json({ error: "COMPANY_ID_REQUIRED" });
    res.json(await applyMarketCandidate(req.params.id, companyId, (req as any).user?.id));
  } catch (error: any) { res.status(400).json({ error: "MARKET_APPLY_FAILED", message: error?.message || String(error) }); }
});

router.get("/activities", async (req, res) => {
  const limit = Number(req.query.limit || 100);
  res.json({
    items: await getAutonomousActivities(limit),
  });
});

router.post("/run", async (req, res) => {
  const configuredKey = String(process.env.RLC_AUTONOMOUS_RUN_KEY || "");
  const suppliedKey = String(req.header("x-rlc-autonomous-key") || "");

  if (!configuredKey || suppliedKey !== configuredKey) {
    return res.status(403).json({
      error: "AUTONOMOUS_RUN_FORBIDDEN",
      message:
        "Manueller Lauf ist nur mit RLC_AUTONOMOUS_RUN_KEY erlaubt.",
    });
  }

  return res.json(await runAutonomousAgentNow());
});


router.post("/market/candidates/:id/analyze-impact", async (req, res) => {
  try {
    const companyId = String(
      (req.auth as any)?.companyId ||
      (req.auth as any)?.company ||
      process.env.DEV_COMPANY_ID ||
      ""
    ).trim();

    if (!companyId) {
      return res.status(400).json({
        error: "COMPANY_ID_REQUIRED",
      });
    }

    const result = await analyzeMarketCandidateImpact(
      String(req.params.id || ""),
      companyId
    );

    return res.json(result);
  } catch (error: any) {
    const message = String(error?.message || error);

    const status =
      message === "MARKET_CANDIDATE_NOT_FOUND"
        ? 404
        : message === "MARKET_CANDIDATE_NOT_PRICE_SUGGESTION"
          ? 409
          : 400;

    return res.status(status).json({
      error: message,
    });
  }
});

export default router;
