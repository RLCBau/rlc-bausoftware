import { create } from "zustand";
import * as fabric from "fabric";

type Hist = string;

interface CadState {
  canvas: fabric.Canvas | null;
  activeLayerId: string | null;

  setCanvas: (c: fabric.Canvas | null) => void;
  resizeCanvas: (w: number, h: number) => void;
  refreshGrid: () => void;

  _history: Hist[];
  _histIdx: number;
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;

  addRect: () => void;
  addCircle: () => void;
  addLine: () => void;
  addText: (t: string) => void;
  clearCanvas: () => void;

  exportSVG: () => string;
  exportPNG: () => Promise<string>;
  importAny: (args: { name: string; text: string }) => Promise<void>;
}

export const useCadStore = create<CadState>()((set, get) => ({
  canvas: null,
  activeLayerId: null,

  setCanvas: (c) => {
    set({ canvas: c });
    if (c) { applyGridPattern(c); c.requestRenderAll(); }
  },

  resizeCanvas: (w, h) => {
    const c = get().canvas; if (!c) return;
    c.setWidth(w); c.setHeight(h);
    applyGridPattern(c); c.requestRenderAll();
  },

  refreshGrid: () => {
    const c = get().canvas; if (!c) return;
    applyGridPattern(c); c.requestRenderAll();
  },

  _history: [],
  _histIdx: -1,

  pushHistory: () => {
    const c = get().canvas; if (!c) return;
    const snap = JSON.stringify(c.toJSON());
    const hist = get()._history.slice(0, get()._histIdx + 1);
    hist.push(snap);
    set({ _history: hist, _histIdx: hist.length - 1 });
  },

  undo: () => {
    const { _histIdx, _history, canvas } = get();
    if (!canvas || _histIdx <= 0) return;
    const idx = _histIdx - 1;
    canvas.loadFromJSON(_history[idx], () => {
      applyGridPattern(canvas); canvas.requestRenderAll(); set({ _histIdx: idx });
    });
  },

  redo: () => {
    const { _histIdx, _history, canvas } = get();
    if (!canvas || _histIdx >= _history.length - 1) return;
    const idx = _histIdx + 1;
    canvas.loadFromJSON(_history[idx], () => {
      applyGridPattern(canvas); canvas.requestRenderAll(); set({ _histIdx: idx });
    });
  },

  addRect: () => {
    const c = get().canvas; if (!c) return;
    const o = new fabric.Rect({ left: 100, top: 100, width: 120, height: 80, fill: "", stroke: "#333" });
    c.add(o); c.setActiveObject(o); c.requestRenderAll(); get().pushHistory();
  },

  addCircle: () => {
    const c = get().canvas; if (!c) return;
    const o = new fabric.Circle({ left: 180, top: 160, radius: 40, fill: "", stroke: "#333" });
    c.add(o); c.setActiveObject(o); c.requestRenderAll(); get().pushHistory();
  },

  addLine: () => {
    const c = get().canvas; if (!c) return;
    const o = new fabric.Line([50, 50, 250, 50], { stroke: "#333", strokeWidth: 2 });
    c.add(o); c.setActiveObject(o); c.requestRenderAll(); get().pushHistory();
  },

  addText: (t: string) => {
    const c = get().canvas; if (!c) return;
    const o = new fabric.Textbox(t || "Text", { left: 100, top: 100, fontSize: 20, fill: "#111" });
    c.add(o); c.setActiveObject(o); c.requestRenderAll(); get().pushHistory();
  },

  clearCanvas: () => {
    const c = get().canvas; if (!c) return;
    c.getObjects().slice().forEach(o => c.remove(o));
    applyGridPattern(c); c.requestRenderAll(); get().pushHistory();
  },

  exportSVG: () => {
    const c = get().canvas; if (!c) return "";
    // la griglia (background pattern) non va nello SVG
    return c.toSVG();
  },

  exportPNG: async () => {
    const c = get().canvas; if (!c) return "";
    return c.toDataURL({ format: "png" });
  },

  importAny: async ({ name, text }) => {
    const c = get().canvas; if (!c) return;
    const lower = name.toLowerCase();

    if (lower.endsWith(".svg")) {
      const { objects, options } = await new Promise<any>((resolve, reject) => {
        (fabric as any).loadSVGFromString(
          text,
          (objs: any[], opts: any) => resolve({ objects: objs, options: opts }),
          (err: any) => reject(err)
        );
      });
      const g = (fabric.util as any).groupSVGElements(objects, options);
      c.add(g); c.setActiveObject(g); c.requestRenderAll(); get().pushHistory();
      return;
    }

    if (lower.endsWith(".json")) {
      try {
        c.loadFromJSON(text, () => { applyGridPattern(c); c.requestRenderAll(); get().pushHistory(); });
      } catch { alert("JSON non valido"); }
      return;
    }

    alert("Formato non supportato.");
  },
}));

/** ===== Griglia come pattern di background (no Group/Line) ===== */
function applyGridPattern(c: fabric.Canvas, step = 50) {
  const tile = document.createElement("canvas");
  tile.width = step; tile.height = step;
  const ctx = tile.getContext("2d")!;
  ctx.strokeStyle = "#e0e0e0";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(step - 0.5, 0); ctx.lineTo(step - 0.5, step);
  ctx.moveTo(0, step - 0.5); ctx.lineTo(step, step - 0.5);
  ctx.stroke();
  const pattern = new (fabric as any).Pattern({ source: tile, repeat: "repeat" });
  (c as any).backgroundColor = pattern; // v6: proprietà diretta
  c.requestRenderAll();
}

export default useCadStore;
