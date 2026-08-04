import express, { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { createRlcAiCompatClient } from "../services/ai/rlcAiCompatClient";

const r = express.Router();

// ⚙️ OpenAI-Client (neues SDK)
const client = createRlcAiCompatClient();

// 🔐 Request-Schema
const Req = z.object({
  text: z.string().min(2),
  unit: z.string().min(1),
});

// Standard-Modell (kannst du in .env überschreiben)
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// POST /api/openai/kalkulation
r.post(
  "/kalkulation",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { text, unit } = Req.parse(req.body);

      const prompt = `
Schätze einen realistischen Einheitspreis in EUR für folgende Bauposition.
Gib deine Antwort NUR als JSON zurück.

Text: "${text}"
Einheit: "${unit}"

Antwortformat (GENAU so):
{"price": <zahl>, "confidence": <0..1>}
`;

      const resp = await client.responses.create({
        model: MODEL,
        _rlcPurpose: "kalkulation",
        input: prompt,
        temperature: 0.2,
      });

      // 🔍 Text aus der neuen Responses-API holen
      let rawText = "";
      const anyResp = resp as any;

      if (anyResp.output_text) {
        // Komfortfeld der neuen SDK, falls vorhanden
        rawText = anyResp.output_text;
      } else if (
        anyResp.output &&
        Array.isArray(anyResp.output) &&
        anyResp.output[0]?.content?.[0]?.text?.value
      ) {
        rawText = anyResp.output[0].content[0].text.value as string;
      } else {
        rawText = "";
      }

      let data: any = {};
      try {
        data = JSON.parse(rawText);
      } catch {
        data = {};
      }

      const price = Number(data.price) || 0;
      const confidence = Math.max(
        0,
        Math.min(1, Number(data.confidence) || 0.7)
      );

      res.json({
        unitPrice: price,
        confidence,
        ai: anyResp?._rlc
          ? {
              provider: anyResp._rlc.provider,
              model: anyResp._rlc.model,
              mode: anyResp._rlc.mode,
              fallbackUsed: anyResp._rlc.fallbackUsed,
            }
          : undefined,
      });
    } catch (e) {
      next(e);
    }
  }
);

export default r;
