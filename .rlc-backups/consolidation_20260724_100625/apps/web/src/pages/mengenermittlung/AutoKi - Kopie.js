import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// apps/web/src/pages/mengenermittlung/AutoKI.tsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { useProject } from "../../store/useProject";
/* ===================== API RESOLUTION (robust, no double /api) ===================== */
const RAW_API_BASE = import.meta?.env?.VITE_API_URL ||
    import.meta?.env?.VITE_BACKEND_URL ||
    "https://api.rlcbausoftware.com";
function normalizeApiBase(v) {
    let s = String(v || "").trim();
    if (!s)
        s = "https://api.rlcbausoftware.com";
    s = s.replace(/\/+$/, "");
    if (s.endsWith("/api"))
        s = s.slice(0, -4);
    return s;
}
const API_BASE = normalizeApiBase(RAW_API_BASE);
const API = `${API_BASE}/api`;
/* ===================== local fallback ===================== */
const LS_KEY = (k) => `RLC_AUTO_KI_${k}`;
const LS_LAST = "RLC_AUTO_KI_LAST_PROJECT_KEY";
/** ✅ key bridge for AufmassEditor */
const AUFMASS_LAST_KEY = "RLC_AUFMASS_LAST_KEY";
function lsSave(key, payload) {
    try {
        localStorage.setItem(LS_KEY(key), JSON.stringify(payload));
    }
    catch { }
}
function lsLoad(key) {
    try {
        const raw = localStorage.getItem(LS_KEY(key));
        if (!raw)
            return null;
        const obj = JSON.parse(raw);
        return obj && typeof obj === "object" ? obj : null;
    }
    catch {
        return null;
    }
}
function setLastKey(k) {
    try {
        localStorage.setItem(LS_LAST, k);
    }
    catch { }
}
function getLastKey() {
    try {
        return localStorage.getItem(LS_LAST);
    }
    catch {
        return null;
    }
}
function setAufmassLastKey(k) {
    try {
        localStorage.setItem(AUFMASS_LAST_KEY, k);
    }
    catch { }
}
function getAufmassLastKey() {
    try {
        return localStorage.getItem(AUFMASS_LAST_KEY);
    }
    catch {
        return null;
    }
}
function buildLocalPayload(args) {
    const { projectKey, note, scale, file, result } = args;
    return {
        savedAt: new Date().toISOString(),
        projectIdOrCode: projectKey,
        fsKey: projectKey,
        note,
        scale,
        sourceFile: file
            ? { name: file.name, type: file.type || undefined, size: file.size || undefined }
            : null,
        preview: result.preview ?? null,
        boxes: result.boxes ?? [],
        extras: result.extras ?? [],
        summary: result.summary ?? "",
        positions: result.positions ?? [],
        items: result.items ?? [],
    };
}
function isPdfFile(f) {
    if (!f)
        return false;
    if (f.type === "application/pdf")
        return true;
    return f.name.toLowerCase().endsWith(".pdf");
}
function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result || ""));
        r.onerror = () => reject(new Error("FileReader failed"));
        r.readAsDataURL(file);
    });
}
const prettyScore = (s) => (Number(s || 0) * 100).toFixed(1) + "%";
/* ===================== helper: fetch with better errors ===================== */
async function fetchTextSafe(res) {
    try {
        return await res.text();
    }
    catch {
        return "";
    }
}
async function fetchFirstOk(urls, init) {
    let lastErr = null;
    for (const u of urls) {
        try {
            const r = await fetch(u, init);
            if (r.ok)
                return { url: u, res: r };
            const t = await fetchTextSafe(r);
            lastErr = new Error(t || `HTTP ${r.status} (${u})`);
        }
        catch (e) {
            lastErr = e;
        }
    }
    throw lastErr || new Error("Failed to fetch");
}
/* ===================== PDF -> PNG (Frontend) ===================== */
async function pdfFirstPageToPng(file, desiredScale = 3.5, maxPixels = 18000000) {
    const buf = await file.arrayBuffer();
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf");
    const loadingTask = pdfjs.getDocument({
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
    if (!ctx)
        throw new Error("Canvas context not available");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => {
            if (!b)
                return reject(new Error("canvas.toBlob failed"));
            resolve(b);
        }, "image/png");
    });
    const dataUrl = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result || ""));
        fr.onerror = () => reject(new Error("FileReader failed (blob->dataURL)"));
        fr.readAsDataURL(blob);
    });
    return { blob, dataUrl };
}
function safeBaseName(name) {
    const n = String(name || "file").replace(/[^\w.\-]+/g, "_");
    return n.replace(/\.pdf$/i, "");
}
function parseQuality(scaleStr) {
    const s = String(scaleStr || "").trim();
    const num = Number(s
        .replace(",", ".")
        .replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(num) || num <= 0)
        return 2.5;
    if (num > 20)
        return 2.5;
    return Math.max(1, Math.min(6, num));
}
/* ===================== NEW: Image tiling (PDF big plans) ===================== */
async function dataUrlToImage(dataUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Image load failed"));
        img.src = dataUrl;
    });
}
async function canvasToPngBlob(cvs) {
    return new Promise((resolve, reject) => {
        cvs.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
    });
}
async function makeTilesFromDataUrl(args) {
    const { dataUrl, tileMax, overlap } = args;
    const img = await dataUrlToImage(dataUrl);
    const W = img.width;
    const H = img.height;
    const step = Math.max(400, tileMax - overlap);
    const cols = Math.ceil((W - overlap) / step);
    const rows = Math.ceil((H - overlap) / step);
    const out = [];
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
            if (!g)
                continue;
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
function aufmassLocalKey(projectUuid) {
    return `RLC_AUFMASS_${projectUuid}`;
}
function loadAufmassLocal(projectUuid) {
    try {
        const raw = localStorage.getItem(aufmassLocalKey(projectUuid));
        if (!raw)
            return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
}
function saveAufmassLocal(projectUuid, rows) {
    try {
        localStorage.setItem(aufmassLocalKey(projectUuid), JSON.stringify(rows));
    }
    catch { }
}
function normalizeAndReindexAutoPositions(items) {
    const out = [];
    let autoCounter = 0;
    for (const it of items || []) {
        const rawPos = String(it?.pos || "").trim();
        const isAuto = !rawPos || /^AUTO\.\d+$/i.test(rawPos);
        if (isAuto) {
            autoCounter += 1;
            const n = String(autoCounter).padStart(3, "0");
            out.push({ ...it, pos: `AUTO.${n}` });
        }
        else {
            out.push({ ...it, pos: rawPos });
        }
    }
    return out;
}
/** ============ NEW: parse server payload (flat or legacy) ============ */
function normalizeLoadedPayload(projectKeyFallback, json) {
    if (json && typeof json === "object" && "data" in json) {
        const p = json.data;
        if (!p)
            return null;
        return p;
    }
    if (json && typeof json === "object" && json.ok) {
        const items = Array.isArray(json.items) ? json.items : [];
        const boxes = Array.isArray(json.boxes) ? json.boxes : [];
        const extras = Array.isArray(json.extras) ? json.extras : [];
        const positions = Array.isArray(json.positions) ? json.positions : [];
        const payload = {
            savedAt: String(json.savedAt || new Date().toISOString()),
            projectIdOrCode: String(json.projectIdOrCode || json.projectKey || projectKeyFallback),
            fsKey: String(json.fsKey || json.projectKey || projectKeyFallback),
            note: String(json.note ?? ""),
            scale: String(json.scale ?? "2.5"),
            sourceFile: json.sourceFile ?? null,
            preview: json.preview ?? null,
            boxes,
            extras,
            summary: String(json.summary ?? ""),
            positions,
            items,
        };
        if (!payload.preview && !payload.items?.length && !payload.boxes?.length && !payload.positions?.length) {
            return null;
        }
        return payload;
    }
    return null;
}
function clampNum(v, fallback = 0) {
    const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
    return Number.isFinite(n) ? n : fallback;
}
function uniqUnitsFromItems(items) {
    const s = new Set();
    for (const it of items || []) {
        const u = String(it?.unit || "").trim();
        if (u)
            s.add(u);
    }
    return Array.from(s);
}
function posKind(posRaw) {
    const pos = String(posRaw || "").trim();
    if (!pos)
        return "EMPTY";
    if (/^\d{3}\.\d{3}$/i.test(pos))
        return "LV"; // 001.001
    if (/^AUTO\.\d{3}$/i.test(pos))
        return "AUTO"; // AUTO.001
    if (/^FOTO\.\d{3}$/i.test(pos))
        return "FOTO"; // FOTO.001
    return "OTHER";
}
function isPosAccepted(kind) {
    return kind === "LV" || kind === "AUTO" || kind === "FOTO";
}
function rowIssues(d) {
    const issues = [];
    const pk = posKind(d.pos);
    if (pk === "EMPTY")
        issues.push("Pos. fehlt");
    if (pk === "OTHER")
        issues.push("Pos. Format ungültig (erwartet 001.001 / AUTO.001 / FOTO.001)");
    const descr = String(d.descr || "").trim();
    if (!descr)
        issues.push("Beschreibung fehlt");
    const unit = String(d.unit || "").trim();
    if (!unit)
        issues.push("Einheit fehlt");
    const qty = Number(d.qty ?? 0);
    if (!Number.isFinite(qty))
        issues.push("Menge ungültig");
    if (qty < 0)
        issues.push("Menge < 0");
    return { pk, issues };
}
function badgeLabel(pk) {
    if (pk === "LV")
        return "LV";
    if (pk === "AUTO")
        return "AUTO";
    if (pk === "FOTO")
        return "FOTO";
    if (pk === "EMPTY")
        return "FEHLT";
    return "UNGÜLTIG";
}
function badgeStyle(pk) {
    const base = {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2px 6px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: 0.2,
        border: "1px solid rgba(0,0,0,0.12)",
        marginLeft: 8,
        whiteSpace: "nowrap",
    };
    if (pk === "LV")
        return { ...base, background: "rgba(46,204,113,0.16)" };
    if (pk === "AUTO")
        return { ...base, background: "rgba(52,152,219,0.14)" };
    if (pk === "FOTO")
        return { ...base, background: "rgba(155,89,182,0.14)" };
    if (pk === "EMPTY")
        return { ...base, background: "rgba(231,76,60,0.16)" };
    return { ...base, background: "rgba(231,76,60,0.22)" };
}
function inputStyleByIssues(base, issues) {
    if (!issues.length)
        return base;
    return {
        ...base,
        border: "1px solid rgba(231,76,60,0.55)",
        background: "rgba(231,76,60,0.06)",
    };
}
/* ===================== UI: Auto-grow textarea ===================== */
function autoGrowTextArea(el) {
    if (!el)
        return;
    el.style.height = "0px";
    el.style.height = Math.min(220, Math.max(40, el.scrollHeight)) + "px";
}
export default function AutoKI() {
    const nav = useNavigate();
    const { getSelectedProject } = useProject();
    const project = getSelectedProject?.() ?? null;
    const projectCode = (project?.code || "").trim();
    const projectId = (project?.id || "").trim();
    const keyCandidates = React.useMemo(() => {
        const arr = [projectCode, projectId].filter((x) => !!x);
        return Array.from(new Set(arr));
    }, [projectCode, projectId]);
    const projectKey = keyCandidates[0] ?? null;
    const effectiveKey = React.useMemo(() => {
        return projectKey || getLastKey() || null;
    }, [projectKey]);
    const [file, setFile] = React.useState(null);
    const [note, setNote] = React.useState("");
    const [scale, setScale] = React.useState("2.5");
    const [busy, setBusy] = React.useState(false);
    const [serverBusy, setServerBusy] = React.useState(false);
    const [result, setResult] = React.useState({ items: [], preview: null, boxes: [], extras: [], summary: "", positions: [] });
    const [localPreviewUrl, setLocalPreviewUrl] = React.useState(null);
    const [localPreviewIsPdf, setLocalPreviewIsPdf] = React.useState(false);
    const [history, setHistory] = React.useState([]);
    const fileInputRef = React.useRef(null);
    const [zoomOpen, setZoomOpen] = React.useState(false);
    const [zoomScale, setZoomScale] = React.useState(1.3);
    // ✅ Bearbeiten toggle + touch tracking
    const [editMode, setEditMode] = React.useState(false);
    const [itemsTouched, setItemsTouched] = React.useState(false);
    // ✅ NEW: Modal Editor for Beschreibung (large, readable)
    const [descrModalOpen, setDescrModalOpen] = React.useState(false);
    const [descrModalRowId, setDescrModalRowId] = React.useState(null);
    const [descrModalValue, setDescrModalValue] = React.useState("");
    const resetLocalPreview = React.useCallback(() => {
        if (localPreviewUrl)
            URL.revokeObjectURL(localPreviewUrl);
        setLocalPreviewUrl(null);
        setLocalPreviewIsPdf(false);
    }, [localPreviewUrl]);
    const draftSave = React.useCallback((partial) => {
        if (!effectiveKey)
            return;
        setLastKey(effectiveKey);
        const payload = buildLocalPayload({
            projectKey: effectiveKey,
            note,
            scale,
            file,
            result,
        });
        const merged = { ...payload, ...(partial || {}) };
        lsSave(effectiveKey, merged);
    }, [effectiveKey, note, scale, file, result]);
    const onPick = (e) => {
        const f = e.target.files?.[0] || null;
        if (f) {
            setFile(f);
            resetLocalPreview();
            const url = URL.createObjectURL(f);
            setLocalPreviewUrl(url);
            setLocalPreviewIsPdf(isPdfFile(f));
            setResult((prev) => ({
                ...prev,
                msg: "",
                summary: "",
                boxes: [],
                extras: [],
                positions: [],
                items: prev.items || [],
                preview: null,
            }));
            setItemsTouched(false);
            if (effectiveKey) {
                setLastKey(effectiveKey);
                const tmpPayload = buildLocalPayload({
                    projectKey: effectiveKey,
                    note,
                    scale,
                    file: f,
                    result: {
                        ...result,
                        preview: null,
                        boxes: [],
                        extras: [],
                        summary: "",
                        positions: [],
                    },
                });
                lsSave(effectiveKey, tmpPayload);
            }
        }
        e.currentTarget.value = "";
    };
    const onDrop = (e) => {
        e.preventDefault();
        const f = e.dataTransfer.files?.[0] || null;
        if (f) {
            setFile(f);
            resetLocalPreview();
            const url = URL.createObjectURL(f);
            setLocalPreviewUrl(url);
            setLocalPreviewIsPdf(isPdfFile(f));
            setResult((prev) => ({
                ...prev,
                msg: "",
                summary: "",
                boxes: [],
                extras: [],
                positions: [],
                items: prev.items || [],
                preview: null,
            }));
            setItemsTouched(false);
            if (effectiveKey) {
                setLastKey(effectiveKey);
                const tmpPayload = buildLocalPayload({
                    projectKey: effectiveKey,
                    note,
                    scale,
                    file: f,
                    result: {
                        ...result,
                        preview: null,
                        boxes: [],
                        extras: [],
                        summary: "",
                        positions: [],
                    },
                });
                lsSave(effectiveKey, tmpPayload);
            }
        }
    };
    /* helpers: positions -> boxes/extras/items */
    const positionsToBoxes = React.useCallback((positions) => {
        return (positions || []).map((p, idx) => ({
            id: p.id || String(idx + 1),
            label: String(p.kurztext || ""),
            score: 0.95,
            qty: p.qty == null ? undefined : Number(p.qty),
            unit: p.einheit || "",
            box: undefined,
        }));
    }, []);
    const positionsToExtras = React.useCallback((positions) => {
        return (positions || []).map((p) => ({
            id: crypto.randomUUID(),
            typ: "KI",
            lvPos: p.id || "",
            beschreibung: String(p.kurztext || ""),
            einheit: p.einheit || "",
            menge: p.qty == null ? 0 : Number(p.qty),
        }));
    }, []);
    const positionsToItems = React.useCallback((positions) => {
        return (positions || []).map((p, idx) => ({
            id: crypto.randomUUID(),
            pos: p.id && String(p.id).trim()
                ? String(p.id).trim()
                : `AUTO.${String(idx + 1).padStart(3, "0")}`,
            type: "COUNT",
            descr: String(p.kurztext || ""),
            unit: String(p.einheit || ""),
            qty: p.qty == null ? 0 : Number(p.qty),
            layer: "",
            source: "image+openai",
        }));
    }, []);
    /* URL builders */
    const makeUrls = React.useCallback((suffix) => keyCandidates.map((k) => `${API}/auto-ki${suffix.replace("{key}", encodeURIComponent(k))}`), [keyCandidates]);
    /* SERVER: auto-ki.json */
    const serverLoadAutoKi = React.useCallback(async () => {
        if (!keyCandidates.length) {
            alert("Kein Projekt gewählt.");
            return;
        }
        setServerBusy(true);
        try {
            const urls = makeUrls("/{key}");
            const { res, url } = await fetchFirstOk(urls);
            const json = await res.json().catch(() => ({}));
            const payload = normalizeLoadedPayload(effectiveKey || keyCandidates[0], json);
            if (!payload) {
                const lk = effectiveKey || keyCandidates[0];
                const local = lk ? lsLoad(lk) : null;
                if (local) {
                    const positions = Array.isArray(local.positions) ? local.positions : [];
                    const boxesFromPositions = positions.length ? positionsToBoxes(positions) : [];
                    const extrasFromPositions = positions.length ? positionsToExtras(positions) : [];
                    setNote(String(local.note ?? ""));
                    setScale(String(local.scale ?? "2.5"));
                    resetLocalPreview();
                    const itemsRaw = Array.isArray(local.items) ? local.items : [];
                    const itemsNorm = normalizeAndReindexAutoPositions(itemsRaw);
                    setResult({
                        items: itemsNorm,
                        preview: local.preview ?? null,
                        msg: `Geladen (lokal) • ${new Date(local.savedAt).toLocaleString()}`,
                        summary: String(local.summary ?? ""),
                        boxes: Array.isArray(local.boxes) && local.boxes.length ? local.boxes : boxesFromPositions,
                        extras: Array.isArray(local.extras) && local.extras.length
                            ? local.extras
                            : extrasFromPositions,
                        positions,
                    });
                    setItemsTouched(false);
                    setLastKey(lk);
                    return;
                }
                alert("Kein auto-ki.json am Server gefunden.");
                return;
            }
            setNote(String(payload.note ?? ""));
            setScale(String(payload.scale ?? "2.5"));
            resetLocalPreview();
            const positions = Array.isArray(payload.positions) ? payload.positions : [];
            const boxesFromPositions = positions.length ? positionsToBoxes(positions) : [];
            const extrasFromPositions = positions.length ? positionsToExtras(positions) : [];
            const itemsBase = Array.isArray(payload.items) && payload.items.length ? payload.items : positionsToItems(positions);
            const itemsNorm = normalizeAndReindexAutoPositions(itemsBase);
            setResult({
                items: itemsNorm,
                preview: payload.preview ?? null,
                msg: `Geladen vom Server (${new Date(payload.savedAt).toLocaleString()}) • ${url}`,
                summary: String(payload.summary ?? ""),
                boxes: Array.isArray(payload.boxes) && payload.boxes.length ? payload.boxes : boxesFromPositions,
                extras: Array.isArray(payload.extras) && payload.extras.length ? payload.extras : extrasFromPositions,
                positions,
            });
            setItemsTouched(false);
            const lk = projectKey || effectiveKey || keyCandidates[0];
            if (lk) {
                setLastKey(lk);
                lsSave(lk, payload);
            }
        }
        catch (e) {
            console.error(e);
            const lk = effectiveKey || keyCandidates[0];
            const local = lk ? lsLoad(lk) : null;
            if (local) {
                const positions = Array.isArray(local.positions) ? local.positions : [];
                const boxesFromPositions = positions.length ? positionsToBoxes(positions) : [];
                const extrasFromPositions = positions.length ? positionsToExtras(positions) : [];
                setNote(String(local.note ?? ""));
                setScale(String(local.scale ?? "2.5"));
                resetLocalPreview();
                const itemsRaw = Array.isArray(local.items) ? local.items : [];
                const itemsNorm = normalizeAndReindexAutoPositions(itemsRaw);
                setResult({
                    items: itemsNorm,
                    preview: local.preview ?? null,
                    msg: `Server laden fehlgeschlagen – Fallback: lokal geladen • ${new Date(local.savedAt).toLocaleString()}`,
                    summary: String(local.summary ?? ""),
                    boxes: Array.isArray(local.boxes) && local.boxes.length ? local.boxes : boxesFromPositions,
                    extras: Array.isArray(local.extras) && local.extras.length ? local.extras : extrasFromPositions,
                    positions,
                });
                setItemsTouched(false);
                setLastKey(lk);
                return;
            }
            alert(`Server laden fehlgeschlagen: ${e?.message || "Failed to fetch"}`);
        }
        finally {
            setServerBusy(false);
        }
    }, [
        keyCandidates,
        makeUrls,
        resetLocalPreview,
        positionsToBoxes,
        positionsToExtras,
        positionsToItems,
        projectKey,
        effectiveKey,
    ]);
    const serverSaveAutoKi = React.useCallback(async (override) => {
        if (!keyCandidates.length) {
            if (effectiveKey)
                draftSave();
            alert("Kein Projekt gewählt.");
            return;
        }
        setServerBusy(true);
        try {
            const itemsToSave = Array.isArray(override?.items) ? override.items : result.items;
            const previewToSave = override && "preview" in override ? (override.preview ?? null) : (result.preview ?? null);
            const boxesToSave = Array.isArray(override?.boxes) ? override.boxes : result.boxes ?? [];
            const extrasToSave = Array.isArray(override?.extras) ? override.extras : result.extras ?? [];
            const summaryToSave = override && "summary" in override ? String(override.summary ?? "") : String(result.summary ?? "");
            const positionsToSave = Array.isArray(override?.positions)
                ? override.positions
                : (result.positions ?? []);
            const payload = {
                note,
                scale,
                preview: previewToSave,
                sourceFile: file
                    ? { name: file.name, type: file.type || undefined, size: file.size || undefined }
                    : null,
                items: itemsToSave,
                boxes: boxesToSave,
                extras: extrasToSave,
                summary: summaryToSave,
                positions: positionsToSave,
            };
            const urls = makeUrls("/{key}/save");
            const { res, url } = await fetchFirstOk(urls, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await res.json().catch(() => ({}));
            setResult((prev) => ({
                ...prev,
                msg: (override?.msg ? `${override.msg} • ` : "") +
                    `Gespeichert (Server) • ${data?.count ?? itemsToSave.length} Position(en) • ${url}`,
            }));
            setHistory((prev) => {
                const snap = {
                    ts: Date.now(),
                    count: itemsToSave.length,
                    note: note || undefined,
                    source: file?.name || "auto-ki",
                };
                return [snap, ...prev].slice(0, 20);
            });
            const localPayload = buildLocalPayload({
                projectKey: projectKey || effectiveKey || keyCandidates[0] || "unknown",
                note,
                scale,
                file,
                result: {
                    items: itemsToSave,
                    preview: previewToSave,
                    boxes: boxesToSave,
                    extras: extrasToSave,
                    summary: summaryToSave,
                    positions: positionsToSave,
                },
            });
            const lk = projectKey || effectiveKey || keyCandidates[0];
            if (lk) {
                setLastKey(lk);
                lsSave(lk, localPayload);
            }
        }
        catch (e) {
            console.error(e);
            if (effectiveKey) {
                draftSave();
                alert(`Server speichern fehlgeschlagen: ${e?.message || "Failed to fetch"}\nFallback: lokal gespeichert.`);
            }
            else {
                alert(`Server speichern fehlgeschlagen: ${e?.message || "Failed to fetch"}`);
            }
        }
        finally {
            setServerBusy(false);
        }
    }, [keyCandidates, makeUrls, note, scale, file, projectKey, effectiveKey, draftSave, result]);
    /* AUTO-RESTORE */
    React.useEffect(() => {
        if (!effectiveKey)
            return;
        const local = lsLoad(effectiveKey);
        if (local) {
            const positions = Array.isArray(local.positions) ? local.positions : [];
            setNote(String(local.note ?? ""));
            setScale(String(local.scale ?? "2.5"));
            const itemsBase = Array.isArray(local.items) ? local.items : positionsToItems(positions);
            const itemsNorm = normalizeAndReindexAutoPositions(itemsBase);
            setResult({
                items: itemsNorm,
                preview: local.preview ?? null,
                msg: `Wiederhergestellt (lokal) • ${new Date(local.savedAt).toLocaleString()}`,
                summary: String(local.summary ?? ""),
                boxes: Array.isArray(local.boxes) ? local.boxes : positionsToBoxes(positions),
                extras: Array.isArray(local.extras) ? local.extras : positionsToExtras(positions),
                positions,
            });
            setItemsTouched(false);
            setLastKey(effectiveKey);
        }
        if (projectKey)
            void serverLoadAutoKi();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [effectiveKey]);
    /** Autosave su note/scale/result */
    React.useEffect(() => {
        if (!effectiveKey)
            return;
        const t = window.setTimeout(() => {
            try {
                draftSave();
            }
            catch { }
        }, 250);
        return () => window.clearTimeout(t);
    }, [effectiveKey, note, scale, result, draftSave]);
    /* SERVER: aufmass-history.json */
    const loadAufmassHistory = React.useCallback(async () => {
        if (!keyCandidates.length)
            return;
        try {
            const urls = makeUrls("/{key}/aufmass-history");
            const { res } = await fetchFirstOk(urls);
            const data = await res.json().catch(() => ({}));
            const hist = data?.data?.history;
            if (Array.isArray(hist)) {
                setHistory(hist.map((h) => ({
                    ts: Number(h.ts),
                    count: Number(h.count),
                    note: h.note ? String(h.note) : undefined,
                    source: h.source ? String(h.source) : undefined,
                })));
            }
        }
        catch { }
    }, [keyCandidates, makeUrls]);
    const snapshotAufmassHistory = React.useCallback(async (source) => {
        if (!keyCandidates.length) {
            alert("Kein Projekt gewählt.");
            return;
        }
        try {
            const urls = makeUrls("/{key}/aufmass-history/snapshot");
            const rowsForHistory = result.items.map((d) => ({
                pos: d.pos,
                text: d.descr,
                unit: d.unit,
                ist: d.qty,
                source: "auto-ki",
                type: d.type,
            }));
            const { res } = await fetchFirstOk(urls, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rows: rowsForHistory, note: note || "", source }),
            });
            const data = await res.json().catch(() => ({}));
            if (Array.isArray(data?.data?.history)) {
                setHistory(data.data.history.map((h) => ({
                    ts: Number(h.ts),
                    count: Number(h.count),
                    note: h.note ? String(h.note) : undefined,
                    source: h.source ? String(h.source) : undefined,
                })));
            }
        }
        catch (e) {
            console.error(e);
            alert(`Snapshot fehlgeschlagen: ${e?.message || "Failed to fetch"}`);
        }
    }, [keyCandidates, makeUrls, result.items, note]);
    React.useEffect(() => {
        void loadAufmassHistory();
    }, [loadAufmassHistory]);
    /* ===================== EDITING HELPERS ===================== */
    const applyItems = React.useCallback((nextItems, touch = true) => {
        const reindexed = normalizeAndReindexAutoPositions(nextItems);
        setResult((prev) => ({ ...prev, items: reindexed }));
        if (touch)
            setItemsTouched(true);
        draftSave({ items: reindexed });
    }, [draftSave]);
    const addRow = React.useCallback(() => {
        const current = Array.isArray(result.items) ? result.items : [];
        const next = [
            ...current,
            {
                id: crypto.randomUUID(),
                pos: "AUTO.000", // reindex
                type: "COUNT",
                descr: "",
                unit: "m",
                qty: 0,
                layer: "",
                source: "manuell",
            },
        ];
        applyItems(next, true);
    }, [applyItems, result.items]);
    const deleteRow = React.useCallback((id) => {
        const current = Array.isArray(result.items) ? result.items : [];
        const next = current.filter((x) => x.id !== id);
        applyItems(next, true);
    }, [applyItems, result.items]);
    const updateRow = React.useCallback((id, patch) => {
        const current = Array.isArray(result.items) ? result.items : [];
        const next = current.map((x) => (x.id === id ? { ...x, ...patch } : x));
        applyItems(next, true);
    }, [applyItems, result.items]);
    const unitOptions = React.useMemo(() => {
        const base = ["m", "m²", "m³", "St", "Stk", "kg", "t", "h", "pausch"];
        const fromItems = uniqUnitsFromItems(result.items || []);
        return Array.from(new Set([...base, ...fromItems])).filter(Boolean);
    }, [result.items]);
    /* ✅ VALIDATION SUMMARY */
    const validation = React.useMemo(() => {
        const rows = result.items || [];
        let invalid = 0;
        let warnings = 0;
        let ok = 0;
        rows.forEach((r) => {
            const { pk, issues } = rowIssues(r);
            const accepted = isPosAccepted(pk);
            const hardIssues = issues.filter((x) => x.includes("ungültig") ||
                x.includes("fehlt") ||
                x.includes("< 0") ||
                x.includes("Menge ungültig"));
            const softWarn = accepted && (pk === "AUTO" || pk === "FOTO");
            if (hardIssues.length > 0)
                invalid += 1;
            else if (softWarn)
                warnings += 1;
            else
                ok += 1;
        });
        return { ok, warnings, invalid, total: rows.length };
    }, [result.items]);
    /* EXPORT -> AUFMASS EDITOR */
    const exportToAufmassEditor = React.useCallback(async () => {
        if (!projectKey) {
            alert("Kein Projekt gewählt.");
            return;
        }
        setAufmassLastKey(String(projectId || projectKey || getAufmassLastKey() || "").trim() || projectKey);
        const rowsFromItems = (result.items || []).map((d, idx) => ({
            pos: String(d.pos || "").trim() || `AUTO.${String(idx + 1).padStart(3, "0")}`,
            text: String(d.descr || "").trim(),
            unit: String(d.unit || "").trim(),
            qty: clampNum(d.qty, 0),
        }));
        const positions = Array.isArray(result.positions) ? result.positions : [];
        const rowsFromPositions = positions.map((p, idx) => ({
            pos: p.id && String(p.id).trim()
                ? String(p.id).trim()
                : `AUTO.${String(idx + 1).padStart(3, "0")}`,
            text: String(p.kurztext || "").trim(),
            unit: String(p.einheit || "").trim(),
            qty: p.qty == null ? 0 : Number(p.qty),
        })) || [];
        const rows = (rowsFromItems.length ? rowsFromItems : rowsFromPositions).filter((r) => String(r.pos || "").trim() && String(r.text || "").trim().length > 0);
        if (!rows.length) {
            alert("Keine Positionen zum Export.");
            return;
        }
        setServerBusy(true);
        try {
            draftSave();
            const targets = Array.from(new Set([projectId, projectKey].filter(Boolean)));
            if (targets.length)
                setAufmassLastKey(targets[0]);
            for (const k of targets) {
                const existing = loadAufmassLocal(k);
                const imported = rows.map((r) => ({
                    id: crypto.randomUUID(),
                    pos: String(r.pos || "").trim(),
                    text: String(r.text || "").trim(),
                    unit: String(r.unit || "").trim() || "m",
                    ep: 0,
                    soll: 0,
                    formula: "",
                    ist: Number(r.qty || 0),
                    note: "Import aus AutoKI",
                    factor: 1,
                }));
                saveAufmassLocal(k, [...imported, ...existing]);
            }
            const urls = makeUrls("/{key}/export-to-aufmass");
            await fetchFirstOk(urls, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rows }),
            });
            nav("/mengenermittlung/aufmasseditor");
        }
        catch (e) {
            console.error(e);
            alert(`Export fehlgeschlagen: ${e?.message || "Failed to fetch"}`);
        }
        finally {
            setServerBusy(false);
        }
    }, [projectKey, projectId, result.items, result.positions, makeUrls, nav, draftSave]);
    /* ANALYZE (KI Button) */
    const analyze = async () => {
        if (!file) {
            alert("Bitte zuerst eine Datei wählen.");
            return;
        }
        setBusy(true);
        try {
            resetLocalPreview();
            const urlObj = URL.createObjectURL(file);
            setLocalPreviewUrl(urlObj);
            const pdf = isPdfFile(file);
            setLocalPreviewIsPdf(pdf);
            let uploadBlob = file;
            let uploadName = file.name;
            let previewDataUrl = null;
            let tiles = [];
            if (pdf) {
                const q = parseQuality(scale);
                const desired = 3.2 + q * 0.9;
                try {
                    const out = await pdfFirstPageToPng(file, desired, 18000000);
                    uploadBlob = out.blob;
                    uploadName = `${safeBaseName(file.name)}.page1.png`;
                    previewDataUrl = out.dataUrl;
                    setResult((prev) => ({ ...prev, preview: previewDataUrl }));
                    tiles = await makeTilesFromDataUrl({
                        dataUrl: out.dataUrl,
                        tileMax: 1800,
                        overlap: 80,
                    });
                }
                catch (e) {
                    console.error(e);
                    alert(`PDF → PNG fehlgeschlagen: ${e?.message || "unknown"}`);
                    uploadBlob = file;
                    uploadName = file.name;
                    tiles = [];
                }
            }
            else if (file.type.startsWith("image/") || /\.(png|jpg|jpeg)$/i.test(file.name)) {
                try {
                    previewDataUrl = await fileToDataUrl(file);
                }
                catch {
                    previewDataUrl = null;
                }
            }
            if (!keyCandidates.length) {
                const newState = {
                    items: result.items || [],
                    preview: previewDataUrl || null,
                    msg: "Kein Projekt gewählt – lokal gespeichert.",
                    boxes: result.boxes ?? [],
                    extras: result.extras ?? [],
                    summary: result.summary ?? "",
                    positions: result.positions ?? [],
                };
                setResult(newState);
                draftSave();
                return;
            }
            const urls = makeUrls("/{key}/analyze");
            // =========================
            // ✅ PDF TILE ANALYSE
            // =========================
            if (pdf && tiles.length) {
                const allPositions = [];
                const allItems = [];
                const allBoxes = [];
                const allExtras = [];
                const summaries = [];
                for (const t of tiles) {
                    const fd = new FormData();
                    fd.append("file", t.blob, t.name);
                    fd.append("note", `${note}\n[TILE ${t.iy + 1}/${t.rows} x ${t.ix + 1}/${t.cols}]`);
                    fd.append("scale", scale);
                    const { res } = await fetchFirstOk(urls, { method: "POST", body: fd });
                    const data = await res.json().catch(() => ({}));
                    const summaryChunk = String(data?.summary ?? "");
                    if (summaryChunk)
                        summaries.push(summaryChunk);
                    const pos = Array.isArray(data?.positions) ? data.positions : [];
                    const itemsChunk = Array.isArray(data?.items) ? data.items : [];
                    const boxesChunk = Array.isArray(data?.boxes) ? data.boxes : [];
                    const extrasChunk = Array.isArray(data?.extras) ? data.extras : [];
                    allPositions.push(...pos);
                    allItems.push(...itemsChunk);
                    allBoxes.push(...boxesChunk);
                    allExtras.push(...extrasChunk);
                }
                const seenPos = new Set();
                const positionsDedup = allPositions.filter((p) => {
                    const k = `${(p.id || "").trim()}|${(p.kurztext || "").trim()}|${(p.einheit || "").trim()}|${Number(p.qty ?? 0)}`;
                    if (seenPos.has(k))
                        return false;
                    seenPos.add(k);
                    return true;
                });
                const seenItem = new Set();
                const itemsDedup = allItems.filter((d) => {
                    const k = `${(d.pos || "").trim()}|${(d.descr || "").trim()}|${(d.unit || "").trim()}|${Number(d.qty ?? 0)}`;
                    if (seenItem.has(k))
                        return false;
                    seenItem.add(k);
                    return true;
                });
                const boxesFinal = allBoxes.length > 0 ? allBoxes : positionsDedup.length ? positionsToBoxes(positionsDedup) : [];
                const extrasFinal = allExtras.length > 0 ? allExtras : positionsDedup.length ? positionsToExtras(positionsDedup) : [];
                const itemsFinal = itemsDedup.length > 0
                    ? itemsDedup
                    : positionsDedup.length > 0
                        ? positionsToItems(positionsDedup)
                        : [];
                const finalPreview = previewDataUrl || null;
                const reindexedItems = normalizeAndReindexAutoPositions(itemsFinal || []);
                const newState = {
                    items: reindexedItems,
                    preview: finalPreview,
                    msg: `Analyse OK (Tiles: ${tiles.length})`,
                    boxes: boxesFinal,
                    extras: extrasFinal,
                    summary: `Erkannte Positionen: ${positionsDedup.length} (dedupliziert)${summaries.length ? ` • ${summaries[0]}` : ""}`,
                    positions: positionsDedup,
                };
                setResult(newState);
                setItemsTouched(false);
                draftSave({ ...newState });
                try {
                    await serverSaveAutoKi({
                        items: newState.items,
                        preview: newState.preview ?? null,
                        boxes: newState.boxes ?? [],
                        extras: newState.extras ?? [],
                        summary: newState.summary ?? "",
                        positions: newState.positions ?? [],
                        msg: "Analyse",
                    });
                }
                catch { }
                return;
            }
            // =========================
            // ✅ DEFAULT (single image)
            // =========================
            const fd = new FormData();
            fd.append("file", uploadBlob, uploadName);
            fd.append("note", note);
            fd.append("scale", scale);
            const { res, url } = await fetchFirstOk(urls, { method: "POST", body: fd });
            const data = await res.json().catch(() => ({}));
            const summary = String(data?.summary ?? "");
            const positions = Array.isArray(data?.positions) ? data.positions : [];
            const boxesBackend = Array.isArray(data?.boxes) ? data.boxes : [];
            const boxes = boxesBackend.length > 0 ? boxesBackend : positionsToBoxes(positions);
            const extrasBackend = Array.isArray(data?.extras) ? data.extras : [];
            const extras = extrasBackend.length > 0 ? extrasBackend : positionsToExtras(positions);
            const itemsBackend = Array.isArray(data?.items) ? data.items : [];
            const itemsBase = itemsBackend.length > 0 ? itemsBackend : positionsToItems(positions);
            const items = normalizeAndReindexAutoPositions(itemsBase);
            const finalPreview = (data?.preview ?? null) || previewDataUrl || null;
            const newState = {
                items,
                preview: finalPreview,
                msg: (data?.msg ?? "Analyse OK") + ` • ${url}`,
                boxes,
                extras,
                summary,
                positions,
            };
            setResult(newState);
            setItemsTouched(false);
            draftSave({
                preview: finalPreview ?? null,
                boxes,
                extras,
                summary,
                positions,
                items,
            });
            try {
                await serverSaveAutoKi({
                    items,
                    preview: finalPreview ?? null,
                    boxes,
                    extras,
                    summary,
                    positions,
                    msg: "Analyse",
                });
            }
            catch { }
        }
        catch (err) {
            console.error(err);
            setResult({
                items: [],
                preview: null,
                msg: "Analyse fehlgeschlagen.",
                boxes: [],
                extras: [],
                summary: "",
                positions: [],
            });
            alert(`Analyse fehlgeschlagen: ${err?.message || "Failed to fetch"}`);
        }
        finally {
            setBusy(false);
        }
    };
    /* OVERLAY (only if preview is image) */
    React.useEffect(() => {
        if (!result.preview)
            return;
        if (String(result.preview).startsWith("data:application/pdf"))
            return;
        const img = new Image();
        img.src = result.preview;
        img.onload = () => {
            const cvs = document.getElementById("auto-canvas");
            if (!cvs)
                return;
            const W = Math.min(1400, img.width);
            const ratio = W / img.width;
            const H = img.height * ratio;
            cvs.width = W;
            cvs.height = H;
            const g = cvs.getContext("2d");
            if (!g)
                return;
            g.clearRect(0, 0, W, H);
            g.drawImage(img, 0, 0, W, H);
            result.items.forEach((d) => {
                g.lineWidth = 2;
                if (d.type === "AREA")
                    g.strokeStyle = "#ff6b6b";
                else if (d.type === "LINE")
                    g.strokeStyle = "#4dabf7";
                else
                    g.strokeStyle = "#51cf66";
                if (d.poly && d.poly.length) {
                    g.beginPath();
                    d.poly.forEach((p, i) => {
                        const x = p.x * ratio;
                        const y = p.y * ratio;
                        if (i === 0)
                            g.moveTo(x, y);
                        else
                            g.lineTo(x, y);
                    });
                    if (d.type === "AREA")
                        g.closePath();
                    g.stroke();
                }
                else if (d.box) {
                    const { x, y, w, h } = d.box;
                    g.strokeRect(x * ratio, y * ratio, w * ratio, h * ratio);
                }
            });
            const boxes = result.boxes ?? [];
            if (boxes.length) {
                g.lineWidth = 3;
                g.font = "14px system-ui";
                g.textBaseline = "top";
                boxes.forEach((b) => {
                    if (!b.box)
                        return;
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
    }, [result.preview, result.items, result.boxes]);
    const showPdfPreview = localPreviewIsPdf && localPreviewUrl && !result.preview;
    const sumQty = (result.boxes ?? []).reduce((a, b) => a + (b.qty ?? 0), 0);
    const openPngInNewTab = () => {
        if (!result.preview)
            return;
        if (!String(result.preview).startsWith("data:image/"))
            return;
        const w = window.open();
        if (w)
            w.document.write(`<img src="${result.preview}" style="max-width:100%;height:auto" />`);
    };
    // ✅ Beschreibung modal open
    const openDescrModal = React.useCallback((rowId) => {
        const row = (result.items || []).find((x) => x.id === rowId);
        setDescrModalRowId(rowId);
        setDescrModalValue(String(row?.descr ?? ""));
        setDescrModalOpen(true);
    }, [result.items]);
    const closeDescrModal = React.useCallback(() => {
        setDescrModalOpen(false);
        setDescrModalRowId(null);
        setDescrModalValue("");
    }, []);
    const saveDescrModal = React.useCallback(() => {
        if (!descrModalRowId)
            return;
        updateRow(descrModalRowId, { descr: descrModalValue });
        closeDescrModal();
    }, [descrModalRowId, descrModalValue, updateRow, closeDescrModal]);
    // Esc to close
    React.useEffect(() => {
        if (!descrModalOpen)
            return;
        const onKey = (e) => {
            if (e.key === "Escape")
                closeDescrModal();
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "enter")
                saveDescrModal();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [descrModalOpen, closeDescrModal, saveDescrModal]);
    return (_jsxs("div", { className: "card", style: { padding: 16 }, children: [descrModalOpen ? (_jsx("div", { onClick: closeDescrModal, style: {
                    position: "fixed",
                    inset: 0,
                    background: "rgba(0,0,0,0.55)",
                    zIndex: 9999,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 18,
                }, children: _jsxs("div", { onClick: (e) => e.stopPropagation(), style: {
                        width: "min(980px, 96vw)",
                        background: "white",
                        borderRadius: 12,
                        overflow: "hidden",
                        border: "1px solid rgba(0,0,0,0.12)",
                        display: "flex",
                        flexDirection: "column",
                        boxShadow: "0 18px 60px rgba(0,0,0,0.25)",
                    }, children: [_jsxs("div", { style: {
                                padding: 12,
                                borderBottom: "1px solid var(--line)",
                                display: "flex",
                                gap: 10,
                                alignItems: "center",
                            }, children: [_jsx("div", { style: { fontWeight: 800, flex: 1 }, children: "Beschreibung bearbeiten" }), _jsx("div", { style: { fontSize: 12, opacity: 0.7 }, children: "Ctrl/\u2318 + Enter = Speichern" }), _jsx("button", { className: "btn", type: "button", onClick: closeDescrModal, children: "Schlie\u00DFen" }), _jsx("button", { className: "btn", type: "button", onClick: saveDescrModal, children: "Speichern" })] }), _jsx("div", { style: { padding: 12 }, children: _jsx("textarea", { value: descrModalValue, onChange: (e) => setDescrModalValue(e.target.value), style: {
                                    ...inpBase,
                                    width: "100%",
                                    minHeight: 200,
                                    resize: "vertical",
                                    lineHeight: 1.35,
                                }, placeholder: "Beschreibung\u2026", autoFocus: true }) })] }) })) : null, zoomOpen && result.preview && String(result.preview).startsWith("data:image/") ? (_jsx("div", { onClick: () => setZoomOpen(false), style: {
                    position: "fixed",
                    inset: 0,
                    background: "rgba(0,0,0,0.55)",
                    zIndex: 9999,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 18,
                }, children: _jsxs("div", { onClick: (e) => e.stopPropagation(), style: {
                        width: "min(1200px, 95vw)",
                        height: "min(85vh, 900px)",
                        background: "white",
                        borderRadius: 12,
                        overflow: "hidden",
                        border: "1px solid rgba(0,0,0,0.12)",
                        display: "flex",
                        flexDirection: "column",
                    }, children: [_jsxs("div", { style: {
                                padding: 10,
                                borderBottom: "1px solid var(--line)",
                                display: "flex",
                                gap: 10,
                                alignItems: "center",
                            }, children: [_jsx("div", { style: { fontWeight: 700, flex: 1 }, children: "PNG Zoom" }), _jsx("div", { style: { fontSize: 12, opacity: 0.75 }, children: "Zoom" }), _jsx("input", { type: "range", min: 1, max: 3, step: 0.05, value: zoomScale, onChange: (e) => setZoomScale(Number(e.target.value)) }), _jsx("button", { className: "btn", type: "button", onClick: () => setZoomOpen(false), children: "Schlie\u00DFen" })] }), _jsx("div", { style: { flex: 1, overflow: "auto", background: "#f4f6f8" }, children: _jsx("div", { style: { padding: 18 }, children: _jsx("img", { src: result.preview, alt: "Zoom", style: {
                                        transform: `scale(${zoomScale})`,
                                        transformOrigin: "top left",
                                        display: "block",
                                    } }) }) })] }) })) : null, _jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [_jsx("h2", { style: { marginTop: 0, marginBottom: 0, flex: 1 }, children: "Automatisierte Mengenermittlung (z. B. KI aus Plan)" }), _jsx("button", { className: "btn", onClick: () => void serverLoadAutoKi(), disabled: !projectKey || serverBusy, title: !projectKey ? "Kein Projekt (Server braucht Projekt)" : "Server laden (auto-ki.json)", children: serverBusy ? "…" : "Vom Server laden" }), _jsx("button", { className: "btn", onClick: () => void serverSaveAutoKi(), disabled: !projectKey || serverBusy, title: !projectKey ? "Kein Projekt (Server braucht Projekt)" : "Server speichern (auto-ki.json)", children: serverBusy ? "…" : "Speichern" }), _jsx("button", { className: "btn", onClick: () => void exportToAufmassEditor(), disabled: !projectKey || serverBusy, title: "Schreibt soll-ist.json und \u00F6ffnet Aufma\u00DF-Editor", children: serverBusy ? "…" : "→ Aufmaß-Editor" })] }), _jsxs("div", { style: { marginTop: 8, fontSize: 12, opacity: 0.7 }, children: ["API: ", _jsx("code", { children: API }), " \u2022 Keys: ", _jsx("code", { children: keyCandidates.join(" | ") || "—" }), " \u2022 LocalKey:", " ", _jsx("code", { children: effectiveKey || "—" })] }), _jsxs("div", { className: "card", onDragOver: (e) => e.preventDefault(), onDrop: onDrop, style: { padding: 10, minHeight: 180, position: "relative", marginTop: 10 }, children: [_jsxs("div", { style: { display: "flex", gap: 10, marginBottom: 8 }, children: [_jsx("div", { style: { flex: 1, opacity: 0.85 }, children: file ? (_jsxs(_Fragment, { children: [_jsxs("div", { children: [_jsx("b", { children: "Ausgew\u00E4hlt:" }), " ", file.name] }), _jsx("div", { style: { fontSize: 12, opacity: 0.7 }, children: "(Drag & Drop oder \u201CDatei w\u00E4hlen\u201D)" }), isPdfFile(file) ? (_jsx("div", { style: { fontSize: 12, opacity: 0.75, marginTop: 4 }, children: "Hinweis: PDF wird als hochaufl\u00F6sendes PNG (Seite 1) gerendert und an die KI gesendet. Zus\u00E4tzlich wird es in Tiles zerlegt, damit mehr Positionen erkannt werden." })) : null] })) : (_jsx("div", { children: "Zieh eine Datei hierher (PDF/JPG/PNG) oder w\u00E4hle eine Datei." })) }), _jsxs("div", { children: [_jsx("button", { className: "btn", onClick: () => fileInputRef.current?.click(), disabled: busy, type: "button", children: "Datei w\u00E4hlen" }), _jsx("input", { ref: fileInputRef, type: "file", accept: ".pdf,.jpg,.jpeg,.png", style: { display: "none" }, onChange: onPick })] }), _jsx("div", { children: _jsx("button", { className: "btn", onClick: analyze, disabled: !file || busy, type: "button", children: busy ? "Analysiere…" : "KI analysieren" }) }), _jsx("div", { children: _jsx("button", { className: "btn", type: "button", disabled: !projectKey || serverBusy, onClick: () => void snapshotAufmassHistory("auto-ki"), title: "Schreibt aufmass-history.json (Snapshot)", children: "Snapshot" }) })] }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "120px 1fr 120px 1fr", gap: 10 }, children: [_jsx("label", { style: { fontSize: 13, opacity: 0.8 }, children: "Ma\u00DFstab / Qualit\u00E4t" }), _jsx("input", { value: scale, onChange: (e) => setScale(e.target.value), onBlur: () => draftSave(), style: { ...inpBase, width: 140 } }), _jsx("label", { style: { fontSize: 13, opacity: 0.8 }, children: "Sprachnotiz / Text" }), _jsx("textarea", { value: note, onChange: (e) => setNote(e.target.value), onBlur: () => draftSave(), rows: 2, style: { ...inpBase, width: "100%" } })] }), _jsxs("div", { style: { marginTop: 10, border: "1px solid var(--line)", borderRadius: 8, padding: 8 }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }, children: [_jsx("div", { style: { fontWeight: 700, flex: 1 }, children: "Vorschau" }), result.preview && String(result.preview).startsWith("data:image/") ? (_jsxs(_Fragment, { children: [_jsx("button", { className: "btn", type: "button", onClick: () => setZoomOpen(true), children: "Zoom" }), _jsx("button", { className: "btn", type: "button", onClick: openPngInNewTab, children: "PNG \u00F6ffnen" })] })) : null] }), showPdfPreview ? (_jsx("iframe", { title: "PDF Vorschau", src: localPreviewUrl, style: { width: "100%", height: 520, border: 0, borderRadius: 8 } })) : result.preview ? (_jsx("canvas", { id: "auto-canvas", style: { width: "100%", maxHeight: 520 } })) : localPreviewUrl ? (_jsx("img", { src: localPreviewUrl, alt: "Vorschau", style: { width: "100%", maxHeight: 520, objectFit: "contain", borderRadius: 8 } })) : (_jsx("div", { style: { opacity: 0.6 }, children: "Noch keine Vorschau." }))] })] }), _jsxs("div", { className: "card", style: { marginTop: 12, padding: 0, overflow: "auto" }, children: [_jsxs("div", { style: { padding: 12, borderBottom: "1px solid var(--line)" }, children: [_jsx("div", { style: { fontWeight: 700 }, children: "Vorschau (Ergebnisse der KI)" }), result.summary ? _jsx("div", { style: { marginTop: 6, opacity: 0.75 }, children: result.summary }) : null] }), !result.boxes || result.boxes.length === 0 ? (_jsx("div", { style: { padding: 12, fontSize: 13, opacity: 0.7 }, children: "Noch keine KI-Bauteile erkannt (oder KI nicht verf\u00FCgbar)." })) : (_jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: th, children: "Bauteil" }), _jsx("th", { style: th, children: "Sicherheit" }), _jsx("th", { style: th, children: "Menge" }), _jsx("th", { style: th, children: "Einheit" })] }) }), _jsx("tbody", { children: result.boxes.map((b) => (_jsxs("tr", { children: [_jsx("td", { style: td, children: b.label }), _jsx("td", { style: td, children: prettyScore(b.score) }), _jsx("td", { style: td, children: b.qty ?? "-" }), _jsx("td", { style: td, children: b.unit ?? "-" })] }, b.id))) }), _jsx("tfoot", { children: _jsxs("tr", { children: [_jsx("td", { style: { ...td, fontWeight: 700 }, colSpan: 2, children: "Summe" }), _jsx("td", { style: { ...td, fontWeight: 700 }, children: sumQty || "-" }), _jsx("td", { style: { ...td, fontWeight: 700 }, children: "\u2013" })] }) })] }))] }), _jsxs("div", { className: "card", style: { marginTop: 12, padding: 0, overflow: "auto" }, children: [_jsxs("div", { style: {
                            padding: 12,
                            borderBottom: "1px solid var(--line)",
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                        }, children: [_jsx("div", { style: { fontWeight: 700, flex: 1 }, children: "Ergebnisse" }), _jsxs("div", { style: { display: "flex", gap: 8, alignItems: "center", fontSize: 12, opacity: 0.85 }, children: [_jsxs("span", { title: "OK (LV oder vollst\u00E4ndig/valide)", children: ["OK: ", _jsx("b", { children: validation.ok })] }), _jsxs("span", { title: "Warnung (AUTO/FOTO Positionen)", children: ["Warn: ", _jsx("b", { children: validation.warnings })] }), _jsxs("span", { title: "Ung\u00FCltig (fehlende/ung\u00FCltige Felder)", children: ["Fehler: ", _jsx("b", { children: validation.invalid })] }), _jsxs("span", { title: "Gesamt", children: ["Gesamt: ", _jsx("b", { children: validation.total })] })] }), _jsx("button", { className: "btn", type: "button", onClick: () => setEditMode((v) => !v), title: "Bearbeiten ein/aus", children: editMode ? "Bearbeiten: AN" : "Bearbeiten: AUS" }), editMode ? (_jsx("button", { className: "btn", type: "button", onClick: addRow, title: "Neue Zeile hinzuf\u00FCgen", children: "+ Zeile" })) : null, itemsTouched ? (_jsx("div", { style: { fontSize: 12, opacity: 0.7 }, title: "Es gibt ungespeicherte lokale \u00C4nderungen.", children: "ge\u00E4ndert" })) : null] }), result.msg ? (_jsx("div", { style: { padding: "0 12px 12px", opacity: 0.75, fontSize: 13 }, children: result.msg })) : null, _jsx("datalist", { id: "unit-list", children: unitOptions.map((u) => (_jsx("option", { value: u }, u))) }), result.items.length === 0 ? (_jsx("div", { style: { padding: 12, fontSize: 13, opacity: 0.7 }, children: "Noch keine Ergebnisse." })) : (_jsxs("table", { style: { width: "100%", borderCollapse: "collapse", tableLayout: "auto" }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: th, children: "Pos." }), _jsx("th", { style: th, children: "Typ" }), _jsx("th", { style: { ...th, minWidth: 420 }, children: "Beschreibung" }), _jsx("th", { style: th, children: "Einheit" }), _jsx("th", { style: th, children: "Menge" }), _jsx("th", { style: th, children: "Layer" }), _jsx("th", { style: th, children: "Quelle" }), _jsx("th", { style: th })] }) }), _jsx("tbody", { children: result.items.map((d) => {
                                    const { pk, issues } = rowIssues(d);
                                    const accepted = isPosAccepted(pk);
                                    const showWarn = accepted && (pk === "AUTO" || pk === "FOTO");
                                    const isInvalid = issues.length > 0 &&
                                        (pk === "EMPTY" ||
                                            pk === "OTHER" ||
                                            issues.some((x) => x.includes("fehlt") || x.includes("ungültig") || x.includes("< 0")));
                                    const cellTitle = issues.length
                                        ? issues.join(" • ")
                                        : showWarn
                                            ? "AUTO/FOTO Position – optional auf LV ändern"
                                            : "OK";
                                    const posInputStyle = inputStyleByIssues(inpCell, issues.filter((x) => x.includes("Pos")));
                                    const descrInputStyle = inputStyleByIssues({ ...descrArea, width: "100%" }, issues.filter((x) => x.includes("Beschreibung")));
                                    const unitInputStyle = inputStyleByIssues(inpCell, issues.filter((x) => x.includes("Einheit")));
                                    const qtyInputStyle = inputStyleByIssues(inpCellRight, issues.filter((x) => x.includes("Menge")));
                                    const rowStyle = isInvalid
                                        ? { background: "rgba(231,76,60,0.04)" }
                                        : showWarn
                                            ? { background: "rgba(241,196,15,0.06)" }
                                            : {};
                                    return (_jsxs("tr", { style: rowStyle, children: [_jsx("td", { style: td, title: cellTitle, children: editMode ? (_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [_jsx("input", { value: d.pos, onChange: (e) => updateRow(d.id, { pos: e.target.value }), style: posInputStyle }), _jsx("span", { style: badgeStyle(pk), children: badgeLabel(pk) })] })) : (_jsxs("div", { style: { display: "flex", alignItems: "center" }, children: [_jsx("span", { children: d.pos }), _jsx("span", { style: badgeStyle(pk), children: badgeLabel(pk) })] })) }), _jsx("td", { style: td, children: editMode ? (_jsxs("select", { value: d.type, onChange: (e) => updateRow(d.id, { type: e.target.value }), style: selCell, children: [_jsx("option", { value: "COUNT", children: "COUNT" }), _jsx("option", { value: "LINE", children: "LINE" }), _jsx("option", { value: "AREA", children: "AREA" })] })) : (d.type) }), _jsx("td", { style: td, title: issues.filter((x) => x.includes("Beschreibung")).join(" • ") || undefined, children: _jsxs("div", { style: { display: "flex", gap: 8, alignItems: "flex-start" }, children: [_jsx("div", { style: { flex: 1, minWidth: 380 }, children: editMode ? (_jsx("textarea", { value: d.descr, onChange: (e) => updateRow(d.id, { descr: e.target.value }), onInput: (e) => autoGrowTextArea(e.currentTarget), onFocus: (e) => autoGrowTextArea(e.currentTarget), rows: 2, style: descrInputStyle, placeholder: "Beschreibung\u2026" })) : (_jsx("div", { style: descrRead, children: d.descr || _jsx("span", { style: { opacity: 0.55 }, children: "(leer)" }) })) }), _jsx("button", { className: "btn", type: "button", title: "Gro\u00DF bearbeiten", onClick: () => openDescrModal(d.id), style: { padding: "6px 10px" }, children: "\u270E" })] }) }), _jsx("td", { style: td, title: issues.filter((x) => x.includes("Einheit")).join(" • ") || undefined, children: editMode ? (_jsx("input", { list: "unit-list", value: d.unit || "", onChange: (e) => updateRow(d.id, { unit: e.target.value }), style: unitInputStyle, placeholder: "m / m\u00B2 / St ..." })) : (d.unit) }), _jsx("td", { style: td, title: issues.filter((x) => x.includes("Menge")).join(" • ") || undefined, children: editMode ? (_jsx("input", { value: String(d.qty ?? 0), onChange: (e) => updateRow(d.id, { qty: clampNum(e.target.value, 0) }), style: qtyInputStyle, inputMode: "decimal" })) : (Number(d.qty || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })) }), _jsx("td", { style: td, children: editMode ? (_jsx("input", { value: d.layer ?? "", onChange: (e) => updateRow(d.id, { layer: e.target.value }), style: inpCell })) : (d.layer ?? "–") }), _jsx("td", { style: td, children: editMode ? (_jsx("input", { value: d.source ?? "", onChange: (e) => updateRow(d.id, { source: e.target.value }), style: inpCell })) : (d.source ?? "–") }), _jsx("td", { style: { ...td, width: 44 }, children: editMode ? (_jsx("button", { className: "btn", type: "button", onClick: () => deleteRow(d.id), title: "Zeile l\u00F6schen", children: "\uD83D\uDDD1" })) : null })] }, d.id));
                                }) })] })), _jsxs("div", { style: { padding: 12, borderTop: "1px solid var(--line)", fontSize: 12, opacity: 0.75 }, children: [_jsx("b", { children: "Validierung:" }), " Pos.-Format akzeptiert: ", _jsx("code", { children: "001.001" }), " (LV), ", _jsx("code", { children: "AUTO.001" }), ",", " ", _jsx("code", { children: "FOTO.001" }), ". Fehlende Felder werden rot markiert. ", _jsx("code", { children: "AUTO/FOTO" }), " sind Warnung (gelb), weil du sie ggf. auf eine echte LV-Position \u00E4ndern willst. Beschreibung kann inline (Textarea) oder \u00FCber", " ", _jsx("b", { children: "\u270E" }), " gro\u00DF bearbeitet werden."] })] }), _jsxs("div", { className: "card", style: { marginTop: 12, padding: 10 }, children: [_jsx("div", { style: { fontWeight: 600, marginBottom: 6 }, children: "Verlauf" }), !projectKey ? (_jsx("div", { style: { fontSize: 13, opacity: 0.75 }, children: "Kein Projekt gew\u00E4hlt (Server-Funktionen deaktiviert). Lokal wird trotzdem gespeichert." })) : history.length === 0 ? (_jsxs("div", { style: { fontSize: 13, opacity: 0.75 }, children: ["Noch keine St\u00E4nde. Mit ", _jsx("b", { children: "Speichern" }), " wird ein Snapshot erzeugt."] })) : (_jsx("div", { style: { display: "flex", flexWrap: "wrap", gap: 6 }, children: history.map((h) => (_jsxs("div", { className: "btn", style: { fontSize: 11, padding: "4px 8px", cursor: "default" }, title: `${h.source ?? ""} ${h.note ?? ""}`.trim(), children: [new Date(h.ts).toLocaleString(), " \u00B7 ", h.count, " Pos."] }, h.ts))) }))] })] }));
}
/* ===================== STYLES ===================== */
const inpBase = {
    padding: "8px 10px",
    border: "1px solid var(--line)",
    borderRadius: 8,
    outline: "none",
    background: "white",
    fontSize: 13,
};
const th = {
    textAlign: "left",
    padding: "10px 12px",
    fontSize: 12,
    fontWeight: 700,
    borderBottom: "1px solid var(--line)",
    background: "rgba(0,0,0,0.02)",
    whiteSpace: "nowrap",
};
const td = {
    padding: "10px 12px",
    fontSize: 13,
    borderBottom: "1px solid var(--line)",
    verticalAlign: "top",
};
const inpCell = {
    width: 140,
    padding: "6px 8px",
    border: "1px solid rgba(0,0,0,0.12)",
    borderRadius: 8,
    outline: "none",
    background: "white",
    fontSize: 13,
};
const inpCellRight = {
    ...inpCell,
    width: 110,
    textAlign: "right",
};
const selCell = {
    width: 120,
    padding: "6px 8px",
    border: "1px solid rgba(0,0,0,0.12)",
    borderRadius: 8,
    outline: "none",
    background: "white",
    fontSize: 13,
};
/* ✅ NEW: Beschreibung area */
const descrArea = {
    padding: "6px 8px",
    border: "1px solid rgba(0,0,0,0.12)",
    borderRadius: 10,
    outline: "none",
    background: "white",
    fontSize: 13,
    lineHeight: 1.35,
    resize: "vertical",
    minHeight: 44,
};
const descrRead = {
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    lineHeight: 1.35,
    padding: "6px 2px",
    minHeight: 44,
};
