import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// apps/web/src/pages/aufmass/AufmassEditor.tsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { useProject } from "../../store/useProject";
import { consumeCadExport } from "../../utils/cadImport";
const API = import.meta?.env?.VITE_API_URL ||
    import.meta?.env?.VITE_BACKEND_URL ||
    "https://api.rlcbausoftware.com";
const FOTO_STORAGE_KEY = "rlc-manuell-foto-v1";
/** ✅ Bridge-Keys */
const AUFMASS_LAST_CODE = "RLC_AUFMASS_LAST_CODE";
const AUFMASS_LAST_ID = "RLC_AUFMASS_LAST_ID";
/* ============================================================
   Helper
   ============================================================ */
const fmtEUR = (v) => "€ " + (isFinite(v) ? v.toFixed(2) : "0.00");
function nrmNumber(v, fallback = 0) {
    const x = Number(String(v ?? "").replace(",", "."));
    return isFinite(x) ? x : fallback;
}
function calc(formula) {
    const cleaned = (formula || "")
        .replace(/,/g, ".")
        .replace(/[^\d+\-*/().\s]/g, "");
    if (!cleaned.trim())
        return 0;
    try {
        // eslint-disable-next-line no-new-func
        const f = new Function(`return (${cleaned});`);
        const v = Number(f());
        return isFinite(v) ? v : 0;
    }
    catch {
        return 0;
    }
}
function safeTrim(s) {
    return String(s ?? "").trim();
}
function byPosAsc(a, b) {
    return String(a.pos ?? "").localeCompare(String(b.pos ?? ""), "de-DE", {
        numeric: true,
        sensitivity: "base",
    });
}
function safeUUID() {
    try {
        // @ts-ignore
        if (typeof crypto !== "undefined" && crypto?.randomUUID)
            return crypto.randomUUID();
    }
    catch {
        // ignore
    }
    return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
/* ============================================================
   ✅ UUID helper (NEW)
   ============================================================ */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isUuid(s) {
    return UUID_RE.test(String(s || "").trim());
}
function getLastCode() {
    try {
        return localStorage.getItem(AUFMASS_LAST_CODE);
    }
    catch {
        return null;
    }
}
function setLastCode(k) {
    try {
        localStorage.setItem(AUFMASS_LAST_CODE, k);
    }
    catch {
        // ignore
    }
}
function getLastId() {
    try {
        return localStorage.getItem(AUFMASS_LAST_ID);
    }
    catch {
        return null;
    }
}
function setLastId(k) {
    try {
        localStorage.setItem(AUFMASS_LAST_ID, k);
    }
    catch {
        // ignore
    }
}
/* ============================================================
   Aufmaß-Storage
   - Lokal: IMMER pro UUID (projectId)
   ============================================================ */
const AUFMASS = {
    load(projectId) {
        if (!projectId)
            return [];
        try {
            const key = `RLC_AUFMASS_${projectId}`;
            const raw = localStorage.getItem(key);
            if (!raw)
                return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed))
                return [];
            return parsed;
        }
        catch {
            return [];
        }
    },
    save(projectId, rows) {
        if (!projectId)
            return;
        try {
            const key = `RLC_AUFMASS_${projectId}`;
            localStorage.setItem(key, JSON.stringify(rows));
        }
        catch {
            // ignore
        }
    },
    clear(projectId) {
        if (!projectId)
            return;
        try {
            const key = `RLC_AUFMASS_${projectId}`;
            localStorage.removeItem(key);
        }
        catch {
            // ignore
        }
    },
    selKey(projectId) {
        return `RLC_AUFMASS_SEL_${projectId}`;
    },
    loadSel(projectId) {
        if (!projectId)
            return null;
        try {
            return localStorage.getItem(AUFMASS.selKey(projectId));
        }
        catch {
            return null;
        }
    },
    saveSel(projectId, selId) {
        if (!projectId)
            return;
        try {
            if (!selId)
                localStorage.removeItem(AUFMASS.selKey(projectId));
            else
                localStorage.setItem(AUFMASS.selKey(projectId), selId);
        }
        catch {
            // ignore
        }
    },
};
/* ============================================================
   Layout Styles (Start-Seite Look)
   ============================================================ */
const pageContainer = {
    maxWidth: 1180,
    margin: "0 auto",
    padding: "1.5rem 1.75rem 2rem",
};
const card = {
    background: "#FFFFFF",
    borderRadius: 12,
    border: "1px solid #E5E7EB",
    boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
    padding: "1.25rem 1.5rem 1.5rem",
};
const cardTitleRow = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "0.75rem",
    gap: 12,
};
const cardTitle = {
    fontSize: "1rem",
    fontWeight: 600,
    color: "#111827",
};
const cardHint = {
    fontSize: "0.8rem",
    color: "#9CA3AF",
};
const toolbar = {
    display: "flex",
    gap: 8,
    padding: "6px 10px 10px",
    borderBottom: "1px solid #E5E7EB",
    alignItems: "center",
    flexWrap: "wrap",
};
const btn = {
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
const btnDisabled = {
    opacity: 0.55,
    cursor: "not-allowed",
};
const btnPrimary = {
    ...btn,
    background: "#2563EB",
    borderColor: "#1D4ED8",
    color: "#FFFFFF",
    fontWeight: 500,
};
const th = {
    textAlign: "left",
    padding: "8px 10px",
    borderBottom: "1px solid #E5E7EB",
    fontSize: 12,
    whiteSpace: "nowrap",
    background: "#F9FAFB",
    color: "#4B5563",
};
const td = {
    padding: "6px 10px",
    borderBottom: "1px solid #E5E7EB",
    fontSize: 13,
    verticalAlign: "middle",
};
const lbl = { fontSize: 13, opacity: 0.8 };
const inpBase = {
    border: "1px solid #D1D5DB",
    borderRadius: 8,
    padding: "7px 10px",
    fontSize: 13,
    outline: "none",
};
const inpNarrow = { ...inpBase, width: 140 };
const inpMini = { ...inpBase, width: 110 };
const inpWide = { ...inpBase, width: "100%" };
const pill = {
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
const modalWrap = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,.35)",
    zIndex: 999,
    display: "grid",
    placeItems: "center",
    padding: 20,
};
const modalBox = {
    background: "#fff",
    color: "#111",
    border: "1px solid #E5E7EB",
    borderRadius: 12,
    width: "min(980px,95vw)",
    maxHeight: "82vh",
    padding: 16,
    boxShadow: "0 10px 30px rgba(0,0,0,.2)",
};
const modalTextarea = {
    width: "100%",
    height: "42vh",
    resize: "vertical",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
    fontSize: 14,
    lineHeight: 1.4,
    border: "1px solid #E5E7EB",
    borderRadius: 10,
    padding: 10,
};
function rowTint(diff, active) {
    let bg = diff === 0 ? "#ECFDF3" : diff > 0 ? "#FEF3C7" : "#FEE2E2";
    if (active)
        bg = diff === 0 ? "#DCFCE7" : diff > 0 ? "#FEF9C3" : "#FECACA";
    return { background: bg };
}
function toAufmassJson(rows) {
    return rows.map((r) => ({
        pos: String(r.pos ?? ""),
        text: String(r.text ?? ""),
        unit: String(r.unit ?? "m"),
        soll: Number(r.soll || 0),
        ist: Number(r.ist || 0),
        ep: Number(r.ep || 0),
    }));
}
function fromAufmassJson(rows) {
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
function toSollIst(rows) {
    return toAufmassJson(rows);
}
function fromSollIst(rows) {
    return fromAufmassJson(rows);
}
/* ============================================================
   MERGE helper: aufmass.json + soll-ist.json
   ============================================================ */
function mergeByPos(primary, legacy) {
    const map = new Map();
    const normPos = (p) => String(p ?? "").trim();
    for (const r of primary || []) {
        const k = normPos(r.pos);
        if (!k)
            continue;
        map.set(k, { ...r, pos: k });
    }
    for (const lr of legacy || []) {
        const k = normPos(lr.pos);
        if (!k)
            continue;
        const ex = map.get(k);
        if (!ex) {
            map.set(k, { ...lr, id: safeUUID(), pos: k });
            continue;
        }
        const merged = {
            ...ex,
            pos: k,
            text: ex.text?.trim() ? ex.text : lr.text,
            unit: ex.unit?.trim() ? ex.unit : lr.unit,
            ep: ex.ep && ex.ep > 0 ? ex.ep : lr.ep,
            soll: ex.soll && ex.soll > 0 ? ex.soll : lr.soll,
            ist: Math.max(Number(ex.ist || 0), Number(lr.ist || 0)),
            note: ex.note?.trim() ? ex.note : lr.note,
            factor: ex.factor ?? lr.factor ?? 1,
        };
        map.set(k, merged);
    }
    return Array.from(map.values()).sort(byPosAsc);
}
/* ============================================================
   ✅ NEW: robust server fetch (code + uuid) + merge by pos
   ============================================================ */
function mergeServerRowsByPos(a, b) {
    const map = new Map();
    const norm = (p) => String(p ?? "").trim();
    const put = (r) => {
        const k = norm(r?.pos);
        if (!k)
            return;
        const prev = map.get(k);
        if (!prev) {
            map.set(k, {
                pos: k,
                text: String(r?.text ?? ""),
                unit: String(r?.unit ?? "m"),
                soll: Number(r?.soll ?? 0),
                ist: Number(r?.ist ?? 0),
                ep: Number(r?.ep ?? 0),
            });
            return;
        }
        const next = { ...prev };
        next.ist = Math.max(Number(prev?.ist ?? 0), Number(r?.ist ?? 0));
        if (!safeTrim(next.text) && safeTrim(r?.text))
            next.text = String(r.text);
        if (!safeTrim(next.unit) && safeTrim(r?.unit))
            next.unit = String(r.unit);
        if (!Number(next.ep) && Number(r?.ep))
            next.ep = Number(r.ep);
        if (!Number(next.soll) && Number(r?.soll))
            next.soll = Number(r.soll);
        map.set(k, next);
    };
    (Array.isArray(a) ? a : []).forEach(put);
    (Array.isArray(b) ? b : []).forEach(put);
    return Array.from(map.values());
}
async function fetchRowsForKey(urlBase, key) {
    if (!safeTrim(key))
        return [];
    const url = `${API}${urlBase}/${encodeURIComponent(key)}`;
    const res = await fetch(url);
    if (!res.ok)
        return [];
    const data = await res.json().catch(() => ({}));
    return Array.isArray(data?.rows) ? data.rows : [];
}
function fromAutoKiBoxesToRows(boxes, noteFallback = "AutoKI Import") {
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
export default function AufmassEditor() {
    const navigate = useNavigate();
    const { getSelectedProject } = useProject();
    const project = getSelectedProject();
    /**
     * Sticky (se useProject() beim Seitenwechsel kurz null ist)
     * - code und id getrennt, damit wir NIE code/id vermischen
     */
    const [stickyCode, setStickyCode] = React.useState(() => safeTrim(getLastCode() || ""));
    const [stickyId, setStickyId] = React.useState(() => safeTrim(getLastId() || ""));
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
    const [lvRows, setLvRows] = React.useState([]);
    const [lvLoading, setLvLoading] = React.useState(false);
    const [lvError, setLvError] = React.useState(null);
    // Aufmaß
    const [rows, setRows] = React.useState([]);
    const [selId, setSelId] = React.useState(null);
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
    const initSourceRef = React.useRef("none");
    const fotoImportedRef = React.useRef(false);
    const cadImportedRef = React.useRef(false);
    // debounce ref
    const saveTimerRef = React.useRef(null);
    const selected = rows.find((r) => r.id === selId) || null;
    const setRow = React.useCallback((id, patch) => {
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    }, []);
    /* ---------------------------
       Reset init on project change
       --------------------------- */
    React.useEffect(() => {
        if (!projectId)
            return;
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
        if (!projectId)
            return;
        AUFMASS.saveSel(projectId, selId);
    }, [projectId, selId]);
    /* ---------------------------
       Autosave local on change (debounced)
       --------------------------- */
    React.useEffect(() => {
        if (!projectId)
            return;
        if (!didInitRef.current)
            return;
        if (saveTimerRef.current)
            window.clearTimeout(saveTimerRef.current);
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
        if (!projectId)
            return;
        const onUnload = () => {
            try {
                AUFMASS.save(projectId, rows);
            }
            catch {
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
    const serverLoadAufmass = React.useCallback(async () => {
        const byCode = projectFsKey ? await fetchRowsForKey("/api/aufmass/aufmass", projectFsKey) : [];
        const byId = projectId && projectId !== projectFsKey
            ? await fetchRowsForKey("/api/aufmass/aufmass", projectId)
            : [];
        if (byCode.length && !byId.length)
            return byCode;
        if (!byCode.length && byId.length)
            return byId;
        return mergeServerRowsByPos(byCode, byId);
    }, [projectFsKey, projectId]);
    // ✅ best effort save to BOTH keys (primary=code)
    const serverSaveAufmass = React.useCallback(async (payloadRows) => {
        if (!projectFsKey && !projectId)
            throw new Error("Kein Projekt gewählt");
        const post = async (key) => {
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
        }
        else if (projectId) {
            await post(projectId);
            return;
        }
        // secondary: uuid (fire & forget)
        if (projectId && projectId !== projectFsKey) {
            post(projectId).catch(() => void 0);
        }
    }, [projectFsKey, projectId]);
    // ✅ robust: loads BOTH keys (code + uuid) and merges by pos
    const serverLoadSollIst = React.useCallback(async () => {
        const byCode = projectFsKey ? await fetchRowsForKey("/api/aufmass/soll-ist", projectFsKey) : [];
        const byId = projectId && projectId !== projectFsKey
            ? await fetchRowsForKey("/api/aufmass/soll-ist", projectId)
            : [];
        if (byCode.length && !byId.length)
            return byCode;
        if (!byCode.length && byId.length)
            return byId;
        return mergeServerRowsByPos(byCode, byId);
    }, [projectFsKey, projectId]);
    // ✅ best effort save to BOTH keys (primary=code)
    const serverSaveSollIst = React.useCallback(async (payloadRows) => {
        const post = async (key) => {
            await fetch(`${API}/api/aufmass/soll-ist/${encodeURIComponent(key)}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rows: payloadRows }),
            }).catch(() => void 0);
        };
        if (projectFsKey)
            await post(projectFsKey);
        else if (projectId)
            await post(projectId);
        if (projectId && projectId !== projectFsKey)
            post(projectId);
    }, [projectFsKey, projectId]);
    /* ---------------------------
       AutoKI load (server file)
       --------------------------- */
    const serverLoadAutoKi = React.useCallback(async () => {
        // AutoKI è per FS-key (code). Se non c’è, prova anche UUID.
        const tryKey = async (key) => {
            const url = `${API}/api/auto-ki/${encodeURIComponent(key)}`;
            const res = await fetch(url);
            if (!res.ok)
                return null;
            const data = await res.json().catch(() => null);
            return data;
        };
        if (projectFsKey) {
            const a = await tryKey(projectFsKey);
            if (a)
                return a;
        }
        if (projectId && projectId !== projectFsKey) {
            const b = await tryKey(projectId);
            if (b)
                return b;
        }
        return null;
    }, [projectFsKey, projectId]);
    /* ---------------------------
       LV load
       --------------------------- */
    const fetchJson = React.useCallback(async (url) => {
        const res = await fetch(url);
        const txt = await res.text().catch(() => "");
        if (!res.ok)
            throw new Error(txt || `HTTP ${res.status} (${url})`);
        try {
            return txt ? JSON.parse(txt) : {};
        }
        catch {
            return {};
        }
    }, []);
    const mapAnyToLvPositions = React.useCallback((list) => {
        const arr = Array.isArray(list) ? list : [];
        return arr.map((x, idx) => ({
            id: String(x.id ?? x.lvPosId ?? x.posId ?? idx),
            pos: String(x.pos ??
                x.position ??
                x.posNr ??
                x.nr ??
                x.positionsnummer ??
                x.positionsNummer ??
                ""),
            text: String(x.text ?? x.kurztext ?? x.title ?? x.langtext ?? "ohne Text"),
            unit: String(x.unit ?? x.einheit ?? x.me ?? "m"),
            quantity: Number(x.soll ?? x.menge ?? x.quantity ?? x.qty ?? 0),
            ep: Number(x.ep ?? x.einheitspreis ?? x.price ?? x.unitPrice ?? 0),
        }));
    }, []);
    const extractLvListFromNewEndpoint = React.useCallback((data) => {
        const rows = Array.isArray(data?.rows) ? data.rows : [];
        const latest = rows[0];
        const positions = Array.isArray(latest?.positions) ? latest.positions : [];
        return positions;
    }, []);
    const extractLvListFromOldEndpoint = React.useCallback((data) => {
        if (Array.isArray(data?.items))
            return data.items;
        if (Array.isArray(data?.lv))
            return data.lv;
        if (Array.isArray(data))
            return data;
        return [];
    }, []);
    const loadLvPagedNew = React.useCallback(async (pid) => {
        const pageSize = 500;
        const maxPages = 50;
        const all = [];
        for (let page = 1; page <= maxPages; page++) {
            const data = await fetchJson(`${API}/api/projects/${encodeURIComponent(pid)}/lv?page=${page}&pageSize=${pageSize}`);
            const list = extractLvListFromNewEndpoint(data);
            if (Array.isArray(list) && list.length) {
                all.push(...list);
                if (list.length < pageSize)
                    break;
            }
            else {
                break;
            }
        }
        return all;
    }, [fetchJson, extractLvListFromNewEndpoint]);
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
                        if (!cancelled)
                            setLvRows(mapped);
                        return;
                    }
                    catch (eNew) {
                        console.warn("[LV] new endpoint failed, trying legacy:", eNew?.message || eNew);
                    }
                }
                // 2) LEGACY endpoint (code OR uuid)
                if (!lvLegacyKey)
                    throw new Error("Projekt nicht gefunden (keine project key vorhanden)");
                const dataLegacy = await fetchJson(`${API}/api/project-lv/${encodeURIComponent(lvLegacyKey)}`);
                const listLegacy = extractLvListFromOldEndpoint(dataLegacy);
                const mappedLegacy = mapAnyToLvPositions(listLegacy);
                if (!cancelled)
                    setLvRows(mappedLegacy);
            }
            catch (e) {
                console.error(e);
                if (!cancelled) {
                    setLvError(e?.message || "Fehler beim Laden des LV");
                    setLvRows([]);
                }
            }
            finally {
                if (!cancelled)
                    setLvLoading(false);
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
    const isPristineFallback = React.useCallback((arr) => {
        if (!Array.isArray(arr) || arr.length !== 1)
            return false;
        const r = arr[0];
        return (safeTrim(r.pos) === "001.001" &&
            safeTrim(r.text) === "Neue Position" &&
            nrmNumber(r.ep) === 0 &&
            nrmNumber(r.soll) === 0 &&
            safeTrim(r.formula) === "" &&
            nrmNumber(r.ist) === 0);
    }, []);
    React.useEffect(() => {
        if (didInitRef.current)
            return;
        if (!projectId && !projectFsKey)
            return;
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
                            setSelId(storedSel && merged.some((x) => x.id === storedSel)
                                ? storedSel
                                : merged[0]?.id ?? null);
                            AUFMASS.save(projectId, merged);
                        }
                        else {
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
                }
                catch {
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
                            setSelId(storedSel && mapped.some((x) => x.id === storedSel)
                                ? storedSel
                                : mapped[0]?.id ?? null);
                            AUFMASS.save(projectId, mapped);
                        }
                        else {
                            setSelId(mapped[0]?.id ?? null);
                        }
                        didInitRef.current = true;
                        initSourceRef.current = "server-legacy";
                        return;
                    }
                }
                catch {
                    // ignore
                }
            }
            // 2b) AutoKI (server file) — prima del local/LV
            if ((projectFsKey || projectId) && projectId) {
                try {
                    const auto = await serverLoadAutoKi();
                    const boxes = Array.isArray(auto?.boxes) ? auto.boxes : [];
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
                }
                catch {
                    // ignore
                }
            }
            // 3) local (uuid)
            if (projectId) {
                const stored = AUFMASS.load(projectId);
                if (!cancelled && stored.length) {
                    setRows(stored);
                    const storedSel = AUFMASS.loadSel(projectId);
                    setSelId(storedSel && stored.some((x) => x.id === storedSel)
                        ? storedSel
                        : stored[0]?.id ?? null);
                    didInitRef.current = true;
                    initSourceRef.current = "local";
                    return;
                }
            }
            // 4) LV
            if (!cancelled && lvRows.length && projectId) {
                const mapped = lvRows.map((lv) => ({
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
                const fallback = [
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
        if (!didInitRef.current)
            return;
        if (initSourceRef.current !== "fallback")
            return;
        if (!projectId)
            return;
        if (!lvRows.length)
            return;
        setRows((prev) => {
            if (!isPristineFallback(prev))
                return prev;
            const mapped = lvRows.map((lv) => ({
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
        if (!didInitRef.current)
            return;
        if (!projectId)
            return;
        if (fotoImportedRef.current)
            return;
        try {
            const raw = localStorage.getItem(FOTO_STORAGE_KEY);
            if (!raw)
                return;
            const parsed = JSON.parse(raw);
            const extras = Array.isArray(parsed?.extras)
                ? parsed.extras
                : undefined;
            if (!extras || extras.length === 0)
                return;
            const note = String(parsed?.note || "Aus Foto / KI übernommen");
            setRows((prev) => {
                const base = [...prev];
                extras.forEach((ex) => {
                    if (!ex?.beschreibung || !String(ex.beschreibung).trim())
                        return;
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
        }
        catch (e) {
            console.error("Fehler beim Import aus Foto-Aufmaß", e);
        }
    }, [projectId]);
    /* ============================================================
       CAD Import (einmalig) über URL flag ?import=cad
     ============================================================ */
    React.useEffect(() => {
        if (cadImportedRef.current)
            return;
        if (!projectId)
            return;
        const hasFlag = new URLSearchParams(window.location.search).get("import") === "cad";
        if (!hasFlag)
            return;
        const item = consumeCadExport("aufmasseditor");
        if (!item)
            return;
        const unit = item.kind === "AREA" ? "m²" : "m";
        const ist = item.kind === "AREA" ? item.area_m2 ?? 0 : item.length_m ?? 0;
        setRows((prev) => {
            const idx = prev.filter((x) => String(x.pos || "").startsWith("CAD.")).length + 1;
            const r = {
                id: safeUUID(),
                pos: "CAD." + String(idx).padStart(3, "0"),
                text: (item.label ?? item.layer ?? "CAD-Element") +
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
        }
        catch (e) {
            console.error(e);
            alert(`Lokal gespeichert, aber Server-Fehler:\n${e?.message || "Unbekannter Fehler"}`);
        }
        finally {
            setSaving(false);
        }
    }, [projectFsKey, projectId, rows, serverSaveAufmass, serverSaveSollIst]);
    const handleLoadAufmass = React.useCallback(async () => {
        if ((!projectFsKey && !projectId) || !projectId) {
            alert("Kein Projekt gewählt.");
            return;
        }
        if (loadBusy)
            return;
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
        }
        catch (e) {
            console.error(e);
            const stored = AUFMASS.load(projectId);
            if (stored.length) {
                setRows(stored);
                setSelId(stored[0]?.id ?? null);
                alert(`Server-Fehler beim Laden.\nFallback: lokal geladen • ${stored.length} Zeile(n)\n\n${e?.message || "Unbekannter Fehler"}`);
                return;
            }
            alert(`Fehler beim Laden:\n${e?.message || "Unbekannter Fehler"}`);
        }
        finally {
            setLoadBusy(false);
        }
    }, [projectFsKey, projectId, loadBusy, serverLoadAufmass, serverLoadSollIst]);
    const handleClearAufmass = React.useCallback(() => {
        if (!projectId)
            return;
        if (!window.confirm("Gesamtes Aufmaß für dieses Projekt wirklich löschen?\n\nHinweis: Das entfernt nur den lokalen Speicher."))
            return;
        AUFMASS.clear(projectId);
        const fallback = [
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
    const onFormulaChange = React.useCallback((id, formula) => {
        const v = calc(formula);
        setRow(id, { formula, ist: v });
    }, [setRow]);
    const onEPChange = React.useCallback((id, v) => setRow(id, { ep: nrmNumber(v, 0) }), [setRow]);
    const onSollChange = React.useCallback((id, v) => setRow(id, { soll: nrmNumber(v, 0) }), [setRow]);
    const onIstManualChange = React.useCallback((id, v) => {
        const ist = nrmNumber(v, 0);
        setRow(id, { ist, formula: "" });
    }, [setRow]);
    const onFactorChange = React.useCallback((id, v) => {
        const f = nrmNumber(v, 1);
        setRow(id, { factor: isFinite(f) && f > 0 ? f : 1 });
    }, [setRow]);
    const onNoteChange = React.useCallback((id, val) => setRow(id, { note: val }), [setRow]);
    /* ============================================================
       Row operations
     ============================================================ */
    const addRow = React.useCallback(() => {
        setRows((prev) => {
            const n = prev.length + 1;
            const r = {
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
    const addRowFromLv = React.useCallback((lv) => {
        const r = {
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
        if (!selected)
            return;
        const copy = {
            ...selected,
            id: safeUUID(),
            pos: selected.pos + "a",
        };
        setRows((p) => [...p, copy]);
        setSelId(copy.id);
    }, [selected]);
    const delRow = React.useCallback(() => {
        if (!selected)
            return;
        if (!window.confirm(`Position ${selected.pos} wirklich löschen?`))
            return;
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
        const totalAbgerechnet = rows.reduce((s, r) => s + r.ist * r.ep * (r.factor ?? 1), 0);
        const lvSumme = rows.reduce((s, r) => s + r.soll * r.ep, 0);
        const diffSum = rows.reduce((s, r) => s + (r.soll - r.ist) * r.ep, 0);
        return { totalAbgerechnet, lvSumme, diffSum };
    }, [rows]);
    const filteredLv = React.useMemo(() => {
        const q = safeTrim(lvFilter).toLowerCase();
        if (!q)
            return lvRows;
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
        if (!selected)
            return;
        setEditBuffer(selected.formula ?? "");
        setEditOpen(true);
    }, [selected]);
    const openNoteEditor = React.useCallback(() => {
        if (!selected)
            return;
        setNoteBuffer(selected.note ?? "");
        setNoteOpen(true);
    }, [selected]);
    /* ============================================================
       Keyboard shortcuts (Ctrl/Cmd+S)
     ============================================================ */
    React.useEffect(() => {
        const onKey = (e) => {
            if (editOpen &&
                (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey)))) {
                e.preventDefault();
                if (e.key === "Escape") {
                    setEditOpen(false);
                }
                else if (selected) {
                    onFormulaChange(selected.id, editBuffer);
                    setEditOpen(false);
                }
            }
            if (noteOpen &&
                (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey)))) {
                e.preventDefault();
                if (e.key === "Escape") {
                    setNoteOpen(false);
                }
                else if (selected) {
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
    return (_jsxs("div", { style: pageContainer, children: [_jsxs("div", { style: { marginBottom: 14 }, children: [_jsx("div", { style: { fontSize: 12, color: "#6B7280", marginBottom: 4 }, children: "RLC / 2. Mengenermittlung / Aufma\u00DF-Editor" }), _jsx("div", { style: { fontSize: 18, fontWeight: 600, color: "#111827" }, children: "Aufma\u00DF-Editor" }), project && (_jsxs("div", { style: { marginTop: 2, fontSize: 13, color: "#4B5563" }, children: [_jsx("b", { children: project.code }), " \u2014 ", project.name, project.client ? ` • ${project.client}` : "", project.place ? ` • ${project.place}` : ""] })), _jsxs("div", { style: { marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }, children: [_jsxs("div", { style: pill, children: [_jsx("span", { style: { opacity: 0.7 }, children: "LV-Summe:" }), " ", _jsx("b", { children: fmtEUR(totals.lvSumme) })] }), _jsxs("div", { style: pill, children: [_jsx("span", { style: { opacity: 0.7 }, children: "Abgerechnet:" }), " ", _jsx("b", { children: fmtEUR(totals.totalAbgerechnet) })] }), _jsxs("div", { style: pill, children: [_jsx("span", { style: { opacity: 0.7 }, children: "\u0394 (Soll\u2013Ist) in \u20AC:" }), " ", _jsx("b", { children: fmtEUR(totals.diffSum) })] }), _jsxs("div", { style: pill, children: [_jsx("span", { style: { opacity: 0.7 }, children: "Init:" }), " ", _jsx("b", { children: initSourceRef.current })] }), _jsxs("div", { style: pill, children: [_jsx("span", { style: { opacity: 0.7 }, children: "Shortcut:" }), " ", _jsx("b", { children: "Ctrl/\u2318+S" })] }), _jsxs("div", { style: pill, children: [_jsx("span", { style: { opacity: 0.7 }, children: "Auto-Save:" }), " ", _jsx("b", { children: "lokal (debounced)" })] }), _jsxs("div", { style: pill, title: "Fallback, falls Projekt beim Seitenwechsel kurz null ist", children: [_jsx("span", { style: { opacity: 0.7 }, children: "Sticky:" }), " ", _jsx("b", { children: stickyCode || stickyId || "—" })] }), _jsxs("div", { style: pill, title: "Keys used for server fetch", children: [_jsx("span", { style: { opacity: 0.7 }, children: "Server keys:" }), " ", _jsx("b", { children: projectFsKey || "—" }), " ", _jsx("span", { style: { opacity: 0.6 }, children: "/" }), " ", _jsx("b", { children: projectId || "—" })] })] })] }), _jsxs("div", { style: {
                    display: "grid",
                    gridTemplateRows: "minmax(140px, 32vh) minmax(260px, 1fr)",
                    gap: 16,
                }, children: [_jsxs("section", { style: card, children: [_jsxs("div", { style: cardTitleRow, children: [_jsxs("div", { style: { minWidth: 260 }, children: [_jsx("div", { style: cardTitle, children: "Leistungsverzeichnis (Projekt-LV)" }), _jsx("div", { style: cardHint, children: "Doppelklick auf eine LV-Zeile, um sie unten ins Aufma\u00DF zu \u00FCbernehmen." })] }), _jsxs("div", { style: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }, children: [_jsx("input", { style: { ...inpBase, width: 320 }, placeholder: "LV filtern (Pos / Text / Einheit)\u2026", value: lvFilter, onChange: (e) => setLvFilter(e.target.value) }), _jsx("div", { style: { fontSize: 12, color: "#6B7280" }, children: lvRows.length ? (_jsxs(_Fragment, { children: ["Treffer: ", _jsx("b", { children: filteredLv.length }), " / ", lvRows.length] })) : (_jsx(_Fragment, { children: "\u2014" })) })] })] }), _jsx("div", { style: {
                                    borderRadius: 10,
                                    border: "1px solid #E5E7EB",
                                    overflow: "hidden",
                                    maxHeight: "100%",
                                }, children: lvLoading ? (_jsx("div", { style: { padding: "0.75rem 0.9rem", fontSize: 13 }, children: "LV wird geladen \u2026" })) : lvError ? (_jsx("div", { style: {
                                        padding: "0.75rem 0.9rem",
                                        fontSize: 13,
                                        color: "#B91C1C",
                                        background: "#FEF2F2",
                                    }, children: lvError })) : lvRows.length === 0 ? (_jsx("div", { style: { padding: "0.75rem 0.9rem", fontSize: 13, color: "#6B7280" }, children: "F\u00FCr dieses Projekt wurde noch kein LV gefunden." })) : (_jsx("div", { style: { maxHeight: 260, overflow: "auto" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: 12 }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: th, children: "Pos." }), _jsx("th", { style: th, children: "Kurztext" }), _jsx("th", { style: th, children: "ME" }), _jsx("th", { style: th, children: "LV-Menge" }), _jsx("th", { style: th, children: "EP (netto)" }), _jsx("th", { style: th })] }) }), _jsx("tbody", { children: filteredLv.map((lv) => (_jsxs("tr", { onDoubleClick: () => addRowFromLv(lv), style: { cursor: "pointer", background: "#FFFFFF" }, onMouseEnter: (ev) => {
                                                        ev.currentTarget.style.background = "#EFF6FF";
                                                    }, onMouseLeave: (ev) => {
                                                        ev.currentTarget.style.background = "#FFFFFF";
                                                    }, children: [_jsx("td", { style: td, children: lv.pos }), _jsx("td", { style: td, children: lv.text }), _jsx("td", { style: { ...td, whiteSpace: "nowrap" }, children: lv.unit }), _jsx("td", { style: { ...td, whiteSpace: "nowrap" }, children: lv.quantity.toLocaleString("de-DE", { maximumFractionDigits: 3 }) }), _jsxs("td", { style: { ...td, whiteSpace: "nowrap" }, children: [lv.ep.toLocaleString("de-DE", {
                                                                    minimumFractionDigits: 2,
                                                                    maximumFractionDigits: 2,
                                                                }), " ", "\u20AC"] }), _jsx("td", { style: { ...td, whiteSpace: "nowrap" }, children: _jsx("button", { style: btn, onClick: () => addRowFromLv(lv), type: "button", children: "+ \u00FCbernehmen" }) })] }, lv.id))) })] }) })) })] }), _jsxs("section", { style: card, children: [_jsxs("div", { style: toolbar, children: [_jsx("button", { style: btn, onClick: addRow, type: "button", children: "+ Zeile" }), _jsx("button", { style: { ...btn, ...(selected ? {} : btnDisabled) }, onClick: dupRow, disabled: !selected, type: "button", children: "Zeile duplizieren" }), _jsx("button", { style: { ...btn, ...(selected ? {} : btnDisabled) }, onClick: delRow, disabled: !selected, type: "button", children: "L\u00F6schen" }), _jsx("button", { style: btn, onClick: sortByPos, type: "button", children: "Sortieren (Pos)" }), _jsx("div", { style: { flex: 1 } }), _jsx("input", { style: { ...inpBase, width: 280 }, placeholder: "Aufma\u00DF filtern (Pos / Text / Notiz)\u2026", value: rowFilter, onChange: (e) => setRowFilter(e.target.value) }), _jsxs("label", { style: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }, children: [_jsx("input", { type: "checkbox", checked: onlyDiff, onChange: (e) => setOnlyDiff(e.target.checked) }), "nur Differenzen"] }), _jsx("button", { style: btn, type: "button", onClick: async () => {
                                            if ((!projectFsKey && !projectId) || !projectId) {
                                                alert("Kein Projekt gewählt.");
                                                return;
                                            }
                                            try {
                                                const data = await serverLoadAutoKi();
                                                const boxes = Array.isArray(data?.boxes) ? data.boxes : [];
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
                                            }
                                            catch (e) {
                                                alert(`AutoKI Fehler:\n${e?.message || "Unbekannt"}`);
                                            }
                                        }, title: "L\u00E4dt data/projects/<FSKEY>/auto-ki/auto-ki.json", children: "AutoKI laden" }), _jsx("button", { style: btn, type: "button", onClick: () => {
                                            if (!projectFsKey && !projectId) {
                                                alert("Kein Projekt gewählt.");
                                                return;
                                            }
                                            // ✅ Wichtig: beide Keys mitgeben (uuid + code)
                                            navigate(`/ki/fotoerkennung?projectId=${encodeURIComponent(projectId || "")}&projectKey=${encodeURIComponent(projectFsKey)}&from=aufmasseditor`);
                                        }, children: "KI Foto-Aufma\u00DF" }), _jsx("button", { style: btn, type: "button", onClick: () => navigate("/mengenermittlung/position"), children: "Zur Mengenermittlung (LV)" }), _jsx("button", { style: btn, onClick: exportCsv, type: "button", children: "CSV exportieren" }), _jsx("button", { style: { ...btn, ...(loadBusy ? btnDisabled : {}) }, onClick: () => void handleLoadAufmass(), disabled: loadBusy, title: loadBusy ? "Lädt..." : "Aufmaß laden", type: "button", children: loadBusy ? "Lädt…" : "Aufmaß laden" }), _jsx("button", { style: { ...btnPrimary, ...(saving ? btnDisabled : {}) }, onClick: () => void handleSaveAufmass(), disabled: saving, title: "Ctrl/\u2318+S", type: "button", children: saving ? "Speichert…" : "Aufmaß speichern" }), _jsx("button", { style: btn, onClick: handleClearAufmass, type: "button", children: "Aufma\u00DF zur\u00FCcksetzen" })] }), _jsxs("div", { style: {
                                    display: "grid",
                                    gridTemplateRows: "minmax(220px, 44vh) auto",
                                    gap: 10,
                                    paddingTop: 10,
                                }, children: [_jsx("div", { style: { borderRadius: 10, border: "1px solid #E5E7EB", overflow: "auto" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: th, children: "Pos." }), _jsx("th", { style: th, children: "Kurztext" }), _jsx("th", { style: th, children: "Einheit" }), _jsx("th", { style: th, children: "LV (Soll)" }), _jsx("th", { style: th, children: "Ist (Abgerechnet)" }), _jsx("th", { style: th, children: "Differenz" }), _jsx("th", { style: th, children: "EP (\u20AC)" }), _jsx("th", { style: th, children: "Faktor" }), _jsx("th", { style: th, children: "Gesamt" }), _jsx("th", { style: th, children: "Notiz" }), _jsx("th", { style: th })] }) }), _jsx("tbody", { children: filteredRows.map((r) => {
                                                        const factor = r.factor ?? 1;
                                                        const effEP = r.ep * factor;
                                                        const total = r.ist * effEP;
                                                        const diff = r.soll - r.ist;
                                                        const active = r.id === selId;
                                                        return (_jsxs("tr", { onClick: () => setSelId(r.id), style: { cursor: "pointer", ...rowTint(diff, active) }, children: [_jsx("td", { style: td, children: r.pos }), _jsx("td", { style: td, children: _jsx("input", { type: "text", value: r.text, onChange: (e) => setRow(r.id, { text: e.target.value }), style: inpWide }) }), _jsx("td", { style: td, children: _jsx("input", { type: "text", value: r.unit, onChange: (e) => setRow(r.id, { unit: e.target.value }), style: inpMini }) }), _jsx("td", { style: { ...td, whiteSpace: "nowrap" }, children: _jsx("input", { type: "number", step: "0.001", value: r.soll, onChange: (e) => onSollChange(r.id, e.target.value), style: inpMini }) }), _jsx("td", { style: { ...td, whiteSpace: "nowrap" }, children: safeTrim(r.formula) ? (_jsx("b", { children: r.ist.toLocaleString("de-DE", { maximumFractionDigits: 3 }) })) : (_jsx("input", { type: "number", step: "0.001", value: r.ist, onChange: (e) => onIstManualChange(r.id, e.target.value), style: inpMini })) }), _jsx("td", { style: { ...td, fontWeight: 700, whiteSpace: "nowrap" }, children: diff.toLocaleString("de-DE", { maximumFractionDigits: 3 }) }), _jsx("td", { style: td, children: _jsx("input", { type: "number", step: "0.01", value: r.ep, onChange: (e) => onEPChange(r.id, e.target.value), style: inpMini }) }), _jsx("td", { style: td, children: _jsx("input", { type: "number", step: "0.01", value: factor, onChange: (e) => onFactorChange(r.id, e.target.value), style: inpMini }) }), _jsx("td", { style: { ...td, whiteSpace: "nowrap" }, children: fmtEUR(total) }), _jsx("td", { style: td, children: _jsx("div", { title: "Notiz \u00F6ffnen", style: {
                                                                            ...inpWide,
                                                                            cursor: "pointer",
                                                                            background: "rgba(255,255,255,.55)",
                                                                            whiteSpace: "nowrap",
                                                                            overflow: "hidden",
                                                                            textOverflow: "ellipsis",
                                                                        }, onClick: (ev) => {
                                                                            ev.stopPropagation();
                                                                            setSelId(r.id);
                                                                            setNoteBuffer(r.note ?? "");
                                                                            setNoteOpen(true);
                                                                        }, children: safeTrim(r.note) ? r.note : _jsx("span", { style: { opacity: 0.6 }, children: "\u2014" }) }) }), _jsx("td", { style: { ...td, whiteSpace: "nowrap" }, children: _jsx("button", { style: btn, type: "button", onClick: (ev) => {
                                                                            ev.stopPropagation();
                                                                            setSelId(r.id);
                                                                            setEditBuffer(r.formula ?? "");
                                                                            setEditOpen(true);
                                                                        }, children: "Formel" }) })] }, r.id));
                                                    }) }), _jsx("tfoot", { children: _jsxs("tr", { children: [_jsxs("td", { style: { ...td, fontWeight: 700 }, colSpan: 5, children: ["LV-Summe: ", fmtEUR(totals.lvSumme)] }), _jsxs("td", { style: { ...td, fontWeight: 700 }, colSpan: 6, children: ["Summe Total Abgerechnet: ", fmtEUR(totals.totalAbgerechnet)] })] }) })] }) }), _jsx("div", { style: { borderRadius: 10, border: "1px solid #E5E7EB", padding: 12 }, children: !selected ? (_jsx("div", { style: { opacity: 0.7 }, children: "W\u00E4hle oben eine Position aus." })) : (_jsxs("div", { style: {
                                                display: "grid",
                                                gridTemplateColumns: "130px 1fr 130px 1fr",
                                                gap: 10,
                                                alignItems: "start",
                                            }, children: [_jsx("label", { style: lbl, children: "Pos." }), _jsx("input", { type: "text", value: selected.pos, onChange: (e) => setRow(selected.id, { pos: e.target.value }), style: inpNarrow }), _jsx("label", { style: lbl, children: "Einheit" }), _jsx("input", { type: "text", value: selected.unit, onChange: (e) => setRow(selected.id, { unit: e.target.value }), style: inpNarrow }), _jsx("label", { style: lbl, children: "Kurztext" }), _jsx("input", { type: "text", value: selected.text, onChange: (e) => setRow(selected.id, { text: e.target.value }), style: { ...inpWide, gridColumn: "2 / span 3" } }), _jsx("label", { style: lbl, children: "LV (Soll)" }), _jsx("input", { type: "number", step: "0.001", value: selected.soll, onChange: (e) => onSollChange(selected.id, e.target.value), style: inpNarrow }), _jsx("label", { style: lbl, children: "Menge (Formel)" }), _jsxs("div", { style: { display: "flex", gap: 8 }, children: [_jsx("input", { type: "text", value: selected.formula, onFocus: openFormulaEditor, readOnly: true, placeholder: "Click \u2192 Editor", style: { ...inpWide, cursor: "pointer" } }), _jsx("button", { style: btn, type: "button", onClick: openFormulaEditor, children: "\u2197\uFE0E Editor" })] }), _jsx("label", { style: lbl, children: "Ist" }), safeTrim(selected.formula) ? (_jsxs("div", { style: { fontWeight: 700, paddingTop: 6 }, children: [selected.ist.toLocaleString("de-DE", { maximumFractionDigits: 3 }), _jsx("div", { style: { fontSize: 12, opacity: 0.7, marginTop: 2 }, children: "(berechnet aus Formel)" })] })) : (_jsxs("div", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [_jsx("input", { type: "number", step: "0.001", value: selected.ist, onChange: (e) => onIstManualChange(selected.id, e.target.value), style: inpNarrow }), _jsx("div", { style: { fontSize: 12, opacity: 0.7 }, children: "manuell" })] })), _jsx("label", { style: lbl, children: "EP (\u20AC)" }), _jsx("input", { type: "number", step: "0.01", value: selected.ep, onChange: (e) => onEPChange(selected.id, e.target.value), style: inpNarrow }), _jsx("label", { style: lbl, children: "Faktor" }), _jsx("input", { type: "number", step: "0.01", value: selected.factor ?? 1, onChange: (e) => onFactorChange(selected.id, e.target.value), style: inpNarrow }), _jsx("label", { style: lbl, children: "Beschreibung" }), _jsxs("div", { style: { gridColumn: "2 / span 3" }, children: [_jsx("div", { onClick: openNoteEditor, title: "Editor \u00F6ffnen", style: {
                                                                ...inpWide,
                                                                minHeight: 40,
                                                                padding: "8px 10px",
                                                                cursor: "pointer",
                                                                overflow: "hidden",
                                                                textOverflow: "ellipsis",
                                                                whiteSpace: "nowrap",
                                                                background: "#F9FAFB",
                                                            }, children: safeTrim(selected.note)
                                                                ? selected.note
                                                                : "z. B. Asphalt im Bereich Nord (klicken für Editor)" }), _jsxs("div", { style: { marginTop: 6, display: "flex", gap: 8 }, children: [_jsx("button", { style: btn, type: "button", onClick: openNoteEditor, children: "Beschreibung bearbeiten" }), _jsx("button", { style: btn, type: "button", onClick: () => {
                                                                        const txt = prompt("Kurznotiz:", selected.note ?? "");
                                                                        if (txt === null)
                                                                            return;
                                                                        onNoteChange(selected.id, txt);
                                                                    }, children: "Schnell edit" })] })] }), _jsx("label", { style: lbl, children: "Gesamt (\u20AC)" }), _jsxs("div", { style: { fontWeight: 700, paddingTop: 6 }, children: [fmtEUR(selected.ist * (selected.ep * (selected.factor ?? 1))), _jsx("div", { style: { fontSize: 12, opacity: 0.7, marginTop: 2 }, children: "Eff. EP = EP \u00D7 Faktor" })] }), _jsxs("div", { style: { gridColumn: "1 / -1", opacity: 0.75, marginTop: 6, fontSize: 12 }, children: ["Tipp: In ", _jsx("b", { children: "Menge (Formel)" }), " kannst du Rechenausdr\u00FCcke eingeben:", " ", _jsx("code", { children: "3*2" }), ", ", _jsx("code", { children: "(12+3)/5" }), ", ", _jsx("code", { children: "2/10" }), " \u2026", " ", _jsxs("span", { style: { marginLeft: 10 }, children: ["Speichern: ", _jsx("b", { children: "Ctrl/\u2318+S" })] })] })] })) })] })] })] }), editOpen && (_jsx("div", { style: modalWrap, onMouseDown: (e) => e.target === e.currentTarget && setEditOpen(false), children: _jsxs("div", { style: modalBox, children: [_jsx("div", { style: { fontWeight: 700, marginBottom: 8 }, children: "Formel bearbeiten" }), _jsx("textarea", { style: modalTextarea, value: editBuffer, onChange: (e) => setEditBuffer(e.target.value), autoFocus: true, placeholder: "Schreibe hier die Formel\u2026 z.B. (12+3)/5" }), _jsxs("div", { style: {
                                display: "flex",
                                justifyContent: "space-between",
                                marginTop: 10,
                                fontSize: 12,
                                gap: 10,
                                alignItems: "center",
                            }, children: [_jsxs("div", { style: { opacity: 0.7 }, children: ["Tastatur: ", _jsx("b", { children: "Ctrl/\u2318 + Enter" }), " speichert, ", _jsx("b", { children: "Esc" }), " schlie\u00DFt"] }), _jsxs("div", { style: { display: "flex", gap: 8 }, children: [_jsx("button", { style: btn, onClick: () => setEditOpen(false), type: "button", children: "Abbrechen" }), _jsx("button", { style: btn, type: "button", onClick: () => {
                                                setEditBuffer("");
                                                if (selected)
                                                    onFormulaChange(selected.id, "");
                                            }, disabled: !selected, children: "Formel l\u00F6schen" }), _jsx("button", { style: btnPrimary, type: "button", onClick: () => {
                                                if (!selected)
                                                    return;
                                                onFormulaChange(selected.id, editBuffer);
                                                setEditOpen(false);
                                            }, children: "Speichern" })] })] })] }) })), noteOpen && (_jsx("div", { style: modalWrap, onMouseDown: (e) => e.target === e.currentTarget && setNoteOpen(false), children: _jsxs("div", { style: modalBox, children: [_jsx("div", { style: { fontWeight: 700, marginBottom: 8 }, children: "Beschreibung bearbeiten" }), _jsx("textarea", { style: modalTextarea, value: noteBuffer, onChange: (e) => setNoteBuffer(e.target.value), autoFocus: true, placeholder: "z. B. Asphalt im Bereich Nord" }), _jsxs("div", { style: {
                                display: "flex",
                                justifyContent: "space-between",
                                marginTop: 10,
                                fontSize: 12,
                                gap: 10,
                                alignItems: "center",
                            }, children: [_jsxs("div", { style: { opacity: 0.7 }, children: ["Tastatur: ", _jsx("b", { children: "Ctrl/\u2318 + Enter" }), " speichert, ", _jsx("b", { children: "Esc" }), " schlie\u00DFt"] }), _jsxs("div", { style: { display: "flex", gap: 8 }, children: [_jsx("button", { style: btn, onClick: () => setNoteOpen(false), type: "button", children: "Abbrechen" }), _jsx("button", { style: btn, type: "button", onClick: () => {
                                                setNoteBuffer("");
                                                if (selected)
                                                    onNoteChange(selected.id, "");
                                            }, disabled: !selected, children: "Leeren" }), _jsx("button", { style: btnPrimary, type: "button", onClick: () => {
                                                if (!selected)
                                                    return;
                                                onNoteChange(selected.id, noteBuffer);
                                                setNoteOpen(false);
                                            }, children: "Speichern" })] })] })] }) }))] }));
}
