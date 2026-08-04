// apps/web/src/lib/cad/store.ts
import { CadDoc, Entity, Layer, Vec2 } from "./types";

const KEY = "rlc.cad.doc";

function newid() {
  return Math.random().toString(36).slice(2, 10);
}

function createDefaultDoc(): CadDoc {
  return {
    id: "CAD-001",
    name: "Zeichnung 1",
    layers: [
      { id: "L1", name: "0", color: "#22c55e", visible: true, locked: false },
      { id: "L2", name: "Bestand", color: "#60a5fa", visible: true, locked: false },
    ],
    entities: [],
    view: { cx: 0, cy: 0, zoom: 1 },
    updatedAt: new Date().toISOString(),
  };
}

function normalizeDoc(input: unknown): CadDoc {
  const fallback = createDefaultDoc();

  if (!input || typeof input !== "object") return fallback;

  const raw = input as Partial<CadDoc>;

  const layers: Layer[] = Array.isArray(raw.layers) && raw.layers.length > 0
    ? raw.layers
        .filter((l): l is Layer => !!l && typeof l === "object")
        .map((l, idx) => ({
          id: String(l.id || `L${idx + 1}`),
          name: String(l.name || `Layer ${idx + 1}`),
          color: l.color || "#94a3b8",
          visible: l.visible !== false,
          locked: l.locked === true,
        }))
    : fallback.layers;

  const entities: Entity[] = Array.isArray(raw.entities)
    ? raw.entities.filter((e): e is Entity => !!e && typeof e === "object")
    : [];

  return {
    id: String(raw.id || fallback.id),
    name: String(raw.name || fallback.name),
    layers,
    entities,
    view: {
      cx: Number(raw.view?.cx ?? fallback.view.cx),
      cy: Number(raw.view?.cy ?? fallback.view.cy),
      zoom: Number(raw.view?.zoom ?? fallback.view.zoom),
    },
    updatedAt: String(raw.updatedAt || fallback.updatedAt),
    meta: raw.meta && typeof raw.meta === "object" ? raw.meta : undefined,
  };
}

export function loadDoc(): CadDoc {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return createDefaultDoc();
    return normalizeDoc(JSON.parse(raw));
  } catch {
    return createDefaultDoc();
  }
}

export function saveDoc(doc: CadDoc) {
  try {
    const normalized = normalizeDoc(doc);
    localStorage.setItem(
      KEY,
      JSON.stringify({
        ...normalized,
        updatedAt: new Date().toISOString(),
      })
    );
  } catch {
    // ignore localStorage write errors
  }
}

function distPointToSegment(p: Vec2, a: Vec2, b: Vec2) {
  const ab = { x: b.x - a.x, y: b.y - a.y };
  const ap = { x: p.x - a.x, y: p.y - a.y };
  const ab2 = ab.x * ab.x + ab.y * ab.y;
  const t =
    ab2 === 0
      ? 0
      : Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y) / ab2));
  const proj = { x: a.x + t * ab.x, y: a.y + t * ab.y };
  return Math.hypot(p.x - proj.x, p.y - proj.y);
}

export const CadAPI = {
  newid,

  createDefaultDoc,

  getActiveLayerId(doc: CadDoc): string {
    const safeDoc = normalizeDoc(doc);
    const firstVisibleUnlocked = safeDoc.layers.find((l) => l.visible && !l.locked);
    return firstVisibleUnlocked?.id ?? safeDoc.layers[0]?.id ?? "L1";
  },

  addLayer(
    doc: CadDoc,
    name = `Layer ${doc.layers.length + 1}`,
    color = "#f59e0b"
  ) {
    const safeDoc = doc;
    safeDoc.layers.push({
      id: newid(),
      name,
      color,
      visible: true,
      locked: false,
    });
    safeDoc.updatedAt = new Date().toISOString();
  },

  removeLayer(doc: CadDoc, id: string) {
    if (doc.layers.length <= 1) return;

    doc.entities = doc.entities.filter((e) => e.layerId !== id);
    doc.layers = doc.layers.filter((l) => l.id !== id);

    if (doc.layers.length === 0) {
      doc.layers = createDefaultDoc().layers;
    }

    doc.updatedAt = new Date().toISOString();
  },

  addEntity(doc: CadDoc, e: Entity) {
    doc.entities.push(e);
    doc.updatedAt = new Date().toISOString();
  },

  removeEntity(doc: CadDoc, id: string) {
    doc.entities = doc.entities.filter((e) => e.id !== id);
    doc.updatedAt = new Date().toISOString();
  },

  hitTest(doc: CadDoc, p: Vec2, tol = 6): Entity | null {
    const t = tol;
    const near = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y) <= t;

    for (let i = doc.entities.length - 1; i >= 0; i--) {
      const e = doc.entities[i];
      const lay = doc.layers.find((l) => l.id === e.layerId);
      if (!lay?.visible) continue;

      if (e.type === "point") {
        if (near(e.p, p)) return e;
      } else if (e.type === "line") {
        const d = distPointToSegment(p, e.a, e.b);
        if (d <= t) return e;
      } else if (e.type === "polyline") {
        for (let j = 0; j < e.points.length - 1; j++) {
          const d = distPointToSegment(p, e.points[j], e.points[j + 1]);
          if (d <= t) return e;
        }

        if (e.closed && e.points.length > 2) {
          const d = distPointToSegment(
            p,
            e.points[e.points.length - 1],
            e.points[0]
          );
          if (d <= t) return e;
        }
      }
    }

    return null;
  },
};





