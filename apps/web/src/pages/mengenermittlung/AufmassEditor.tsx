// apps/web/src/pages/aufmass/AufmassEditor.tsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { useProject } from "../../store/useProject";
import { consumeCadExport } from "../../utils/cadImport";

const API =
  (import.meta as any)?.env?.VITE_API_URL ||
  (import.meta as any)?.env?.VITE_BACKEND_URL ||
  "http://localhost:4000";

/* ============================================================
   Typen
   ============================================================ */

type LVRow = {
  id: string;
  pos: string;
  text: string;
  unit: string;
  ep: number;
  soll: number;
  formula: string; // wenn leer, kann IST manuell gesetzt werden
  ist: number;
  note?: string;
  factor?: number; // default 1
};

type LvPosition = {
  id: string;
  pos: string;
  text: string;
  unit: string;
  quantity: number;
  ep: number;
};

type FotoExtra = {
  id: string;
  typ: "KI" | "Manuell";
  beschreibung: string;
  einheit: string;
  menge: number;
  lvPos?: string;
};

const FOTO_STORAGE_KEY = "rlc-manuell-foto-v1";

/** ✅ Bridge-Keys */
const AUFMASS_LAST_CODE = "RLC_AUFMASS_LAST_CODE";
const AUFMASS_LAST_ID = "RLC_AUFMASS_LAST_ID";

/* ============================================================
   Helper
   ============================================================ */

const fmtEUR = (v: number) => "€ " + (isFinite(v) ? v.toFixed(2) : "0.00");

function nrmNumber(v: any, fallback = 0) {
  const x = Number(String(v ?? "").replace(",", "."));
  return isFinite(x) ? x : fallback;
}

function calc(formula: string): number {
  const cleaned = (formula || "")
    .replace(/,/g, ".")
    .replace(/[^\d+\-*/().\s]/g, "");
  if (!cleaned.trim()) return 0;
  try {
    // eslint-disable-next-line no-new-func
    const f = new Function(`return (${cleaned});`);
    const v = Number(f());
    return isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

function safeTrim(s: any) {
  return String(s ?? "").trim();
}

function byPosAsc(a: LVRow, b: LVRow) {
  return String(a.pos ?? "").localeCompare(String(b.pos ?? ""), "de-DE", {
    numeric: true,
    sensitivity: "base",
  });
}

function safeUUID() {
  try {
    // @ts-ignore
    if (typeof crypto !== "undefined" && crypto?.randomUUID) return crypto.randomUUID();
  } catch {
    // ignore
  }
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

/* ============================================================
   ✅ UUID helper (NEW)
   ============================================================ */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s: any) {
  return UUID_RE.test(String(s || "").trim());
}

function getLastCode(): string | null {
  try {
    return localStorage.getItem(AUFMASS_LAST_CODE);
  } catch {
    return null;
  }
}
function setLastCode(k: string) {
  try {
    localStorage.setItem(AUFMASS_LAST_CODE, k);
  } catch {
    // ignore
  }
}

function getLastId(): string | null {
  try {
    return localStorage.getItem(AUFMASS_LAST_ID);
  } catch {
    return null;
  }
}
function setLastId(k: string) {
  try {
    localStorage.setItem(AUFMASS_LAST_ID, k);
  } catch {
    // ignore
  }
}

/* ============================================================
   Aufmaß-Storage
   - Lokal: IMMER pro UUID (projectId)
   ============================================================ */

const AUFMASS = {
  load(projectId: string | null | undefined): LVRow[] {
    if (!projectId) return [];
    try {
      const key = `RLC_AUFMASS_${projectId}`;
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed as LVRow[];
    } catch {
      return [];
    }
  },
  save(projectId: string | null | undefined, rows: LVRow[]) {
    if (!projectId) return;
    try {
      const key = `RLC_AUFMASS_${projectId}`;
      localStorage.setItem(key, JSON.stringify(rows));
    } catch {
      // ignore
    }
  },
  clear(projectId: string | null | undefined) {
    if (!projectId) return;
    try {
      const key = `RLC_AUFMASS_${projectId}`;
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  },
  selKey(projectId: string) {
    return `RLC_AUFMASS_SEL_${projectId}`;
  },
  loadSel(projectId: string | null | undefined): string | null {
    if (!projectId) return null;
    try {
      return localStorage.getItem(AUFMASS.selKey(projectId));
    } catch {
      return null;
    }
  },
  saveSel(projectId: string | null | undefined, selId: string | null) {
    if (!projectId) return;
    try {
      if (!selId) localStorage.removeItem(AUFMASS.selKey(projectId));
      else localStorage.setItem(AUFMASS.selKey(projectId), selId);
    } catch {
      // ignore
    }
  },
};

/* ============================================================
   Layout Styles (Start-Seite Look)
   ============================================================ */

const pageContainer: React.CSSProperties = {
  maxWidth: 1180,
  margin: "0 auto",
  padding: "1.5rem 1.75rem 2rem",
};

const card: React.CSSProperties = {
  background: "#FFFFFF",
  borderRadius: 12,
  border: "1px solid #E5E7EB",
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
  padding: "1.25rem 1.5rem 1.5rem",
};

const cardTitleRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: "0.75rem",
  gap: 12,
};

const cardTitle: React.CSSProperties = {
  fontSize: "1rem",
  fontWeight: 600,
  color: "#111827",
};

const cardHint: React.CSSProperties = {
  fontSize: "0.8rem",
  color: "#9CA3AF",
};

const toolbar: React.CSSProperties = {
  display: "flex",
  gap: 8,
  padding: "6px 10px 10px",
  borderBottom: "1px solid #E5E7EB",
  alignItems: "center",
  flexWrap: "wrap",
};

const btn: React.CSSProperties = {
  fontSize: "0.8rem",
  borderRadius: 999,
  padding: "0.35rem 0.9rem",
  border: "1px solid #D1D5DB",
  background: "#F9FAFB",
  color: "#374151",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: "0.35rem",
};

const btnDisabled: React.CSSProperties = {
  opacity: 0.55,
  cursor: "not-allowed",
};

const btnPrimary: React.CSSProperties = {
  ...btn,
  background: "#2563EB",
  borderColor: "#1D4ED8",
  color: "#FFFFFF",
  fontWeight: 500,
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  borderBottom: "1px solid #E5E7EB",
  fontSize: 12,
  whiteSpace: "nowrap",
  background: "#F9FAFB",
  color: "#4B5563",
};

const td: React.CSSProperties = {
  padding: "6px 10px",
  borderBottom: "1px solid #E5E7EB",
  fontSize: 13,
  verticalAlign: "middle",
};

const lbl: React.CSSProperties = { fontSize: 13, opacity: 0.8 };

const inpBase: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  padding: "7px 10px",
  fontSize: 13,
  outline: "none",
};

const inpNarrow: React.CSSProperties = { ...inpBase, width: 140 };
const inpMini: React.CSSProperties = { ...inpBase, width: 110 };
const inpWide: React.CSSProperties = { ...inpBase, width: "100%" };

const pill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  border: "1px solid #E5E7EB",
  background: "#F9FAFB",
  borderRadius: 999,
  padding: "6px 10px",
  fontSize: 12,
  color: "#374151",
};

const modalWrap: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.35)",
  zIndex: 999,
  display: "grid",
  placeItems: "center",
  padding: 20,
};

const modalBox: React.CSSProperties = {
  background: "#fff",
  color: "#111",
  border: "1px solid #E5E7EB",
  borderRadius: 12,
  width: "min(980px,95vw)",
  maxHeight: "82vh",
  padding: 16,
  boxShadow: "0 10px 30px rgba(0,0,0,.2)",
};

const modalTextarea: React.CSSProperties = {
  width: "100%",
  height: "42vh",
  resize: "vertical",
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
  fontSize: 14,
  lineHeight: 1.4,
  border: "1px solid #E5E7EB",
  borderRadius: 10,
  padding: 10,
};

function rowTint(diff: number, active: boolean): React.CSSProperties {
  let bg = diff === 0 ? "#ECFDF3" : diff > 0 ? "#FEF3C7" : "#FEE2E2";
  if (active) bg = diff === 0 ? "#DCFCE7" : diff > 0 ? "#FEF9C3" : "#FECACA";
  return { background: bg };
}

/* ============================================================
   Server mapping
   - Standard: /aufmass/aufmass/:projectKey  (aufmass.json)
   - Legacy:   /aufmass/soll-ist/:projectKey (soll-ist.json)
   ============================================================ */

type AufmassJsonRow = {
  pos: string;
  text: string;
  unit: string;
  soll: number;
  ist: number;
  ep: number;
};

type SollIstRow = AufmassJsonRow;

function toAufmassJson(rows: LVRow[]): AufmassJsonRow[] {
  return rows.map((r) => ({
    pos: String(r.pos ?? ""),
    text: String(r.text ?? ""),
    unit: String(r.unit ?? "m"),
    soll: Number(r.soll || 0),
    ist: Number(r.ist || 0),
    ep: Number(r.ep || 0),
  }));
}

function fromAufmassJson(rows: AufmassJsonRow[]): LVRow[] {
  return (rows || []).map((r) => ({
    id: safeUUID(),
    pos: String(r.pos ?? ""),
    text: String(r.text ?? ""),
    unit: String(r.unit ?? "m"),
    ep: Number(r.ep ?? 0),
    soll: Number(r.soll ?? 0),
    formula: "",
    ist: Number(r.ist ?? 0),
    note: "",
    factor: 1,
  }));
}

function toSollIst(rows: LVRow[]): SollIstRow[] {
  return toAufmassJson(rows);
}
function fromSollIst(rows: SollIstRow[]): LVRow[] {
  return fromAufmassJson(rows);
}

/* ============================================================
   MERGE helper: aufmass.json + soll-ist.json
   ============================================================ */

function mergeByPos(primary: LVRow[], legacy: LVRow[]): LVRow[] {
  const map = new Map<string, LVRow>();
  const normPos = (p: any) => String(p ?? "").trim();

  for (const r of primary || []) {
    const k = normPos(r.pos);
    if (!k) continue;
    map.set(k, { ...r, pos: k });
  }

  for (const lr of legacy || []) {
    const k = normPos(lr.pos);
    if (!k) continue;

    const ex = map.get(k);
    if (!ex) {
      map.set(k, { ...lr, id: safeUUID(), pos: k });
      continue;
    }

    const merged: LVRow = {
      ...ex,
      pos: k,
      text: ex.text?.trim() ? ex.text : lr.text,
      unit: ex.unit?.trim() ? ex.unit : lr.unit,
      ep: ex.ep && ex.ep > 0 ? ex.ep : lr.ep,
      soll: ex.soll && ex.soll > 0 ? ex.soll : lr.soll,
      ist: Math.max(Number(ex.ist || 0), Number(lr.ist || 0)),
      note: ex.note?.trim() ? ex.note : (lr.note as any),
      factor: ex.factor ?? (lr.factor as any) ?? 1,
    };

    map.set(k, merged);
  }

  return Array.from(map.values()).sort(byPosAsc);
}

/* ============================================================
   ✅ NEW: robust server fetch (code + uuid) + merge by pos
   ============================================================ */

function mergeServerRowsByPos<T extends { pos: string; text?: string; unit?: string; soll?: any; ist?: any; ep?: any }>(
  a: T[],
  b: T[]
): T[] {
  const map = new Map<string, T>();
  const norm = (p: any) => String(p ?? "").trim();

  const put = (r: any) => {
    const k = norm(r?.pos);
    if (!k) return;
    const prev = map.get(k);
    if (!prev) {
      map.set(k, {
        pos: k,
        text: String(r?.text ?? ""),
        unit: String(r?.unit ?? "m"),
        soll: Number(r?.soll ?? 0),
        ist: Number(r?.ist ?? 0),
        ep: Number(r?.ep ?? 0),
      } as any);
      return;
    }
    const next: any = { ...prev };
    next.ist = Math.max(Number(prev?.ist ?? 0), Number(r?.ist ?? 0));
    if (!safeTrim(next.text) && safeTrim(r?.text)) next.text = String(r.text);
    if (!safeTrim(next.unit) && safeTrim(r?.unit)) next.unit = String(r.unit);
    if (!Number(next.ep) && Number(r?.ep)) next.ep = Number(r.ep);
    if (!Number(next.soll) && Number(r?.soll)) next.soll = Number(r.soll);
    map.set(k, next);
  };

  (Array.isArray(a) ? a : []).forEach(put);
  (Array.isArray(b) ? b : []).forEach(put);

  return Array.from(map.values()) as T[];
}

async function fetchRowsForKey<T>(urlBase: string, key: string): Promise<T[]> {
  if (!safeTrim(key)) return [];
  const url = `${API}${urlBase}/${encodeURIComponent(key)}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return Array.isArray((data as any)?.rows) ? ((data as any).rows as T[]) : [];
}

/* ============================================================
   AutoKI (server file) mapping
   ============================================================ */

type AutoKiBox = {
  id?: string;
  label?: string;
  score?: number;
  qty?: number;
  unit?: string;
};

type AutoKiPayload = {
  ok?: boolean;
  projectKey?: string;
  savedAt?: string | null;
  note?: string;
  scale?: string | number | null;
  sourceFile?: string | null;
  preview?: string | null;
  boxes?: AutoKiBox[];
};

function fromAutoKiBoxesToRows(boxes: AutoKiBox[], noteFallback = "AutoKI Import"): LVRow[] {
  const arr = Array.isArray(boxes) ? boxes : [];
  return arr.map((b, idx) => {
    const pos = `AUTO.${String(idx + 1).padStart(3, "0")}`; // AUTO.001 … AUTO.104
    const qty = Number(b?.qty ?? 0);
    const unit = String(b?.unit ?? "m");

    return {
      id: safeUUID(),
      pos,
      text: String(b?.label ?? "AutoKI Position"),
      unit,
      ep: 0,
      soll: 0,
      formula: "",
      ist: isFinite(qty) ? qty : 0,
      note: noteFallback,
      factor: 1,
    };
  });
}

/* ============================================================
   Component
   ============================================================ */

type InitSource =
  | "none"
  | "server"
  | "server-legacy"
  | "server+legacy"
  | "auto-ki"
  | "local"
  | "lv"
  | "fallback";

export default function AufmassEditor() {
  const navigate = useNavigate();
  const { getSelectedProject } = useProject();
  const project = getSelectedProject();

  /**
   * Sticky (se useProject() beim Seitenwechsel kurz null ist)
   * - code und id getrennt, damit wir NIE code/id vermischen
   */
  const [stickyCode, setStickyCode] = React.useState<string>(() => safeTrim(getLastCode() || ""));
  const [stickyId, setStickyId] = React.useState<string>(() => safeTrim(getLastId() || ""));

  React.useEffect(() => {
    const c = safeTrim(project?.code || "");
    const id = safeTrim(project?.id || "");
    if (c) {
      setStickyCode(c);
      setLastCode(c);
    }
    if (id) {
      setStickyId(id);
      setLastId(id);
    }
  }, [project?.id, project?.code]);

  // ✅ projectFsKey: für server/filesystem IMMER code bevorzugt
  const projectFsKey = safeTrim(project?.code || stickyCode || "");
  // ✅ projectId: für localStorage IMMER uuid bevorzugt
  const projectId = safeTrim(project?.id || stickyId) || null;

  /* ============================================================
     ✅ LV keys (robust) (NEW)
     - NEW endpoint needs UUID
     - Legacy endpoint can accept UUID OR project.code (BA-...)
   ============================================================ */
  const lvProjectUuid = safeTrim(project?.id || stickyId || "");
  const lvProjectCode = safeTrim(project?.code || stickyCode || "");
  const lvProjectId = isUuid(lvProjectUuid) ? lvProjectUuid : null; // UUID-only
  const lvLegacyKey = lvProjectCode || lvProjectUuid || null; // prefer code

  // LV
  const [lvRows, setLvRows] = React.useState<LvPosition[]>([]);
  const [lvLoading, setLvLoading] = React.useState(false);
  const [lvError, setLvError] = React.useState<string | null>(null);

  // Aufmaß
  const [rows, setRows] = React.useState<LVRow[]>([]);
  const [selId, setSelId] = React.useState<string | null>(null);

  // UI states
  const [editOpen, setEditOpen] = React.useState(false);
  const [editBuffer, setEditBuffer] = React.useState("");
  const [noteOpen, setNoteOpen] = React.useState(false);
  const [noteBuffer, setNoteBuffer] = React.useState("");

  const [loadBusy, setLoadBusy] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // Filters
  const [lvFilter, setLvFilter] = React.useState("");
  const [rowFilter, setRowFilter] = React.useState("");
  const [onlyDiff, setOnlyDiff] = React.useState(false);

  // refs
  const didInitRef = React.useRef(false);
  const initSourceRef = React.useRef<InitSource>("none");
  const fotoImportedRef = React.useRef(false);
  const cadImportedRef = React.useRef(false);

  // debounce ref
  const saveTimerRef = React.useRef<number | null>(null);

  const selected = rows.find((r) => r.id === selId) || null;

  const setRow = React.useCallback((id: string, patch: Partial<LVRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  /* ---------------------------
     Reset init on project change
     --------------------------- */
  React.useEffect(() => {
    if (!projectId) return;

    didInitRef.current = false;
    initSourceRef.current = "none";
    fotoImportedRef.current = false;
    cadImportedRef.current = false;

    setRows([]);
    const storedSel = AUFMASS.loadSel(projectId);
    setSelId(storedSel);

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  /* ---------------------------
     Persist selection
     --------------------------- */
  React.useEffect(() => {
    if (!projectId) return;
    AUFMASS.saveSel(projectId, selId);
  }, [projectId, selId]);

  /* ---------------------------
     Autosave local on change (debounced)
     --------------------------- */
  React.useEffect(() => {
    if (!projectId) return;
    if (!didInitRef.current) return;

    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);

    saveTimerRef.current = window.setTimeout(() => {
      AUFMASS.save(projectId, rows);
      saveTimerRef.current = null;
    }, 250);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [rows, projectId]);

  /* ---------------------------
     Flush autosave on unload
     --------------------------- */
  React.useEffect(() => {
    if (!projectId) return;
    const onUnload = () => {
      try {
        AUFMASS.save(projectId, rows);
      } catch {
        // ignore
      }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [projectId, rows]);

  /* ---------------------------
     Server load/save
     --------------------------- */

  // ✅ robust: loads BOTH keys (code + uuid) and merges by pos
  const serverLoadAufmass = React.useCallback(async (): Promise<AufmassJsonRow[]> => {
    const byCode = projectFsKey ? await fetchRowsForKey<AufmassJsonRow>("/api/aufmass/aufmass", projectFsKey) : [];
    const byId =
      projectId && projectId !== projectFsKey
        ? await fetchRowsForKey<AufmassJsonRow>("/api/aufmass/aufmass", projectId)
        : [];
    if (byCode.length && !byId.length) return byCode;
    if (!byCode.length && byId.length) return byId;
    return mergeServerRowsByPos(byCode, byId);
  }, [projectFsKey, projectId]);

  // ✅ best effort save to BOTH keys (primary=code)
  const serverSaveAufmass = React.useCallback(
    async (payloadRows: AufmassJsonRow[]): Promise<void> => {
      if (!projectFsKey && !projectId) throw new Error("Kein Projekt gewählt");

      const post = async (key: string) => {
        const res = await fetch(`${API}/api/aufmass/aufmass/${encodeURIComponent(key)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: payloadRows }),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(txt || `Server-Fehler (${res.status})`);
        }
      };

      // primary: code
      if (projectFsKey) {
        await post(projectFsKey);
      } else if (projectId) {
        await post(projectId);
        return;
      }

      // secondary: uuid (fire & forget)
      if (projectId && projectId !== projectFsKey) {
        post(projectId).catch(() => void 0);
      }
    },
    [projectFsKey, projectId]
  );

  // ✅ robust: loads BOTH keys (code + uuid) and merges by pos
  const serverLoadSollIst = React.useCallback(async (): Promise<SollIstRow[]> => {
    const byCode = projectFsKey ? await fetchRowsForKey<SollIstRow>("/api/aufmass/soll-ist", projectFsKey) : [];
    const byId =
      projectId && projectId !== projectFsKey
        ? await fetchRowsForKey<SollIstRow>("/api/aufmass/soll-ist", projectId)
        : [];
    if (byCode.length && !byId.length) return byCode;
    if (!byCode.length && byId.length) return byId;
    return mergeServerRowsByPos(byCode, byId);
  }, [projectFsKey, projectId]);

  // ✅ best effort save to BOTH keys (primary=code)
  const serverSaveSollIst = React.useCallback(
    async (payloadRows: SollIstRow[]): Promise<void> => {
      const post = async (key: string) => {
        await fetch(`${API}/api/aufmass/soll-ist/${encodeURIComponent(key)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: payloadRows }),
        }).catch(() => void 0);
      };

      if (projectFsKey) await post(projectFsKey);
      else if (projectId) await post(projectId);

      if (projectId && projectId !== projectFsKey) post(projectId);
    },
    [projectFsKey, projectId]
  );

  /* ---------------------------
     AutoKI load (server file)
     --------------------------- */
  const serverLoadAutoKi = React.useCallback(async (): Promise<AutoKiPayload | null> => {
    // AutoKI è per FS-key (code). Se non c’è, prova anche UUID.
    const tryKey = async (key: string) => {
      const url = `${API}/api/auto-ki/${encodeURIComponent(key)}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json().catch(() => null);
      return data;
    };

    if (projectFsKey) {
      const a = await tryKey(projectFsKey);
      if (a) return a;
    }
    if (projectId && projectId !== projectFsKey) {
      const b = await tryKey(projectId);
      if (b) return b;
    }
    return null;
  }, [projectFsKey, projectId]);

  /* ---------------------------
     LV load
     --------------------------- */

  const fetchJson = React.useCallback(async (url: string) => {
    const res = await fetch(url);
    const txt = await res.text().catch(() => "");
    if (!res.ok) throw new Error(txt || `HTTP ${res.status} (${url})`);
    try {
      return txt ? JSON.parse(txt) : {};
    } catch {
      return {};
    }
  }, []);

  const mapAnyToLvPositions = React.useCallback((list: any[]): LvPosition[] => {
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
  }, []);

  const extractLvListFromNewEndpoint = React.useCallback((data: any): any[] => {
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    const latest = rows[0];
    const positions = Array.isArray(latest?.positions) ? latest.positions : [];
    return positions;
  }, []);

  const extractLvListFromOldEndpoint = React.useCallback((data: any): any[] => {
    if (Array.isArray(data?.items)) return data.items;
    if (Array.isArray(data?.lv)) return data.lv;
    if (Array.isArray(data)) return data;
    return [];
  }, []);

  const loadLvPagedNew = React.useCallback(
    async (pid: string) => {
      const pageSize = 500;
      const maxPages = 50;
      const all: any[] = [];

      for (let page = 1; page <= maxPages; page++) {
        const data = await fetchJson(
          `${API}/api/projects/${encodeURIComponent(pid)}/lv?page=${page}&pageSize=${pageSize}`
        );
        const list = extractLvListFromNewEndpoint(data);
        if (Array.isArray(list) && list.length) {
          all.push(...list);
          if (list.length < pageSize) break;
        } else {
          break;
        }
      }

      return all;
    },
    [fetchJson, extractLvListFromNewEndpoint]
  );

  React.useEffect(() => {
    // ✅ robust: allow LV load via UUID (new) OR code/uuid (legacy)
    if (!lvProjectId && !lvLegacyKey) {
      setLvRows([]);
      return;
    }

    let cancelled = false;

    const loadLv = async () => {
      setLvLoading(true);
      setLvError(null);

      try {
        // 1) NEW endpoint (UUID only)
        if (lvProjectId) {
          try {
            const listAll = await loadLvPagedNew(lvProjectId);
            const mapped = mapAnyToLvPositions(listAll);
            if (!cancelled) setLvRows(mapped);
            return;
          } catch (eNew: any) {
            console.warn("[LV] new endpoint failed, trying legacy:", eNew?.message || eNew);
          }
        }

        // 2) LEGACY endpoint (code OR uuid)
        if (!lvLegacyKey) throw new Error("Projekt nicht gefunden (keine project key vorhanden)");

        const dataLegacy = await fetchJson(`${API}/api/project-lv/${encodeURIComponent(lvLegacyKey)}`);
        const listLegacy = extractLvListFromOldEndpoint(dataLegacy);
        const mappedLegacy = mapAnyToLvPositions(listLegacy);
        if (!cancelled) setLvRows(mappedLegacy);
      } catch (e: any) {
        console.error(e);
        if (!cancelled) {
          setLvError(e?.message || "Fehler beim Laden des LV");
          setLvRows([]);
        }
      } finally {
        if (!cancelled) setLvLoading(false);
      }
    };

    loadLv();
    return () => {
      cancelled = true;
    };
  }, [
    lvProjectId,
    lvLegacyKey,
    fetchJson,
    mapAnyToLvPositions,
    extractLvListFromOldEndpoint,
    loadLvPagedNew,
  ]);

  /* ============================================================
     Initiales Aufmaß:
     server(aufmass) -> server(legacy) -> auto-ki -> local(uuid) -> LV -> fallback
   ============================================================ */

  const isPristineFallback = React.useCallback((arr: LVRow[]) => {
    if (!Array.isArray(arr) || arr.length !== 1) return false;
    const r = arr[0];
    return (
      safeTrim(r.pos) === "001.001" &&
      safeTrim(r.text) === "Neue Position" &&
      nrmNumber(r.ep) === 0 &&
      nrmNumber(r.soll) === 0 &&
      safeTrim(r.formula) === "" &&
      nrmNumber(r.ist) === 0
    );
  }, []);

  React.useEffect(() => {
    if (didInitRef.current) return;
    if (!projectId && !projectFsKey) return;

    let cancelled = false;

    const init = async () => {
      // 1) server standard (+ merge legacy)
      if (projectFsKey || projectId) {
        try {
          const srv = await serverLoadAufmass();
          const srvLegacy = await serverLoadSollIst().catch(() => []);

          if (!cancelled && (srv.length || srvLegacy.length)) {
            const primary = srv.length ? fromAufmassJson(srv) : [];
            const legacy = srvLegacy.length ? fromSollIst(srvLegacy) : [];
            const merged = mergeByPos(primary, legacy);

            setRows(merged);

            if (projectId) {
              const storedSel = AUFMASS.loadSel(projectId);
              setSelId(
                storedSel && merged.some((x) => x.id === storedSel)
                  ? storedSel
                  : merged[0]?.id ?? null
              );
              AUFMASS.save(projectId, merged);
            } else {
              setSelId(merged[0]?.id ?? null);
            }

            didInitRef.current = true;
            initSourceRef.current =
              srv.length && srvLegacy.length
                ? "server+legacy"
                : srv.length
                ? "server"
                : "server-legacy";
            return;
          }
        } catch {
          // ignore
        }

        // 2) server legacy
        try {
          const srvLegacy = await serverLoadSollIst();
          if (!cancelled && srvLegacy.length) {
            const mapped = fromSollIst(srvLegacy);
            setRows(mapped);

            if (projectId) {
              const storedSel = AUFMASS.loadSel(projectId);
              setSelId(
                storedSel && mapped.some((x) => x.id === storedSel)
                  ? storedSel
                  : mapped[0]?.id ?? null
              );
              AUFMASS.save(projectId, mapped);
            } else {
              setSelId(mapped[0]?.id ?? null);
            }

            didInitRef.current = true;
            initSourceRef.current = "server-legacy";
            return;
          }
        } catch {
          // ignore
        }
      }

      // 2b) AutoKI (server file) — prima del local/LV
      if ((projectFsKey || projectId) && projectId) {
        try {
          const auto = await serverLoadAutoKi();
          const boxes = Array.isArray(auto?.boxes) ? auto!.boxes! : [];
          if (!cancelled && boxes.length) {
            const note = safeTrim(auto?.note) || "AutoKI Import";
            const autoRows = fromAutoKiBoxesToRows(boxes, note);

            setRows(autoRows);
            setSelId(autoRows[0]?.id ?? null);
            AUFMASS.save(projectId, autoRows);

            didInitRef.current = true;
            initSourceRef.current = "auto-ki";
            return;
          }
        } catch {
          // ignore
        }
      }

      // 3) local (uuid)
      if (projectId) {
        const stored = AUFMASS.load(projectId);
        if (!cancelled && stored.length) {
          setRows(stored);
          const storedSel = AUFMASS.loadSel(projectId);
          setSelId(
            storedSel && stored.some((x) => x.id === storedSel)
              ? storedSel
              : stored[0]?.id ?? null
          );
          didInitRef.current = true;
          initSourceRef.current = "local";
          return;
        }
      }

      // 4) LV
      if (!cancelled && lvRows.length && projectId) {
        const mapped: LVRow[] = lvRows.map((lv) => ({
          id: safeUUID(),
          pos: lv.pos,
          text: lv.text,
          unit: lv.unit,
          ep: lv.ep,
          soll: lv.quantity,
          formula: "",
          ist: 0,
          note: "",
          factor: 1,
        }));
        setRows(mapped);
        setSelId(mapped[0]?.id ?? null);
        AUFMASS.save(projectId, mapped);
        didInitRef.current = true;
        initSourceRef.current = "lv";
        return;
      }

      // 5) fallback
      if (!cancelled && projectId) {
        const fallback: LVRow[] = [
          {
            id: safeUUID(),
            pos: "001.001",
            text: "Neue Position",
            unit: "m",
            ep: 0,
            soll: 0,
            formula: "",
            ist: 0,
            note: "",
            factor: 1,
          },
        ];
        setRows(fallback);
        setSelId(fallback[0].id);
        AUFMASS.save(projectId, fallback);
        didInitRef.current = true;
        initSourceRef.current = "fallback";
      }
    };

    void init();
    return () => {
      cancelled = true;
    };
  }, [
    projectFsKey,
    projectId,
    lvRows,
    serverLoadAufmass,
    serverLoadSollIst,
    serverLoadAutoKi,
    isPristineFallback,
  ]);

  // Wenn initial fallback war und LV später geladen wird → automatisch LV übernehmen
  React.useEffect(() => {
    if (!didInitRef.current) return;
    if (initSourceRef.current !== "fallback") return;
    if (!projectId) return;
    if (!lvRows.length) return;

    setRows((prev) => {
      if (!isPristineFallback(prev)) return prev;

      const mapped: LVRow[] = lvRows.map((lv) => ({
        id: safeUUID(),
        pos: lv.pos,
        text: lv.text,
        unit: lv.unit,
        ep: lv.ep,
        soll: lv.quantity,
        formula: "",
        ist: 0,
        note: "",
        factor: 1,
      }));

      setSelId(mapped[0]?.id ?? null);
      initSourceRef.current = "lv";
      AUFMASS.save(projectId, mapped);
      return mapped;
    });
  }, [lvRows, isPristineFallback, projectId]);

  /* ============================================================
     Import da ManuellFoto (einmalig)
   ============================================================ */

  React.useEffect(() => {
    if (!didInitRef.current) return;
    if (!projectId) return;
    if (fotoImportedRef.current) return;

    try {
      const raw = localStorage.getItem(FOTO_STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as any;
      const extras: FotoExtra[] | undefined = Array.isArray(parsed?.extras)
        ? parsed.extras
        : undefined;

      if (!extras || extras.length === 0) return;

      const note = String(parsed?.note || "Aus Foto / KI übernommen");

      setRows((prev) => {
        const base = [...prev];

        extras.forEach((ex) => {
          if (!ex?.beschreibung || !String(ex.beschreibung).trim()) return;

          base.push({
            id: safeUUID(),
            pos: `FOTO.${String(base.length + 1).padStart(3, "0")}`,
            text: String(ex.beschreibung),
            unit: String(ex.einheit || "m"),
            ep: 0,
            soll: 0,
            formula: "",
            ist: Number(ex.menge || 0),
            note,
            factor: 1,
          });
        });

        AUFMASS.save(projectId, base);
        return base;
      });

      fotoImportedRef.current = true;
    } catch (e) {
      console.error("Fehler beim Import aus Foto-Aufmaß", e);
    }
  }, [projectId]);

  /* ============================================================
     CAD Import (einmalig) über URL flag ?import=cad
   ============================================================ */

  React.useEffect(() => {
    if (cadImportedRef.current) return;
    if (!projectId) return;

    const hasFlag =
      new URLSearchParams(window.location.search).get("import") === "cad";
    if (!hasFlag) return;

    const item = consumeCadExport("aufmasseditor");
    if (!item) return;

    const unit = item.kind === "AREA" ? "m²" : "m";
    const ist = item.kind === "AREA" ? item.area_m2 ?? 0 : item.length_m ?? 0;

    setRows((prev) => {
      const idx = prev.filter((x) => String(x.pos || "").startsWith("CAD.")).length + 1;

      const r: LVRow = {
        id: safeUUID(),
        pos: "CAD." + String(idx).padStart(3, "0"),
        text:
          (item.label ?? item.layer ?? "CAD-Element") +
          (item.kind === "AREA" ? " (CAD-Fläche)" : " (CAD-Länge)"),
        unit,
        ep: 0,
        soll: 0,
        formula: "",
        ist,
        note: "Import aus CAD",
        factor: 1,
      };

      const next = [r, ...prev];
      AUFMASS.save(projectId, next);

      setSelId(r.id);
      return next;
    });

    cadImportedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  /* ============================================================
     Save / Load / Clear
   ============================================================ */

  const handleSaveAufmass = React.useCallback(async () => {
    if ((!projectFsKey && !projectId) || !projectId) {
      alert("Kein Projekt gewählt.");
      return;
    }
    setSaving(true);

    AUFMASS.save(projectId, rows);

    try {
      await serverSaveAufmass(toAufmassJson(rows));
      void serverSaveSollIst(toSollIst(rows));
      alert("Aufmaß gespeichert (lokal + Server).");
    } catch (e: any) {
      console.error(e);
      alert(
        `Lokal gespeichert, aber Server-Fehler:\n${
          e?.message || "Unbekannter Fehler"
        }`
      );
    } finally {
      setSaving(false);
    }
  }, [projectFsKey, projectId, rows, serverSaveAufmass, serverSaveSollIst]);

  const handleLoadAufmass = React.useCallback(async () => {
    if ((!projectFsKey && !projectId) || !projectId) {
      alert("Kein Projekt gewählt.");
      return;
    }
    if (loadBusy) return;

    setLoadBusy(true);
    try {
      const srv = await serverLoadAufmass().catch(() => []);
      const srvLegacy = await serverLoadSollIst().catch(() => []);

      if (srv.length || srvLegacy.length) {
        const primary = srv.length ? fromAufmassJson(srv) : [];
        const legacy = srvLegacy.length ? fromSollIst(srvLegacy) : [];
        const merged = mergeByPos(primary, legacy);

        setRows(merged);
        setSelId(merged[0]?.id ?? null);
        AUFMASS.save(projectId, merged);

        alert(`Aufmaß geladen (Server merge) • ${merged.length} Zeile(n)`);
        return;
      }

      const stored = AUFMASS.load(projectId);
      if (stored.length) {
        setRows(stored);
        setSelId(stored[0]?.id ?? null);
        alert(`Aufmaß geladen (lokal) • ${stored.length} Zeile(n)`);
        return;
      }

      alert("Kein gespeichertes Aufmaß (Server oder lokal) gefunden.");
    } catch (e: any) {
      console.error(e);

      const stored = AUFMASS.load(projectId);
      if (stored.length) {
        setRows(stored);
        setSelId(stored[0]?.id ?? null);
        alert(
          `Server-Fehler beim Laden.\nFallback: lokal geladen • ${
            stored.length
          } Zeile(n)\n\n${e?.message || "Unbekannter Fehler"}`
        );
        return;
      }

      alert(`Fehler beim Laden:\n${e?.message || "Unbekannter Fehler"}`);
    } finally {
      setLoadBusy(false);
    }
  }, [projectFsKey, projectId, loadBusy, serverLoadAufmass, serverLoadSollIst]);

  const handleClearAufmass = React.useCallback(() => {
    if (!projectId) return;
    if (
      !window.confirm(
        "Gesamtes Aufmaß für dieses Projekt wirklich löschen?\n\nHinweis: Das entfernt nur den lokalen Speicher."
      )
    )
      return;

    AUFMASS.clear(projectId);

    const fallback: LVRow[] = [
      {
        id: safeUUID(),
        pos: "001.001",
        text: "Neue Position",
        unit: "m",
        ep: 0,
        soll: 0,
        formula: "",
        ist: 0,
        note: "",
        factor: 1,
      },
    ];
    setRows(fallback);
    setSelId(fallback[0].id);
    AUFMASS.save(projectId, fallback);
    initSourceRef.current = "fallback";
    didInitRef.current = true;
  }, [projectId]);

  /* ============================================================
     CSV Export
   ============================================================ */

  const exportCsv = React.useCallback(() => {
    const header = [
      "Pos",
      "Kurztext",
      "Einheit",
      "LV (Soll)",
      "Ist (Abgerechnet)",
      "Differenz (Soll–Ist)",
      "EP",
      "Faktor",
      "Eff. EP",
      "Gesamt (€)",
      "Beschreibung",
      "Formel",
    ];

    const lines = rows.map((r) => {
      const factor = r.factor ?? 1;
      const effEP = r.ep * factor;
      const total = r.ist * effEP;
      const diff = r.soll - r.ist;

      return [
        r.pos,
        String(r.text ?? "").replaceAll('"', '""'),
        r.unit,
        String(r.soll).replace(".", ","),
        String(r.ist).replace(".", ","),
        String(diff).replace(".", ","),
        String(r.ep).replace(".", ","),
        String(factor).replace(".", ","),
        String(effEP.toFixed(2)).replace(".", ","),
        String(total.toFixed(2)).replace(".", ","),
        (r.note ?? "").replaceAll('"', '""'),
        (r.formula ?? "").replaceAll('"', '""'),
      ];
    });

    const csv = [header, ...lines]
      .map((row) => row.map((c) => `"${c}"`).join(";"))
      .join("\r\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "aufmass.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }, [rows]);

  /* ============================================================
     Handlers
   ============================================================ */

  const onFormulaChange = React.useCallback(
    (id: string, formula: string) => {
      const v = calc(formula);
      setRow(id, { formula, ist: v });
    },
    [setRow]
  );

  const onEPChange = React.useCallback(
    (id: string, v: string) => setRow(id, { ep: nrmNumber(v, 0) }),
    [setRow]
  );

  const onSollChange = React.useCallback(
    (id: string, v: string) => setRow(id, { soll: nrmNumber(v, 0) }),
    [setRow]
  );

  const onIstManualChange = React.useCallback(
    (id: string, v: string) => {
      const ist = nrmNumber(v, 0);
      setRow(id, { ist, formula: "" });
    },
    [setRow]
  );

  const onFactorChange = React.useCallback(
    (id: string, v: string) => {
      const f = nrmNumber(v, 1);
      setRow(id, { factor: isFinite(f) && f > 0 ? f : 1 });
    },
    [setRow]
  );

  const onNoteChange = React.useCallback(
    (id: string, val: string) => setRow(id, { note: val }),
    [setRow]
  );

  /* ============================================================
     Row operations
   ============================================================ */

  const addRow = React.useCallback(() => {
    setRows((prev) => {
      const n = prev.length + 1;
      const r: LVRow = {
        id: safeUUID(),
        pos: `001.${String(n).padStart(3, "0")}`,
        text: "Neue Position",
        unit: "m",
        ep: 0,
        soll: 0,
        formula: "",
        ist: 0,
        note: "",
        factor: 1,
      };
      const next = [...prev, r];
      setSelId(r.id);
      return next;
    });
  }, []);

  const addRowFromLv = React.useCallback((lv: LvPosition) => {
    const r: LVRow = {
      id: safeUUID(),
      pos: lv.pos,
      text: lv.text,
      unit: lv.unit,
      ep: lv.ep,
      soll: lv.quantity,
      formula: "",
      ist: 0,
      note: "",
      factor: 1,
    };
    setRows((p) => [...p, r]);
    setSelId(r.id);
  }, []);

  const dupRow = React.useCallback(() => {
    if (!selected) return;
    const copy: LVRow = {
      ...selected,
      id: safeUUID(),
      pos: selected.pos + "a",
    };
    setRows((p) => [...p, copy]);
    setSelId(copy.id);
  }, [selected]);

  const delRow = React.useCallback(() => {
    if (!selected) return;
    if (!window.confirm(`Position ${selected.pos} wirklich löschen?`)) return;

    const next = rows.filter((r) => r.id !== selected.id);
    setRows(next);
    setSelId(next[0]?.id ?? null);
  }, [selected, rows]);

  const sortByPos = React.useCallback(() => {
    setRows((prev) => [...prev].sort(byPosAsc));
  }, []);

  /* ============================================================
     Totals + filtered lists
   ============================================================ */

  const totals = React.useMemo(() => {
    const totalAbgerechnet = rows.reduce(
      (s, r) => s + r.ist * r.ep * (r.factor ?? 1),
      0
    );
    const lvSumme = rows.reduce((s, r) => s + r.soll * r.ep, 0);
    const diffSum = rows.reduce((s, r) => s + (r.soll - r.ist) * r.ep, 0);
    return { totalAbgerechnet, lvSumme, diffSum };
  }, [rows]);

  const filteredLv = React.useMemo(() => {
    const q = safeTrim(lvFilter).toLowerCase();
    if (!q) return lvRows;
    return lvRows.filter((x) => {
      const a = `${x.pos} ${x.text} ${x.unit}`.toLowerCase();
      return a.includes(q);
    });
  }, [lvRows, lvFilter]);

  const filteredRows = React.useMemo(() => {
    const q = safeTrim(rowFilter).toLowerCase();
    let out = rows;

    if (q) {
      out = out.filter((r) => {
        const a = `${r.pos} ${r.text} ${r.unit} ${r.note ?? ""}`.toLowerCase();
        return a.includes(q);
      });
    }
    if (onlyDiff) {
      out = out.filter((r) => Math.abs((r.soll ?? 0) - (r.ist ?? 0)) > 0);
    }
    return out;
  }, [rows, rowFilter, onlyDiff]);

  /* ============================================================
     Modals
   ============================================================ */

  const openFormulaEditor = React.useCallback(() => {
    if (!selected) return;
    setEditBuffer(selected.formula ?? "");
    setEditOpen(true);
  }, [selected]);

  const openNoteEditor = React.useCallback(() => {
    if (!selected) return;
    setNoteBuffer(selected.note ?? "");
    setNoteOpen(true);
  }, [selected]);

  /* ============================================================
     Keyboard shortcuts (Ctrl/Cmd+S)
   ============================================================ */

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        editOpen &&
        (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey)))
      ) {
        e.preventDefault();
        if (e.key === "Escape") {
          setEditOpen(false);
        } else if (selected) {
          onFormulaChange(selected.id, editBuffer);
          setEditOpen(false);
        }
      }

      if (
        noteOpen &&
        (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey)))
      ) {
        e.preventDefault();
        if (e.key === "Escape") {
          setNoteOpen(false);
        } else if (selected) {
          onNoteChange(selected.id, noteBuffer);
          setNoteOpen(false);
        }
      }

      if (!editOpen && !noteOpen && (e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        void handleSaveAufmass();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    editOpen,
    noteOpen,
    editBuffer,
    noteBuffer,
    selected,
    onFormulaChange,
    onNoteChange,
    handleSaveAufmass,
  ]);

  /* ============================================================
     Render
   ============================================================ */

  return (
    <div style={pageContainer}>
      {/* Header */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 4 }}>
          RLC / 2. Mengenermittlung / Aufmaß-Editor
        </div>
        <div style={{ fontSize: 18, fontWeight: 600, color: "#111827" }}>
          Aufmaß-Editor
        </div>

        {project && (
          <div style={{ marginTop: 2, fontSize: 13, color: "#4B5563" }}>
            <b>{project.code}</b> — {project.name}
            {project.client ? ` • ${project.client}` : ""}
            {project.place ? ` • ${project.place}` : ""}
          </div>
        )}

        <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={pill}>
            <span style={{ opacity: 0.7 }}>LV-Summe:</span>{" "}
            <b>{fmtEUR(totals.lvSumme)}</b>
          </div>
          <div style={pill}>
            <span style={{ opacity: 0.7 }}>Abgerechnet:</span>{" "}
            <b>{fmtEUR(totals.totalAbgerechnet)}</b>
          </div>
          <div style={pill}>
            <span style={{ opacity: 0.7 }}>Δ (Soll–Ist) in €:</span>{" "}
            <b>{fmtEUR(totals.diffSum)}</b>
          </div>
          <div style={pill}>
            <span style={{ opacity: 0.7 }}>Init:</span>{" "}
            <b>{initSourceRef.current}</b>
          </div>
          <div style={pill}>
            <span style={{ opacity: 0.7 }}>Shortcut:</span>{" "}
            <b>Ctrl/⌘+S</b>
          </div>
          <div style={pill}>
            <span style={{ opacity: 0.7 }}>Auto-Save:</span>{" "}
            <b>lokal (debounced)</b>
          </div>
          <div style={pill} title="Fallback, falls Projekt beim Seitenwechsel kurz null ist">
            <span style={{ opacity: 0.7 }}>Sticky:</span>{" "}
            <b>{stickyCode || stickyId || "—"}</b>
          </div>
          <div style={pill} title="Keys used for server fetch">
            <span style={{ opacity: 0.7 }}>Server keys:</span>{" "}
            <b>{projectFsKey || "—"}</b>{" "}
            <span style={{ opacity: 0.6 }}>/</span>{" "}
            <b>{projectId || "—"}</b>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateRows: "minmax(140px, 32vh) minmax(260px, 1fr)",
          gap: 16,
        }}
      >
        {/* LV CARD */}
        <section style={card}>
          <div style={cardTitleRow}>
            <div style={{ minWidth: 260 }}>
              <div style={cardTitle}>Leistungsverzeichnis (Projekt-LV)</div>
              <div style={cardHint}>
                Doppelklick auf eine LV-Zeile, um sie unten ins Aufmaß zu übernehmen.
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <input
                style={{ ...inpBase, width: 320 }}
                placeholder="LV filtern (Pos / Text / Einheit)…"
                value={lvFilter}
                onChange={(e) => setLvFilter(e.target.value)}
              />
              <div style={{ fontSize: 12, color: "#6B7280" }}>
                {lvRows.length ? (
                  <>
                    Treffer: <b>{filteredLv.length}</b> / {lvRows.length}
                  </>
                ) : (
                  <>—</>
                )}
              </div>
            </div>
          </div>

          <div
            style={{
              borderRadius: 10,
              border: "1px solid #E5E7EB",
              overflow: "hidden",
              maxHeight: "100%",
            }}
          >
            {lvLoading ? (
              <div style={{ padding: "0.75rem 0.9rem", fontSize: 13 }}>
                LV wird geladen …
              </div>
            ) : lvError ? (
              <div
                style={{
                  padding: "0.75rem 0.9rem",
                  fontSize: 13,
                  color: "#B91C1C",
                  background: "#FEF2F2",
                }}
              >
                {lvError}
              </div>
            ) : lvRows.length === 0 ? (
              <div style={{ padding: "0.75rem 0.9rem", fontSize: 13, color: "#6B7280" }}>
                Für dieses Projekt wurde noch kein LV gefunden.
              </div>
            ) : (
              <div style={{ maxHeight: 260, overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={th}>Pos.</th>
                      <th style={th}>Kurztext</th>
                      <th style={th}>ME</th>
                      <th style={th}>LV-Menge</th>
                      <th style={th}>EP (netto)</th>
                      <th style={th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLv.map((lv) => (
                      <tr
                        key={lv.id}
                        onDoubleClick={() => addRowFromLv(lv)}
                        style={{ cursor: "pointer", background: "#FFFFFF" }}
                        onMouseEnter={(ev) => {
                          (ev.currentTarget as HTMLTableRowElement).style.background = "#EFF6FF";
                        }}
                        onMouseLeave={(ev) => {
                          (ev.currentTarget as HTMLTableRowElement).style.background = "#FFFFFF";
                        }}
                      >
                        <td style={td}>{lv.pos}</td>
                        <td style={td}>{lv.text}</td>
                        <td style={{ ...td, whiteSpace: "nowrap" }}>{lv.unit}</td>
                        <td style={{ ...td, whiteSpace: "nowrap" }}>
                          {lv.quantity.toLocaleString("de-DE", { maximumFractionDigits: 3 })}
                        </td>
                        <td style={{ ...td, whiteSpace: "nowrap" }}>
                          {lv.ep.toLocaleString("de-DE", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{" "}
                          €
                        </td>
                        <td style={{ ...td, whiteSpace: "nowrap" }}>
                          <button style={btn} onClick={() => addRowFromLv(lv)} type="button">
                            + übernehmen
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* AUFMASS CARD */}
        <section style={card}>
          <div style={toolbar}>
            <button style={btn} onClick={addRow} type="button">
              + Zeile
            </button>

            <button
              style={{ ...btn, ...(selected ? {} : btnDisabled) }}
              onClick={dupRow}
              disabled={!selected}
              type="button"
            >
              Zeile duplizieren
            </button>

            <button
              style={{ ...btn, ...(selected ? {} : btnDisabled) }}
              onClick={delRow}
              disabled={!selected}
              type="button"
            >
              Löschen
            </button>

            <button style={btn} onClick={sortByPos} type="button">
              Sortieren (Pos)
            </button>

            <div style={{ flex: 1 }} />

            <input
              style={{ ...inpBase, width: 280 }}
              placeholder="Aufmaß filtern (Pos / Text / Notiz)…"
              value={rowFilter}
              onChange={(e) => setRowFilter(e.target.value)}
            />

            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <input
                type="checkbox"
                checked={onlyDiff}
                onChange={(e) => setOnlyDiff(e.target.checked)}
              />
              nur Differenzen
            </label>

            <button
              style={btn}
              type="button"
              onClick={async () => {
                if ((!projectFsKey && !projectId) || !projectId) {
                  alert("Kein Projekt gewählt.");
                  return;
                }
                try {
                  const data = await serverLoadAutoKi();
                  const boxes = Array.isArray(data?.boxes) ? data!.boxes! : [];
                  if (!boxes.length) {
                    alert("AutoKI: keine Boxen gefunden.");
                    return;
                  }
                  const note = safeTrim(data?.note) || "AutoKI Import";
                  const autoRows = fromAutoKiBoxesToRows(boxes, note);

                  setRows(autoRows);
                  setSelId(autoRows[0]?.id ?? null);
                  AUFMASS.save(projectId, autoRows);

                  alert(`AutoKI geladen • ${autoRows.length} Zeile(n)`);
                } catch (e: any) {
                  alert(`AutoKI Fehler:\n${e?.message || "Unbekannt"}`);
                }
              }}
              title="Lädt data/projects/<FSKEY>/auto-ki/auto-ki.json"
            >
              AutoKI laden
            </button>

            <button
              style={btn}
              type="button"
              onClick={() => {
                if (!projectFsKey && !projectId) {
                  alert("Kein Projekt gewählt.");
                  return;
                }
                // ✅ Wichtig: beide Keys mitgeben (uuid + code)
                navigate(
                  `/ki/fotoerkennung?projectId=${encodeURIComponent(projectId || "")}&projectKey=${encodeURIComponent(
                    projectFsKey
                  )}&from=aufmasseditor`
                );
              }}
            >
              KI Foto-Aufmaß
            </button>

            <button style={btn} type="button" onClick={() => navigate("/mengenermittlung/position")}>
              Zur Mengenermittlung (LV)
            </button>

            <button style={btn} onClick={exportCsv} type="button">
              CSV exportieren
            </button>

            <button
              style={{ ...btn, ...(loadBusy ? btnDisabled : {}) }}
              onClick={() => void handleLoadAufmass()}
              disabled={loadBusy}
              title={loadBusy ? "Lädt..." : "Aufmaß laden"}
              type="button"
            >
              {loadBusy ? "Lädt…" : "Aufmaß laden"}
            </button>

            <button
              style={{ ...btnPrimary, ...(saving ? btnDisabled : {}) }}
              onClick={() => void handleSaveAufmass()}
              disabled={saving}
              title="Ctrl/⌘+S"
              type="button"
            >
              {saving ? "Speichert…" : "Aufmaß speichern"}
            </button>

            <button style={btn} onClick={handleClearAufmass} type="button">
              Aufmaß zurücksetzen
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateRows: "minmax(220px, 44vh) auto",
              gap: 10,
              paddingTop: 10,
            }}
          >
            {/* Table */}
            <div style={{ borderRadius: 10, border: "1px solid #E5E7EB", overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th}>Pos.</th>
                    <th style={th}>Kurztext</th>
                    <th style={th}>Einheit</th>
                    <th style={th}>LV (Soll)</th>
                    <th style={th}>Ist (Abgerechnet)</th>
                    <th style={th}>Differenz</th>
                    <th style={th}>EP (€)</th>
                    <th style={th}>Faktor</th>
                    <th style={th}>Gesamt</th>
                    <th style={th}>Notiz</th>
                    <th style={th}></th>
                  </tr>
                </thead>

                <tbody>
                  {filteredRows.map((r) => {
                    const factor = r.factor ?? 1;
                    const effEP = r.ep * factor;
                    const total = r.ist * effEP;
                    const diff = r.soll - r.ist;
                    const active = r.id === selId;

                    return (
                      <tr
                        key={r.id}
                        onClick={() => setSelId(r.id)}
                        style={{ cursor: "pointer", ...rowTint(diff, active) }}
                      >
                        <td style={td}>{r.pos}</td>

                        <td style={td}>
                          <input
                            type="text"
                            value={r.text}
                            onChange={(e) => setRow(r.id, { text: e.target.value })}
                            style={inpWide}
                          />
                        </td>

                        <td style={td}>
                          <input
                            type="text"
                            value={r.unit}
                            onChange={(e) => setRow(r.id, { unit: e.target.value })}
                            style={inpMini}
                          />
                        </td>

                        <td style={{ ...td, whiteSpace: "nowrap" }}>
                          <input
                            type="number"
                            step="0.001"
                            value={r.soll}
                            onChange={(e) => onSollChange(r.id, e.target.value)}
                            style={inpMini}
                          />
                        </td>

                        <td style={{ ...td, whiteSpace: "nowrap" }}>
                          {safeTrim(r.formula) ? (
                            <b>{r.ist.toLocaleString("de-DE", { maximumFractionDigits: 3 })}</b>
                          ) : (
                            <input
                              type="number"
                              step="0.001"
                              value={r.ist}
                              onChange={(e) => onIstManualChange(r.id, e.target.value)}
                              style={inpMini}
                            />
                          )}
                        </td>

                        <td style={{ ...td, fontWeight: 700, whiteSpace: "nowrap" }}>
                          {diff.toLocaleString("de-DE", { maximumFractionDigits: 3 })}
                        </td>

                        <td style={td}>
                          <input
                            type="number"
                            step="0.01"
                            value={r.ep}
                            onChange={(e) => onEPChange(r.id, e.target.value)}
                            style={inpMini}
                          />
                        </td>

                        <td style={td}>
                          <input
                            type="number"
                            step="0.01"
                            value={factor}
                            onChange={(e) => onFactorChange(r.id, e.target.value)}
                            style={inpMini}
                          />
                        </td>

                        <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtEUR(total)}</td>

                        <td style={td}>
                          <div
                            title="Notiz öffnen"
                            style={{
                              ...inpWide,
                              cursor: "pointer",
                              background: "rgba(255,255,255,.55)",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setSelId(r.id);
                              setNoteBuffer(r.note ?? "");
                              setNoteOpen(true);
                            }}
                          >
                            {safeTrim(r.note) ? r.note : <span style={{ opacity: 0.6 }}>—</span>}
                          </div>
                        </td>

                        <td style={{ ...td, whiteSpace: "nowrap" }}>
                          <button
                            style={btn}
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setSelId(r.id);
                              setEditBuffer(r.formula ?? "");
                              setEditOpen(true);
                            }}
                          >
                            Formel
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                <tfoot>
                  <tr>
                    <td style={{ ...td, fontWeight: 700 }} colSpan={5}>
                      LV-Summe: {fmtEUR(totals.lvSumme)}
                    </td>
                    <td style={{ ...td, fontWeight: 700 }} colSpan={6}>
                      Summe Total Abgerechnet: {fmtEUR(totals.totalAbgerechnet)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Details */}
            <div style={{ borderRadius: 10, border: "1px solid #E5E7EB", padding: 12 }}>
              {!selected ? (
                <div style={{ opacity: 0.7 }}>Wähle oben eine Position aus.</div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "130px 1fr 130px 1fr",
                    gap: 10,
                    alignItems: "start",
                  }}
                >
                  <label style={lbl}>Pos.</label>
                  <input
                    type="text"
                    value={selected.pos}
                    onChange={(e) => setRow(selected.id, { pos: e.target.value })}
                    style={inpNarrow}
                  />

                  <label style={lbl}>Einheit</label>
                  <input
                    type="text"
                    value={selected.unit}
                    onChange={(e) => setRow(selected.id, { unit: e.target.value })}
                    style={inpNarrow}
                  />

                  <label style={lbl}>Kurztext</label>
                  <input
                    type="text"
                    value={selected.text}
                    onChange={(e) => setRow(selected.id, { text: e.target.value })}
                    style={{ ...inpWide, gridColumn: "2 / span 3" }}
                  />

                  <label style={lbl}>LV (Soll)</label>
                  <input
                    type="number"
                    step="0.001"
                    value={selected.soll}
                    onChange={(e) => onSollChange(selected.id, e.target.value)}
                    style={inpNarrow}
                  />

                  <label style={lbl}>Menge (Formel)</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="text"
                      value={selected.formula}
                      onFocus={openFormulaEditor}
                      readOnly
                      placeholder="Click → Editor"
                      style={{ ...inpWide, cursor: "pointer" }}
                    />
                    <button style={btn} type="button" onClick={openFormulaEditor}>
                      ↗︎ Editor
                    </button>
                  </div>

                  <label style={lbl}>Ist</label>
                  {safeTrim(selected.formula) ? (
                    <div style={{ fontWeight: 700, paddingTop: 6 }}>
                      {selected.ist.toLocaleString("de-DE", { maximumFractionDigits: 3 })}
                      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
                        (berechnet aus Formel)
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        type="number"
                        step="0.001"
                        value={selected.ist}
                        onChange={(e) => onIstManualChange(selected.id, e.target.value)}
                        style={inpNarrow}
                      />
                      <div style={{ fontSize: 12, opacity: 0.7 }}>manuell</div>
                    </div>
                  )}

                  <label style={lbl}>EP (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={selected.ep}
                    onChange={(e) => onEPChange(selected.id, e.target.value)}
                    style={inpNarrow}
                  />

                  <label style={lbl}>Faktor</label>
                  <input
                    type="number"
                    step="0.01"
                    value={selected.factor ?? 1}
                    onChange={(e) => onFactorChange(selected.id, e.target.value)}
                    style={inpNarrow}
                  />

                  <label style={lbl}>Beschreibung</label>
                  <div style={{ gridColumn: "2 / span 3" }}>
                    <div
                      onClick={openNoteEditor}
                      title="Editor öffnen"
                      style={{
                        ...inpWide,
                        minHeight: 40,
                        padding: "8px 10px",
                        cursor: "pointer",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        background: "#F9FAFB",
                      }}
                    >
                      {safeTrim(selected.note)
                        ? selected.note
                        : "z. B. Asphalt im Bereich Nord (klicken für Editor)"}
                    </div>

                    <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
                      <button style={btn} type="button" onClick={openNoteEditor}>
                        Beschreibung bearbeiten
                      </button>
                      <button
                        style={btn}
                        type="button"
                        onClick={() => {
                          const txt = prompt("Kurznotiz:", selected.note ?? "");
                          if (txt === null) return;
                          onNoteChange(selected.id, txt);
                        }}
                      >
                        Schnell edit
                      </button>
                    </div>
                  </div>

                  <label style={lbl}>Gesamt (€)</label>
                  <div style={{ fontWeight: 700, paddingTop: 6 }}>
                    {fmtEUR(selected.ist * (selected.ep * (selected.factor ?? 1)))}
                    <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
                      Eff. EP = EP × Faktor
                    </div>
                  </div>

                  <div style={{ gridColumn: "1 / -1", opacity: 0.75, marginTop: 6, fontSize: 12 }}>
                    Tipp: In <b>Menge (Formel)</b> kannst du Rechenausdrücke eingeben:{" "}
                    <code>3*2</code>, <code>(12+3)/5</code>, <code>2/10</code> …{" "}
                    <span style={{ marginLeft: 10 }}>
                      Speichern: <b>Ctrl/⌘+S</b>
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Formel Modal */}
      {editOpen && (
        <div
          style={modalWrap}
          onMouseDown={(e) => e.target === e.currentTarget && setEditOpen(false)}
        >
          <div style={modalBox}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Formel bearbeiten</div>

            <textarea
              style={modalTextarea}
              value={editBuffer}
              onChange={(e) => setEditBuffer(e.target.value)}
              autoFocus
              placeholder="Schreibe hier die Formel… z.B. (12+3)/5"
            />

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 10,
                fontSize: 12,
                gap: 10,
                alignItems: "center",
              }}
            >
              <div style={{ opacity: 0.7 }}>
                Tastatur: <b>Ctrl/⌘ + Enter</b> speichert, <b>Esc</b> schließt
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button style={btn} onClick={() => setEditOpen(false)} type="button">
                  Abbrechen
                </button>

                <button
                  style={btn}
                  type="button"
                  onClick={() => {
                    setEditBuffer("");
                    if (selected) onFormulaChange(selected.id, "");
                  }}
                  disabled={!selected}
                >
                  Formel löschen
                </button>

                <button
                  style={btnPrimary}
                  type="button"
                  onClick={() => {
                    if (!selected) return;
                    onFormulaChange(selected.id, editBuffer);
                    setEditOpen(false);
                  }}
                >
                  Speichern
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Note Modal */}
      {noteOpen && (
        <div
          style={modalWrap}
          onMouseDown={(e) => e.target === e.currentTarget && setNoteOpen(false)}
        >
          <div style={modalBox}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Beschreibung bearbeiten</div>

            <textarea
              style={modalTextarea}
              value={noteBuffer}
              onChange={(e) => setNoteBuffer(e.target.value)}
              autoFocus
              placeholder="z. B. Asphalt im Bereich Nord"
            />

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 10,
                fontSize: 12,
                gap: 10,
                alignItems: "center",
              }}
            >
              <div style={{ opacity: 0.7 }}>
                Tastatur: <b>Ctrl/⌘ + Enter</b> speichert, <b>Esc</b> schließt
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button style={btn} onClick={() => setNoteOpen(false)} type="button">
                  Abbrechen
                </button>

                <button
                  style={btn}
                  type="button"
                  onClick={() => {
                    setNoteBuffer("");
                    if (selected) onNoteChange(selected.id, "");
                  }}
                  disabled={!selected}
                >
                  Leeren
                </button>

                <button
                  style={btnPrimary}
                  type="button"
                  onClick={() => {
                    if (!selected) return;
                    onNoteChange(selected.id, noteBuffer);
                    setNoteOpen(false);
                  }}
                >
                  Speichern
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
