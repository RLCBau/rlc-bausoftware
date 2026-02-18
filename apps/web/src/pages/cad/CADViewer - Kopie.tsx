// apps/web/src/pages/cad/CADViewer.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useProject } from "../../store/useProject";

const API =
  (import.meta as any)?.env?.VITE_API_URL ||
  (import.meta as any)?.env?.VITE_BACKEND_URL ||
  "http://localhost:4000";

/** ================== Types ================== */
type V2 = { x: number; y: number };

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
    snapshotPngPath?: string; // ✅ NEW (server paths endpoint may include it)
  };
  message?: string;
};

type UTMPoint = { id: string; x: number; y: number; label?: string };

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
  score: number; // 0..1
};

/** ================== Small UI ================== */
const ui = {
  bg: "#f3f4f6",
  panel: "#ffffff",
  border: "#e5e7eb",
  text: "#111827",
  sub: "#6b7280",
  shadow: "0 10px 24px rgba(17,24,39,0.08)",
  radius: 14,
  accent: "#111827",
  warn: "#b91c1c",
};

function Btn({
  children,
  onClick,
  title,
  disabled,
  style,
  primary,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
  primary?: boolean;
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
        borderRadius: 12,
        border: `1px solid ${ui.border}`,
        background: disabled ? "#f9fafb" : primary ? ui.accent : ui.panel,
        color: disabled ? ui.sub : primary ? "#fff" : ui.text,
        fontSize: 13,
        fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function Card({
  title,
  subtitle,
  children,
  big,
  style,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  big?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        border: `1px solid ${ui.border}`,
        borderRadius: 16,
        padding: big ? 16 : 14,
        background: ui.panel,
        boxShadow: ui.shadow,
        ...style,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div
          style={{
            fontWeight: 950,
            color: ui.text,
            letterSpacing: 0.2,
            fontSize: big ? 15 : 14,
          }}
        >
          {title}
        </div>
        {subtitle ? (
          <div style={{ fontSize: 12, color: ui.sub, marginTop: 2 }}>
            {subtitle}
          </div>
        ) : null}
      </div>
      <div style={{ marginTop: 12 }}>{children}</div>
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        width: "100%",
        height: 36,
        borderRadius: 12,
        border: `1px solid ${ui.border}`,
        padding: "0 12px",
        fontSize: 13,
        outline: "none",
        background: ui.panel,
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
        borderRadius: 12,
        border: `1px solid ${ui.border}`,
        padding: "0 10px",
        fontSize: 13,
        outline: "none",
        background: ui.panel,
        ...(props.style || {}),
      }}
    />
  );
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function dist(a: V2, b: V2) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function polylineLength(pts: V2[]) {
  let s = 0;
  for (let i = 0; i < pts.length - 1; i++) s += dist(pts[i], pts[i + 1]);
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

/** CSV parser minimal (server already provides utm.csv) */
function parseUtmCsvFlexible(text: string): UTMPoint[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  if (!lines.length) return [];

  const first = lines[0];
  const delimiter = first.includes(";") ? ";" : first.includes("\t") ? "\t" : ",";

  const maybeHeader = first.toLowerCase();
  const hasHeader =
    maybeHeader.includes("east") ||
    maybeHeader.includes("rechts") ||
    maybeHeader.includes("x") ||
    maybeHeader.includes("north") ||
    maybeHeader.includes("hoch") ||
    maybeHeader.includes("y");

  const pts: UTMPoint[] = [];

  if (hasHeader) {
    const header = first.split(delimiter).map((x) => x.trim().toLowerCase());
    const eIdx =
      header.findIndex((h) =>
        ["e", "east", "easting", "rechtswert", "x"].includes(h)
      ) ?? -1;
    const nIdx =
      header.findIndex((h) =>
        ["n", "north", "northing", "hochwert", "y"].includes(h)
      ) ?? -1;
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
    const n2 = c.length >= 3 ? Number(String(c[2]).replace(",", ".")) : NaN;

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

/** ===== LV helper ===== */
async function fetchJson(url: string) {
  const res = await fetch(url);
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
    text: String(x.text ?? x.kurztext ?? x.title ?? x.langtext ?? "ohne Text"),
    unit: String(x.unit ?? x.einheit ?? x.me ?? "m"),
    quantity: Number(x.soll ?? x.menge ?? x.quantity ?? x.qty ?? 0),
    ep: Number(x.ep ?? x.einheitspreis ?? x.price ?? x.unitPrice ?? 0),
  }));
}

function extractLvListFromNewEndpoint(data: any): any[] {
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const latest = rows[0];
  const positions = Array.isArray(latest?.positions) ? latest.positions : [];
  return positions;
}

function extractLvListFromOldEndpoint(data: any): any[] {
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.lv)) return data.lv;
  if (Array.isArray(data)) return data;
  return [];
}

/** ===== KI helpers ===== */
function normText(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/[_\-./\\]+/g, " ")
    .replace(/[^a-z0-9äöüß\s]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string) {
  const t = normText(s).split(" ").filter(Boolean);
  return t.filter((x) => x.length >= 3);
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

  const base = hit / q.length;
  const bonus = Math.min(0.25, substr * 0.05);
  return clamp(base + bonus, 0, 1);
}

function pickLayerGroup(layer?: string) {
  const s = String(layer || "").trim();
  if (!s) return "—";
  const n = normText(s);
  const t = n.split(" ").filter(Boolean);
  if (!t.length) return s;
  return t.slice(0, Math.min(2, t.length)).join(" ");
}

function uiUnitLabel(u: string) {
  return u === "m2" ? "m²" : u;
}

/** ================== Component ================== */
export default function CADViewer() {
  const ctx: any = useProject();
  const current = ctx?.currentProject || null;

  const autoProjectId = (current?.code || "").trim();

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

  useEffect(() => {
    if (autoProjectId && autoProjectId !== projectId) setProjectId(autoProjectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoProjectId]);

  const [status, setStatus] = useState<string>("Bereit");
  const [paths, setPaths] = useState<PathsResponse["paths"] | null>(null);

  const [utmCsv, setUtmCsv] = useState<string>("");
  const [utmPoints, setUtmPoints] = useState<UTMPoint[]>([]);

  const [takeoff, setTakeoff] = useState<TakeoffPayload | null>(null);
  const [features, setFeatures] = useState<TakeoffFeature[]>([]);
  const [selectedFeatureId, setSelectedFeatureId] = useState<string>("");

  // Snapshot
  const [snapshotTick, setSnapshotTick] = useState<number>(0);
  const [snapshotErr, setSnapshotErr] = useState<string>(""); // show friendly message

  const selectedFeature = useMemo(
    () => features.find((f) => (f.id || "") === selectedFeatureId) || null,
    [features, selectedFeatureId]
  );

  // Aufmaß mapping manual
  const [pos, setPos] = useState<string>("001");
  const [kurz, setKurz] = useState<string>("BricsCAD Takeoff");
  const [unit, setUnit] = useState<"m" | "m2" | "Stk">("m");
  const [factor, setFactor] = useState<number>(1);

  // LV for KI Step B
  const [lvPositions, setLvPositions] = useState<LvPosition[]>([]);
  const [lvState, setLvState] = useState<"idle" | "loading" | "ok" | "error">(
    "idle"
  );

  // KI UI
  const [kiSelectedKey, setKiSelectedKey] = useState<string>("");
  const [chosenLvPos, setChosenLvPos] = useState<string>("");

  // KI overrides
  const [kiPos, setKiPos] = useState<string>("001");
  const [kiText, setKiText] = useState<string>("KI: —");
  const [kiUnit, setKiUnit] = useState<"m" | "m2" | "Stk">("m");
  const [kiFactor, setKiFactor] = useState<number>(1);

  const TAKEOFF_CACHE_KEY = useMemo(() => {
    const pid = (projectId || "").trim();
    return pid ? `RLC_TAKEOFF_CACHE_${pid}` : "";
  }, [projectId]);

  const saveProjectIdToLS = () => {
    const v = projectId.trim();
    localStorage.setItem("rlc_projectId", v);
    setStatus("Projekt gesetzt");
    alert("Projekt gesetzt: " + (v || "-"));
  };

  const normalizeFeatures = (payload: TakeoffPayload): TakeoffFeature[] => {
    const feats: TakeoffFeature[] = Array.isArray((payload as any)?.normalized?.features)
      ? (payload as any).normalized.features
      : Array.isArray(payload?.features)
      ? payload.features
      : Array.isArray(payload?.data?.features)
      ? payload.data.features
      : [];

    return feats.map((f, idx) => {
      const id = (f.id || f.name || `F_${idx + 1}`).toString();
      const pts = Array.isArray(f.pts) ? f.pts : [];
      const length =
        typeof f.length === "number"
          ? f.length
          : pts.length >= 2
          ? polylineLength(pts)
          : 0;
      const area =
        typeof f.area === "number"
          ? f.area
          : (f.kind === "polygon" || f.closed) && pts.length >= 3
          ? polyArea(pts)
          : 0;

      return { ...f, id, pts, length, area };
    });
  };

  /** ===== Restore Takeoff cache on mount / project change ===== */
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
      setStatus(`Takeoff aus Cache (${feats.length} Features)`);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [TAKEOFF_CACHE_KEY]);

  /** ===== Load LV list for Step B ===== */
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
            `${API}/api/projects/${encodeURIComponent(
              projectDbId
            )}/lv?page=1&pageSize=200`
          );
          const list = extractLvListFromNewEndpoint(data);
          const mapped = mapAnyToLvPositions(list);
          if (!cancelled) {
            setLvPositions(mapped);
            setLvState("ok");
          }
          return;
        } catch {
          // fallback legacy
        }

        const legacy = await fetchJson(
          `${API}/api/project-lv/${encodeURIComponent(projectDbId)}`
        );
        const listLegacy = extractLvListFromOldEndpoint(legacy);
        const mappedLegacy = mapAnyToLvPositions(listLegacy);
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

    load();
    return () => {
      cancelled = true;
    };
  }, [current?.id]);

  const loadPaths = async () => {
    if (!projectId) return alert("Kein Projekt gewählt (projectId).");
    setStatus("Paths laden...");
    try {
      const res = await fetch(
        `${API}/api/bricscad/paths?projectId=${encodeURIComponent(projectId)}`
      );
      const j = (await res.json().catch(() => null)) as PathsResponse | null;
      if (!res.ok || !j?.ok) {
        setStatus("Paths Fehler");
        return alert(j?.message || "Paths laden fehlgeschlagen.");
      }
      setPaths(j.paths || null);
      setStatus("Paths geladen");
    } catch (e: any) {
      setStatus("Paths Fehler");
      alert(String(e?.message || e));
    }
  };

  const loadUtm = async () => {
    if (!projectId) return alert("Kein Projekt gewählt (projectId).");
    setStatus("UTM laden...");
    try {
      const res = await fetch(
        `${API}/api/bricscad/utm?projectId=${encodeURIComponent(projectId)}`
      );
      const j = (await res.json().catch(() => null)) as any;
      if (!res.ok || !j?.ok) {
        setStatus("UTM Fehler");
        return alert(j?.message || "UTM laden fehlgeschlagen.");
      }
      const csv = String(j.csv || "");
      setUtmCsv(csv);
      const pts = parseUtmCsvFlexible(csv);
      setUtmPoints(pts);
      setStatus(`UTM geladen (${pts.length} Punkte)`);
    } catch (e: any) {
      setStatus("UTM Fehler");
      alert(String(e?.message || e));
    }
  };

  const reloadSnapshot = () => {
    setSnapshotErr("");
    setSnapshotTick(Date.now()); // ✅ real cache buster
    setStatus("Snapshot reload");
  };

  const loadTakeoff = async () => {
    if (!projectId) return alert("Kein Projekt gewählt (projectId).");
    setStatus("Takeoff laden...");
    try {
      const res = await fetch(
        `${API}/api/bricscad/takeoff?projectId=${encodeURIComponent(projectId)}`
      );
      const j = (await res.json().catch(() => null)) as any;
      if (!res.ok || !j?.ok) {
        setStatus("Takeoff Fehler");
        return alert(j?.message || "Takeoff laden fehlgeschlagen.");
      }

      const payload = (j.data || j) as TakeoffPayload;
      setTakeoff(payload);

      const feats = normalizeFeatures(payload);
      setFeatures(feats);
      setSelectedFeatureId(feats[0]?.id || "");
      setStatus(`Takeoff geladen (${feats.length} Features)`);

      if (TAKEOFF_CACHE_KEY) {
        localStorage.setItem(
          TAKEOFF_CACHE_KEY,
          JSON.stringify({ ts: Date.now(), payload })
        );
      }

      // ✅ convenience: after takeoff load, refresh snapshot too
      reloadSnapshot();
    } catch (e: any) {
      setStatus("Takeoff Fehler");
      alert(String(e?.message || e));
    }
  };

  const openBricsCAD = async () => {
    if (!projectId) return alert("Kein Projekt gewählt (projectId).");
    setStatus("BricsCAD öffnen...");
    try {
      const res = await fetch(
        `${API}/api/bricscad/open?projectId=${encodeURIComponent(projectId)}`
      );
      const txt = await res.text().catch(() => "");
      let j: any = null;
      try {
        j = txt ? JSON.parse(txt) : null;
      } catch {
        j = null;
      }

      if (!res.ok || (j && j.ok === false)) {
        setStatus("BricsCAD open nicht verfügbar");
        alert(
          (j?.message ||
            "Server-Endpoint /api/bricscad/open ist nicht verfügbar.") as string
        );
        return;
      }

      setStatus("BricsCAD gestartet");
      alert("BricsCAD gestartet (wenn Server/OS Route unterstützt).");
    } catch (e: any) {
      setStatus("BricsCAD open Fehler");
      alert(String(e?.message || e));
    }
  };

  const qtyPreview = useMemo(() => {
    if (!selectedFeature) return 0;
    const pts = Array.isArray(selectedFeature.pts) ? selectedFeature.pts : [];
    const length =
      selectedFeature.length ??
      (pts.length >= 2 ? polylineLength(pts) : 0);
    const area =
      selectedFeature.area ??
      ((selectedFeature.kind === "polygon" || selectedFeature.closed) &&
      pts.length >= 3
        ? polyArea(pts)
        : 0);

    const base = unit === "m" ? length : unit === "m2" ? area : 1;
    const f = Number.isFinite(factor) ? factor : 1;
    return base * f;
  }, [selectedFeature, unit, factor]);

  const pushToAufmass = async (override?: {
    pos?: string;
    text?: string;
    unit?: any;
    qty?: number;
  }) => {
    if (!projectId) return alert("Kein Projekt gewählt (projectId).");

    const finalPos = String(override?.pos ?? pos).trim();
    if (!finalPos) return alert("Positionsnummer fehlt.");

    if (!selectedFeature && typeof override?.qty !== "number") {
      return alert("Keine Takeoff-Feature ausgewählt.");
    }

    const length = selectedFeature?.length ?? 0;
    const area = selectedFeature?.area ?? 0;

    const qtyBase =
      typeof override?.qty === "number"
        ? override.qty
        : unit === "m"
        ? length
        : unit === "m2"
        ? area
        : 1;

    const f = Number.isFinite(factor) ? factor : 1;
    const finalUnit = (override?.unit ?? unit) as "m" | "m2" | "Stk";
    const finalText = String(
      override?.text ?? kurz ?? "BricsCAD Takeoff"
    ).trim();

    const row = {
      pos: finalPos,
      text: finalText,
      unit: finalUnit,
      qty: qtyBase * (typeof override?.qty === "number" ? 1 : f),
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
        factor: f,
        ki: !!override,
      },
    };

    const tryPost = async (url: string, body: any) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const txt = await res.text().catch(() => "");
      let j: any = null;
      try {
        j = txt ? JSON.parse(txt) : null;
      } catch {
        j = null;
      }

      const ok =
        res.ok &&
        (j?.ok === true ||
          j?.success === true ||
          j?.status === "ok" ||
          j === null);
      return { ok, res, j, txt };
    };

    setStatus("Übernahme → Aufmaß...");

    const attempts: Array<() => Promise<any>> = [
      () => tryPost(`${API}/api/aufmass/add-from-cad`, { projectId, row }),
      () =>
        tryPost(
          `${API}/api/aufmass/soll-ist/${encodeURIComponent(projectId)}/append`,
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
    ];

    for (const run of attempts) {
      try {
        const r = await run();
        if (r.ok) {
          setStatus("In Aufmaß übernommen");
          alert("Takeoff in Aufmaß übernommen.");
          return;
        }
      } catch {
        // ignore and try next
      }
    }

    setStatus("Übernahme fehlgeschlagen");
    alert(
      "Übernahme fehlgeschlagen.\n\n" +
        "Server-Route stimmt nicht oder Payload passt nicht.\n" +
        "Nächster Schritt: Server-Log prüfen (Terminal) oder mir die route /api/aufmass.* schicken."
    );
  };

  /** Snapshot URL (✅ stable, refreshable) */
  const snapshotUrl = useMemo(() => {
    if (!projectId) return "";
    const tick = snapshotTick || 0;
    return `${API}/api/bricscad/snapshot?projectId=${encodeURIComponent(
      projectId
    )}&t=${tick}`;
  }, [projectId, snapshotTick]);

  const featureOptions = useMemo(() => {
    return features.map((f) => {
      const labelParts = [
        f.id || "",
        f.layer ? `(${f.layer})` : "",
        f.kind ? `• ${f.kind}` : "",
        typeof f.length === "number" && f.length > 0
          ? `• L ${f.length.toFixed(2)} m`
          : "",
        typeof f.area === "number" && f.area > 0
          ? `• A ${f.area.toFixed(2)} m²`
          : "",
      ].filter(Boolean);
      return { id: (f.id || "").toString(), label: labelParts.join(" ") };
    });
  }, [features]);

  /** ================== KI Step A (group) ================== */
  const kiRows: KiRow[] = useMemo(() => {
    if (!features.length) return [];

    const list: KiRow[] = [];
    const map = new Map<string, KiRow>();

    for (const f of features) {
      const lg = pickLayerGroup(f.layer);
      const lvPosGuess =
        String((f as any)?.meta?.lvPos ?? pos ?? "001").trim().toString() || "001";

      const inferredUnit: "m" | "m2" | "Stk" =
        typeof f.area === "number" && f.area > 0 ? "m2" : "m";

      const qty =
        inferredUnit === "m2" ? Number(f.area || 0) : Number(f.length || 0);

      const key = `${lvPosGuess}__${lg}__${inferredUnit}`;

      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          key,
          lvPos: lvPosGuess,
          layerGroup: lg,
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

    map.forEach((v) => list.push(v));
    list.sort((a, b) => b.qty - a.qty);

    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [features]);

  useEffect(() => {
    if (!kiRows.length) return;
    if (!kiSelectedKey) setKiSelectedKey(kiRows[0].key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kiRows.length]);

  const kiSelected = useMemo(
    () => kiRows.find((r) => r.key === kiSelectedKey) || null,
    [kiRows, kiSelectedKey]
  );

  /** ================== KI Step B (LV mapping suggestions) ================== */
  const lvSuggestions: LvSuggestion[] = useMemo(() => {
    if (!kiSelected) return [];
    if (!lvPositions.length) return [];

    const query = `${kiSelected.layerGroup} ${
      kiSelected.exampleLayer || ""
    } ${kiSelected.exampleName || ""}`;

    const scored = lvPositions
      .map((p) => {
        const s = Math.max(
          scoreMatch(query, `${p.pos} ${p.text}`),
          scoreMatch(kiSelected.layerGroup, p.text),
          scoreMatch(kiSelected.exampleLayer || "", p.text)
        );
        return { pos: p.pos, text: p.text, unit: p.unit, score: s };
      })
      .filter((x) => x.score > 0.18)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    return scored;
  }, [kiSelected, lvPositions]);

  useEffect(() => {
    setChosenLvPos("");
  }, [kiSelectedKey]);

  useEffect(() => {
    if (!kiSelected) return;

    const chosen = chosenLvPos
      ? lvSuggestions.find((s) => s.pos === chosenLvPos)
      : null;

    let finalPos = kiSelected.lvPos;
    let finalText = `KI: ${kiSelected.layerGroup}`;
    let finalUnit: "m" | "m2" | "Stk" = kiSelected.unit;

    if (chosen) {
      finalPos = chosen.pos;
      finalText = chosen.text;
      const u = String(chosen.unit || "").toLowerCase();
      if (u.includes("m2") || u.includes("m²")) finalUnit = "m2";
      else if (u.includes("stk") || u.includes("st")) finalUnit = "Stk";
      else finalUnit = "m";
    }

    setKiPos(finalPos || "001");
    setKiText(finalText || "KI: —");
    setKiUnit(finalUnit);
    setKiFactor(1);
  }, [kiSelectedKey, chosenLvPos, lvSuggestions, kiSelected]);

  const kiQtyPreview = useMemo(() => {
    if (!kiSelected) return 0;
    const f = Number.isFinite(kiFactor) ? kiFactor : 1;
    return Number(kiSelected.qty || 0) * f;
  }, [kiSelected, kiFactor]);

  const kiApply = async () => {
    if (!kiSelected) return;

    const finalPos = String(kiPos || kiSelected.lvPos || "001").trim() || "001";
    const finalText = String(kiText || `KI: ${kiSelected.layerGroup}`).trim();
    const finalUnit: any = kiUnit || kiSelected.unit;

    const qty = kiQtyPreview;

    await pushToAufmass({
      pos: finalPos,
      text: finalText,
      unit: finalUnit,
      qty,
    });
  };

  const hints = useMemo(() => {
    const lines: string[] = [];
    lines.push("Takeoff bleibt im Cache (auch nach Seitenwechsel).");
    lines.push("KI Step A: Gruppierung nach Pos + Layer-Gruppe + Einheit.");
    lines.push("KI Step B: Vorschläge aus Projekt-LV (falls LV geladen werden kann).");
    lines.push("projectId = Ordnername unter data/projects/ (z.B. BA-2025-DEMO).");
    return lines;
  }, []);

  // Ensure we have a first snapshot attempt when project is set
  useEffect(() => {
    if (!projectId) return;
    reloadSnapshot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  return (
    <div style={{ padding: 14, background: ui.bg, minHeight: "calc(100vh - 120px)" }}>
      <div style={{ display: "grid", gap: 14, alignItems: "start" }}>
        {/* ROW 1: Projekt + Snapshot (same height) */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 14,
            alignItems: "stretch", // ✅ equal height
          }}
        >
          <Card
            title="Projekt"
            subtitle="BricsCAD-Dateipfade basieren auf projectId (= Projektcode)"
            big
            style={{ height: "100%", display: "flex", flexDirection: "column" }}
          >
            <div style={{ display: "grid", gap: 10, height: "100%" }}>
              <div style={{ fontSize: 12, color: ui.sub, lineHeight: 1.45 }}>
                Aktuell gewählt:{" "}
                <b style={{ color: ui.text }}>
                  {current ? `${current.code} – ${current.name}` : "—"}
                </b>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 10 }}>
                <Input
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  placeholder="z.B. BA-2025-DEMO"
                />
                <Btn onClick={saveProjectIdToLS}>Set</Btn>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Btn onClick={loadPaths} title="Zeigt die erwarteten Pfade am Server">
                  Paths / Debug
                </Btn>
                <Btn onClick={loadUtm}>UTM laden</Btn>
                <Btn onClick={loadTakeoff} primary>
                  Takeoff laden
                </Btn>
                <Btn onClick={openBricsCAD}>BricsCAD öffnen</Btn>
              </div>

              {paths ? (
                <div style={{ fontSize: 12, color: ui.text, lineHeight: 1.45 }}>
                  <div style={{ color: ui.sub, fontWeight: 900, marginBottom: 6 }}>
                    Server erwartet:
                  </div>
                  <div>
                    <b>utm.csv:</b> {paths.utmCsvPath}
                  </div>
                  <div>
                    <b>takeoff.json:</b> {paths.takeoffJsonPath}
                  </div>
                  {paths.snapshotPngPath ? (
                    <div>
                      <b>snapshot.png:</b> {paths.snapshotPngPath}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: ui.sub, lineHeight: 1.45 }}>
                  Tipp: zuerst <b>Paths / Debug</b> klicken → dann siehst du sofort, ob projectId stimmt.
                </div>
              )}

              <div style={{ borderTop: `1px solid ${ui.border}`, paddingTop: 10 }}>
                <div style={{ fontSize: 12, color: ui.sub, fontWeight: 900, marginBottom: 6 }}>
                  Hinweise
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: ui.sub, lineHeight: 1.5 }}>
                  {hints.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </div>

              <div style={{ fontSize: 12, color: ui.sub }}>
                LV-Status (für KI Step B):{" "}
                <b style={{ color: ui.text }}>
                  {lvState === "loading"
                    ? "lädt…"
                    : lvState === "ok"
                    ? `${lvPositions.length} Positionen`
                    : lvState === "error"
                    ? "Fehler"
                    : "—"}
                </b>
              </div>
            </div>
          </Card>

          <Card
            title="BricsCAD Snapshot"
            subtitle="Server: /api/bricscad/snapshot"
            big
            style={{ height: "100%", display: "flex", flexDirection: "column" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 12, color: ui.sub, lineHeight: 1.45 }}>
                Vorschau von <b>snapshot.png</b> (aus BricsCAD exportiert).
              </div>
              <Btn onClick={reloadSnapshot} disabled={!projectId} title="Cache-Busting Reload">
                Reload
              </Btn>
            </div>

            <div
              style={{
                marginTop: 10,
                borderRadius: 14,
                border: `1px solid ${ui.border}`,
                overflow: "hidden",
                background: "#f9fafb",
                flex: 1, // ✅ fill card
                minHeight: 260,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
              }}
            >
              {!projectId ? (
                <div style={{ color: ui.sub, fontSize: 12 }}>Kein Projekt gesetzt.</div>
              ) : snapshotErr ? (
                <div style={{ padding: 14, textAlign: "center" }}>
                  <div style={{ fontSize: 12, color: ui.warn, fontWeight: 950 }}>
                    Snapshot nicht verfügbar
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, color: ui.sub, lineHeight: 1.45 }}>
                    {snapshotErr}
                  </div>
                  <div style={{ marginTop: 10, fontSize: 12, color: ui.sub }}>
                    In BricsCAD: <b>„Snapshot: snapshot.png (1 Klick)”</b> ausführen,
                    dann hier Reload.
                  </div>
                </div>
              ) : (
                <img
                  src={snapshotUrl}
                  alt="BricsCAD Snapshot"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain", // ✅ key
                    display: "block",
                  }}
                  onLoad={() => setSnapshotErr("")}
                  onError={() => {
                    setSnapshotErr(
                      "Kein Bild gefunden (404) oder Endpoint fehlt. Prüfe: " +
                        "/api/bricscad/snapshot?projectId=" +
                        projectId +
                        " sowie ob snapshot.png im Projektordner existiert."
                    );
                  }}
                />
              )}
            </div>
          </Card>
        </div>

        {/* ROW 2: Takeoff full width */}
        <Card title="Takeoff" subtitle={features.length ? `${features.length} Features` : "—"} big>
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: 14, alignItems: "start" }}>
              {/* Feature select */}
              <div>
                <div style={{ fontSize: 12, color: ui.sub, fontWeight: 900, marginBottom: 6 }}>
                  Feature auswählen
                </div>
                <Select
                  value={selectedFeatureId}
                  onChange={(e) => setSelectedFeatureId(e.target.value)}
                  disabled={!featureOptions.length}
                >
                  {!featureOptions.length ? (
                    <option value="">— keine Features —</option>
                  ) : (
                    featureOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))
                  )}
                </Select>

                {selectedFeature ? (
                  <div style={{ marginTop: 10, fontSize: 12, color: ui.text, lineHeight: 1.6 }}>
                    <div>
                      <span style={{ color: ui.sub }}>Layer:</span>{" "}
                      <b>{selectedFeature.layer || "-"}</b>
                    </div>
                    <div>
                      <span style={{ color: ui.sub }}>Kind:</span>{" "}
                      <b>{selectedFeature.kind || "-"}</b>
                    </div>
                    <div>
                      <span style={{ color: ui.sub }}>Länge:</span>{" "}
                      <b>{(selectedFeature.length ?? 0).toFixed(3)} m</b>
                    </div>
                    <div>
                      <span style={{ color: ui.sub }}>Fläche:</span>{" "}
                      <b>{(selectedFeature.area ?? 0).toFixed(3)} m²</b>
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 10, fontSize: 12, color: ui.sub }}>
                    Lade Takeoff, dann kannst du Features auswählen.
                  </div>
                )}
              </div>

              {/* Manual push */}
              <div
                style={{
                  border: `1px solid ${ui.border}`,
                  borderRadius: 16,
                  padding: 12,
                  background: "#fff",
                }}
              >
                <div style={{ fontSize: 12, color: ui.sub, fontWeight: 950, marginBottom: 8 }}>
                  Aufmaß-Übernahme (manuell)
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  <Input value={pos} onChange={(e) => setPos(e.target.value)} placeholder="Position (LV)" />
                  <Input value={kurz} onChange={(e) => setKurz(e.target.value)} placeholder="Kurztext" />

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <Select value={unit} onChange={(e) => setUnit(e.target.value as any)}>
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

                  <div style={{ fontSize: 12, color: ui.text }}>
                    Menge (Vorschau): <b>{qtyPreview.toFixed(3)}</b> {uiUnitLabel(unit)}
                  </div>

                  <Btn
                    primary
                    onClick={() => void pushToAufmass()}
                    disabled={!selectedFeature || !pos.trim() || !projectId}
                    style={{ height: 44, justifyContent: "center", fontSize: 13 }}
                  >
                    Auswahl → Aufmaß übernehmen
                  </Btn>

                  <div style={{ fontSize: 12, color: ui.sub, lineHeight: 1.4 }}>
                    Speichert auf dem Server (sichtbar im AufmaßEditor).
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* ROW 3: KI full width — same “size language” as Takeoff + Step B moved BELOW full width */}
        <Card title="KI Vorschläge" subtitle="Step A = Gruppierung • Step B = LV-Mapping" big>
          {!features.length ? (
            <div style={{ marginTop: 6, fontSize: 12, color: ui.sub }}>
              Keine Vorschläge. Lade zuerst <b>Takeoff</b>.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              {/* === Top row: Step A summary (left) + Aufmaß KI (right) — same grid as Takeoff === */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: 14, alignItems: "start" }}>
                {/* Left: Selected info */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 950, color: ui.text }}>
                      Ausgewählt:{" "}
                      <span style={{ color: ui.sub }}>
                        {kiSelected ? kiSelected.lvPos : "—"}
                      </span>{" "}
                      <span style={{ marginLeft: 6, fontWeight: 900 }}>
                        {kiSelected ? kiSelected.layerGroup : "—"}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: ui.sub }}>
                      Confidence A:{" "}
                      <b style={{ color: ui.text }}>
                        {kiSelected ? `${Math.round(kiSelected.confidenceA * 100)}%` : "—"}
                      </b>
                    </div>
                  </div>

                  <div style={{ marginTop: 10, fontSize: 12, color: ui.text, lineHeight: 1.6 }}>
                    <div>
                      Menge:{" "}
                      <b style={{ color: ui.text }}>
                        {kiSelected
                          ? `${kiSelected.qty.toFixed(3)} ${uiUnitLabel(kiSelected.unit)}`
                          : "—"}
                      </b>
                    </div>
                    <div>
                      Beispiel-Layer:{" "}
                      <b style={{ color: ui.text }}>{kiSelected?.exampleLayer || "—"}</b>
                    </div>
                    <div>
                      Beispiel-Name:{" "}
                      <b style={{ color: ui.text }}>{kiSelected?.exampleName || "—"}</b>
                    </div>

                    <div style={{ marginTop: 10, fontSize: 12, color: ui.sub, lineHeight: 1.55 }}>
                      Tipp: Step A ist die Gruppierung. Danach übernimmst du direkt in Aufmaß oder nutzt Step B
                      (unten) für LV-Matching.
                    </div>
                  </div>
                </div>

                {/* Right: KI adjust + Action (stacked, professional spacing) */}
                <div style={{ display: "grid", gap: 12 }}>
                  <div
                    style={{
                      border: `1px solid ${ui.border}`,
                      borderRadius: 16,
                      padding: 12,
                      background: "#fff",
                    }}
                  >
                    <div style={{ fontSize: 12, color: ui.sub, fontWeight: 950, marginBottom: 8 }}>
                      Aufmaß-Übernahme (KI anpassen)
                    </div>

                    <div style={{ display: "grid", gap: 10 }}>
                      <Input
                        value={kiPos}
                        onChange={(e) => setKiPos(e.target.value)}
                        placeholder="Position (LV)"
                      />
                      <Input value={kiText} onChange={(e) => setKiText(e.target.value)} placeholder="Text" />

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <Select value={kiUnit} onChange={(e) => setKiUnit(e.target.value as any)}>
                          <option value="m">m</option>
                          <option value="m2">m²</option>
                          <option value="Stk">Stk</option>
                        </Select>

                        <Input
                          value={String(kiFactor)}
                          onChange={(e) =>
                            setKiFactor(clamp(Number(e.target.value) || 1, 0.0001, 1e9))
                          }
                          inputMode="decimal"
                          placeholder="Faktor"
                        />
                      </div>

                      <div style={{ fontSize: 12, color: ui.text }}>
                        Menge (Vorschau): <b>{kiQtyPreview.toFixed(3)}</b> {uiUnitLabel(kiUnit)}
                      </div>

                      <div style={{ fontSize: 12, color: ui.sub, lineHeight: 1.4 }}>
                        Werte vor dem Speichern korrigieren (Pos, Text, Einheit, Faktor).
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      border: `1px solid ${ui.border}`,
                      borderRadius: 16,
                      padding: 12,
                      background: "#fff",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, color: ui.sub, fontWeight: 950, marginBottom: 8 }}>
                        Aktion
                      </div>
                      <div style={{ fontSize: 12, color: ui.sub, lineHeight: 1.5 }}>
                        Wenn Step B gewählt ist, werden Pos/Text/Einheit automatisch aus dem LV übernommen.
                      </div>
                    </div>

                    <Btn
                      primary
                      onClick={() => void kiApply()}
                      style={{ height: 52, justifyContent: "center", width: "100%", fontSize: 14 }}
                      disabled={!projectId || !kiSelected}
                    >
                      KI → Aufmaß übernehmen
                    </Btn>
                  </div>
                </div>
              </div>

              {/* === Step B FULL WIDTH (moved below, no empty space) === */}
              <div
                style={{
                  border: `1px solid ${ui.border}`,
                  borderRadius: 16,
                  padding: 12,
                  background: "#f9fafb",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 12, fontWeight: 950, color: ui.sub }}>
                    Step B — LV Mapping (Top Vorschläge)
                  </div>
                  <div style={{ fontSize: 12, color: ui.sub }}>
                    LV geladen:{" "}
                    <b style={{ color: ui.text }}>
                      {lvState === "ok" ? lvPositions.length : lvState === "loading" ? "…" : "0"}
                    </b>
                  </div>
                </div>

                <div style={{ marginTop: 10 }}>
                  {lvState !== "ok" ? (
                    <div style={{ fontSize: 12, color: ui.sub, lineHeight: 1.5 }}>
                      LV nicht verfügbar. (Status: <b>{lvState}</b>)
                    </div>
                  ) : lvSuggestions.length === 0 ? (
                    <div style={{ fontSize: 12, color: ui.sub }}>
                      Keine passenden LV-Matches gefunden.
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                        gap: 10,
                      }}
                    >
                      {lvSuggestions.map((s) => {
                        const active = chosenLvPos === s.pos;
                        return (
                          <div
                            key={s.pos}
                            onClick={() => setChosenLvPos(s.pos)}
                            style={{
                              cursor: "pointer",
                              border: `1px solid ${active ? "#93c5fd" : ui.border}`,
                              background: active ? "#eff6ff" : "#fff",
                              borderRadius: 12,
                              padding: "10px 12px",
                              minHeight: 92,
                              display: "flex",
                              flexDirection: "column",
                              justifyContent: "space-between",
                              gap: 8,
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                              <div style={{ fontWeight: 950, color: ui.text }}>{s.pos}</div>
                              <div style={{ fontSize: 12, color: ui.sub }}>
                                Score: <b style={{ color: ui.text }}>{Math.round(s.score * 100)}%</b>
                              </div>
                            </div>
                            <div style={{ fontSize: 12, color: ui.text, lineHeight: 1.35 }}>
                              {s.text}
                            </div>
                            <div style={{ fontSize: 12, color: ui.sub }}>
                              Einheit: <b style={{ color: ui.text }}>{s.unit}</b>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* === Step A list (full width) === */}
              <div
                style={{
                  border: `1px solid ${ui.border}`,
                  borderRadius: 16,
                  overflow: "hidden",
                  background: "#fff",
                }}
              >
                <div
                  style={{
                    padding: "10px 12px",
                    fontSize: 12,
                    fontWeight: 950,
                    color: ui.sub,
                    background: "#f9fafb",
                    borderBottom: `1px solid ${ui.border}`,
                    display: "grid",
                    gridTemplateColumns: "120px 1fr 140px",
                    gap: 10,
                  }}
                >
                  <div>Pos</div>
                  <div>Layer-Gruppe</div>
                  <div style={{ textAlign: "right" }}>Menge</div>
                </div>

                <div style={{ maxHeight: 260, overflow: "auto" }}>
                  {kiRows.map((r) => {
                    const active = r.key === kiSelectedKey;
                    return (
                      <div
                        key={r.key}
                        onClick={() => setKiSelectedKey(r.key)}
                        style={{
                          cursor: "pointer",
                          padding: "10px 12px",
                          borderBottom: `1px solid ${ui.border}`,
                          display: "grid",
                          gridTemplateColumns: "120px 1fr 140px",
                          gap: 10,
                          background: active ? "#eff6ff" : "#fff",
                        }}
                      >
                        <div style={{ fontWeight: 950, color: ui.text }}>{r.lvPos}</div>
                        <div style={{ color: ui.text }}>
                          <div style={{ fontWeight: 900 }}>{r.layerGroup}</div>
                          <div style={{ fontSize: 12, color: ui.sub }}>
                            Einheit: <b>{uiUnitLabel(r.unit)}</b> • Confidence A:{" "}
                            <b>{Math.round(r.confidenceA * 100)}%</b>
                          </div>
                        </div>
                        <div style={{ textAlign: "right", fontWeight: 950, color: ui.text }}>
                          {r.qty.toFixed(3)} {uiUnitLabel(r.unit)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* ROW 4: UTM (optional) */}
        <Card title="UTM Punkte" subtitle={utmPoints.length ? `${utmPoints.length} Punkte` : "—"} big>
          {!utmPoints.length ? (
            <div style={{ fontSize: 12, color: ui.sub }}>
              Keine UTM-Punkte geladen. (Button: <b>UTM laden</b>)
            </div>
          ) : (
            <div
              style={{
                maxHeight: 260,
                overflow: "auto",
                border: `1px solid ${ui.border}`,
                borderRadius: 14,
              }}
            >
              {utmPoints.map((p, i) => (
                <div
                  key={`${p.id}_${i}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: 10,
                    padding: "10px 12px",
                    borderBottom: `1px solid ${ui.border}`,
                    fontSize: 12,
                  }}
                >
                  <div style={{ fontWeight: 950, color: ui.text }}>{p.id}</div>
                  <div style={{ color: ui.sub }}>E {p.x.toFixed(3)}</div>
                  <div style={{ color: ui.sub }}>N {p.y.toFixed(3)}</div>
                </div>
              ))}
            </div>
          )}

          {utmCsv ? (
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: "pointer", fontSize: 12, color: ui.sub, fontWeight: 950 }}>
                CSV anzeigen
              </summary>
              <pre
                style={{
                  marginTop: 10,
                  padding: 12,
                  borderRadius: 14,
                  background: "#0b1220",
                  color: "#e5e7eb",
                  overflow: "auto",
                  fontSize: 12,
                  lineHeight: 1.4,
                }}
              >
                {utmCsv}
              </pre>
            </details>
          ) : null}
        </Card>

        {/* Statusbar */}
        <div
          style={{
            height: 44,
            borderRadius: 14,
            border: `1px solid ${ui.border}`,
            background: "rgba(255,255,255,0.92)",
            boxShadow: ui.shadow,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 14px",
            fontSize: 12,
            color: ui.text,
          }}
        >
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              Projekt: <b>{projectId || "-"}</b>
            </div>
            <div style={{ color: ui.sub }}>{status}</div>
          </div>
          <div style={{ color: ui.sub }}>Viewer-only • BricsCAD ist die Quelle der Wahrheit</div>
        </div>
      </div>
    </div>
  );
}
