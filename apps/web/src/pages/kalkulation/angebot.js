import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/kalkulation/angebot.tsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import PageHeader from "../../components/PageHeader";
import { API_BASE } from "../../lib/apiBase";
import { useProject } from "../../store/useProject";
import { LV } from "./store.lv";
import { openPdfBlobPreview, reservePdfPreview } from "../../lib/pdf/companyPdfHeader";
const MWST_KEY = "rlc_lv_mwst_v1";
const PDFOPT_KEY = "rlc_offer_pdf_options_v4";
const NACHTRAG_EXT_STORE_KEY = "rlc_changes_ext_v2";
const ANGEBOT_NACHTRAG_ONLY_KEY = "rlc_angebot_nachtrag_only_v1";
function apiUrl(path) {
    const p = path.startsWith("/") ? path : `/${path}`;
    return API_BASE ? `${API_BASE}${p}` : p;
}
function localBackupKey(projectKey) {
    return `rlc_angebot_snapshot_v4:${projectKey || "NO_PROJECT"}`;
}
function todayIso() {
    return new Date().toISOString().slice(0, 10);
}
function n(value, fallback = 0) {
    const raw = String(value ?? "").trim();
    if (!raw)
        return fallback;
    const normalized = raw.includes(",") ?
        raw.replace(/\./g, "").replace(",", ".") :
        raw.replace(/\s/g, "");
    const x = typeof value === "number" ? value : Number(normalized);
    return Number.isFinite(x) ? x : fallback;
}
function round2(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}
function money(value) {
    return new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR"
    }).format(n(value));
}
function num(value) {
    return new Intl.NumberFormat("de-DE", {
        maximumFractionDigits: 3
    }).format(n(value));
}
function csvCell(value) {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
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
function authHeaders(extra) {
    const token = getAuthToken();
    return {
        ...(extra || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
}
function getCurrentProject(projectCtx) {
    const project = projectCtx?.currentProject ??
        projectCtx?.project ??
        projectCtx?.selectedProject ??
        projectCtx?.current ?? (typeof projectCtx?.getCurrentProject === "function" ?
        projectCtx.getCurrentProject() :
        null);
    return project || null;
}
function getProjectKey(project, projectCtx) {
    return String(project?.code ??
        project?.number ??
        project?.projektnummer ??
        projectCtx?.projectCode ??
        project?.id ??
        projectCtx?.projectId ??
        "").
        trim().
        toUpperCase();
}
function getProjectPid(project, projectKey) {
    return String(project?.id || projectKey || "_none_").trim() || "_none_";
}
function getProjectName(project) {
    return String(project?.name ?? project?.projectName ?? project?.projektname ?? "").trim();
}
function getProjectClient(project) {
    return String(project?.client ?? project?.auftraggeber ?? project?.kunde ?? "").trim();
}
function getProjectPlace(project) {
    return String(project?.location ?? project?.place ?? project?.ort ?? project?.city ?? "").trim();
}
function getChapter(posNr) {
    const m = String(posNr || "").match(/^(\d{2})/);
    return m ? m[1] : "—";
}
function rowNet(row) {
    return round2(n(row.menge) * n(row.preis));
}
function normalizeChapterAdjustments(value) {
    if (!value || typeof value !== "object")
        return {};
    const out = {};
    for (const [chapter, raw] of Object.entries(value)) {
        out[String(chapter)] = {
            rabatt: n(raw?.rabatt, 0),
            markup: n(raw?.markup, 0)
        };
    }
    return out;
}
function nachtragNet(row) {
    return round2(n(row.mengeDelta) * n(row.preis));
}
function safeId() {
    try {
        return crypto.randomUUID();
    }
    catch {
        return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
}
function normalizeNachtrag(row) {
    return {
        id: String(row?.id || safeId()),
        posNr: String(row?.posNr || row?.pos || ""),
        kurztext: String(row?.kurztext || row?.title || ""),
        langtext: String(row?.langtext || ""),
        einheit: String(row?.einheit || row?.unit || "m"),
        mengeDelta: n(row?.mengeDelta ?? row?.qty ?? row?.menge),
        preis: n(row?.preis ?? row?.ep ?? row?.finalUnitPrice),
        status: String(row?.status || "Entwurf"),
        begruendung: String(row?.begruendung || row?.note || row?.hint || "")
    };
}
function lvRowToOfferExport(row) {
    return {
        typ: "LV",
        id: row.id,
        posNr: row.posNr,
        text: row.kurztext,
        kurztext: row.kurztext,
        langtext: row.langtext,
        einheit: row.einheit,
        menge: n(row.menge),
        preis: n(row.preis),
        zeilen: rowNet(row),
        waehrung: row.waehrung || "EUR",
        source: row.source || "",
        materialCost: n(row.materialCost),
        laborCost: n(row.laborCost),
        machineCost: n(row.machineCost),
        subcontractorCost: n(row.subcontractorCost),
        disposalCost: n(row.disposalCost),
        transportCost: n(row.transportCost),
        overheadCost: n(row.overheadCost),
        riskCost: n(row.riskCost),
        profitCost: n(row.profitCost),
        baseUnitPrice: n(row.baseUnitPrice),
        suggestedUnitPrice: n(row.suggestedUnitPrice),
        finalUnitPrice: n(row.finalUnitPrice || row.preis),
        confidence: row.confidence ?? "",
        riskLevel: row.riskLevel || "",
        calculationStatus: row.calculationStatus || "",
        gewerk: row.gewerk || "",
        leistungsart: row.leistungsart || "",
        bauverfahren: row.bauverfahren || "",
        warning: row.warning || "",
        aiReason: row.aiReason || "",
        priceBreakdown: Array.isArray(row.priceBreakdown) ?
            row.priceBreakdown :
            []
    };
}
function loadNachtraegeForProject(pid, projectKey) {
    try {
        const db = JSON.parse(localStorage.getItem(NACHTRAG_EXT_STORE_KEY) || "{}");
        const pidRows = Array.isArray(db?.[pid]) ? db[pid] : [];
        const keyRows = Array.isArray(db?.[projectKey]) ? db[projectKey] : [];
        const map = new Map();
        [...pidRows, ...keyRows].map(normalizeNachtrag).forEach((row) => {
            map.set(String(row.id), row);
        });
        return Array.from(map.values());
    }
    catch {
        return [];
    }
}
function loadNachtragOnlyBuffer(projectKey) {
    try {
        const raw = localStorage.getItem(ANGEBOT_NACHTRAG_ONLY_KEY);
        if (!raw)
            return null;
        const parsed = JSON.parse(raw);
        const rows = Array.isArray(parsed?.rows) ?
            parsed.rows.map(normalizeNachtrag) :
            [];
        if (!rows.length)
            return null;
        const bufferProject = String(parsed.projectKey || "").trim().toUpperCase();
        const currentProject = String(projectKey || "").trim().toUpperCase();
        if (bufferProject && currentProject && bufferProject !== currentProject) {
            return null;
        }
        return {
            ...parsed,
            rows,
            mwst: n(parsed.mwst, 19)
        };
    }
    catch {
        return null;
    }
}
function buildDefaultOptions(project) {
    const storedMwst = n(localStorage.getItem(MWST_KEY), 19);
    return {
        city: getProjectPlace(project),
        dateISO: todayIso(),
        payment: "Zahlungsbedingungen: 30 Tage netto. Angebot gültig 30 Tage.",
        mwst: storedMwst,
        showWatermark: false,
        colorHeader: true,
        showTableHeader: true,
        showChapterRows: true,
        includeNachtraege: true,
        nachtragMode: "alle"
    };
}
function loadSavedOptions(project) {
    try {
        const saved = localStorage.getItem(PDFOPT_KEY);
        const base = buildDefaultOptions(project);
        if (!saved)
            return base;
        const parsed = JSON.parse(saved);
        return {
            ...base,
            ...parsed,
            mwst: n(localStorage.getItem(MWST_KEY), n(parsed?.mwst, 19)),
            dateISO: parsed?.dateISO || todayIso(),
            city: parsed?.city ?? base.city,
            includeNachtraege: typeof parsed?.includeNachtraege === "boolean" ?
                parsed.includeNachtraege :
                true,
            nachtragMode: parsed?.nachtragMode === "beauftragt" ? "beauftragt" : "alle"
        };
    }
    catch {
        return buildDefaultOptions(project);
    }
}
function makeSnapshot(projectKey, project, opts, rows, nachtraege, chapterAdjustments, chapterSummaries, totals, mode) {
    return {
        version: "angebot-v4",
        meta: {
            projectKey,
            savedAt: new Date().toISOString(),
            options: opts,
            project,
            mode
        },
        rows,
        nachtraege,
        chapterAdjustments,
        chapterSummaries,
        totals
    };
}
function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
function forceDownloadUrl(url, filename) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}
function forceDownloadText(text, filename, mime) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    forceDownloadUrl(url, filename);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function safeFileName(value) {
    return String(value || "Angebot").
        replace(/[^\w.-]+/g, "_").
        replace(/_+/g, "_");
}
export default function AngebotPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const projectCtx = useProject();
    const project = getCurrentProject(projectCtx);
    const projectKey = getProjectKey(project, projectCtx);
    const projectName = getProjectName(project);
    const projectClient = getProjectClient(project);
    const pid = getProjectPid(project, projectKey);
    const searchMode = new URLSearchParams(location.search).get("mode");
    const [nachtragOnlyBuffer, setNachtragOnlyBuffer] = useState(() => loadNachtragOnlyBuffer(projectKey));
    const isNachtragOnlyMode = searchMode === "nachtrag-only" && !!nachtragOnlyBuffer?.rows?.length;
    const [rows, setRows] = useState(() => LV.list());
    const [chapterAdjustments, setChapterAdjustments] = useState({});
    const [nachtraege, setNachtraege] = useState(() => loadNachtraegeForProject(pid, projectKey));
    const [opts, setOpts] = useState(() => {
        const base = loadSavedOptions(project);
        const buffer = loadNachtragOnlyBuffer(projectKey);
        if (searchMode === "nachtrag-only" && buffer) {
            return {
                ...base,
                mwst: n(buffer.mwst, base.mwst),
                includeNachtraege: true,
                nachtragMode: "alle"
            };
        }
        return base;
    });
    const [serverBusy, setServerBusy] = useState(false);
    const [status, setStatus] = useState("");
    const [kiStatus, setKiStatus] = useState("");
    function refreshAll() {
        setRows(LV.list());
        setNachtraege(loadNachtraegeForProject(pid, projectKey));
        setNachtragOnlyBuffer(loadNachtragOnlyBuffer(projectKey));
    }
    function clearNachtragOnlyMode() {
        localStorage.removeItem(ANGEBOT_NACHTRAG_ONLY_KEY);
        setNachtragOnlyBuffer(null);
        setStatus("Vollständiges Angebot aktiv");
        navigate("/kalkulation/angebot", { replace: true });
    }
    useEffect(() => {
        refreshAll();
        const onFocus = () => refreshAll();
        const onStorage = () => refreshAll();
        window.addEventListener("focus", onFocus);
        window.addEventListener("storage", onStorage);
        return () => {
            window.removeEventListener("focus", onFocus);
            window.removeEventListener("storage", onStorage);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pid, projectKey]);
    useEffect(() => {
        localStorage.setItem(MWST_KEY, String(opts.mwst || 0));
        localStorage.setItem(PDFOPT_KEY, JSON.stringify(opts));
    }, [opts]);
    useEffect(() => {
        if (isNachtragOnlyMode) {
            setStatus("Nachtrag-Angebot aktiv: nur ausgewählte Nachtragspositionen.");
        }
    }, [isNachtragOnlyMode]);
    const offerRows = useMemo(() => {
        return isNachtragOnlyMode ? [] : rows;
    }, [isNachtragOnlyMode, rows]);
    const activeNachtraege = useMemo(() => {
        if (isNachtragOnlyMode) {
            return nachtragOnlyBuffer?.rows?.map(normalizeNachtrag) || [];
        }
        if (!opts.includeNachtraege)
            return [];
        if (opts.nachtragMode === "beauftragt") {
            return nachtraege.filter((r) => r.status === "Beauftragt");
        }
        return nachtraege;
    }, [
        isNachtragOnlyMode,
        nachtragOnlyBuffer,
        nachtraege,
        opts.includeNachtraege,
        opts.nachtragMode
    ]);
    const chapterTotals = useMemo(() => {
        const map = {};
        for (const row of offerRows) {
            const ch = getChapter(row.posNr);
            map[ch] = round2((map[ch] || 0) + rowNet(row));
        }
        return map;
    }, [offerRows]);
    useEffect(() => {
        setChapterAdjustments((prev) => {
            const next = {};
            for (const chapter of Object.keys(chapterTotals)) {
                next[chapter] = prev[chapter] || { rabatt: 0, markup: 0 };
            }
            return next;
        });
    }, [chapterTotals]);
    const chapterSummaries = useMemo(() => {
        return Object.entries(chapterTotals).
            sort(([a], [b]) => a.localeCompare(b, "de", { numeric: true })).
            map(([chapter, rawNetto]) => {
            const adjustment = chapterAdjustments[chapter] || { rabatt: 0, markup: 0 };
            const rabatt = n(adjustment.rabatt, 0);
            const markup = n(adjustment.markup, 0);
            const rabattValue = round2(rawNetto * (rabatt / 100));
            const afterRabatt = round2(rawNetto - rabattValue);
            const markupValue = round2(afterRabatt * (markup / 100));
            const finalNetto = round2(afterRabatt + markupValue);
            return {
                chapter,
                rawNetto,
                rabatt,
                rabattValue,
                afterRabatt,
                markup,
                markupValue,
                finalNetto
            };
        });
    }, [chapterTotals, chapterAdjustments]);
    const totals = useMemo(() => {
        const lvNetto = round2(chapterSummaries.reduce((sum, chapter) => sum + chapter.finalNetto, 0));
        const nachtragNetto = round2(activeNachtraege.reduce((sum, row) => sum + nachtragNet(row), 0));
        const netto = round2(lvNetto + nachtragNetto);
        const steuer = round2(netto * (n(opts.mwst) / 100));
        const brutto = round2(netto + steuer);
        return {
            lvNetto,
            nachtragNetto,
            netto,
            mwst: n(opts.mwst),
            steuer,
            brutto
        };
    }, [chapterSummaries, activeNachtraege, opts.mwst]);
    const previewRows = useMemo(() => {
        const out = [];
        if (!opts.showChapterRows) {
            offerRows.forEach((row) => out.push({
                kind: "row",
                row,
                chapter: getChapter(row.posNr)
            }));
        }
        else {
            let currentChapter = "";
            for (const row of offerRows) {
                const ch = getChapter(row.posNr);
                if (ch !== currentChapter) {
                    currentChapter = ch;
                    out.push({
                        kind: "chapter",
                        id: `chapter-${ch}-${out.length}`,
                        chapter: ch,
                        title: `Kapitel ${ch} – Zwischensumme`,
                        netto: chapterSummaries.find((summary) => summary.chapter === ch)?.finalNetto ||
                            chapterTotals[ch] ||
                            0
                    });
                }
                out.push({
                    kind: "row",
                    row,
                    chapter: ch
                });
            }
        }
        if (activeNachtraege.length) {
            out.push({
                kind: "nachtrag-title",
                id: "nachtrag-title",
                netto: totals.nachtragNetto
            });
            activeNachtraege.forEach((row) => out.push({
                kind: "nachtrag",
                row,
                chapter: "NT"
            }));
        }
        return out;
    }, [
        offerRows,
        opts.showChapterRows,
        chapterTotals,
        chapterSummaries,
        activeNachtraege,
        totals.nachtragNetto
    ]);
    const quality = useMemo(() => {
        const priced = offerRows.filter((r) => n(r.preis) > 0).length;
        const withQty = offerRows.filter((r) => n(r.menge) > 0).length;
        return {
            priced,
            withQty,
            total: offerRows.length,
            pricedPct: offerRows.length ? Math.round(priced / offerRows.length * 100) : 0,
            qtyPct: offerRows.length ? Math.round(withQty / offerRows.length * 100) : 0
        };
    }, [offerRows]);
    async function saveSnapshotToServer() {
        if (!projectKey) {
            alert("Kein Projekt gewählt.");
            return;
        }
        const snapshot = makeSnapshot(projectKey, project, opts, offerRows, activeNachtraege, chapterAdjustments, chapterSummaries, totals, isNachtragOnlyMode ? "nachtrag-only" : "full");
        try {
            localStorage.setItem("rlc_kalkulation_angebot_handoff_v1", JSON.stringify({
                version: "angebot-handoff-v1",
                source: "angebot",
                meta: snapshot.meta,
                totals: snapshot.totals,
                summary: snapshot.totals,
                offer: {
                    number: `ANG-${projectKey}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`,
                    clientName: ""
                },
                savedAt: new Date().toISOString()
            }));
            setServerBusy(true);
            setStatus("Speichere Angebot …");
            const response = await fetch(apiUrl(`/api/kalkulation/angebot/${encodeURIComponent(projectKey)}/save`), {
                method: "POST",
                credentials: "include",
                headers: authHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify(snapshot)
            });
            if (response.status === 404) {
                localStorage.setItem(localBackupKey(projectKey), JSON.stringify(snapshot));
                setStatus("Server-Route fehlt · lokal gesichert");
                return;
            }
            const json = await response.json().catch(() => null);
            if (!response.ok || json?.ok === false) {
                localStorage.setItem(localBackupKey(projectKey), JSON.stringify(snapshot));
                setStatus("Serverfehler · lokal gesichert");
                return;
            }
            setStatus("Angebot gespeichert · lokal für Angebotsverfolgung verfügbar");
            setTimeout(() => setStatus(""), 2200);
        }
        catch {
            localStorage.setItem(localBackupKey(projectKey), JSON.stringify(snapshot));
            setStatus("Fehler · lokal gesichert");
        }
        finally {
            setServerBusy(false);
        }
    }
    async function loadSnapshotFromServer() {
        if (!projectKey) {
            alert("Kein Projekt gewählt.");
            return;
        }
        try {
            setServerBusy(true);
            setStatus("Lade Angebot …");
            const response = await fetch(apiUrl(`/api/kalkulation/angebot/${encodeURIComponent(projectKey)}`), {
                method: "GET",
                credentials: "include",
                headers: authHeaders()
            });
            const json = await response.json().catch(() => null);
            const serverSnapshots = Array.isArray(json) ? json : null;
            const serverSnapshot = serverSnapshots ?
                [...serverSnapshots].sort((a, b) => {
                    const timeOf = (value) => typeof value === "number" ? value : Date.parse(String(value || "")) || 0;
                    const ta = timeOf(a?.updatedAt || a?.meta?.savedAt || a?.createdAt);
                    const tb = timeOf(b?.updatedAt || b?.meta?.savedAt || b?.createdAt);
                    return tb - ta;
                })[0] :
                json?.data || json?.snapshot || json;
            if (response.status === 404 || serverSnapshots && !serverSnapshots.length) {
                const raw = localStorage.getItem(localBackupKey(projectKey));
                if (!raw) {
                    setStatus("Kein Speicherstand gefunden");
                    return;
                }
                applySnapshot(JSON.parse(raw));
                setStatus("Lokaler Speicherstand geladen");
                return;
            }
            if (!response.ok || json?.ok === false) {
                setStatus("Laden fehlgeschlagen");
                return;
            }
            applySnapshot(serverSnapshot);
            setStatus("Angebot geladen");
            setTimeout(() => setStatus(""), 2200);
        }
        catch {
            const raw = localStorage.getItem(localBackupKey(projectKey));
            if (raw) {
                applySnapshot(JSON.parse(raw));
                setStatus("Lokal geladen");
            }
            else {
                setStatus("Fehler beim Laden");
            }
        }
        finally {
            setServerBusy(false);
        }
    }
    function applySnapshot(snapshot) {
        const loadedRows = Array.isArray(snapshot?.rows) ?
            snapshot.rows.map((row, index) => ({
                ...row,
                id: String(row?.id || `${snapshot?.id || "angebot"}-${index + 1}`),
                posNr: String(row?.posNr || row?.pos || index + 1),
                kurztext: String(row?.kurztext || row?.text || row?.beschreibung || ""),
                langtext: String(row?.langtext || row?.text || row?.beschreibung || ""),
                einheit: String(row?.einheit || row?.unit || ""),
                menge: n(row?.menge ?? row?.quantity ?? row?.qty, 0),
                preis: n(row?.preis ?? row?.ep ?? row?.price, 0),
                source: row?.source || "manual"
            })) :
            [];
        const loadedOptions = snapshot?.meta?.options || snapshot?.options;
        if (loadedRows.length) {
            LV.setAll(loadedRows);
            setRows(LV.list());
        }
        if (Array.isArray(snapshot?.nachtraege)) {
            setNachtraege(snapshot.nachtraege.map(normalizeNachtrag));
        }
        setChapterAdjustments(normalizeChapterAdjustments(snapshot?.chapterAdjustments || snapshot?.meta?.chapterAdjustments));
        if (loadedOptions) {
            setOpts((prev) => ({
                ...prev,
                ...loadedOptions,
                mwst: n(loadedOptions.mwst, prev.mwst)
            }));
        }
    }
    function exportXLSX() {
        if (!hasExportRows) {
            alert("Keine Angebotspositionen vorhanden.");
            return;
        }
        const positionRows = offerRows.map((row) => ({
            Typ: "LV",
            Kapitel: getChapter(row.posNr),
            PosNr: row.posNr || "",
            Kurztext: row.kurztext || "",
            Langtext: row.langtext || "",
            Einheit: row.einheit || "",
            Menge: n(row.menge),
            EP_Netto: n(row.preis),
            Zeilen_Netto: rowNet(row),
            Status: "",
            Begruendung: "",
            Waehrung: row.waehrung || "EUR",
            Quelle: row.source || "",
            Confidence: row.confidence ?? ""
        }));
        const nachtragRows = activeNachtraege.map((row) => ({
            Typ: "Nachtrag",
            Kapitel: "NT",
            PosNr: row.posNr || "",
            Kurztext: row.kurztext || "",
            Langtext: row.langtext || "",
            Einheit: row.einheit || "",
            Menge: n(row.mengeDelta),
            EP_Netto: n(row.preis),
            Zeilen_Netto: nachtragNet(row),
            Status: row.status || "Entwurf",
            Begruendung: row.begruendung || "",
            Waehrung: "EUR",
            Quelle: "Nachtrag",
            Confidence: ""
        }));
        const chapterRows = chapterSummaries.map((summary) => ({
            Kapitel: summary.chapter,
            Netto_vor_Anpassung: summary.rawNetto,
            Rabatt_Prozent: summary.rabatt,
            Rabatt_Euro: summary.rabattValue,
            Netto_nach_Rabatt: summary.afterRabatt,
            Aufschlag_Prozent: summary.markup,
            Aufschlag_Euro: summary.markupValue,
            Netto_final: summary.finalNetto
        }));
        const summaryRows = [
            { Kennzahl: "Modus", Wert: isNachtragOnlyMode ? "Nur Nachtrag" : "Vollständiges Angebot" },
            { Kennzahl: "Projekt", Wert: projectKey },
            { Kennzahl: "Projektname", Wert: projectName },
            { Kennzahl: "Auftraggeber", Wert: projectClient },
            { Kennzahl: "Ort", Wert: opts.city },
            { Kennzahl: "Datum", Wert: opts.dateISO },
            {
                Kennzahl: "LV Netto vor Kapitelanpassungen",
                Wert: round2(Object.values(chapterTotals).reduce((sum, value) => sum + value, 0))
            },
            { Kennzahl: "LV Netto nach Kapitelanpassungen", Wert: totals.lvNetto },
            { Kennzahl: "Nachträge Netto", Wert: totals.nachtragNetto },
            { Kennzahl: "Netto Gesamt", Wert: totals.netto },
            { Kennzahl: "MwSt %", Wert: totals.mwst },
            { Kennzahl: "MwSt €", Wert: totals.steuer },
            { Kennzahl: "Brutto", Wert: totals.brutto },
            { Kennzahl: "LV Positionen", Wert: offerRows.length },
            { Kennzahl: "Nachträge", Wert: activeNachtraege.length }
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([...positionRows, ...nachtragRows]), "Angebot");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(chapterRows), "Kapitel");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(activeNachtraege), "Nachtraege");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Zusammenfassung");
        const data = XLSX.write(wb, {
            bookType: "xlsx",
            type: "array"
        });
        const prefix = isNachtragOnlyMode ? "Nachtrag_Angebot" : "Angebot";
        const filename = `${prefix}_${safeFileName(projectKey || opts.dateISO)}.xlsx`;
        downloadBlob(new Blob([data], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        }), filename);
        setStatus("Excel-Datei wurde erzeugt.");
        setKiStatus("Excel-Datei wurde erzeugt.");
    }
    async function exportPDF() {
        const prefix = isNachtragOnlyMode ? "Nachtrag_Angebot" : "Angebot";
        const pdfFileName = `${prefix}_${safeFileName(projectKey || opts.dateISO)}.pdf`;
        const preview = reservePdfPreview(pdfFileName);
        try {
            const offerExportRows = [
                ...offerRows.map(lvRowToOfferExport),
                ...activeNachtraege.map((row) => ({
                    typ: "Nachtrag",
                    posNr: row.posNr,
                    text: row.kurztext,
                    kurztext: row.kurztext,
                    langtext: row.langtext || "",
                    einheit: row.einheit,
                    menge: n(row.mengeDelta),
                    preis: n(row.preis),
                    zeilen: nachtragNet(row),
                    status: row.status || "Entwurf",
                    begruendung: row.begruendung || ""
                }))
            ];
            const payload = {
                title: isNachtragOnlyMode ? "Nachtragsangebot" : "Angebot",
                mode: isNachtragOnlyMode ? "nachtrag-only" : "full",
                project: project ?
                    {
                        id: project.id,
                        code: project.code || project.number || project.projektnummer,
                        number: project.number || project.code || project.projektnummer,
                        name: projectName,
                        client: projectClient,
                        location: getProjectPlace(project)
                    } :
                    null,
                options: {
                    ...opts,
                    mwst: totals.mwst
                },
                rows: offerExportRows,
                lvRows: offerRows.map(lvRowToOfferExport),
                chapterAdjustments,
                chapterSummaries,
                nachtraege: activeNachtraege.map((row) => ({
                    posNr: row.posNr,
                    text: row.kurztext,
                    kurztext: row.kurztext,
                    langtext: row.langtext || "",
                    einheit: row.einheit,
                    menge: n(row.mengeDelta),
                    preis: n(row.preis),
                    zeilen: nachtragNet(row),
                    status: row.status || "Entwurf",
                    begruendung: row.begruendung || ""
                })),
                totals
            };
            const response = await fetch(apiUrl("/api/pdf/angebot"), {
                method: "POST",
                credentials: "include",
                headers: authHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                const txt = await response.text().catch(() => "");
                throw new Error(txt || `PDF Fehler (${response.status})`);
            }
            const blob = await response.blob();
            openPdfBlobPreview(blob, pdfFileName, preview);
        }
        catch (e) {
            if (preview && !preview.closed)
                preview.close();
            alert(`PDF Export fehlgeschlagen: ${e?.message || e}`);
        }
    }
    function exportCSV() {
        if (!hasExportRows) {
            alert("Keine Angebotspositionen vorhanden.");
            return;
        }
        const header = "Typ;PosNr;Kurztext;Langtext;Einheit;Menge;EP netto;Zeilen netto;Status;Begründung";
        const lvLines = offerRows.map((row) => [
            "LV",
            csvCell(row.posNr || ""),
            csvCell(row.kurztext || ""),
            csvCell(row.langtext || ""),
            csvCell(row.einheit || ""),
            String(n(row.menge)).replace(".", ","),
            String(n(row.preis)).replace(".", ","),
            String(rowNet(row)).replace(".", ","),
            "",
            ""
        ].
            join(";"));
        const ntLines = activeNachtraege.map((row) => [
            "Nachtrag",
            csvCell(row.posNr || ""),
            csvCell(row.kurztext || ""),
            csvCell(row.langtext || ""),
            csvCell(row.einheit || ""),
            String(n(row.mengeDelta)).replace(".", ","),
            String(n(row.preis)).replace(".", ","),
            String(nachtragNet(row)).replace(".", ","),
            csvCell(row.status || ""),
            csvCell(row.begruendung || "")
        ].
            join(";"));
        const prefix = isNachtragOnlyMode ? "Nachtrag_Angebot" : "Angebot";
        const filename = `${prefix}_${safeFileName(projectKey || opts.dateISO)}.csv`;
        const csv = "\uFEFF" + [header, ...lvLines, ...ntLines].join("\r\n");
        downloadBlob(new Blob([csv], {
            type: "text/csv;charset=utf-8"
        }), filename);
        setStatus("CSV-Datei wurde erzeugt.");
        setKiStatus("CSV-Datei wurde erzeugt.");
    }
    const hasExportRows = offerRows.length > 0 || activeNachtraege.length > 0;
    function pruefeAngebot() {
        const problems = [];
        if (!projectKey)
            problems.push("Projekt fehlt.");
        if (!opts.city.trim())
            problems.push("Ort fehlt.");
        if (!opts.dateISO.trim())
            problems.push("Datum fehlt.");
        if (n(opts.mwst) < 0)
            problems.push("MwSt ist ungültig.");
        if (!offerRows.length && !activeNachtraege.length) {
            problems.push("Keine LV-Positionen und keine Nachträge vorhanden.");
        }
        const lvOhneMenge = offerRows.filter((r) => n(r.menge) <= 0).length;
        const lvOhnePreis = offerRows.filter((r) => n(r.preis) <= 0).length;
        const ntOhneMenge = activeNachtraege.filter((r) => n(r.mengeDelta) === 0).length;
        const ntOhnePreis = activeNachtraege.filter((r) => n(r.preis) <= 0).length;
        if (lvOhneMenge)
            problems.push(`LV ohne Menge: ${lvOhneMenge}.`);
        if (lvOhnePreis)
            problems.push(`LV ohne EP: ${lvOhnePreis}.`);
        if (ntOhneMenge)
            problems.push(`Nachträge ohne Menge: ${ntOhneMenge}.`);
        if (ntOhnePreis)
            problems.push(`Nachträge ohne EP: ${ntOhnePreis}.`);
        const result = problems.length ?
            `KI-Prüfung: ${problems.join(" ")}` :
            "KI-Prüfung: Angebot ist plausibel. PDF/Excel/CSV können erzeugt werden.";
        setStatus(result);
        setKiStatus(result);
        return result;
    }
    function completeMissingAngebotData() {
        let changed = false;
        setOpts((prev) => {
            const next = { ...prev };
            if (!next.city.trim()) {
                next.city = getProjectPlace(project) || "München";
                changed = true;
            }
            if (!next.dateISO.trim()) {
                next.dateISO = todayIso();
                changed = true;
            }
            if (!next.payment.trim()) {
                next.payment = "Zahlungsbedingungen: 30 Tage netto. Angebot gültig 30 Tage.";
                changed = true;
            }
            if (!Number.isFinite(n(next.mwst))) {
                next.mwst = 19;
                changed = true;
            }
            return next;
        });
        const result = changed ?
            "Fehlende Angebotsdaten wurden ergänzt." :
            "Keine fehlenden Angebotsdaten erkannt.";
        setStatus(result);
        setKiStatus(result);
    }
    useEffect(() => {
        function handleAngebotCommand(event) {
            const detail = event.detail;
            const action = String(detail?.action || "").trim();
            if (!action)
                return;
            if (action === "pdfExport" || action === "pdf" || action === "exportPdf") {
                void exportPDF();
                setStatus("PDF-Export gestartet.");
                setKiStatus("PDF-Export gestartet.");
                return;
            }
            if (action === "excelExport" || action === "xlsx" || action === "exportXlsx") {
                exportXLSX();
                setStatus("Excel-Export gestartet.");
                setKiStatus("Excel-Export gestartet.");
                return;
            }
            if (action === "csvExport" || action === "csv" || action === "exportCsv") {
                exportCSV();
                setStatus("CSV-Export gestartet.");
                setKiStatus("CSV-Export gestartet.");
                return;
            }
            if (action === "save" || action === "speichern" || action === "angebotSpeichern") {
                void saveSnapshotToServer();
                setStatus("Angebot-Speicherung gestartet.");
                setKiStatus("Angebot-Speicherung gestartet.");
                return;
            }
            if (action === "load" || action === "laden" || action === "angebotLaden") {
                void loadSnapshotFromServer();
                setStatus("Angebot wird geladen.");
                setKiStatus("Angebot wird geladen.");
                return;
            }
            if (action === "reload" || action === "neuLaden" || action === "refresh") {
                refreshAll();
                setStatus("Angebotsdaten neu geladen.");
                setKiStatus("Angebotsdaten neu geladen.");
                return;
            }
            if (action === "pruefen" || action === "angebotPruefen" || action === "check") {
                pruefeAngebot();
                return;
            }
            if (action === "completeMissing" || action === "fehlendeDaten" || action === "fehlendeAngebotsdaten") {
                completeMissingAngebotData();
                return;
            }
            if (action === "lv") {
                navigate("/kalkulation/lv-import");
                return;
            }
            if (action === "nachtraege") {
                navigate("/kalkulation/nachtraege");
                return;
            }
            if (action === "ki") {
                navigate("/kalkulation/mit-ki");
                return;
            }
            if (action === "gaeb") {
                navigate("/kalkulation/gaeb");
            }
        }
        window.addEventListener("rlc:angebot-command", handleAngebotCommand);
        window.addEventListener("rlc:angebot-action", handleAngebotCommand);
        window.addEventListener("rlc:kalkulation-angebot-command", handleAngebotCommand);
        return () => {
            window.removeEventListener("rlc:angebot-command", handleAngebotCommand);
            window.removeEventListener("rlc:angebot-action", handleAngebotCommand);
            window.removeEventListener("rlc:kalkulation-angebot-command", handleAngebotCommand);
        };
    });
    useEffect(() => {
        function handleAngebotCommand(event) {
            const detail = event.detail;
            const action = String(detail?.action || "").trim();
            if (!action)
                return;
            if (action === "pdf") {
                void exportPDF();
                setStatus("KI: PDF-Erzeugung gestartet.");
                return;
            }
            if (action === "excel") {
                exportXLSX();
                setStatus("KI: Excel-Export ausgeführt.");
                return;
            }
            if (action === "csv") {
                exportCSV();
                setStatus("KI: CSV-Export ausgeführt.");
                return;
            }
            if (action === "save") {
                void saveSnapshotToServer();
                setStatus("KI: Angebot wird gespeichert.");
                return;
            }
            if (action === "load") {
                void loadSnapshotFromServer();
                return;
            }
            if (action === "refresh") {
                refreshAll();
                setStatus("KI: Angebotsdaten neu geladen.");
                return;
            }
            if (action === "check") {
                const issues = [];
                if (!hasExportRows)
                    issues.push("Keine Angebotspositionen vorhanden");
                if (!String(opts.city || "").trim())
                    issues.push("Ort fehlt");
                if (!String(opts.dateISO || "").trim())
                    issues.push("Datum fehlt");
                if (n(opts.mwst) <= 0)
                    issues.push("MwSt fehlt");
                if (!String(opts.payment || "").trim())
                    issues.push("Zahlungsbedingungen fehlen");
                const result = issues.length ?
                    `KI-Prüfung: ${issues.join(" · ")}` :
                    "KI-Prüfung: Angebot ist plausibel.";
                setStatus(result);
                setKiStatus(result);
                setKiStatus(result);
                return;
            }
            if (action === "fixMissing") {
                const changes = [];
                setOpts((prev) => {
                    const next = { ...prev };
                    if (!String(next.city || "").trim()) {
                        next.city = getProjectPlace(project) || "München";
                        changes.push(`Ort ergänzt: ${next.city}`);
                    }
                    if (!String(next.dateISO || "").trim()) {
                        next.dateISO = todayIso();
                        changes.push(`Datum ergänzt: ${next.dateISO}`);
                    }
                    if (n(next.mwst) <= 0) {
                        next.mwst = 19;
                        changes.push("MwSt geändert: 0 % → 19 %");
                    }
                    if (!String(next.payment || "").trim()) {
                        next.payment = "Zahlungsbedingungen: 30 Tage netto. Angebot gültig 30 Tage.";
                        changes.push("Zahlungsbedingungen ergänzt.");
                    }
                    return next;
                });
                const result = changes.length ?
                    `KI hat geändert: ${changes.join(" · ")}` :
                    "KI: Keine fehlenden Angebotsdaten gefunden.";
                setStatus(result);
                setKiStatus(result);
                setKiStatus(result);
            }
        }
        window.addEventListener("rlc:angebot-command", handleAngebotCommand);
        return () => {
            window.removeEventListener("rlc:angebot-command", handleAngebotCommand);
        };
    });
    useEffect(() => {
        function handleAngebotCommand(event) {
            const detail = event.detail;
            const action = String(detail?.action || "").trim();
            if (!action)
                return;
            if (action === "pdf") {
                void exportPDF();
                setStatus("KI-Aktion: PDF-Erzeugung gestartet.");
                return;
            }
            if (action === "excel") {
                exportXLSX();
                setStatus("KI-Aktion: Excel-Export ausgeführt.");
                return;
            }
            if (action === "csv") {
                exportCSV();
                setStatus("KI-Aktion: CSV-Export ausgeführt.");
                return;
            }
            if (action === "save") {
                void saveSnapshotToServer();
                return;
            }
            if (action === "load") {
                void loadSnapshotFromServer();
                return;
            }
            if (action === "refresh") {
                refreshAll();
                setStatus("KI-Aktion: Angebotsdaten neu geladen.");
                return;
            }
            if (action === "fixMissing") {
                const changes = [];
                setOpts((prev) => {
                    const next = { ...prev };
                    if (!String(next.city || "").trim()) {
                        next.city = getProjectPlace(project) || "München";
                        changes.push(`Ort ergänzt: ${next.city}`);
                    }
                    if (!String(next.dateISO || "").trim()) {
                        next.dateISO = todayIso();
                        changes.push(`Datum ergänzt: ${next.dateISO}`);
                    }
                    if (n(next.mwst) <= 0) {
                        next.mwst = 19;
                        changes.push("MwSt geändert: 0 % → 19 %");
                    }
                    if (!String(next.payment || "").trim()) {
                        next.payment = "Zahlungsbedingungen: 30 Tage netto. Angebot gültig 30 Tage.";
                        changes.push("Zahlungsbedingungen ergänzt.");
                    }
                    if (!isNachtragOnlyMode && nachtraege.length && !next.includeNachtraege) {
                        next.includeNachtraege = true;
                        changes.push("Nachträge im Angebot aktiviert.");
                    }
                    return next;
                });
                setStatus(changes.length ?
                    `KI hat Angebotsdaten ergänzt: ${changes.join(" · ")}` :
                    "KI-Prüfung: Keine fehlenden Angebotsdaten gefunden.");
                return;
            }
            if (action === "check") {
                const issues = [];
                if (!hasExportRows)
                    issues.push("Keine Angebotspositionen vorhanden.");
                if (!String(opts.city || "").trim())
                    issues.push("Ort fehlt.");
                if (!String(opts.dateISO || "").trim())
                    issues.push("Datum fehlt.");
                if (n(opts.mwst) <= 0)
                    issues.push("MwSt fehlt oder ist 0.");
                if (!String(opts.payment || "").trim())
                    issues.push("Zahlungsbedingungen fehlen.");
                if (!isNachtragOnlyMode && nachtraege.length > 0 && !opts.includeNachtraege) {
                    issues.push("Nachträge vorhanden, aber im Angebot deaktiviert.");
                }
                setStatus(issues.length ?
                    `KI-Prüfung: ${issues.join(" · ")}` :
                    "KI-Prüfung: Angebot ist plausibel.");
            }
        }
        window.addEventListener("rlc:angebot-command", handleAngebotCommand);
        return () => {
            window.removeEventListener("rlc:angebot-command", handleAngebotCommand);
        };
    }, [
        opts,
        project,
        nachtraege,
        isNachtragOnlyMode,
        hasExportRows,
        exportPDF,
        exportXLSX,
        exportCSV,
        saveSnapshotToServer,
        loadSnapshotFromServer,
        refreshAll
    ]);
    return (_jsxs("div", { className: rlcClass(null, page), children: [_jsx(PageHeader, { breadcrumb: "RLC Module / Kalkulation", title: isNachtragOnlyMode ? "Nachtragsangebot erstellen" : "Angebot / Export", subtitle: isNachtragOnlyMode ?
                    "Angebotsausgabe nur für ausgewählte Nachtragspositionen." :
                    "Angebot aus aktueller RLC-KI-Kalkulation, LV und Nachträgen erstellen." }), isNachtragOnlyMode ?
                _jsxs("section", { className: rlcClass(null, modeCard), children: [_jsxs("div", { children: [_jsx("b", { children: "Nachtragsangebot aktiv" }), _jsx("div", { className: rlcClass(null, modeText), children: "Es werden nur die aus Nachtr\u00E4ge ausgew\u00E4hlten Positionen angeboten. LV-Hauptpositionen sind in diesem Modus bewusst ausgeblendet." })] }), _jsxs("div", { className: rlcClass(null, heroActions), children: [_jsx("button", { className: rlcClass(null, btnPrimary), onClick: exportPDF, disabled: !hasExportRows, children: "Nachtragsangebot PDF" }), _jsx("button", { className: rlcClass(null, btnSecondary), onClick: clearNachtragOnlyMode, children: "Vollst\u00E4ndiges Angebot \u00F6ffnen" })] })] }) :
                null, _jsxs("section", { className: rlcClass("rlc-page-hero", heroCard), children: [_jsxs("div", { children: [_jsx("div", { className: rlcClass(null, eyebrow), children: isNachtragOnlyMode ?
                                    "Nachtragsangebot · PDF / Excel / CSV" :
                                    "Angebot · PDF / Excel / Nachträge / Server" }), _jsx("h1", { className: rlcClass(null, title), children: isNachtragOnlyMode ? "Nachtragsangebot" : "Angebotsausgabe" }), _jsx("p", { className: rlcClass(null, subtitle), children: isNachtragOnlyMode ?
                                    "Dieses Angebot enthält ausschließlich die ausgewählten Nachtragspositionen." :
                                    "Das Angebot wird aus der aktuellen RLC-KI-Kalkulation und den vorhandenen Nachträgen erzeugt." })] }), _jsxs("div", { className: rlcClass(null, heroActions), children: [_jsx("button", { className: rlcClass(null, btnPrimary), onClick: exportPDF, disabled: !hasExportRows, children: "PDF erzeugen" }), _jsx("button", { className: rlcClass(null, btnSecondary), onClick: exportXLSX, disabled: !hasExportRows, children: "Excel exportieren" }), _jsx("button", { className: rlcClass(null, btnSecondary), onClick: exportCSV, disabled: !hasExportRows, children: "CSV exportieren" }), _jsx("button", { className: rlcClass(null, btnSecondary), onClick: saveSnapshotToServer, disabled: serverBusy || !projectKey, children: "Speichern" }), _jsx("button", { className: rlcClass(null, btnSecondary), onClick: loadSnapshotFromServer, disabled: serverBusy || !projectKey, children: "Laden" }), _jsx("button", { className: rlcClass(null, btnSecondary), onClick: refreshAll, children: "Neu laden" }), isNachtragOnlyMode ?
                                _jsx("button", { className: rlcClass(null, btnSecondary), onClick: clearNachtragOnlyMode, children: "Komplettes Angebot" }) :
                                null] }), _jsxs("div", { className: rlcClass(null, heroMeta), children: ["Projekt: ", _jsx("b", { children: projectKey || "—" }), projectName ? _jsxs("span", { children: [" \u00B7 ", projectName] }) : null, status ? _jsxs("span", { children: [" \u00B7 ", status] }) : null] })] }), _jsxs("section", { className: rlcClass(null, grid4), children: [_jsx(KpiCard, { label: "LV Netto angepasst", value: money(totals.lvNetto), sub: `${offerRows.length} Positionen` }), _jsx(KpiCard, { label: "Nachtr\u00E4ge Netto", value: money(totals.nachtragNetto), sub: isNachtragOnlyMode ?
                            `${activeNachtraege.length} ausgewählt` :
                            `${activeNachtraege.length}/${nachtraege.length} aktiv` }), _jsx(KpiCard, { label: "Netto Gesamt", value: money(totals.netto) }), _jsx(KpiCard, { label: "Brutto Gesamt", value: money(totals.brutto), sub: `${totals.mwst}% MwSt` })] }), _jsxs("section", { className: rlcClass(null, card), children: [_jsxs("div", { className: rlcClass(null, sectionHead), children: [_jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "Angebotsdaten" }), _jsx("div", { className: rlcClass(null, sectionText), children: "Diese Angaben werden f\u00FCr PDF, Excel und Server-Snapshot verwendet." })] }), _jsx("div", { className: rlcClass(null, projectBadge), children: projectKey ?
                                    _jsxs(_Fragment, { children: [_jsx("b", { children: projectKey }), projectName ? _jsxs("span", { children: ["\u2014 ", projectName] }) : null] }) :
                                    "kein Projekt gewählt" })] }), _jsxs("div", { className: rlcClass(null, formGrid), children: [_jsx(Field, { label: "Ort", children: _jsx("input", { className: rlcClass(null, input), value: opts.city, onChange: (e) => setOpts((v) => ({ ...v, city: e.target.value })), placeholder: "M\u00FCnchen" }) }), _jsx(Field, { label: "Datum", children: _jsx("input", { type: "date", className: rlcClass(null, input), value: opts.dateISO, onChange: (e) => setOpts((v) => ({ ...v, dateISO: e.target.value || todayIso() })) }) }), _jsx(Field, { label: "MwSt %", children: _jsx("input", { type: "number", className: rlcClass(null, input), value: opts.mwst, onChange: (e) => setOpts((v) => ({ ...v, mwst: n(e.target.value, 0) })) }) }), _jsx(Field, { label: "Positionen", children: _jsx("input", { className: rlcClass(null, inputMuted), value: `${offerRows.length} LV / ${activeNachtraege.length} Nachträge`, readOnly: true }) })] }), _jsx("div", { className: "rlc-migrated-pages-kalkulation-angebot-tsx-849", children: _jsx(Field, { label: "Zahlungsbedingungen / Notizen", children: _jsx("textarea", { className: rlcClass(null, { ...input, minHeight: 76 }), value: opts.payment, onChange: (e) => setOpts((v) => ({ ...v, payment: e.target.value })) }) }) }), _jsxs("div", { className: rlcClass(null, checkRow), children: [!isNachtragOnlyMode ?
                                _jsxs(_Fragment, { children: [_jsxs("label", { className: rlcClass(null, checkLabel), children: [_jsx("input", { type: "checkbox", checked: opts.includeNachtraege, onChange: (e) => setOpts((v) => ({ ...v, includeNachtraege: e.target.checked })) }), "Nachtr\u00E4ge im Angebot einbeziehen"] }), _jsxs("label", { className: rlcClass(null, checkLabel), children: [_jsx("span", { children: "Nachtr\u00E4ge:" }), _jsxs("select", { className: rlcClass(null, smallSelect), value: opts.nachtragMode, onChange: (e) => setOpts((v) => ({
                                                        ...v,
                                                        nachtragMode: e.target.value === "beauftragt" ? "beauftragt" : "alle"
                                                    })), children: [_jsx("option", { value: "alle", children: "Alle Entw\u00FCrfe + Beauftragte" }), _jsx("option", { value: "beauftragt", children: "Nur Beauftragte" })] })] })] }) :
                                null, _jsxs("label", { className: rlcClass(null, checkLabel), children: [_jsx("input", { type: "checkbox", checked: opts.showWatermark, onChange: (e) => setOpts((v) => ({ ...v, showWatermark: e.target.checked })) }), "Watermark \u201EPowered by OpenAI\u201C"] }), _jsxs("label", { className: rlcClass(null, checkLabel), children: [_jsx("input", { type: "checkbox", checked: opts.colorHeader, onChange: (e) => setOpts((v) => ({ ...v, colorHeader: e.target.checked })) }), "Farbiger Tabellenkopf"] }), _jsxs("label", { className: rlcClass(null, checkLabel), children: [_jsx("input", { type: "checkbox", checked: opts.showTableHeader, onChange: (e) => setOpts((v) => ({ ...v, showTableHeader: e.target.checked })) }), "Tabellenkopf anzeigen"] }), _jsxs("label", { className: rlcClass(null, checkLabel), children: [_jsx("input", { type: "checkbox", checked: opts.showChapterRows, onChange: (e) => setOpts((v) => ({ ...v, showChapterRows: e.target.checked })) }), "Kapitel-Zwischensummen"] })] }), kiStatus ?
                        _jsxs("div", { className: rlcClass(null, kiBox), children: [_jsx("b", { children: "KI-Protokoll" }), _jsx("div", { className: rlcClass(null, kiText), children: kiStatus })] }) :
                        null, _jsxs("div", { className: rlcClass(null, buttonRow), children: [_jsx("button", { className: rlcClass(null, btnSecondary), onClick: () => navigate("/kalkulation/lv-import"), children: "LV / Positionen" }), _jsx("button", { className: rlcClass(null, btnSecondary), onClick: () => navigate("/kalkulation/mit-ki"), children: "Kalkulation" }), _jsx("button", { className: rlcClass(null, btnSecondary), onClick: () => navigate("/kalkulation/nachtraege"), children: "Nachtr\u00E4ge" }), _jsx("button", { className: rlcClass(null, btnSecondary), onClick: () => navigate("/kalkulation/gaeb"), children: "GAEB" })] })] }), !isNachtragOnlyMode && chapterSummaries.length ?
                _jsxs("section", { className: rlcClass(null, card), children: [_jsx("div", { className: rlcClass(null, sectionHead), children: _jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "Kapitelrabatt / Aufschlag" }), _jsx("div", { className: rlcClass(null, sectionText), children: "Rabatt und Aufschlag werden je Kapitel berechnet, im Server-Snapshot gespeichert und im Angebots-PDF ausgewiesen." })] }) }), _jsx("div", { className: rlcClass(null, tableWrap), children: _jsxs("table", { className: rlcClass(null, table), children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, th), children: "Kapitel" }), _jsx("th", { className: rlcClass(null, thRight), children: "Netto vorher" }), _jsx("th", { className: rlcClass(null, thRight), children: "Rabatt %" }), _jsx("th", { className: rlcClass(null, thRight), children: "Rabatt \u20AC" }), _jsx("th", { className: rlcClass(null, thRight), children: "Aufschlag %" }), _jsx("th", { className: rlcClass(null, thRight), children: "Aufschlag \u20AC" }), _jsx("th", { className: rlcClass(null, thRight), children: "Netto final" })] }) }), _jsx("tbody", { children: chapterSummaries.map((summary) => _jsxs("tr", { children: [_jsxs("td", { className: rlcClass(null, tdStrong), children: ["Kapitel ", summary.chapter] }), _jsx("td", { className: rlcClass(null, tdRight), children: money(summary.rawNetto) }), _jsx("td", { className: rlcClass(null, tdRight), children: _jsx("input", { type: "number", step: "0.1", className: rlcClass(null, chapterNumberInput), value: summary.rabatt, onChange: (e) => setChapterAdjustments((prev) => ({
                                                            ...prev,
                                                            [summary.chapter]: {
                                                                ...(prev[summary.chapter] || { rabatt: 0, markup: 0 }),
                                                                rabatt: n(e.target.value, 0)
                                                            }
                                                        })) }) }), _jsxs("td", { className: rlcClass(null, tdRight), children: ["\u2212 ", money(summary.rabattValue)] }), _jsx("td", { className: rlcClass(null, tdRight), children: _jsx("input", { type: "number", step: "0.1", className: rlcClass(null, chapterNumberInput), value: summary.markup, onChange: (e) => setChapterAdjustments((prev) => ({
                                                            ...prev,
                                                            [summary.chapter]: {
                                                                ...(prev[summary.chapter] || { rabatt: 0, markup: 0 }),
                                                                markup: n(e.target.value, 0)
                                                            }
                                                        })) }) }), _jsxs("td", { className: rlcClass(null, tdRight), children: ["+ ", money(summary.markupValue)] }), _jsx("td", { className: rlcClass(null, tdRightBold), children: money(summary.finalNetto) })] }, `chapter-adjustment-${summary.chapter}`)) })] }) })] }) :
                null, _jsxs("section", { className: rlcClass(null, card), children: [_jsx("div", { className: rlcClass(null, sectionHead), children: _jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "Angebotsvorschau" }), _jsx("div", { className: rlcClass(null, sectionText), children: isNachtragOnlyMode ?
                                        "Vorschau nur der ausgewählten Nachtragspositionen." :
                                        "Kompakte Vorschau aus LV, RLC-KI-Kalkulation und Nachträgen. Änderungen erfolgen in LV / Positionen, Kalkulation oder Nachträge." })] }) }), _jsx("div", { className: rlcClass(null, tableWrap), children: _jsxs("table", { className: rlcClass(null, table), children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, th), children: "Typ" }), _jsx("th", { className: rlcClass(null, th), children: "Kap." }), _jsx("th", { className: rlcClass(null, th), children: "PosNr" }), _jsx("th", { className: rlcClass(null, th), children: "Kurztext" }), _jsx("th", { className: rlcClass(null, th), children: "ME" }), _jsx("th", { className: rlcClass(null, thRight), children: "Menge" }), _jsx("th", { className: rlcClass(null, thRight), children: "EP netto" }), _jsx("th", { className: rlcClass(null, thRight), children: "Zeilen-Netto" })] }) }), _jsxs("tbody", { children: [previewRows.map((item) => {
                                            if (item.kind === "chapter") {
                                                return (_jsx("tr", { children: _jsxs("td", { colSpan: 8, className: rlcClass(null, chapterRow), children: ["Kapitel ", item.chapter, " \u00B7 Zwischensumme: ", money(item.netto)] }) }, item.id));
                                            }
                                            if (item.kind === "nachtrag-title") {
                                                return (_jsx("tr", { children: _jsxs("td", { colSpan: 8, className: rlcClass(null, nachtragChapterRow), children: [isNachtragOnlyMode ? "Nachtragsangebot" : "Nachträge", " \u00B7 Zwischensumme:", " ", money(item.netto)] }) }, item.id));
                                            }
                                            if (item.kind === "nachtrag") {
                                                const row = item.row;
                                                return (_jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, td), children: _jsx("span", { className: rlcClass(null, badgeNachtrag), children: "Nachtrag" }) }), _jsx("td", { className: rlcClass(null, td), children: "NT" }), _jsx("td", { className: rlcClass(null, td), children: row.posNr }), _jsxs("td", { className: rlcClass(null, tdText), children: [_jsx("div", { className: "rlc-migrated-pages-kalkulation-angebot-tsx-850", children: row.kurztext || "—" }), row.langtext ? _jsx("div", { className: rlcClass(null, smallMuted), children: row.langtext }) : null, row.begruendung ?
                                                                    _jsxs("div", { className: rlcClass(null, smallWarn), children: ["Begr\u00FCndung: ", row.begruendung] }) :
                                                                    null] }), _jsx("td", { className: rlcClass(null, td), children: row.einheit }), _jsx("td", { className: rlcClass(null, tdRight), children: num(row.mengeDelta) }), _jsx("td", { className: rlcClass(null, tdRight), children: money(row.preis) }), _jsx("td", { className: rlcClass(null, tdRightBold), children: money(nachtragNet(row)) })] }, `nt-${row.id}`));
                                            }
                                            const row = item.row;
                                            return (_jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, td), children: _jsx("span", { className: rlcClass(null, badgeLv), children: "LV" }) }), _jsx("td", { className: rlcClass(null, td), children: item.chapter }), _jsx("td", { className: rlcClass(null, td), children: row.posNr }), _jsxs("td", { className: rlcClass(null, tdText), children: [_jsx("div", { className: "rlc-migrated-pages-kalkulation-angebot-tsx-851", children: row.kurztext || "—" }), row.langtext ? _jsx("div", { className: rlcClass(null, smallMuted), children: row.langtext }) : null] }), _jsx("td", { className: rlcClass(null, td), children: row.einheit }), _jsx("td", { className: rlcClass(null, tdRight), children: num(row.menge) }), _jsx("td", { className: rlcClass(null, tdRight), children: money(row.preis) }), _jsx("td", { className: rlcClass(null, tdRightBold), children: money(rowNet(row)) })] }, row.id));
                                        }), !offerRows.length && !activeNachtraege.length ?
                                            _jsx("tr", { children: _jsx("td", { colSpan: 8, className: rlcClass(null, { ...td, color: "#64748B" }), children: "Kein LV und keine aktiven Nachtr\u00E4ge vorhanden. Bitte zuerst Positionen importieren, in der Kalkulation berechnen oder Nachtr\u00E4ge \u00FCbernehmen." }) }) :
                                            null] })] }) })] }), _jsxs("section", { className: rlcClass(null, totalsBar), children: [_jsxs("div", { className: rlcClass(null, sumBox), children: [_jsx("div", { className: rlcClass(null, sumLabel), children: "LV Netto" }), _jsx("div", { className: rlcClass(null, sumValue), children: money(totals.lvNetto) })] }), _jsxs("div", { className: rlcClass(null, sumBox), children: [_jsx("div", { className: rlcClass(null, sumLabel), children: "Nachtr\u00E4ge Netto" }), _jsx("div", { className: rlcClass(null, sumValue), children: money(totals.nachtragNetto) })] }), _jsxs("div", { className: rlcClass(null, sumBox), children: [_jsx("div", { className: rlcClass(null, sumLabel), children: "Gesamt Netto" }), _jsx("div", { className: rlcClass(null, sumValue), children: money(totals.netto) })] }), _jsxs("div", { className: rlcClass(null, sumBox), children: [_jsx("div", { className: rlcClass(null, sumLabel), children: "MwSt" }), _jsx("div", { className: rlcClass(null, sumValue), children: money(totals.steuer) })] }), _jsxs("div", { className: rlcClass(null, sumBoxStrong), children: [_jsx("div", { className: rlcClass(null, sumLabel), children: "Gesamt Brutto" }), _jsx("div", { className: rlcClass(null, sumValue), children: money(totals.brutto) })] })] })] }));
}
function Field({ label, children }) {
    return (_jsxs("label", { className: "rlc-migrated-pages-kalkulation-angebot-tsx-852", children: [_jsx("span", { className: rlcClass(null, labelStyle), children: label }), children] }));
}
function KpiCard({ label, value, sub }) {
    return (_jsxs("div", { className: rlcClass(null, kpiCard), children: [_jsx("div", { className: rlcClass(null, kpiLabel), children: label }), _jsx("div", { className: rlcClass(null, kpiValue), children: value }), sub ? _jsx("div", { className: rlcClass(null, kpiSub), children: sub }) : null] }));
}
/* ================= STYLES ================= */
const kiBox = {
    marginTop: 14,
    border: "1px solid #BED6FF",
    background: "#EAF2FF",
    color: "#1E3A8A",
    borderRadius: 14,
    padding: 12,
    fontSize: 13,
    fontWeight: 700
};
const kiText = {
    marginTop: 5,
    whiteSpace: "pre-wrap",
    lineHeight: 1.45
};
const page = {
    display: "grid",
    gap: 16,
    padding: 16
};
const modeCard = {
    background: "#FFF7ED",
    border: "1px solid #FED7AA",
    color: "#9A3412",
    borderRadius: 16,
    padding: 16,
    display: "flex",
    justifyContent: "space-between",
    gap: 14,
    alignItems: "center",
    flexWrap: "wrap"
};
const modeText = {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 1.45
};
const heroCard = {
    background: "linear-gradient(135deg, #0B5BD3 0%, #0B5BD3 48%, #146EF5 100%)",
    color: "#FFFFFF",
    borderRadius: 18,
    padding: 22,
    display: "grid",
    gap: 14,
    boxShadow: "0 16px 40px rgba(15,23,42,0.18)"
};
const eyebrow = {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    opacity: 0.85,
    fontWeight: 700
};
const title = {
    margin: "4px 0",
    fontSize: 30,
    fontWeight: 700
};
const subtitle = {
    margin: 0,
    maxWidth: 980,
    opacity: 0.9,
    lineHeight: 1.55
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
    padding: 16,
    boxShadow: "0 1px 2px rgba(15,23,42,0.04)"
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
    fontSize: 22,
    color: "#0F172A",
    fontWeight: 700
};
const kpiSub = {
    marginTop: 3,
    fontSize: 12,
    color: "#64748B"
};
const card = {
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 1px 2px rgba(15,23,42,0.04)"
};
const sectionHead = {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    flexWrap: "wrap",
    marginBottom: 12
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
    color: "#64748B"
};
const formGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
    gap: 12
};
const labelStyle = {
    fontSize: 12,
    color: "#64748B",
    fontWeight: 700
};
const input = {
    border: "1px solid #D1D5DB",
    borderRadius: 10,
    padding: "9px 11px",
    fontSize: 13,
    width: "100%",
    boxSizing: "border-box",
    background: "#FFFFFF",
    color: "#0F172A"
};
const inputMuted = {
    ...input,
    background: "#F8FAFC",
    color: "#64748B"
};
const smallSelect = {
    border: "1px solid #D1D5DB",
    borderRadius: 10,
    padding: "7px 9px",
    fontSize: 13,
    background: "#FFFFFF",
    color: "#0F172A"
};
const checkRow = {
    display: "flex",
    gap: 14,
    flexWrap: "wrap",
    marginTop: 12
};
const checkLabel = {
    display: "flex",
    gap: 7,
    alignItems: "center",
    fontSize: 13,
    color: "#334155",
    fontWeight: 600
};
const buttonRow = {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 14
};
const btnBase = {
    border: "1px solid #D1D5DB",
    borderRadius: 10,
    padding: "9px 13px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap"
};
const btnPrimary = {
    ...btnBase,
    border: "1px solid #146EF5",
    background: "#146EF5",
    color: "#FFFFFF"
};
const btnSecondary = {
    ...btnBase,
    background: "#FFFFFF",
    color: "#0F172A"
};
const projectBadge = {
    border: "1px solid #E5E7EB",
    borderRadius: 999,
    padding: "7px 12px",
    background: "#F8FAFC",
    display: "flex",
    gap: 8,
    alignItems: "center",
    whiteSpace: "nowrap",
    fontSize: 13,
    color: "#0F172A"
};
const chapterNumberInput = {
    width: 86,
    border: "1px solid #CBD5E1",
    borderRadius: 9,
    padding: "7px 8px",
    textAlign: "right",
    fontSize: 13,
    fontWeight: 700,
    color: "#0F172A",
    background: "#FFFFFF"
};
const tableWrap = {
    overflowX: "auto",
    border: "1px solid #E5E7EB",
    borderRadius: 12
};
const table = {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 1080
};
const th = {
    textAlign: "left",
    padding: "10px 9px",
    fontSize: 12,
    color: "#475569",
    background: "#F8FAFC",
    borderBottom: "1px solid #E5E7EB",
    whiteSpace: "nowrap",
    fontWeight: 700
};
const thRight = {
    ...th,
    textAlign: "right"
};
const td = {
    padding: "8px 9px",
    fontSize: 12,
    borderBottom: "1px solid #F1F5F9",
    verticalAlign: "top"
};
const tdStrong = {
    ...td,
    fontWeight: 700
};
const tdText = {
    ...td,
    minWidth: 280
};
const tdRight = {
    ...td,
    textAlign: "right",
    whiteSpace: "nowrap"
};
const tdRightBold = {
    ...tdRight,
    fontWeight: 700,
    color: "#0F172A"
};
const chapterRow = {
    ...td,
    background: "#EAF2FF",
    color: "#1E3A8A",
    fontWeight: 700
};
const nachtragChapterRow = {
    ...td,
    background: "#FFF7ED",
    color: "#C2410C",
    fontWeight: 700
};
const smallMuted = {
    marginTop: 3,
    color: "#64748B",
    fontSize: 11,
    lineHeight: 1.35,
    maxWidth: 560,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis"
};
const smallWarn = {
    marginTop: 3,
    color: "#B45309",
    fontSize: 11,
    lineHeight: 1.35,
    maxWidth: 560,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis"
};
const badgeLv = {
    display: "inline-flex",
    border: "1px solid #BED6FF",
    background: "#EAF2FF",
    color: "#0B5BD3",
    borderRadius: 999,
    padding: "4px 9px",
    fontSize: 11,
    fontWeight: 700
};
const badgeNachtrag = {
    ...badgeLv,
    border: "1px solid #FED7AA",
    background: "#FFF7ED",
    color: "#C2410C"
};
const totalsBar = {
    display: "flex",
    justifyContent: "flex-end",
    gap: 12,
    flexWrap: "wrap"
};
const sumBox = {
    border: "1px solid #E5E7EB",
    borderRadius: 14,
    padding: "12px 16px",
    minWidth: 190,
    background: "#FFFFFF"
};
const sumBoxStrong = {
    ...sumBox,
    border: "1px solid #BED6FF",
    background: "#EAF2FF"
};
const sumLabel = {
    fontSize: 12,
    color: "#64748B",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em"
};
const sumValue = {
    marginTop: 5,
    fontSize: 18,
    color: "#0F172A",
    fontWeight: 700
};
