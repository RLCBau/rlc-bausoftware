import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/kalkulation/ImportPage.tsx
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LV } from "./store.lv";
import { useProject } from "../../store/useProject";
function uid() {
    try {
        return crypto.randomUUID();
    }
    catch {
        return `imp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
}
function getProjectKey(projectCtx) {
    const p = projectCtx?.project ||
        projectCtx?.currentProject ||
        projectCtx?.selectedProject ||
        projectCtx?.current ||
        projectCtx;
    return String(p?.code ||
        p?.projectCode ||
        p?.number ||
        projectCtx?.projectCode ||
        p?.id ||
        projectCtx?.projectId ||
        "").trim();
}
function detectType(fileName) {
    const n = fileName.toLowerCase();
    if (/\.(x80|x81|x82|x83|x84|x85|x86|x94|p81|p82|p83|p84|p85|p86|d81|d82|d83|d84|d85|d86|gaeb|xml)$/i.test(n)) {
        return "GAEB";
    }
    if (n.endsWith(".csv"))
        return "CSV";
    if (n.endsWith(".xlsx") || n.endsWith(".xls"))
        return "LV";
    if (n.endsWith(".dxf") || n.endsWith(".dwg") || n.endsWith(".landxml"))
        return "CAD";
    return "UNKNOWN";
}
function csvEscape(value) {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
}
export default function ImportPage() {
    const nav = useNavigate();
    const projectCtx = useProject();
    const projectKey = getProjectKey(projectCtx);
    const fileRef = useRef(null);
    const [busy, setBusy] = useState(false);
    const [logs, setLogs] = useState([]);
    const [info, setInfo] = useState("");
    function addLog(log) {
        setLogs((prev) => [
            {
                id: uid(),
                createdAt: new Date().toLocaleString("de-DE"),
                ...log
            },
            ...prev
        ]);
    }
    async function handleFiles(files) {
        if (!files?.length)
            return;
        setBusy(true);
        setInfo("");
        for (const file of Array.from(files)) {
            const type = detectType(file.name);
            try {
                if (type === "CSV") {
                    const text = await file.text();
                    const count = LV.importCSV(text);
                    addLog({
                        type,
                        fileName: file.name,
                        count,
                        status: "ok",
                        message: `${count} Positionen lokal ins LV importiert.`
                    });
                    setInfo(`CSV importiert: ${count} Positionen.`);
                    continue;
                }
                if (type === "GAEB") {
                    if (!projectKey) {
                        addLog({
                            type,
                            fileName: file.name,
                            count: 0,
                            status: "error",
                            message: "Projekt fehlt. GAEB-Import benötigt ein aktives Projekt."
                        });
                        continue;
                    }
                    const form = new FormData();
                    form.append("file", file);
                    const res = await fetch(`/api/project-lv/${encodeURIComponent(projectKey)}/import-file`, {
                        method: "POST",
                        body: form,
                        credentials: "include"
                    });
                    const json = await res.json().catch(() => null);
                    if (!res.ok) {
                        throw new Error(json?.error || `Serverfehler ${res.status}`);
                    }
                    const rows = json?.rows ||
                        json?.items ||
                        json?.positions ||
                        json?.data?.rows ||
                        json?.data?.items ||
                        [];
                    const mapped = Array.isArray(rows) ?
                        rows.map((r) => ({
                            id: uid(),
                            posNr: String(r.posNr ?? r.pos ?? r.position ?? r.positionsnummer ?? ""),
                            parentPosNr: String(r.parentPosNr ?? ""),
                            kurztext: String(r.kurztext ?? r.shortText ?? r.text ?? ""),
                            langtext: String(r.langtext ?? r.longText ?? r.description ?? ""),
                            bemerkung: String(r.bemerkung ?? r.note ?? ""),
                            einheit: String(r.einheit ?? r.unit ?? r.me ?? ""),
                            menge: Number(r.menge ?? r.quantity ?? r.qty ?? 0),
                            preis: r.preis != null || r.ep != null ?
                                Number(r.preis ?? r.ep) :
                                undefined,
                            gesamt: r.gesamt != null || r.total != null ?
                                Number(r.gesamt ?? r.total) :
                                undefined,
                            waehrung: String(r.waehrung ?? r.currency ?? "EUR"),
                            confidence: r.confidence != null ? Number(r.confidence) : undefined,
                            source: "gaeb"
                        })) :
                        [];
                    if (mapped.length) {
                        LV.bulkUpsert(mapped);
                    }
                    addLog({
                        type,
                        fileName: file.name,
                        count: mapped.length,
                        status: mapped.length ? "ok" : "warning",
                        message: mapped.length ?
                            `${mapped.length} GAEB-Positionen übernommen.` :
                            "GAEB erkannt, aber keine Positionen zurückgegeben."
                    });
                    setInfo(`GAEB verarbeitet: ${mapped.length} Positionen.`);
                    continue;
                }
                addLog({
                    type,
                    fileName: file.name,
                    count: 0,
                    status: "warning",
                    message: "Dateityp erkannt, aber dieser Import läuft über das Spezialmodul."
                });
            }
            catch (e) {
                addLog({
                    type,
                    fileName: file.name,
                    count: 0,
                    status: "error",
                    message: e?.message || String(e)
                });
            }
        }
        setBusy(false);
        if (fileRef.current)
            fileRef.current.value = "";
    }
    function exportLogCsv() {
        const head = "Datum;Typ;Datei;Anzahl;Status;Meldung";
        const body = logs.
            map((l) => [
            csvEscape(l.createdAt),
            csvEscape(l.type),
            csvEscape(l.fileName),
            csvEscape(l.count),
            csvEscape(l.status),
            csvEscape(l.message)
        ].
            join(";")).
            join("\n");
        const blob = new Blob([`${head}\n${body}`], {
            type: "text/csv;charset=utf-8"
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "rlc_import_log.csv";
        a.click();
        URL.revokeObjectURL(url);
    }
    return (_jsxs("div", { className: rlcClass(null, page), children: [_jsxs("section", { className: rlcClass("rlc-page-hero", hero), children: [_jsxs("div", { children: [_jsx("div", { className: rlcClass(null, eyebrow), children: "RLC Kalkulation" }), _jsx("h1", { className: rlcClass(null, title), children: "Import-Zentrale" }), _jsx("p", { className: rlcClass(null, subtitle), children: "Zentrale Importseite f\u00FCr GAEB, CSV, LV-Dateien, Preise und CAD-Daten. Importierte LV-Positionen werden direkt mit der Kalkulation verbunden." })] }), _jsxs("div", { className: rlcClass(null, heroActions), children: [_jsx("button", { className: rlcClass(null, btnPrimary), onClick: () => fileRef.current?.click(), disabled: busy, children: busy ? "Import läuft…" : "Dateien importieren" }), _jsx("button", { className: rlcClass(null, btnSecondary), onClick: () => nav("/kalkulation/gaeb"), children: "GAEB Spezialimport" }), _jsx("button", { className: rlcClass(null, btnSecondary), onClick: () => nav("/kalkulation/lv-upload"), children: "LV hochladen / erstellen" }), _jsx("button", { className: rlcClass(null, btnSecondary), onClick: () => nav("/kalkulation/preise"), children: "Preise einf\u00FCgen" })] }), _jsxs("div", { className: rlcClass(null, meta), children: ["Projekt: ", _jsx("b", { children: projectKey || "—" }), info ? _jsxs("span", { children: [" \u00B7 ", info] }) : null] }), _jsx("input", { ref: fileRef, type: "file", multiple: true, accept: ".csv,.xlsx,.xls,.xml,.x80,.x81,.x82,.x83,.x84,.x85,.x86,.x94,.p81,.p82,.p83,.p84,.p85,.p86,.d81,.d82,.d83,.d84,.d85,.d86,.gaeb,.dxf,.dwg,.landxml", onChange: (e) => handleFiles(e.target.files), className: "rlc-migrated-pages-kalkulation-importpage-tsx-821" })] }), _jsxs("section", { className: rlcClass(null, grid), children: [_jsx(ImportCard, { title: "GAEB", text: "X83, X84, X86, P83, D83 und XML projektbezogen importieren.", action: "GAEB \u00F6ffnen", onClick: () => nav("/kalkulation/gaeb") }), _jsx(ImportCard, { title: "CSV / LV", text: "Einfache Positionslisten \u00FCbernehmen und in Manuell oder KI weiterbearbeiten.", action: "LV \u00F6ffnen", onClick: () => nav("/kalkulation/lv-upload") }), _jsx(ImportCard, { title: "Preise", text: "Material, Arbeiter und Maschinen in den Katalog oder Firmenpreise \u00FCbernehmen.", action: "Preise \u00F6ffnen", onClick: () => nav("/kalkulation/preise") }), _jsx(ImportCard, { title: "KI-Kalkulation", text: "Importierte Positionen direkt mit Elite-KI kalkulieren.", action: "KI \u00F6ffnen", onClick: () => nav("/kalkulation/mit-ki") })] }), _jsxs("section", { className: rlcClass(null, card), children: [_jsxs("div", { className: rlcClass(null, sectionHead), children: [_jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "Import-Protokoll" }), _jsx("div", { className: rlcClass(null, sectionText), children: "\u00DCbersicht der letzten Importvorg\u00E4nge dieser Sitzung." })] }), _jsx("button", { className: rlcClass(null, btnSecondary), onClick: exportLogCsv, disabled: !logs.length, children: "Protokoll CSV" })] }), _jsx("div", { className: rlcClass(null, tableWrap), children: _jsxs("table", { className: rlcClass(null, table), children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, th), children: "Datum" }), _jsx("th", { className: rlcClass(null, th), children: "Typ" }), _jsx("th", { className: rlcClass(null, th), children: "Datei" }), _jsx("th", { className: rlcClass(null, th), children: "Positionen" }), _jsx("th", { className: rlcClass(null, th), children: "Status" }), _jsx("th", { className: rlcClass(null, th), children: "Meldung" })] }) }), _jsxs("tbody", { children: [logs.map((l) => _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, td), children: l.createdAt }), _jsx("td", { className: rlcClass(null, td), children: l.type }), _jsx("td", { className: rlcClass(null, td), children: l.fileName }), _jsx("td", { className: rlcClass(null, tdRight), children: l.count }), _jsx("td", { className: rlcClass(null, td), children: _jsx("span", { className: rlcClass(null, l.status === "ok" ?
                                                            badgeOk :
                                                            l.status === "warning" ?
                                                                badgeWarn :
                                                                badgeError), children: l.status }) }), _jsx("td", { className: rlcClass(null, td), children: l.message })] }, l.id)), !logs.length ?
                                            _jsx("tr", { children: _jsx("td", { colSpan: 6, className: rlcClass(null, { ...td, color: "#64748B" }), children: "Noch kein Import durchgef\u00FChrt." }) }) :
                                            null] })] }) })] })] }));
}
function ImportCard({ title, text, action, onClick }) {
    return (_jsxs("div", { className: rlcClass(null, card), children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: title }), _jsx("div", { className: rlcClass(null, sectionText), children: text }), _jsx("button", { className: rlcClass(null, { ...btnSecondary, marginTop: 14 }), onClick: onClick, children: action })] }));
}
/* ================= STYLES ================= */
const page = {
    display: "grid",
    gap: 16,
    padding: 16
};
const hero = {
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
    opacity: 0.9,
    lineHeight: 1.55
};
const heroActions = {
    display: "flex",
    gap: 10,
    flexWrap: "wrap"
};
const meta = {
    fontSize: 13,
    opacity: 0.9
};
const grid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))",
    gap: 12
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
    color: "#64748B",
    lineHeight: 1.5
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
const tableWrap = {
    overflow: "auto",
    border: "1px solid #E5E7EB",
    borderRadius: 12
};
const table = {
    width: "100%",
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
    textAlign: "right"
};
const badgeBase = {
    display: "inline-flex",
    borderRadius: 999,
    padding: "4px 9px",
    fontSize: 11,
    fontWeight: 700
};
const badgeOk = {
    ...badgeBase,
    border: "1px solid #BBF7D0",
    background: "#F0FDF4",
    color: "#15803D"
};
const badgeWarn = {
    ...badgeBase,
    border: "1px solid #FDE68A",
    background: "#FFFBEB",
    color: "#B45309"
};
const badgeError = {
    ...badgeBase,
    border: "1px solid #FECACA",
    background: "#FEF2F2",
    color: "#B91C1C"
};
