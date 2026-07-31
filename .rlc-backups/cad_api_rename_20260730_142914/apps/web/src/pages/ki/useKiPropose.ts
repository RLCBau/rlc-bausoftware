import { useState, useCallback } from "react";
import { LVPos } from "./store.lv";

type RawItem = {
  posNr?: string;
  kurztext: string;
  langtext?: string;
  einheit: string;
  menge?: number;
  preis?: number;
  confidence?: number;
};

const SYS_PROMPT = `Du bist Kalkulator für Tief-/Straßenbau. 
Erzeuge eine Liste geeigneter LV-Positionen als JSON-Array.
Jedes Element: { "posNr": "01.001" (optional), "kurztext": "...", "langtext": "...", "einheit": "m/m²/Stk", "menge": number, "preis": number (optional), "confidence": 0..1 }.
Keine Erklärungen, nur JSON. Realistische deutsche Bezeichnungen.`;

export function useKiPropose() {
  const [loading, setLoading] = useState(false);

  const propose = useCallback(async (projectText: string): Promise<(LVPos & {confidence?:number})[]> => {
    if (!projectText?.trim()) return [];
    setLoading(true);
    try {
      // 1) tenta proxy server
      const res = await fetch("/api/ki/propose", {
        method:"POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ text: projectText }),
      });
      if (res.ok) {
        const json = await res.json();
        return normalize(json?.items || json);
      }

      // 2) fallback diretto OpenAI
      const key = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
      if (!key) return [];
      const body = {
        model: "gpt-4o-mini",
        messages: [
          { role:"system", content: SYS_PROMPT },
          { role:"user", content: projectText }
        ],
        temperature: 0.2,
        response_format: { type: "json_object" }, // riceviamo {items:[...]} o [...]
      };
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method:"POST",
        headers:{ "Content-Type":"application/json", Authorization:`Bearer ${key}` },
        body: JSON.stringify(body),
      });
      if (!r.ok) return [];
      const data = await r.json();
      const content = data.choices?.[0]?.message?.content as string | undefined;
      const parsed = safeJson(content);
      const arr = Array.isArray(parsed) ? parsed : parsed?.items;
      return normalize(arr);
    } catch {
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  return { propose, loading };
}

function normalize(arr:any): (LVPos & {confidence?:number})[] {
  if (!Array.isArray(arr)) return [];
  const out: (LVPos & {confidence?:number})[] = [];
  for (const it of arr as RawItem[]) {
    if (!it?.kurztext || !it?.einheit) continue;
    out.push({
      id: crypto.randomUUID(),
      posNr: it.posNr || "",
      kurztext: it.kurztext,
      langtext: it.langtext || "",
      einheit: it.einheit,
      menge: Number(it.menge) || 0,
      preis: typeof it.preis === "number" ? it.preis : undefined,
      confidence: clamp01(Number(it.confidence)),
    });
  }
  return out;
}

function clamp01(n:number){ return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : undefined as any; }
function safeJson(s?:string){ try{ return s ? JSON.parse(s) : null; }catch{ return null; } }
