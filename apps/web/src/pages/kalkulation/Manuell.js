import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/kalkulation/Manuell.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { useProject } from "../../store/useProject";
import { API_BASE } from "../../lib/apiBase";
import { LV } from "./store.lv";
import { openPdfBlobPreview, reservePdfPreview } from "../../lib/pdf/companyPdfHeader";
const MWST_KEY = "rlc_lv_mwst_v1";
const MANUELL_HANDOFF_KEY = "rlc_kalkulation_manuell_handoff_v1";
const KI_HANDOFF_KEY = "rlc_kalkulation_ki_handoff_v1";
const ANGEBOT_HANDOFF_KEY = "rlc_kalkulation_angebot_handoff_v1";
function apiUrl(path) {
    const base = String(API_BASE || "").replace(/\/+$/, "");
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    if (!base)
        return cleanPath;
    if (base.endsWith("/api") && cleanPath.startsWith("/api/")) {
        return `${base}${cleanPath.slice(4)}`;
    }
    return `${base}${cleanPath}`;
}
function n(value, fallback = 0) {
    const x = typeof value === "number" ?
        value :
        Number(String(value ?? "").replace(",", ".").trim());
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
function safeFileName(value) {
    return String(value || "Datei").
        replace(/[^\w.-]+/g, "_").
        replace(/_+/g, "_");
}
function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
function safeId() {
    try {
        return crypto.randomUUID();
    }
    catch {
        return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
}
function getAuthToken() {
    try {
        const keys = [
            "token",
            "authToken",
            "accessToken",
            "rlc_token",
            "rlc_auth_token",
            "rlc_access_token"
        ];
        for (const key of keys) {
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
function authJsonHeaders() {
    const token = getAuthToken();
    return {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
}
function authHeaders(extra) {
    const token = getAuthToken();
    return {
        ...(extra || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
}
function getCurrentProject(projectCtx) {
    return (projectCtx?.project ||
        projectCtx?.currentProject ||
        projectCtx?.selectedProject ||
        projectCtx?.current ||
        null);
}
function getProjectKey(projectCtx) {
    const p = getCurrentProject(projectCtx);
    return String(p?.code ||
        p?.projectCode ||
        p?.number ||
        projectCtx?.projectCode ||
        projectCtx?.projectId ||
        p?.id ||
        projectCtx?.id ||
        "").
        trim().
        toUpperCase();
}
function getProjectName(projectCtx) {
    const p = getCurrentProject(projectCtx);
    return String(p?.name || p?.projectName || "").trim();
}
function getProjectPlace(projectCtx, offerPlace) {
    const p = getCurrentProject(projectCtx);
    return String(offerPlace ||
        p?.place ||
        p?.location ||
        p?.ort ||
        projectCtx?.place ||
        projectCtx?.location ||
        "").trim();
}
function localBackupKey(projectKey) {
    return `rlc_kalkulation_manuell_elite_v1:${projectKey || "NO_PROJECT"}`;
}
function mapEinheit(p) {
    if (p.einheit && p.einheit.trim()) {
        const e = p.einheit.trim().toLowerCase();
        if (e === "m2" || e === "m²")
            return "m²";
        if (e === "m3" || e === "m³")
            return "m³";
        if (e === "stk" || e === "stück" || e === "st")
            return "St";
        if (e === "m")
            return "m";
        return p.einheit.trim();
    }
    if (p.unitHint)
        return mapEinheit({ einheit: p.unitHint });
    if (p.geomType === "polygon")
        return "m²";
    if (p.geomType === "polyline" || p.geomType === "line")
        return "m";
    if (p.geomType === "point")
        return "St";
    const layer = String(p.layer || "").toLowerCase();
    if (/fläche|asphalt|pflaster|area|polygon/.test(layer))
        return "m²";
    if (/leitung|trasse|kanal|rohr|line/.test(layer))
        return "m";
    if (/punkt|schacht|symbol|bohrung/.test(layer))
        return "St";
    if (/aushub|volumen|m3|m³/.test(layer))
        return "m³";
    const text = `${p.kurztext || ""} ${p.posNr || ""}`.toLowerCase();
    if (/\bm²|\bm2|fläche|schicht|belag/.test(text))
        return "m²";
    if (/\bm³|\bm3|volumen|kubatur|aushub/.test(text))
        return "m³";
    if (/\bstk|stück|schacht|anschluss|hausanschluss\b/.test(text))
        return "St";
    if (/\bm\b|leitung|trasse|kabel|rohr/.test(text))
        return "m";
    return "m";
}
function roundForUnit(v, einheit) {
    const x = Number(v || 0);
    const e = einheit.toLowerCase();
    if (e === "stk" || e === "stück" || e === "st")
        return Math.round(x);
    if (e === "m³" || e === "m3")
        return Math.round(x * 1000) / 1000;
    return Math.round(x * 100) / 100;
}
function lineNet(row) {
    const raw = n(row.menge) * n(row.preis);
    const rabatt = n(row.rabatt);
    return round2(raw * (1 - rabatt / 100));
}
function normalizeRow(row) {
    const einheit = String(row.einheit || "m").trim();
    const menge = roundForUnit(n(row.menge), einheit);
    const preis = n(row.preis);
    return {
        id: String(row.id || safeId()),
        posNr: String(row.posNr || ""),
        parentPosNr: row.parentPosNr || "",
        sortIndex: row.sortIndex,
        kurztext: String(row.kurztext || ""),
        langtext: String(row.langtext || ""),
        bemerkung: row.bemerkung || "",
        einheit,
        menge,
        preis,
        gesamt: round2(menge * preis),
        waehrung: row.waehrung || "EUR",
        confidence: typeof row.confidence === "number" ? row.confidence : undefined,
        source: row.source || "manual",
        createdAt: row.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        rabatt: n(row.rabatt),
        note: row.note || ""
    };
}
function cadToLV(p) {
    const einheit = mapEinheit(p);
    return normalizeRow({
        id: safeId(),
        posNr: p.posNr ?? "",
        kurztext: p.kurztext ?? "",
        langtext: p.langtext ?? "",
        bemerkung: p.bemerkung ?? "",
        einheit,
        menge: roundForUnit(p.menge ?? 0, einheit),
        preis: typeof p.preis === "number" ? p.preis : 0,
        confidence: typeof p.confidence === "number" ? p.confidence : undefined,
        source: "cad"
    });
}
function toManualRows(rows) {
    return rows.map((r) => normalizeRow({
        ...r,
        rabatt: r.rabatt ?? 0,
        note: r.note ?? ""
    }));
}
export default function Manuell() {
    const nav = useNavigate();
    const projectCtx = useProject();
    const projectKey = getProjectKey(projectCtx);
    const projectName = getProjectName(projectCtx);
    const fileRef = useRef(null);
    const [rows, setRows] = useState(() => toManualRows(LV.list()));
    const [selectedId, setSelectedId] = useState("");
    const [mwst, setMwst] = useState(() => Number(localStorage.getItem(MWST_KEY) ?? 19));
    const [globalMarkup, setGlobalMarkup] = useState(() => {
        const saved = localStorage.getItem("rlc_kalkulation_global_markup_v1");
        return saved == null ? 10 : Number(saved);
    });
    const [serverBusy, setServerBusy] = useState(false);
    const [serverStatus, setServerStatus] = useState("");
    const [pdfBusy, setPdfBusy] = useState(false);
    const [offer, setOffer] = useState({
        number: `ANG-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`,
        place: "München",
        clientName: "Muster Bau GmbH",
        clientAddress: "Hauptstraße 5, 50667 Köln",
        notes: "Zahlungsbedingungen: 30 Tage netto. Angebot gültig 30 Tage. Manuell kalkulierte Preise."
    });
    useEffect(() => {
        localStorage.setItem("rlc_kalkulation_global_markup_v1", String(globalMarkup));
    }, [globalMarkup]);
    useEffect(() => {
        setRows(toManualRows(LV.list()));
    }, []);
    useEffect(() => {
        localStorage.setItem(MWST_KEY, String(mwst || 0));
    }, [mwst]);
    useEffect(() => {
        const onMsg = (e) => {
            const d = e.data;
            if (!d || d.type !== "CAD_TO_KALKULATION")
                return;
            try {
                const list = Array.isArray(d.payload) ?
                    d.payload.map(cadToLV) :
                    [cadToLV(d.payload)];
                persistRows([...list, ...toManualRows(LV.list())]);
            }
            catch {
                //
            }
        };
        window.addEventListener("message", onMsg);
        return () => window.removeEventListener("message", onMsg);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const selectedRow = useMemo(() => rows.find((r) => r.id === selectedId) || rows[0] || null, [rows, selectedId]);
    const summary = useMemo(() => {
        const subtotal = rows.reduce((s, r) => s + lineNet(r), 0);
        const markupValue = subtotal * (globalMarkup / 100);
        const netto = subtotal + markupValue;
        const tax = netto * (mwst / 100);
        const brutto = netto + tax;
        const priced = rows.filter((r) => n(r.preis) > 0).length;
        return {
            subtotal: round2(subtotal),
            markupValue: round2(markupValue),
            netto: round2(netto),
            tax: round2(tax),
            brutto: round2(brutto),
            priced,
            total: rows.length,
            coveragePct: rows.length ? Math.round(priced / rows.length * 100) : 0
        };
    }, [rows, mwst, globalMarkup]);
    function persistRows(next) {
        const normalized = next.map(normalizeRow);
        setRows(normalized);
        LV.bulkUpsert(normalized.map((r) => ({
            ...r,
            preis: n(r.preis),
            gesamt: lineNet(r),
            confidence: r.confidence,
            source: r.source || "manual"
        })));
    }
    function updateRow(id, patch) {
        const next = rows.map((r) => r.id === id ? normalizeRow({ ...r, ...patch }) : r);
        persistRows(next);
    }
    function addRow() {
        const row = normalizeRow({
            id: safeId(),
            posNr: "",
            kurztext: "",
            langtext: "",
            einheit: "m",
            menge: 0,
            preis: 0,
            rabatt: 0,
            source: "manual"
        });
        persistRows([row, ...rows]);
        setSelectedId(row.id);
    }
    function removeRow(id) {
        const next = rows.filter((r) => r.id !== id);
        persistRows(next);
        LV.remove(id);
        if (selectedId === id)
            setSelectedId(next[0]?.id || "");
    }
    function clearAll() {
        if (!confirm("Alle manuellen Positionen wirklich löschen?"))
            return;
        LV.clear();
        setRows([]);
        setSelectedId("");
    }
    async function saveToServer() {
        if (!projectKey) {
            alert("Kein Projekt gewählt.");
            return;
        }
        const payload = {
            version: "manual-elite-v1",
            meta: {
                projectKey,
                projectName,
                savedAt: new Date().toISOString(),
                mwst,
                globalMarkup,
                offer
            },
            rows,
            summary,
            totals: {
                netto: summary.netto,
                aufschlagWert: summary.markupValue,
                brutto: summary.brutto
            }
        };
        try {
            setServerBusy(true);
            setServerStatus("Speichere…");
            const r = await fetch(apiUrl(`/api/kalkulation/${encodeURIComponent(projectKey)}/manuell/save`), {
                method: "POST",
                credentials: "include",
                headers: authJsonHeaders(),
                body: JSON.stringify(payload)
            });
            if (r.status === 401 || r.status === 403 || r.status === 404) {
                localStorage.setItem(localBackupKey(projectKey), JSON.stringify(payload));
                setServerStatus(r.status === 404 ?
                    "Server-Route fehlt · lokal gesichert" :
                    "Nicht angemeldet · lokal gesichert");
                return;
            }
            const json = await r.json().catch(() => null);
            if (!r.ok || !json?.ok) {
                localStorage.setItem(localBackupKey(projectKey), JSON.stringify(payload));
                setServerStatus("Serverfehler · lokal gesichert");
                return;
            }
            setServerStatus("Gespeichert");
            setTimeout(() => setServerStatus(""), 2000);
        }
        catch {
            localStorage.setItem(localBackupKey(projectKey), JSON.stringify(payload));
            setServerStatus("Fehler · lokal gesichert");
        }
        finally {
            setServerBusy(false);
        }
    }
    async function loadFromServer() {
        if (!projectKey) {
            alert("Kein Projekt gewählt.");
            return;
        }
        try {
            setServerBusy(true);
            setServerStatus("Lade…");
            const r = await fetch(apiUrl(`/api/kalkulation/${encodeURIComponent(projectKey)}/manuell`), {
                method: "GET",
                credentials: "include",
                headers: authJsonHeaders()
            });
            const json = await r.json().catch(() => null);
            if (r.status === 401 || r.status === 403 || r.status === 404 || !json?.exists) {
                const raw = localStorage.getItem(localBackupKey(projectKey));
                if (!raw) {
                    setServerStatus("Kein Speicherstand");
                    return;
                }
                applySnapshot(JSON.parse(raw));
                setServerStatus(r.status === 404 ? "Lokal geladen" : "Backup geladen");
                return;
            }
            if (!r.ok || !json?.ok) {
                setServerStatus("Laden fehlgeschlagen");
                return;
            }
            applySnapshot(json.data || {});
            setServerStatus("Geladen");
            setTimeout(() => setServerStatus(""), 2000);
        }
        catch {
            setServerStatus("Fehler beim Laden");
        }
        finally {
            setServerBusy(false);
        }
    }
    function applySnapshot(data) {
        const loadedRows = Array.isArray(data.rows) ? data.rows.map(normalizeRow) : [];
        if (loadedRows.length)
            persistRows(loadedRows);
        const meta = data.meta || {};
        if (typeof meta.mwst === "number")
            setMwst(meta.mwst);
        if (typeof meta.globalMarkup === "number")
            setGlobalMarkup(meta.globalMarkup);
        if (meta.offer)
            setOffer(meta.offer);
    }
    function handleAddFromCAD() {
        const raw = localStorage.getItem("cad_inbox");
        if (raw) {
            try {
                const arr = JSON.parse(raw);
                if (Array.isArray(arr) && arr.length) {
                    const list = arr.map(cadToLV);
                    persistRows([...list, ...rows]);
                    localStorage.removeItem("cad_inbox");
                    return;
                }
            }
            catch {
                //
            }
        }
        const pasted = prompt('CAD JSON einfügen ({posNr,kurztext,einheit?,menge,preis} oder Array):');
        if (!pasted)
            return;
        try {
            const data = JSON.parse(pasted);
            const list = Array.isArray(data) ?
                data.map(cadToLV) :
                [cadToLV(data)];
            persistRows([...list, ...rows]);
        }
        catch {
            alert("JSON nicht gültig.");
        }
    }
    function exportCSV() {
        const csv = LV.exportCSV(rows);
        downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `kalkulation_manuell_${safeFileName(offer.number)}.csv`);
    }
    function importCSVFile(file) {
        const reader = new FileReader();
        reader.onload = () => {
            LV.importCSV(String(reader.result || ""));
            setRows(toManualRows(LV.list()));
            if (fileRef.current)
                fileRef.current.value = "";
        };
        reader.readAsText(file, "utf-8");
    }
    function exportXLSX() {
        const wsRows = XLSX.utils.json_to_sheet(rows.map((r) => ({
            PosNr: r.posNr,
            Kurztext: r.kurztext,
            Langtext: r.langtext,
            Einheit: r.einheit,
            Menge: r.menge,
            EP_Netto: r.preis ?? 0,
            Rabatt_Prozent: r.rabatt ?? 0,
            Zeilen_Netto: lineNet(r),
            Confidence: r.confidence ?? "",
            Quelle: r.source ?? "manual",
            Notiz: r.note ?? ""
        })));
        const wsSummary = XLSX.utils.json_to_sheet([
            { Kennzahl: "Projekt", Wert: projectKey || "—" },
            { Kennzahl: "Angebot", Wert: offer.number },
            { Kennzahl: "Netto", Wert: summary.netto },
            { Kennzahl: "MwSt %", Wert: mwst },
            { Kennzahl: "MwSt €", Wert: summary.tax },
            { Kennzahl: "Brutto", Wert: summary.brutto },
            { Kennzahl: "Positionen", Wert: rows.length },
            { Kennzahl: "Abdeckung %", Wert: summary.coveragePct }
        ]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, wsRows, "Manuelle Kalkulation");
        XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");
        XLSX.writeFile(wb, `Manuelle_Kalkulation_${safeFileName(offer.number)}.xlsx`);
    }
    async function exportPDF() {
        if (!rows.length)
            return;
        const pdfFileName = `Angebot_${safeFileName(offer.number)}.pdf`;
        const preview = reservePdfPreview(pdfFileName);
        try {
            setPdfBusy(true);
            setServerStatus("PDF wird erzeugt…");
            const payload = {
                title: "Angebot",
                project: {
                    id: projectKey,
                    code: projectKey,
                    number: projectKey,
                    name: projectName,
                    client: offer.clientName,
                    auftraggeber: offer.clientName,
                    address: offer.clientAddress,
                    adresse: offer.clientAddress,
                    location: getProjectPlace(projectCtx, offer.place),
                    place: getProjectPlace(projectCtx, offer.place)
                },
                recipient: {
                    name: offer.clientName,
                    client: offer.clientName,
                    auftraggeber: offer.clientName,
                    address: offer.clientAddress,
                    adresse: offer.clientAddress,
                    city: "",
                    ort: ""
                },
                options: {
                    offerNumber: offer.number,
                    number: offer.number,
                    city: offer.place,
                    place: offer.place,
                    dateISO: new Date().toISOString().slice(0, 10),
                    payment: offer.notes,
                    mwst,
                    showWatermark: false,
                    colorHeader: true,
                    showTableHeader: true,
                    showChapterRows: false
                },
                rows: rows.map((r) => ({
                    id: r.id,
                    posNr: r.posNr,
                    lvPos: r.posNr,
                    text: r.kurztext,
                    kurztext: r.kurztext,
                    title: r.kurztext,
                    langtext: r.langtext,
                    bemerkung: r.bemerkung,
                    einheit: r.einheit,
                    unit: r.einheit,
                    menge: n(r.menge),
                    qty: n(r.menge),
                    preis: n(r.preis),
                    ep: n(r.preis),
                    rabatt: n(r.rabatt),
                    zeilen: lineNet(r),
                    total: lineNet(r),
                    source: r.source || "manual"
                })),
                totals: {
                    netto: summary.netto,
                    subtotal: summary.subtotal,
                    aufschlag: globalMarkup,
                    aufschlagWert: summary.markupValue,
                    mwst,
                    steuer: summary.tax,
                    brutto: summary.brutto
                }
            };
            const res = await fetch("/api/pdf/kalkulation-manuell", {
                method: "POST",
                credentials: "include",
                headers: authJsonHeaders(),
                body: JSON.stringify(payload)
            });
            if (!res.ok) {
                const txt = await res.text().catch(() => "");
                throw new Error(txt || `PDF Fehler (${res.status})`);
            }
            const blob = await res.blob();
            openPdfBlobPreview(blob, pdfFileName, preview);
            setServerStatus("PDF erzeugt");
            setTimeout(() => setServerStatus(""), 1800);
        }
        catch (e) {
            if (preview && !preview.closed)
                preview.close();
            setServerStatus("PDF Fehler");
            alert("PDF Export fehlgeschlagen: " + (e?.message || e));
        }
        finally {
            setPdfBusy(false);
        }
    }
    function goToKi() {
        const payload = {
            source: "rezepte",
            origin: "manuell",
            ts: new Date().toISOString(),
            projectKey,
            rows: rows.map((r) => ({
                posNr: r.posNr,
                pos: r.posNr,
                kurztext: r.kurztext,
                text: r.kurztext,
                langtext: r.langtext,
                einheit: r.einheit,
                unit: r.einheit,
                menge: r.menge,
                qty: r.menge,
                preis: r.preis ?? 0,
                ep: r.preis ?? 0,
                confidence: r.confidence
            }))
        };
        localStorage.setItem(KI_HANDOFF_KEY, JSON.stringify(payload));
        localStorage.setItem(MANUELL_HANDOFF_KEY, JSON.stringify(payload));
        nav(`/kalkulation/mit-ki${projectKey ? `?projectCode=${encodeURIComponent(projectKey)}` : ""}`);
    }
    function goToAngebot() {
        const payload = {
            source: "manuell",
            ts: new Date().toISOString(),
            projectKey,
            offer,
            mwst,
            globalMarkup,
            rows: rows.map((r) => ({
                id: r.id,
                pos: r.posNr,
                posNr: r.posNr,
                text: r.kurztext,
                kurztext: r.kurztext,
                langtext: r.langtext,
                unit: r.einheit,
                einheit: r.einheit,
                qty: r.menge,
                menge: r.menge,
                ep: r.preis ?? 0,
                preis: r.preis ?? 0,
                rabatt: r.rabatt ?? 0
            })),
            summary
        };
        localStorage.setItem(ANGEBOT_HANDOFF_KEY, JSON.stringify(payload));
        sessionStorage.setItem("kalkulation:lastDraft", JSON.stringify(payload));
        nav(`/kalkulation/angebot${projectKey ? `?projectCode=${encodeURIComponent(projectKey)}` : ""}`);
    }
    return (_jsxs("div", { className: rlcClass(null, page), children: [_jsxs("section", { className: rlcClass("rlc-page-hero", heroCard), children: [_jsxs("div", { children: [_jsx("div", { className: rlcClass(null, eyebrow), children: "RLC Manuelle Elite-Kalkulation" }), _jsx("h1", { className: rlcClass(null, title), children: "Kalkulation manuell" }), _jsx("p", { className: rlcClass(null, subtitle), children: "Professionelle manuelle Kalkulation mit Server-Snapshot, CAD-Import, Angebots\u00FCbergabe und direkter Verbindung zur KI-Kalkulation." })] }), _jsxs("div", { className: rlcClass(null, heroActions), children: [_jsx("button", { className: rlcClass(null, btnSecondary), onClick: addRow, children: "+ Position" }), _jsx("button", { className: rlcClass(null, btnSecondary), onClick: handleAddFromCAD, children: "+ aus CAD" }), _jsx("button", { className: rlcClass(null, btnPrimary), onClick: goToKi, disabled: !rows.length, children: "An KI \u00FCbergeben" }), _jsx("button", { className: rlcClass(null, btnPrimary), onClick: goToAngebot, disabled: !rows.length, children: "Angebot erstellen" }), _jsx("button", { className: rlcClass(null, btnSecondary), onClick: saveToServer, disabled: serverBusy || !projectKey, children: "Speichern" }), _jsx("button", { className: rlcClass(null, btnSecondary), onClick: loadFromServer, disabled: serverBusy || !projectKey, children: "Laden" })] }), _jsxs("div", { className: rlcClass(null, heroMeta), children: ["Projekt: ", _jsx("b", { children: projectKey || "—" }), projectName ? _jsxs("span", { children: [" \u00B7 ", projectName] }) : null, serverStatus ? _jsxs("span", { children: [" \u00B7 ", serverStatus] }) : null] })] }), _jsxs("section", { className: rlcClass(null, grid4), children: [_jsx(KpiCard, { label: "Netto gesamt", value: money(summary.netto) }), _jsx(KpiCard, { label: "Brutto gesamt", value: money(summary.brutto) }), _jsx(KpiCard, { label: "Positionen", value: `${summary.total}`, sub: `${summary.coveragePct}% mit EP` }), _jsx(KpiCard, { label: "MwSt / Aufschlag", value: `${mwst}% / ${globalMarkup}%`, sub: `Aufschlag: ${money(summary.markupValue)}` })] }), _jsxs("section", { className: rlcClass(null, card), children: [_jsxs("div", { className: rlcClass(null, sectionHead), children: [_jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "Angebot / Rahmenwerte" }), _jsx("div", { className: rlcClass(null, sectionText), children: "Diese Daten werden f\u00FCr PDF, XLSX, Server-Snapshot und Angebot verwendet." })] }), _jsxs("div", { className: rlcClass(null, exportRow), children: [_jsx("button", { className: rlcClass(null, btnSecondary), onClick: exportCSV, disabled: !rows.length, children: "CSV" }), _jsx("button", { className: rlcClass(null, btnSecondary), onClick: exportXLSX, disabled: !rows.length, children: "XLSX" }), _jsx("button", { className: rlcClass(null, btnSecondary), onClick: exportPDF, disabled: !rows.length || pdfBusy, children: pdfBusy ? "PDF…" : "PDF" }), _jsx("button", { className: rlcClass(null, btnDanger), onClick: clearAll, disabled: !rows.length, children: "Alles l\u00F6schen" })] })] }), _jsxs("div", { className: rlcClass(null, formGrid), children: [_jsx(Field, { label: "Angebot Nr.", children: _jsx("input", { className: rlcClass(null, input), value: offer.number, onChange: (e) => setOffer({ ...offer, number: e.target.value }) }) }), _jsx(Field, { label: "Ort", children: _jsx("input", { className: rlcClass(null, input), value: offer.place, onChange: (e) => setOffer({ ...offer, place: e.target.value }) }) }), _jsx(Field, { label: "Kunde", children: _jsx("input", { className: rlcClass(null, input), value: offer.clientName, onChange: (e) => setOffer({ ...offer, clientName: e.target.value }) }) }), _jsx(Field, { label: "Kundenadresse", children: _jsx("input", { className: rlcClass(null, input), value: offer.clientAddress, onChange: (e) => setOffer({ ...offer, clientAddress: e.target.value }) }) }), _jsx(Field, { label: "MwSt %", children: _jsx("input", { type: "number", className: rlcClass(null, input), value: mwst, onChange: (e) => setMwst(n(e.target.value)) }) }), _jsx(Field, { label: "Globaler Aufschlag %", children: _jsx("input", { type: "number", className: rlcClass(null, input), value: globalMarkup, onChange: (e) => setGlobalMarkup(n(e.target.value)) }) })] }), _jsx("div", { className: "rlc-migrated-pages-kalkulation-manuell-tsx-822", children: _jsx(Field, { label: "Notizen / Zahlungsbedingungen", children: _jsx("textarea", { className: rlcClass(null, { ...input, minHeight: 72 }), value: offer.notes, onChange: (e) => setOffer({ ...offer, notes: e.target.value }) }) }) }), _jsx("input", { ref: fileRef, type: "file", accept: ".csv", onChange: (e) => {
                            const f = e.target.files?.[0];
                            if (f)
                                importCSVFile(f);
                        }, className: "rlc-migrated-pages-kalkulation-manuell-tsx-823" }), _jsx("div", { className: "rlc-migrated-pages-kalkulation-manuell-tsx-824", children: _jsx("button", { className: rlcClass(null, btnSecondary), onClick: () => fileRef.current?.click(), children: "Import CSV" }) })] }), _jsxs("section", { className: rlcClass(null, mainGrid), children: [_jsxs("div", { className: rlcClass(null, card), children: [_jsx("div", { className: rlcClass(null, sectionHead), children: _jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "LV-Positionen \u00B7 manuelle Kalkulation" }), _jsx("div", { className: rlcClass(null, sectionText), children: "Kompakte Haupttabelle. Langtext, Rabatt und Notizen stehen im Detailpanel rechts." })] }) }), _jsx("div", { className: rlcClass(null, tableWrap), children: _jsxs("table", { className: rlcClass(null, table), children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, th), children: "Pos-Nr" }), _jsx("th", { className: rlcClass(null, th), children: "Kurztext" }), _jsx("th", { className: rlcClass(null, th), children: "ME" }), _jsx("th", { className: rlcClass(null, th), children: "Menge" }), _jsx("th", { className: rlcClass(null, th), children: "EP netto" }), _jsx("th", { className: rlcClass(null, th), children: "Rabatt" }), _jsx("th", { className: rlcClass(null, th), children: "Gesamt" }), _jsx("th", { className: rlcClass(null, th), children: "Quelle" }), _jsx("th", { className: rlcClass(null, th) })] }) }), _jsxs("tbody", { children: [rows.map((r) => _jsxs("tr", { className: rlcClass(null, {
                                                        background: selectedRow?.id === r.id ? "#EAF2FF" : "#FFFFFF",
                                                        cursor: "pointer"
                                                    }), onClick: () => setSelectedId(r.id), children: [_jsx("td", { className: rlcClass(null, td), children: _jsx("input", { className: rlcClass(null, { ...cellInput, width: 92 }), value: r.posNr, onChange: (e) => updateRow(r.id, { posNr: e.target.value }) }) }), _jsx("td", { className: rlcClass(null, td), children: _jsx("input", { className: rlcClass(null, { ...cellInput, width: "100%" }), value: r.kurztext, onChange: (e) => updateRow(r.id, { kurztext: e.target.value }) }) }), _jsx("td", { className: rlcClass(null, td), children: _jsx("input", { className: rlcClass(null, { ...cellInput, width: 58 }), value: r.einheit, onChange: (e) => updateRow(r.id, { einheit: e.target.value }) }) }), _jsx("td", { className: rlcClass(null, tdRight), children: _jsx("input", { type: "number", className: rlcClass(null, { ...cellInput, width: 80, textAlign: "right" }), value: r.menge, onChange: (e) => updateRow(r.id, { menge: n(e.target.value) }) }) }), _jsx("td", { className: rlcClass(null, tdRight), children: _jsx("input", { type: "number", className: rlcClass(null, { ...cellInput, width: 90, textAlign: "right" }), value: r.preis ?? 0, onChange: (e) => updateRow(r.id, { preis: n(e.target.value) }) }) }), _jsx("td", { className: rlcClass(null, tdRight), children: _jsx("input", { type: "number", className: rlcClass(null, { ...cellInput, width: 72, textAlign: "right" }), value: r.rabatt ?? 0, onChange: (e) => updateRow(r.id, { rabatt: n(e.target.value) }) }) }), _jsx("td", { className: rlcClass(null, tdRight), children: money(lineNet(r)) }), _jsx("td", { className: rlcClass(null, td), children: _jsx("span", { className: rlcClass(null, badgeNeutral), children: r.source || "manual" }) }), _jsx("td", { className: rlcClass(null, td), children: _jsx("button", { className: rlcClass(null, btnDangerMini), onClick: (e) => {
                                                                    e.stopPropagation();
                                                                    removeRow(r.id);
                                                                }, children: "L\u00F6schen" }) })] }, r.id)), !rows.length ?
                                                    _jsx("tr", { children: _jsx("td", { colSpan: 9, className: rlcClass(null, { ...td, color: "#64748B" }), children: "Keine Positionen vorhanden." }) }) :
                                                    null] })] }) })] }), _jsxs("aside", { className: rlcClass(null, sideCard), children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "Positionsdetails" }), selectedRow ?
                                _jsxs("div", { className: "rlc-migrated-pages-kalkulation-manuell-tsx-825", children: [_jsxs("div", { children: [_jsx("div", { className: rlcClass(null, label), children: "Position" }), _jsxs("div", { className: rlcClass(null, sideTitle), children: [selectedRow.posNr || "—", " \u00B7 ", selectedRow.kurztext || "Ohne Text"] })] }), _jsxs("div", { className: rlcClass(null, sideBadges), children: [_jsx("span", { className: rlcClass(null, badgeOk), children: "Manuell kalkuliert" }), _jsx("span", { className: rlcClass(null, badgeNeutral), children: selectedRow.einheit || "—" })] }), _jsx(Detail, { label: "Menge", value: String(selectedRow.menge ?? 0) }), _jsx(Detail, { label: "EP netto", value: money(selectedRow.preis) }), _jsx(Detail, { label: "Rabatt", value: `${n(selectedRow.rabatt).toFixed(1)} %` }), _jsx(Detail, { label: "Zeilensumme netto", value: money(lineNet(selectedRow)) }), _jsx("div", { className: rlcClass(null, separator) }), _jsx(Field, { label: "Langtext", children: _jsx("textarea", { className: rlcClass(null, { ...input, minHeight: 110 }), value: selectedRow.langtext, onChange: (e) => updateRow(selectedRow.id, { langtext: e.target.value }) }) }), _jsx(Field, { label: "Bemerkung", children: _jsx("textarea", { className: rlcClass(null, { ...input, minHeight: 80 }), value: selectedRow.bemerkung || "", onChange: (e) => updateRow(selectedRow.id, { bemerkung: e.target.value }) }) }), _jsx(Field, { label: "Confidence / Sicherheit", children: _jsx("input", { type: "number", className: rlcClass(null, input), value: selectedRow.confidence ?? "", onChange: (e) => updateRow(selectedRow.id, { confidence: n(e.target.value) }) }) })] }) :
                                _jsx("div", { className: rlcClass(null, muted), children: "Keine Position gew\u00E4hlt." })] })] })] }));
}
/* ================= UI ================= */
function KpiCard({ label, value, sub }) {
    return (_jsxs("div", { className: rlcClass(null, kpiCard), children: [_jsx("div", { className: rlcClass(null, kpiLabel), children: label }), _jsx("div", { className: rlcClass(null, kpiValue), children: value }), sub ? _jsx("div", { className: rlcClass(null, kpiSub), children: sub }) : null] }));
}
function Field({ label: fieldLabel, children }) {
    return (_jsxs("label", { className: "rlc-migrated-pages-kalkulation-manuell-tsx-826", children: [_jsx("span", { className: rlcClass(null, label), children: fieldLabel }), children] }));
}
function Detail({ label: l, value }) {
    return (_jsxs("div", { children: [_jsx("div", { className: rlcClass(null, label), children: l }), _jsx("div", { className: rlcClass(null, detailValue), children: value })] }));
}
/* ================= STYLES ================= */
const page = {
    display: "grid",
    gap: 16,
    padding: 16
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
    opacity: 0.8,
    fontWeight: 700
};
const title = {
    margin: "4px 0",
    fontSize: 30,
    fontWeight: 700
};
const subtitle = {
    margin: 0,
    maxWidth: 850,
    opacity: 0.88,
    lineHeight: 1.55
};
const heroActions = {
    display: "flex",
    gap: 10,
    flexWrap: "wrap"
};
const heroMeta = {
    fontSize: 13,
    opacity: 0.9
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
const sideCard = {
    ...card,
    alignSelf: "start",
    position: "sticky",
    top: 12
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
const label = {
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
    boxSizing: "border-box"
};
const cellInput = {
    border: "1px solid #E5E7EB",
    borderRadius: 8,
    padding: "6px 8px",
    fontSize: 12,
    background: "#FFFFFF",
    boxSizing: "border-box"
};
const mainGrid = {
    display: "grid",
    gridTemplateColumns: "minmax(0,1fr) 370px",
    gap: 16,
    alignItems: "start"
};
const exportRow = {
    display: "flex",
    gap: 8,
    flexWrap: "wrap"
};
const tableWrap = {
    overflowX: "auto",
    border: "1px solid #E5E7EB",
    borderRadius: 12
};
const table = {
    width: "100%",
    minWidth: 980,
    borderCollapse: "collapse"
};
const th = {
    textAlign: "left",
    padding: "10px 9px",
    fontSize: 12,
    color: "#475569",
    background: "#F8FAFC",
    borderBottom: "1px solid #E5E7EB",
    whiteSpace: "nowrap"
};
const td = {
    padding: "8px 9px",
    fontSize: 12,
    borderBottom: "1px solid #F1F5F9",
    verticalAlign: "middle"
};
const tdRight = {
    ...td,
    textAlign: "right",
    whiteSpace: "nowrap"
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
const btnDanger = {
    ...btnBase,
    border: "1px solid #FECACA",
    background: "#FEF2F2",
    color: "#B91C1C"
};
const btnDangerMini = {
    border: "1px solid #FECACA",
    background: "#FEF2F2",
    color: "#B91C1C",
    borderRadius: 8,
    padding: "6px 9px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer"
};
const badgeNeutral = {
    display: "inline-flex",
    border: "1px solid #CBD5E1",
    background: "#F8FAFC",
    color: "#475569",
    borderRadius: 999,
    padding: "4px 9px",
    fontSize: 11,
    fontWeight: 700
};
const badgeOk = {
    ...badgeNeutral,
    border: "1px solid #BBF7D0",
    background: "#F0FDF4",
    color: "#15803D"
};
const sideTitle = {
    marginTop: 4,
    fontSize: 15,
    fontWeight: 700,
    color: "#0F172A",
    lineHeight: 1.35
};
const sideBadges = {
    display: "flex",
    gap: 8,
    flexWrap: "wrap"
};
const separator = {
    height: 1,
    background: "#E5E7EB"
};
const detailValue = {
    marginTop: 4,
    color: "#0F172A",
    fontWeight: 600,
    fontSize: 13
};
const muted = {
    color: "#64748B",
    fontSize: 13
};
