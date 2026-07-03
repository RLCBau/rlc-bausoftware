// apps/web/src/utils/cadImport.ts
// Bridge CAD → (Aufmaß/Kalkulation) via localStorage (queue-based)

export type CadExportPayload = {
  target: "aufmasseditor" | "kalkulation";
  kind: "AREA" | "LINE";
  layer: string;
  label?: string;
  area_m2?: number;
  length_m?: number;
  points?: { x: number; y: number }[];
  ts?: number;
};

const KEY = "rlc.cad.export.queue.v1";
const TTL = 2 * 60 * 1000; // 2 minuti

function safeParse(raw: string | null): CadExportPayload[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function validatePayload(p: CadExportPayload): boolean {
  if (!p.target || !p.kind || !p.layer) return false;

  if (p.kind === "AREA" && typeof p.area_m2 !== "number") return false;
  if (p.kind === "LINE" && typeof p.length_m !== "number") return false;

  return true;
}

/* =========================
   SAVE (queue)
   ========================= */

export function saveCadExport(payload: CadExportPayload) {
  const pack: CadExportPayload = {
    ...payload,
    ts: Date.now(),
  };

  if (!validatePayload(pack)) {
    console.warn("[CAD] invalid payload", pack);
    return;
  }

  try {
    const current = safeParse(localStorage.getItem(KEY));
    const next = [...current, pack];
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch (e) {
    console.error("[CAD] save error", e);
  }
}

/* =========================
   CONSUME (per target)
   ========================= */

export function consumeCadExport(
  expectedTarget: "aufmasseditor" | "kalkulation"
): CadExportPayload[] {
  try {
    const current = safeParse(localStorage.getItem(KEY));

    if (!current.length) return [];

    const now = Date.now();

    const valid = current.filter(
      (p) =>
        p.target === expectedTarget &&
        typeof p.ts === "number" &&
        now - p.ts < TTL
    );

    const remaining = current.filter(
      (p) =>
        !p.ts ||
        now - p.ts >= TTL ||
        p.target !== expectedTarget
    );

    localStorage.setItem(KEY, JSON.stringify(remaining));

    return valid;
  } catch (e) {
    console.error("[CAD] consume error", e);
    return [];
  }
}

/* =========================
   CLEAR (manual debug)
   ========================= */

export function clearCadExport() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}





