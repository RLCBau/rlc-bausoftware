import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
import { savePdfWithCompanyHeader as saveRlcPdfWithCompanyHeader } from "../../lib/pdf/companyPdfHeader";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { LV } from "./store.lv";
import { useProject } from "../../store/useProject";
const API = import.meta?.env?.VITE_API_URL ||
    import.meta?.env?.VITE_BACKEND_URL ||
    "";
function apiUrl(path) {
    const base = String(API || "").replace(/\/+$/, "");
    const p = path.startsWith("/") ? path : `/${path}`;
    return base ? `${base}${p}` : p;
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
            if (value?.trim())
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
function safeId() {
    try {
        return crypto.randomUUID();
    }
    catch {
        return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
}
function n(value, fallback = 0) {
    if (value === null || value === undefined || value === "")
        return fallback;
    const raw = String(value).
        trim().
        replace(/\s/g, "").
        replace(/\.(?=\d{3}(?:[.,]|$))/g, "").
        replace(",", ".");
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
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
function num(value, digits = 3) {
    return new Intl.NumberFormat("de-DE", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    }).format(n(value));
}
function pct(value) {
    return new Intl.NumberFormat("de-DE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(n(value));
}
function todayDE() {
    return new Date().toLocaleDateString("de-DE");
}
function safeFileName(value) {
    return String(value || "Projekt").
        replace(/[^\w.-]+/g, "_").
        replace(/_+/g, "_").
        slice(0, 120);
}
function applyRound(value, mode) {
    if (mode === "kein")
        return value;
    if (mode === "2")
        return round2(value);
    if (mode === "0_05")
        return round2(Math.round(value / 0.05) * 0.05);
    if (mode === "0_1")
        return round2(Math.round(value * 10) / 10);
    if (mode === "1")
        return Math.round(value);
    return value;
}
function getProject(projectCtx) {
    return (projectCtx?.project ||
        projectCtx?.currentProject ||
        projectCtx?.selectedProject ||
        projectCtx?.current ||
        projectCtx ||
        null);
}
function getProjectKey(projectCtx) {
    const project = getProject(projectCtx);
    return String(project?.code ||
        project?.number ||
        project?.projectCode ||
        project?.projektnummer ||
        projectCtx?.projectCode ||
        project?.id ||
        projectCtx?.projectId ||
        "").
        trim().
        toUpperCase();
}
function getProjectName(projectCtx) {
    const project = getProject(projectCtx);
    return String(project?.name || project?.projectName || "Projekt").trim();
}
function getProjectTitle(projectCtx) {
    const key = getProjectKey(projectCtx);
    const name = getProjectName(projectCtx);
    if (!key)
        return "Kein Projekt gewählt";
    return `${key} — ${name}`;
}
function fromLvRows(rows) {
    return rows.
        filter((r) => {
        const pos = String(r.posNr || "").trim();
        const text = String(r.kurztext || r.langtext || "").trim();
        const unit = String(r.einheit || "").trim();
        const qty = n(r.menge);
        const ep = n(r.preis);
        if (!pos && !text && !unit && qty === 0 && ep === 0)
            return false;
        if (pos.toUpperCase().startsWith("BA-"))
            return false;
        return true;
    }).
        map((r) => {
        const ep = n(r.preis);
        const menge = n(r.menge);
        return {
            id: String(r.id || safeId()),
            posNr: String(r.posNr || ""),
            kurztext: String(r.kurztext || ""),
            langtext: String(r.langtext || ""),
            einheit: String(r.einheit || ""),
            menge,
            epAlt: ep,
            epNeu: ep,
            epOverride: null,
            gpAlt: round2(menge * ep),
            gpNeu: round2(menge * ep),
            checked: false
        };
    });
}
function toLvRow(row) {
    return {
        id: row.id,
        posNr: row.posNr,
        kurztext: row.kurztext,
        langtext: row.langtext || "",
        einheit: row.einheit,
        menge: row.menge,
        preis: row.epNeu,
        gesamt: round2(row.menge * row.epNeu),
        waehrung: "EUR"
    };
}
function splitCsvLine(line, sep = ";") {
    const out = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        const next = line[i + 1];
        if (ch === '"') {
            if (inQuotes && next === '"') {
                cur += '"';
                i += 1;
            }
            else {
                inQuotes = !inQuotes;
            }
            continue;
        }
        if (ch === sep && !inQuotes) {
            out.push(cur);
            cur = "";
            continue;
        }
        cur += ch;
    }
    out.push(cur);
    return out;
}
function parseCSV(text) {
    const content = String(text || "").replace(/^\uFEFF/, "").trim();
    if (!content)
        return [];
    const lines = content.split(/\r?\n/).filter((line) => line.trim());
    if (!lines.length)
        return [];
    const sep = lines[0].includes(";") ? ";" : ",";
    const headers = splitCsvLine(lines[0], sep).map((h) => h.trim().toLowerCase().replace(/\s+/g, ""));
    const idx = (names) => headers.findIndex((h) => names.includes(h));
    const iPos = idx(["posnr", "positionsnummer", "pos", "position"]);
    const iKurz = idx(["kurztext", "kurz", "text", "bezeichnung"]);
    const iLang = idx(["langtext", "beschreibung"]);
    const iMe = idx(["me", "einheit", "eh", "unit"]);
    const iMenge = idx(["menge", "qty", "quantity"]);
    const iEp = idx(["ep", "einheitspreis", "preis", "preisep", "epnetto"]);
    const hasHeader = iPos >= 0 || iKurz >= 0 || iEp >= 0;
    const body = hasHeader ? lines.slice(1) : lines;
    return body.
        map((line) => {
        const c = splitCsvLine(line, sep);
        const ep = n(iEp >= 0 ? c[iEp] : c[4]);
        const menge = n(iMenge >= 0 ? c[iMenge] : c[3]);
        return {
            id: safeId(),
            posNr: String(iPos >= 0 ? c[iPos] ?? "" : c[0] ?? "").trim(),
            kurztext: String(iKurz >= 0 ? c[iKurz] ?? "" : c[1] ?? "").trim(),
            langtext: String(iLang >= 0 ? c[iLang] ?? "" : "").trim(),
            einheit: String(iMe >= 0 ? c[iMe] ?? "" : c[2] ?? "").trim(),
            menge,
            epAlt: ep,
            epNeu: ep,
            epOverride: null,
            gpAlt: round2(menge * ep),
            gpNeu: round2(menge * ep),
            checked: false
        };
    }).
        filter((r) => r.posNr || r.kurztext || r.einheit || r.menge || r.epAlt);
}
function toCSV(rows) {
    const header = [
        "PosNr",
        "Kurztext",
        "Langtext",
        "ME",
        "Menge",
        "EP alt",
        "GP alt",
        "EP neu",
        "GP neu",
        "Differenz",
        "Differenz %"
    ];
    const body = rows.map((r) => {
        const diff = r.gpNeu - r.gpAlt;
        const pctValue = r.gpAlt ? diff / r.gpAlt * 100 : 0;
        return [
            r.posNr,
            r.kurztext,
            r.langtext || "",
            r.einheit,
            String(r.menge).replace(".", ","),
            String(r.epAlt).replace(".", ","),
            String(r.gpAlt).replace(".", ","),
            String(r.epNeu).replace(".", ","),
            String(r.gpNeu).replace(".", ","),
            String(round2(diff)).replace(".", ","),
            String(round2(pctValue)).replace(".", ",")
        ].
            map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).
            join(";");
    });
    return [header.join(";"), ...body].join("\n");
}
function recalc(rows, params) {
    const q = params.filterQuery.trim().toLowerCase();
    return rows.map((row) => {
        const matchesFilter = !q ||
            row.posNr.toLowerCase().includes(q) ||
            row.kurztext.toLowerCase().includes(q) ||
            row.langtext.toLowerCase().includes(q);
        const shouldChange = (!params.nurMarkierte || row.checked) && (!params.nurPreisGroesser0 || row.epAlt > 0) &&
            matchesFilter;
        let epNeu = row.epAlt;
        if (typeof row.epOverride === "number" && Number.isFinite(row.epOverride)) {
            epNeu = row.epOverride;
        }
        else if (shouldChange) {
            if (params.mode === "aufschlag")
                epNeu = epNeu * (1 + params.value / 100);
            if (params.mode === "rabatt")
                epNeu = epNeu * (1 - params.value / 100);
            if (params.mode === "ziel_ep")
                epNeu = params.value;
            if (typeof params.minEP === "number" && epNeu < params.minEP) {
                epNeu = params.minEP;
            }
            epNeu = applyRound(epNeu, params.runden);
        }
        return {
            ...row,
            epNeu,
            gpAlt: round2(row.menge * row.epAlt),
            gpNeu: round2(row.menge * epNeu)
        };
    });
}
function exportPdfReport(rows, summary, projectKey, projectName, params) {
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const marginX = 12;
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageW, 14, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(19);
    doc.setTextColor(15, 23, 42);
    doc.text("Preisaufschlag / Rabatt", marginX, 28);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    doc.text(`Projekt: ${projectKey || "—"}${projectName ? " · " + projectName : ""}`, marginX, 36);
    doc.text(`Datum: ${todayDE()}`, pageW - marginX, 36, { align: "right" });
    const modeLabel = params.mode === "aufschlag" ?
        `Aufschlag ${pct(params.value)} %` :
        params.mode === "rabatt" ?
            `Rabatt ${pct(params.value)} %` :
            `Ziel-EP ${money(params.value)}`;
    doc.text(`Regel: ${modeLabel} · Rundung: ${params.runden} · Min-EP: ${params.minEP == null ? "—" : money(params.minEP)}`, marginX, 43);
    const kpiY = 54;
    const kpiH = 22;
    const gap = 4;
    const boxW = (pageW - marginX * 2 - gap * 5) / 6;
    const kpis = [
        ["Summe alt", money(summary.alt)],
        ["Summe neu", money(summary.neu)],
        ["Differenz", money(summary.diff)],
        ["Differenz %", `${pct(summary.diffPct)} %`],
        ["Geändert", `${summary.changed}/${summary.count}`],
        ["Markiert", String(summary.marked)]
    ];
    kpis.forEach(([label, value], i) => {
        const x = marginX + i * (boxW + gap);
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(x, kpiY, boxW, kpiH, 3, 3, "FD");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.2);
        doc.setTextColor(100, 116, 139);
        doc.text(label, x + 3, kpiY + 7);
        doc.setFontSize(10);
        doc.setTextColor(15, 23, 42);
        doc.text(value, x + 3, kpiY + 16, { maxWidth: boxW - 6 });
    });
    autoTable(doc, {
        startY: 86,
        margin: { left: marginX, right: marginX },
        theme: "grid",
        head: [
            [
                "PosNr",
                "Kurztext",
                "ME",
                "Menge",
                "EP alt",
                "EP neu",
                "GP alt",
                "GP neu",
                "Diff.",
                "%"
            ]
        ],
        body: rows.map((r) => {
            const diff = r.gpNeu - r.gpAlt;
            const diffPct = r.gpAlt ? diff / r.gpAlt * 100 : 0;
            return [
                r.posNr || "—",
                [r.kurztext || "—", r.langtext ? r.langtext : ""].filter(Boolean).join("\n"),
                r.einheit || "—",
                num(r.menge),
                money(r.epAlt),
                money(r.epNeu),
                money(r.gpAlt),
                money(r.gpNeu),
                money(diff),
                `${pct(diffPct)} %`
            ];
        }),
        styles: {
            font: "helvetica",
            fontSize: 7.3,
            cellPadding: 1.6,
            overflow: "linebreak",
            lineColor: [226, 232, 240],
            lineWidth: 0.1,
            valign: "middle"
        },
        headStyles: {
            fillColor: [30, 64, 175],
            textColor: [255, 255, 255],
            fontStyle: "bold"
        },
        alternateRowStyles: {
            fillColor: [248, 250, 252]
        },
        columnStyles: {
            0: { cellWidth: 24 },
            1: { cellWidth: 70 },
            2: { cellWidth: 13, halign: "center" },
            3: { cellWidth: 24, halign: "right" },
            4: { cellWidth: 24, halign: "right" },
            5: { cellWidth: 24, halign: "right" },
            6: { cellWidth: 25, halign: "right" },
            7: { cellWidth: 25, halign: "right" },
            8: { cellWidth: 25, halign: "right" },
            9: { cellWidth: 17, halign: "right" }
        },
        didParseCell: (data) => {
            if (data.section !== "body")
                return;
            if (data.column.index !== 8 && data.column.index !== 9)
                return;
            const row = rows[data.row.index];
            const diff = row.gpNeu - row.gpAlt;
            if (diff > 0) {
                data.cell.styles.textColor = [21, 128, 61];
                data.cell.styles.fontStyle = "bold";
            }
            if (diff < 0) {
                data.cell.styles.textColor = [185, 28, 28];
                data.cell.styles.fontStyle = "bold";
            }
        }
    });
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i += 1) {
        doc.setPage(i);
        doc.setDrawColor(226, 232, 240);
        doc.line(marginX, pageH - 12, pageW - marginX, pageH - 12);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text("RLC Bausoftware · Preisaufschlag / Rabatt", marginX, pageH - 7);
        doc.text(`Seite ${i}/${pages}`, pageW - marginX, pageH - 7, {
            align: "right"
        });
    }
    saveRlcPdfWithCompanyHeader(doc, `Preisaufschlag_${safeFileName(projectKey || "Projekt")}.pdf`);
}
export default function AufschlagPage() {
    const nav = useNavigate();
    const projectCtx = useProject();
    const projectKey = getProjectKey(projectCtx);
    const projectTitle = getProjectTitle(projectCtx);
    const projectName = getProjectName(projectCtx);
    const [rows, setRows] = useState(() => fromLvRows(LV.list()));
    const [params, setParams] = useState({
        mode: "aufschlag",
        value: 10,
        nurMarkierte: false,
        runden: "2",
        minEP: undefined,
        nurPreisGroesser0: true,
        filterQuery: "",
        nurGeaenderte: false
    });
    const [info, setInfo] = useState("");
    const [busy, setBusy] = useState(false);
    const fileRef = useRef(null);
    useEffect(() => {
        setRows(fromLvRows(LV.list()));
    }, []);
    const calculated = useMemo(() => recalc(rows, params), [rows, params]);
    const visibleRows = useMemo(() => {
        const q = params.filterQuery.trim().toLowerCase();
        let result = calculated;
        if (q) {
            result = result.filter((r) => r.posNr.toLowerCase().includes(q) ||
                r.kurztext.toLowerCase().includes(q) ||
                r.langtext.toLowerCase().includes(q));
        }
        if (params.nurGeaenderte) {
            result = result.filter((r) => round2(r.epAlt) !== round2(r.epNeu));
        }
        return result;
    }, [calculated, params.filterQuery, params.nurGeaenderte]);
    const summary = useMemo(() => {
        const alt = calculated.reduce((s, r) => s + r.gpAlt, 0);
        const neu = calculated.reduce((s, r) => s + r.gpNeu, 0);
        const diff = neu - alt;
        const changed = calculated.filter((r) => round2(r.epAlt) !== round2(r.epNeu)).length;
        const marked = rows.filter((r) => r.checked).length;
        return {
            alt: round2(alt),
            neu: round2(neu),
            diff: round2(diff),
            diffPct: alt ? round2(diff / alt * 100) : 0,
            changed,
            marked,
            count: rows.length
        };
    }, [calculated, rows]);
    function toggleAll(checked) {
        setRows((prev) => prev.map((r) => ({ ...r, checked })));
    }
    function importFromLv() {
        setRows(fromLvRows(LV.list()));
        setInfo("LV-Daten neu geladen.");
        setTimeout(() => setInfo(""), 2200);
    }
    function importCsvText(text) {
        const parsed = parseCSV(text);
        setRows(parsed);
        setInfo(`CSV importiert: ${parsed.length.toLocaleString("de-DE")} Positionen.`);
        setTimeout(() => setInfo(""), 2600);
    }
    function downloadCsv() {
        const blob = new Blob([toCSV(calculated)], {
            type: "text/csv;charset=utf-8"
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Preisaufschlag_${safeFileName(projectKey || "Projekt")}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }
    function resetManualOverrides() {
        setRows((prev) => prev.map((r) => ({ ...r, epOverride: null })));
        setInfo("Manuelle EP-Änderungen wurden zurückgesetzt.");
        setTimeout(() => setInfo(""), 2200);
    }
    async function saveToLvAndServer() {
        if (!calculated.length)
            return;
        setBusy(true);
        setInfo("Speichere neue Preise …");
        try {
            const lvRows = calculated.map(toLvRow);
            LV.bulkUpsert(lvRows);
            if (!projectKey) {
                setInfo("Lokal ins LV übernommen. Kein Projekt gewählt für Server-Speicherung.");
                return;
            }
            const payloadItems = lvRows.
                filter((r) => String(r.posNr || "").trim()).
                map((r) => ({
                pos: r.posNr,
                text: r.kurztext,
                langtext: r.langtext || "",
                unit: r.einheit,
                quantity: n(r.menge),
                ep: r.preis == null ? null : n(r.preis)
            }));
            const res = await fetch(apiUrl(`/api/project-lv/${encodeURIComponent(projectKey)}/import`), {
                method: "POST",
                credentials: "include",
                headers: withAuthHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify({
                    title: `LV ${projectKey} - Preisaufschlag`,
                    currency: "EUR",
                    items: payloadItems
                })
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(json?.error || `Serverfehler ${res.status}`);
            }
            setRows(fromLvRows(LV.list()));
            setInfo(`Gespeichert: ${lvRows.length.toLocaleString("de-DE")} Positionen lokal und am Server.`);
        }
        catch (e) {
            setInfo(`Lokal gespeichert, aber Server-Fehler: ${e?.message || e}`);
        }
        finally {
            setBusy(false);
        }
    }
    return (_jsxs("div", { className: rlcClass(null, page), children: [_jsxs("section", { className: rlcClass("rlc-page-hero", heroCard), children: [_jsxs("div", { children: [_jsx("div", { className: rlcClass(null, eyebrow), children: "RLC Elite Preissteuerung" }), _jsx("h1", { className: rlcClass(null, title), children: "Preisaufschlag / Rabatt" }), _jsx("p", { className: rlcClass(null, subtitle), children: "Preise zentral anpassen, runden, manuell \u00FCberschreiben, professionell auswerten und anschlie\u00DFend direkt ins LV \u00FCbernehmen." })] }), _jsxs("div", { className: rlcClass(null, heroActions), children: [_jsx("button", { className: rlcClass(null, btnSecondary), onClick: importFromLv, children: "LV neu laden" }), _jsx("button", { className: rlcClass(null, btnSecondary), onClick: () => fileRef.current?.click(), children: "CSV Import" }), _jsx("button", { className: rlcClass(null, btnSecondary), onClick: downloadCsv, disabled: !rows.length, children: "CSV Export" }), _jsx("button", { className: rlcClass(null, btnSecondary), onClick: () => exportPdfReport(visibleRows, summary, projectKey, projectName, params), disabled: !visibleRows.length, children: "PDF Report" }), _jsx("button", { className: rlcClass(null, btnPrimary), onClick: saveToLvAndServer, disabled: !rows.length || busy, children: busy ? "Speichere…" : "Ins LV übernehmen" }), _jsx("button", { className: rlcClass(null, btnSecondary), onClick: () => nav("/kalkulation/manuell"), children: "Manuell" }), _jsx("button", { className: rlcClass(null, btnSecondary), onClick: () => nav("/kalkulation/mit-ki"), children: "KI" }), _jsx("button", { className: rlcClass(null, btnSecondary), onClick: () => nav("/kalkulation/angebot"), children: "Angebot" })] }), _jsxs("div", { className: rlcClass(null, heroMeta), children: ["Projekt: ", _jsx("b", { children: projectTitle }), " \u00B7 Server-Key: ", _jsx("b", { children: projectKey || "—" }), info ? _jsxs("span", { children: [" \u00B7 ", info] }) : null] }), _jsx("input", { ref: fileRef, type: "file", accept: ".csv,text/csv", onChange: (e) => {
                            const f = e.target.files?.[0];
                            if (!f)
                                return;
                            const reader = new FileReader();
                            reader.onload = () => {
                                importCsvText(String(reader.result || ""));
                                if (fileRef.current)
                                    fileRef.current.value = "";
                            };
                            reader.readAsText(f, "utf-8");
                        }, className: "rlc-migrated-pages-kalkulation-aufschlag-tsx-853" })] }), _jsxs("section", { className: rlcClass(null, grid4), children: [_jsx(KpiCard, { label: "Summe alt", value: money(summary.alt) }), _jsx(KpiCard, { label: "Summe neu", value: money(summary.neu) }), _jsx(KpiCard, { label: "Differenz", value: money(summary.diff), sub: `${pct(summary.diffPct)} %`, danger: summary.diff < 0 }), _jsx(KpiCard, { label: "Ge\u00E4ndert", value: `${summary.changed}/${summary.count}`, sub: `${summary.marked} markiert` })] }), _jsxs("section", { className: rlcClass(null, card), children: [_jsx("div", { className: rlcClass(null, sectionHead), children: _jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "Regeln & Filter" }), _jsx("div", { className: rlcClass(null, sectionText), children: "Preis\u00E4nderung wird live berechnet. Einzelne EP k\u00F6nnen direkt in der Vorschau manuell \u00FCberschrieben werden." })] }) }), _jsxs("div", { className: rlcClass(null, ruleGrid), children: [_jsx(Field, { label: "Modus", children: _jsxs("select", { value: params.mode, onChange: (e) => setParams({ ...params, mode: e.target.value }), className: rlcClass(null, input), children: [_jsx("option", { value: "aufschlag", children: "Aufschlag (%)" }), _jsx("option", { value: "rabatt", children: "Rabatt (%)" }), _jsx("option", { value: "ziel_ep", children: "Ziel-EP fix" })] }) }), _jsx(Field, { label: params.mode === "ziel_ep" ? "Ziel-EP €" : "Wert %", children: _jsx("input", { type: "number", step: "0.01", value: params.value, onChange: (e) => setParams({ ...params, value: n(e.target.value) }), className: rlcClass(null, input) }) }), _jsx(Field, { label: "Rundung", children: _jsxs("select", { value: params.runden, onChange: (e) => setParams({ ...params, runden: e.target.value }), className: rlcClass(null, input), children: [_jsx("option", { value: "2", children: "2 Nachkommastellen" }), _jsx("option", { value: "0_05", children: "auf 0,05 \u20AC" }), _jsx("option", { value: "0_1", children: "auf 0,10 \u20AC" }), _jsx("option", { value: "1", children: "auf 1 \u20AC" }), _jsx("option", { value: "kein", children: "keine Rundung" })] }) }), _jsx(Field, { label: "Min-EP \u20AC", children: _jsx("input", { type: "number", step: "0.01", value: params.minEP ?? "", onChange: (e) => setParams({
                                        ...params,
                                        minEP: e.target.value === "" ? undefined : n(e.target.value)
                                    }), className: rlcClass(null, input), placeholder: "optional" }) }), _jsx(Field, { label: "Suche", children: _jsx("input", { placeholder: "PosNr / Kurztext / Langtext", value: params.filterQuery, onChange: (e) => setParams({ ...params, filterQuery: e.target.value }), className: rlcClass(null, input) }) })] }), _jsxs("div", { className: rlcClass(null, buttonRow), children: [_jsxs("label", { className: rlcClass(null, checkLabel), children: [_jsx("input", { type: "checkbox", checked: params.nurMarkierte, onChange: (e) => setParams({ ...params, nurMarkierte: e.target.checked }) }), "nur markierte Positionen"] }), _jsxs("label", { className: rlcClass(null, checkLabel), children: [_jsx("input", { type: "checkbox", checked: params.nurPreisGroesser0, onChange: (e) => setParams({ ...params, nurPreisGroesser0: e.target.checked }) }), "nur EP > 0"] }), _jsxs("label", { className: rlcClass(null, checkLabel), children: [_jsx("input", { type: "checkbox", checked: params.nurGeaenderte, onChange: (e) => setParams({ ...params, nurGeaenderte: e.target.checked }) }), "nur ge\u00E4nderte anzeigen"] }), _jsx("button", { className: rlcClass(null, btnSecondary), onClick: () => toggleAll(true), children: "Alle markieren" }), _jsx("button", { className: rlcClass(null, btnSecondary), onClick: () => toggleAll(false), children: "Markierung l\u00F6schen" }), _jsx("button", { className: rlcClass(null, btnSecondary), onClick: resetManualOverrides, children: "Manuelle EP zur\u00FCcksetzen" })] })] }), _jsxs("section", { className: rlcClass(null, card), children: [_jsx("div", { className: rlcClass(null, sectionHead), children: _jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "Preisvorschau" }), _jsx("div", { className: rlcClass(null, sectionText), children: "Professionelle Vergleichstabelle mit altem Preis, neuem Preis, Gesamtpreis und Differenz. EP neu ist direkt editierbar." })] }) }), _jsx("div", { className: rlcClass(null, tableWrap), children: _jsxs("table", { className: rlcClass(null, table), children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, thSmall) }), _jsx("th", { className: rlcClass(null, th), children: "PosNr" }), _jsx("th", { className: rlcClass(null, th), children: "Kurztext" }), _jsx("th", { className: rlcClass(null, th), children: "ME" }), _jsx("th", { className: rlcClass(null, thRight), children: "Menge" }), _jsx("th", { className: rlcClass(null, thRight), children: "EP alt" }), _jsx("th", { className: rlcClass(null, thRight), children: "EP neu" }), _jsx("th", { className: rlcClass(null, thRight), children: "GP alt" }), _jsx("th", { className: rlcClass(null, thRight), children: "GP neu" }), _jsx("th", { className: rlcClass(null, thRight), children: "Diff." }), _jsx("th", { className: rlcClass(null, thRight), children: "%" })] }) }), _jsxs("tbody", { children: [visibleRows.map((row, idx) => {
                                            const sourceRow = rows.find((r) => r.id === row.id);
                                            const changed = round2(row.epAlt) !== round2(row.epNeu);
                                            const diff = row.gpNeu - row.gpAlt;
                                            const diffPct = row.gpAlt ? diff / row.gpAlt * 100 : 0;
                                            return (_jsxs("tr", { className: rlcClass(null, {
                                                    background: changed ?
                                                        "#F0FDF4" :
                                                        idx % 2 ?
                                                            "#FCFCFC" :
                                                            "#FFFFFF"
                                                }), children: [_jsx("td", { className: rlcClass(null, tdCenter), children: _jsx("input", { type: "checkbox", checked: !!sourceRow?.checked, onChange: (e) => setRows((prev) => prev.map((r) => r.id === row.id ?
                                                                { ...r, checked: e.target.checked } :
                                                                r)) }) }), _jsx("td", { className: rlcClass(null, tdStrong), children: row.posNr || "—" }), _jsxs("td", { className: rlcClass(null, tdText), title: `${row.kurztext}\n${row.langtext}`, children: [_jsx("b", { children: row.kurztext || "—" }), row.langtext ? _jsx("div", { className: rlcClass(null, tiny), children: row.langtext }) : null] }), _jsx("td", { className: rlcClass(null, td), children: row.einheit || "—" }), _jsx("td", { className: rlcClass(null, tdRight), children: num(row.menge) }), _jsx("td", { className: rlcClass(null, tdRight), children: money(row.epAlt) }), _jsx("td", { className: rlcClass(null, tdRight), children: _jsx("input", { type: "number", step: "0.01", value: round2(row.epNeu), onChange: (e) => setRows((prev) => prev.map((r) => r.id === row.id ?
                                                                { ...r, epOverride: n(e.target.value) } :
                                                                r)), className: rlcClass(null, priceInput) }) }), _jsx("td", { className: rlcClass(null, tdRight), children: money(row.gpAlt) }), _jsx("td", { className: rlcClass(null, tdRight), children: money(row.gpNeu) }), _jsx("td", { className: rlcClass(null, {
                                                            ...tdRight,
                                                            color: diff >= 0 ? "#15803D" : "#B91C1C",
                                                            fontWeight: 700
                                                        }), children: money(diff) }), _jsxs("td", { className: rlcClass(null, {
                                                            ...tdRight,
                                                            color: diff >= 0 ? "#15803D" : "#B91C1C",
                                                            fontWeight: 700
                                                        }), children: [pct(diffPct), " %"] })] }, row.id));
                                        }), !visibleRows.length ?
                                            _jsx("tr", { children: _jsx("td", { colSpan: 11, className: rlcClass(null, emptyCell), children: "Keine Daten. LV laden oder CSV importieren." }) }) :
                                            null] })] }) })] })] }));
}
function KpiCard({ label, value, sub, danger }) {
    return (_jsxs("div", { className: rlcClass(null, kpiCard), children: [_jsx("div", { className: rlcClass(null, kpiLabel), children: label }), _jsx("div", { className: rlcClass(null, { ...kpiValue, color: danger ? "#B91C1C" : "#0F172A" }), children: value }), sub ? _jsx("div", { className: rlcClass(null, kpiSub), children: sub }) : null] }));
}
function Field({ label, children }) {
    return (_jsxs("label", { className: "rlc-migrated-pages-kalkulation-aufschlag-tsx-854", children: [_jsx("span", { className: rlcClass(null, fieldLabel), children: label }), children] }));
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
    maxWidth: 960,
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
    lineHeight: 1.45
};
const ruleGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))",
    gap: 12
};
const fieldLabel = {
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
    background: "#FFFFFF"
};
const checkLabel = {
    display: "inline-flex",
    gap: 7,
    alignItems: "center",
    fontSize: 13,
    color: "#0F172A",
    fontWeight: 600
};
const buttonRow = {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
    marginTop: 12
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
    minWidth: 1240,
    borderCollapse: "collapse"
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
const thSmall = {
    ...th,
    width: 42,
    textAlign: "center"
};
const td = {
    padding: "8px 9px",
    fontSize: 12,
    borderBottom: "1px solid #F1F5F9",
    verticalAlign: "middle",
    whiteSpace: "nowrap"
};
const tdStrong = {
    ...td,
    fontWeight: 700
};
const tdText = {
    ...td,
    minWidth: 280,
    maxWidth: 430,
    whiteSpace: "normal"
};
const tdRight = {
    ...td,
    textAlign: "right",
    fontVariantNumeric: "tabular-nums"
};
const tdCenter = {
    ...td,
    textAlign: "center"
};
const priceInput = {
    width: 92,
    border: "1px solid #CBD5E1",
    borderRadius: 8,
    padding: "6px 8px",
    fontSize: 12,
    textAlign: "right",
    fontWeight: 700,
    background: "#FFFFFF"
};
const tiny = {
    marginTop: 4,
    fontSize: 11,
    color: "#64748B",
    lineHeight: 1.35
};
const emptyCell = {
    padding: 16,
    color: "#64748B",
    fontSize: 13
};
