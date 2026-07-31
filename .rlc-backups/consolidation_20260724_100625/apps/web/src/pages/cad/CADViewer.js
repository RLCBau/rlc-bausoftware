import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// apps/web/src/pages/cad/CADViewer.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useProject } from "../../store/useProject";
const API = import.meta?.env?.VITE_API_URL ||
    import.meta?.env?.VITE_BACKEND_URL ||
    "https://api.rlcbausoftware.com";
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
function Btn({ children, onClick, title, disabled, style, primary, }) {
    return (_jsx("button", { type: "button", title: title, onClick: onClick, disabled: disabled, style: {
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
        }, children: children }));
}
function Card({ title, subtitle, children, big, style, }) {
    return (_jsxs("div", { style: {
            border: `1px solid ${ui.border}`,
            borderRadius: 16,
            padding: big ? 16 : 14,
            background: ui.panel,
            boxShadow: ui.shadow,
            ...style,
        }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", gap: 10 }, children: [_jsx("div", { style: {
                            fontWeight: 950,
                            color: ui.text,
                            letterSpacing: 0.2,
                            fontSize: big ? 15 : 14,
                        }, children: title }), subtitle ? (_jsx("div", { style: { fontSize: 12, color: ui.sub, marginTop: 2 }, children: subtitle })) : null] }), _jsx("div", { style: { marginTop: 12 }, children: children })] }));
}
function Input(props) {
    return (_jsx("input", { ...props, style: {
            width: "100%",
            height: 36,
            borderRadius: 12,
            border: `1px solid ${ui.border}`,
            padding: "0 12px",
            fontSize: 13,
            outline: "none",
            background: ui.panel,
            ...(props.style || {}),
        } }));
}
function Select(props) {
    return (_jsx("select", { ...props, style: {
            width: "100%",
            height: 36,
            borderRadius: 12,
            border: `1px solid ${ui.border}`,
            padding: "0 10px",
            fontSize: 13,
            outline: "none",
            background: ui.panel,
            ...(props.style || {}),
        } }));
}
function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
}
function dist(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}
function polylineLength(pts) {
    let s = 0;
    for (let i = 0; i < pts.length - 1; i++)
        s += dist(pts[i], pts[i + 1]);
    return s;
}
function polyArea(pts) {
    if (pts.length < 3)
        return 0;
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const q = pts[(i + 1) % pts.length];
        s += p.x * q.y - q.x * p.y;
    }
    return Math.abs(s) / 2;
}
/** CSV parser minimal (server already provides utm.csv) */
function parseUtmCsvFlexible(text) {
    const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"));
    if (!lines.length)
        return [];
    const first = lines[0];
    const delimiter = first.includes(";") ? ";" : first.includes("\t") ? "\t" : ",";
    const maybeHeader = first.toLowerCase();
    const hasHeader = maybeHeader.includes("east") ||
        maybeHeader.includes("rechts") ||
        maybeHeader.includes("x") ||
        maybeHeader.includes("north") ||
        maybeHeader.includes("hoch") ||
        maybeHeader.includes("y");
    const pts = [];
    if (hasHeader) {
        const header = first.split(delimiter).map((x) => x.trim().toLowerCase());
        const eIdx = header.findIndex((h) => ["e", "east", "easting", "rechtswert", "x"].includes(h)) ?? -1;
        const nIdx = header.findIndex((h) => ["n", "north", "northing", "hochwert", "y"].includes(h)) ?? -1;
        const idIdx = header.findIndex((h) => ["id", "name", "punkt", "label"].includes(h));
        for (let i = 1; i < lines.length; i++) {
            const c = lines[i].split(delimiter).map((x) => x.trim());
            const E = Number(String(c[eIdx] ?? "").replace(",", "."));
            const N = Number(String(c[nIdx] ?? "").replace(",", "."));
            if (!Number.isFinite(E) || !Number.isFinite(N))
                continue;
            const id = idIdx >= 0 ? String(c[idIdx] ?? "").trim() : `P_${pts.length + 1}`;
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
        if (c.length < 2)
            continue;
        const n0 = Number(String(c[0]).replace(",", "."));
        const n1 = Number(String(c[1]).replace(",", "."));
        const n2 = c.length >= 3 ? Number(String(c[2]).replace(",", ".")) : NaN;
        let id = "";
        let E = null;
        let N = null;
        if (!Number.isFinite(n0) && Number.isFinite(n1) && Number.isFinite(n2)) {
            id = c[0];
            E = n1;
            N = n2;
        }
        else if (Number.isFinite(n0) && Number.isFinite(n1)) {
            E = n0;
            N = n1;
            id = c.length >= 3 ? c.slice(2).join(" ").trim() : "";
        }
        else {
            continue;
        }
        if (E === null || N === null)
            continue;
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
async function fetchJson(url) {
    const res = await fetch(url);
    const txt = await res.text().catch(() => "");
    if (!res.ok)
        throw new Error(txt || `HTTP ${res.status}`);
    try {
        return txt ? JSON.parse(txt) : {};
    }
    catch {
        return {};
    }
}
function mapAnyToLvPositions(list) {
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
}
function extractLvListFromNewEndpoint(data) {
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    const latest = rows[0];
    const positions = Array.isArray(latest?.positions) ? latest.positions : [];
    return positions;
}
function extractLvListFromOldEndpoint(data) {
    if (Array.isArray(data?.items))
        return data.items;
    if (Array.isArray(data?.lv))
        return data.lv;
    if (Array.isArray(data))
        return data;
    return [];
}
/** ===== KI helpers ===== */
function normText(s) {
    return String(s || "")
        .toLowerCase()
        .replace(/[_\-./\\]+/g, " ")
        .replace(/[^a-z0-9äöüß\s]+/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
}
function tokens(s) {
    const t = normText(s).split(" ").filter(Boolean);
    return t.filter((x) => x.length >= 3);
}
function scoreMatch(query, text) {
    const q = tokens(query);
    const t = tokens(text);
    if (!q.length || !t.length)
        return 0;
    const tset = new Set(t);
    let hit = 0;
    for (const w of q)
        if (tset.has(w))
            hit++;
    const nt = normText(text);
    let substr = 0;
    for (const w of q)
        if (nt.includes(w))
            substr++;
    const base = hit / q.length;
    const bonus = Math.min(0.25, substr * 0.05);
    return clamp(base + bonus, 0, 1);
}
function pickLayerGroup(layer) {
    const s = String(layer || "").trim();
    if (!s)
        return "—";
    const n = normText(s);
    const t = n.split(" ").filter(Boolean);
    if (!t.length)
        return s;
    return t.slice(0, Math.min(2, t.length)).join(" ");
}
function uiUnitLabel(u) {
    return u === "m2" ? "m²" : u;
}
/** ================== Component ================== */
export default function CADViewer() {
    const ctx = useProject();
    const current = ctx?.currentProject || null;
    const autoProjectId = (current?.code || "").trim();
    const [projectId, setProjectId] = useState(() => {
        const urlPid = new URLSearchParams(window.location.search).get("projectId") || "";
        const lsPid = localStorage.getItem("rlc_projectId") ||
            localStorage.getItem("rlc_active_project") ||
            localStorage.getItem("projectId") ||
            "";
        return (autoProjectId || urlPid || lsPid || "").trim();
    });
    useEffect(() => {
        if (autoProjectId && autoProjectId !== projectId)
            setProjectId(autoProjectId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoProjectId]);
    const [status, setStatus] = useState("Bereit");
    const [paths, setPaths] = useState(null);
    const [utmCsv, setUtmCsv] = useState("");
    const [utmPoints, setUtmPoints] = useState([]);
    const [takeoff, setTakeoff] = useState(null);
    const [features, setFeatures] = useState([]);
    const [selectedFeatureId, setSelectedFeatureId] = useState("");
    // Snapshot
    const [snapshotTick, setSnapshotTick] = useState(0);
    const [snapshotErr, setSnapshotErr] = useState(""); // show friendly message
    const selectedFeature = useMemo(() => features.find((f) => (f.id || "") === selectedFeatureId) || null, [features, selectedFeatureId]);
    // Aufmaß mapping manual
    const [pos, setPos] = useState("001");
    const [kurz, setKurz] = useState("BricsCAD Takeoff");
    const [unit, setUnit] = useState("m");
    const [factor, setFactor] = useState(1);
    // LV for KI Step B
    const [lvPositions, setLvPositions] = useState([]);
    const [lvState, setLvState] = useState("idle");
    // KI UI
    const [kiSelectedKey, setKiSelectedKey] = useState("");
    const [chosenLvPos, setChosenLvPos] = useState("");
    // KI overrides
    const [kiPos, setKiPos] = useState("001");
    const [kiText, setKiText] = useState("KI: —");
    const [kiUnit, setKiUnit] = useState("m");
    const [kiFactor, setKiFactor] = useState(1);
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
    const normalizeFeatures = (payload) => {
        const feats = Array.isArray(payload?.normalized?.features)
            ? payload.normalized.features
            : Array.isArray(payload?.features)
                ? payload.features
                : Array.isArray(payload?.data?.features)
                    ? payload.data.features
                    : [];
        return feats.map((f, idx) => {
            const id = (f.id || f.name || `F_${idx + 1}`).toString();
            const pts = Array.isArray(f.pts) ? f.pts : [];
            const length = typeof f.length === "number"
                ? f.length
                : pts.length >= 2
                    ? polylineLength(pts)
                    : 0;
            const area = typeof f.area === "number"
                ? f.area
                : (f.kind === "polygon" || f.closed) && pts.length >= 3
                    ? polyArea(pts)
                    : 0;
            return { ...f, id, pts, length, area };
        });
    };
    /** ===== Restore Takeoff cache on mount / project change ===== */
    useEffect(() => {
        if (!TAKEOFF_CACHE_KEY)
            return;
        try {
            const raw = localStorage.getItem(TAKEOFF_CACHE_KEY);
            if (!raw)
                return;
            const parsed = JSON.parse(raw);
            if (!parsed?.payload)
                return;
            const feats = normalizeFeatures(parsed.payload);
            setTakeoff(parsed.payload);
            setFeatures(feats);
            setSelectedFeatureId((prev) => prev || feats[0]?.id || "");
            setStatus(`Takeoff aus Cache (${feats.length} Features)`);
        }
        catch {
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
                    const data = await fetchJson(`${API}/api/projects/${encodeURIComponent(projectDbId)}/lv?page=1&pageSize=200`);
                    const list = extractLvListFromNewEndpoint(data);
                    const mapped = mapAnyToLvPositions(list);
                    if (!cancelled) {
                        setLvPositions(mapped);
                        setLvState("ok");
                    }
                    return;
                }
                catch {
                    // fallback legacy
                }
                const legacy = await fetchJson(`${API}/api/project-lv/${encodeURIComponent(projectDbId)}`);
                const listLegacy = extractLvListFromOldEndpoint(legacy);
                const mappedLegacy = mapAnyToLvPositions(listLegacy);
                if (!cancelled) {
                    setLvPositions(mappedLegacy);
                    setLvState("ok");
                }
            }
            catch {
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
        if (!projectId)
            return alert("Kein Projekt gewählt (projectId).");
        setStatus("Paths laden...");
        try {
            const res = await fetch(`${API}/api/bricscad/paths?projectId=${encodeURIComponent(projectId)}`);
            const j = (await res.json().catch(() => null));
            if (!res.ok || !j?.ok) {
                setStatus("Paths Fehler");
                return alert(j?.message || "Paths laden fehlgeschlagen.");
            }
            setPaths(j.paths || null);
            setStatus("Paths geladen");
        }
        catch (e) {
            setStatus("Paths Fehler");
            alert(String(e?.message || e));
        }
    };
    const loadUtm = async () => {
        if (!projectId)
            return alert("Kein Projekt gewählt (projectId).");
        setStatus("UTM laden...");
        try {
            const res = await fetch(`${API}/api/bricscad/utm?projectId=${encodeURIComponent(projectId)}`);
            const j = (await res.json().catch(() => null));
            if (!res.ok || !j?.ok) {
                setStatus("UTM Fehler");
                return alert(j?.message || "UTM laden fehlgeschlagen.");
            }
            const csv = String(j.csv || "");
            setUtmCsv(csv);
            const pts = parseUtmCsvFlexible(csv);
            setUtmPoints(pts);
            setStatus(`UTM geladen (${pts.length} Punkte)`);
        }
        catch (e) {
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
        if (!projectId)
            return alert("Kein Projekt gewählt (projectId).");
        setStatus("Takeoff laden...");
        try {
            const res = await fetch(`${API}/api/bricscad/takeoff?projectId=${encodeURIComponent(projectId)}`);
            const j = (await res.json().catch(() => null));
            if (!res.ok || !j?.ok) {
                setStatus("Takeoff Fehler");
                return alert(j?.message || "Takeoff laden fehlgeschlagen.");
            }
            const payload = (j.data || j);
            setTakeoff(payload);
            const feats = normalizeFeatures(payload);
            setFeatures(feats);
            setSelectedFeatureId(feats[0]?.id || "");
            setStatus(`Takeoff geladen (${feats.length} Features)`);
            if (TAKEOFF_CACHE_KEY) {
                localStorage.setItem(TAKEOFF_CACHE_KEY, JSON.stringify({ ts: Date.now(), payload }));
            }
            // ✅ convenience: after takeoff load, refresh snapshot too
            reloadSnapshot();
        }
        catch (e) {
            setStatus("Takeoff Fehler");
            alert(String(e?.message || e));
        }
    };
    const openBricsCAD = async () => {
        if (!projectId)
            return alert("Kein Projekt gewählt (projectId).");
        setStatus("BricsCAD öffnen...");
        try {
            const res = await fetch(`${API}/api/bricscad/open?projectId=${encodeURIComponent(projectId)}`);
            const txt = await res.text().catch(() => "");
            let j = null;
            try {
                j = txt ? JSON.parse(txt) : null;
            }
            catch {
                j = null;
            }
            if (!res.ok || (j && j.ok === false)) {
                setStatus("BricsCAD open nicht verfügbar");
                alert((j?.message ||
                    "Server-Endpoint /api/bricscad/open ist nicht verfügbar."));
                return;
            }
            setStatus("BricsCAD gestartet");
            alert("BricsCAD gestartet (wenn Server/OS Route unterstützt).");
        }
        catch (e) {
            setStatus("BricsCAD open Fehler");
            alert(String(e?.message || e));
        }
    };
    const qtyPreview = useMemo(() => {
        if (!selectedFeature)
            return 0;
        const pts = Array.isArray(selectedFeature.pts) ? selectedFeature.pts : [];
        const length = selectedFeature.length ??
            (pts.length >= 2 ? polylineLength(pts) : 0);
        const area = selectedFeature.area ??
            ((selectedFeature.kind === "polygon" || selectedFeature.closed) &&
                pts.length >= 3
                ? polyArea(pts)
                : 0);
        const base = unit === "m" ? length : unit === "m2" ? area : 1;
        const f = Number.isFinite(factor) ? factor : 1;
        return base * f;
    }, [selectedFeature, unit, factor]);
    const pushToAufmass = async (override) => {
        // ✅ usa sempre il filesystem key coerente: prima code, poi fallback
        const fsProjectKey = String((current?.code || projectId || "").trim());
        if (!fsProjectKey)
            return alert("Kein Projekt gewählt (projectId).");
        const finalPos = String(override?.pos ?? pos).trim();
        if (!finalPos)
            return alert("Positionsnummer fehlt.");
        if (!selectedFeature && typeof override?.qty !== "number") {
            return alert("Keine Takeoff-Feature ausgewählt.");
        }
        const length = selectedFeature?.length ?? 0;
        const area = selectedFeature?.area ?? 0;
        const qtyBase = typeof override?.qty === "number"
            ? override.qty
            : unit === "m"
                ? length
                : unit === "m2"
                    ? area
                    : 1;
        const f = Number.isFinite(factor) ? factor : 1;
        const finalUnit = (override?.unit ?? unit);
        const finalText = String(override?.text ?? kurz ?? "BricsCAD Takeoff").trim();
        const qtyFinal = qtyBase * (typeof override?.qty === "number" ? 1 : f);
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
                factor: f,
                ki: !!override,
            },
        };
        const tryPost = async (url, body) => {
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const txt = await res.text().catch(() => "");
            let j = null;
            try {
                j = txt ? JSON.parse(txt) : null;
            }
            catch {
                j = null;
            }
            // ✅ criterio "ok" più tollerante
            const ok = res.ok &&
                (j?.ok === true ||
                    j?.success === true ||
                    j?.status === "ok" ||
                    j?.error == null);
            return { ok, res, j, txt };
        };
        const tryGet = async (url) => {
            const res = await fetch(url);
            const txt = await res.text().catch(() => "");
            let j = null;
            try {
                j = txt ? JSON.parse(txt) : null;
            }
            catch {
                j = null;
            }
            return { ok: res.ok, res, j, txt };
        };
        setStatus("Übernahme → Aufmaß...");
        // ✅ 1) tentativi POST (coprono montaggi diversi)
        const appendPayload = {
            rows: [
                {
                    pos: row.pos,
                    text: row.text,
                    unit: row.unit,
                    istDelta: Number(row.qty || 0),
                },
            ],
        };
        const postAttempts = [
            // (a) se hai ancora questa route sul server
            () => tryPost(`${API}/api/aufmass/add-from-cad`, { projectId: fsProjectKey, row }),
            () => tryPost(`${API}/api/add-from-cad`, { projectId: fsProjectKey, row }),
            // (b) soll-ist append: mount su /api/aufmass
            () => tryPost(`${API}/api/aufmass/soll-ist/${encodeURIComponent(fsProjectKey)}/append`, appendPayload),
            // (c) soll-ist append: mount su /api
            () => tryPost(`${API}/api/soll-ist/${encodeURIComponent(fsProjectKey)}/append`, appendPayload),
            // (d) fallback alias “doppio aufmass” (se qualcuno chiama /aufmass/aufmass/..)
            () => tryPost(`${API}/api/aufmass/aufmass/soll-ist/${encodeURIComponent(fsProjectKey)}/append`, appendPayload),
        ];
        let lastErr = null;
        for (const run of postAttempts) {
            try {
                const r = await run();
                if (r.ok) {
                    // ✅ 2) verifica immediata: leggo il soll-ist
                    const getAttempts = [
                        `${API}/api/aufmass/soll-ist/${encodeURIComponent(fsProjectKey)}`,
                        `${API}/api/soll-ist/${encodeURIComponent(fsProjectKey)}`,
                        `${API}/api/aufmass/aufmass/soll-ist/${encodeURIComponent(fsProjectKey)}`,
                    ];
                    for (const u of getAttempts) {
                        const g = await tryGet(u);
                        if (g.ok) {
                            const rows = Array.isArray(g?.j?.rows) ? g.j.rows : [];
                            setStatus(`In Aufmaß übernommen (${rows.length} Zeilen)`);
                            alert(`Takeoff in Aufmaß übernommen.\nAktuelle Zeilen: ${rows.length}`);
                            return;
                        }
                    }
                    // se POST ok ma GET non trova, almeno segnalo che il POST è riuscito
                    setStatus("In Aufmaß übernommen (POST ok, GET nicht erreichbar)");
                    alert("Takeoff in Aufmaß übernommen (POST ok). Bitte AufmaßEditor neu laden.");
                    return;
                }
                else {
                    lastErr = r;
                }
            }
            catch (e) {
                lastErr = e;
            }
        }
        console.error("[CADViewer] pushToAufmass failed:", lastErr);
        setStatus("Übernahme fehlgeschlagen");
        alert("Übernahme fehlgeschlagen.\n\n" +
            "Sehr wahrscheinlich 404 / Route-Mount mismatch.\n" +
            "Bitte öffne DevTools → Network → klicke nochmal und schick mir:\n" +
            "- die Request-URL\n" +
            "- Status Code\n" +
            "- Response text");
    };
    /** Snapshot URL (✅ stable, refreshable) */
    const snapshotUrl = useMemo(() => {
        if (!projectId)
            return "";
        const tick = snapshotTick || 0;
        return `${API}/api/bricscad/snapshot?projectId=${encodeURIComponent(projectId)}&t=${tick}`;
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
    const kiRows = useMemo(() => {
        if (!features.length)
            return [];
        const list = [];
        const map = new Map();
        for (const f of features) {
            const lg = pickLayerGroup(f.layer);
            const lvPosGuess = String(f?.meta?.lvPos ?? pos ?? "001").trim().toString() || "001";
            const inferredUnit = typeof f.area === "number" && f.area > 0 ? "m2" : "m";
            const qty = inferredUnit === "m2" ? Number(f.area || 0) : Number(f.length || 0);
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
            }
            else {
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
        if (!kiRows.length)
            return;
        if (!kiSelectedKey)
            setKiSelectedKey(kiRows[0].key);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [kiRows.length]);
    const kiSelected = useMemo(() => kiRows.find((r) => r.key === kiSelectedKey) || null, [kiRows, kiSelectedKey]);
    /** ================== KI Step B (LV mapping suggestions) ================== */
    const lvSuggestions = useMemo(() => {
        if (!kiSelected)
            return [];
        if (!lvPositions.length)
            return [];
        const query = `${kiSelected.layerGroup} ${kiSelected.exampleLayer || ""} ${kiSelected.exampleName || ""}`;
        const scored = lvPositions
            .map((p) => {
            const s = Math.max(scoreMatch(query, `${p.pos} ${p.text}`), scoreMatch(kiSelected.layerGroup, p.text), scoreMatch(kiSelected.exampleLayer || "", p.text));
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
        if (!kiSelected)
            return;
        const chosen = chosenLvPos
            ? lvSuggestions.find((s) => s.pos === chosenLvPos)
            : null;
        let finalPos = kiSelected.lvPos;
        let finalText = `KI: ${kiSelected.layerGroup}`;
        let finalUnit = kiSelected.unit;
        if (chosen) {
            finalPos = chosen.pos;
            finalText = chosen.text;
            const u = String(chosen.unit || "").toLowerCase();
            if (u.includes("m2") || u.includes("m²"))
                finalUnit = "m2";
            else if (u.includes("stk") || u.includes("st"))
                finalUnit = "Stk";
            else
                finalUnit = "m";
        }
        setKiPos(finalPos || "001");
        setKiText(finalText || "KI: —");
        setKiUnit(finalUnit);
        setKiFactor(1);
    }, [kiSelectedKey, chosenLvPos, lvSuggestions, kiSelected]);
    const kiQtyPreview = useMemo(() => {
        if (!kiSelected)
            return 0;
        const f = Number.isFinite(kiFactor) ? kiFactor : 1;
        return Number(kiSelected.qty || 0) * f;
    }, [kiSelected, kiFactor]);
    const kiApply = async () => {
        if (!kiSelected)
            return;
        const finalPos = String(kiPos || kiSelected.lvPos || "001").trim() || "001";
        const finalText = String(kiText || `KI: ${kiSelected.layerGroup}`).trim();
        const finalUnit = kiUnit || kiSelected.unit;
        const qty = kiQtyPreview;
        await pushToAufmass({
            pos: finalPos,
            text: finalText,
            unit: finalUnit,
            qty,
        });
    };
    const hints = useMemo(() => {
        const lines = [];
        lines.push("Takeoff bleibt im Cache (auch nach Seitenwechsel).");
        lines.push("KI Step A: Gruppierung nach Pos + Layer-Gruppe + Einheit.");
        lines.push("KI Step B: Vorschläge aus Projekt-LV (falls LV geladen werden kann).");
        lines.push("projectId = Ordnername unter data/projects/ (z.B. BA-2025-DEMO).");
        return lines;
    }, []);
    // Ensure we have a first snapshot attempt when project is set
    useEffect(() => {
        if (!projectId)
            return;
        reloadSnapshot();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId]);
    return (_jsx("div", { style: { padding: 14, background: ui.bg, minHeight: "calc(100vh - 120px)" }, children: _jsxs("div", { style: { display: "grid", gap: 14, alignItems: "start" }, children: [_jsxs("div", { style: {
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 14,
                        alignItems: "stretch", // ✅ equal height
                    }, children: [_jsx(Card, { title: "Projekt", subtitle: "BricsCAD-Dateipfade basieren auf projectId (= Projektcode)", big: true, style: { height: "100%", display: "flex", flexDirection: "column" }, children: _jsxs("div", { style: { display: "grid", gap: 10, height: "100%" }, children: [_jsxs("div", { style: { fontSize: 12, color: ui.sub, lineHeight: 1.45 }, children: ["Aktuell gew\u00E4hlt:", " ", _jsx("b", { style: { color: ui.text }, children: current ? `${current.code} – ${current.name}` : "—" })] }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 120px", gap: 10 }, children: [_jsx(Input, { value: projectId, onChange: (e) => setProjectId(e.target.value), placeholder: "z.B. BA-2025-DEMO" }), _jsx(Btn, { onClick: saveProjectIdToLS, children: "Set" })] }), _jsxs("div", { style: { display: "flex", gap: 10, flexWrap: "wrap" }, children: [_jsx(Btn, { onClick: loadPaths, title: "Zeigt die erwarteten Pfade am Server", children: "Paths / Debug" }), _jsx(Btn, { onClick: loadUtm, children: "UTM laden" }), _jsx(Btn, { onClick: loadTakeoff, primary: true, children: "Takeoff laden" }), _jsx(Btn, { onClick: openBricsCAD, children: "BricsCAD \u00F6ffnen" })] }), paths ? (_jsxs("div", { style: { fontSize: 12, color: ui.text, lineHeight: 1.45 }, children: [_jsx("div", { style: { color: ui.sub, fontWeight: 900, marginBottom: 6 }, children: "Server erwartet:" }), _jsxs("div", { children: [_jsx("b", { children: "utm.csv:" }), " ", paths.utmCsvPath] }), _jsxs("div", { children: [_jsx("b", { children: "takeoff.json:" }), " ", paths.takeoffJsonPath] }), paths.snapshotPngPath ? (_jsxs("div", { children: [_jsx("b", { children: "snapshot.png:" }), " ", paths.snapshotPngPath] })) : null] })) : (_jsxs("div", { style: { fontSize: 12, color: ui.sub, lineHeight: 1.45 }, children: ["Tipp: zuerst ", _jsx("b", { children: "Paths / Debug" }), " klicken \u2192 dann siehst du sofort, ob projectId stimmt."] })), _jsxs("div", { style: { borderTop: `1px solid ${ui.border}`, paddingTop: 10 }, children: [_jsx("div", { style: { fontSize: 12, color: ui.sub, fontWeight: 900, marginBottom: 6 }, children: "Hinweise" }), _jsx("ul", { style: { margin: 0, paddingLeft: 18, fontSize: 12, color: ui.sub, lineHeight: 1.5 }, children: hints.map((h) => (_jsx("li", { children: h }, h))) })] }), _jsxs("div", { style: { fontSize: 12, color: ui.sub }, children: ["LV-Status (f\u00FCr KI Step B):", " ", _jsx("b", { style: { color: ui.text }, children: lvState === "loading"
                                                    ? "lädt…"
                                                    : lvState === "ok"
                                                        ? `${lvPositions.length} Positionen`
                                                        : lvState === "error"
                                                            ? "Fehler"
                                                            : "—" })] })] }) }), _jsxs(Card, { title: "BricsCAD Snapshot", subtitle: "Server: /api/bricscad/snapshot", big: true, style: { height: "100%", display: "flex", flexDirection: "column" }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }, children: [_jsxs("div", { style: { fontSize: 12, color: ui.sub, lineHeight: 1.45 }, children: ["Vorschau von ", _jsx("b", { children: "snapshot.png" }), " (aus BricsCAD exportiert)."] }), _jsx(Btn, { onClick: reloadSnapshot, disabled: !projectId, title: "Cache-Busting Reload", children: "Reload" })] }), _jsx("div", { style: {
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
                                    }, children: !projectId ? (_jsx("div", { style: { color: ui.sub, fontSize: 12 }, children: "Kein Projekt gesetzt." })) : snapshotErr ? (_jsxs("div", { style: { padding: 14, textAlign: "center" }, children: [_jsx("div", { style: { fontSize: 12, color: ui.warn, fontWeight: 950 }, children: "Snapshot nicht verf\u00FCgbar" }), _jsx("div", { style: { marginTop: 6, fontSize: 12, color: ui.sub, lineHeight: 1.45 }, children: snapshotErr }), _jsxs("div", { style: { marginTop: 10, fontSize: 12, color: ui.sub }, children: ["In BricsCAD: ", _jsx("b", { children: "\u201ESnapshot: snapshot.png (1 Klick)\u201D" }), " ausf\u00FChren, dann hier Reload."] })] })) : (_jsx("img", { src: snapshotUrl, alt: "BricsCAD Snapshot", style: {
                                            width: "100%",
                                            height: "100%",
                                            objectFit: "contain", // ✅ key
                                            display: "block",
                                        }, onLoad: () => setSnapshotErr(""), onError: () => {
                                            setSnapshotErr("Kein Bild gefunden (404) oder Endpoint fehlt. Prüfe: " +
                                                "/api/bricscad/snapshot?projectId=" +
                                                projectId +
                                                " sowie ob snapshot.png im Projektordner existiert.");
                                        } })) })] })] }), _jsx(Card, { title: "Takeoff", subtitle: features.length ? `${features.length} Features` : "—", big: true, children: _jsx("div", { style: { display: "grid", gap: 14 }, children: _jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 420px", gap: 14, alignItems: "start" }, children: [_jsxs("div", { children: [_jsx("div", { style: { fontSize: 12, color: ui.sub, fontWeight: 900, marginBottom: 6 }, children: "Feature ausw\u00E4hlen" }), _jsx(Select, { value: selectedFeatureId, onChange: (e) => setSelectedFeatureId(e.target.value), disabled: !featureOptions.length, children: !featureOptions.length ? (_jsx("option", { value: "", children: "\u2014 keine Features \u2014" })) : (featureOptions.map((o) => (_jsx("option", { value: o.id, children: o.label }, o.id)))) }), selectedFeature ? (_jsxs("div", { style: { marginTop: 10, fontSize: 12, color: ui.text, lineHeight: 1.6 }, children: [_jsxs("div", { children: [_jsx("span", { style: { color: ui.sub }, children: "Layer:" }), " ", _jsx("b", { children: selectedFeature.layer || "-" })] }), _jsxs("div", { children: [_jsx("span", { style: { color: ui.sub }, children: "Kind:" }), " ", _jsx("b", { children: selectedFeature.kind || "-" })] }), _jsxs("div", { children: [_jsx("span", { style: { color: ui.sub }, children: "L\u00E4nge:" }), " ", _jsxs("b", { children: [(selectedFeature.length ?? 0).toFixed(3), " m"] })] }), _jsxs("div", { children: [_jsx("span", { style: { color: ui.sub }, children: "Fl\u00E4che:" }), " ", _jsxs("b", { children: [(selectedFeature.area ?? 0).toFixed(3), " m\u00B2"] })] })] })) : (_jsx("div", { style: { marginTop: 10, fontSize: 12, color: ui.sub }, children: "Lade Takeoff, dann kannst du Features ausw\u00E4hlen." }))] }), _jsxs("div", { style: {
                                        border: `1px solid ${ui.border}`,
                                        borderRadius: 16,
                                        padding: 12,
                                        background: "#fff",
                                    }, children: [_jsx("div", { style: { fontSize: 12, color: ui.sub, fontWeight: 950, marginBottom: 8 }, children: "Aufma\u00DF-\u00DCbernahme (manuell)" }), _jsxs("div", { style: { display: "grid", gap: 10 }, children: [_jsx(Input, { value: pos, onChange: (e) => setPos(e.target.value), placeholder: "Position (LV)" }), _jsx(Input, { value: kurz, onChange: (e) => setKurz(e.target.value), placeholder: "Kurztext" }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }, children: [_jsxs(Select, { value: unit, onChange: (e) => setUnit(e.target.value), children: [_jsx("option", { value: "m", children: "m" }), _jsx("option", { value: "m2", children: "m\u00B2" }), _jsx("option", { value: "Stk", children: "Stk" })] }), _jsx(Input, { value: String(factor), onChange: (e) => setFactor(clamp(Number(e.target.value) || 1, 0.0001, 1e9)), inputMode: "decimal", placeholder: "Faktor" })] }), _jsxs("div", { style: { fontSize: 12, color: ui.text }, children: ["Menge (Vorschau): ", _jsx("b", { children: qtyPreview.toFixed(3) }), " ", uiUnitLabel(unit)] }), _jsx(Btn, { primary: true, onClick: () => void pushToAufmass(), disabled: !selectedFeature || !pos.trim() || !projectId, style: { height: 44, justifyContent: "center", fontSize: 13 }, children: "Auswahl \u2192 Aufma\u00DF \u00FCbernehmen" }), _jsx("div", { style: { fontSize: 12, color: ui.sub, lineHeight: 1.4 }, children: "Speichert auf dem Server (sichtbar im Aufma\u00DFEditor)." })] })] })] }) }) }), _jsx(Card, { title: "KI Vorschl\u00E4ge", subtitle: "Step A = Gruppierung \u2022 Step B = LV-Mapping", big: true, children: !features.length ? (_jsxs("div", { style: { marginTop: 6, fontSize: 12, color: ui.sub }, children: ["Keine Vorschl\u00E4ge. Lade zuerst ", _jsx("b", { children: "Takeoff" }), "."] })) : (_jsxs("div", { style: { display: "grid", gap: 14 }, children: [_jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 420px", gap: 14, alignItems: "start" }, children: [_jsxs("div", { children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }, children: [_jsxs("div", { style: { fontWeight: 950, color: ui.text }, children: ["Ausgew\u00E4hlt:", " ", _jsx("span", { style: { color: ui.sub }, children: kiSelected ? kiSelected.lvPos : "—" }), " ", _jsx("span", { style: { marginLeft: 6, fontWeight: 900 }, children: kiSelected ? kiSelected.layerGroup : "—" })] }), _jsxs("div", { style: { fontSize: 12, color: ui.sub }, children: ["Confidence A:", " ", _jsx("b", { style: { color: ui.text }, children: kiSelected ? `${Math.round(kiSelected.confidenceA * 100)}%` : "—" })] })] }), _jsxs("div", { style: { marginTop: 10, fontSize: 12, color: ui.text, lineHeight: 1.6 }, children: [_jsxs("div", { children: ["Menge:", " ", _jsx("b", { style: { color: ui.text }, children: kiSelected
                                                                    ? `${kiSelected.qty.toFixed(3)} ${uiUnitLabel(kiSelected.unit)}`
                                                                    : "—" })] }), _jsxs("div", { children: ["Beispiel-Layer:", " ", _jsx("b", { style: { color: ui.text }, children: kiSelected?.exampleLayer || "—" })] }), _jsxs("div", { children: ["Beispiel-Name:", " ", _jsx("b", { style: { color: ui.text }, children: kiSelected?.exampleName || "—" })] }), _jsx("div", { style: { marginTop: 10, fontSize: 12, color: ui.sub, lineHeight: 1.55 }, children: "Tipp: Step A ist die Gruppierung. Danach \u00FCbernimmst du direkt in Aufma\u00DF oder nutzt Step B (unten) f\u00FCr LV-Matching." })] })] }), _jsxs("div", { style: { display: "grid", gap: 12 }, children: [_jsxs("div", { style: {
                                                    border: `1px solid ${ui.border}`,
                                                    borderRadius: 16,
                                                    padding: 12,
                                                    background: "#fff",
                                                }, children: [_jsx("div", { style: { fontSize: 12, color: ui.sub, fontWeight: 950, marginBottom: 8 }, children: "Aufma\u00DF-\u00DCbernahme (KI anpassen)" }), _jsxs("div", { style: { display: "grid", gap: 10 }, children: [_jsx(Input, { value: kiPos, onChange: (e) => setKiPos(e.target.value), placeholder: "Position (LV)" }), _jsx(Input, { value: kiText, onChange: (e) => setKiText(e.target.value), placeholder: "Text" }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }, children: [_jsxs(Select, { value: kiUnit, onChange: (e) => setKiUnit(e.target.value), children: [_jsx("option", { value: "m", children: "m" }), _jsx("option", { value: "m2", children: "m\u00B2" }), _jsx("option", { value: "Stk", children: "Stk" })] }), _jsx(Input, { value: String(kiFactor), onChange: (e) => setKiFactor(clamp(Number(e.target.value) || 1, 0.0001, 1e9)), inputMode: "decimal", placeholder: "Faktor" })] }), _jsxs("div", { style: { fontSize: 12, color: ui.text }, children: ["Menge (Vorschau): ", _jsx("b", { children: kiQtyPreview.toFixed(3) }), " ", uiUnitLabel(kiUnit)] }), _jsx("div", { style: { fontSize: 12, color: ui.sub, lineHeight: 1.4 }, children: "Werte vor dem Speichern korrigieren (Pos, Text, Einheit, Faktor)." })] })] }), _jsxs("div", { style: {
                                                    border: `1px solid ${ui.border}`,
                                                    borderRadius: 16,
                                                    padding: 12,
                                                    background: "#fff",
                                                    display: "flex",
                                                    flexDirection: "column",
                                                    justifyContent: "space-between",
                                                    gap: 10,
                                                }, children: [_jsxs("div", { children: [_jsx("div", { style: { fontSize: 12, color: ui.sub, fontWeight: 950, marginBottom: 8 }, children: "Aktion" }), _jsx("div", { style: { fontSize: 12, color: ui.sub, lineHeight: 1.5 }, children: "Wenn Step B gew\u00E4hlt ist, werden Pos/Text/Einheit automatisch aus dem LV \u00FCbernommen." })] }), _jsx(Btn, { primary: true, onClick: () => void kiApply(), style: { height: 52, justifyContent: "center", width: "100%", fontSize: 14 }, disabled: !projectId || !kiSelected, children: "KI \u2192 Aufma\u00DF \u00FCbernehmen" })] })] })] }), _jsxs("div", { style: {
                                    border: `1px solid ${ui.border}`,
                                    borderRadius: 16,
                                    padding: 12,
                                    background: "#f9fafb",
                                }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }, children: [_jsx("div", { style: { fontSize: 12, fontWeight: 950, color: ui.sub }, children: "Step B \u2014 LV Mapping (Top Vorschl\u00E4ge)" }), _jsxs("div", { style: { fontSize: 12, color: ui.sub }, children: ["LV geladen:", " ", _jsx("b", { style: { color: ui.text }, children: lvState === "ok" ? lvPositions.length : lvState === "loading" ? "…" : "0" })] })] }), _jsx("div", { style: { marginTop: 10 }, children: lvState !== "ok" ? (_jsxs("div", { style: { fontSize: 12, color: ui.sub, lineHeight: 1.5 }, children: ["LV nicht verf\u00FCgbar. (Status: ", _jsx("b", { children: lvState }), ")"] })) : lvSuggestions.length === 0 ? (_jsx("div", { style: { fontSize: 12, color: ui.sub }, children: "Keine passenden LV-Matches gefunden." })) : (_jsx("div", { style: {
                                                display: "grid",
                                                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                                                gap: 10,
                                            }, children: lvSuggestions.map((s) => {
                                                const active = chosenLvPos === s.pos;
                                                return (_jsxs("div", { onClick: () => setChosenLvPos(s.pos), style: {
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
                                                    }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", gap: 10 }, children: [_jsx("div", { style: { fontWeight: 950, color: ui.text }, children: s.pos }), _jsxs("div", { style: { fontSize: 12, color: ui.sub }, children: ["Score: ", _jsxs("b", { style: { color: ui.text }, children: [Math.round(s.score * 100), "%"] })] })] }), _jsx("div", { style: { fontSize: 12, color: ui.text, lineHeight: 1.35 }, children: s.text }), _jsxs("div", { style: { fontSize: 12, color: ui.sub }, children: ["Einheit: ", _jsx("b", { style: { color: ui.text }, children: s.unit })] })] }, s.pos));
                                            }) })) })] }), _jsxs("div", { style: {
                                    border: `1px solid ${ui.border}`,
                                    borderRadius: 16,
                                    overflow: "hidden",
                                    background: "#fff",
                                }, children: [_jsxs("div", { style: {
                                            padding: "10px 12px",
                                            fontSize: 12,
                                            fontWeight: 950,
                                            color: ui.sub,
                                            background: "#f9fafb",
                                            borderBottom: `1px solid ${ui.border}`,
                                            display: "grid",
                                            gridTemplateColumns: "120px 1fr 140px",
                                            gap: 10,
                                        }, children: [_jsx("div", { children: "Pos" }), _jsx("div", { children: "Layer-Gruppe" }), _jsx("div", { style: { textAlign: "right" }, children: "Menge" })] }), _jsx("div", { style: { maxHeight: 260, overflow: "auto" }, children: kiRows.map((r) => {
                                            const active = r.key === kiSelectedKey;
                                            return (_jsxs("div", { onClick: () => setKiSelectedKey(r.key), style: {
                                                    cursor: "pointer",
                                                    padding: "10px 12px",
                                                    borderBottom: `1px solid ${ui.border}`,
                                                    display: "grid",
                                                    gridTemplateColumns: "120px 1fr 140px",
                                                    gap: 10,
                                                    background: active ? "#eff6ff" : "#fff",
                                                }, children: [_jsx("div", { style: { fontWeight: 950, color: ui.text }, children: r.lvPos }), _jsxs("div", { style: { color: ui.text }, children: [_jsx("div", { style: { fontWeight: 900 }, children: r.layerGroup }), _jsxs("div", { style: { fontSize: 12, color: ui.sub }, children: ["Einheit: ", _jsx("b", { children: uiUnitLabel(r.unit) }), " \u2022 Confidence A:", " ", _jsxs("b", { children: [Math.round(r.confidenceA * 100), "%"] })] })] }), _jsxs("div", { style: { textAlign: "right", fontWeight: 950, color: ui.text }, children: [r.qty.toFixed(3), " ", uiUnitLabel(r.unit)] })] }, r.key));
                                        }) })] })] })) }), _jsxs(Card, { title: "UTM Punkte", subtitle: utmPoints.length ? `${utmPoints.length} Punkte` : "—", big: true, children: [!utmPoints.length ? (_jsxs("div", { style: { fontSize: 12, color: ui.sub }, children: ["Keine UTM-Punkte geladen. (Button: ", _jsx("b", { children: "UTM laden" }), ")"] })) : (_jsx("div", { style: {
                                maxHeight: 260,
                                overflow: "auto",
                                border: `1px solid ${ui.border}`,
                                borderRadius: 14,
                            }, children: utmPoints.map((p, i) => (_jsxs("div", { style: {
                                    display: "grid",
                                    gridTemplateColumns: "1fr 1fr 1fr",
                                    gap: 10,
                                    padding: "10px 12px",
                                    borderBottom: `1px solid ${ui.border}`,
                                    fontSize: 12,
                                }, children: [_jsx("div", { style: { fontWeight: 950, color: ui.text }, children: p.id }), _jsxs("div", { style: { color: ui.sub }, children: ["E ", p.x.toFixed(3)] }), _jsxs("div", { style: { color: ui.sub }, children: ["N ", p.y.toFixed(3)] })] }, `${p.id}_${i}`))) })), utmCsv ? (_jsxs("details", { style: { marginTop: 10 }, children: [_jsx("summary", { style: { cursor: "pointer", fontSize: 12, color: ui.sub, fontWeight: 950 }, children: "CSV anzeigen" }), _jsx("pre", { style: {
                                        marginTop: 10,
                                        padding: 12,
                                        borderRadius: 14,
                                        background: "#0b1220",
                                        color: "#e5e7eb",
                                        overflow: "auto",
                                        fontSize: 12,
                                        lineHeight: 1.4,
                                    }, children: utmCsv })] })) : null] }), _jsxs("div", { style: {
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
                    }, children: [_jsxs("div", { style: { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }, children: [_jsxs("div", { children: ["Projekt: ", _jsx("b", { children: projectId || "-" })] }), _jsx("div", { style: { color: ui.sub }, children: status })] }), _jsx("div", { style: { color: ui.sub }, children: "Viewer-only \u2022 BricsCAD ist die Quelle der Wahrheit" })] })] }) }));
}
