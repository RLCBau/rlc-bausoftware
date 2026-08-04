import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle"; // RLC Bausoftware · apps/web/src/pages/kalkulation/lv-import.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { API_BASE } from "../../lib/apiBase";
import { useProject } from "../../store/useProject";
import { LV } from "./store.lv";
const MWST_KEY = "rlc_lv_mwst_v1";
function apiUrl(path) {
    const base = String(API_BASE || "").replace(/\/+$/, "");
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    return base ? `${base}${cleanPath}` : cleanPath;
}
function getAuthToken() {
    try {
        const directKeys = [
            "token",
            "authToken",
            "accessToken",
            "rlc_token",
            "rlc_auth_token",
            "rlc_access_token"
        ];
        for (const key of directKeys) {
            const value = localStorage.getItem(key);
            if (value && value.trim())
                return value.trim();
        }
        const jsonKeys = ["auth", "user", "session", "rlc_auth", "rlc_session"];
        for (const key of jsonKeys) {
            const raw = localStorage.getItem(key);
            if (!raw)
                continue;
            try {
                const parsed = JSON.parse(raw);
                const token = parsed?.token ??
                    parsed?.accessToken ??
                    parsed?.authToken ??
                    parsed?.jwt ??
                    parsed?.data?.token ??
                    parsed?.data?.accessToken;
                if (typeof token === "string" && token.trim())
                    return token.trim();
            }
            catch {
                //
            }
        }
    }
    catch {
        //
    }
    return "";
}
function withAuthHeaders(extra) {
    const token = getAuthToken();
    return {
        ...(extra || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
}
function getCurrentProjectFromSources(projectCtx) {
    const ctxProject = projectCtx?.currentProject ??
        projectCtx?.current ??
        projectCtx?.selectedProject ??
        projectCtx?.project ?? (typeof projectCtx?.getCurrentProject === "function" ?
        projectCtx.getCurrentProject() :
        null);
    if (ctxProject)
        return ctxProject;
    try {
        return (globalThis.__RLC_CURRENT_PROJECT ?? null);
    }
    catch {
        return null;
    }
}
function getProjectCode(project) {
    return String(project?.code ?? project?.number ?? project?.projektnummer ?? "").
        trim().
        toUpperCase();
}
function getProjectName(project) {
    return String(project?.name ?? project?.projectName ?? project?.projektname ?? "").trim();
}
function normalizedLookupText(value) {
    return String(value ?? "").
        trim().
        toLocaleLowerCase("de-DE").
        normalize("NFKD").
        replace(/[\u0300-\u036f]/g, "").
        replace(/\s+/g, " ");
}
function normalizedPositionParts(value) {
    return String(value ?? "").
        trim().
        toLocaleLowerCase("de-DE").
        split(/[^a-z0-9]+/i).
        filter(Boolean).
        map((part) => {
        if (!/^\d+$/.test(part))
            return part;
        const normalized = part.replace(/^0+(?=\d)/, "");
        return normalized || "0";
    });
}
function rowMeta(row) {
    return row?.meta || {};
}
function rowIdentityValues(row) {
    const meta = rowMeta(row);
    return [
        row.id,
        meta?.id,
        meta?.positionId,
        meta?.lvPositionId,
        meta?.uuid,
        meta?.sourcePositionId
    ].
        map((item) => normalizedLookupText(item)).
        filter(Boolean);
}
function rowPositionValues(row) {
    const meta = rowMeta(row);
    return [
        row.posNr,
        meta?.fullPositionNumber,
        meta?.lvPositionNumber,
        meta?.gaebOz,
        meta?.positionOz,
        meta?.outlineNumber,
        meta?.positionNumber,
        meta?.positionNo,
        meta?.posNr,
        meta?.pos,
        meta?.oz
    ].
        map((item) => String(item ?? "").trim()).
        filter(Boolean);
}
function resolveRequestedLvRow(candidateRows, request) {
    const requestedId = normalizedLookupText(request.positionId);
    const requestedText = normalizedLookupText(request.shortText);
    const requestedParts = normalizedPositionParts(request.positionNumber);
    if (requestedId) {
        const idMatch = candidateRows.find((row) => rowIdentityValues(row).includes(requestedId));
        if (idMatch)
            return { row: idMatch, ambiguous: false };
    }
    if (requestedParts.length) {
        const exactPositionMatches = candidateRows.filter((row) => rowPositionValues(row).some((item) => {
            const parts = normalizedPositionParts(item);
            return (parts.length === requestedParts.length &&
                parts.every((part, index) => part === requestedParts[index]));
        }));
        if (exactPositionMatches.length === 1) {
            return { row: exactPositionMatches[0], ambiguous: false };
        }
        if (exactPositionMatches.length > 1 && requestedText) {
            const textMatch = exactPositionMatches.find((row) => normalizedLookupText(row.kurztext) === requestedText);
            if (textMatch)
                return { row: textMatch, ambiguous: false };
        }
        const requestedLastPart = requestedParts[requestedParts.length - 1];
        const suffixMatches = candidateRows.filter((row) => rowPositionValues(row).some((item) => {
            const parts = normalizedPositionParts(item);
            return parts.length > 0 && parts[parts.length - 1] === requestedLastPart;
        }));
        if (suffixMatches.length === 1) {
            return { row: suffixMatches[0], ambiguous: false };
        }
        if (suffixMatches.length > 1 && requestedText) {
            const textMatch = suffixMatches.find((row) => normalizedLookupText(row.kurztext) === requestedText);
            if (textMatch)
                return { row: textMatch, ambiguous: false };
        }
        if (exactPositionMatches.length > 1 || suffixMatches.length > 1) {
            return { row: null, ambiguous: true };
        }
    }
    if (requestedText) {
        const textMatches = candidateRows.filter((row) => normalizedLookupText(row.kurztext) === requestedText);
        if (textMatches.length === 1)
            return { row: textMatches[0], ambiguous: false };
        if (textMatches.length > 1)
            return { row: null, ambiguous: true };
    }
    return { row: null, ambiguous: false };
}
function toNumber(value) {
    if (typeof value === "number")
        return Number.isFinite(value) ? value : 0;
    const raw = String(value ?? "").trim();
    if (!raw)
        return 0;
    const normalized = raw.includes(",") ?
        raw.replace(/\./g, "").replace(",", ".") :
        raw.replace(/\s/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
}
function round2(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}
function fmtCurrency(v) {
    return new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR"
    }).format(toNumber(v));
}
function fmtNumber(v) {
    return toNumber(v).toLocaleString("de-DE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 3
    });
}
function esc(s) {
    return String(s ?? "").
        replace(/&/g, "&amp;").
        replace(/</g, "&lt;").
        replace(/>/g, "&gt;").
        replace(/"/g, "&quot;");
}
function lineTotal(row) {
    if (typeof row.gesamt === "number" && Number.isFinite(row.gesamt)) {
        return row.gesamt;
    }
    return round2(toNumber(row.menge) * toNumber(row.preis));
}
function safeUuid() {
    try {
        return crypto.randomUUID();
    }
    catch {
        return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
}
function makeLvRow(patch) {
    const menge = toNumber(patch?.menge);
    const preis = patch?.preis === undefined || patch?.preis === null ? 0 : toNumber(patch.preis);
    return {
        id: String(patch?.id || safeUuid()),
        posNr: String(patch?.posNr ?? ""),
        parentPosNr: String(patch?.parentPosNr ?? ""),
        sortIndex: patch?.sortIndex,
        kurztext: String(patch?.kurztext ?? ""),
        langtext: String(patch?.langtext ?? ""),
        bemerkung: String(patch?.bemerkung ?? ""),
        einheit: String(patch?.einheit ?? "m"),
        menge,
        preis,
        gesamt: patch?.gesamt === undefined || patch?.gesamt === null ?
            round2(menge * preis) :
            toNumber(patch.gesamt),
        waehrung: String(patch?.waehrung ?? "EUR"),
        confidence: patch?.confidence,
        source: patch?.source ?? "manual",
        createdAt: patch?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
}
function lvTextKey(row) {
    return String(`${row.kurztext || ""} ${row.langtext || ""}`).
        toLowerCase().
        normalize("NFKD").
        replace(/[\u0300-\u036f]/g, "").
        replace(/[^a-z0-9äöüß]+/gi, " ").
        replace(/\s+/g, " ").
        trim();
}
function getLvDuplicateGroups(rows) {
    const map = new Map();
    for (const row of rows) {
        const text = lvTextKey(row);
        if (text.length < 8)
            continue;
        const key = [
            text.slice(0, 140),
            String(row.einheit || "").trim().toLowerCase(),
            round2(toNumber(row.menge)),
            round2(toNumber(row.preis))
        ].
            join("|");
        const list = map.get(key) || [];
        list.push(row);
        map.set(key, list);
    }
    return Array.from(map.values()).filter((group) => group.length > 1);
}
function lvRowScore(row) {
    return ((String(row.posNr || "").trim() ? 10 : 0) + (String(row.kurztext || "").trim() ? 10 : 0) + (String(row.langtext || "").trim() ? 8 : 0) + (String(row.einheit || "").trim() ? 6 : 0) + (toNumber(row.menge) > 0 ? 10 : 0) + (toNumber(row.preis) > 0 ? 10 : 0));
}
function suggestUnit(row) {
    const existing = String(row.einheit || "").trim();
    if (existing)
        return existing;
    const text = lvTextKey(row);
    if (text.includes("aushub") ||
        text.includes("boden") ||
        text.includes("verfull") ||
        text.includes("verfüll") ||
        text.includes("kies") ||
        text.includes("schotter") ||
        text.includes("beton")) {
        return "m³";
    }
    if (text.includes("asphalt") ||
        text.includes("pflaster") ||
        text.includes("fläche") ||
        text.includes("flache") ||
        text.includes("tragschicht") ||
        text.includes("deckschicht")) {
        return "m²";
    }
    if (text.includes("rohr") ||
        text.includes("leitung") ||
        text.includes("kabel") ||
        text.includes("speedpipe") ||
        text.includes("trasse")) {
        return "m";
    }
    if (text.includes("schacht") ||
        text.includes("anschluss") ||
        text.includes("bogen") ||
        text.includes("muffe") ||
        text.includes("abzweig")) {
        return "St";
    }
    if (text.includes("abfuhr") || text.includes("entsorgung"))
        return "t";
    return "m";
}
function suggestKurztext(row) {
    const kurz = String(row.kurztext || "").trim();
    if (kurz.length >= 6)
        return kurz;
    const lang = String(row.langtext || "").replace(/\s+/g, " ").trim();
    if (lang.length >= 6)
        return lang.slice(0, 90);
    const pos = String(row.posNr || "").trim();
    return pos ? `Leistung zu Position ${pos}` : "Leistung prüfen";
}
function suggestLangtext(row) {
    const existing = String(row.langtext || "").trim();
    if (existing.length >= 25)
        return existing;
    const kurz = suggestKurztext(row);
    const unit = suggestUnit(row);
    const text = lvTextKey(row);
    const parts = [];
    parts.push(`${kurz}.`);
    parts.push(`Ausführung gemäß Leistungsbeschreibung und Ausführungsplanung.`);
    parts.push(`Abrechnung nach tatsächlich ausgeführter Menge in ${unit}.`);
    if (text.includes("aushub") || text.includes("graben")) {
        parts.push("Einschließlich Lösen, Laden, profilgerechtem Herstellen und seitlichem Lagern beziehungsweise Abfahren nach Erfordernis.");
    }
    if (text.includes("verfull") || text.includes("verfüll") || text.includes("kies") || text.includes("schotter")) {
        parts.push("Einschließlich lagenweisem Einbau, Verdichtung und Herstellung der geforderten Tragfähigkeit.");
    }
    if (text.includes("rohr") || text.includes("leitung") || text.includes("speedpipe") || text.includes("kabel")) {
        parts.push("Einschließlich Lieferung beziehungsweise Verlegung, Ausrichtung, Bettung und fachgerechtem Anschluss.");
    }
    if (text.includes("asphalt") || text.includes("pflaster")) {
        parts.push("Einschließlich Vorbereitung des Untergrundes, Einbau, Verdichtung und höhengerechter Wiederherstellung der Oberfläche.");
    }
    parts.push("Nebenleistungen, Geräte, Personal, Material und erforderliche Hilfsleistungen sind einzukalkulieren.");
    return parts.join(" ");
}
function rowStatus(row) {
    if (!String(row.posNr || "").trim() || !String(row.kurztext || "").trim()) {
        return "critical";
    }
    if (!String(row.einheit || "").trim() || toNumber(row.menge) <= 0) {
        return "warning";
    }
    return "ok";
}
function statusLabel(status) {
    if (status === "ok")
        return "OK";
    if (status === "warning")
        return "Prüfen";
    return "Fehlt";
}
function KpiCard({ label, value, sub }) {
    return (_jsxs("div", { className: rlcClass(null, kpiCard), children: [_jsx("div", { className: rlcClass(null, kpiLabel), children: label }), _jsx("div", { className: rlcClass(null, kpiValue), children: value }), sub ? _jsx("div", { className: rlcClass(null, kpiSub), children: sub }) : null] }));
}
function Field({ label, children }) {
    return (_jsxs("label", { className: "rlc-migrated-pages-kalkulation-lv-import-tsx-912", children: [_jsx("span", { className: rlcClass(null, labelStyle), children: label }), children] }));
}
export default function LVImportPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const fileRef = useRef(null);
    const selectedItemRef = useRef(null);
    const projectCtx = useProject();
    const selectionRequest = useMemo(() => {
        const params = new URLSearchParams(location.search);
        return {
            projectCode: String(params.get("projectCode") || "").trim().toUpperCase(),
            positionId: String(params.get("positionId") || "").trim(),
            positionNumber: String(params.get("positionNumber") || params.get("posNr") || "").trim(),
            shortText: String(params.get("shortText") || "").trim()
        };
    }, [location.search]);
    const currentProject = getCurrentProjectFromSources(projectCtx);
    const contextProjectCode = getProjectCode(currentProject);
    const projectCode = selectionRequest.projectCode || contextProjectCode;
    const projectName = !selectionRequest.projectCode || selectionRequest.projectCode === contextProjectCode ?
        getProjectName(currentProject) :
        "";
    const canUseLocalFallback = !selectionRequest.projectCode || selectionRequest.projectCode === contextProjectCode;
    const hasRequestedPosition = Boolean(selectionRequest.positionId ||
        selectionRequest.positionNumber ||
        selectionRequest.shortText);
    const [rows, setRows] = useState([]);
    const [selectedId, setSelectedId] = useState("");
    const [mwst, setMwst] = useState(() => Number(localStorage.getItem(MWST_KEY) ?? 19));
    const [info, setInfo] = useState("");
    const [syncBusy, setSyncBusy] = useState(false);
    const [query, setQuery] = useState("");
    const [viewMode, setViewMode] = useState("editor");
    const [qualityFilter, setQualityFilter] = useState("alle");
    const [kiWorking, setKiWorking] = useState(false);
    const [kiProgress, setKiProgress] = useState(0);
    const [kiLog, setKiLog] = useState([]);
    useEffect(() => {
        let cancelled = false;
        async function loadLv() {
            const localRows = LV.list();
            if (!projectCode) {
                if (!cancelled) {
                    const selection = resolveRequestedLvRow(localRows, selectionRequest);
                    setRows(localRows);
                    setSelectedId(selection.row?.id || localRows[0]?.id || "");
                }
                return;
            }
            try {
                setInfo("Lade Projekt-LV vom Server …");
                const response = await fetch(apiUrl(`/api/projects/${encodeURIComponent(projectCode)}/lv`), {
                    method: "GET",
                    credentials: "include",
                    headers: withAuthHeaders({
                        Accept: "application/json"
                    })
                });
                const raw = await response.text();
                let payload = {};
                try {
                    payload = raw ? JSON.parse(raw) : {};
                }
                catch {
                    payload = {};
                }
                if (!response.ok) {
                    throw new Error(payload?.error ||
                        payload?.message ||
                        `LV konnte nicht geladen werden: HTTP ${response.status}`);
                }
                const source = payload?.items ??
                    payload?.rows ??
                    payload?.positions ??
                    payload?.lv?.items ??
                    payload?.lv?.rows ??
                    payload?.data?.items ??
                    payload?.data?.rows ??
                    payload?.data?.positions ??
                    payload?.data ??
                    payload;
                const serverRows = Array.isArray(source) ?
                    source.map((item, index) => ({
                        id: String(item?.id ||
                            item?.positionId ||
                            item?.uuid ||
                            `${projectCode}-${index + 1}`),
                        posNr: String(item?.fullPositionNumber ||
                            item?.lvPositionNumber ||
                            item?.gaebOz ||
                            item?.positionOz ||
                            item?.outlineNumber ||
                            item?.posNr ||
                            item?.positionNumber ||
                            item?.positionNo ||
                            item?.pos ||
                            item?.oz ||
                            ""),
                        parentPosNr: String(item?.parentPosNr || item?.parentPos || ""),
                        sortIndex: item?.sortIndex === undefined ? index : Number(item.sortIndex),
                        kurztext: String(item?.kurztext ||
                            item?.shortText ||
                            item?.shorttext ||
                            item?.text ||
                            item?.description ||
                            ""),
                        langtext: String(item?.langtext ||
                            item?.longText ||
                            item?.longtext ||
                            item?.descriptionLong ||
                            ""),
                        bemerkung: String(item?.bemerkung || item?.note || ""),
                        einheit: String(item?.einheit ||
                            item?.unit ||
                            item?.me ||
                            ""),
                        menge: toNumber(item?.menge ??
                            item?.quantity ??
                            item?.qty ??
                            0),
                        preis: toNumber(item?.preis ??
                            item?.unitPrice ??
                            item?.unitPriceNet ??
                            item?.ep ??
                            0),
                        gesamt: toNumber(item?.gesamt ??
                            item?.total ??
                            item?.totalNet ??
                            item?.gp ??
                            0),
                        waehrung: String(item?.waehrung || item?.currency || "EUR"),
                        source: "import",
                        createdAt: item?.createdAt,
                        updatedAt: item?.updatedAt,
                        meta: item
                    })) :
                    [];
                if (cancelled)
                    return;
                if (serverRows.length > 0) {
                    const storedRows = LV.setAll(serverRows);
                    const selection = resolveRequestedLvRow(storedRows, selectionRequest);
                    setRows(storedRows);
                    setSelectedId(selection.row?.id || storedRows[0]?.id || "");
                    setInfo(hasRequestedPosition ?
                        selection.row ?
                            `Marktbeobachtung: Position ${selection.row.posNr || "ohne Nummer"} im Projekt ${projectCode} geöffnet.` :
                            selection.ambiguous ?
                                `Marktbeobachtung: Mehrere passende Positionen in ${projectCode} gefunden. Bitte über die Suche eingrenzen.` :
                                `Marktbeobachtung: Die gemeldete Position wurde im LV von ${projectCode} nicht gefunden.` :
                        `${storedRows.length} LV-Positionen vom Server geladen.`);
                    return;
                }
                const fallbackRows = canUseLocalFallback ? localRows : [];
                const selection = resolveRequestedLvRow(fallbackRows, selectionRequest);
                setRows(fallbackRows);
                setSelectedId(selection.row?.id || fallbackRows[0]?.id || "");
                setInfo(hasRequestedPosition ?
                    selection.row ?
                        `Marktbeobachtung: Position ${selection.row.posNr || "ohne Nummer"} im lokalen LV geöffnet.` :
                        `Marktbeobachtung: Die gemeldete Position wurde im LV von ${projectCode} nicht gefunden.` :
                    fallbackRows.length ?
                        "Keine Server-LV gefunden. Lokaler Stand geladen." :
                        "Für dieses Projekt wurde kein LV gefunden.");
            }
            catch (error) {
                if (cancelled)
                    return;
                const fallbackRows = canUseLocalFallback ? localRows : [];
                const selection = resolveRequestedLvRow(fallbackRows, selectionRequest);
                setRows(fallbackRows);
                setSelectedId(selection.row?.id || fallbackRows[0]?.id || "");
                setInfo(hasRequestedPosition && !canUseLocalFallback ?
                    `Das Projekt-LV ${projectCode} konnte nicht vom Server geladen werden.` :
                    error?.message ||
                        "LV konnte nicht vom Server geladen werden.");
            }
        }
        void loadLv();
        return () => {
            cancelled = true;
        };
    }, [
        projectCode,
        selectionRequest,
        hasRequestedPosition,
        canUseLocalFallback
    ]);
    useEffect(() => {
        if (!hasRequestedPosition || !selectedId)
            return;
        const frame = window.requestAnimationFrame(() => {
            selectedItemRef.current?.scrollIntoView({
                block: "center",
                behavior: "smooth"
            });
        });
        return () => window.cancelAnimationFrame(frame);
    }, [hasRequestedPosition, selectedId]);
    useEffect(() => {
        localStorage.setItem(MWST_KEY, String(mwst || 0));
    }, [mwst]);
    const duplicateGroups = useMemo(() => getLvDuplicateGroups(rows), [rows]);
    const duplicateIds = useMemo(() => {
        return new Set(duplicateGroups.flatMap((group) => group.map((row) => row.id)));
    }, [duplicateGroups]);
    const qualityStats = useMemo(() => {
        return {
            total: rows.length,
            critical: rows.filter((r) => rowStatus(r) === "critical").length,
            warning: rows.filter((r) => rowStatus(r) === "warning").length,
            epFehlt: rows.filter((r) => toNumber(r.preis) <= 0).length,
            einheitFehlt: rows.filter((r) => !String(r.einheit || "").trim()).length,
            mengeFehlt: rows.filter((r) => toNumber(r.menge) <= 0).length,
            kurztextFehlt: rows.filter((r) => !String(r.kurztext || "").trim()).length,
            langtextFehlt: rows.filter((r) => !String(r.langtext || "").trim()).length,
            doppelte: duplicateGroups.reduce((sum, g) => sum + Math.max(0, g.length - 1), 0)
        };
    }, [rows, duplicateGroups]);
    const filteredRows = useMemo(() => {
        const q = query.trim().toLowerCase();
        return rows.filter((r) => {
            if (qualityFilter === "kritisch" && rowStatus(r) !== "critical")
                return false;
            if (qualityFilter === "warning" && rowStatus(r) !== "warning")
                return false;
            if (qualityFilter === "epFehlt" && toNumber(r.preis) > 0)
                return false;
            if (qualityFilter === "einheitFehlt" && String(r.einheit || "").trim())
                return false;
            if (qualityFilter === "mengeFehlt" && toNumber(r.menge) > 0)
                return false;
            if (qualityFilter === "kurztextFehlt" && String(r.kurztext || "").trim())
                return false;
            if (qualityFilter === "langtextFehlt" && String(r.langtext || "").trim())
                return false;
            if (qualityFilter === "doppelte" && !duplicateIds.has(r.id))
                return false;
            if (!q)
                return true;
            const hay = `${r.posNr || ""} ${r.kurztext || ""} ${r.langtext || ""} ${r.einheit || ""} ${r.source || ""}`.toLowerCase();
            return hay.includes(q);
        });
    }, [rows, query, qualityFilter, duplicateIds]);
    const selectedRow = useMemo(() => {
        return rows.find((r) => r.id === selectedId) || rows[0] || null;
    }, [rows, selectedId]);
    const totals = useMemo(() => {
        const netto = rows.reduce((sum, row) => sum + lineTotal(row), 0);
        const brutto = netto * (1 + (mwst || 0) / 100);
        const priced = rows.filter((r) => toNumber(r.preis) > 0).length;
        const critical = rows.filter((r) => rowStatus(r) === "critical").length;
        const warning = rows.filter((r) => rowStatus(r) === "warning").length;
        return {
            netto: round2(netto),
            brutto: round2(brutto),
            priced,
            total: rows.length,
            coverage: rows.length ? Math.round(priced / rows.length * 100) : 0,
            critical,
            warning
        };
    }, [rows, mwst]);
    function refreshRows(preselectId) {
        const next = LV.list();
        setRows(next);
        if (preselectId) {
            setSelectedId(preselectId);
            return;
        }
        if (!next.some((r) => r.id === selectedId)) {
            setSelectedId(next[0]?.id || "");
        }
    }
    function saveRow(row) {
        const next = makeLvRow({
            ...row,
            gesamt: round2(toNumber(row.menge) * toNumber(row.preis))
        });
        LV.upsert(next);
        refreshRows(next.id);
    }
    function patchSelected(patch) {
        if (!selectedRow)
            return;
        saveRow({ ...selectedRow, ...patch });
    }
    function addRow() {
        const row = makeLvRow({
            posNr: "",
            kurztext: "",
            langtext: "",
            bemerkung: "",
            einheit: "m",
            menge: 1,
            preis: 0,
            waehrung: "EUR",
            source: "manual"
        });
        LV.upsert(row);
        refreshRows(row.id);
        setViewMode("editor");
        setInfo("Neue LV-Position erstellt.");
    }
    function duplicateSelected() {
        if (!selectedRow)
            return;
        const copy = makeLvRow({
            ...selectedRow,
            id: safeUuid(),
            posNr: `${selectedRow.posNr || ""}.Kopie`,
            source: "manual"
        });
        LV.upsert(copy);
        refreshRows(copy.id);
        setInfo("Position dupliziert.");
    }
    function deleteRow(id) {
        if (!window.confirm("Diese LV-Position wirklich löschen?"))
            return;
        LV.remove(id);
        refreshRows();
        setInfo("LV-Position gelöscht.");
    }
    function clearAll() {
        if (!window.confirm("Alle LV-Zeilen wirklich löschen?"))
            return;
        LV.clear();
        setRows([]);
        setSelectedId("");
        setInfo("LV lokal geleert.");
    }
    function importCSV(text) {
        try {
            LV.importCSV(text);
            refreshRows();
            setInfo("CSV lokal importiert.");
        }
        catch (e) {
            setInfo(`Fehler beim CSV-Import: ${e?.message || e}`);
        }
    }
    function exportCSV() {
        const csv = LV.exportCSV(rows);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = projectCode ? `${projectCode}-lv.csv` : "lv.csv";
        a.click();
        URL.revokeObjectURL(url);
        setInfo("CSV exportiert.");
    }
    function pasteRows() {
        const example = `PosNr;Kurztext;Langtext;Einheit;Menge;Preis
01.0001;"Aushub Baugrube";"Aushub Baugrube gemäß Leistungsbeschreibung";m³;120;35,50`;
        const text = window.prompt("Zeilen einfügen, CSV mit Semikolon:", example);
        if (!text)
            return;
        importCSV(text);
    }
    function exportXLSX() {
        const xmlHeader = `<?xml version="1.0"?>` +
            `<?mso-application progid="Excel.Sheet"?>` +
            `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ` +
            `xmlns:o="urn:schemas-microsoft-com:office:office" ` +
            `xmlns:x="urn:schemas-microsoft-com:office:excel" ` +
            `xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">`;
        const sheetOpen = `<Worksheet ss:Name="LV"><Table>`;
        const headRow = `<Row>` +
            [
                "PosNr",
                "Kurztext",
                "Langtext",
                "Bemerkung",
                "Einheit",
                "Menge",
                "EP netto",
                "Gesamt",
                "Währung",
                "Quelle"
            ].
                map((h) => `<Cell><Data ss:Type="String">${esc(h)}</Data></Cell>`).
                join("") +
            `</Row>`;
        const body = rows.
            map((r) => {
            const total = lineTotal(r);
            return (`<Row>` +
                `<Cell><Data ss:Type="String">${esc(r.posNr || "")}</Data></Cell>` +
                `<Cell><Data ss:Type="String">${esc(r.kurztext || "")}</Data></Cell>` +
                `<Cell><Data ss:Type="String">${esc(r.langtext || "")}</Data></Cell>` +
                `<Cell><Data ss:Type="String">${esc(r.bemerkung || "")}</Data></Cell>` +
                `<Cell><Data ss:Type="String">${esc(r.einheit || "")}</Data></Cell>` +
                `<Cell><Data ss:Type="Number">${toNumber(r.menge)}</Data></Cell>` +
                `<Cell><Data ss:Type="Number">${toNumber(r.preis)}</Data></Cell>` +
                `<Cell><Data ss:Type="Number">${toNumber(total)}</Data></Cell>` +
                `<Cell><Data ss:Type="String">${esc(r.waehrung || "EUR")}</Data></Cell>` +
                `<Cell><Data ss:Type="String">${esc(r.source || "manual")}</Data></Cell>` +
                `</Row>`);
        }).
            join("");
        const xml = xmlHeader +
            sheetOpen +
            headRow +
            body +
            `</Table></Worksheet></Workbook>`;
        const blob = new Blob([xml], { type: "application/vnd.ms-excel" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = projectCode ? `${projectCode}-lv.xlsx` : "lv.xlsx";
        a.click();
        URL.revokeObjectURL(url);
        setInfo("XLSX exportiert.");
    }
    function autoPosNr() {
        const next = LV.renumber("01", 1, 4);
        setRows(next);
        setSelectedId(next[0]?.id || "");
        setInfo("Positionen automatisch nummeriert.");
    }
    async function syncRowsToServer(customRows) {
        const code = String(projectCode || "").trim().toUpperCase();
        if (!code) {
            setInfo("Kein Projektcode vorhanden. Server-Speicherung nicht möglich.");
            return false;
        }
        const sourceRows = customRows ?? LV.list();
        const payloadItems = sourceRows.
            filter((r) => String(r.posNr ?? "").trim() || String(r.kurztext ?? "").trim()).
            map((r) => ({
            pos: String(r.posNr ?? "").trim(),
            parentPos: String(r.parentPosNr ?? "").trim(),
            text: String(r.kurztext ?? "").trim(),
            langtext: String(r.langtext ?? "").trim(),
            bemerkung: String(r.bemerkung ?? "").trim(),
            unit: String(r.einheit ?? "").trim(),
            quantity: Number(r.menge ?? 0),
            ep: r.preis === null || r.preis === undefined || !Number.isFinite(Number(r.preis)) ?
                null :
                Number(r.preis),
            total: Number.isFinite(lineTotal(r)) ? lineTotal(r) : null,
            currency: r.waehrung || "EUR"
        }));
        if (!payloadItems.length) {
            setInfo("Keine gültigen LV-Zeilen für die Server-Speicherung vorhanden.");
            return false;
        }
        try {
            setSyncBusy(true);
            setInfo("Speichere Projekt-LV am Server …");
            const response = await fetch(apiUrl(`/api/project-lv/${encodeURIComponent(code)}/import`), {
                method: "POST",
                credentials: "include",
                headers: withAuthHeaders({
                    "Content-Type": "application/json"
                }),
                body: JSON.stringify({
                    title: `LV ${code}`,
                    currency: "EUR",
                    items: payloadItems
                })
            });
            const json = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(json?.error || "Server-Speicherung fehlgeschlagen");
            }
            setInfo(`Projekt-LV am Server gespeichert. Zeilen: ${Number(json?.count || payloadItems.length)}.`);
            return true;
        }
        catch (e) {
            setInfo(`Server-Fehler: ${e?.message || e}`);
            return false;
        }
        finally {
            setSyncBusy(false);
        }
    }
    function applyLvFilter(filter) {
        setQualityFilter(filter);
        setViewMode("editor");
        setInfo(`LV-Filter aktiviert: ${filter}`);
    }
    function runWithProgress(title, work) {
        setKiWorking(true);
        setKiProgress(10);
        setKiLog([`${title} gestartet …`]);
        window.setTimeout(() => {
            setKiProgress(45);
            window.setTimeout(() => {
                const log = work();
                setKiProgress(100);
                setKiLog(log.length ? log : ["Keine sichtbaren Änderungen erkannt."]);
                setInfo(`${title} abgeschlossen.`);
                window.setTimeout(() => {
                    setKiWorking(false);
                    setKiProgress(0);
                }, 900);
            }, 300);
        }, 250);
    }
    function fixMissingFields() {
        runWithProgress("LV-Prüfung", () => {
            const log = [];
            const next = rows.map((row) => {
                let changed = false;
                const patch = {};
                if (!String(row.einheit || "").trim()) {
                    const unit = suggestUnit(row);
                    patch.einheit = unit;
                    log.push(`✓ Pos. ${row.posNr || "—"} – Einheit ergänzt: leer → ${unit}`);
                    changed = true;
                }
                if (!String(row.kurztext || "").trim()) {
                    const kurz = suggestKurztext(row);
                    patch.kurztext = kurz;
                    log.push(`✓ Pos. ${row.posNr || "—"} – Kurztext ergänzt.`);
                    changed = true;
                }
                if (!String(row.langtext || "").trim()) {
                    const lang = suggestLangtext({ ...row, ...patch });
                    patch.langtext = lang;
                    log.push(`✓ Pos. ${row.posNr || "—"} – Langtext ergänzt.`);
                    changed = true;
                }
                if (toNumber(row.menge) <= 0) {
                    log.push(`⚠ Pos. ${row.posNr || "—"} – Menge fehlt / 0. Manuelle Prüfung notwendig.`);
                }
                if (toNumber(row.preis) <= 0) {
                    log.push(`⚠ Pos. ${row.posNr || "—"} – EP fehlt. Preisprüfung in Kalkulation notwendig.`);
                }
                if (!changed)
                    return row;
                return makeLvRow({
                    ...row,
                    ...patch,
                    gesamt: round2(toNumber(row.menge) * toNumber(row.preis))
                });
            });
            LV.setAll(next);
            setRows(next);
            return log;
        });
    }
    function deleteDuplicateLvRows() {
        runWithProgress("Dublettenbereinigung", () => {
            const groups = getLvDuplicateGroups(rows);
            if (!groups.length)
                return ["Keine doppelten LV-Positionen gefunden."];
            const removeIds = new Set();
            const log = [];
            for (const group of groups) {
                const sorted = [...group].sort((a, b) => lvRowScore(b) - lvRowScore(a));
                const keep = sorted[0];
                for (const row of sorted.slice(1)) {
                    removeIds.add(row.id);
                    log.push(`✓ Dublette gelöscht: Pos. ${row.posNr || "—"} – behalten wurde Pos. ${keep.posNr || "—"}`);
                }
            }
            const next = rows.filter((row) => !removeIds.has(row.id));
            LV.setAll(next);
            setRows(next);
            setSelectedId(next[0]?.id || "");
            return log;
        });
    }
    useEffect(() => {
        function handleLvCommand(event) {
            const detail = event.detail;
            if (!detail)
                return;
            if (detail.filter) {
                applyLvFilter(detail.filter);
            }
            if (detail.action === "fixMissing") {
                fixMissingFields();
            }
            if (detail.action === "deleteDuplicates") {
                deleteDuplicateLvRows();
            }
            if (detail.action === "syncServer") {
                void syncRowsToServer(rows);
            }
            if (detail.action === "goKi") {
                navigate("/kalkulation/mit-ki");
            }
            if (detail.action === "goGaeb") {
                navigate(`/kalkulation/gaeb${projectCode ? `?projectCode=${encodeURIComponent(projectCode)}` : ""}`);
            }
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
        window.addEventListener("rlc:lv-command", handleLvCommand);
        return () => {
            window.removeEventListener("rlc:lv-command", handleLvCommand);
        };
    }, [rows, projectCode, navigate]);
    const selectedStatus = selectedRow ? rowStatus(selectedRow) : "critical";
    return (_jsxs("div", { className: rlcClass(null, page), children: [_jsx("input", { ref: fileRef, type: "file", accept: ".csv,text/csv", onChange: (e) => {
                    const file = e.target.files?.[0];
                    if (!file)
                        return;
                    const reader = new FileReader();
                    reader.onload = () => importCSV(String(reader.result || ""));
                    reader.readAsText(file, "utf-8");
                    e.currentTarget.value = "";
                }, className: "rlc-migrated-pages-kalkulation-lv-import-tsx-913" }), _jsxs("section", { className: rlcClass("rlc-page-hero", heroCard), children: [_jsxs("div", { children: [_jsx("div", { className: rlcClass(null, eyebrow), children: "RLC Leistungsverzeichnis" }), _jsx("h1", { className: rlcClass(null, title), children: "LV / Positionen" }), _jsx("p", { className: rlcClass(null, subtitle), children: "Kompakte LV-Verwaltung: importieren, pr\u00FCfen, bearbeiten und direkt in Kalkulation, GAEB oder Angebot weitergeben." })] }), _jsxs("div", { className: rlcClass(null, heroActions), children: [_jsx("button", { type: "button", className: rlcClass(null, btnHeroPrimary), onClick: addRow, children: "+ Position" }), _jsx("button", { type: "button", className: rlcClass(null, btnHeroSecondary), onClick: () => fileRef.current?.click(), children: "CSV importieren" }), _jsx("button", { type: "button", className: rlcClass(null, btnHeroSecondary), onClick: () => void syncRowsToServer(rows), disabled: syncBusy || rows.length === 0, children: syncBusy ? "Speichert …" : "Server speichern" }), _jsx("button", { type: "button", className: rlcClass(null, btnHeroSecondary), onClick: () => navigate(`/kalkulation/gaeb${projectCode ? `?projectCode=${encodeURIComponent(projectCode)}` : ""}`), children: "GAEB" }), _jsx("button", { type: "button", className: rlcClass(null, btnHeroSecondary), onClick: () => navigate("/kalkulation/mit-ki"), children: "Kalkulation mit KI" })] }), _jsxs("div", { className: rlcClass(null, heroMeta), children: ["Projekt: ", _jsx("b", { children: projectCode || "—" }), projectName ? _jsxs("span", { children: [" \u00B7 ", _jsx("b", { children: projectName })] }) : null, info ? _jsxs("span", { children: [" \u00B7 ", info] }) : null] })] }), _jsxs("section", { className: rlcClass(null, grid4), children: [_jsx(KpiCard, { label: "Netto", value: fmtCurrency(totals.netto) }), _jsx(KpiCard, { label: "Brutto", value: fmtCurrency(totals.brutto) }), _jsx(KpiCard, { label: "Positionen", value: String(totals.total), sub: `${totals.coverage}% mit EP` }), _jsx(KpiCard, { label: "Pr\u00FCfung", value: String(totals.critical + totals.warning), sub: `${totals.critical} fehlt · ${totals.warning} prüfen` })] }), _jsxs("section", { className: rlcClass(null, compactToolbar), children: [_jsxs("div", { className: rlcClass(null, toolbarLeft), children: [_jsx("input", { value: query, onChange: (e) => setQuery(e.target.value), className: rlcClass(null, searchInput), placeholder: "LV durchsuchen: PosNr, Kurztext, Langtext, ME\u2026" }), _jsxs("div", { className: rlcClass(null, mwstBox), children: [_jsx("span", { children: "MwSt" }), _jsx("input", { type: "number", value: mwst, onChange: (e) => setMwst(Number(e.target.value || 0)), className: rlcClass(null, mwstInput) }), _jsx("span", { children: "%" })] })] }), _jsxs("div", { className: rlcClass(null, toolbarButtons), children: [_jsx("button", { type: "button", className: rlcClass(null, buttonBase), onClick: pasteRows, children: "Einf\u00FCgen" }), _jsx("button", { type: "button", className: rlcClass(null, buttonBase), onClick: exportCSV, children: "CSV" }), _jsx("button", { type: "button", className: rlcClass(null, buttonBase), onClick: exportXLSX, children: "XLSX" }), _jsx("button", { type: "button", className: rlcClass(null, buttonBase), onClick: autoPosNr, children: "Auto-Nr." }), _jsx("button", { type: "button", className: rlcClass(null, viewMode === "editor" ? buttonPrimary : buttonBase), onClick: () => setViewMode("editor"), children: "Editor" }), _jsx("button", { type: "button", className: rlcClass(null, viewMode === "liste" ? buttonPrimary : buttonBase), onClick: () => setViewMode("liste"), children: "Liste" }), _jsx("button", { type: "button", className: rlcClass(null, buttonDanger), onClick: clearAll, children: "Leeren" })] })] }), _jsxs("section", { className: rlcClass(null, qualityPanel), children: [_jsxs("div", { className: rlcClass(null, qualityTop), children: [_jsxs("div", { children: [_jsx("b", { children: "LV-KI Pr\u00FCfung" }), _jsx("div", { className: rlcClass(null, qualitySub), children: "Filter, Datenpr\u00FCfung, automatische Erg\u00E4nzung und \u00C4nderungsprotokoll." })] }), _jsxs("div", { className: rlcClass(null, qualityActions), children: [_jsxs("button", { type: "button", className: rlcClass(null, qualityFilter === "alle" ? chipActive : chip), onClick: () => applyLvFilter("alle"), children: ["Alle ", qualityStats.total] }), _jsxs("button", { type: "button", className: rlcClass(null, qualityFilter === "kritisch" ? chipActive : chip), onClick: () => applyLvFilter("kritisch"), children: ["Kritisch ", qualityStats.critical] }), _jsxs("button", { type: "button", className: rlcClass(null, qualityFilter === "warning" ? chipActive : chip), onClick: () => applyLvFilter("warning"), children: ["Pr\u00FCfen ", qualityStats.warning] }), _jsxs("button", { type: "button", className: rlcClass(null, qualityFilter === "epFehlt" ? chipActive : chip), onClick: () => applyLvFilter("epFehlt"), children: ["EP fehlt ", qualityStats.epFehlt] }), _jsxs("button", { type: "button", className: rlcClass(null, qualityFilter === "einheitFehlt" ? chipActive : chip), onClick: () => applyLvFilter("einheitFehlt"), children: ["Einheit fehlt ", qualityStats.einheitFehlt] }), _jsxs("button", { type: "button", className: rlcClass(null, qualityFilter === "mengeFehlt" ? chipActive : chip), onClick: () => applyLvFilter("mengeFehlt"), children: ["Menge fehlt ", qualityStats.mengeFehlt] }), _jsxs("button", { type: "button", className: rlcClass(null, qualityFilter === "langtextFehlt" ? chipActive : chip), onClick: () => applyLvFilter("langtextFehlt"), children: ["Langtext fehlt ", qualityStats.langtextFehlt] }), _jsxs("button", { type: "button", className: rlcClass(null, qualityFilter === "doppelte" ? chipActive : chip), onClick: () => applyLvFilter("doppelte"), children: ["Doppelte ", qualityStats.doppelte] })] })] }), _jsxs("div", { className: rlcClass(null, qualityActions), children: [_jsx("button", { type: "button", className: rlcClass(null, buttonPrimary), onClick: fixMissingFields, children: "Fehlende Daten automatisch erg\u00E4nzen" }), _jsx("button", { type: "button", className: rlcClass(null, buttonBase), onClick: deleteDuplicateLvRows, children: "Doppelte bereinigen" }), _jsx("button", { type: "button", className: rlcClass(null, buttonBase), onClick: () => void syncRowsToServer(rows), children: "Server speichern" })] }), kiWorking || kiLog.length ?
                        _jsxs("div", { className: rlcClass(null, kiProtocolBox), children: [_jsxs("div", { className: rlcClass(null, protocolHead), children: [_jsx("b", { children: "KI-Protokoll" }), _jsx("span", { children: kiWorking ? `${kiProgress}%` : "abgeschlossen" })] }), _jsx("div", { className: rlcClass(null, progressTrack), children: _jsx("div", { className: rlcClass(null, { ...progressFill, width: `${kiWorking ? kiProgress : 100}%` }) }) }), _jsx("div", { className: rlcClass(null, protocolList), children: kiLog.slice(0, 8).map((line, idx) => _jsx("div", { className: rlcClass(null, line.startsWith("⚠") ? protocolWarn : protocolOk), children: line }, `${line}-${idx}`)) })] }) :
                        null] }), info ? _jsx("div", { className: rlcClass(null, statusBox(info)), children: info }) : null, viewMode === "editor" ?
                _jsxs("section", { className: rlcClass(null, mainLayout), children: [_jsxs("aside", { className: rlcClass(null, listCard), children: [_jsx("div", { className: rlcClass(null, listHeader), children: _jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "LV-Positionen" }), _jsxs("div", { className: rlcClass(null, sectionText), children: [filteredRows.length.toLocaleString("de-DE"), " von ", rows.length.toLocaleString("de-DE")] })] }) }), _jsxs("div", { className: rlcClass(null, positionList), children: [filteredRows.map((r) => {
                                            const active = r.id === selectedId;
                                            const status = rowStatus(r);
                                            return (_jsxs("button", { ref: active ? selectedItemRef : undefined, type: "button", className: rlcClass(null, {
                                                    ...positionItem,
                                                    ...(active ? positionItemActive : {})
                                                }), onClick: () => setSelectedId(r.id), children: [_jsxs("div", { className: rlcClass(null, positionTop), children: [_jsx("b", { children: r.posNr || "—" }), _jsx("span", { className: rlcClass(null, statusBadge(status)), children: statusLabel(status) })] }), _jsx("div", { className: rlcClass(null, positionText), children: r.kurztext || "Ohne Kurztext" }), _jsxs("div", { className: rlcClass(null, positionMeta), children: [fmtNumber(r.menge), " ", r.einheit || "ME", " \u00B7 EP ", fmtCurrency(r.preis || 0), " \u00B7 GP ", fmtCurrency(lineTotal(r))] })] }, r.id));
                                        }), !filteredRows.length ?
                                            _jsx("div", { className: rlcClass(null, emptyState), children: "Keine LV-Position vorhanden." }) :
                                            null] })] }), _jsx("main", { className: rlcClass(null, editorCard), children: selectedRow ?
                                _jsxs(_Fragment, { children: [_jsxs("div", { className: rlcClass(null, editorHead), children: [_jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "Position bearbeiten" }), _jsxs("div", { className: rlcClass(null, sectionText), children: [selectedRow.posNr || "Neue Position", " \u00B7 ", selectedRow.kurztext || "Ohne Kurztext"] })] }), _jsxs("div", { className: rlcClass(null, editorActions), children: [_jsx("span", { className: rlcClass(null, statusBadge(selectedStatus)), children: statusLabel(selectedStatus) }), _jsx("button", { type: "button", className: rlcClass(null, buttonBase), onClick: duplicateSelected, children: "Duplizieren" }), _jsx("button", { type: "button", className: rlcClass(null, buttonDanger), onClick: () => deleteRow(selectedRow.id), children: "L\u00F6schen" })] })] }), _jsxs("div", { className: rlcClass(null, formGrid), children: [_jsx(Field, { label: "Positionsnummer", children: _jsx("input", { value: selectedRow.posNr || "", onChange: (e) => patchSelected({ posNr: e.target.value }), className: rlcClass(null, inputStyle), placeholder: "z.B. 01.0010" }) }), _jsx(Field, { label: "Einheit", children: _jsx("input", { value: selectedRow.einheit || "", onChange: (e) => patchSelected({ einheit: e.target.value }), className: rlcClass(null, inputStyle), placeholder: "m / m\u00B2 / m\u00B3 / St" }) }), _jsx(Field, { label: "Menge", children: _jsx("input", { type: "number", value: selectedRow.menge ?? 0, onChange: (e) => patchSelected({
                                                            menge: toNumber(e.target.value),
                                                            gesamt: round2(toNumber(e.target.value) * toNumber(selectedRow.preis))
                                                        }), className: rlcClass(null, inputStyle) }) }), _jsx(Field, { label: "EP netto", children: _jsx("input", { type: "number", value: selectedRow.preis ?? 0, onChange: (e) => patchSelected({
                                                            preis: toNumber(e.target.value),
                                                            gesamt: round2(toNumber(selectedRow.menge) * toNumber(e.target.value))
                                                        }), className: rlcClass(null, inputStyle) }) })] }), _jsxs("div", { className: rlcClass(null, formGrid2), children: [_jsx(Field, { label: "Kurztext", children: _jsx("input", { value: selectedRow.kurztext || "", onChange: (e) => patchSelected({ kurztext: e.target.value }), className: rlcClass(null, inputStyle), placeholder: "Kurze Leistungsbeschreibung" }) }), _jsxs("div", { className: rlcClass(null, sumBox), children: [_jsx("div", { className: rlcClass(null, sumLabel), children: "Gesamt netto" }), _jsx("div", { className: rlcClass(null, sumValue), children: fmtCurrency(lineTotal(selectedRow)) })] })] }), _jsx("div", { className: "rlc-migrated-pages-kalkulation-lv-import-tsx-914", children: _jsx(Field, { label: "Langtext", children: _jsx("textarea", { value: selectedRow.langtext || "", onChange: (e) => patchSelected({ langtext: e.target.value }), className: rlcClass(null, largeTextArea), placeholder: "Ausf\u00FChrliche Leistungsbeschreibung, Nebenleistungen, Abrechnung, technische Anforderungen\u2026" }) }) }), _jsx("div", { className: "rlc-migrated-pages-kalkulation-lv-import-tsx-915", children: _jsx(Field, { label: "Bemerkung / interne Notiz", children: _jsx("textarea", { value: selectedRow.bemerkung || "", onChange: (e) => patchSelected({ bemerkung: e.target.value }), className: rlcClass(null, noteTextArea), placeholder: "Optionale Bemerkung" }) }) }), _jsxs("div", { className: rlcClass(null, bottomActions), children: [_jsx("button", { type: "button", className: rlcClass(null, buttonPrimary), onClick: () => navigate("/kalkulation/rezepte"), children: "Urkalkulation / Rezept erstellen" }), _jsx("button", { type: "button", className: rlcClass(null, buttonBase), onClick: () => navigate("/kalkulation/mit-ki"), children: "Zur KI-Kalkulation" }), _jsx("button", { type: "button", className: rlcClass(null, buttonBase), onClick: () => navigate("/kalkulation/angebot"), children: "Angebot" })] })] }) :
                                _jsx("div", { className: rlcClass(null, emptyState), children: "Keine Position gew\u00E4hlt." }) })] }) :
                _jsxs("section", { className: rlcClass(null, card), children: [_jsx("div", { className: rlcClass(null, sectionHead), children: _jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "LV-Kompaktliste" }), _jsx("div", { className: rlcClass(null, sectionText), children: "Schnelle \u00DCbersicht. F\u00FCr Langtext und Details bitte Editor verwenden." })] }) }), _jsx("div", { className: rlcClass(null, tableWrap), children: _jsxs("table", { className: rlcClass(null, table), children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, th), children: "Status" }), _jsx("th", { className: rlcClass(null, th), children: "Position" }), _jsx("th", { className: rlcClass(null, th), children: "Kurztext" }), _jsx("th", { className: rlcClass(null, th), children: "ME" }), _jsx("th", { className: rlcClass(null, thRight), children: "Menge" }), _jsx("th", { className: rlcClass(null, thRight), children: "EP" }), _jsx("th", { className: rlcClass(null, thRight), children: "GP" }), _jsx("th", { className: rlcClass(null, th), children: "Quelle" }), _jsx("th", { className: rlcClass(null, th), children: "Aktion" })] }) }), _jsxs("tbody", { children: [filteredRows.map((r) => {
                                                const status = rowStatus(r);
                                                return (_jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, td), children: _jsx("span", { className: rlcClass(null, statusBadge(status)), children: statusLabel(status) }) }), _jsx("td", { className: rlcClass(null, td), children: _jsx("b", { children: r.posNr || "—" }) }), _jsx("td", { className: rlcClass(null, td), children: r.kurztext || "—" }), _jsx("td", { className: rlcClass(null, td), children: r.einheit || "—" }), _jsx("td", { className: rlcClass(null, tdRight), children: fmtNumber(r.menge) }), _jsx("td", { className: rlcClass(null, tdRight), children: fmtCurrency(r.preis || 0) }), _jsx("td", { className: rlcClass(null, { ...tdRight, fontWeight: 700 }), children: fmtCurrency(lineTotal(r)) }), _jsx("td", { className: rlcClass(null, td), children: _jsx("span", { className: rlcClass(null, badgeNeutral), children: r.source || "manual" }) }), _jsx("td", { className: rlcClass(null, td), children: _jsx("button", { type: "button", className: rlcClass(null, buttonBase), onClick: () => {
                                                                    setSelectedId(r.id);
                                                                    setViewMode("editor");
                                                                }, children: "\u00D6ffnen" }) })] }, r.id));
                                            }), !filteredRows.length ?
                                                _jsx("tr", { children: _jsx("td", { colSpan: 9, className: "rlc-migrated-pages-kalkulation-lv-import-tsx-916", children: "Keine LV-Positionen vorhanden." }) }) :
                                                null] })] }) })] })] }));
}
/* ===================== STYLES ===================== */
const qualityPanel = {
    background: "#FFFFFF",
    border: "1px solid #D7E3F5",
    borderRadius: 16,
    padding: 14,
    display: "grid",
    gap: 12,
    boxShadow: "0 1px 2px rgba(15,23,42,0.04)"
};
const qualityTop = {
    display: "grid",
    gap: 10
};
const qualitySub = {
    marginTop: 3,
    color: "#64748B",
    fontSize: 13,
    fontWeight: 600
};
const qualityActions = {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center"
};
const chip = {
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#334155",
    borderRadius: 999,
    padding: "7px 11px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer"
};
const chipActive = {
    ...chip,
    border: "1px solid #146EF5",
    background: "#EAF2FF",
    color: "#0B5BD3"
};
const kiProtocolBox = {
    border: "1px solid #BED6FF",
    background: "#EAF2FF",
    borderRadius: 14,
    padding: 12,
    display: "grid",
    gap: 9
};
const protocolHead = {
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
    color: "#0F172A",
    fontSize: 13
};
const progressTrack = {
    height: 9,
    borderRadius: 999,
    background: "#DBEAFE",
    overflow: "hidden"
};
const progressFill = {
    height: "100%",
    borderRadius: 999,
    background: "linear-gradient(90deg,#146EF5,#22C55E)",
    transition: "width 220ms ease"
};
const protocolList = {
    display: "grid",
    gap: 6
};
const protocolOk = {
    border: "1px solid #BBF7D0",
    background: "#F0FDF4",
    color: "#166534",
    borderRadius: 10,
    padding: "7px 9px",
    fontSize: 12,
    fontWeight: 700
};
const protocolWarn = {
    ...protocolOk,
    border: "1px solid #FDE68A",
    background: "#FFFBEB",
    color: "#92400E"
};
const page = {
    display: "grid",
    gap: 14,
    padding: 16
};
const heroCard = {
    background: "linear-gradient(135deg, #0B5BD3 0%, #0B5BD3 48%, #146EF5 100%)",
    color: "#FFFFFF",
    borderRadius: 18,
    padding: 20,
    display: "grid",
    gap: 12,
    boxShadow: "0 16px 40px rgba(15,23,42,0.18)"
};
const eyebrow = {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    opacity: 0.82,
    fontWeight: 700
};
const title = {
    margin: "4px 0",
    fontSize: 28,
    fontWeight: 700,
    lineHeight: 1.1
};
const subtitle = {
    margin: 0,
    maxWidth: 940,
    opacity: 0.9,
    lineHeight: 1.5
};
const heroActions = {
    display: "flex",
    gap: 10,
    flexWrap: "wrap"
};
const heroMeta = {
    fontSize: 13,
    opacity: 0.92
};
const grid4 = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
    gap: 12
};
const kpiCard = {
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    borderRadius: 16,
    padding: 14,
    boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
    minWidth: 0
};
const kpiLabel = {
    fontSize: 12,
    color: "#64748B",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em"
};
const kpiValue = {
    marginTop: 6,
    fontSize: 21,
    color: "#0F172A",
    fontWeight: 700,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
};
const kpiSub = {
    marginTop: 3,
    fontSize: 12,
    color: "#64748B"
};
const compactToolbar = {
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    borderRadius: 16,
    padding: 12,
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "center",
    boxShadow: "0 1px 2px rgba(15,23,42,0.04)"
};
const toolbarLeft = {
    display: "flex",
    gap: 10,
    alignItems: "center",
    flex: "1 1 420px",
    minWidth: 280
};
const toolbarButtons = {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center"
};
const searchInput = {
    width: "100%",
    fontSize: 14,
    borderRadius: 10,
    border: "1px solid #D1D5DB",
    padding: "10px 12px",
    background: "#FFFFFF",
    color: "#111827",
    boxSizing: "border-box"
};
const mwstBox = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    border: "1px solid #E5E7EB",
    background: "#F8FAFC",
    borderRadius: 10,
    padding: "7px 9px",
    color: "#475569",
    fontSize: 13,
    fontWeight: 700
};
const mwstInput = {
    width: 58,
    border: "1px solid #D1D5DB",
    borderRadius: 8,
    padding: "6px 7px",
    fontSize: 13,
    textAlign: "right"
};
const statusBox = (info) => {
    const isError = info.startsWith("Fehler") ||
        info.startsWith("Server-Fehler") ||
        info.includes("fehlgeschlagen");
    const isSuccess = info.includes("gespeichert") ||
        info.includes("importiert") ||
        info.includes("exportiert") ||
        info.includes("erstellt");
    return {
        padding: "11px 13px",
        borderRadius: 12,
        border: `1px solid ${isError ? "#FECACA" : isSuccess ? "#BBF7D0" : "#D1D5DB"}`,
        background: isError ? "#FEF2F2" : isSuccess ? "#F0FDF4" : "#F8FAFC",
        color: isError ? "#B91C1C" : isSuccess ? "#15803D" : "#475569",
        fontSize: 13,
        fontWeight: 600
    };
};
const mainLayout = {
    display: "grid",
    gridTemplateColumns: "390px minmax(0,1fr)",
    gap: 14,
    alignItems: "start"
};
const card = {
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 1px 2px rgba(15,23,42,0.04)"
};
const listCard = {
    ...card,
    position: "sticky",
    top: 12,
    maxHeight: "calc(100vh - 24px)",
    overflow: "hidden",
    display: "grid",
    gridTemplateRows: "auto minmax(0,1fr)"
};
const listHeader = {
    marginBottom: 12
};
const positionList = {
    display: "grid",
    gridAutoRows: "max-content",
    alignContent: "start",
    gap: 8,
    overflow: "auto",
    paddingRight: 4
};
const positionItem = {
    display: "grid",
    gap: 6,
    border: "1px solid #E5E7EB",
    background: "#FFFFFF",
    borderRadius: 12,
    padding: 10,
    minHeight: 92,
    height: "auto",
    maxHeight: "none",
    overflow: "visible",
    alignSelf: "stretch",
    cursor: "pointer",
    textAlign: "left",
    whiteSpace: "normal",
    color: "#0F172A"
};
const positionItemActive = {
    borderColor: "#146EF5",
    background: "#EAF2FF"
};
const positionTop = {
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
    alignItems: "center"
};
const positionText = {
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
    overflow: "hidden",
    minHeight: 35,
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1.35,
    color: "#0F172A"
};
const positionMeta = {
    fontSize: 12,
    color: "#64748B",
    lineHeight: 1.4
};
const editorCard = {
    ...card,
    minWidth: 0
};
const editorHead = {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    flexWrap: "wrap",
    marginBottom: 14
};
const editorActions = {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center"
};
const sectionTitle = {
    margin: 0,
    fontSize: 17,
    color: "#0F172A",
    fontWeight: 700
};
const sectionText = {
    marginTop: 4,
    fontSize: 13,
    color: "#64748B",
    lineHeight: 1.45
};
const labelStyle = {
    fontSize: 12,
    color: "#64748B",
    fontWeight: 700
};
const formGrid = {
    display: "grid",
    gridTemplateColumns: "1.1fr 0.7fr 0.7fr 0.7fr",
    gap: 12
};
const formGrid2 = {
    display: "grid",
    gridTemplateColumns: "minmax(0,1fr) 220px",
    gap: 12,
    marginTop: 12,
    alignItems: "end"
};
const inputStyle = {
    width: "100%",
    fontSize: 14,
    borderRadius: 10,
    border: "1px solid #D1D5DB",
    padding: "10px 12px",
    background: "#FFFFFF",
    color: "#111827",
    boxSizing: "border-box"
};
const largeTextArea = {
    ...inputStyle,
    minHeight: 180,
    resize: "vertical",
    fontFamily: "inherit",
    lineHeight: 1.5
};
const noteTextArea = {
    ...inputStyle,
    minHeight: 78,
    resize: "vertical",
    fontFamily: "inherit",
    lineHeight: 1.45
};
const sumBox = {
    border: "1px solid #BED6FF",
    background: "#EAF2FF",
    borderRadius: 12,
    padding: "10px 12px"
};
const sumLabel = {
    fontSize: 12,
    color: "#0B5BD3",
    fontWeight: 700,
    textTransform: "uppercase"
};
const sumValue = {
    marginTop: 5,
    fontSize: 20,
    color: "#0F172A",
    fontWeight: 700
};
const bottomActions = {
    marginTop: 16,
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end"
};
const sectionHead = {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    flexWrap: "wrap",
    marginBottom: 12
};
const tableWrap = {
    border: "1px solid #E5E7EB",
    borderRadius: 12,
    overflow: "auto",
    background: "#FFFFFF"
};
const table = {
    width: "100%",
    minWidth: 1120,
    borderCollapse: "collapse"
};
const th = {
    textAlign: "left",
    padding: "10px 10px",
    borderBottom: "1px solid #E5E7EB",
    background: "#F8FAFC",
    fontWeight: 700,
    whiteSpace: "nowrap",
    fontSize: 12,
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: "0.02em"
};
const thRight = {
    ...th,
    textAlign: "right"
};
const td = {
    padding: "9px 10px",
    borderBottom: "1px solid #F1F5F9",
    verticalAlign: "middle",
    fontSize: 13,
    color: "#0F172A"
};
const tdRight = {
    ...td,
    textAlign: "right",
    whiteSpace: "nowrap"
};
const buttonBase = {
    fontSize: 13,
    borderRadius: 10,
    padding: "9px 12px",
    border: "1px solid #D1D5DB",
    background: "#FFFFFF",
    color: "#0F172A",
    cursor: "pointer",
    fontWeight: 700,
    whiteSpace: "nowrap"
};
const buttonPrimary = {
    ...buttonBase,
    background: "#146EF5",
    border: "1px solid #0B5BD3",
    color: "#FFFFFF"
};
const buttonDanger = {
    ...buttonBase,
    background: "#FEF2F2",
    border: "1px solid #FECACA",
    color: "#B91C1C"
};
const btnHeroPrimary = {
    ...buttonPrimary,
    padding: "10px 15px",
    boxShadow: "0 10px 20px rgba(37,99,235,0.22)"
};
const btnHeroSecondary = {
    ...buttonBase,
    padding: "10px 15px",
    background: "#FFFFFF",
    color: "#0F172A"
};
const badgeNeutral = {
    display: "inline-flex",
    alignItems: "center",
    border: "1px solid #CBD5E1",
    background: "#F8FAFC",
    color: "#475569",
    borderRadius: 999,
    padding: "5px 9px",
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: "nowrap"
};
function statusBadge(status) {
    if (status === "ok") {
        return {
            ...badgeNeutral,
            border: "1px solid #BBF7D0",
            background: "#F0FDF4",
            color: "#15803D"
        };
    }
    if (status === "warning") {
        return {
            ...badgeNeutral,
            border: "1px solid #FDE68A",
            background: "#FFFBEB",
            color: "#B45309"
        };
    }
    return {
        ...badgeNeutral,
        border: "1px solid #FECACA",
        background: "#FEF2F2",
        color: "#B91C1C"
    };
}
const emptyState = {
    border: "1px dashed #CBD5E1",
    background: "#F8FAFC",
    borderRadius: 12,
    padding: 14,
    color: "#64748B",
    fontSize: 13
};
