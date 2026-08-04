import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/mengenermittlung/AutoKI.tsx
import { API_BASE, apiUrl } from "../../lib/apiBase";
import MengPageHeader from "./MengPageHeader";
import React from "react";
import { useNavigate } from "react-router-dom";
import { useProject } from "../../store/useProject";
/* ===================== API ===================== */
const AUTO_KI_BASE = apiUrl("/api/auto-ki");
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
    const { projectKey, note, scale, file, result, workflowMode } = args;
    return {
        savedAt: new Date().toISOString(),
        projectIdOrCode: projectKey,
        fsKey: projectKey,
        workflowMode,
        note,
        scale,
        sourceFile: file ?
            { name: file.name, type: file.type || undefined, size: file.size || undefined } :
            null,
        preview: result.preview ?? null,
        boxes: result.boxes ?? [],
        extras: result.extras ?? [],
        summary: result.summary ?? "",
        positions: result.positions ?? [],
        items: result.items ?? []
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
function getAutoKiAuthHeaders() {
    const keys = [
        "rlc_token",
        "token",
        "authToken",
        "accessToken",
        "rlc.auth.token",
        "rlc_mobile_token",
        "rlc_auth_token",
        "rlc_access_token"
    ];
    for (const key of keys) {
        const token = localStorage.getItem(key) ||
            sessionStorage.getItem(key);
        if (token?.trim()) {
            return { Authorization: `Bearer ${token.trim()}` };
        }
    }
    try {
        const raw = localStorage.getItem("auth") ||
            localStorage.getItem("rlc_auth") ||
            localStorage.getItem("user");
        if (raw) {
            const parsed = JSON.parse(raw);
            const token = parsed?.token ||
                parsed?.accessToken ||
                parsed?.authToken ||
                parsed?.jwt ||
                parsed?.data?.token ||
                parsed?.data?.accessToken ||
                parsed?.user?.token ||
                parsed?.user?.accessToken;
            if (typeof token === "string" && token.trim()) {
                return { Authorization: `Bearer ${token.trim()}` };
            }
        }
    }
    catch {
        // Keine gespeicherten Auth-Daten.
    }
    return {};
}
async function fetchFirstOk(urls, init) {
    let lastErr = null;
    for (const u of urls) {
        try {
            const headers = new Headers(init?.headers || {});
            const authHeaders = getAutoKiAuthHeaders();
            for (const [key, value] of Object.entries(authHeaders)) {
                headers.set(key, value);
            }
            const r = await fetch(u, {
                ...init,
                credentials: "include",
                headers
            });
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
/**
 * PDF.js uses a few very new JavaScript collection helpers.
 * Some Chrome/Chromium versions do not expose them yet.
 * Install small standards-compatible shims before importing pdfjs-dist.
 */
function ensurePdfJsRuntimeSupport() {
    const uint8Proto = Uint8Array.prototype;
    if (typeof uint8Proto.toHex !== "function") {
        Object.defineProperty(Uint8Array.prototype, "toHex", {
            configurable: true,
            writable: true,
            value: function toHex() {
                let out = "";
                for (let i = 0; i < this.length; i += 1) {
                    out += this[i].toString(16).padStart(2, "0");
                }
                return out;
            }
        });
    }
    const mapProto = Map.prototype;
    if (typeof mapProto.getOrInsert !== "function") {
        Object.defineProperty(Map.prototype, "getOrInsert", {
            configurable: true,
            writable: true,
            value: function getOrInsert(key, value) {
                if (this.has(key))
                    return this.get(key);
                this.set(key, value);
                return value;
            }
        });
    }
    if (typeof mapProto.getOrInsertComputed !== "function") {
        Object.defineProperty(Map.prototype, "getOrInsertComputed", {
            configurable: true,
            writable: true,
            value: function getOrInsertComputed(key, callback) {
                if (this.has(key))
                    return this.get(key);
                const value = callback(key);
                this.set(key, value);
                return value;
            }
        });
    }
}
async function pdfFirstPageToPng(file, desiredScale = 3.5, maxPixels = 18000000) {
    ensurePdfJsRuntimeSupport();
    const buf = await file.arrayBuffer();
    const pdfjs = await import("pdfjs-dist");
    const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(buf),
        disableWorker: true
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
    await page.
        render({
        canvas,
        canvasContext: ctx,
        viewport
    }).
        promise;
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
    const num = Number(s.
        replace(",", ".").
        replace(/[^0-9.]/g, ""));
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
        cvs.toBlob((b) => b ? resolve(b) : reject(new Error("toBlob failed")), "image/png");
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
                rows
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
            workflowMode: json.workflowMode === "NEUE_KALKULATION" ?
                "NEUE_KALKULATION" :
                "BESTEHENDES_LV",
            note: String(json.note ?? ""),
            scale: String(json.scale ?? "2.5"),
            sourceFile: json.sourceFile ?? null,
            preview: json.preview ?? null,
            boxes,
            extras,
            summary: String(json.summary ?? ""),
            positions,
            items
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
/* ===================== LV MATCHING / FREIGABE ===================== */
function normalizeMatchText(value) {
    return String(value ?? "").
        toLowerCase().
        normalize("NFD").
        replace(/[\u0300-\u036f]/g, "").
        replace(/ß/g, "ss").
        replace(/[^a-z0-9]+/g, " ").
        trim();
}
const MATCH_STOP_TOKENS = new Set([
    "lange",
    "laenge",
    "flache",
    "flaeche",
    "menge",
    "bereich",
    "oben",
    "unten",
    "links",
    "rechts",
    "plan",
    "position",
    "arbeiten",
    "arbeit",
    "verlegung",
    "herstellen",
    "meter",
    "stuck",
    "stueck"
]);
function matchTokens(value) {
    return new Set(normalizeMatchText(value).
        split(/\s+/).
        filter((token) => token.length >= 3 && !MATCH_STOP_TOKENS.has(token)));
}
function textSimilarity(a, b) {
    const left = matchTokens(a);
    const right = matchTokens(b);
    if (!left.size || !right.size)
        return 0;
    let intersection = 0;
    for (const token of left) {
        if (right.has(token))
            intersection += 1;
    }
    const union = new Set([...left, ...right]).size;
    return union ? intersection / union : 0;
}
function normalizeUnit(value) {
    return String(value ?? "").
        trim().
        toLowerCase().
        replace("²", "2").
        replace("³", "3").
        replace(/\s+/g, "");
}
function readLvReferences(keys) {
    const storageKeys = Array.from(new Set(keys.flatMap((key) => [
        `rlc_lv_data_v1:${key}`,
        `rlc_gaeb_import_v1:${key}`,
        `RLC_AUFMASS_${key}`
    ])));
    for (const storageKey of storageKeys) {
        try {
            const raw = localStorage.getItem(storageKey);
            if (!raw)
                continue;
            const parsed = JSON.parse(raw);
            const source = Array.isArray(parsed) ?
                parsed :
                Array.isArray(parsed?.rows) ?
                    parsed.rows :
                    Array.isArray(parsed?.items) ?
                        parsed.items :
                        [];
            const rows = source.
                map((row, index) => ({
                id: String(row?.id ?? row?.uuid ?? `${storageKey}-${index}`),
                pos: String(row?.pos ??
                    row?.posNr ??
                    row?.position ??
                    row?.positionsnummer ??
                    "").trim(),
                text: String(row?.text ??
                    row?.kurztext ??
                    row?.Kurztext ??
                    row?.description ??
                    "").trim(),
                unit: String(row?.unit ?? row?.einheit ?? row?.Einheit ?? "").trim()
            })).
                filter((row) => row.pos || row.text);
            if (rows.length)
                return rows;
        }
        catch {
            // Nächsten kompatiblen Projektspeicher prüfen.
        }
    }
    return [];
}
function isSyntheticPosition(value) {
    const pos = String(value ?? "").trim().toUpperCase();
    return /^(?:AUTO|FOTO|FILE|NA|NACH|NT)\./.test(pos);
}
function matchCandidateToLv(candidate, lvRows) {
    const candidatePos = String(candidate.pos || "").trim();
    const exact = !isSyntheticPosition(candidatePos) ?
        lvRows.find((row) => {
            const rowPos = String(row.pos || "").trim();
            return (rowPos &&
                !isSyntheticPosition(rowPos) &&
                rowPos === candidatePos);
        }) :
        undefined;
    if (exact) {
        return {
            match: exact,
            confidence: 1,
            reason: "Exakte LV-Positionsnummer"
        };
    }
    let best = null;
    let bestScore = 0;
    let bestTextScore = 0;
    let bestUnitScore = 0;
    for (const row of lvRows) {
        if (isSyntheticPosition(row.pos))
            continue;
        const textScore = textSimilarity(candidate.descr, row.text);
        const unitScore = normalizeUnit(candidate.unit) &&
            normalizeUnit(candidate.unit) === normalizeUnit(row.unit) ?
            1 :
            0;
        const score = textScore * 0.82 + unitScore * 0.18;
        if (score > bestScore) {
            best = row;
            bestScore = score;
            bestTextScore = textScore;
            bestUnitScore = unitScore;
        }
    }
    // Eine identische Einheit allein darf niemals einen LV-Treffer erzeugen.
    // Es muss eine belastbare textliche Übereinstimmung vorliegen.
    if (!best || bestTextScore < 0.45 || bestScore < 0.5) {
        return {
            match: null,
            confidence: Math.min(0.49, bestScore),
            reason: "Keine ausreichend ähnliche LV-Position gefunden"
        };
    }
    const reason = bestUnitScore > 0 ?
        `Kurztext ähnlich (${Math.round(bestTextScore * 100)} %) und Einheit identisch` :
        `Kurztext ähnlich (${Math.round(bestTextScore * 100)} %), Einheit prüfen`;
    return {
        match: best,
        confidence: Math.min(0.95, bestScore),
        reason
    };
}
function confidenceLabel(value) {
    return `${Math.round(Math.max(0, Math.min(1, value)) * 100)} %`;
}
function posKind(posRaw) {
    const pos = String(posRaw || "").trim().toUpperCase();
    if (!pos)
        return "EMPTY";
    if (/^(?:NA|NACH|NT)\.\d{1,4}$/.test(pos))
        return "NACHTRAG";
    if (/^AUTO\.\d{1,4}$/.test(pos))
        return "AUTO";
    if (/^FOTO\.\d{1,4}$/.test(pos))
        return "FOTO";
    // Numerische LV-Positionen:
    // 001 / 01.01 / 001.001 / 01.01.001 usw.
    if (/^\d{1,4}(?:\.\d{1,4}){0,4}$/.test(pos))
        return "LV";
    return "OTHER";
}
function isPosAccepted(kind) {
    return kind === "LV" || kind === "AUTO" || kind === "FOTO" || kind === "NACHTRAG";
}
function rowIssues(d) {
    const issues = [];
    const pk = posKind(d.pos);
    if (pk === "EMPTY")
        issues.push("Pos. fehlt");
    if (pk === "OTHER")
        issues.push("Pos. Format ungültig (z. B. 01.01 / 001.001 / AUTO.001 / FOTO.001 / NA.01)");
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
    if (pk === "NACHTRAG")
        return "NACHTRAG";
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
        fontWeight: 700,
        letterSpacing: 0.2,
        border: "1px solid rgba(0,0,0,0.12)",
        marginLeft: 8,
        whiteSpace: "nowrap"
    };
    if (pk === "LV")
        return { ...base, background: "rgba(46,204,113,0.16)" };
    if (pk === "AUTO")
        return { ...base, background: "rgba(52,152,219,0.14)" };
    if (pk === "FOTO")
        return { ...base, background: "rgba(155,89,182,0.14)" };
    if (pk === "NACHTRAG")
        return { ...base, background: "rgba(249,115,22,0.16)" };
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
        background: "rgba(231,76,60,0.06)"
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
    const projectKey = projectCode || projectId || null;
    const keyCandidates = React.useMemo(() => projectKey ? [projectKey] : [], [projectKey]);
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
    const [editMode, setEditMode] = React.useState(false);
    const [itemsTouched, setItemsTouched] = React.useState(false);
    const [workflowMode, setWorkflowMode] = React.useState("BESTEHENDES_LV");
    const [approvedIds, setApprovedIds] = React.useState(() => new Set());
    const [lvReferences, setLvReferences] = React.useState([]);
    const [candidateModalOpen, setCandidateModalOpen] = React.useState(false);
    const [candidateModalRowId, setCandidateModalRowId] = React.useState(null);
    const [candidateDraft, setCandidateDraft] = React.useState(null);
    React.useEffect(() => {
        setLvReferences(readLvReferences(keyCandidates));
    }, [keyCandidates]);
    React.useEffect(() => {
        setApprovedIds(new Set());
    }, [workflowMode]);
    const candidateItems = React.useMemo(() => {
        return (result.items || []).map((item) => {
            if (workflowMode === "NEUE_KALKULATION") {
                const backendStatus = String((result.positions || []).find((position) => String(position.id || "").trim() === String(item.pos || "").trim())?.status || "").toLowerCase();
                return {
                    ...item,
                    candidateStatus: backendStatus === "nachtrag" ? "NACHTRAG" : "NEUE_POSITION",
                    confidence: typeof item.confidence === "number" ? item.confidence : 0.75,
                    matchReason: item.matchReason ||
                        "Aus Plan/Foto erkannt; technische Prüfung vor Übernahme erforderlich"
                };
            }
            const matched = matchCandidateToLv(item, lvReferences);
            return {
                ...item,
                candidateStatus: matched.match ? "LV_MATCH" : "PRUEFEN",
                aiConfidence: typeof item.aiConfidence === "number" ?
                    item.aiConfidence :
                    typeof item.confidence === "number" ?
                        item.confidence :
                        0,
                matchConfidence: matched.confidence,
                confidence: typeof item.aiConfidence === "number" ?
                    item.aiConfidence :
                    typeof item.confidence === "number" ?
                        item.confidence :
                        0,
                matchReason: `${matched.reason}${item.matchReason ? ` · KI-Nachweis: ${item.matchReason}` : ""}`,
                matchedLvPos: matched.match?.pos,
                matchedLvText: matched.match?.text
            };
        });
    }, [result.items, result.positions, workflowMode, lvReferences]);
    const approvedCandidates = React.useMemo(() => candidateItems.filter((item) => approvedIds.has(item.id)), [candidateItems, approvedIds]);
    const toggleApproved = React.useCallback((id) => {
        setApprovedIds((previous) => {
            const next = new Set(previous);
            if (next.has(id))
                next.delete(id);
            else
                next.add(id);
            return next;
        });
    }, []);
    const approveAllValid = React.useCallback(() => {
        const next = new Set();
        for (const item of candidateItems) {
            const issues = rowIssues(item).issues;
            const hasHardIssue = issues.some((issue) => issue.includes("fehlt") ||
                issue.includes("ungültig") ||
                issue.includes("< 0"));
            if (!hasHardIssue)
                next.add(item.id);
        }
        setApprovedIds(next);
    }, [candidateItems, workflowMode]);
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
            workflowMode,
            result
        });
        const merged = { ...payload, ...(partial || {}) };
        lsSave(effectiveKey, merged);
    }, [effectiveKey, note, scale, file, workflowMode, result]);
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
                preview: null
            }));
            setItemsTouched(false);
            setApprovedIds(new Set());
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
                        positions: []
                    }
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
                preview: null
            }));
            setItemsTouched(false);
            setApprovedIds(new Set());
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
                        positions: []
                    }
                });
                lsSave(effectiveKey, tmpPayload);
            }
        }
    };
    const positionsToBoxes = React.useCallback((positions) => {
        return (positions || []).map((p, idx) => ({
            id: p.id || String(idx + 1),
            label: String(p.kurztext || ""),
            score: 0.95,
            qty: p.qty == null ? undefined : Number(p.qty),
            unit: p.einheit || "",
            box: undefined
        }));
    }, []);
    const positionsToExtras = React.useCallback((positions) => {
        return (positions || []).map((p) => ({
            id: crypto.randomUUID(),
            typ: "KI",
            lvPos: p.id || "",
            beschreibung: String(p.kurztext || ""),
            einheit: p.einheit || "",
            menge: p.qty == null ? 0 : Number(p.qty)
        }));
    }, []);
    const positionsToItems = React.useCallback((positions) => {
        return (positions || []).map((p, idx) => ({
            id: crypto.randomUUID(),
            pos: p.id && String(p.id).trim() ?
                String(p.id).trim() :
                `AUTO.${String(idx + 1).padStart(3, "0")}`,
            type: "COUNT",
            descr: String(p.kurztext || ""),
            unit: String(p.einheit || ""),
            qty: p.qty == null ? 0 : Number(p.qty),
            layer: "",
            source: "image+openai",
            confidence: typeof p.confidence === "number" ?
                Math.max(0, Math.min(1, p.confidence)) :
                0,
            aiConfidence: typeof p.confidence === "number" ?
                Math.max(0, Math.min(1, p.confidence)) :
                0,
            matchReason: String(p.evidence || "").trim()
        }));
    }, []);
    const makeUrls = React.useCallback((suffix) => keyCandidates.map((k) => `${AUTO_KI_BASE}${suffix.replace("{key}", encodeURIComponent(k))}`), [keyCandidates]);
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
                    if (local.workflowMode)
                        setWorkflowMode(local.workflowMode);
                    resetLocalPreview();
                    const itemsRaw = Array.isArray(local.items) ? local.items : [];
                    const itemsNorm = normalizeAndReindexAutoPositions(itemsRaw);
                    setResult({
                        items: itemsNorm,
                        preview: local.preview ?? null,
                        msg: `Geladen (lokal) • ${new Date(local.savedAt).toLocaleString()}`,
                        summary: String(local.summary ?? ""),
                        boxes: Array.isArray(local.boxes) && local.boxes.length ? local.boxes : boxesFromPositions,
                        extras: Array.isArray(local.extras) && local.extras.length ?
                            local.extras :
                            extrasFromPositions,
                        positions
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
            if (payload.workflowMode)
                setWorkflowMode(payload.workflowMode);
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
                positions
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
                    positions
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
        effectiveKey
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
            const previewToSave = override && "preview" in override ? override.preview ?? null : result.preview ?? null;
            const boxesToSave = Array.isArray(override?.boxes) ? override.boxes : result.boxes ?? [];
            const extrasToSave = Array.isArray(override?.extras) ? override.extras : result.extras ?? [];
            const summaryToSave = override && "summary" in override ? String(override.summary ?? "") : String(result.summary ?? "");
            const positionsToSave = Array.isArray(override?.positions) ?
                override.positions :
                result.positions ?? [];
            const payload = {
                workflowMode,
                note,
                scale,
                lvReferences: lvReferences.slice(0, 1500),
                preview: previewToSave,
                sourceFile: file ?
                    { name: file.name, type: file.type || undefined, size: file.size || undefined } :
                    null,
                items: itemsToSave,
                boxes: boxesToSave,
                extras: extrasToSave,
                summary: summaryToSave,
                positions: positionsToSave
            };
            const urls = makeUrls("/{key}/save");
            const { res, url } = await fetchFirstOk(urls, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const data = await res.json().catch(() => ({}));
            setResult((prev) => ({
                ...prev,
                msg: (override?.msg ? `${override.msg} • ` : "") +
                    `Gespeichert (Server) • ${data?.count ?? itemsToSave.length} Position(en) • ${url}`
            }));
            setHistory((prev) => {
                const snap = {
                    ts: Date.now(),
                    count: itemsToSave.length,
                    note: note || undefined,
                    source: file?.name || "auto-ki"
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
                    positions: positionsToSave
                }
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
    }, [
        keyCandidates,
        makeUrls,
        note,
        scale,
        file,
        projectKey,
        effectiveKey,
        draftSave,
        result,
        workflowMode,
        lvReferences
    ]);
    React.useEffect(() => {
        if (!effectiveKey)
            return;
        const local = lsLoad(effectiveKey);
        if (local) {
            const positions = Array.isArray(local.positions) ? local.positions : [];
            setNote(String(local.note ?? ""));
            setScale(String(local.scale ?? "2.5"));
            if (local.workflowMode)
                setWorkflowMode(local.workflowMode);
            const itemsBase = Array.isArray(local.items) ? local.items : positionsToItems(positions);
            const itemsNorm = normalizeAndReindexAutoPositions(itemsBase);
            setResult({
                items: itemsNorm,
                preview: local.preview ?? null,
                msg: `Wiederhergestellt (lokal) • ${new Date(local.savedAt).toLocaleString()}`,
                summary: String(local.summary ?? ""),
                boxes: Array.isArray(local.boxes) ? local.boxes : positionsToBoxes(positions),
                extras: Array.isArray(local.extras) ? local.extras : positionsToExtras(positions),
                positions
            });
            setItemsTouched(false);
            setLastKey(effectiveKey);
        }
        if (projectKey)
            void serverLoadAutoKi();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [effectiveKey]);
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
                    source: h.source ? String(h.source) : undefined
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
                type: d.type
            }));
            const { res } = await fetchFirstOk(urls, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rows: rowsForHistory, note: note || "", source })
            });
            const data = await res.json().catch(() => ({}));
            if (Array.isArray(data?.data?.history)) {
                setHistory(data.data.history.map((h) => ({
                    ts: Number(h.ts),
                    count: Number(h.count),
                    note: h.note ? String(h.note) : undefined,
                    source: h.source ? String(h.source) : undefined
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
                pos: "AUTO.000",
                type: "COUNT",
                descr: "",
                unit: "m",
                qty: 0,
                layer: "",
                source: "manuell"
            }
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
        const next = current.map((x) => x.id === id ? { ...x, ...patch } : x);
        applyItems(next, true);
    }, [applyItems, result.items]);
    const unitOptions = React.useMemo(() => {
        const base = ["m", "m²", "m³", "St", "Stk", "kg", "t", "h", "pausch"];
        const fromItems = uniqUnitsFromItems(result.items || []);
        return Array.from(new Set([...base, ...fromItems])).filter(Boolean);
    }, [result.items]);
    const validation = React.useMemo(() => {
        const rows = candidateItems;
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
    }, [candidateItems]);
    const exportToAufmassEditor = React.useCallback(async () => {
        if (!projectKey) {
            alert("Kein Projekt gewählt.");
            return;
        }
        if (!approvedCandidates.length) {
            alert("Bitte zuerst mindestens einen Kandidaten freigeben.");
            return;
        }
        const rows = approvedCandidates.
            map((candidate, index) => ({
            pos: workflowMode === "BESTEHENDES_LV" ?
                String(candidate.matchedLvPos || candidate.pos || "").trim() :
                String(candidate.pos || "").trim() ||
                    `AUTO.${String(index + 1).padStart(3, "0")}`,
            text: String(candidate.descr || candidate.matchedLvText || "").trim(),
            unit: String(candidate.unit || "").trim(),
            qty: clampNum(candidate.qty, 0),
            source: String(candidate.source || "auto-ki"),
            confidence: Number(candidate.confidence || 0),
            matchReason: String(candidate.matchReason || "")
        })).
            filter((row) => row.pos && row.text);
        if (!rows.length) {
            alert("Keine freigegebenen Positionen zum Export.");
            return;
        }
        setServerBusy(true);
        try {
            draftSave();
            setAufmassLastKey(projectKey);
            const urls = makeUrls("/{key}/export-to-aufmass");
            await fetchFirstOk(urls, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    projectKey,
                    workflowMode,
                    rows,
                    approvedOnly: true
                })
            });
            nav("/mengenermittlung/aufmasseditor?import=auto-ki");
        }
        catch (error) {
            console.error(error);
            alert(`Export fehlgeschlagen: ${error?.message || "Failed to fetch"}`);
        }
        finally {
            setServerBusy(false);
        }
    }, [
        projectKey,
        approvedCandidates,
        workflowMode,
        makeUrls,
        nav,
        draftSave
    ]);
    const exportToKalkulation = React.useCallback(async () => {
        if (!projectKey) {
            alert("Kein Projekt gewählt.");
            return;
        }
        if (!approvedCandidates.length) {
            alert("Bitte zuerst mindestens einen Kandidaten freigeben.");
            return;
        }
        const createdAt = new Date().toISOString();
        const newRows = approvedCandidates.map((candidate, index) => {
            const rawPos = String(candidate.pos || "").trim();
            const posNr = rawPos || `AUTO.${String(index + 1).padStart(3, "0")}`;
            const kurztext = String(candidate.descr || "").trim();
            const langtext = String(candidate.matchReason || "").trim();
            const einheit = String(candidate.unit || "m").trim() || "m";
            const menge = clampNum(candidate.qty, 0);
            return {
                id: String(candidate.id || "").trim() || crypto.randomUUID(),
                pos: posNr,
                posNr,
                kurztext,
                text: kurztext,
                langtext,
                einheit,
                unit: einheit,
                menge,
                qty: menge,
                ep: 0,
                preis: 0,
                unitPrice: 0,
                finalUnitPrice: 0,
                rlcKiUnitPrice: 0,
                gp: 0,
                gesamt: 0,
                totalNet: 0,
                rlcKiTotal: 0,
                source: "auto-ki-plan-foto",
                calculationStatus: "needs_review",
                status: "needs_review",
                riskLevel: "high",
                warning: "Neue Position aus KI-Mengenermittlung. Preis und Urkalkulation prüfen.",
                pruefHinweis: "Aus Plan-/Fotoanalyse übernommen. Noch nicht kalkuliert.",
                aiReason: langtext || "Neue Position aus KI-Mengenermittlung",
                confidence: Number(candidate.confidence || 0),
                importedFromAutoKi: true,
                importedAt: createdAt
            };
        });
        const handoff = {
            version: "auto-ki-kalkulation-handoff-v4",
            projectKey,
            projectId,
            createdAt,
            source: "AUTO_KI",
            rows: newRows
        };
        setServerBusy(true);
        try {
            await fetchFirstOk([
                apiUrl(`/api/kalkulation/ki-handoff/${encodeURIComponent(projectKey)}`)
            ], {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(handoff)
            });
            localStorage.setItem("rlc_auto_ki_kalkulation_import_v1", JSON.stringify(handoff));
            nav(`/kalkulation/mit-ki?from=auto-ki&projectId=${encodeURIComponent(projectKey)}`);
        }
        catch (error) {
            console.error(error);
            localStorage.setItem("rlc_auto_ki_kalkulation_import_v1", JSON.stringify(handoff));
            alert(`Server-Handoff fehlgeschlagen. Lokaler Fallback wurde gespeichert.\n${error?.message || "Failed to fetch"}`);
        }
        finally {
            setServerBusy(false);
        }
    }, [projectKey, projectId, approvedCandidates, nav]);
    const exportToNachtrag = React.useCallback(async () => {
        if (!projectKey) {
            alert("Kein Projekt gewählt.");
            return;
        }
        if (!approvedCandidates.length) {
            alert("Bitte zuerst mindestens einen Kandidaten freigeben.");
            return;
        }
        const rows = approvedCandidates.map((candidate, index) => {
            const rawPos = String(candidate.pos || "").trim();
            const posNr = /^(NA|NACH|NT)\.\d{2,4}$/i.test(rawPos) ?
                rawPos.toUpperCase() :
                `NA.${String(index + 1).padStart(2, "0")}`;
            return {
                id: String(candidate.id || "").trim() ||
                    crypto.randomUUID(),
                projectKey,
                lvPos: posNr,
                pos: posNr,
                posNr,
                number: "",
                title: String(candidate.descr || "").trim(),
                kurztext: String(candidate.descr || "").trim(),
                langtext: String(candidate.matchReason || "").trim(),
                unit: String(candidate.unit || "m").trim() || "m",
                einheit: String(candidate.unit || "m").trim() || "m",
                qty: clampNum(candidate.qty, 0),
                mengeDelta: clampNum(candidate.qty, 0),
                ep: 0,
                preis: 0,
                total: 0,
                status: "offen",
                note: String(candidate.matchReason || "").trim() ||
                    "Aus KI-Mengenermittlung aus Plan / Foto",
                begruendung: String(candidate.matchReason || "").trim() ||
                    "Aus KI-Mengenermittlung aus Plan / Foto",
                source: "AUTO_KI",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
        });
        setServerBusy(true);
        try {
            const endpoint = apiUrl(`/api/verknuepfung/nachtraege/${encodeURIComponent(projectKey)}`);
            const getResponse = await fetch(endpoint, {
                method: "GET",
                credentials: "include",
                headers: {
                    ...getAutoKiAuthHeaders()
                }
            });
            if (!getResponse.ok) {
                const text = await getResponse.text().catch(() => "");
                throw new Error(text || `Nachträge laden: HTTP ${getResponse.status}`);
            }
            const existingData = await getResponse.json().catch(() => ({}));
            const existingItems = Array.isArray(existingData?.items) ?
                existingData.items :
                [];
            const merged = [...existingItems];
            for (const row of rows) {
                const duplicateIndex = merged.findIndex((item) => {
                    const sameId = String(item?.id || "").trim() &&
                        String(item?.id || "").trim() === String(row.id).trim();
                    const sameContent = String(item?.lvPos || item?.posNr || item?.pos || "").
                        trim().
                        toLowerCase() ===
                        String(row.lvPos).trim().toLowerCase() &&
                        String(item?.title || item?.kurztext || "").
                            trim().
                            toLowerCase() ===
                            String(row.title).trim().toLowerCase();
                    return sameId || sameContent;
                });
                if (duplicateIndex >= 0) {
                    merged[duplicateIndex] = {
                        ...merged[duplicateIndex],
                        ...row,
                        id: merged[duplicateIndex]?.id || row.id,
                        number: merged[duplicateIndex]?.number || row.number,
                        createdAt: merged[duplicateIndex]?.createdAt || row.createdAt
                    };
                }
                else {
                    merged.push(row);
                }
            }
            const putResponse = await fetch(endpoint, {
                method: "PUT",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    ...getAutoKiAuthHeaders()
                },
                body: JSON.stringify({ items: merged })
            });
            if (!putResponse.ok) {
                const text = await putResponse.text().catch(() => "");
                throw new Error(text || `Nachträge speichern: HTTP ${putResponse.status}`);
            }
            localStorage.removeItem("rlc:nachtrag-buffer");
            nav(`/kalkulation/nachtraege?from=auto-ki&projectId=${encodeURIComponent(projectKey)}`);
        }
        catch (error) {
            console.error(error);
            localStorage.setItem("rlc:nachtrag-buffer", JSON.stringify({
                projectId: projectKey,
                projectKey,
                createdAt: Date.now(),
                source: "AUTO_KI",
                rows
            }));
            alert(`Server-Übertragung fehlgeschlagen: ${error?.message || "Unbekannter Fehler"}\nFallback wurde lokal gespeichert.`);
            nav(`/kalkulation/nachtraege?from=auto-ki&projectId=${encodeURIComponent(projectKey)}`);
        }
        finally {
            setServerBusy(false);
        }
    }, [projectKey, approvedCandidates, nav]);
    const deleteAutoKiData = React.useCallback(async () => {
        const confirmed = window.confirm("AutoKI-Daten, Vorschau und alte Prüfkandidaten für dieses Projekt löschen?");
        if (!confirmed)
            return;
        setServerBusy(true);
        try {
            resetLocalPreview();
            setFile(null);
            setNote("");
            setScale("2.5");
            setApprovedIds(new Set());
            setItemsTouched(false);
            setHistory([]);
            setResult({
                items: [],
                preview: null,
                msg: "",
                boxes: [],
                extras: [],
                summary: "",
                positions: []
            });
            const keys = Array.from(new Set([effectiveKey, ...keyCandidates].filter(Boolean)));
            for (const key of keys) {
                try {
                    localStorage.removeItem(LS_KEY(key));
                }
                catch { }
            }
            try {
                localStorage.removeItem(LS_LAST);
            }
            catch { }
            if (keyCandidates.length) {
                const urls = makeUrls("/{key}/save");
                await fetchFirstOk(urls, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        workflowMode,
                        note: "",
                        scale: "2.5",
                        lvReferences: [],
                        preview: null,
                        sourceFile: null,
                        items: [],
                        boxes: [],
                        extras: [],
                        summary: "",
                        positions: [],
                        deleted: true
                    })
                });
            }
        }
        catch (error) {
            console.error(error);
            alert(`Lokale Daten gelöscht. Server-Löschung fehlgeschlagen: ${error?.message || "Failed to fetch"}`);
        }
        finally {
            setServerBusy(false);
        }
    }, [
        effectiveKey,
        keyCandidates,
        makeUrls,
        resetLocalPreview,
        workflowMode
    ]);
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
                        overlap: 80
                    });
                }
                catch (e) {
                    console.error(e);
                    setResult((prev) => ({
                        ...prev,
                        preview: null,
                        msg: "PDF-Rendering fehlgeschlagen. Es wurden keine KI-Kandidaten erzeugt.",
                        boxes: [],
                        extras: [],
                        summary: "",
                        positions: [],
                        items: []
                    }));
                    setApprovedIds(new Set());
                    alert(`PDF → PNG fehlgeschlagen: ${e?.message || "unknown"}`);
                    return;
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
                    positions: result.positions ?? []
                };
                setResult(newState);
                draftSave();
                return;
            }
            const urls = makeUrls("/{key}/analyze");
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
                    fd.append("workflowMode", workflowMode);
                    fd.append("lvReferences", JSON.stringify(lvReferences.slice(0, 1500)));
                    const { res } = await fetchFirstOk(urls, { method: "POST", body: fd });
                    const data = await res.json().catch(() => ({}));
                    const summaryChunk = String(data?.summary ?? "");
                    const pos = Array.isArray(data?.positions) ? data.positions : [];
                    // Leere Rand-Tiles dürfen nicht die Gesamtzusammenfassung bestimmen.
                    if (summaryChunk && pos.length > 0)
                        summaries.push(summaryChunk);
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
                const itemsFinal = itemsDedup.length > 0 ?
                    itemsDedup :
                    positionsDedup.length > 0 ?
                        positionsToItems(positionsDedup) :
                        [];
                const finalPreview = previewDataUrl || null;
                const reindexedItems = normalizeAndReindexAutoPositions(itemsFinal || []);
                const newState = {
                    items: reindexedItems,
                    preview: finalPreview,
                    msg: `Analyse OK (Tiles: ${tiles.length})`,
                    boxes: boxesFinal,
                    extras: extrasFinal,
                    summary: `Erkannte Positionen: ${positionsDedup.length} (dedupliziert)${summaries.length ? ` • ${summaries[0]}` : ""}`,
                    positions: positionsDedup
                };
                setResult(newState);
                setItemsTouched(false);
                setApprovedIds(new Set());
                draftSave({ ...newState });
                try {
                    await serverSaveAutoKi({
                        items: newState.items,
                        preview: newState.preview ?? null,
                        boxes: newState.boxes ?? [],
                        extras: newState.extras ?? [],
                        summary: newState.summary ?? "",
                        positions: newState.positions ?? [],
                        msg: "Analyse"
                    });
                }
                catch { }
                return;
            }
            const fd = new FormData();
            fd.append("file", uploadBlob, uploadName);
            fd.append("note", note);
            fd.append("scale", scale);
            fd.append("workflowMode", workflowMode);
            fd.append("lvReferences", JSON.stringify(lvReferences.slice(0, 1500)));
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
                positions
            };
            setResult(newState);
            setItemsTouched(false);
            setApprovedIds(new Set());
            draftSave({
                preview: finalPreview ?? null,
                boxes,
                extras,
                summary,
                positions,
                items
            });
            try {
                await serverSaveAutoKi({
                    items,
                    preview: finalPreview ?? null,
                    boxes,
                    extras,
                    summary,
                    positions,
                    msg: "Analyse"
                });
            }
            catch { }
        }
        catch (err) {
            console.error(err);
            setApprovedIds(new Set());
            setResult({
                items: [],
                preview: null,
                msg: "Analyse fehlgeschlagen.",
                boxes: [],
                extras: [],
                summary: "",
                positions: []
            });
            alert(`Analyse fehlgeschlagen: ${err?.message || "Failed to fetch"}`);
        }
        finally {
            setBusy(false);
        }
    };
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
    const totalsByUnit = React.useMemo(() => {
        const totals = new Map();
        for (const box of result.boxes ?? []) {
            const qty = Number(box.qty);
            if (!Number.isFinite(qty))
                continue;
            const unit = String(box.unit || "ohne Einheit").trim() || "ohne Einheit";
            totals.set(unit, (totals.get(unit) || 0) + qty);
        }
        return Array.from(totals.entries()).sort(([a], [b]) => a.localeCompare(b, "de"));
    }, [result.boxes]);
    const openPngInNewTab = () => {
        if (!result.preview)
            return;
        if (!String(result.preview).startsWith("data:image/"))
            return;
        const w = window.open();
        if (w)
            w.document.write(`<img src="${result.preview}" style="max-width:100%;height:auto" />`);
    };
    const openCandidateModal = React.useCallback((rowId) => {
        const row = candidateItems.find((item) => item.id === rowId);
        if (!row)
            return;
        setCandidateModalRowId(rowId);
        setCandidateDraft({ ...row });
        setCandidateModalOpen(true);
    }, [candidateItems]);
    const closeCandidateModal = React.useCallback(() => {
        setCandidateModalOpen(false);
        setCandidateModalRowId(null);
        setCandidateDraft(null);
    }, []);
    const saveCandidateModal = React.useCallback(() => {
        if (!candidateModalRowId || !candidateDraft)
            return;
        updateRow(candidateModalRowId, {
            pos: candidateDraft.pos,
            type: candidateDraft.type,
            descr: candidateDraft.descr,
            unit: candidateDraft.unit,
            qty: clampNum(candidateDraft.qty, 0),
            layer: candidateDraft.layer || "",
            source: candidateDraft.source || "",
            candidateStatus: candidateDraft.candidateStatus,
            confidence: Math.max(0, Math.min(1, Number(candidateDraft.confidence || 0))),
            matchReason: candidateDraft.matchReason || "",
            matchedLvPos: candidateDraft.matchedLvPos || "",
            matchedLvText: candidateDraft.matchedLvText || ""
        });
        closeCandidateModal();
    }, [candidateModalRowId, candidateDraft, updateRow, closeCandidateModal]);
    React.useEffect(() => {
        if (!candidateModalOpen)
            return;
        const onKey = (event) => {
            if (event.key === "Escape")
                closeCandidateModal();
            if ((event.ctrlKey || event.metaKey) &&
                event.key.toLowerCase() === "enter") {
                saveCandidateModal();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [candidateModalOpen, closeCandidateModal, saveCandidateModal]);
    return (_jsxs("div", { className: "card rlc-migrated-pages-mengenermittlung-autoki-tsx-1221", children: [_jsx(MengPageHeader, { title: "KI-Mengenermittlung aus Plan / Foto", subtitle: "Arbeiten und Mengen erkennen, mit dem bestehenden LV abgleichen oder als Kandidaten f\u00FCr eine neue Kalkulation vorbereiten." }), candidateModalOpen && candidateDraft ?
                _jsx("div", { onClick: closeCandidateModal, className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1222", children: _jsxs("div", { onClick: (event) => event.stopPropagation(), className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1223", children: [_jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1224", children: [_jsx("div", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1225", children: "KI-Kandidat vollst\u00E4ndig bearbeiten" }), _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1226", children: "Ctrl/\u2318 + Enter = Speichern" }), _jsx("button", { className: "btn", type: "button", onClick: closeCandidateModal, children: "Schlie\u00DFen" }), _jsx("button", { className: "btn", type: "button", onClick: saveCandidateModal, children: "Speichern" })] }), _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1227", children: [_jsxs("label", { className: rlcClass(null, modalField), children: [_jsx("span", { className: rlcClass(null, modalLabel), children: "Pos.-Nr." }), _jsx("input", { value: candidateDraft.pos, onChange: (event) => setCandidateDraft((current) => current ? { ...current, pos: event.target.value } : current), className: rlcClass(null, modalInput) })] }), _jsxs("label", { className: rlcClass(null, modalField), children: [_jsx("span", { className: rlcClass(null, modalLabel), children: "Zuordnung" }), _jsxs("select", { value: candidateDraft.candidateStatus || "PRUEFEN", onChange: (event) => setCandidateDraft((current) => current ?
                                                    {
                                                        ...current,
                                                        candidateStatus: event.target.value
                                                    } :
                                                    current), className: rlcClass(null, modalInput), children: [_jsx("option", { value: "LV_MATCH", children: "LV-Match" }), _jsx("option", { value: "PRUEFEN", children: "Pr\u00FCfen / freie Position" }), _jsx("option", { value: "NACHTRAG", children: "Nachtrag" }), _jsx("option", { value: "NEUE_POSITION", children: "Neue Kalkulationsposition" })] })] }), _jsxs("label", { className: rlcClass(null, modalField), children: [_jsx("span", { className: rlcClass(null, modalLabel), children: "Typ" }), _jsxs("select", { value: candidateDraft.type, onChange: (event) => setCandidateDraft((current) => current ?
                                                    { ...current, type: event.target.value } :
                                                    current), className: rlcClass(null, modalInput), children: [_jsx("option", { value: "COUNT", children: "COUNT" }), _jsx("option", { value: "LINE", children: "LINE" }), _jsx("option", { value: "AREA", children: "AREA" })] })] }), _jsxs("label", { className: rlcClass(null, modalField), children: [_jsx("span", { className: rlcClass(null, modalLabel), children: "Einheit" }), _jsx("input", { list: "unit-list", value: candidateDraft.unit, onChange: (event) => setCandidateDraft((current) => current ? { ...current, unit: event.target.value } : current), className: rlcClass(null, modalInput) })] }), _jsxs("label", { className: rlcClass(null, modalField), children: [_jsx("span", { className: rlcClass(null, modalLabel), children: "Menge" }), _jsx("input", { inputMode: "decimal", value: String(candidateDraft.qty ?? 0), onChange: (event) => setCandidateDraft((current) => current ?
                                                    { ...current, qty: clampNum(event.target.value, 0) } :
                                                    current), className: rlcClass(null, modalInput) })] }), _jsxs("label", { className: rlcClass(null, modalField), children: [_jsx("span", { className: rlcClass(null, modalLabel), children: "Confidence (%)" }), _jsx("input", { type: "number", min: 0, max: 100, step: 1, value: Math.round(Number(candidateDraft.confidence || 0) * 100), onChange: (event) => setCandidateDraft((current) => current ?
                                                    {
                                                        ...current,
                                                        confidence: Math.max(0, Math.min(1, Number(event.target.value || 0) / 100))
                                                    } :
                                                    current), className: rlcClass(null, modalInput) })] }), _jsxs("label", { className: rlcClass(null, modalField), children: [_jsx("span", { className: rlcClass(null, modalLabel), children: "LV-Position" }), _jsx("input", { value: candidateDraft.matchedLvPos || "", onChange: (event) => setCandidateDraft((current) => current ?
                                                    { ...current, matchedLvPos: event.target.value } :
                                                    current), className: rlcClass(null, modalInput), placeholder: "z. B. 001.023" })] }), _jsxs("label", { className: rlcClass(null, modalField), children: [_jsx("span", { className: rlcClass(null, modalLabel), children: "LV-Kurztext" }), _jsx("input", { value: candidateDraft.matchedLvText || "", onChange: (event) => setCandidateDraft((current) => current ?
                                                    { ...current, matchedLvText: event.target.value } :
                                                    current), className: rlcClass(null, modalInput) })] }), _jsxs("label", { className: rlcClass(null, modalField), children: [_jsx("span", { className: rlcClass(null, modalLabel), children: "Layer / Bereich" }), _jsx("input", { value: candidateDraft.layer || "", onChange: (event) => setCandidateDraft((current) => current ? { ...current, layer: event.target.value } : current), className: rlcClass(null, modalInput) })] }), _jsxs("label", { className: rlcClass(null, modalField), children: [_jsx("span", { className: rlcClass(null, modalLabel), children: "Quelle" }), _jsx("input", { value: candidateDraft.source || "", onChange: (event) => setCandidateDraft((current) => current ? { ...current, source: event.target.value } : current), className: rlcClass(null, modalInput) })] }), _jsxs("label", { className: rlcClass(null, { ...modalField, gridColumn: "1 / -1" }), children: [_jsx("span", { className: rlcClass(null, modalLabel), children: "Beschreibung" }), _jsx("textarea", { value: candidateDraft.descr, onChange: (event) => setCandidateDraft((current) => current ? { ...current, descr: event.target.value } : current), className: rlcClass(null, { ...modalInput, minHeight: 150, resize: "vertical" }) })] }), _jsxs("label", { className: rlcClass(null, { ...modalField, gridColumn: "1 / -1" }), children: [_jsx("span", { className: rlcClass(null, modalLabel), children: "Match-Begr\u00FCndung / Pr\u00FCfhinweis" }), _jsx("textarea", { value: candidateDraft.matchReason || "", onChange: (event) => setCandidateDraft((current) => current ?
                                                    { ...current, matchReason: event.target.value } :
                                                    current), className: rlcClass(null, { ...modalInput, minHeight: 90, resize: "vertical" }) })] })] })] }) }) :
                null, zoomOpen && result.preview && String(result.preview).startsWith("data:image/") ?
                _jsx("div", { onClick: () => setZoomOpen(false), className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1228", children: _jsxs("div", { onClick: (e) => e.stopPropagation(), className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1229", children: [_jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1230", children: [_jsx("div", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1231", children: "PNG Zoom" }), _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1232", children: "Zoom" }), _jsx("input", { type: "range", min: 1, max: 3, step: 0.05, value: zoomScale, onChange: (e) => setZoomScale(Number(e.target.value)) }), _jsx("button", { className: "btn", type: "button", onClick: () => setZoomOpen(false), children: "Schlie\u00DFen" })] }), _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1233", children: _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1234", children: _jsx("img", { src: result.preview, alt: "Zoom", className: rlcClass(null, {
                                            transform: `scale(${zoomScale})`,
                                            transformOrigin: "top left",
                                            display: "block"
                                        }) }) }) })] }) }) :
                null, _jsxs("div", { className: "card rlc-migrated-pages-mengenermittlung-autoki-tsx-1235", children: [_jsxs("button", { type: "button", onClick: () => setWorkflowMode("BESTEHENDES_LV"), className: rlcClass(null, {
                            ...workflowCard,
                            ...(workflowMode === "BESTEHENDES_LV" ?
                                workflowCardActive :
                                {})
                        }), children: [_jsx("strong", { children: "Aufma\u00DF zu bestehendem LV" }), _jsx("span", { children: "KI-Erkennungen werden mit den Positionen des aktuellen LV abgeglichen. Nur manuell freigegebene Treffer gelangen in den Aufma\u00DF-Editor." }), _jsxs("small", { children: ["Geladene LV-Positionen: ", lvReferences.length] })] }), _jsxs("button", { type: "button", onClick: () => setWorkflowMode("NEUE_KALKULATION"), className: rlcClass(null, {
                            ...workflowCard,
                            ...(workflowMode === "NEUE_KALKULATION" ?
                                workflowCardActive :
                                {})
                        }), children: [_jsx("strong", { children: "Neue Kalkulation aus Plan / Foto" }), _jsx("span", { children: "KI erkennt Arbeiten, L\u00E4ngen, Fl\u00E4chen, Volumen und St\u00FCckzahlen als neue Kalkulationskandidaten." }), _jsx("small", { children: "\u00DCbernahme erst nach manueller Pr\u00FCfung und Freigabe." })] })] }), _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1236", children: [_jsx("h2", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1237", children: workflowMode === "BESTEHENDES_LV" ?
                            "Plan / Foto analysieren und mit LV abgleichen" :
                            "Plan / Foto analysieren und Kalkulationspositionen erzeugen" }), _jsx("button", { className: "btn", onClick: () => void serverLoadAutoKi(), disabled: !projectKey || serverBusy, title: !projectKey ? "Kein Projekt (Server braucht Projekt)" : "Server laden (auto-ki.json)", children: serverBusy ? "…" : "Vom Server laden" }), _jsx("button", { className: "btn", onClick: () => void serverSaveAutoKi(), disabled: !projectKey || serverBusy, title: !projectKey ? "Kein Projekt (Server braucht Projekt)" : "Server speichern (auto-ki.json)", children: serverBusy ? "…" : "Speichern" }), _jsx("button", { className: "btn rlc-migrated-pages-mengenermittlung-autoki-tsx-1238", type: "button", onClick: () => void deleteAutoKiData(), disabled: serverBusy, title: "Alte AutoKI-Daten, Vorschau und Pr\u00FCfkandidaten l\u00F6schen", children: serverBusy ? "…" : "Löschen" }), _jsx("button", { className: "btn", onClick: () => workflowMode === "BESTEHENDES_LV" ?
                            void exportToAufmassEditor() :
                            exportToKalkulation(), disabled: !projectKey || serverBusy || approvedCandidates.length === 0, title: approvedCandidates.length === 0 ?
                            "Zuerst Kandidaten freigeben" :
                            workflowMode === "BESTEHENDES_LV" ?
                                "Freigegebene Positionen in den Aufmaß-Editor übernehmen" :
                                "Freigegebene Kandidaten an die Kalkulation übergeben", children: serverBusy ?
                            "…" :
                            workflowMode === "BESTEHENDES_LV" ?
                                `→ Aufmaß-Editor (${approvedCandidates.length})` :
                                `→ Kalkulation (${approvedCandidates.length})` })] }), _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1239", children: ["Modus: ", _jsx("b", { children: workflowMode === "BESTEHENDES_LV" ? "Bestehendes LV" : "Neue Kalkulation" }), " \u2022 API: ", _jsx("code", { children: API_BASE || "(relative)" }), " \u2022 Server-Key: ", _jsx("code", { children: projectKey || "—" }), " \u2022 LocalKey:", " ", _jsx("code", { children: effectiveKey || "—" })] }), _jsxs("div", { className: "card rlc-migrated-pages-mengenermittlung-autoki-tsx-1240", onDragOver: (e) => e.preventDefault(), onDrop: onDrop, children: [_jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1241", children: [_jsx("div", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1242", children: file ?
                                    _jsxs(_Fragment, { children: [_jsxs("div", { children: [_jsx("b", { children: "Ausgew\u00E4hlt:" }), " ", file.name] }), _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1243", children: "(Drag & Drop oder \u201CDatei w\u00E4hlen\u201D)" }), isPdfFile(file) ?
                                                _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1244", children: "Hinweis: PDF wird als hochaufl\u00F6sendes PNG (Seite 1) gerendert und an die KI gesendet. Zus\u00E4tzlich wird es in Tiles zerlegt, damit mehr Positionen erkannt werden." }) :
                                                null] }) :
                                    _jsx("div", { children: "Zieh eine Datei hierher (PDF/JPG/PNG) oder w\u00E4hle eine Datei." }) }), _jsxs("div", { children: [_jsx("button", { className: "btn", onClick: () => fileInputRef.current?.click(), disabled: busy, type: "button", children: "Datei w\u00E4hlen" }), _jsx("input", { ref: fileInputRef, type: "file", accept: ".pdf,.jpg,.jpeg,.png", onChange: onPick, className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1245" })] }), _jsx("div", { children: _jsx("button", { className: "btn", onClick: analyze, disabled: !file || busy, type: "button", children: busy ? "Analysiere…" : "KI analysieren" }) }), _jsx("div", { children: _jsx("button", { className: "btn", type: "button", disabled: !projectKey || serverBusy, onClick: () => void snapshotAufmassHistory("auto-ki"), title: "Schreibt aufmass-history.json (Snapshot)", children: "Snapshot" }) })] }), _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1246", children: [_jsx("label", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1247", children: "Ma\u00DFstab / Qualit\u00E4t" }), _jsx("input", { value: scale, onChange: (e) => setScale(e.target.value), onBlur: () => draftSave(), className: rlcClass(null, { ...inpBase, width: 140 }) }), _jsx("label", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1248", children: "Sprachnotiz / Text" }), _jsx("textarea", { value: note, onChange: (e) => setNote(e.target.value), onBlur: () => draftSave(), rows: 2, className: rlcClass(null, { ...inpBase, width: "100%" }) })] }), _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1249", children: [_jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1250", children: [_jsx("div", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1251", children: "Vorschau" }), result.preview && String(result.preview).startsWith("data:image/") ?
                                        _jsxs(_Fragment, { children: [_jsx("button", { className: "btn", type: "button", onClick: () => setZoomOpen(true), children: "Zoom" }), _jsx("button", { className: "btn", type: "button", onClick: openPngInNewTab, children: "PNG \u00F6ffnen" })] }) :
                                        null] }), showPdfPreview ?
                                _jsx("iframe", { title: "PDF Vorschau", src: localPreviewUrl, className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1252" }) :
                                result.preview ?
                                    _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1253", children: _jsx("canvas", { id: "auto-canvas", className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1254" }) }) :
                                    localPreviewUrl ?
                                        _jsx("img", { src: localPreviewUrl, alt: "Vorschau", className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1255" }) :
                                        _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1256", children: "Noch keine Vorschau." })] })] }), _jsxs("div", { className: "card rlc-migrated-pages-mengenermittlung-autoki-tsx-1257", children: [_jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1258", children: [_jsx("div", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1259", children: "Vorschau (Ergebnisse der KI)" }), result.summary ? _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1260", children: result.summary }) : null] }), !result.boxes || result.boxes.length === 0 ?
                        _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1261", children: "Noch keine KI-Bauteile erkannt (oder KI nicht verf\u00FCgbar)." }) :
                        _jsxs("table", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1262", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, th), children: "Bauteil" }), _jsx("th", { className: rlcClass(null, th), children: "Sicherheit" }), _jsx("th", { className: rlcClass(null, th), children: "Menge" }), _jsx("th", { className: rlcClass(null, th), children: "Einheit" })] }) }), _jsx("tbody", { children: result.boxes.map((b) => _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, td), children: b.label }), _jsx("td", { className: rlcClass(null, td), children: prettyScore(b.score) }), _jsx("td", { className: rlcClass(null, td), children: b.qty ?? "-" }), _jsx("td", { className: rlcClass(null, td), children: b.unit ?? "-" })] }, b.id)) }), _jsx("tfoot", { children: totalsByUnit.length ?
                                        totalsByUnit.map(([unit, total], index) => _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, { ...td, fontWeight: 600 }), colSpan: 2, children: index === 0 ? "Summen nach Einheit" : "" }), _jsx("td", { className: rlcClass(null, { ...td, fontWeight: 600 }), children: total.toLocaleString("de-DE", {
                                                        maximumFractionDigits: 3
                                                    }) }), _jsx("td", { className: rlcClass(null, { ...td, fontWeight: 600 }), children: unit })] }, unit)) :
                                        _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, { ...td, fontWeight: 600 }), colSpan: 2, children: "Summe" }), _jsx("td", { className: rlcClass(null, { ...td, fontWeight: 600 }), children: "\u2013" }), _jsx("td", { className: rlcClass(null, { ...td, fontWeight: 600 }), children: "\u2013" })] }) })] })] }), _jsxs("div", { className: "card rlc-migrated-pages-mengenermittlung-autoki-tsx-1263", children: [_jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1264", children: [_jsx("div", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1265", children: "Pr\u00FCfkandidaten" }), _jsx("button", { className: "btn", type: "button", onClick: approveAllValid, disabled: !candidateItems.length, children: "G\u00FCltige freigeben" }), _jsxs("button", { className: "btn", type: "button", onClick: () => void exportToAufmassEditor(), disabled: !approvedCandidates.length || serverBusy, title: "Auch freie AUTO-Positionen k\u00F6nnen nach manueller Freigabe \u00FCbertragen werden.", children: ["Ins Aufma\u00DFEditor \u00FCbertragen (", approvedCandidates.length, ")"] }), _jsxs("button", { className: "btn", type: "button", onClick: exportToNachtrag, disabled: !approvedCandidates.length || serverBusy, children: ["Nachtrag erstellen (", approvedCandidates.length, ")"] }), _jsxs("button", { className: "btn", type: "button", onClick: exportToKalkulation, disabled: !approvedCandidates.length || serverBusy, children: ["In Kalkulation \u00FCbertragen (", approvedCandidates.length, ")"] }), _jsx("button", { className: "btn", type: "button", onClick: () => setApprovedIds(new Set()), disabled: !approvedIds.size, children: "Freigaben zur\u00FCcksetzen" }), _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1266", children: [_jsxs("span", { title: "OK (LV oder vollst\u00E4ndig/valide)", children: ["OK: ", _jsx("b", { children: validation.ok })] }), _jsxs("span", { title: "Warnung (AUTO/FOTO Positionen)", children: ["Warn: ", _jsx("b", { children: validation.warnings })] }), _jsxs("span", { title: "Ung\u00FCltig (fehlende/ung\u00FCltige Felder)", children: ["Fehler: ", _jsx("b", { children: validation.invalid })] }), _jsxs("span", { title: "Gesamt", children: ["Gesamt: ", _jsx("b", { children: validation.total })] })] }), _jsx("button", { className: "btn", type: "button", onClick: () => setEditMode((v) => !v), title: "Bearbeiten ein/aus", children: editMode ? "Bearbeiten: AN" : "Bearbeiten: AUS" }), editMode ?
                                _jsx("button", { className: "btn", type: "button", onClick: addRow, title: "Neue Zeile hinzuf\u00FCgen", children: "+ Zeile" }) :
                                null, itemsTouched ?
                                _jsx("div", { title: "Es gibt ungespeicherte lokale \u00C4nderungen.", className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1267", children: "ge\u00E4ndert" }) :
                                null] }), result.msg ?
                        _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1268", children: result.msg }) :
                        null, _jsx("datalist", { id: "unit-list", children: unitOptions.map((u) => _jsx("option", { value: u }, u)) }), candidateItems.length === 0 ?
                        _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1269", children: "Noch keine Ergebnisse." }) :
                        _jsxs("table", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1270", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, th), children: "Freigabe" }), _jsx("th", { className: rlcClass(null, th), children: "Pos." }), _jsx("th", { className: rlcClass(null, th), children: "Zuordnung" }), _jsx("th", { className: rlcClass(null, th), children: "Confidence" }), _jsx("th", { className: rlcClass(null, th), children: "Typ" }), _jsx("th", { className: rlcClass(null, { ...th, minWidth: 420 }), children: "Beschreibung" }), _jsx("th", { className: rlcClass(null, th), children: "Einheit" }), _jsx("th", { className: rlcClass(null, th), children: "Menge" }), _jsx("th", { className: rlcClass(null, th), children: "Layer" }), _jsx("th", { className: rlcClass(null, th), children: "Quelle" }), _jsx("th", { className: rlcClass(null, th) })] }) }), _jsx("tbody", { children: candidateItems.map((d) => {
                                        const { pk, issues } = rowIssues(d);
                                        const accepted = isPosAccepted(pk);
                                        const showWarn = accepted && (pk === "AUTO" || pk === "FOTO");
                                        const isInvalid = issues.length > 0 && (pk === "EMPTY" ||
                                            pk === "OTHER" ||
                                            issues.some((x) => x.includes("fehlt") || x.includes("ungültig") || x.includes("< 0")));
                                        const cellTitle = issues.length ?
                                            issues.join(" • ") :
                                            showWarn ?
                                                "AUTO/FOTO Position – optional auf LV ändern" :
                                                "OK";
                                        const posInputStyle = inputStyleByIssues(inpCell, issues.filter((x) => x.includes("Pos")));
                                        const descrInputStyle = inputStyleByIssues({ ...descrArea, width: "100%" }, issues.filter((x) => x.includes("Beschreibung")));
                                        const unitInputStyle = inputStyleByIssues(inpCell, issues.filter((x) => x.includes("Einheit")));
                                        const qtyInputStyle = inputStyleByIssues(inpCellRight, issues.filter((x) => x.includes("Menge")));
                                        const rowStyle = isInvalid ?
                                            { background: "rgba(231,76,60,0.04)" } :
                                            showWarn ?
                                                { background: "rgba(241,196,15,0.06)" } :
                                                {};
                                        return (_jsxs("tr", { className: rlcClass(null, {
                                                ...rowStyle,
                                                ...(approvedIds.has(d.id) ?
                                                    { outline: "2px solid rgba(22,163,74,0.22)" } :
                                                    {})
                                            }), children: [_jsx("td", { className: rlcClass(null, td), children: _jsx("input", { type: "checkbox", checked: approvedIds.has(d.id), onChange: () => toggleApproved(d.id), "aria-label": `Kandidat ${d.pos} freigeben` }) }), _jsx("td", { className: rlcClass(null, td), title: cellTitle, children: editMode ?
                                                        _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1271", children: [_jsx("input", { value: d.pos, onChange: (e) => updateRow(d.id, { pos: e.target.value }), className: rlcClass(null, posInputStyle) }), _jsx("span", { className: rlcClass(null, badgeStyle(pk)), children: badgeLabel(pk) })] }) :
                                                        _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1272", children: [_jsx("span", { children: d.pos }), _jsx("span", { className: rlcClass(null, badgeStyle(pk)), children: badgeLabel(pk) })] }) }), _jsxs("td", { className: rlcClass(null, td), children: [_jsx("div", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1273", children: d.candidateStatus === "LV_MATCH" ?
                                                                `LV ${d.matchedLvPos || d.pos}` :
                                                                d.candidateStatus === "NACHTRAG" ?
                                                                    "Nachtrag" :
                                                                    d.candidateStatus === "NEUE_POSITION" ?
                                                                        "Neue Position" :
                                                                        "Prüfen" }), _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1274", children: d.matchedLvText || d.matchReason || "—" })] }), _jsxs("td", { className: rlcClass(null, td), children: [_jsx("strong", { children: confidenceLabel(Number(d.confidence || 0)) }), _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1275", children: d.matchReason || "Technisch prüfen" })] }), _jsx("td", { className: rlcClass(null, td), children: editMode ?
                                                        _jsxs("select", { value: d.type, onChange: (e) => updateRow(d.id, { type: e.target.value }), className: rlcClass(null, selCell), children: [_jsx("option", { value: "COUNT", children: "COUNT" }), _jsx("option", { value: "LINE", children: "LINE" }), _jsx("option", { value: "AREA", children: "AREA" })] }) :
                                                        d.type }), _jsx("td", { className: rlcClass(null, td), title: issues.filter((x) => x.includes("Beschreibung")).join(" • ") || undefined, children: _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1276", children: [_jsx("div", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1277", children: editMode ?
                                                                    _jsx("textarea", { value: d.descr, onChange: (e) => updateRow(d.id, { descr: e.target.value }), onInput: (e) => autoGrowTextArea(e.currentTarget), onFocus: (e) => autoGrowTextArea(e.currentTarget), rows: 2, className: rlcClass(null, descrInputStyle), placeholder: "Beschreibung\u2026" }) :
                                                                    _jsx("div", { className: rlcClass(null, descrRead), children: d.descr || _jsx("span", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1278", children: "(leer)" }) }) }), _jsx("button", { className: "btn rlc-migrated-pages-mengenermittlung-autoki-tsx-1279", type: "button", title: "Alle Kandidatendaten bearbeiten", onClick: () => openCandidateModal(d.id), children: "\u270E" })] }) }), _jsx("td", { className: rlcClass(null, td), title: issues.filter((x) => x.includes("Einheit")).join(" • ") || undefined, children: editMode ?
                                                        _jsx("input", { list: "unit-list", value: d.unit || "", onChange: (e) => updateRow(d.id, { unit: e.target.value }), className: rlcClass(null, unitInputStyle), placeholder: "m / m\u00B2 / St ..." }) :
                                                        d.unit }), _jsx("td", { className: rlcClass(null, td), title: issues.filter((x) => x.includes("Menge")).join(" • ") || undefined, children: editMode ?
                                                        _jsx("input", { value: String(d.qty ?? 0), onChange: (e) => updateRow(d.id, { qty: clampNum(e.target.value, 0) }), className: rlcClass(null, qtyInputStyle), inputMode: "decimal" }) :
                                                        Number(d.qty || 0).toLocaleString(undefined, { maximumFractionDigits: 3 }) }), _jsx("td", { className: rlcClass(null, td), children: editMode ?
                                                        _jsx("input", { value: d.layer ?? "", onChange: (e) => updateRow(d.id, { layer: e.target.value }), className: rlcClass(null, inpCell) }) :
                                                        d.layer ?? "–" }), _jsx("td", { className: rlcClass(null, td), children: editMode ?
                                                        _jsx("input", { value: d.source ?? "", onChange: (e) => updateRow(d.id, { source: e.target.value }), className: rlcClass(null, inpCell) }) :
                                                        d.source ?? "–" }), _jsx("td", { className: rlcClass(null, { ...td, width: 44 }), children: editMode ?
                                                        _jsx("button", { className: "btn", type: "button", onClick: () => deleteRow(d.id), title: "Zeile l\u00F6schen", children: "\uD83D\uDDD1\uFE0F" }) :
                                                        null })] }, d.id));
                                    }) })] }), _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1280", children: [_jsx("b", { children: "Pr\u00FCfregel:" }), " Die KI liefert ausschlie\u00DFlich Kandidaten. Confidence und LV-Zuordnung sind Entscheidungshilfen, keine automatische Freigabe. Nur markierte Zeilen werden \u00FCbernommen. Im Modus", _jsx("b", { children: " Bestehendes LV" }), " werden ausschlie\u00DFlich best\u00E4tigte LV-Treffer an den Aufma\u00DF-Editor \u00FCbergeben. Im Modus ", _jsx("b", { children: "Neue Kalkulation" }), " werden best\u00E4tigte neue Positionen als Kalkulationskandidaten gespeichert."] })] }), _jsxs("div", { className: "card rlc-migrated-pages-mengenermittlung-autoki-tsx-1281", children: [_jsx("div", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1282", children: "Verlauf" }), !projectKey ?
                        _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1283", children: "Kein Projekt gew\u00E4hlt (Server-Funktionen deaktiviert). Lokal wird trotzdem gespeichert." }) :
                        history.length === 0 ?
                            _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1284", children: ["Noch keine St\u00E4nde. Mit ", _jsx("b", { children: "Speichern" }), " wird ein Snapshot erzeugt."] }) :
                            _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-autoki-tsx-1285", children: history.map((h) => _jsxs("div", { className: "btn rlc-migrated-pages-mengenermittlung-autoki-tsx-1286", title: `${h.source ?? ""} ${h.note ?? ""}`.trim(), children: [new Date(h.ts).toLocaleString(), " \u00B7 ", h.count, " Pos."] }, h.ts)) })] })] }));
}
/* ===================== STYLES ===================== */
const workflowCard = {
    display: "grid",
    gap: 7,
    textAlign: "left",
    padding: 16,
    border: "1px solid #d7e2f0",
    borderRadius: 14,
    background: "#ffffff",
    color: "#0f172a",
    cursor: "pointer",
    boxShadow: "0 4px 14px rgba(15,23,42,0.04)"
};
const workflowCardActive = {
    borderColor: "#0f4ec9",
    background: "#eaf2ff",
    boxShadow: "0 0 0 3px rgba(15,78,201,0.12)"
};
const modalField = {
    display: "flex",
    flexDirection: "column",
    gap: 6
};
const modalLabel = {
    fontSize: 12,
    fontWeight: 700,
    color: "#475569"
};
const modalInput = {
    width: "100%",
    padding: "9px 10px",
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    background: "white",
    fontSize: 13,
    outline: "none"
};
const inpBase = {
    padding: "8px 10px",
    border: "1px solid var(--line)",
    borderRadius: 8,
    outline: "none",
    background: "white",
    fontSize: 13
};
const th = {
    padding: "9px 10px",
    borderBottom: "1px solid #e5eaf3",
    background: "#f8fafc",
    color: "#475569",
    fontWeight: 700,
    textAlign: "left",
    whiteSpace: "nowrap"
};
const td = {
    padding: "8px 10px",
    borderBottom: "1px solid #eef2f7",
    color: "#0f172a",
    verticalAlign: "top"
};
const inpCell = {
    width: 140,
    padding: "6px 8px",
    border: "1px solid rgba(0,0,0,0.12)",
    borderRadius: 8,
    outline: "none",
    background: "white",
    fontSize: 13
};
const inpCellRight = {
    ...inpCell,
    width: 110,
    textAlign: "right"
};
const selCell = {
    width: 120,
    padding: "6px 8px",
    border: "1px solid rgba(0,0,0,0.12)",
    borderRadius: 8,
    outline: "none",
    background: "white",
    fontSize: 13
};
const descrArea = {
    padding: "6px 8px",
    border: "1px solid rgba(0,0,0,0.12)",
    borderRadius: 10,
    outline: "none",
    background: "white",
    fontSize: 13,
    lineHeight: 1.35,
    resize: "vertical",
    minHeight: 44
};
const descrRead = {
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    lineHeight: 1.35,
    padding: "6px 2px",
    minHeight: 44
};
