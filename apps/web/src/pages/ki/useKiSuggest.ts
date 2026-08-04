// apps/web/src/pages/ki/useKiSuggest.ts

import { useState, useCallback } from "react";

type SuggestResult = {
  unitPrice: number;
  confidence: number;
};

export function useKiSuggest() {
  const [loading, setLoading] = useState(false);

  const suggest = useCallback(
    async (kurztext?: string, einheit?: string): Promise<SuggestResult> => {
      const cleanKurztext = String(kurztext || "").trim();
      const cleanEinheit = String(einheit || "").trim();

      if (!cleanKurztext) {
        return { unitPrice: 0, confidence: 0 };
      }

      setLoading(true);

      try {
        const proxy = await fetch("/api/ki/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kurztext: cleanKurztext,
            einheit: cleanEinheit,
          }),
        });

        if (!proxy.ok) {
          const msg = await proxy.text().catch(() => "");
          throw new Error(msg || "KI-Suggest fehlgeschlagen");
        }

        const j = await proxy.json();

        return {
          unitPrice: toSafeNumber(j?.unitPrice, 0),
          confidence: clamp01(toSafeNumber(j?.confidence, 0)),
        };
      } catch {
        return { unitPrice: 0, confidence: 0 };
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { suggest, loading };
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function toSafeNumber(v: unknown, fallback = 0) {
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string"
      ? Number(v.replace(",", "."))
      : Number(v);

  return Number.isFinite(n) ? n : fallback;
}





