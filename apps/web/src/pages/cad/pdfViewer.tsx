// src/pages/pdf/PDFViewer.tsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { useProject } from "../../store/useProject";
import { usePersistedState } from "../../store/persist";

// PDF.js
import * as pdfjs from "pdfjs-dist";
import "pdfjs-dist/build/pdf.worker.mjs";

/* ============================================================
   PDF TAKEOFF / KI (PDFViewer)
   - nutzt die bestehenden Server-Routen aus autoKi.ts:
       GET  /api/auto-ki/:projectKey
       POST /api/auto-ki/:projectKey/analyze
       POST /api/auto-ki/:projectKey/save
       POST /api/auto-ki/:projectKey/export-to-aufmass
       GET  /api/auto-ki/:projectKey/aufmass-history
       POST /api/auto-ki/:projectKey/aufmass-history/snapshot

   - zusätzlich: lokale Exporte für Kalkulation/Nachtrag (LocalStorage),
     damit wir nichts am Backend brechen.

   FIXES:
   1) PDFViewer größer (Layout + Viewport)
   2) Beim Seitenwechsel/Route-Wechsel geht nichts verloren:
      - Takeoff-State (rows/preview/summary/etc.) ist jetzt projectScoped persisted
      - PDF wählen löscht Takeoff NICHT mehr automatisch (Reset-Button hinzugefügt)
   ============================================================ */

/** ===================== Types ===================== */
type Det = {
  id: string;
  pos: string;
  type: "LINE" | "AREA" | "COUNT";
  descr: string;
  unit: string;
  qty: number;
  layer?: string;
  source?: string;
  poly?: { x: number; y: number }[];
  box?: { x: number; y: number; w: number; h: number }; // legacy pixel box
};

type DetectBox = {
  id: string;
  label: string;
  score: number;
  qty?: number;
  unit?: string;
  box?: [number, number, number, number]; // normalized 0..1
};

type PhotoPosition = {
  id?: string; // LV-Pos (001.001 / FOTO.001)
  kurztext: string;
  einheit?: string;
  qty?: number | null;
  typ?: "sichtbar" | "implizit";
  status?: "bestehend" | "nachtrag";
};

type ExtraRow = {
  id: string;
  typ: "KI" | "Manuell";
  lvPos?: string;
  beschreibung: string;
  einheit: string;
  menge: number;
};

type AutoKiFile = {
  savedAt: string;
  projectIdOrCode: string;
  fsKey: string;
  note?: string;
  scale?: string;
  sourceFile?: { name?: string; type?: string; size?: number } | null;
  preview?: string | null; // dataURL
  boxes?: DetectBox[];
  extras?: ExtraRow[];
  summary?: string;
  positions?: PhotoPosition[];
  items: Det[];
};

type HistorySnap = { ts: number; count: number; note?: string; source?: string };

type Targets = {
  aufmass: boolean;
  kalkulation: boolean;
  nachtrag: boolean;
};

type TakeoffRow = {
  id: string;
  pos: string;
  type: "LINE" | "AREA" | "COUNT";
  descr: string;
  unit: string;
  qty: number;
  source?: string;
  targets: Targets;
};

/* ===================== API RESOLUTION (robust, no double /api) ===================== */
const RAW_API_BASE =
  (import.meta as any)?.env?.VITE_API_URL ||
  (import.meta as any)?.env?.VITE_BACKEND_URL ||
  "http://localhost:4000";

function normalizeApiBase(v: string) {
  let s = String(v || "").trim();
  if (!s) s = "http://localhost:4000";
  s = s.replace(/\/+$/, "");
  if (s.endsWith("/api")) s = s.slice(0, -4);
  return s;
}
const API_BASE = normalizeApiBase(RAW_API_BASE);
const API = `${API_BASE}/api`;

/* ===================== Local persistence keys ===================== */
const LS_KEY = (k: string) => `RLC_PDF_TAKEOFF_${k}`;
const LS_LAST = "RLC_PDF_TAKEOFF_LAST_PROJECT_KEY";

const AUFMASS_LAST_KEY = "RLC_AUFMASS_LAST_KEY";
const KALK_IMPORT_KEY = (k: string) => `RLC_KALKULATION_IMPORT_${k}`;
const NACHTRAG_IMPORT_KEY = (k: string) => `RLC_NACHTRAG_IMPORT_${k}`;

/** AufmaßEditor local bridge (wie bei AutoKI) */
type AufmassLVRowLocal = {
  id: string;
  pos: string;
  text: string;
  unit: string;
  ep: number;
  soll: number;
  formula: string;
  ist: number;
  note?: string;
  factor?: number;
};
function aufmassLocalKey(projectUuid: string) {
  return `RLC_AUFMASS_${projectUuid}`;
}
function loadAufmassLocal(projectUuid: string): AufmassLVRowLocal[] {
  try {
    const raw = localStorage.getItem(aufmassLocalKey(projectUuid));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AufmassLVRowLocal[]) : [];
  } catch {
    return [];
  }
}
function saveAufmassLocal(projectUuid: string, rows: AufmassLVRowLocal[]) {
  try {
    localStorage.setItem(aufmassLocalKey(projectUuid), JSON.stringify(rows));
  } catch {}
}

function setLastKey(k: string) {
  try {
    localStorage.setItem(LS_LAST, k);
  } catch {}
}
function getLastKey(): string | null {
  try {
    return localStorage.getItem(LS_LAST);
  } catch {
    return null;
  }
}
function setAufmassLastKey(k: string) {
  try {
    localStorage.setItem(AUFMASS_LAST_KEY, k);
  } catch {}
}
function lsSave(key: string, payload: any) {
  try {
    localStorage.setItem(LS_KEY(key), JSON.stringify(payload));
  } catch {}
}
function lsLoad<T = any>(key: string): T | null {
  try {
    const raw = localStorage.getItem(LS_KEY(key));
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? (obj as T) : null;
  } catch {
    return null;
  }
}

/* ===================== helper: fetch with better errors ===================== */
async function fetchTextSafe(res: Response) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

async function fetchFirstOk(urls: string[], init?: RequestInit): Promise<{ url: string; res: Response }> {
  let lastErr: any = null;
  for (const u of urls) {
    try {
      const r = await fetch(u, init);
      if (r.ok) return { url: u, res: r };
      const t = await fetchTextSafe(r);
      lastErr = new Error(t || `HTTP ${r.status} (${u})`);
    } catch (e: any) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Failed to fetch");
}

function safeBaseName(name: string) {
  const n = String(name || "file").replace(/[^\w.\-]+/g, "_");
  return n.replace(/\.pdf$/i, "");
}

function parseQuality(scaleStr: string) {
  const s = String(scaleStr || "").trim();
  const num = Number(
    s
      .replace(",", ".")
      .replace(/[^0-9.]/g, "")
  );
  if (!Number.isFinite(num) || num <= 0) return 2.5;
  if (num > 20) return 2.5;
  return Math.max(1, Math.min(6, num));
}

/* ===================== PDF -> PNG (Frontend) ===================== */
async function pdfFirstPageToPng(
  file: File,
  desiredScale = 3.5,
  maxPixels = 18_000_000
): Promise<{ blob: Blob; dataUrl: string }> {
  const buf = await file.arrayBuffer();
  const pdfjsLegacy: any = await import("pdfjs-dist/legacy/build/pdf");

  const loadingTask = pdfjsLegacy.getDocument({
    data: new Uint8Array(buf),
    disableWorker: true,
  });

  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);

  const v1 = page.getViewport({ scale: 1 });
  let scale = Math.max(1.5, Math.min(10, Number(desiredScale) || 3.5));

  const targetPixels = v1.width * v1.height * scale * scale;
  if (targetPixels > maxPixels) {
    const factor = Math.sqrt(maxPixels / (v1.width * v1.height));
    scale = Math.max(1.5, Math.min(scale, factor));
  }

  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context not available");

  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);

  await page.render({ canvasContext: ctx, viewport }).promise;

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (!b) return reject(new Error("canvas.toBlob failed"));
      resolve(b);
    }, "image/png");
  });

  const dataUrl: string = await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ""));
    fr.onerror = () => reject(new Error("FileReader failed (blob->dataURL)"));
    fr.readAsDataURL(blob);
  });

  return { blob, dataUrl };
}

/* ===================== NEW: Image tiling (PDF big plans) ===================== */
async function dataUrlToImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = dataUrl;
  });
}

async function canvasToPngBlob(cvs: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    cvs.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
  });
}

async function makeTilesFromDataUrl(args: {
  dataUrl: string;
  tileMax: number;
  overlap: number;
}): Promise<Array<{ blob: Blob; name: string; ix: number; iy: number; cols: number; rows: number }>> {
  const { dataUrl, tileMax, overlap } = args;
  const img = await dataUrlToImage(dataUrl);

  const W = img.width;
  const H = img.height;

  const step = Math.max(400, tileMax - overlap);
  const cols = Math.ceil((W - overlap) / step);
  const rows = Math.ceil((H - overlap) / step);

  const out: Array<{ blob: Blob; name: string; ix: number; iy: number; cols: number; rows: number }> = [];

  for (let iy = 0; iy < rows; iy++) {
    for (let ix = 0; ix < cols; ix++) {
      const sx = ix * step;
      const sy = iy * step;
      const sw = Math.min(tileMax, W - sx);
      const sh = Math.min(tileMax, H - sy);

      const cvs = document.createElement("canvas");
      cvs.width = sw;
      cvs.height = sh;
      const g = cvs.getContext("2d");
      if (!g) continue;

      g.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      const blob = await canvasToPngBlob(cvs);

      out.push({
        blob,
        name: `tile_${iy + 1}-${ix + 1}.png`,
        ix,
        iy,
        cols,
        rows,
      });
    }
  }

  return out;
}

/* ===================== helpers ===================== */
const prettyScore = (s: number) => (Number(s || 0) * 100).toFixed(1) + "%";

function normalizeAndReindexAutoPositions(rows: TakeoffRow[]): TakeoffRow[] {
  const out: TakeoffRow[] = [];
  let autoCounter = 0;

  for (const it of rows || []) {
    const rawPos = String(it?.pos || "").trim();
    const isAuto = !rawPos || /^AUTO\.\d+$/i.test(rawPos);
    if (isAuto) {
      autoCounter += 1;
      const n = String(autoCounter).padStart(3, "0");
      out.push({ ...it, pos: `AUTO.${n}` });
    } else {
      out.push({ ...it, pos: rawPos });
    }
  }
  return out;
}

function takeoffFromBackend(args: {
  items?: Det[];
  positions?: PhotoPosition[];
  fallbackTargets?: Targets;
}): TakeoffRow[] {
  const fallbackTargets: Targets =
    args.fallbackTargets ?? { aufmass: true, kalkulation: false, nachtrag: false };

  const positions = Array.isArray(args.positions) ? args.positions : [];
  if (positions.length) {
    return normalizeAndReindexAutoPositions(
      positions
        .filter((p) => String(p?.kurztext || "").trim().length > 0)
        .map((p, idx) => ({
          id: crypto.randomUUID(),
          pos:
            p.id && String(p.id).trim()
              ? String(p.id).trim()
              : `AUTO.${String(idx + 1).padStart(3, "0")}`,
          type: "COUNT" as const,
          descr: String(p.kurztext || "").trim(),
          unit: String(p.einheit || "").trim() || "m",
          qty: p.qty == null ? 0 : Number(p.qty),
          source: "image+openai",
          targets: { ...fallbackTargets },
        }))
    );
  }

  const items = Array.isArray(args.items) ? args.items : [];
  return normalizeAndReindexAutoPositions(
    items
      .filter((d) => String(d?.descr || "").trim().length > 0)
      .map((d, idx) => ({
        id: String(d.id || crypto.randomUUID()),
        pos: String(d.pos || "").trim() || `AUTO.${String(idx + 1).padStart(3, "0")}`,
        type: (d.type || "COUNT") as any,
        descr: String(d.descr || "").trim(),
        unit: String(d.unit || "").trim() || "m",
        qty: Number(d.qty || 0),
        source: d.source || "auto-ki",
        targets: { ...fallbackTargets },
      }))
  );
}

function buildAutoKiPayload(args: {
  projectKey: string;
  note: string;
  scale: string;
  file: File | null;
  preview: string | null;
  boxes: DetectBox[];
  extras: ExtraRow[];
  summary: string;
  positions: PhotoPosition[];
  items: Det[];
}): AutoKiFile {
  return {
    savedAt: new Date().toISOString(),
    projectIdOrCode: args.projectKey,
    fsKey: args.projectKey,
    note: args.note,
    scale: args.scale,
    sourceFile: args.file
      ? { name: args.file.name, type: args.file.type || undefined, size: args.file.size || undefined }
      : null,
    preview: args.preview ?? null,
    boxes: args.boxes ?? [],
    extras: args.extras ?? [],
    summary: args.summary ?? "",
    positions: args.positions ?? [],
    items: args.items ?? [],
  };
}

function defaultTargets(): Targets {
  return { aufmass: true, kalkulation: false, nachtrag: false };
}

/* ===================== UI: Beschreibung Editor Modal ===================== */
function DescrModal(props: {
  open: boolean;
  title: string;
  value: string;
  onClose: () => void;
  onSave: (v: string) => void;
}) {
  const [v, setV] = React.useState(props.value);

  React.useEffect(() => {
    if (props.open) setV(props.value);
  }, [props.open, props.value]);

  if (!props.open) return null;

  return (
    <div
      onClick={props.onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 18,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(1100px, 96vw)",
          height: "min(82vh, 900px)",
          background: "white",
          borderRadius: 12,
          overflow: "hidden",
          border: "1px solid rgba(0,0,0,0.12)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: 10,
            borderBottom: "1px solid var(--line)",
            display: "flex",
            gap: 10,
            alignItems: "center",
          }}
        >
          <div style={{ fontWeight: 700, flex: 1 }}>{props.title}</div>
          <button className="btn" type="button" onClick={props.onClose}>
            Schließen
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => {
              props.onSave(v);
              props.onClose();
            }}
          >
            Speichern
          </button>
        </div>

        <div style={{ padding: 12, flex: 1, overflow: "auto", background: "#f4f6f8" }}>
          <textarea
            value={v}
            onChange={(e) => setV(e.target.value)}
            style={{
              width: "100%",
              height: "100%",
              resize: "none",
              border: "1px solid rgba(0,0,0,0.15)",
              borderRadius: 10,
              padding: 12,
              fontSize: 14,
              lineHeight: 1.35,
              outline: "none",
              background: "white",
            }}
            placeholder="Beschreibung bearbeiten…"
          />
        </div>
      </div>
    </div>
  );
}

/* ===================== Component ===================== */
export default function PDFViewer() {
  const nav = useNavigate();
  const projStore = useProject() as any;

  // robust project resolve (neue + alte Store-Formen)
  const project = projStore?.getSelectedProject?.() ?? null;
  const projectCode: string = String(project?.code || "").trim();
  const projectUuid: string = String(project?.id || projStore?.projectId || "").trim();

  const keyCandidates = React.useMemo(() => {
    const arr = [projectCode, projectUuid].filter((x) => !!x);
    return Array.from(new Set(arr));
  }, [projectCode, projectUuid]);

  const projectKey: string | null = keyCandidates[0] ?? null;
  const effectiveKey = React.useMemo(() => projectKey || getLastKey() || null, [projectKey]);

  // PDF viewer state (doc/canvas ist runtime, nicht persist)
  const [pdf, setPdf] = React.useState<pdfjs.PDFDocumentProxy | null>(null);
  const [pages, setPages] = React.useState<number>(0);
  const [pageNum, setPageNum] = usePersistedState<number>(1, { key: "pdf.takeoff.pageNum", projectScoped: true });
  const [scaleView, setScaleView] = usePersistedState<number>(1.1, {
    key: "pdf.takeoff.scaleView",
    projectScoped: true,
  });

  const [status, setStatus] = usePersistedState<string>("Kein PDF geladen", {
    key: "pdf.takeoff.status",
    projectScoped: true,
  });

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // Takeoff / KI state (persisted -> verliert sich nicht beim Seiten-/Routewechsel)
  const [note, setNote] = usePersistedState<string>("", { key: "pdf.takeoff.note", projectScoped: true });
  const [quality, setQuality] = usePersistedState<string>("2.5", { key: "pdf.takeoff.quality", projectScoped: true });

  const [preview, setPreview] = usePersistedState<string | null>(null, {
    key: "pdf.takeoff.preview",
    projectScoped: true,
  });
  const [summary, setSummary] = usePersistedState<string>("", { key: "pdf.takeoff.summary", projectScoped: true });
  const [boxes, setBoxes] = usePersistedState<DetectBox[]>([], { key: "pdf.takeoff.boxes", projectScoped: true });
  const [positions, setPositions] = usePersistedState<PhotoPosition[]>([], {
    key: "pdf.takeoff.positions",
    projectScoped: true,
  });
  const [items, setItems] = usePersistedState<Det[]>([], { key: "pdf.takeoff.items", projectScoped: true });
  const [rows, setRows] = usePersistedState<TakeoffRow[]>([], { key: "pdf.takeoff.rows", projectScoped: true });

  const [history, setHistory] = usePersistedState<HistorySnap[]>([], { key: "pdf.takeoff.history", projectScoped: true });

  // Non-persisted runtime
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [serverBusy, setServerBusy] = React.useState(false);

  // UI toggles
  const [editOn, setEditOn] = usePersistedState<boolean>(true, { key: "pdf.takeoff.editOn", projectScoped: true });
  const [zoomOpen, setZoomOpen] = React.useState(false);
  const [zoomScale, setZoomScale] = usePersistedState<number>(1.35, {
    key: "pdf.takeoff.zoomScale",
    projectScoped: true,
  });

  // Beschreibung modal
  const [descrModalOpen, setDescrModalOpen] = React.useState(false);
  const [descrModalRowId, setDescrModalRowId] = React.useState<string | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  /* ===================== local draft save/restore (legacy compatibility) ===================== */
  const draftSave = React.useCallback(
    (partial?: any) => {
      if (!effectiveKey) return;
      setLastKey(effectiveKey);
      const payload = {
        savedAt: new Date().toISOString(),
        note,
        quality,
        preview,
        summary,
        boxes,
        positions,
        items,
        rows,
        pageNum,
        scaleView,
        ...(partial || {}),
      };
      lsSave(effectiveKey, payload);
    },
    [effectiveKey, note, quality, preview, summary, boxes, positions, items, rows, pageNum, scaleView]
  );

  // restore legacy draft if exists (one-time per effectiveKey)
  React.useEffect(() => {
    if (!effectiveKey) return;
    const local = lsLoad<any>(effectiveKey);
    if (!local) return;

    // nur setzen, wenn der persisted state noch "leer" ist, damit wir nicht überschreiben
    const hasAny =
      (Array.isArray(rows) && rows.length > 0) ||
      !!preview ||
      !!summary ||
      (Array.isArray(boxes) && boxes.length > 0) ||
      (Array.isArray(positions) && positions.length > 0) ||
      (Array.isArray(items) && items.length > 0);

    if (!hasAny) {
      setNote(String(local.note ?? ""));
      setQuality(String(local.quality ?? "2.5"));
      setPreview(local.preview ?? null);
      setSummary(String(local.summary ?? ""));
      setBoxes(Array.isArray(local.boxes) ? local.boxes : []);
      setPositions(Array.isArray(local.positions) ? local.positions : []);
      setItems(Array.isArray(local.items) ? local.items : []);
      setRows(Array.isArray(local.rows) ? local.rows : []);
      if (typeof local.pageNum === "number") setPageNum(local.pageNum);
      if (typeof local.scaleView === "number") setScaleView(local.scaleView);
    }

    setLastKey(effectiveKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveKey]);

  // keep legacy draft updated (harmless, but does not control UI anymore)
  React.useEffect(() => {
    if (!effectiveKey) return;
    const t = window.setTimeout(() => draftSave(), 250);
    return () => window.clearTimeout(t);
  }, [effectiveKey, note, quality, preview, summary, boxes, positions, items, rows, pageNum, scaleView, draftSave]);

  /* ===================== PDF load/render ===================== */
  async function openFromFile(f: File) {
    try {
      setStatus("Lade PDF aus Datei …");
      const buf = await f.arrayBuffer();
      const doc = await pdfjs.getDocument({ data: buf }).promise;

      setPdf(doc);
      setPages(doc.numPages);
      setPageNum((prev) => {
        const nn = Math.max(1, Math.min(doc.numPages, typeof prev === "number" ? prev : 1));
        return nn;
      });
      setStatus(`Geladen: ${f.name} (${doc.numPages} Seiten)`);
      setFile(f);

      // render current page on canvas
      const nn = Math.max(1, Math.min(doc.numPages, pageNum || 1));
      await renderPage(doc, nn, scaleView);
    } catch (e) {
      console.error(e);
      setStatus("Fehler beim Laden der Datei");
    }
  }

  async function renderPage(doc: pdfjs.PDFDocumentProxy, n: number, sc: number) {
    const c = canvasRef.current;
    if (!c) return;

    const nn = Math.max(1, Math.min(doc.numPages, n));
    const p = await doc.getPage(nn);
    const vp = p.getViewport({ scale: sc });

    c.width = Math.ceil(vp.width);
    c.height = Math.ceil(vp.height);

    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);

    await p.render({ canvasContext: ctx, viewport: vp }).promise;
  }

  React.useEffect(() => {
    (async () => {
      if (!pdf) return;
      await renderPage(pdf, pageNum, scaleView);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, pageNum, scaleView]);

  /* ===================== Server helpers ===================== */
  const makeUrls = React.useCallback(
    (suffix: string) => keyCandidates.map((k) => `${API}/auto-ki${suffix.replace("{key}", encodeURIComponent(k))}`),
    [keyCandidates]
  );

  function normalizeLoadedPayload(projectKeyFallback: string, json: any): AutoKiFile | null {
    if (json && typeof json === "object" && "data" in json) {
      const p = json.data;
      if (!p) return null;
      return p as AutoKiFile;
    }
    if (json && typeof json === "object" && json.ok) {
      const itemsArr = Array.isArray(json.items) ? (json.items as Det[]) : [];
      const boxesArr = Array.isArray(json.boxes) ? (json.boxes as DetectBox[]) : [];
      const extrasArr = Array.isArray(json.extras) ? (json.extras as ExtraRow[]) : [];
      const positionsArr = Array.isArray(json.positions) ? (json.positions as PhotoPosition[]) : [];
      const payload: AutoKiFile = {
        savedAt: String(json.savedAt || new Date().toISOString()),
        projectIdOrCode: String(json.projectIdOrCode || json.projectKey || projectKeyFallback),
        fsKey: String(json.fsKey || json.projectKey || projectKeyFallback),
        note: String(json.note ?? ""),
        scale: String(json.scale ?? "2.5"),
        sourceFile: json.sourceFile ?? null,
        preview: json.preview ?? null,
        boxes: boxesArr,
        extras: extrasArr,
        summary: String(json.summary ?? ""),
        positions: positionsArr,
        items: itemsArr,
      };
      if (!payload.preview && !payload.items?.length && !payload.boxes?.length && !payload.positions?.length) {
        return null;
      }
      return payload;
    }
    return null;
  }

  const serverLoad = React.useCallback(async () => {
    if (!keyCandidates.length) {
      alert("Kein Projekt gewählt.");
      return;
    }
    setServerBusy(true);
    try {
      const urls = makeUrls("/{key}");
      const { res } = await fetchFirstOk(urls);
      const json = await res.json().catch(() => ({}));
      const payload = normalizeLoadedPayload(effectiveKey || keyCandidates[0], json);

      if (!payload) {
        alert("Kein gespeicherter Takeoff am Server gefunden.");
        return;
      }

      setNote(String(payload.note ?? ""));
      setQuality(String(payload.scale ?? "2.5"));
      setPreview(payload.preview ?? null);
      setSummary(String(payload.summary ?? ""));
      setBoxes(Array.isArray(payload.boxes) ? payload.boxes : []);
      setPositions(Array.isArray(payload.positions) ? payload.positions : []);
      setItems(Array.isArray(payload.items) ? payload.items : []);

      const nextRows = takeoffFromBackend({
        positions: payload.positions ?? [],
        items: payload.items ?? [],
        fallbackTargets: defaultTargets(),
      });
      setRows(nextRows);

      const lk = projectKey || effectiveKey || keyCandidates[0];
      if (lk) {
        setLastKey(lk);
        lsSave(lk, { ...payload, rows: nextRows, quality: payload.scale ?? "2.5" });
      }
    } catch (e: any) {
      console.error(e);
      alert(`Server laden fehlgeschlagen: ${e?.message || "Failed to fetch"}`);
    } finally {
      setServerBusy(false);
    }
  }, [keyCandidates, makeUrls, effectiveKey, projectKey, setBoxes, setItems, setNote, setPositions, setPreview, setQuality, setRows, setSummary]);

  const serverSave = React.useCallback(
    async (override?: Partial<{ preview: string | null; summary: string; boxes: DetectBox[]; positions: PhotoPosition[]; items: Det[] }>) => {
      if (!keyCandidates.length) {
        draftSave();
        alert("Kein Projekt gewählt. (Lokal gespeichert)");
        return;
      }
      setServerBusy(true);
      try {
        const payload = {
          note,
          scale: quality,
          preview: override && "preview" in override ? (override.preview ?? null) : preview ?? null,
          sourceFile: file
            ? { name: file.name, type: file.type || undefined, size: file.size || undefined }
            : null,
          items: override?.items ?? items ?? [],
          boxes: override?.boxes ?? boxes ?? [],
          extras: [],
          summary: override?.summary ?? summary ?? "",
          positions: override?.positions ?? positions ?? [],
        };

        const urls = makeUrls("/{key}/save");
        const { res } = await fetchFirstOk(urls, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        await res.json().catch(() => ({}));

        if (effectiveKey) {
          const localPayload = buildAutoKiPayload({
            projectKey: effectiveKey,
            note,
            scale: quality,
            file,
            preview: payload.preview ?? null,
            boxes: payload.boxes ?? [],
            extras: [],
            summary: payload.summary ?? "",
            positions: payload.positions ?? [],
            items: payload.items ?? [],
          });
          lsSave(effectiveKey, { ...localPayload, rows, quality });
        }
      } catch (e: any) {
        console.error(e);
        draftSave();
        alert(`Server speichern fehlgeschlagen: ${e?.message || "Failed to fetch"}\nFallback: lokal gespeichert.`);
      } finally {
        setServerBusy(false);
      }
    },
    [keyCandidates, makeUrls, note, quality, preview, file, items, boxes, summary, positions, effectiveKey, rows, draftSave]
  );

  const loadHistory = React.useCallback(async () => {
    if (!keyCandidates.length) return;
    try {
      const urls = makeUrls("/{key}/aufmass-history");
      const { res } = await fetchFirstOk(urls);
      const data = await res.json().catch(() => ({}));
      const hist = data?.data?.history;
      if (Array.isArray(hist)) {
        setHistory(
          hist.map((h: any) => ({
            ts: Number(h.ts),
            count: Number(h.count),
            note: h.note ? String(h.note) : undefined,
            source: h.source ? String(h.source) : undefined,
          }))
        );
      }
    } catch {}
  }, [keyCandidates, makeUrls, setHistory]);

  React.useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const snapshotHistory = React.useCallback(
    async (source: string) => {
      if (!keyCandidates.length) {
        alert("Kein Projekt gewählt.");
        return;
      }
      try {
        const urls = makeUrls("/{key}/aufmass-history/snapshot");
        const rowsForHistory = rows.map((r) => ({
          pos: r.pos,
          text: r.descr,
          unit: r.unit,
          ist: r.qty,
          source: source || "pdfviewer",
          type: r.type,
        }));

        const { res } = await fetchFirstOk(urls, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: rowsForHistory, note: note || "", source }),
        });

        const data = await res.json().catch(() => ({}));
        if (Array.isArray(data?.data?.history)) {
          setHistory(
            data.data.history.map((h: any) => ({
              ts: Number(h.ts),
              count: Number(h.count),
              note: h.note ? String(h.note) : undefined,
              source: h.source ? String(h.source) : undefined,
            }))
          );
        }
      } catch (e: any) {
        console.error(e);
        alert(`Snapshot fehlgeschlagen: ${e?.message || "Failed to fetch"}`);
      }
    },
    [keyCandidates, makeUrls, rows, note, setHistory]
  );

  /* ===================== Row editing helpers ===================== */
  function updateRow(id: string, patch: Partial<TakeoffRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function updateRowTargets(id: string, patch: Partial<Targets>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, targets: { ...r.targets, ...patch } } : r)));
  }

  function addRow() {
    setRows((prev) => {
      const next: TakeoffRow[] = [
        ...prev,
        {
          id: crypto.randomUUID(),
          pos: "",
          type: "COUNT",
          descr: "",
          unit: "m",
          qty: 0,
          source: "manuell",
          targets: defaultTargets(),
        },
      ];
      return normalizeAndReindexAutoPositions(next);
    });
  }

  function deleteRow(id: string) {
    setRows((prev) => normalizeAndReindexAutoPositions(prev.filter((r) => r.id !== id)));
  }

  function setAllTargets(patch: Partial<Targets>) {
    setRows((prev) => prev.map((r) => ({ ...r, targets: { ...r.targets, ...patch } })));
  }

  function anySelectedTarget(k: keyof Targets) {
    return rows.some((r) => !!r.targets?.[k]);
  }

  function resetTakeoffOnly() {
    if (!confirm("Takeoff-Daten wirklich zurücksetzen? (PDF bleibt geladen)")) return;
    setSummary("");
    setBoxes([]);
    setPositions([]);
    setItems([]);
    setRows([]);
    setPreview(null);
    draftSave({ preview: null, summary: "", boxes: [], positions: [], items: [], rows: [] });
  }

  /* ===================== Analyze (KI) ===================== */
  async function analyze() {
    if (!file) {
      alert("Bitte zuerst ein PDF wählen.");
      return;
    }
    if (!keyCandidates.length) {
      alert("Kein Projekt gewählt. (Server-KI braucht ein Projekt)");
      return;
    }

    setBusy(true);
    try {
      // 1) PDF -> PNG (Seite 1), tiling
      const q = parseQuality(quality);
      const desired = 3.2 + q * 0.9;

      const out = await pdfFirstPageToPng(file, desired, 18_000_000);
      const uploadName = `${safeBaseName(file.name)}.page1.png`;
      void uploadName; // behalten (Debug/Meta)

      setPreview(out.dataUrl);

      const tiles = await makeTilesFromDataUrl({
        dataUrl: out.dataUrl,
        tileMax: 1800,
        overlap: 80,
      });

      const urls = makeUrls("/{key}/analyze");

      // 2) Tile-Analyse auf dem Server (wie AutoKI)
      const allPositions: PhotoPosition[] = [];
      const allItems: Det[] = [];
      const allBoxes: DetectBox[] = [];
      const summaries: string[] = [];

      for (const t of tiles) {
        const fd = new FormData();
        fd.append("file", t.blob, t.name);
        fd.append("note", `${note}\n[PDFVIEWER TILE ${t.iy + 1}/${t.rows} x ${t.ix + 1}/${t.cols}]`);
        fd.append("scale", quality);

        const { res } = await fetchFirstOk(urls, { method: "POST", body: fd });
        const data = await res.json().catch(() => ({}));

        const summaryChunk: string = String(data?.summary ?? "");
        if (summaryChunk) summaries.push(summaryChunk);

        const pos: PhotoPosition[] = Array.isArray(data?.positions) ? data.positions : [];
        const itemsChunk: Det[] = Array.isArray(data?.items) ? data.items : [];
        const boxesChunk: DetectBox[] = Array.isArray(data?.boxes) ? data.boxes : [];

        allPositions.push(...pos);
        allItems.push(...itemsChunk);
        allBoxes.push(...boxesChunk);
      }

      // 3) Dedupe
      const seenPos = new Set<string>();
      const positionsDedup = allPositions.filter((p) => {
        const k = `${(p.id || "").trim()}|${(p.kurztext || "").trim()}|${(p.einheit || "").trim()}|${Number(p.qty ?? 0)}`;
        if (seenPos.has(k)) return false;
        seenPos.add(k);
        return true;
      });

      const seenItem = new Set<string>();
      const itemsDedup = allItems.filter((d) => {
        const k = `${(d.pos || "").trim()}|${(d.descr || "").trim()}|${(d.unit || "").trim()}|${Number(d.qty ?? 0)}`;
        if (seenItem.has(k)) return false;
        seenItem.add(k);
        return true;
      });

      const newSummary = `Erkannte Positionen: ${positionsDedup.length} (dedupliziert)${
        summaries.length ? ` • ${summaries[0]}` : ""
      }`;

      setSummary(newSummary);
      setPositions(positionsDedup);
      setItems(itemsDedup);
      setBoxes(allBoxes);

      // 4) Rows für UI
      const nextRows = takeoffFromBackend({
        positions: positionsDedup,
        items: itemsDedup,
        fallbackTargets: defaultTargets(),
      });
      setRows(nextRows);

      // 5) Save local + server (auto-ki store)
      draftSave({
        preview: out.dataUrl,
        summary: newSummary,
        positions: positionsDedup,
        items: itemsDedup,
        boxes: allBoxes,
        rows: nextRows,
      });

      await serverSave({
        preview: out.dataUrl,
        summary: newSummary,
        boxes: allBoxes,
        positions: positionsDedup,
        items: itemsDedup.length ? itemsDedup : [],
      });

      // optional: snapshot history
      try {
        await snapshotHistory(file.name || "pdfviewer");
      } catch {}
    } catch (e: any) {
      console.error(e);
      alert(`Analyse fehlgeschlagen: ${e?.message || "Failed to fetch"}`);
    } finally {
      setBusy(false);
    }
  }

  /* ===================== Export: Aufmaß ===================== */
  const exportToAufmass = React.useCallback(async () => {
    if (!projectKey) {
      alert("Kein Projekt gewählt.");
      return;
    }

    const selected = rows.filter((r) => r.targets?.aufmass);
    const useRows = selected.length ? selected : rows;

    const filtered = useRows
      .map((r) => ({
        pos: String(r.pos || "").trim(),
        text: String(r.descr || "").trim(),
        unit: String(r.unit || "").trim(),
        qty: Number(r.qty || 0),
      }))
      .filter((r) => r.pos && r.text);

    if (!filtered.length) {
      alert("Keine Positionen zum Export.");
      return;
    }

    setServerBusy(true);
    try {
      const targets = Array.from(new Set([projectUuid, projectKey].filter(Boolean))) as string[];
      if (targets.length) setAufmassLastKey(targets[0]);

      for (const k of targets) {
        const existing = loadAufmassLocal(k);

        const imported: AufmassLVRowLocal[] = filtered.map((r) => ({
          id: crypto.randomUUID(),
          pos: r.pos,
          text: r.text,
          unit: r.unit || "m",
          ep: 0,
          soll: 0,
          formula: "",
          ist: Number(r.qty || 0),
          note: "Import aus PDFViewer",
          factor: 1,
        }));

        saveAufmassLocal(k, [...imported, ...existing]);
      }

      const urls = makeUrls("/{key}/export-to-aufmass");
      await fetchFirstOk(urls, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: filtered }),
      });

      nav("/mengenermittlung/aufmasseditor");
    } catch (e: any) {
      console.error(e);
      alert(`Export fehlgeschlagen: ${e?.message || "Failed to fetch"}`);
    } finally {
      setServerBusy(false);
    }
  }, [projectKey, projectUuid, rows, makeUrls, nav]);

  /* ===================== Export: Kalkulation / Nachtrag (lokal) ===================== */
  function exportToKalkulationLocal() {
    if (!projectKey) {
      alert("Kein Projekt gewählt.");
      return;
    }
    const selected = rows.filter((r) => r.targets?.kalkulation);
    const useRows = selected.length ? selected : rows;
    const payload = {
      ts: Date.now(),
      source: "pdfviewer",
      projectKey,
      rows: useRows.map((r) => ({
        pos: r.pos,
        typ: r.type,
        beschreibung: r.descr,
        einheit: r.unit,
        menge: r.qty,
      })),
    };
    try {
      localStorage.setItem(KALK_IMPORT_KEY(projectKey), JSON.stringify(payload));
    } catch {}

    alert("Export für Kalkulation wurde lokal vorbereitet. (Import-Key gesetzt)");
  }

  function exportToNachtragLocal() {
    if (!projectKey) {
      alert("Kein Projekt gewählt.");
      return;
    }
    const selected = rows.filter((r) => r.targets?.nachtrag);
    const useRows = selected.length ? selected : rows;
    const payload = {
      ts: Date.now(),
      source: "pdfviewer",
      projectKey,
      rows: useRows.map((r) => ({
        pos: r.pos,
        typ: r.type,
        beschreibung: r.descr,
        einheit: r.unit,
        menge: r.qty,
      })),
    };
    try {
      localStorage.setItem(NACHTRAG_IMPORT_KEY(projectKey), JSON.stringify(payload));
    } catch {}

    alert("Export für Nachträge wurde lokal vorbereitet. (Import-Key gesetzt)");
  }

  /* ===================== Overlay drawing (preview + boxes) ===================== */
  React.useEffect(() => {
    if (!preview) return;
    if (!String(preview).startsWith("data:image/")) return;

    const img = new Image();
    img.src = preview;

    img.onload = () => {
      const cvs = document.getElementById("pdf-takeoff-canvas") as HTMLCanvasElement | null;
      if (!cvs) return;

      const parent = cvs.parentElement as HTMLElement | null;
      const maxW = parent?.clientWidth ? Math.max(300, parent.clientWidth - 2) : 1400;

      const W = Math.min(Math.max(600, maxW), img.width);
      const ratio = W / img.width;
      const H = img.height * ratio;

      cvs.width = Math.ceil(W);
      cvs.height = Math.ceil(H);

      const g = cvs.getContext("2d");
      if (!g) return;

      g.clearRect(0, 0, W, H);
      g.drawImage(img, 0, 0, W, H);

      const bxs = boxes ?? [];
      if (bxs.length) {
        g.lineWidth = 3;
        g.font = "14px system-ui";
        g.textBaseline = "top";

        bxs.forEach((b) => {
          if (!b.box) return;
          const [nx, ny, nw, nh] = b.box;

          const x = nx * img.width * ratio;
          const y = ny * img.height * ratio;
          const w = nw * img.width * ratio;
          const h = nh * img.height * ratio;

          g.strokeStyle = "#0b1324";
          g.fillStyle = "rgba(11,19,36,0.08)";
          g.fillRect(x, y, w, h);
          g.strokeRect(x, y, w, h);

          const tag = `${b.label}${b.qty != null ? ` (${b.qty} ${b.unit ?? ""})` : ""} ${prettyScore(b.score)}`;
          const tw = g.measureText(tag).width + 10;
          const ty = Math.max(0, y - 18);

          g.fillStyle = "rgba(255,255,255,0.9)";
          g.fillRect(x, ty, tw, 18);
          g.fillStyle = "#0b1324";
          g.fillText(tag, x + 5, ty + 2);
        });
      }
    };
  }, [preview, boxes]);

  /* ===================== UI helpers ===================== */
  const sumQty = rows.reduce((a, r) => a + (Number(r.qty) || 0), 0);

  const descrModalRow = descrModalRowId ? rows.find((r) => r.id === descrModalRowId) : null;

  const openDescrEditor = (rowId: string) => {
    setDescrModalRowId(rowId);
    setDescrModalOpen(true);
  };

  const closeDescrEditor = () => {
    setDescrModalOpen(false);
    setDescrModalRowId(null);
  };

  const onPickPdf: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const f = e.target.files?.[0] || null;
    if (!f) return;

    // WICHTIG: PDF laden, Takeoff NICHT löschen (sonst "beim Seitenwechsel alles weg")
    await openFromFile(f);

    if (effectiveKey) {
      setLastKey(effectiveKey);
      draftSave();
    }

    e.currentTarget.value = "";
  };

  const goto = async (n: number) => {
    if (!pdf) return;
    const nn = Math.max(1, Math.min(pdf.numPages, n));
    setPageNum(nn);
    await renderPage(pdf, nn, scaleView);
  };

  return (
    <div className="card" style={{ padding: 12 }}>
      {/* Description modal */}
      <DescrModal
        open={descrModalOpen}
        title={`Beschreibung bearbeiten ${descrModalRow ? `(${descrModalRow.pos})` : ""}`}
        value={descrModalRow?.descr ?? ""}
        onClose={closeDescrEditor}
        onSave={(v) => {
          if (!descrModalRowId) return;
          updateRow(descrModalRowId, { descr: v });
          draftSave();
        }}
      />

      {/* Zoom Modal */}
      {zoomOpen && preview && String(preview).startsWith("data:image/") ? (
        <div
          onClick={() => setZoomOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 18,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(1400px, 96vw)",
              height: "min(90vh, 980px)",
              background: "white",
              borderRadius: 12,
              overflow: "hidden",
              border: "1px solid rgba(0,0,0,0.12)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                padding: 10,
                borderBottom: "1px solid var(--line)",
                display: "flex",
                gap: 10,
                alignItems: "center",
              }}
            >
              <div style={{ fontWeight: 700, flex: 1 }}>PDF Takeoff – PNG Zoom</div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>Zoom</div>
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoomScale}
                onChange={(e) => setZoomScale(Number(e.target.value))}
              />
              <button className="btn" type="button" onClick={() => setZoomOpen(false)}>
                Schließen
              </button>
            </div>

            <div style={{ flex: 1, overflow: "auto", background: "#f4f6f8" }}>
              <div style={{ padding: 18 }}>
                <img
                  src={preview}
                  alt="Zoom"
                  style={{
                    transform: `scale(${zoomScale})`,
                    transformOrigin: "top left",
                    display: "block",
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <h2 style={{ margin: 0, flex: 1 }}>PDF Viewer – Takeoff / KI Mengenermittlung</h2>

        <button
          className="btn"
          onClick={() => void serverLoad()}
          disabled={!projectKey || serverBusy}
          title={!projectKey ? "Kein Projekt (Server braucht Projekt)" : "Server laden (auto-ki.json)"}
        >
          {serverBusy ? "…" : "Vom Server laden"}
        </button>

        <button
          className="btn"
          onClick={() => void serverSave()}
          disabled={!projectKey || serverBusy}
          title={!projectKey ? "Kein Projekt (Server braucht Projekt)" : "Server speichern (auto-ki.json)"}
        >
          {serverBusy ? "…" : "Speichern"}
        </button>

        <button className="btn" onClick={() => setEditOn((s) => !s)} type="button">
          Bearbeiten: {editOn ? "An" : "Aus"}
        </button>

        <button className="btn" onClick={addRow} type="button" disabled={!editOn}>
          + Zeile
        </button>

        <button className="btn" onClick={resetTakeoffOnly} type="button" disabled={!editOn}>
          Takeoff zurücksetzen
        </button>
      </div>

      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
        API: <code>{API}</code> • Keys: <code>{keyCandidates.join(" | ") || "—"}</code> • LocalKey:{" "}
        <code>{effectiveKey || "—"}</code>
      </div>

      {/* Top controls */}
      <div className="card" style={{ marginTop: 10, padding: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 10, alignItems: "center" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              style={{ display: "none" }}
              onChange={onPickPdf}
            />
            <button className="btn" type="button" onClick={() => fileInputRef.current?.click()}>
              PDF wählen
            </button>
            <div style={{ opacity: 0.85 }}>
              {file ? (
                <>
                  <div>
                    <b>Ausgewählt:</b> {file.name}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    KI rendert Seite 1 als PNG + Tiles (mehr Positionen).
                  </div>
                </>
              ) : (
                "Kein PDF gewählt."
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 12, opacity: 0.75 }}>Qualität</span>
            <input
              value={quality}
              onChange={(e) => setQuality(e.target.value)}
              style={{ ...inpBase, width: 120 }}
              placeholder="2.5"
              disabled={!editOn}
            />
          </div>

          <button className="btn" type="button" onClick={() => void analyze()} disabled={!file || busy || !projectKey}>
            {busy ? "Analysiere…" : "KI analysieren"}
          </button>

          <button
            className="btn"
            type="button"
            disabled={!projectKey || serverBusy}
            onClick={() => void snapshotHistory(file?.name || "pdfviewer")}
            title="Schreibt aufmass-history.json (Snapshot)"
          >
            Snapshot
          </button>
        </div>

        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "140px 1fr", gap: 10 }}>
          <label style={{ fontSize: 13, opacity: 0.8 }}>Sprachnotiz / Text</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            style={{ ...inpBase, width: "100%" }}
            disabled={!editOn}
          />
        </div>

        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>{status}</div>
      </div>

      {/* Viewer area (BIGGER PDF) */}
      <div className="card" style={{ marginTop: 10, padding: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.65fr 1fr", gap: 10 }}>
          {/* Left: PDF canvas preview */}
          <div
            style={{
              border: "1px solid var(--line)",
              borderRadius: 8,
              padding: 8,
              overflow: "auto",
              height: "78vh",
              minHeight: 520,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{ fontWeight: 700, flex: 1 }}>PDF Seite</div>
              <button className="btn" onClick={() => setScaleView((s) => Math.min(6, s * 1.15))} type="button">
                Zoom +
              </button>
              <button className="btn" onClick={() => setScaleView((s) => Math.max(0.25, s / 1.15))} type="button">
                Zoom −
              </button>
              <button className="btn" onClick={() => void goto(pageNum - 1)} disabled={!pdf || pageNum <= 1} type="button">
                ‹
              </button>
              <div className="btn" style={{ cursor: "default" }}>
                {pageNum}
                {pdf ? ` / ${pages}` : ""}
              </div>
              <button
                className="btn"
                onClick={() => void goto(pageNum + 1)}
                disabled={!pdf || (pdf ? pageNum >= pages : true)}
                type="button"
              >
                ›
              </button>
            </div>

            <canvas
              ref={canvasRef}
              style={{
                width: "100%",
                height: "auto",
                display: "block",
              }}
            />
          </div>

          {/* Right: KI PNG preview */}
          <div
            style={{
              border: "1px solid var(--line)",
              borderRadius: 8,
              padding: 8,
              height: "78vh",
              minHeight: 520,
              overflow: "auto",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{ fontWeight: 700, flex: 1 }}>KI Vorschau (PNG)</div>
              {preview && String(preview).startsWith("data:image/") ? (
                <button className="btn" type="button" onClick={() => setZoomOpen(true)}>
                  Zoom
                </button>
              ) : null}
            </div>

            {preview ? (
              <div style={{ width: "100%" }}>
                <canvas id="pdf-takeoff-canvas" style={{ width: "100%" }} />
              </div>
            ) : (
              <div style={{ opacity: 0.6 }}>Noch keine KI Vorschau.</div>
            )}
          </div>
        </div>

        {/* Summary */}
        {summary ? (
          <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85 }}>
            <b>KI:</b> {summary}
          </div>
        ) : null}
      </div>

      {/* Rows table */}
      <div className="card" style={{ marginTop: 12, padding: 0, overflow: "auto" }}>
        <div style={{ padding: 12, borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontWeight: 700, flex: 1 }}>Takeoff Positionen</div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Summe Menge: <b>{Number(sumQty || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}</b>
          </div>

          <button className="btn" onClick={() => void exportToAufmass()} disabled={!projectKey || serverBusy}>
            Export → Aufmaß
          </button>
          <button className="btn" onClick={exportToKalkulationLocal} disabled={!projectKey || serverBusy}>
            Export → Kalkulation (lokal)
          </button>
          <button className="btn" onClick={exportToNachtragLocal} disabled={!projectKey || serverBusy}>
            Export → Nachtrag (lokal)
          </button>
        </div>

        {rows.length === 0 ? (
          <div style={{ padding: 12, fontSize: 13, opacity: 0.7 }}>
            Noch keine Positionen. PDF wählen und KI starten, oder +Zeile.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Pos.</th>
                <th style={th}>Typ</th>
                <th style={th}>Beschreibung</th>
                <th style={th}>Einheit</th>
                <th style={th}>Menge</th>
                <th style={th}>Ziel</th>
                <th style={th}>Quelle</th>
                <th style={th}></th>
              </tr>
              <tr>
                <th style={{ ...th, fontWeight: 600, opacity: 0.85 }} colSpan={5}>
                  Ziel-Quickselect:
                </th>
                <th style={th} colSpan={3}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <label style={miniLabel}>
                      <input
                        type="checkbox"
                        checked={anySelectedTarget("aufmass")}
                        onChange={(e) => setAllTargets({ aufmass: e.target.checked })}
                        disabled={!editOn}
                      />{" "}
                      Aufmaß
                    </label>
                    <label style={miniLabel}>
                      <input
                        type="checkbox"
                        checked={anySelectedTarget("kalkulation")}
                        onChange={(e) => setAllTargets({ kalkulation: e.target.checked })}
                        disabled={!editOn}
                      />{" "}
                      Kalk.
                    </label>
                    <label style={miniLabel}>
                      <input
                        type="checkbox"
                        checked={anySelectedTarget("nachtrag")}
                        onChange={(e) => setAllTargets({ nachtrag: e.target.checked })}
                        disabled={!editOn}
                      />{" "}
                      Nachtrag
                    </label>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const descrShort =
                  String(r.descr || "").trim().length > 60
                    ? String(r.descr || "").trim().slice(0, 60) + "…"
                    : String(r.descr || "").trim();

                return (
                  <tr key={r.id}>
                    <td style={td}>
                      <input
                        value={r.pos}
                        onChange={(e) => updateRow(r.id, { pos: e.target.value })}
                        style={{ ...inpBase, width: 120 }}
                        disabled={!editOn}
                      />
                    </td>

                    <td style={td}>
                      <select
                        value={r.type}
                        onChange={(e) => updateRow(r.id, { type: e.target.value as any })}
                        style={{ ...inpBase, width: 120 }}
                        disabled={!editOn}
                      >
                        <option value="COUNT">COUNT</option>
                        <option value="LINE">LINE</option>
                        <option value="AREA">AREA</option>
                      </select>
                    </td>

                    <td style={td}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input
                          value={r.descr}
                          onChange={(e) => updateRow(r.id, { descr: e.target.value })}
                          style={{ ...inpBase, width: "100%", minWidth: 260 }}
                          placeholder="Beschreibung…"
                          disabled={!editOn}
                        />
                        <button className="btn" type="button" onClick={() => openDescrEditor(r.id)}>
                          Editor
                        </button>
                      </div>
                      <div style={{ marginTop: 4, fontSize: 12, opacity: 0.7 }}>{descrShort}</div>
                    </td>

                    <td style={td}>
                      <input
                        value={r.unit}
                        onChange={(e) => updateRow(r.id, { unit: e.target.value })}
                        style={{ ...inpBase, width: 90 }}
                        disabled={!editOn}
                      />
                    </td>

                    <td style={td}>
                      <input
                        value={String(r.qty ?? 0)}
                        onChange={(e) => {
                          const s = e.target.value.replace(",", ".");
                          const n = Number(s);
                          updateRow(r.id, { qty: Number.isFinite(n) ? n : 0 });
                        }}
                        style={{ ...inpBase, width: 110, textAlign: "right" }}
                        disabled={!editOn}
                      />
                    </td>

                    <td style={td}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <label style={miniLabel}>
                          <input
                            type="checkbox"
                            checked={!!r.targets?.aufmass}
                            onChange={(e) => updateRowTargets(r.id, { aufmass: e.target.checked })}
                            disabled={!editOn}
                          />{" "}
                          Aufmaß
                        </label>
                        <label style={miniLabel}>
                          <input
                            type="checkbox"
                            checked={!!r.targets?.kalkulation}
                            onChange={(e) => updateRowTargets(r.id, { kalkulation: e.target.checked })}
                            disabled={!editOn}
                          />{" "}
                          Kalk.
                        </label>
                        <label style={miniLabel}>
                          <input
                            type="checkbox"
                            checked={!!r.targets?.nachtrag}
                            onChange={(e) => updateRowTargets(r.id, { nachtrag: e.target.checked })}
                            disabled={!editOn}
                          />{" "}
                          Nachtrag
                        </label>
                      </div>
                    </td>

                    <td style={td}>{r.source ?? "–"}</td>

                    <td style={{ ...td, width: 70 }}>
                      <button className="btn" onClick={() => deleteRow(r.id)} disabled={!editOn}>
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Boxes preview table (optional) */}
      <div className="card" style={{ marginTop: 12, padding: 0, overflow: "auto" }}>
        <div style={{ padding: 12, borderBottom: "1px solid var(--line)" }}>
          <div style={{ fontWeight: 700 }}>KI Bauteile (Boxes)</div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Hinweis: Bei Tile-Analyse sind Box-Koordinaten oft leer; dann ist diese Tabelle nur informativ.
          </div>
        </div>

        {!boxes || boxes.length === 0 ? (
          <div style={{ padding: 12, fontSize: 13, opacity: 0.7 }}>Noch keine Boxes.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Bauteil</th>
                <th style={th}>Sicherheit</th>
                <th style={th}>Menge</th>
                <th style={th}>Einheit</th>
              </tr>
            </thead>
            <tbody>
              {boxes.map((b) => (
                <tr key={b.id}>
                  <td style={td}>{b.label}</td>
                  <td style={td}>{prettyScore(b.score)}</td>
                  <td style={td}>{b.qty ?? "-"}</td>
                  <td style={td}>{b.unit ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* History */}
      <div className="card" style={{ marginTop: 12, padding: 10 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Verlauf (Snapshots)</div>
        {!projectKey ? (
          <div style={{ fontSize: 13, opacity: 0.75 }}>Kein Projekt gewählt (Server-Funktionen deaktiviert).</div>
        ) : history.length === 0 ? (
          <div style={{ fontSize: 13, opacity: 0.75 }}>Noch keine Stände.</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {history.map((h) => (
              <div
                key={h.ts}
                className="btn"
                style={{ fontSize: 11, padding: "4px 8px", cursor: "default" }}
                title={`${h.source ?? ""} ${h.note ?? ""}`.trim()}
              >
                {new Date(h.ts).toLocaleString()} · {h.count} Pos.
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ===================== STYLES ===================== */
const inpBase: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid var(--line)",
  borderRadius: 8,
  outline: "none",
  background: "white",
  fontSize: 13,
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  fontSize: 12,
  fontWeight: 700,
  borderBottom: "1px solid var(--line)",
  background: "rgba(0,0,0,0.02)",
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 13,
  borderBottom: "1px solid var(--line)",
  verticalAlign: "top",
};

const miniLabel: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 12,
  opacity: 0.9,
};
