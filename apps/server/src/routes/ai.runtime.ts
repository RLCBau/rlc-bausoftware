import { Router } from "express";
import { z } from "zod";
import {
  checkOllamaHealth,
  completeRlcAiText,
  getRlcAiRuntimeStatus,
} from "../services/ai/rlcAiGateway";

const router = Router();

function requireAiRuntimeAdmin(req: any, res: any, next: any) {
  const role = String(req?.auth?.companyRole || req?.auth?.role || "").trim().toUpperCase();
  if (!["ADMIN", "ADMINISTRATOR"].includes(role)) {
    return res.status(403).json({ ok: false, error: "AI_RUNTIME_ADMIN_REQUIRED" });
  }
  return next();
}

const TestRequest = z.object({
  message: z.string().min(1).max(2000).default("Antworte nur mit: RLC KI OK"),
  json: z.boolean().optional().default(false),
});

router.get("/status", async (_req, res) => {
  const localHealth = await checkOllamaHealth();
  return res.json({
    ok: true,
    engine: "rlc-ai-runtime-v1",
    ...getRlcAiRuntimeStatus(),
    localHealth,
  });
});

router.post("/test", requireAiRuntimeAdmin, async (req, res) => {
  try {
    const body = TestRequest.parse(req.body || {});
    const result = await completeRlcAiText({
      purpose: "generic",
      responseFormat: body.json ? "json" : "text",
      temperature: 0,
      maxTokens: 180,
      messages: [
        {
          role: "system",
          content:
            "Du bist der technische Selbsttest von RLC KI. Antworte kurz und erfinde keine Projektdaten.",
        },
        { role: "user", content: body.message },
      ],
    });

    return res.json({
      ok: true,
      answer: result.text,
      provider: result.provider,
      model: result.model,
      mode: result.mode,
      fallbackUsed: result.fallbackUsed,
      latencyMs: result.latencyMs,
    });
  } catch (error: any) {
    return res.status(503).json({
      ok: false,
      error: String(error?.message || error || "RLC KI test failed").slice(0, 1000),
      runtime: getRlcAiRuntimeStatus(),
    });
  }
});

export default router;

