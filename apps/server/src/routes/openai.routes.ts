import express, { Request, Response, NextFunction } from "express";
import OpenAI from "openai";
import { z } from "zod";

const r = express.Router();

// ⚙️ OpenAI-Client (neues SDK)
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 🔐 Request-Schema
const Req = z.object({
  text: z.string().min(2),
  unit: z.string().min(1),
});

// Standard-Modell (kannst du in .env überschreiben)
const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

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

      res.json({ unitPrice: price, confidence });
    } catch (e) {
      next(e);
    }
  }
);

export default r;
