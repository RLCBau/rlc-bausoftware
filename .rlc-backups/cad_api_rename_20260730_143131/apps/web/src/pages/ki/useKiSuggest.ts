import { useState, useCallback } from "react";

type SuggestResult = { unitPrice: number; confidence: number };

const SYS_PROMPT = `Du bist ein Kalkulator für Tief- und Straßenbau in Deutschland.
Gib einen realistischen Einheitspreis in EUR (netto) zurück und eine Confidence (0..1).
Berücksichtige Einheit, Kurztext, typische Nebenkosten und regionale Mittelwerte.
Antwort-JSON: {"unitPrice": number, "confidence": number}.`;

export function useKiSuggest() {
  const [loading, setLoading] = useState(false);

  const suggest = useCallback(async (kurztext?: string, einheit?: string): Promise<SuggestResult> => {
    setLoading(true);
    try {
      // 1) Server proxy (preferito)
      const proxy = await fetch("/api/ki/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kurztext, einheit }),
      });
      if (proxy.ok) {
        const j = await proxy.json();
        return { unitPrice: Number(j.unitPrice) || 0, confidence: Number(j.confidence) || 0.7 };
      }

      // 2) Fallback diretto OpenAI
      const key = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
      if (!key) return { unitPrice: 0, confidence: 0 };

      const prompt = `Kurztext: ${kurztext || ""}\nEinheit: ${einheit || ""}`;
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: SYS_PROMPT },
            { role: "user", content: prompt },
          ],
          temperature: 0.2,
          response_format: { type: "json_object" },
        }),
      });

      if (!res.ok) return { unitPrice: 0, confidence: 0 };
      const data = await res.json();
      const parsed = safeJson(data.choices?.[0]?.message?.content);
      return {
        unitPrice: Number(parsed?.unitPrice) || 0,
        confidence: clamp01(Number(parsed?.confidence)),
      };
    } catch {
      return { unitPrice: 0, confidence: 0 };
    } finally {
      setLoading(false);
    }
  }, []);

  return { suggest, loading };
}

function clamp01(n: number) { if (Number.isFinite(n)) return Math.max(0, Math.min(1, n)); return 0; }
function safeJson(s: string | undefined) { try { return s ? JSON.parse(s) : null; } catch { return null; } }
