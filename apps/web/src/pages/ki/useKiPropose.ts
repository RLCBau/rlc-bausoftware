// apps/web/src/pages/ki/useKiPropose.ts

import { useState, useCallback } from "react";

type LVPos = {
  id: string;
  posNr: string;
  kurztext: string;
  einheit: string;
  menge: number;
  preis?: number;
};

type RawItem = {
  posNr?: string;
  kurztext?: string;
  langtext?: string;
  einheit?: string;
  menge?: number | string;
  preis?: number | string;
  confidence?: number | string;
};

type ProposedLVPos = LVPos & {
  confidence?: number;
  langtext?: string;
};

export function useKiPropose() {
  const [loading, setLoading] = useState(false);

  const propose = useCallback(
    async (projectText: string): Promise<ProposedLVPos[]> => {
      const cleanText = String(projectText || "").trim();
      if (!cleanText) return [];

      setLoading(true);

      try {
        const res = await fetch("/api/ki/propose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: cleanText }),
        });

        if (!res.ok) {
          const msg = await res.text().catch(() => "");
          throw new Error(msg || "KI propose failed");
        }

        const json: unknown = await res.json();
        return normalize(extractItems(json));
      } catch (e) {
        console.error("[useKiPropose]", e);
        return [];
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { propose, loading };
}

function extractItems(json: unknown): unknown {
  if (Array.isArray(json)) return json;

  if (json && typeof json === "object") {
    const record = json as Record<string, unknown>;
    if (Array.isArray(record.items)) return record.items;
    if (Array.isArray(record.rows)) return record.rows;
    if (Array.isArray(record.data)) return record.data;
  }

  return [];
}

function normalize(arr: unknown): ProposedLVPos[] {
  if (!Array.isArray(arr)) return [];

  const out: ProposedLVPos[] = [];

  for (const raw of arr) {
    if (!raw || typeof raw !== "object") continue;

    const it = raw as RawItem;

    const kurztext = String(it.kurztext || "").trim();
    const einheit = String(it.einheit || "").trim();

    if (!kurztext || !einheit) continue;

    out.push({
      id: crypto.randomUUID(),
      posNr: String(it.posNr || "").trim(),
      kurztext,
      langtext: String(it.langtext || "").trim(),
      einheit,
      menge: toNumber(it.menge, 0),
      preis: toOptionalNumber(it.preis),
      confidence: clamp01(toOptionalNumber(it.confidence)),
    });
  }

  return out;
}

function toNumber(v: unknown, fallback = 0): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  if (v == null || v === "") return fallback;

  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function toOptionalNumber(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (v == null || v === "") return undefined;

  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

function clamp01(n?: number): number | undefined {
  if (typeof n !== "number" || !Number.isFinite(n)) return undefined;
  return Math.max(0, Math.min(1, n));
}





