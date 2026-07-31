import { API_BASE } from "../../lib/apiBase";
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useProject } from "../../store/useProject";

/* =========================================================
   RLC CAD
   - RLC vector CAD based on the internal geometry format
   - Layer control, selection, zoom, pan, fit, grid and labels
   - Distance / area / point measurement tools
   - UTM point visualization
   - LV mapping and transfer to Aufmaß
   - GeoJSON / CSV export
   ========================================================= */

/* ================== API ================== */
function apiUrl(path: string) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${p}` : p;
}


function getAuthToken() {
  return (
    localStorage.getItem("rlc_token") ||
    localStorage.getItem("token") ||
    sessionStorage.getItem("rlc_token") ||
    sessionStorage.getItem("token") ||
    ""
  );
}

function authHeaders(extra?: Record<string, string>) {
  const token = getAuthToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extra || {}),
  };
}
/* ================== Types ================== */
type V2 = { x: number; y: number };

type ViewerTool = "select" | "pan" | "distance" | "area" | "point";

type TakeoffFeature = {
  id?: string;
  kind?: "polyline" | "polygon" | "line" | "point";
  layer?: string;
  name?: string;
  pts?: V2[];
  closed?: boolean;
  length?: number;
  area?: number;
  meta?: any;
};

type TakeoffPayload = {
  ok?: boolean;
  message?: string;
  data?: any;
  features?: TakeoffFeature[];
  points?: { id?: string; x: number; y: number; label?: string }[];
};

type PathsResponse = {
  ok: boolean;
  paths?: {
    projectRoot: string;
    bricscadDir: string;
    utmCsvPath: string;
    takeoffJsonPath: string;
    snapshotPngPath?: string;
  };
  message?: string;
};

type UTMPoint = {
  id: string;
  x: number;
  y: number;
  label?: string;
};

type LvPosition = {
  id: string;
  pos: string;
  text: string;
  unit: string;
  quantity: number;
  ep: number;
};

type KiRow = {
  key: string;
  lvPos: string;
  layerGroup: string;
  unit: "m" | "m2" | "Stk";
  qty: number;
  confidenceA: number;
  exampleLayer?: string;
  exampleName?: string;
};

type LvSuggestion = {
  pos: string;
  text: string;
  unit: string;
  score: number;
};

type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type LayerState = {
  name: string;
  visible: boolean;
  count: number;
  color: string;
};

/* ================== UI ================== */
const ui = {
  bg: "#eef1f5",
  panel: "#ffffff",
  panel2: "#f8fafc",
  border: "#d9dee7",
  text: "#172033",
  sub: "#667085",
  shadow: "0 10px 30px rgba(16,24,40,0.08)",
  accent: "#0b4f8a",
  accent2: "#0e6fb8",
  accentSoft: "#e8f2fb",
  danger: "#b42318",
  success: "#067647",
  warning: "#b54708",
  cadBg: "#10151d",
  cadGrid: "#273242",
};

function Btn({
  children,
  onClick,
  title,
  disabled,
  style,
  primary,
  active,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
  primary?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        height: 36,
        padding: "0 12px",
        borderRadius: 9,
        border: `1px solid ${
          active ? ui.accent2 : primary ? ui.accent : ui.border
        }`,
        background: disabled
          ? "#f2f4f7"
          : active
          ? ui.accentSoft
          : primary
          ? ui.accent
          : ui.panel,
        color: disabled
          ? "#98a2b3"
          : primary
          ? "#fff"
          : active
          ? ui.accent
          : ui.text,
        fontSize: 13,
        fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  disabled,
  active,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <Btn
      onClick={onClick}
      title={title}
      disabled={disabled}
      active={active}
      style={{ width: 38, padding: 0 }}
    >
      {children}
    </Btn>
  );
}

function Card({
  title,
  subtitle,
  children,
  style,
  action,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
  action?: React.ReactNode;
}) {
  return (
    <section
      style={{
        border: `1px solid ${ui.border}`,
        borderRadius: 14,
        background: ui.panel,
        boxShadow: ui.shadow,
        overflow: "hidden",
        ...style,
      }}
    >
      <header
        style={{
          minHeight: 50,
          padding: "0 14px",
          borderBottom: `1px solid ${ui.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          background: ui.panel,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 950, color: ui.text }}>
            {title}
          </div>
          {subtitle ? (
            <div
              style={{
                marginTop: 2,
                fontSize: 11,
                color: ui.sub,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {subtitle}
            </div>
          ) : null}
        </div>
        {action}
      </header>
      <div>{children}</div>
    </section>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        width: "100%",
        height: 36,
        borderRadius: 9,
        border: `1px solid ${ui.border}`,
        padding: "0 10px",
        fontSize: 13,
        color: ui.text,
        outline: "none",
        background: ui.panel,
        boxSizing: "border-box",
        ...(props.style || {}),
      }}
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      style={{
        width: "100%",
        height: 36,
        borderRadius: 9,
        border: `1px solid ${ui.border}`,
        padding: "0 10px",
        fontSize: 13,
        color: ui.text,
        outline: "none",
        background: ui.panel,
        boxSizing: "border-box",
        ...(props.style || {}),
      }}
    />
  );
}

function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "blue";
}) {
  const colors = {
    neutral: { bg: "#f2f4f7", fg: "#475467" },
    success: { bg: "#ecfdf3", fg: ui.success },
    warning: { bg: "#fffaeb", fg: ui.warning },
    danger: { bg: "#fef3f2", fg: ui.danger },
    blue: { bg: ui.accentSoft, fg: ui.accent },
  }[tone];

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 24,
        borderRadius: 999,
        padding: "0 9px",
        background: colors.bg,
        color: colors.fg,
        fontSize: 11,
        fontWeight: 850,
      }}
    >
      {children}
    </span>
  );
}

/* ================== Utils ================== */
function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function dist(a: V2, b: V2) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function polylineLength(pts: V2[], closed = false) {
  let s = 0;
  for (let i = 0; i < pts.length - 1; i++) s += dist(pts[i], pts[i + 1]);
  if (closed && pts.length > 2) s += dist(pts[pts.length - 1], pts[0]);
  return s;
}

function polyArea(pts: V2[]) {
  if (pts.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    s += p.x * q.y - q.x * p.y;
  }
  return Math.abs(s) / 2;
}

function centroid(pts: V2[]) {
  if (!pts.length) return { x: 0, y: 0 };
  const sum = pts.reduce(
    (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
    { x: 0, y: 0 }
  );
  return { x: sum.x / pts.length, y: sum.y / pts.length };
}

function expandBounds(bounds: Bounds, paddingRatio = 0.05): Bounds {
  const w = Math.max(1, bounds.maxX - bounds.minX);
  const h = Math.max(1, bounds.maxY - bounds.minY);
  const px = w * paddingRatio;
  const py = h * paddingRatio;
  return {
    minX: bounds.minX - px,
    minY: bounds.minY - py,
    maxX: bounds.maxX + px,
    maxY: bounds.maxY + py,
  };
}

function boundsFromPoints(points: V2[]): Bounds | null {
  if (!points.length) return null;
  let minX = points[0].x;
  let minY = points[0].y;
  let maxX = points[0].x;
  let maxY = points[0].y;

  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }

  return { minX, minY, maxX, maxY };
}

function boundsToViewBox(b: Bounds) {
  return {
    x: b.minX,
    y: b.minY,
    width: Math.max(1, b.maxX - b.minX),
    height: Math.max(1, b.maxY - b.minY),
  };
}

function formatNumber(n: number, digits = 3) {
  return Number.isFinite(n)
    ? n.toLocaleString("de-DE", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
    : "0,000";
}

function getCurrentProject(ctx: any) {
  return (
    ctx?.currentProject ??
    ctx?.selectedProject ??
    ctx?.current ??
    ctx?.project ??
    (typeof ctx?.getCurrentProject === "function"
      ? ctx.getCurrentProject()
      : null)
  );
}

function hashColor(value: string) {
  const palette = [
    "#4cc9f0",
    "#f72585",
    "#b8f2e6",
    "#ffd166",
    "#90be6d",
    "#c77dff",
    "#ff9f1c",
    "#7bdff2",
    "#f28482",
    "#bde0fe",
    "#e9c46a",
    "#8ecae6",
  ];
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return palette[Math.abs(hash) % palette.length];
}

function downloadText(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

/* ================== CSV / UTM ================== */
function parseUtmCsvFlexible(text: string): UTMPoint[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  if (!lines.length) return [];

  const first = lines[0];
  const delimiter = first.includes(";")
    ? ";"
    : first.includes("\t")
    ? "\t"
    : ",";

  const maybeHeader = first.toLowerCase();
  const hasHeader =
    maybeHeader.includes("east") ||
    maybeHeader.includes("rechts") ||
    maybeHeader.includes("north") ||
    maybeHeader.includes("hoch") ||
    maybeHeader.includes("x") ||
    maybeHeader.includes("y");

  const pts: UTMPoint[] = [];

  if (hasHeader) {
    const header = first
      .split(delimiter)
      .map((x) => x.trim().toLowerCase());

    const eIdx = header.findIndex((h) =>
      ["e", "east", "easting", "rechtswert", "x"].includes(h)
    );
    const nIdx = header.findIndex((h) =>
      ["n", "north", "northing", "hochwert", "y"].includes(h)
    );
    const idIdx = header.findIndex((h) =>
      ["id", "name", "punkt", "label"].includes(h)
    );

    for (let i = 1; i < lines.length; i++) {
      const c = lines[i].split(delimiter).map((x) => x.trim());
      const E = Number(String(c[eIdx] ?? "").replace(",", "."));
      const N = Number(String(c[nIdx] ?? "").replace(",", "."));
      if (!Number.isFinite(E) || !Number.isFinite(N)) continue;

      const id =
        idIdx >= 0 ? String(c[idIdx] ?? "").trim() : `P_${pts.length + 1}`;

      pts.push({
        id: id || `P_${pts.length + 1}`,
        x: E,
        y: N,
        label: id || undefined,
      });
    }

    return pts;
  }

  for (const line of lines) {
    const c = line.split(delimiter).map((x) => x.trim());
    if (c.length < 2) continue;

    const n0 = Number(String(c[0]).replace(",", "."));
    const n1 = Number(String(c[1]).replace(",", "."));
    const n2 =
      c.length >= 3 ? Number(String(c[2]).replace(",", ".")) : NaN;

    let id = "";
    let E: number | null = null;
    let N: number | null = null;

    if (!Number.isFinite(n0) && Number.isFinite(n1) && Number.isFinite(n2)) {
      id = c[0];
      E = n1;
      N = n2;
    } else if (Number.isFinite(n0) && Number.isFinite(n1)) {
      E = n0;
      N = n1;
      id = c.length >= 3 ? c.slice(2).join(" ").trim() : "";
    } else {
      continue;
    }

    if (E === null || N === null) continue;

    pts.push({
      id: id || `P_${pts.length + 1}`,
      x: E,
      y: N,
      label: id || undefined,
    });
  }

  return pts;
}

/* ================== Fetch / LV helpers ================== */
async function fetchJson(url: string) {
  const res = await fetch(url, { credentials: "include", headers: authHeaders() });
  const txt = await res.text().catch(() => "");
  if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);
  try {
    return txt ? JSON.parse(txt) : {};
  } catch {
    return {};
  }
}

function mapAnyToLvPositions(list: any[]): LvPosition[] {
  const arr = Array.isArray(list) ? list : [];
  return arr.map((x: any, idx: number) => ({
    id: String(x.id ?? x.lvPosId ?? x.posId ?? idx),
    pos: String(
      x.pos ??
        x.position ??
        x.posNr ??
        x.nr ??
        x.positionsnummer ??
        x.positionsNummer ??
        ""
    ),
    text: String(
      x.text ?? x.kurztext ?? x.title ?? x.langtext ?? "ohne Text"
    ),
    unit: String(x.unit ?? x.einheit ?? x.me ?? "m"),
    quantity: Number(x.soll ?? x.menge ?? x.quantity ?? x.qty ?? 0),
    ep: Number(x.ep ?? x.einheitspreis ?? x.price ?? x.unitPrice ?? 0),
  }));
}

function extractLvListFromNewEndpoint(data: any): any[] {
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const latest = rows[0];
  return Array.isArray(latest?.positions) ? latest.positions : [];
}

function extractLvListFromOldEndpoint(data: any): any[] {
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.lv)) return data.lv;
  if (Array.isArray(data)) return data;
  return [];
}

/* ================== KI helpers ================== */
function normText(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/[_\-./\\]+/g, " ")
    .replace(/[^a-z0-9äöüß\s]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string) {
  return normText(s)
    .split(" ")
    .filter((x) => x.length >= 3);
}

function scoreMatch(query: string, text: string) {
  const q = tokens(query);
  const t = tokens(text);
  if (!q.length || !t.length) return 0;

  const tset = new Set(t);
  let hit = 0;
  for (const w of q) if (tset.has(w)) hit++;

  const nt = normText(text);
  let substr = 0;
  for (const w of q) if (nt.includes(w)) substr++;

  return clamp(hit / q.length + Math.min(0.25, substr * 0.05), 0, 1);
}

function pickLayerGroup(layer?: string) {
  const s = String(layer || "").trim();
  if (!s) return "—";
  const t = normText(s).split(" ").filter(Boolean);
  return t.slice(0, Math.min(2, t.length)).join(" ") || s;
}

function uiUnitLabel(u: string) {
  return u === "m2" ? "m²" : u;
}

/* ================== Component ================== */
export default function CADViewer() {
  const projectCtx: any = useProject();
  const current = getCurrentProject(projectCtx);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const cadFileInputRef = useRef<HTMLInputElement | null>(null);

  const autoProjectId = String(current?.code || "").trim();

  const [projectId, setProjectId] = useState<string>(() => {
    const urlPid =
      new URLSearchParams(window.location.search).get("projectId") || "";
    const lsPid =
      localStorage.getItem("rlc_projectId") ||
      localStorage.getItem("rlc_active_project") ||
      localStorage.getItem("projectId") ||
      "";
    return (autoProjectId || urlPid || lsPid || "").trim();
  });

  const [status, setStatus] = useState("Bereit");
  const [paths, setPaths] = useState<PathsResponse["paths"] | null>(null);
  const [utmCsv, setUtmCsv] = useState("");
  const [utmPoints, setUtmPoints] = useState<UTMPoint[]>([]);
  const [takeoff, setTakeoff] = useState<TakeoffPayload | null>(null);
  const [features, setFeatures] = useState<TakeoffFeature[]>([]);
  const [selectedFeatureId, setSelectedFeatureId] = useState("");
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<string[]>([]);
  const [isolatedLayer, setIsolatedLayer] = useState("");
  const [snapshotTick, setSnapshotTick] = useState(0);
  const [snapshotErr, setSnapshotErr] = useState("");
  const [leftTab, setLeftTab] = useState<"layers" | "objects" | "utm">("layers");
  const [rightTab, setRightTab] = useState<"properties" | "aufmass" | "ki">(
    "properties"
  );

  const [tool, setTool] = useState<ViewerTool>("select");
  const [showGrid, setShowGrid] = useState(true);
  const [showLabels, setShowLabels] = useState(false);
  const [showUtm, setShowUtm] = useState(true);
  const [showVertices, setShowVertices] = useState(false);
  const [layerVisibility, setLayerVisibility] = useState<Record<string, boolean>>(
    {}
  );
  const [search, setSearch] = useState("");
  const [measurePts, setMeasurePts] = useState<V2[]>([]);
  const [cursorWorld, setCursorWorld] = useState<V2 | null>(null);
  const [viewBox, setViewBox] = useState({
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  });
  const [dragStart, setDragStart] = useState<{
    clientX: number;
    clientY: number;
    viewBox: typeof viewBox;
  } | null>(null);

  const [pos, setPos] = useState("001");
  const [kurz, setKurz] = useState("BricsCAD Takeoff");
  const [unit, setUnit] = useState<"m" | "m2" | "Stk">("m");
  const [factor, setFactor] = useState(1);

  const [lvPositions, setLvPositions] = useState<LvPosition[]>([]);
  const [lvState, setLvState] = useState<
    "idle" | "loading" | "ok" | "error"
  >("idle");
  const [kiSelectedKey, setKiSelectedKey] = useState("");
  const [chosenLvPos, setChosenLvPos] = useState("");
  const [kiPos, setKiPos] = useState("001");
  const [kiText, setKiText] = useState("KI: —");
  const [kiUnit, setKiUnit] = useState<"m" | "m2" | "Stk">("m");
  const [kiFactor, setKiFactor] = useState(1);

  useEffect(() => {
    if (autoProjectId && autoProjectId !== projectId) {
      setProjectId(autoProjectId);
    }
  }, [autoProjectId, projectId]);

  const TAKEOFF_CACHE_KEY = useMemo(() => {
    const pid = String(projectId || "").trim();
    return pid ? `RLC_TAKEOFF_CACHE_${pid}` : "";
  }, [projectId]);

  const selectedFeature = useMemo(
    () =>
      features.find((f) => String(f.id || "") === selectedFeatureId) || null,
    [features, selectedFeatureId]
  );

  const selectedFeatures = useMemo(
    () =>
      features.filter((f) =>
        selectedFeatureIds.includes(String(f.id || ""))
      ),
    [features, selectedFeatureIds]
  );

  const selectFeature = (id: string, additive = false) => {
    setSelectedFeatureId(id);
    setSelectedFeatureIds((prev) => {
      if (!additive) return id ? [id] : [];
      return prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id];
    });
  };

  const normalizeFeatures = (payload: TakeoffPayload): TakeoffFeature[] => {
    const feats: TakeoffFeature[] = Array.isArray(
      (payload as any)?.normalized?.features
    )
      ? (payload as any).normalized.features
      : Array.isArray(payload?.features)
      ? payload.features
      : Array.isArray(payload?.data?.features)
      ? payload.data.features
      : [];

    return feats.map((f, idx) => {
      const id = String(f.id || f.name || `F_${idx + 1}`);
      const pts = Array.isArray(f.pts)
        ? f.pts.filter(
            (p) => Number.isFinite(Number(p?.x)) && Number.isFinite(Number(p?.y))
          )
        : [];
      const closed = Boolean(f.closed || f.kind === "polygon");
      const length =
        typeof f.length === "number"
          ? f.length
          : pts.length >= 2
          ? polylineLength(pts, closed)
          : 0;
      const area =
        typeof f.area === "number"
          ? f.area
          : closed && pts.length >= 3
          ? polyArea(pts)
          : 0;

      return {
        ...f,
        id,
        layer: String(f.layer || "0"),
        pts,
        closed,
        length,
        area,
      };
    });
  };

  const allGeometryPoints = useMemo(() => {
    const pts: V2[] = [];
    for (const f of features) {
      if (Array.isArray(f.pts)) pts.push(...f.pts);
    }
    if (showUtm) pts.push(...utmPoints.map((p) => ({ x: p.x, y: p.y })));
    return pts;
  }, [features, utmPoints, showUtm]);

  const drawingBounds = useMemo(
    () => boundsFromPoints(allGeometryPoints),
    [allGeometryPoints]
  );

  const fitDrawing = () => {
    const b = drawingBounds;
    if (!b) {
      setViewBox({ x: 0, y: 0, width: 100, height: 100 });
      return;
    }
    setViewBox(boundsToViewBox(expandBounds(b, 0.08)));
  };

  useEffect(() => {
    if (drawingBounds) fitDrawing();
    // Fit only when geometry set changes, not on every view change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [features.length, utmPoints.length]);

  const layerStates: LayerState[] = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of features) {
      const layer = String(f.layer || "0");
      counts.set(layer, (counts.get(layer) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({
        name,
        count,
        visible: layerVisibility[name] !== false,
        color: hashColor(name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
  }, [features, layerVisibility]);

  const visibleFeatures = useMemo(() => {
    const q = normText(search);
    return features.filter((f) => {
      if (layerVisibility[String(f.layer || "0")] === false) return false;
      if (isolatedLayer && String(f.layer || "0") !== isolatedLayer) return false;
      if (!q) return true;
      return normText(
        `${f.id || ""} ${f.layer || ""} ${f.name || ""} ${f.kind || ""}`
      ).includes(q);
    });
  }, [features, layerVisibility, isolatedLayer, search]);

  const saveProjectIdToLS = () => {
    const v = projectId.trim();
    localStorage.setItem("rlc_projectId", v);
    setStatus("Projekt gesetzt");
  };

  useEffect(() => {
    if (!TAKEOFF_CACHE_KEY) return;
    try {
      const raw = localStorage.getItem(TAKEOFF_CACHE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        ts: number;
        payload: TakeoffPayload;
      };
      if (!parsed?.payload) return;
      const feats = normalizeFeatures(parsed.payload);
      setTakeoff(parsed.payload);
      setFeatures(feats);
      setSelectedFeatureId((prev) => prev || feats[0]?.id || "");
      setSelectedFeatureIds((prev) => prev.length ? prev : feats[0]?.id ? [String(feats[0].id)] : []);
      setStatus(`Takeoff aus Cache (${feats.length} Objekte)`);
    } catch {
      // Cache is optional only.
    }
  }, [TAKEOFF_CACHE_KEY]);

  useEffect(() => {
    const projectDbId = current?.id ? String(current.id) : "";
    if (!projectDbId) {
      setLvPositions([]);
      setLvState("idle");
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLvState("loading");
      try {
        try {
          const data = await fetchJson(
            apiUrl(
              `/api/projects/${encodeURIComponent(
                projectDbId
              )}/lv?page=1&pageSize=200`
            )
          );
          const mapped = mapAnyToLvPositions(
            extractLvListFromNewEndpoint(data)
          );
          if (!cancelled) {
            setLvPositions(mapped);
            setLvState("ok");
          }
          return;
        } catch {
          // Legacy fallback.
        }

        const legacy = await fetchJson(
          apiUrl(`/api/project-lv/${encodeURIComponent(projectDbId)}`)
        );
        const mappedLegacy = mapAnyToLvPositions(
          extractLvListFromOldEndpoint(legacy)
        );

        if (!cancelled) {
          setLvPositions(mappedLegacy);
          setLvState("ok");
        }
      } catch {
        if (!cancelled) {
          setLvPositions([]);
          setLvState("error");
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [current?.id]);

  const loadPaths = async () => {
    if (!projectId) return alert("Kein Projekt gewählt.");
    setStatus("Pfade werden geladen…");
    try {
      const j = (await fetchJson(
        apiUrl(`/api/bricscad/paths?projectId=${encodeURIComponent(projectId)}`)
      )) as PathsResponse;
      if (!j?.ok) throw new Error(j?.message || "Pfade konnten nicht geladen werden.");
      setPaths(j.paths || null);
      setStatus("Pfade geladen");
    } catch (e: any) {
      setStatus("Fehler beim Laden der Pfade");
      alert(String(e?.message || e));
    }
  };

  const loadUtm = async () => {
    if (!projectId) return alert("Kein Projekt gewählt.");
    setStatus("UTM-Punkte werden geladen…");
    try {
      const j = await fetchJson(
        apiUrl(`/api/bricscad/utm?projectId=${encodeURIComponent(projectId)}`)
      );
      if (!j?.ok) throw new Error(j?.message || "UTM konnte nicht geladen werden.");
      const csv = String(j.csv || "");
      const pts = parseUtmCsvFlexible(csv);
      setUtmCsv(csv);
      setUtmPoints(pts);
      setStatus(`UTM geladen (${pts.length} Punkte)`);
    } catch (e: any) {
      setStatus("UTM Fehler");
      alert(String(e?.message || e));
    }
  };

  const reloadSnapshot = () => {
    setSnapshotErr("");
    setSnapshotTick(Date.now());
  };

  const loadTakeoff = async () => {
    if (!projectId) return alert("Kein Projekt gewählt.");
    setStatus("CAD-Daten werden geladen…");
    try {
      const j = await fetchJson(
        apiUrl(
          `/api/bricscad/takeoff?projectId=${encodeURIComponent(projectId)}`
        )
      );
      if (!j?.ok) throw new Error(j?.message || "Takeoff konnte nicht geladen werden.");

      const payload = (j.data || j) as TakeoffPayload;
      const feats = normalizeFeatures(payload);
      setTakeoff(payload);
      setFeatures(feats);
      setSelectedFeatureId(feats[0]?.id || "");
      setSelectedFeatureIds(feats[0]?.id ? [String(feats[0].id)] : []);
      setStatus(`CAD geladen (${feats.length} Objekte)`);

      if (TAKEOFF_CACHE_KEY) {
        localStorage.setItem(
          TAKEOFF_CACHE_KEY,
          JSON.stringify({ ts: Date.now(), payload })
        );
      }
      reloadSnapshot();
    } catch (e: any) {
      setStatus("CAD Fehler");
      alert(String(e?.message || e));
    }
  };

  const loadAll = async () => {
    await Promise.allSettled([loadPaths(), loadUtm(), loadTakeoff()]);
  };

  const openBricsCAD = async () => {
    if (!projectId) {
      alert("Kein Projekt gewaehlt.");
      return;
    }

    setStatus("BricsCAD wird geoeffnet...");

    const attempts: Array<{
      method: "GET" | "POST";
      path: string;
      body?: any;
    }> = [
      {
        method: "POST",
        path: `/api/bricscad/open`,
        body: { projectId },
      },
      {
        method: "GET",
        path: `/api/bricscad/open?projectId=${encodeURIComponent(projectId)}`,
      },
      {
        method: "POST",
        path: `/api/bricscad/launch`,
        body: { projectId },
      },
      {
        method: "GET",
        path: `/api/bricscad/launch?projectId=${encodeURIComponent(projectId)}`,
      },
    ];

    let lastError = "";

    for (const attempt of attempts) {
      try {
        const res = await fetch(apiUrl(attempt.path), {
          method: attempt.method,
          credentials: "include",
          headers: authHeaders(
            attempt.body ? { "Content-Type": "application/json" } : undefined
          ),
          body: attempt.body ? JSON.stringify(attempt.body) : undefined,
        });

        const txt = await res.text().catch(() => "");
        let data: any = {};

        try {
          data = txt ? JSON.parse(txt) : {};
        } catch {
          data = {};
        }

        if (res.ok && data?.ok !== false && data?.error == null) {
          setStatus("BricsCAD gestartet");
          return;
        }

        lastError =
          data?.message ||
          data?.error ||
          txt ||
          `${attempt.method} ${attempt.path}: HTTP ${res.status}`;
      } catch (error: any) {
        lastError = String(error?.message || error);
      }
    }

    setStatus("BricsCAD konnte nicht geoeffnet werden");

    alert(
      `BricsCAD konnte nicht geoeffnet werden.\n\n` +
        `${lastError || "Kein passender Server-Endpunkt gefunden."}\n\n` +
        `Geprueft wurden:\n` +
        `POST /api/bricscad/open\n` +
        `GET /api/bricscad/open\n` +
        `POST /api/bricscad/launch\n` +
        `GET /api/bricscad/launch`
    );
  };

const openCadFile = () => {
    if (!projectId) {
      alert("Kein Projekt gewählt.");
      return;
    }
    cadFileInputRef.current?.click();
  };

  const importCadFile = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";

    if (!file) return;
    if (!projectId) {
      alert("Kein Projekt gewählt.");
      return;
    }

    const extension = file.name.split(".").pop()?.toLowerCase() || "";

    try {
      setStatus(`CAD-Datei wird geöffnet: ${file.name}`);

      if (extension === "json" || extension === "geojson") {
        const parsed = JSON.parse(await file.text());
        const payload = parsed as TakeoffPayload;
        const feats = normalizeFeatures(payload);

        setTakeoff(payload);
        setFeatures(feats);
        setSelectedFeatureId(feats[0]?.id || "");
        setSelectedFeatureIds(feats[0]?.id ? [String(feats[0].id)] : []);
        setStatus(`CAD-Datei geladen (${feats.length} Objekte)`);
        return;
      }

      if (extension === "csv") {
        const csv = await file.text();
        const pts = parseUtmCsvFlexible(csv);
        setUtmCsv(csv);
        setUtmPoints(pts);
        setShowUtm(true);
        setStatus(`CSV/UTM geladen (${pts.length} Punkte)`);
        return;
      }

      if (!["dwg", "dxf"].includes(extension)) {
        throw new Error(
          "Unterstützte Formate: DXF, JSON, GeoJSON und CSV. DWG wird nach Einbindung eines serverseitigen Konverters unterstützt."
        );
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("projectId", projectId);

      const uploadResponse = await fetch(
        apiUrl(`/api/bricscad/upload?projectId=${encodeURIComponent(projectId)}`),
        {
          method: "POST",
          credentials: "include",
          headers: authHeaders(),
          body: formData,
        }
      );
      const uploadText = await uploadResponse.text().catch(() => "");
      let uploadData: any = {};
      try {
        uploadData = uploadText ? JSON.parse(uploadText) : {};
      } catch {
        uploadData = {};
      }
      if (!uploadResponse.ok || uploadData?.ok === false) {
        throw new Error(uploadData?.message || uploadText || `Upload HTTP ${uploadResponse.status}`);
      }

      setStatus(`${file.name} wird in RLC-Geometrie konvertiert…`);
      const importResponse = await fetch(
        apiUrl(`/api/bricscad/import?projectId=${encodeURIComponent(projectId)}`),
        {
          method: "POST",
          credentials: "include",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            projectId,
            uploadId: uploadData.uploadId || uploadData.storedName || uploadData.fileName,
            originalName: uploadData.originalName || file.name,
          }),
        }
      );
      const importText = await importResponse.text().catch(() => "");
      let importData: any = {};
      try {
        importData = importText ? JSON.parse(importText) : {};
      } catch {
        importData = {};
      }
      if (!importResponse.ok || importData?.ok === false) {
        throw new Error(importData?.message || importText || `Import HTTP ${importResponse.status}`);
      }

      const payload = (importData.takeoff || importData.result || importData) as TakeoffPayload;
      const feats = normalizeFeatures(payload);
      if (feats.length) {
        setTakeoff(payload);
        setFeatures(feats);
        setSelectedFeatureId(feats[0]?.id || "");
        setSelectedFeatureIds(feats[0]?.id ? [String(feats[0].id)] : []);
        if (TAKEOFF_CACHE_KEY) {
          localStorage.setItem(TAKEOFF_CACHE_KEY, JSON.stringify({ ts: Date.now(), payload }));
        }
        setStatus(`${file.name} importiert (${feats.length} Objekte)`);
        return;
      }

      await loadTakeoff();
    } catch (error: any) {
      setStatus("CAD-Datei konnte nicht geöffnet werden");
      alert(String(error?.message || error));
    }
  };
  const snapshotUrl = useMemo(() => {
    if (!projectId) return "";
    return apiUrl(
      `/api/bricscad/snapshot?projectId=${encodeURIComponent(
        projectId
      )}&t=${snapshotTick || 0}`
    );
  }, [projectId, snapshotTick]);

  const svgPointFromClient = (clientX: number, clientY: number): V2 | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: viewBox.x + ((clientX - rect.left) / rect.width) * viewBox.width,
      y: viewBox.y + ((clientY - rect.top) / rect.height) * viewBox.height,
    };
  };

  const zoomAt = (factorZoom: number, anchor?: V2) => {
    const a =
      anchor || {
        x: viewBox.x + viewBox.width / 2,
        y: viewBox.y + viewBox.height / 2,
      };
    const nextW = clamp(viewBox.width * factorZoom, 0.001, 1e12);
    const nextH = clamp(viewBox.height * factorZoom, 0.001, 1e12);
    const rx = (a.x - viewBox.x) / viewBox.width;
    const ry = (a.y - viewBox.y) / viewBox.height;
    setViewBox({
      x: a.x - nextW * rx,
      y: a.y - nextH * ry,
      width: nextW,
      height: nextH,
    });
  };

  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const p = svgPointFromClient(e.clientX, e.clientY);
    zoomAt(e.deltaY > 0 ? 1.12 : 0.88, p || undefined);
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = svgPointFromClient(e.clientX, e.clientY);
    if (!p) return;

    if (tool === "pan" || e.button === 1 || e.shiftKey) {
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragStart({
        clientX: e.clientX,
        clientY: e.clientY,
        viewBox: { ...viewBox },
      });
      return;
    }

    if (tool === "distance") {
      setMeasurePts((prev) => [...prev, p].slice(-2));
    } else if (tool === "area") {
      setMeasurePts((prev) => [...prev, p]);
    } else if (tool === "point") {
      setMeasurePts([p]);
    }
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = svgPointFromClient(e.clientX, e.clientY);
    setCursorWorld(p);

    if (!dragStart) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const dx =
      ((e.clientX - dragStart.clientX) / Math.max(1, rect.width)) *
      dragStart.viewBox.width;
    const dy =
      ((e.clientY - dragStart.clientY) / Math.max(1, rect.height)) *
      dragStart.viewBox.height;

    setViewBox({
      ...dragStart.viewBox,
      x: dragStart.viewBox.x - dx,
      y: dragStart.viewBox.y - dy,
    });
  };

  const onPointerUp = () => setDragStart(null);

  const strokeWidth = Math.max(viewBox.width, viewBox.height) / 900;
  const pointRadius = Math.max(viewBox.width, viewBox.height) / 280;
  const labelSize = Math.max(viewBox.width, viewBox.height) / 110;

  const measurementLength = useMemo(
    () => polylineLength(measurePts, false),
    [measurePts]
  );
  const measurementArea = useMemo(
    () => (measurePts.length >= 3 ? polyArea(measurePts) : 0),
    [measurePts]
  );

  const qtyPreview = useMemo(() => {
    if (!selectedFeature) return 0;
    const length = Number(selectedFeature.length || 0);
    const area = Number(selectedFeature.area || 0);
    const base = unit === "m" ? length : unit === "m2" ? area : 1;
    return base * (Number.isFinite(factor) ? factor : 1);
  }, [selectedFeature, unit, factor]);

  const pushToAufmass = async (override?: {
    pos?: string;
    text?: string;
    unit?: "m" | "m2" | "Stk";
    qty?: number;
  }) => {
    const fsProjectKey = String(current?.code || projectId || "").trim();
    if (!fsProjectKey) return alert("Kein Projekt gewählt.");

    const finalPos = String(override?.pos ?? pos).trim();
    if (!finalPos) return alert("Positionsnummer fehlt.");
    if (!selectedFeature && typeof override?.qty !== "number") {
      return alert("Kein CAD-Objekt ausgewählt.");
    }

    const length = Number(selectedFeature?.length || 0);
    const area = Number(selectedFeature?.area || 0);
    const finalUnit = override?.unit ?? unit;
    const baseQty =
      typeof override?.qty === "number"
        ? override.qty
        : finalUnit === "m"
        ? length
        : finalUnit === "m2"
        ? area
        : 1;
    const finalFactor =
      typeof override?.qty === "number"
        ? 1
        : Number.isFinite(factor)
        ? factor
        : 1;
    const qtyFinal = baseQty * finalFactor;
    const finalText = String(
      override?.text ?? kurz ?? "BricsCAD Takeoff"
    ).trim();

    const row = {
      pos: finalPos,
      text: finalText,
      unit: finalUnit,
      qty: qtyFinal,
      source: "BricsCAD",
      meta: {
        takeoff: selectedFeature
          ? {
              featureId: selectedFeature.id,
              kind: selectedFeature.kind,
              layer: selectedFeature.layer,
              name: selectedFeature.name,
            }
          : undefined,
        length,
        area,
        factor: finalFactor,
        ki: Boolean(override),
      },
    };

    const token =
      localStorage.getItem("rlc_token") ||
      localStorage.getItem("token") ||
      "";
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const tryPost = async (url: string, body: any) => {
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify(body),
      });
      const txt = await res.text().catch(() => "");
      let j: any = {};
      try {
        j = txt ? JSON.parse(txt) : {};
      } catch {
        j = {};
      }
      return {
        ok:
          res.ok &&
          (j?.ok === true ||
            j?.success === true ||
            j?.status === "ok" ||
            j?.error == null),
        res,
        j,
        txt,
      };
    };

    setStatus("Übernahme in Aufmaß…");

    const attempts = [
      () =>
        tryPost(
          apiUrl(
            `/api/aufmass/soll-ist/${encodeURIComponent(fsProjectKey)}/append`
          ),
          {
            rows: [
              {
                pos: row.pos,
                text: row.text,
                unit: row.unit,
                istDelta: Number(row.qty || 0),
              },
            ],
          }
        ),
      () =>
        tryPost(apiUrl(`/api/aufmass/add-from-cad`), {
          projectId: fsProjectKey,
          row,
        }),
    ];

    let lastError = "";
    for (const attempt of attempts) {
      try {
        const r = await attempt();
        if (r.ok) {
          setStatus("In Aufmaß übernommen");
          alert(
            `${row.pos} – ${row.text}\n${formatNumber(row.qty)} ${uiUnitLabel(
              row.unit
            )}\n\nIn Aufmaß übernommen.`
          );
          return;
        }
        lastError = r.txt || `HTTP ${r.res.status}`;
      } catch (e: any) {
        lastError = String(e?.message || e);
      }
    }

    setStatus("Übernahme fehlgeschlagen");
    alert(`Übernahme fehlgeschlagen.\n${lastError}`);
  };

  const kiRows: KiRow[] = useMemo(() => {
    const map = new Map<string, KiRow>();

    for (const f of features) {
      const group = pickLayerGroup(f.layer);
      const lvPosGuess =
        String((f as any)?.meta?.lvPos ?? pos ?? "001").trim() || "001";
      const inferredUnit: "m" | "m2" | "Stk" =
        Number(f.area || 0) > 0 ? "m2" : f.kind === "point" ? "Stk" : "m";
      const qty =
        inferredUnit === "m2"
          ? Number(f.area || 0)
          : inferredUnit === "Stk"
          ? 1
          : Number(f.length || 0);

      const key = `${lvPosGuess}__${group}__${inferredUnit}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          key,
          lvPos: lvPosGuess,
          layerGroup: group,
          unit: inferredUnit,
          qty,
          confidenceA: 0.62,
          exampleLayer: f.layer,
          exampleName: f.name,
        });
      } else {
        existing.qty += qty;
        existing.confidenceA = clamp(existing.confidenceA + 0.02, 0.62, 0.9);
      }
    }

    return Array.from(map.values()).sort((a, b) => b.qty - a.qty);
  }, [features, pos]);

  useEffect(() => {
    if (kiRows.length && !kiSelectedKey) setKiSelectedKey(kiRows[0].key);
  }, [kiRows, kiSelectedKey]);

  const kiSelected = useMemo(
    () => kiRows.find((r) => r.key === kiSelectedKey) || null,
    [kiRows, kiSelectedKey]
  );

  const lvSuggestions: LvSuggestion[] = useMemo(() => {
    if (!kiSelected || !lvPositions.length) return [];

    const query = `${kiSelected.layerGroup} ${
      kiSelected.exampleLayer || ""
    } ${kiSelected.exampleName || ""}`;

    return lvPositions
      .map((p) => ({
        pos: p.pos,
        text: p.text,
        unit: p.unit,
        score: Math.max(
          scoreMatch(query, `${p.pos} ${p.text}`),
          scoreMatch(kiSelected.layerGroup, p.text),
          scoreMatch(kiSelected.exampleLayer || "", p.text)
        ),
      }))
      .filter((x) => x.score > 0.18)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }, [kiSelected, lvPositions]);

  useEffect(() => setChosenLvPos(""), [kiSelectedKey]);

  useEffect(() => {
    if (!kiSelected) return;
    const chosen = lvSuggestions.find((s) => s.pos === chosenLvPos);

    let finalPos = kiSelected.lvPos;
    let finalText = `KI: ${kiSelected.layerGroup}`;
    let finalUnit: "m" | "m2" | "Stk" = kiSelected.unit;

    if (chosen) {
      finalPos = chosen.pos;
      finalText = chosen.text;
      const u = String(chosen.unit || "").toLowerCase();
      if (u.includes("m2") || u.includes("m²")) finalUnit = "m2";
      else if (u.includes("stk") || u === "st") finalUnit = "Stk";
      else finalUnit = "m";
    }

    setKiPos(finalPos || "001");
    setKiText(finalText || "KI: —");
    setKiUnit(finalUnit);
    setKiFactor(1);
  }, [kiSelected, chosenLvPos, lvSuggestions]);

  const kiQtyPreview = useMemo(
    () =>
      Number(kiSelected?.qty || 0) *
      (Number.isFinite(kiFactor) ? kiFactor : 1),
    [kiSelected, kiFactor]
  );

  const exportGeoJson = () => {
    const geo = {
      type: "FeatureCollection",
      name: `RLC_${projectId || "CAD"}`,
      features: visibleFeatures.map((f) => {
        const pts = Array.isArray(f.pts) ? f.pts : [];
        const closed = Boolean(f.closed || f.kind === "polygon");
        const coordinates = pts.map((p) => [p.x, p.y]);
        const geometry =
          f.kind === "point" || pts.length === 1
            ? {
                type: "Point",
                coordinates: coordinates[0] || [0, 0],
              }
            : closed
            ? {
                type: "Polygon",
                coordinates: [
                  coordinates.length &&
                  (coordinates[0][0] !== coordinates[coordinates.length - 1][0] ||
                    coordinates[0][1] !== coordinates[coordinates.length - 1][1])
                    ? [...coordinates, coordinates[0]]
                    : coordinates,
                ],
              }
            : {
                type: "LineString",
                coordinates,
              };

        return {
          type: "Feature",
          id: f.id,
          properties: {
            id: f.id,
            layer: f.layer,
            name: f.name,
            kind: f.kind,
            length: f.length,
            area: f.area,
          },
          geometry,
        };
      }),
    };

    downloadText(
      `${projectId || "cad"}-takeoff.geojson`,
      JSON.stringify(geo, null, 2),
      "application/geo+json"
    );
  };

  const exportCsv = () => {
    const rows = [
      ["ID", "Layer", "Typ", "Name", "Laenge_m", "Flaeche_m2"],
      ...visibleFeatures.map((f) => [
        String(f.id || ""),
        String(f.layer || ""),
        String(f.kind || ""),
        String(f.name || ""),
        String(Number(f.length || 0)),
        String(Number(f.area || 0)),
      ]),
    ];
    const csv = rows
      .map((r) =>
        r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")
      )
      .join("\r\n");
    downloadText(
      `${projectId || "cad"}-takeoff.csv`,
      csv,
      "text/csv;charset=utf-8"
    );
  };

  const selectedFeatureCenter = selectedFeature?.pts?.length
    ? centroid(selectedFeature.pts)
    : null;

  const zoomToSelection = () => {
    if (!selectedFeature?.pts?.length) return;
    const b = boundsFromPoints(selectedFeature.pts);
    if (b) setViewBox(boundsToViewBox(expandBounds(b, 0.25)));
  };

  const toggleAllLayers = (visible: boolean) => {
    const next: Record<string, boolean> = {};
    for (const l of layerStates) next[l.name] = visible;
    setLayerVisibility(next);
  };

  const activateTool = (nextTool: ViewerTool) => {
    setTool(nextTool);
    if (nextTool === "select" || nextTool === "pan") setMeasurePts([]);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable) return;

      if (e.key === "Escape") {
        setSelectedFeatureId("");
        setSelectedFeatureIds([]);
        setMeasurePts([]);
        setTool("select");
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        const ids = visibleFeatures.map((f) => String(f.id || "")).filter(Boolean);
        setSelectedFeatureIds(ids);
        setSelectedFeatureId(ids[0] || "");
        return;
      }
      const key = e.key.toLowerCase();
      if (key === "f") fitDrawing();
      else if (key === "g") setShowGrid((v) => !v);
      else if (key === "l") setShowLabels((v) => !v);
      else if (key === "s") activateTool("select");
      else if (key === "p") activateTool("pan");
      else if (key === "m") { setMeasurePts([]); activateTool("distance"); }
      else if (key === "a") { setMeasurePts([]); activateTool("area"); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visibleFeatures]);

  return (
    <div
      style={{
        minHeight: "calc(100vh - 112px)",
        background: ui.bg,
        padding: 10,
        color: ui.text,
      }}
    >
      {/* Top project/action bar */}
      <div
        style={{
          minHeight: 58,
          border: `1px solid ${ui.border}`,
          borderRadius: 14,
          background: ui.panel,
          boxShadow: ui.shadow,
          padding: "10px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: ui.accent,
              color: "#fff",
              display: "grid",
              placeItems: "center",
              fontWeight: 950,
              fontSize: 12,
            }}
          >
            CAD
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 950 }}>
              RLC CAD Viewer
            </div>
            <div style={{ marginTop: 2, fontSize: 11, color: ui.sub }}>
              {current
                ? `${current.code} – ${current.name}`
                : projectId || "Kein Projekt gewählt"}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <Input
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            placeholder="Projektcode"
            style={{ width: 170 }}
          />
          <Btn onClick={saveProjectIdToLS}>Projekt setzen</Btn>
          <Btn onClick={() => void loadAll()} primary>
            Alles laden
          </Btn>
          <Btn onClick={openBricsCAD}>BricsCAD öffnen</Btn>
          <Btn onClick={openCadFile}>CAD-Datei öffnen</Btn>
          <input
            ref={cadFileInputRef}
            type="file"
            accept=".dwg,.dxf,.dgn,.json,.geojson,.csv"
            onChange={importCadFile}
            style={{ display: "none" }}
          />
          <Btn onClick={exportGeoJson} disabled={!visibleFeatures.length}>
            GeoJSON
          </Btn>
          <Btn onClick={exportCsv} disabled={!visibleFeatures.length}>
            CSV
          </Btn>
        </div>
      </div>

      {/* Main CAD layout */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "260px minmax(420px, 1fr) 330px",
          gap: 10,
          minHeight: 700,
        }}
      >
        {/* LEFT */}
        <Card
          title="Projektstruktur"
          subtitle={`${features.length} Objekte · ${layerStates.length} Layer`}
          style={{ minWidth: 0 }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              borderBottom: `1px solid ${ui.border}`,
            }}
          >
            {[
              ["layers", "Layer"],
              ["objects", "Objekte"],
              ["utm", "UTM"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setLeftTab(key as any)}
                style={{
                  height: 40,
                  border: 0,
                  borderRight: `1px solid ${ui.border}`,
                  background:
                    leftTab === key ? ui.accentSoft : ui.panel,
                  color: leftTab === key ? ui.accent : ui.sub,
                  fontSize: 12,
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={{ padding: 10 }}>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Suchen…"
            />
          </div>

          {leftTab === "layers" ? (
            <>
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  padding: "0 10px 10px",
                }}
              >
                <Btn
                  onClick={() => toggleAllLayers(true)}
                  style={{ flex: 1, height: 30, fontSize: 11 }}
                >
                  Alle ein
                </Btn>
                <Btn
                  onClick={() => toggleAllLayers(false)}
                  style={{ flex: 1, height: 30, fontSize: 11 }}
                >
                  Alle aus
                </Btn>
                <Btn
                  onClick={() => setIsolatedLayer("")}
                  disabled={!isolatedLayer}
                  style={{ flex: 1, height: 30, fontSize: 11 }}
                  title="Layer-Isolierung aufheben"
                >
                  Isolation aus
                </Btn>
              </div>
              <div style={{ maxHeight: 560, overflow: "auto" }}>
                {layerStates.map((layer) => (
                  <label
                    key={layer.name}
                    style={{
                      minHeight: 38,
                      padding: "0 10px",
                      borderTop: `1px solid ${ui.border}`,
                      display: "grid",
                      gridTemplateColumns: "22px 14px 1fr auto 28px",
                      alignItems: "center",
                      gap: 7,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={layer.visible}
                      onChange={(e) =>
                        setLayerVisibility((prev) => ({
                          ...prev,
                          [layer.name]: e.target.checked,
                        }))
                      }
                    />
                    <span
                      style={{
                        width: 11,
                        height: 11,
                        borderRadius: 3,
                        background: layer.color,
                      }}
                    />
                    <span
                      style={{
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontSize: 12,
                        fontWeight: 750,
                      }}
                    >
                      {layer.name}
                    </span>
                    <span style={{ fontSize: 11, color: ui.sub }}>
                      {layer.count}
                    </span>
                    <button
                      type="button"
                      title={isolatedLayer === layer.name ? "Isolation aufheben" : "Layer isolieren"}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsolatedLayer((prev) => prev === layer.name ? "" : layer.name);
                      }}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 7,
                        border: `1px solid ${isolatedLayer === layer.name ? ui.accent2 : ui.border}`,
                        background: isolatedLayer === layer.name ? ui.accentSoft : ui.panel,
                        color: isolatedLayer === layer.name ? ui.accent : ui.sub,
                        fontWeight: 900,
                        cursor: "pointer",
                      }}
                    >
                      I
                    </button>
                  </label>
                ))}
              </div>
            </>
          ) : leftTab === "objects" ? (
            <div style={{ maxHeight: 610, overflow: "auto" }}>
              {visibleFeatures.map((f) => {
                const active = selectedFeatureIds.includes(String(f.id || ""));
                return (
                  <button
                    key={String(f.id)}
                    type="button"
                    onClick={(e) => {
                      selectFeature(String(f.id || ""), e.ctrlKey || e.metaKey);
                      setRightTab("properties");
                    }}
                    style={{
                      width: "100%",
                      minHeight: 52,
                      padding: "8px 10px",
                      border: 0,
                      borderTop: `1px solid ${ui.border}`,
                      background: active ? ui.accentSoft : ui.panel,
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 900,
                        color: active ? ui.accent : ui.text,
                      }}
                    >
                      {f.id || "—"}
                    </div>
                    <div
                      style={{
                        marginTop: 3,
                        fontSize: 11,
                        color: ui.sub,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {f.layer || "0"} · {f.kind || "Objekt"}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={{ maxHeight: 610, overflow: "auto" }}>
              <div style={{ padding: "0 10px 10px" }}>
                <Btn
                  onClick={loadUtm}
                  primary
                  style={{ width: "100%" }}
                >
                  UTM laden
                </Btn>
              </div>
              {utmPoints.map((p) => (
                <div
                  key={p.id}
                  style={{
                    padding: "8px 10px",
                    borderTop: `1px solid ${ui.border}`,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 900 }}>
                    {p.id}
                  </div>
                  <div style={{ marginTop: 3, fontSize: 11, color: ui.sub }}>
                    E {formatNumber(p.x)} · N {formatNumber(p.y)}
                  </div>
                </div>
              ))}
              {!utmPoints.length ? (
                <div
                  style={{
                    padding: 14,
                    color: ui.sub,
                    fontSize: 12,
                    lineHeight: 1.5,
                  }}
                >
                  Keine UTM-Punkte geladen.
                </div>
              ) : null}
            </div>
          )}
        </Card>

        {/* CENTER VIEWER */}
        <Card
          title="Zeichnung"
          subtitle={
            paths?.takeoffJsonPath
              ? paths.takeoffJsonPath
              : "BricsCAD Takeoff / UTM"
          }
          style={{ minWidth: 0 }}
          action={
            <div style={{ display: "flex", gap: 6 }}>
              <Badge tone={features.length ? "success" : "warning"}>
                {features.length ? "CAD geladen" : "Keine CAD-Daten"}
              </Badge>
            </div>
          }
        >
          {/* Viewer toolbar */}
          <div
            style={{
              minHeight: 48,
              padding: "6px 8px",
              borderBottom: `1px solid ${ui.border}`,
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexWrap: "wrap",
              background: ui.panel2,
            }}
          >
            <Btn
              active={tool === "select"}
              onClick={() => activateTool("select")}
            >
              Auswahl
            </Btn>
            <Btn active={tool === "pan"} onClick={() => activateTool("pan")}>
              Verschieben
            </Btn>
            <Btn
              active={tool === "distance"}
              onClick={() => {
                setMeasurePts([]);
                activateTool("distance");
              }}
            >
              Strecke
            </Btn>
            <Btn
              active={tool === "area"}
              onClick={() => {
                setMeasurePts([]);
                activateTool("area");
              }}
            >
              Fläche
            </Btn>
            <Btn
              active={tool === "point"}
              onClick={() => {
                setMeasurePts([]);
                activateTool("point");
              }}
            >
              Punkt
            </Btn>

            <span
              style={{
                width: 1,
                height: 28,
                background: ui.border,
                margin: "0 2px",
              }}
            />

            <IconBtn onClick={() => zoomAt(0.8)} title="Vergrößern">
              +
            </IconBtn>
            <IconBtn onClick={() => zoomAt(1.25)} title="Verkleinern">
              −
            </IconBtn>
            <Btn onClick={fitDrawing}>Alles anzeigen</Btn>
            <Btn
              onClick={zoomToSelection}
              disabled={!selectedFeature}
            >
              Auswahl zoomen
            </Btn>

            <span
              style={{
                width: 1,
                height: 28,
                background: ui.border,
                margin: "0 2px",
              }}
            />

            <Btn active={showGrid} onClick={() => setShowGrid((v) => !v)}>
              Raster
            </Btn>
            <Btn
              active={showLabels}
              onClick={() => setShowLabels((v) => !v)}
            >
              Beschriftung
            </Btn>
            <Btn
              active={showVertices}
              onClick={() => setShowVertices((v) => !v)}
            >
              Punkte
            </Btn>
            <Btn active={showUtm} onClick={() => setShowUtm((v) => !v)}>
              UTM
            </Btn>
            <Btn onClick={() => setMeasurePts([])}>Messung löschen</Btn>
          </div>

          <div
            style={{
              position: "relative",
              height: 610,
              background: ui.cadBg,
              overflow: "hidden",
            }}
          >
            {!features.length && !utmPoints.length ? (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "grid",
                  placeItems: "center",
                  color: "#cbd5e1",
                  textAlign: "center",
                  padding: 30,
                  zIndex: 2,
                  pointerEvents: "none",
                }}
              >
                <div>
                  <div style={{ fontSize: 18, fontWeight: 950 }}>
                    Keine Zeichnung geladen
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 13,
                      color: "#94a3b8",
                      lineHeight: 1.5,
                    }}
                  >
                    Projekt setzen und „Alles laden“ wählen.
                    <br />
                    Der Viewer zeichnet die Geometrien aus takeoff.json.
                  </div>
                </div>
              </div>
            ) : null}

            <svg
              ref={svgRef}
              viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
              preserveAspectRatio="xMidYMid meet"
              onWheel={onWheel}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={() => {
                setDragStart(null);
                setCursorWorld(null);
              }}
              onDoubleClick={() => {
                if (tool === "area" && measurePts.length >= 3) {
                  setTool("select");
                }
              }}
              style={{
                width: "100%",
                height: "100%",
                display: "block",
                cursor:
                  tool === "pan"
                    ? dragStart
                      ? "grabbing"
                      : "grab"
                    : tool === "select"
                    ? "default"
                    : "crosshair",
                touchAction: "none",
                userSelect: "none",
              }}
            >
              <defs>
                <pattern
                  id="smallGrid"
                  width={Math.max(viewBox.width / 40, 0.001)}
                  height={Math.max(viewBox.width / 40, 0.001)}
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d={`M ${Math.max(
                      viewBox.width / 40,
                      0.001
                    )} 0 L 0 0 0 ${Math.max(
                      viewBox.width / 40,
                      0.001
                    )}`}
                    fill="none"
                    stroke={ui.cadGrid}
                    strokeWidth={strokeWidth * 0.25}
                  />
                </pattern>
              </defs>

              {showGrid ? (
                <rect
                  x={viewBox.x}
                  y={viewBox.y}
                  width={viewBox.width}
                  height={viewBox.height}
                  fill="url(#smallGrid)"
                  pointerEvents="none"
                />
              ) : null}

              {visibleFeatures.map((f) => {
                const pts = Array.isArray(f.pts) ? f.pts : [];
                if (!pts.length) return null;

                const id = String(f.id || "");
                const active = selectedFeatureIds.includes(id);
                const color = hashColor(String(f.layer || "0"));
                const pointsAttr = pts.map((p) => `${p.x},${p.y}`).join(" ");
                const isClosed = Boolean(f.closed || f.kind === "polygon");

                return (
                  <g key={id}>
                    {pts.length === 1 || f.kind === "point" ? (
                      <circle
                        cx={pts[0].x}
                        cy={pts[0].y}
                        r={active ? pointRadius * 1.8 : pointRadius}
                        fill={active ? "#ffffff" : color}
                        stroke={active ? "#ffcc00" : color}
                        strokeWidth={active ? strokeWidth * 2 : strokeWidth}
                        onClick={(e) => {
                          if (tool !== "select") return;
                          e.stopPropagation();
                          selectFeature(id, e.ctrlKey || e.metaKey);
                          setRightTab("properties");
                        }}
                      />
                    ) : isClosed ? (
                      <polygon
                        points={pointsAttr}
                        fill={active ? "rgba(255,204,0,0.18)" : "rgba(255,255,255,0.03)"}
                        stroke={active ? "#ffcc00" : color}
                        strokeWidth={active ? strokeWidth * 2.4 : strokeWidth}
                        vectorEffect="non-scaling-stroke"
                        onClick={(e) => {
                          if (tool !== "select") return;
                          e.stopPropagation();
                          selectFeature(id, e.ctrlKey || e.metaKey);
                          setRightTab("properties");
                        }}
                      />
                    ) : (
                      <polyline
                        points={pointsAttr}
                        fill="none"
                        stroke={active ? "#ffcc00" : color}
                        strokeWidth={active ? strokeWidth * 2.4 : strokeWidth}
                        vectorEffect="non-scaling-stroke"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        onClick={(e) => {
                          if (tool !== "select") return;
                          e.stopPropagation();
                          selectFeature(id, e.ctrlKey || e.metaKey);
                          setRightTab("properties");
                        }}
                      />
                    )}

                    {showVertices
                      ? pts.map((p, idx) => (
                          <circle
                            key={`${id}_v_${idx}`}
                            cx={p.x}
                            cy={p.y}
                            r={pointRadius * 0.45}
                            fill="#ffffff"
                            stroke={color}
                            strokeWidth={strokeWidth * 0.8}
                            pointerEvents="none"
                          />
                        ))
                      : null}

                    {showLabels ? (
                      <text
                        x={centroid(pts).x}
                        y={centroid(pts).y}
                        fill="#e2e8f0"
                        fontSize={labelSize}
                        textAnchor="middle"
                        pointerEvents="none"
                      >
                        {f.name || f.id}
                      </text>
                    ) : null}
                  </g>
                );
              })}

              {showUtm
                ? utmPoints.map((p) => (
                    <g key={`utm_${p.id}`}>
                      <line
                        x1={p.x - pointRadius * 1.3}
                        y1={p.y}
                        x2={p.x + pointRadius * 1.3}
                        y2={p.y}
                        stroke="#ff4d4f"
                        strokeWidth={strokeWidth}
                      />
                      <line
                        x1={p.x}
                        y1={p.y - pointRadius * 1.3}
                        x2={p.x}
                        y2={p.y + pointRadius * 1.3}
                        stroke="#ff4d4f"
                        strokeWidth={strokeWidth}
                      />
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={pointRadius * 0.65}
                        fill="none"
                        stroke="#ff4d4f"
                        strokeWidth={strokeWidth}
                      />
                      {showLabels ? (
                        <text
                          x={p.x + pointRadius * 1.8}
                          y={p.y - pointRadius * 1.2}
                          fill="#ffb3b3"
                          fontSize={labelSize * 0.8}
                        >
                          {p.label || p.id}
                        </text>
                      ) : null}
                    </g>
                  ))
                : null}

              {measurePts.length ? (
                <g pointerEvents="none">
                  {tool === "area" && measurePts.length >= 3 ? (
                    <polygon
                      points={measurePts
                        .map((p) => `${p.x},${p.y}`)
                        .join(" ")}
                      fill="rgba(14,111,184,0.25)"
                      stroke="#38bdf8"
                      strokeWidth={strokeWidth * 1.5}
                    />
                  ) : measurePts.length >= 2 ? (
                    <polyline
                      points={measurePts
                        .map((p) => `${p.x},${p.y}`)
                        .join(" ")}
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth={strokeWidth * 1.5}
                    />
                  ) : null}

                  {measurePts.map((p, i) => (
                    <circle
                      key={`m_${i}`}
                      cx={p.x}
                      cy={p.y}
                      r={pointRadius * 0.7}
                      fill="#38bdf8"
                      stroke="#ffffff"
                      strokeWidth={strokeWidth}
                    />
                  ))}
                </g>
              ) : null}

              {selectedFeatureCenter ? (
                <circle
                  cx={selectedFeatureCenter.x}
                  cy={selectedFeatureCenter.y}
                  r={pointRadius * 0.22}
                  fill="#ffcc00"
                  pointerEvents="none"
                />
              ) : null}
            </svg>

            {drawingBounds ? (
              <div
                style={{
                  position: "absolute",
                  right: 10,
                  top: 10,
                  width: 190,
                  height: 125,
                  borderRadius: 10,
                  overflow: "hidden",
                  border: "1px solid rgba(255,255,255,0.28)",
                  background: "rgba(15,23,42,0.88)",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.28)",
                }}
                title="MiniMap – klicken zum Zentrieren"
              >
                <svg
                  viewBox={`${drawingBounds.minX} ${drawingBounds.minY} ${Math.max(1, drawingBounds.maxX - drawingBounds.minX)} ${Math.max(1, drawingBounds.maxY - drawingBounds.minY)}`}
                  preserveAspectRatio="xMidYMid meet"
                  style={{ width: "100%", height: "100%", display: "block", cursor: "crosshair" }}
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = drawingBounds.minX + ((e.clientX - rect.left) / rect.width) * (drawingBounds.maxX - drawingBounds.minX);
                    const y = drawingBounds.minY + ((e.clientY - rect.top) / rect.height) * (drawingBounds.maxY - drawingBounds.minY);
                    setViewBox((prev) => ({ ...prev, x: x - prev.width / 2, y: y - prev.height / 2 }));
                  }}
                >
                  {visibleFeatures.map((f) => {
                    const pts = Array.isArray(f.pts) ? f.pts : [];
                    if (!pts.length) return null;
                    const pa = pts.map((p) => `${p.x},${p.y}`).join(" ");
                    const closed = Boolean(f.closed || f.kind === "polygon");
                    return pts.length === 1 || f.kind === "point" ? (
                      <circle key={`mini_${f.id}`} cx={pts[0].x} cy={pts[0].y} r={Math.max((drawingBounds.maxX-drawingBounds.minX)/300, 0.1)} fill={hashColor(String(f.layer || "0"))} />
                    ) : closed ? (
                      <polygon key={`mini_${f.id}`} points={pa} fill="none" stroke={hashColor(String(f.layer || "0"))} strokeWidth="1" vectorEffect="non-scaling-stroke" />
                    ) : (
                      <polyline key={`mini_${f.id}`} points={pa} fill="none" stroke={hashColor(String(f.layer || "0"))} strokeWidth="1" vectorEffect="non-scaling-stroke" />
                    );
                  })}
                  <rect x={viewBox.x} y={viewBox.y} width={viewBox.width} height={viewBox.height} fill="rgba(56,189,248,0.08)" stroke="#38bdf8" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                </svg>
              </div>
            ) : null}

            <div
              style={{
                position: "absolute",
                left: 10,
                bottom: 10,
                minHeight: 30,
                padding: "6px 9px",
                borderRadius: 8,
                background: "rgba(15,23,42,0.82)",
                color: "#dbeafe",
                fontSize: 11,
                pointerEvents: "none",
              }}
            >
              {cursorWorld
                ? `X ${formatNumber(cursorWorld.x)} · Y ${formatNumber(
                    cursorWorld.y
                  )}`
                : "X — · Y —"}
            </div>

            <div
              style={{
                position: "absolute",
                right: 10,
                bottom: 10,
                minHeight: 30,
                padding: "6px 9px",
                borderRadius: 8,
                background: "rgba(15,23,42,0.82)",
                color: "#dbeafe",
                fontSize: 11,
                pointerEvents: "none",
              }}
            >
              {tool === "distance" && measurePts.length
                ? `Strecke: ${formatNumber(measurementLength)} m`
                : tool === "area" && measurePts.length
                ? `Fläche: ${formatNumber(measurementArea)} m²`
                : tool === "point" && measurePts[0]
                ? `Punkt: ${formatNumber(measurePts[0].x)} / ${formatNumber(
                    measurePts[0].y
                  )}`
                : `Ansicht: ${formatNumber(viewBox.width, 1)} × ${formatNumber(
                    viewBox.height,
                    1
                  )}`}
            </div>
          </div>

          <div
            style={{
              minHeight: 38,
              padding: "0 10px",
              borderTop: `1px solid ${ui.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              background: ui.panel2,
              fontSize: 11,
              color: ui.sub,
            }}
          >
            <div>
              Werkzeug: <b style={{ color: ui.text }}>{tool}</b>
            </div>
            <div>
              Sichtbar:{" "}
              <b style={{ color: ui.text }}>{visibleFeatures.length}</b> /{" "}
              {features.length}
            </div>
            <div>
              Status: <b style={{ color: ui.text }}>{status}</b>
            </div>
          </div>
        </Card>

        {/* RIGHT */}
        <Card
          title="Bearbeitung"
          subtitle={selectedFeatureIds.length > 1 ? `${selectedFeatureIds.length} Objekte ausgewählt` : selectedFeature ? String(selectedFeature.id) : "Keine Auswahl"}
          style={{ minWidth: 0 }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              borderBottom: `1px solid ${ui.border}`,
            }}
          >
            {[
              ["properties", "Eigenschaften"],
              ["aufmass", "Aufmaß"],
              ["ki", "KI"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setRightTab(key as any)}
                style={{
                  height: 40,
                  border: 0,
                  borderRight: `1px solid ${ui.border}`,
                  background:
                    rightTab === key ? ui.accentSoft : ui.panel,
                  color: rightTab === key ? ui.accent : ui.sub,
                  fontSize: 11,
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {rightTab === "properties" ? (
            <div style={{ padding: 12 }}>
              {selectedFeatureIds.length > 1 ? (
                <div style={{ marginBottom: 12, padding: 10, borderRadius: 10, background: ui.accentSoft, color: ui.accent, fontSize: 12, fontWeight: 900 }}>
                  {selectedFeatureIds.length} Objekte ausgewählt · Gesamtlänge {formatNumber(selectedFeatures.reduce((s, f) => s + Number(f.length || 0), 0))} m · Gesamtfläche {formatNumber(selectedFeatures.reduce((s, f) => s + Number(f.area || 0), 0))} m²
                </div>
              ) : null}
              {!selectedFeature ? (
                <div
                  style={{
                    fontSize: 12,
                    color: ui.sub,
                    lineHeight: 1.5,
                  }}
                >
                  Objekt in der Zeichnung oder Objektliste auswählen.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {[
                    ["ID", selectedFeature.id || "—"],
                    ["Layer", selectedFeature.layer || "0"],
                    ["Name", selectedFeature.name || "—"],
                    ["Typ", selectedFeature.kind || "—"],
                    [
                      "Geschlossen",
                      selectedFeature.closed ? "Ja" : "Nein",
                    ],
                    [
                      "Stützpunkte",
                      String(selectedFeature.pts?.length || 0),
                    ],
                    [
                      "Länge",
                      `${formatNumber(
                        Number(selectedFeature.length || 0)
                      )} m`,
                    ],
                    [
                      "Fläche",
                      `${formatNumber(
                        Number(selectedFeature.area || 0)
                      )} m²`,
                    ],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "100px 1fr",
                        gap: 8,
                        paddingBottom: 8,
                        borderBottom: `1px solid ${ui.border}`,
                        fontSize: 12,
                      }}
                    >
                      <div style={{ color: ui.sub }}>{label}</div>
                      <div
                        style={{
                          color: ui.text,
                          fontWeight: 800,
                          wordBreak: "break-word",
                        }}
                      >
                        {value}
                      </div>
                    </div>
                  ))}

                  <Btn onClick={zoomToSelection} primary>
                    Objekt anzeigen
                  </Btn>

                  {selectedFeature.meta ? (
                    <details>
                      <summary
                        style={{
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 850,
                          color: ui.sub,
                        }}
                      >
                        Metadaten
                      </summary>
                      <pre
                        style={{
                          marginTop: 8,
                          maxHeight: 180,
                          overflow: "auto",
                          borderRadius: 8,
                          padding: 9,
                          background: "#111827",
                          color: "#d1d5db",
                          fontSize: 10,
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {JSON.stringify(selectedFeature.meta, null, 2)}
                      </pre>
                    </details>
                  ) : null}
                </div>
              )}

              <div
                style={{
                  marginTop: 16,
                  paddingTop: 12,
                  borderTop: `1px solid ${ui.border}`,
                }}
              >
                <div
                  style={{
                    marginBottom: 8,
                    fontSize: 12,
                    fontWeight: 900,
                  }}
                >
                  Server / Dateien
                </div>
                <div style={{ display: "grid", gap: 7 }}>
                  <Btn onClick={loadPaths}>Pfade prüfen</Btn>
                  <Btn onClick={reloadSnapshot}>Snapshot aktualisieren</Btn>
                </div>
                {paths ? (
                  <div
                    style={{
                      marginTop: 10,
                      fontSize: 10,
                      color: ui.sub,
                      lineHeight: 1.45,
                      wordBreak: "break-all",
                    }}
                  >
                    <div>
                      <b>Takeoff:</b> {paths.takeoffJsonPath}
                    </div>
                    <div>
                      <b>UTM:</b> {paths.utmCsvPath}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : rightTab === "aufmass" ? (
            <div style={{ padding: 12, display: "grid", gap: 10 }}>
              <div style={{ fontSize: 12, color: ui.sub, lineHeight: 1.5 }}>
                Ausgewähltes CAD-Objekt direkt als Aufmaßzeile speichern.
              </div>
              <Input
                value={pos}
                onChange={(e) => setPos(e.target.value)}
                placeholder="LV-Position"
              />
              <Input
                value={kurz}
                onChange={(e) => setKurz(e.target.value)}
                placeholder="Kurztext"
              />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                }}
              >
                <Select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as any)}
                >
                  <option value="m">m</option>
                  <option value="m2">m²</option>
                  <option value="Stk">Stk</option>
                </Select>
                <Input
                  value={String(factor)}
                  onChange={(e) =>
                    setFactor(clamp(Number(e.target.value) || 1, 0.0001, 1e9))
                  }
                  inputMode="decimal"
                  placeholder="Faktor"
                />
              </div>

              <div
                style={{
                  borderRadius: 10,
                  padding: 12,
                  background: ui.panel2,
                  border: `1px solid ${ui.border}`,
                }}
              >
                <div style={{ fontSize: 11, color: ui.sub }}>
                  Menge
                </div>
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 20,
                    fontWeight: 950,
                    color: ui.accent,
                  }}
                >
                  {formatNumber(qtyPreview)} {uiUnitLabel(unit)}
                </div>
              </div>

              <Btn
                primary
                onClick={() => void pushToAufmass()}
                disabled={!selectedFeature || !pos.trim() || !projectId}
                style={{ height: 46 }}
              >
                In Aufmaß übernehmen
              </Btn>

              <div style={{ fontSize: 11, color: ui.sub }}>
                Speicherung erfolgt serverseitig über den Aufmaß-Endpunkt.
              </div>
            </div>
          ) : (
            <div style={{ padding: 12, display: "grid", gap: 10 }}>
              <div style={{ fontSize: 12, color: ui.sub, lineHeight: 1.5 }}>
                Layer und Objektname werden mit dem Projekt-LV verglichen.
              </div>

              <Select
                value={kiSelectedKey}
                onChange={(e) => setKiSelectedKey(e.target.value)}
                disabled={!kiRows.length}
              >
                {!kiRows.length ? (
                  <option value="">Keine KI-Gruppen</option>
                ) : (
                  kiRows.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.layerGroup} · {formatNumber(r.qty)}{" "}
                      {uiUnitLabel(r.unit)}
                    </option>
                  ))
                )}
              </Select>

              <div
                style={{
                  borderRadius: 10,
                  border: `1px solid ${ui.border}`,
                  background: ui.panel2,
                  padding: 10,
                  fontSize: 11,
                  lineHeight: 1.55,
                }}
              >
                <div>
                  Gruppe: <b>{kiSelected?.layerGroup || "—"}</b>
                </div>
                <div>
                  Menge:{" "}
                  <b>
                    {formatNumber(Number(kiSelected?.qty || 0))}{" "}
                    {uiUnitLabel(kiSelected?.unit || "m")}
                  </b>
                </div>
                <div>
                  Sicherheit:{" "}
                  <b>
                    {kiSelected
                      ? `${Math.round(kiSelected.confidenceA * 100)} %`
                      : "—"}
                  </b>
                </div>
              </div>

              <div style={{ fontSize: 11, fontWeight: 900 }}>
                LV-Vorschläge
              </div>
              <div
                style={{
                  maxHeight: 170,
                  overflow: "auto",
                  border: `1px solid ${ui.border}`,
                  borderRadius: 9,
                }}
              >
                {lvSuggestions.map((s) => (
                  <button
                    key={s.pos}
                    type="button"
                    onClick={() => setChosenLvPos(s.pos)}
                    style={{
                      width: "100%",
                      padding: "8px 9px",
                      border: 0,
                      borderBottom: `1px solid ${ui.border}`,
                      background:
                        chosenLvPos === s.pos ? ui.accentSoft : ui.panel,
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                        fontSize: 11,
                      }}
                    >
                      <b>{s.pos}</b>
                      <span style={{ color: ui.sub }}>
                        {Math.round(s.score * 100)} %
                      </span>
                    </div>
                    <div
                      style={{
                        marginTop: 3,
                        fontSize: 10,
                        color: ui.sub,
                        lineHeight: 1.35,
                      }}
                    >
                      {s.text}
                    </div>
                  </button>
                ))}
                {!lvSuggestions.length ? (
                  <div
                    style={{
                      padding: 10,
                      fontSize: 11,
                      color: ui.sub,
                    }}
                  >
                    {lvState === "loading"
                      ? "LV wird geladen…"
                      : "Keine passenden Positionen."}
                  </div>
                ) : null}
              </div>

              <Input
                value={kiPos}
                onChange={(e) => setKiPos(e.target.value)}
                placeholder="LV-Position"
              />
              <Input
                value={kiText}
                onChange={(e) => setKiText(e.target.value)}
                placeholder="Text"
              />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                }}
              >
                <Select
                  value={kiUnit}
                  onChange={(e) => setKiUnit(e.target.value as any)}
                >
                  <option value="m">m</option>
                  <option value="m2">m²</option>
                  <option value="Stk">Stk</option>
                </Select>
                <Input
                  value={String(kiFactor)}
                  onChange={(e) =>
                    setKiFactor(
                      clamp(Number(e.target.value) || 1, 0.0001, 1e9)
                    )
                  }
                />
              </div>

              <div style={{ fontSize: 12 }}>
                Vorschau:{" "}
                <b>
                  {formatNumber(kiQtyPreview)} {uiUnitLabel(kiUnit)}
                </b>
              </div>

              <Btn
                primary
                disabled={!projectId || !kiSelected}
                onClick={() =>
                  void pushToAufmass({
                    pos: kiPos,
                    text: kiText,
                    unit: kiUnit,
                    qty: kiQtyPreview,
                  })
                }
                style={{ height: 46 }}
              >
                KI-Ergebnis übernehmen
              </Btn>
            </div>
          )}
        </Card>
      </div>

      {/* Secondary panels */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.2fr 1fr",
          gap: 10,
          marginTop: 10,
        }}
      >
        <Card
          title="BricsCAD Snapshot"
          subtitle="/api/bricscad/snapshot"
          action={<Btn onClick={reloadSnapshot}>Neu laden</Btn>}
        >
          <div
            style={{
              height: 280,
              display: "grid",
              placeItems: "center",
              background: "#f8fafc",
              overflow: "hidden",
            }}
          >
            {!projectId ? (
              <div style={{ color: ui.sub, fontSize: 12 }}>
                Kein Projekt gesetzt.
              </div>
            ) : snapshotErr ? (
              <div
                style={{
                  padding: 20,
                  maxWidth: 520,
                  textAlign: "center",
                  color: ui.danger,
                  fontSize: 12,
                  lineHeight: 1.5,
                }}
              >
                {snapshotErr}
              </div>
            ) : (
              <img
                src={snapshotUrl}
                alt="BricsCAD Snapshot"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                }}
                onLoad={() => setSnapshotErr("")}
                onError={() =>
                  setSnapshotErr(
                    "Snapshot nicht verfügbar. Prüfe snapshot.png und den Server-Endpunkt."
                  )
                }
              />
            )}
          </div>
        </Card>

        <Card
          title="Mengenübersicht"
          subtitle="Summen der sichtbaren CAD-Objekte"
        >
          <div style={{ padding: 12 }}>
            {Array.from(
              visibleFeatures.reduce((map, f) => {
                const layer = String(f.layer || "0");
                const row =
                  map.get(layer) || {
                    layer,
                    count: 0,
                    length: 0,
                    area: 0,
                  };
                row.count += 1;
                row.length += Number(f.length || 0);
                row.area += Number(f.area || 0);
                map.set(layer, row);
                return map;
              }, new Map<string, { layer: string; count: number; length: number; area: number }>())
            )
              .map(([, row]) => row)
              .sort((a, b) => a.layer.localeCompare(b.layer, "de"))
              .map((row) => (
                <div
                  key={row.layer}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 70px 100px 100px",
                    gap: 8,
                    minHeight: 34,
                    alignItems: "center",
                    borderBottom: `1px solid ${ui.border}`,
                    fontSize: 11,
                  }}
                >
                  <div style={{ fontWeight: 850 }}>{row.layer}</div>
                  <div style={{ color: ui.sub }}>{row.count} Obj.</div>
                  <div style={{ textAlign: "right" }}>
                    {formatNumber(row.length)} m
                  </div>
                  <div style={{ textAlign: "right" }}>
                    {formatNumber(row.area)} m²
                  </div>
                </div>
              ))}
            {!visibleFeatures.length ? (
              <div style={{ color: ui.sub, fontSize: 12 }}>
                Keine sichtbaren Objekte.
              </div>
            ) : null}
          </div>
        </Card>
      </div>

      <div
        style={{
          marginTop: 10,
          minHeight: 40,
          borderRadius: 12,
          border: `1px solid ${ui.border}`,
          background: ui.panel,
          boxShadow: ui.shadow,
          padding: "0 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
          fontSize: 11,
          color: ui.sub,
        }}
      >
        <div>
          Projekt: <b style={{ color: ui.text }}>{projectId || "—"}</b>
        </div>
        <div>
          LV:{" "}
          <b style={{ color: ui.text }}>
            {lvState === "ok"
              ? `${lvPositions.length} Positionen`
              : lvState}
          </b>
        </div>
        <div>
          Takeoff:{" "}
          <b style={{ color: ui.text }}>
            {takeoff ? `${features.length} Objekte` : "nicht geladen"}
          </b>
        </div>
        <div>
          Serverstatus: <b style={{ color: ui.text }}>{status}</b>
        </div>
        <div title="Tastaturkürzel">
          Kürzel: <b style={{ color: ui.text }}>F</b> Fit · <b style={{ color: ui.text }}>S</b> Auswahl · <b style={{ color: ui.text }}>P</b> Pan · <b style={{ color: ui.text }}>M</b> Strecke · <b style={{ color: ui.text }}>A</b> Fläche · <b style={{ color: ui.text }}>Ctrl+A</b> Alle
        </div>
      </div>
    </div>
  );
}
