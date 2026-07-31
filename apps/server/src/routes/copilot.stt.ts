import { Router } from "express";
import multer from "multer";
import OpenAI from "openai";
import { toFile } from "openai/uploads";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");
  return new OpenAI({ apiKey });
}

router.post("/stt", upload.single("audio"), async (req, res) => {
  try {
    const file = req.file;

    if (!file || !file.buffer?.length) {
      return res.status(400).json({
        ok: false,
        error: "Keine Audiodatei erhalten.",
      });
    }

    const openai = getOpenAI();

    const audioFile = await toFile(
      file.buffer,
      file.originalname || "rlc-mobile-copilot.m4a",
      {
        type: file.mimetype || "audio/m4a",
      }
    );

    const result = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "gpt-4o-mini-transcribe",
      language: "de",
    });

    const text = String(result.text || "").trim();

    return res.json({
      ok: true,
      text,
      transcript: text,
    });
  } catch (e: any) {
    console.error("[copilot:stt]", e?.message || e);
    return res.status(500).json({
      ok: false,
      error: e?.message || "STT failed",
    });
  }
});

export default router;
