import { Router } from "express";

const router = Router();

function cleanText(input: unknown): string {
  return String(input || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1800);
}

router.post("/", async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        ok: false,
        error: "OPENAI_API_KEY fehlt am Server.",
      });
    }

    const text = cleanText(req.body?.text);
    const voice = String(req.body?.voice || "coral");
    const instructions =
      String(req.body?.instructions || "").trim() ||
      "Sprich auf Deutsch natürlich, warm, weiblich, professionell und ruhig. Du bist der RLC Copilot für Baukalkulation. Nicht roboterhaft sprechen.";

    if (!text) {
      return res.status(400).json({
        ok: false,
        error: "Text fehlt.",
      });
    }

    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice,
        input: text,
        instructions,
        response_format: "mp3",
      }),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => "");
      return res.status(response.status).json({
        ok: false,
        error: "OpenAI TTS Fehler",
        detail: err.slice(0, 1000),
      });
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.send(audioBuffer);
  } catch (error: any) {
    res.status(500).json({
      ok: false,
      error: error?.message || "TTS Serverfehler",
    });
  }
});

export default router;
