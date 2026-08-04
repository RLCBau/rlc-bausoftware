import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
import { savePdfWithCompanyHeader as saveRlcPdfWithCompanyHeader } from "../../lib/pdf/companyPdfHeader";
// apps/web/src/pages/ki/AbrechnungAuto.tsx
import React from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { useProject } from "../../store/useProject";
import { loadProjectLv } from "../../api/projectLvCompat";
/* ======================= Styles ======================= */
const card = {
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: 16,
    background: "#fff"
};
const tbl = {
    width: "100%",
    borderCollapse: "collapse"
};
const th = {
    padding: "8px 10px",
    borderBottom: "1px solid #e5e7eb",
    background: "#f7f7f7",
    textAlign: "left",
    whiteSpace: "nowrap"
};
const td = {
    padding: "6px 10px",
    borderBottom: "1px solid #eee",
    verticalAlign: "top",
    fontSize: 13
};
const inp = {
    border: "1px solid #d1d5db",
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 14
};
const shell = {
    display: "grid",
    gap: 16,
    padding: 16
};
/* ======================= Utils ======================= */
const num = (v, d = 2) => v == null || !Number.isFinite(v) ?
    "" :
    Number(v).toLocaleString("de-DE", {
        minimumFractionDigits: d,
        maximumFractionDigits: d
    });
function toNumber(v, fallback = 0) {
    const n = typeof v === "number" ?
        v :
        typeof v === "string" ?
            Number(v.replace(",", ".")) :
            Number(v);
    return Number.isFinite(n) ? n : fallback;
}
function normalizeLvItem(item) {
    const x = (item ?? {});
    return {
        id: String(x.id ?? crypto.randomUUID()),
        projectId: x.projectId ? String(x.projectId) : undefined,
        posNr: x.posNr ? String(x.posNr) : undefined,
        kurztext: String(x.kurztext ?? ""),
        einheit: x.einheit ? String(x.einheit) : undefined,
        menge: x.menge == null ? null : toNumber(x.menge, 0),
        preis: x.preis == null ? null : toNumber(x.preis, 0),
        quelle: x.quelle ? String(x.quelle) : undefined,
        createdAt: Number(x.createdAt ?? Date.now())
    };
}
function normalizeAbschlag(item) {
    const x = (item ?? {});
    return {
        id: x.id ? String(x.id) : undefined,
        projectId: String(x.projectId ?? ""),
        nr: toNumber(x.nr, 0),
        datum: String(x.datum ?? ""),
        betrag: toNumber(x.betrag, 0)
    };
}
function sortLV(a, b) {
    const pa = String(a.posNr || "").padStart(10, "0");
    const pb = String(b.posNr || "").padStart(10, "0");
    return pa.localeCompare(pb);
}
async function api(url, init) {
    const headers = new Headers(init?.headers || {});
    if (!headers.has("Content-Type") && init?.body) {
        headers.set("Content-Type", "application/json");
    }
    const res = await fetch(url, {
        ...init,
        headers
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
    }
    return res.json();
}
/* ======================= Component ======================= */
export default function AbrechnungAuto() {
    const projectCtx = useProject();
    const currentProject = projectCtx?.currentProject ?? null;
    const storeProjectId = currentProject?.id ?? "";
    const projectCode = currentProject?.code ?? "";
    const [projectIdInput, setProjectIdInput] = React.useState("");
    const [lv, setLV] = React.useState([]);
    const [abschlaege, setAbschlaege] = React.useState([]);
    const [loading, setLoading] = React.useState(false);
    const [filterText, setFilterText] = React.useState("");
    const [mwst, setMwst] = React.useState(19);
    const [aufschlag, setAufschlag] = React.useState(0);
    const [error, setError] = React.useState(null);
    const effectiveProjectId = projectIdInput.trim() || storeProjectId || projectCode || "";
    const canLoad = !!effectiveProjectId && !loading;
    const lvFiltered = React.useMemo(() => {
        if (!filterText.trim())
            return lv;
        const s = filterText.toLowerCase();
        return lv.filter((it) => {
            return (String(it.posNr || "").toLowerCase().includes(s) ||
                String(it.kurztext || "").toLowerCase().includes(s) ||
                String(it.quelle || "").toLowerCase().includes(s));
        });
    }, [lv, filterText]);
    const sollNetto = React.useMemo(() => {
        let sum = 0;
        for (const r of lv) {
            const preis = toNumber(r.preis, 0);
            const menge = r.menge != null ? toNumber(r.menge, 0) : null;
            sum += menge != null ? menge * preis : preis;
        }
        return sum * (1 + toNumber(aufschlag, 0) / 100);
    }, [lv, aufschlag]);
    const istNetto = React.useMemo(() => {
        return abschlaege.reduce((s, a) => s + toNumber(a.betrag, 0), 0);
    }, [abschlaege]);
    const diffNetto = istNetto - sollNetto;
    const mwstSoll = sollNetto * (toNumber(mwst, 0) / 100);
    const mwstIst = istNetto * (toNumber(mwst, 0) / 100);
    const sollBrutto = sollNetto + mwstSoll;
    const istBrutto = istNetto + mwstIst;
    const deckungsgrad = sollNetto > 0 ? Math.round(istNetto / sollNetto * 100) : 0;
    /* ----------------------- Loaders ----------------------- */
    async function loadLV() {
        if (!effectiveProjectId) {
            setError("Bitte Projekt auswählen oder Projekt-ID eingeben.");
            return;
        }
        const res = await loadProjectLv(effectiveProjectId);
        setLV(Array.isArray(res.items) ?
            res.items.map(normalizeLvItem).slice().sort(sortLV) :
            []);
    }
    async function loadAbschlaege() {
        if (!effectiveProjectId) {
            setError("Bitte Projekt auswählen oder Projekt-ID eingeben.");
            return;
        }
        const res = await api(`/api/abrechnung/by-project/${encodeURIComponent(effectiveProjectId)}`);
        setAbschlaege(Array.isArray(res.items) ?
            res.items.map(normalizeAbschlag).slice().sort((a, b) => a.nr - b.nr) :
            []);
    }
    async function loadAll() {
        if (!effectiveProjectId) {
            setError("Bitte Projekt auswählen oder Projekt-ID eingeben.");
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const [lvRes, abschlagRes] = await Promise.all([
                loadProjectLv(effectiveProjectId),
                api(`/api/abrechnung/by-project/${encodeURIComponent(effectiveProjectId)}`)
            ]);
            setLV(Array.isArray(lvRes.items) ?
                lvRes.items.map(normalizeLvItem).slice().sort(sortLV) :
                []);
            setAbschlaege(Array.isArray(abschlagRes.items) ?
                abschlagRes.items.
                    map(normalizeAbschlag).
                    slice().
                    sort((a, b) => a.nr - b.nr) :
                []);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Fehler beim Laden");
        }
        finally {
            setLoading(false);
        }
    }
    /* ----------------------- Abschlag CRUD ----------------------- */
    async function addAbschlag() {
        if (!effectiveProjectId) {
            setError("Projekt-ID fehlt");
            return;
        }
        const betragStr = window.prompt("Betrag (netto):");
        if (!betragStr)
            return;
        const betrag = toNumber(betragStr, Number.NaN);
        if (!Number.isFinite(betrag) || betrag <= 0) {
            window.alert("Ungültiger Betrag.");
            return;
        }
        try {
            setError(null);
            const res = await api(`/api/abrechnung/save`, {
                method: "POST",
                body: JSON.stringify({
                    projectId: effectiveProjectId,
                    betrag
                })
            });
            setAbschlaege((prev) => [...prev, normalizeAbschlag(res.item)].sort((a, b) => a.nr - b.nr));
        }
        catch (e) {
            setError(e instanceof Error ?
                e.message :
                "Abschlag konnte nicht gespeichert werden.");
        }
    }
    async function delAbschlag(a) {
        if (!a.id)
            return;
        if (!window.confirm(`Abschlag Nr. ${a.nr} löschen?`))
            return;
        try {
            setError(null);
            await api(`/api/abrechnung/${a.id}`, { method: "DELETE" });
            setAbschlaege((prev) => prev.filter((x) => x.id !== a.id));
        }
        catch (e) {
            setError(e instanceof Error ?
                e.message :
                "Abschlag konnte nicht gelöscht werden.");
        }
    }
    /* ----------------------- Export CSV ----------------------- */
    function exportCSV() {
        if (!effectiveProjectId) {
            setError("Projekt-ID fehlt");
            return;
        }
        if (!lv.length && !abschlaege.length) {
            window.alert("Nichts zu exportieren.");
            return;
        }
        const head = [
            "ProjektID",
            "Typ",
            "PosNr",
            "Kurztext",
            "Einheit",
            "Menge",
            "EP",
            "Quelle",
            "Datum/Erstellt",
            "BetragNetto"
        ];
        const rows = [];
        for (const r of lv) {
            rows.push([
                effectiveProjectId,
                "LV",
                r.posNr || "",
                r.kurztext || "",
                r.einheit || "",
                r.menge ?? "",
                r.preis ?? "",
                r.quelle || "",
                new Date(r.createdAt).toLocaleDateString("de-DE"),
                ""
            ]);
        }
        for (const a of abschlaege) {
            rows.push([
                effectiveProjectId,
                "Abschlag",
                "",
                "",
                "",
                "",
                "",
                "",
                a.datum,
                a.betrag
            ]);
        }
        const csv = [
            head.join(";"),
            ...rows.map((r) => r.map((v) => String(v ?? "").replace(/;/g, ",")).join(";"))
        ].
            join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `Abrechnung_${effectiveProjectId}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
    }
    /* ----------------------- Export PDF + Buchhaltung ----------------------- */
    async function exportPDF(andSendToBuchhaltung = true) {
        if (!effectiveProjectId) {
            setError("Projekt-ID fehlt");
            return;
        }
        if (!lv.length) {
            window.alert("Kein LV geladen.");
            return;
        }
        try {
            setError(null);
            const doc = new jsPDF({ orientation: "landscape", unit: "mm" });
            doc.setFontSize(16);
            doc.text(`Abrechnung – Projekt ${effectiveProjectId}`, 14, 16);
            const startY = 22;
            doc.setFontSize(11);
            doc.text(`Soll (Netto): ${num(sollNetto)} €  |  Ist (Netto): ${num(istNetto)} €  |  Δ: ${num(diffNetto)} €  |  Deckungsgrad: ${deckungsgrad}%`, 14, startY);
            autoTable(doc, {
                startY: startY + 6,
                head: [
                    [
                        "Pos",
                        "Kurztext",
                        "Einheit",
                        "Menge",
                        "EP (netto)",
                        "Σ Position (netto)",
                        "Quelle",
                        "Erstellt am"
                    ]
                ],
                body: lv.map((l) => {
                    const preis = toNumber(l.preis, 0);
                    const menge = l.menge != null ? toNumber(l.menge, 0) : null;
                    const sum = (menge != null ? menge * preis : preis) * (1 + toNumber(aufschlag, 0) / 100);
                    return [
                        l.posNr || "—",
                        l.kurztext || "",
                        l.einheit || "—",
                        menge != null ? num(menge, 3) : "—",
                        num(preis),
                        num(sum),
                        l.quelle || "—",
                        new Date(l.createdAt).toLocaleDateString("de-DE")
                    ];
                }),
                styles: { fontSize: 8, cellPadding: 2 },
                headStyles: { fillColor: [20, 20, 20], textColor: 255 },
                columnStyles: {
                    3: { halign: "right" },
                    4: { halign: "right" },
                    5: { halign: "right" }
                },
                margin: { left: 14, right: 14 }
            });
            let y = (doc.lastAutoTable?.
                finalY ?? startY + 6) + 8;
            doc.setFontSize(12);
            doc.text("Abschlagsrechnungen", 14, y);
            autoTable(doc, {
                startY: y + 5,
                head: [["Nr", "Datum", "Netto (€)", "Brutto (€)"]],
                body: abschlaege.map((a) => [
                    a.nr,
                    a.datum,
                    num(a.betrag),
                    num(a.betrag * (1 + toNumber(mwst, 0) / 100))
                ]),
                styles: { fontSize: 9, cellPadding: 2 },
                headStyles: { fillColor: [230, 230, 230] },
                columnStyles: {
                    2: { halign: "right" },
                    3: { halign: "right" }
                },
                margin: { left: 14, right: 14 }
            });
            y =
                (doc.lastAutoTable?.
                    finalY ?? y) + 8;
            doc.setFontSize(12);
            doc.text(`MwSt: ${mwst}%   ·   Aufschlag: ${aufschlag}%`, 14, y);
            y += 6;
            doc.text(`Soll Netto: ${num(sollNetto)} € | Soll Brutto: ${num(sollBrutto)} €`, 14, y);
            y += 6;
            doc.text(`Ist Netto (Abschläge): ${num(istNetto)} € | Ist Brutto: ${num(istBrutto)} €`, 14, y);
            y += 6;
            doc.text(`Differenz Netto (Ist − Soll): ${num(diffNetto)} €`, 14, y);
            saveRlcPdfWithCompanyHeader(doc, `Abrechnung_${effectiveProjectId}.pdf`);
            if (andSendToBuchhaltung) {
                const body = {
                    projectId: effectiveProjectId,
                    summeNetto: istNetto,
                    summeBrutto: istBrutto,
                    quelle: "Abrechnung (Ist/Aggregat)"
                };
                try {
                    await api(`/api/buchhaltung/save`, {
                        method: "POST",
                        body: JSON.stringify(body)
                    });
                    window.alert("PDF exportiert und in Buchhaltung gespeichert ✅");
                }
                catch (e) {
                    window.alert("PDF ok, aber Buchhaltung-Transfer fehlgeschlagen: " + (e instanceof Error ? e.message : String(e)));
                }
            }
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "PDF-Export fehlgeschlagen");
        }
    }
    /* ----------------------- Render ----------------------- */
    return (_jsxs("div", { className: rlcClass(null, shell), children: [_jsx("h1", { children: "Abrechnung \u2013 Automatik & Soll-Ist-Vergleich" }), _jsxs("div", { className: rlcClass(null, card), children: [_jsxs("div", { className: "rlc-migrated-pages-ki-autoabrechnung-tsx-936", children: [_jsx("input", { placeholder: "Projekt-ID oder Projektcode", value: projectIdInput, onChange: (e) => setProjectIdInput(e.target.value), className: rlcClass(null, inp) }), _jsx("button", { className: "btn", onClick: () => void loadLV(), disabled: !canLoad, children: "LV laden" }), _jsx("button", { className: "btn", onClick: () => void loadAbschlaege(), disabled: !canLoad, children: "Abschl\u00E4ge laden" }), _jsx("button", { className: "btn", onClick: () => void loadAll(), disabled: !canLoad, children: loading ? "Lädt..." : "Alles laden" }), _jsx("button", { className: "btn", onClick: () => void addAbschlag(), disabled: !effectiveProjectId, children: "+ Abschlag" })] }), _jsxs("div", { className: "rlc-migrated-pages-ki-autoabrechnung-tsx-937", children: ["Aktiv: ", effectiveProjectId || "kein Projekt gewählt"] }), error &&
                        _jsx("div", { className: "rlc-migrated-pages-ki-autoabrechnung-tsx-938", children: error }), _jsxs("div", { className: "rlc-migrated-pages-ki-autoabrechnung-tsx-939", children: [_jsx(Kpi, { title: "LV-Positionen", children: lv.length }), _jsx(Kpi, { title: "Abschl\u00E4ge", children: abschlaege.length }), _jsx(Kpi, { title: "Soll Netto (\u20AC)", children: _jsx("b", { children: num(sollNetto) }) }), _jsx(Kpi, { title: "Ist Netto (\u20AC)", children: _jsx("b", { children: num(istNetto) }) }), _jsx(Kpi, { title: "\u0394 Netto (Ist\u2212Soll)", children: _jsx("span", { className: rlcClass(null, { color: diffNetto >= 0 ? "#065f46" : "#991b1b" }), children: num(diffNetto) }) }), _jsxs(Kpi, { title: "Deckungsgrad", children: [deckungsgrad, "%"] })] }), _jsxs("div", { className: "rlc-migrated-pages-ki-autoabrechnung-tsx-940", children: [_jsxs("div", { className: "rlc-migrated-pages-ki-autoabrechnung-tsx-941", children: [_jsx("span", { className: "rlc-migrated-pages-ki-autoabrechnung-tsx-942", children: "MwSt" }), _jsx("input", { type: "number", value: mwst, onChange: (e) => setMwst(toNumber(e.target.value, 0)), className: rlcClass(null, { ...inp, width: 90 }) }), "%"] }), _jsxs("div", { className: "rlc-migrated-pages-ki-autoabrechnung-tsx-943", children: [_jsx("span", { className: "rlc-migrated-pages-ki-autoabrechnung-tsx-944", children: "Aufschlag" }), _jsx("input", { type: "number", value: aufschlag, onChange: (e) => setAufschlag(toNumber(e.target.value, 0)), className: rlcClass(null, { ...inp, width: 90 }) }), "%"] }), _jsxs("div", { className: "rlc-migrated-pages-ki-autoabrechnung-tsx-945", children: [_jsx("input", { placeholder: "Filter (Pos/Kurztext/Quelle)", value: filterText, onChange: (e) => setFilterText(e.target.value), className: rlcClass(null, { ...inp, minWidth: 240 }) }), _jsx("button", { className: "btn", onClick: () => void exportPDF(true), disabled: !lv.length, children: "PDF & \u2192 Buchhaltung" }), _jsx("button", { className: "btn", onClick: exportCSV, disabled: !lv.length && !abschlaege.length, children: "CSV Export" })] })] })] }), !!lvFiltered.length &&
                _jsxs("div", { className: rlcClass(null, card), children: [_jsxs("h3", { className: "rlc-migrated-pages-ki-autoabrechnung-tsx-946", children: ["LV-Positionen (gefiltert: ", lvFiltered.length, "/", lv.length, ")"] }), _jsxs("table", { className: rlcClass(null, tbl), children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, th), children: "Pos" }), _jsx("th", { className: rlcClass(null, th), children: "Kurztext" }), _jsx("th", { className: rlcClass(null, th), children: "Einheit" }), _jsx("th", { className: rlcClass(null, th), children: "Menge" }), _jsx("th", { className: rlcClass(null, th), children: "EP (netto)" }), _jsx("th", { className: rlcClass(null, th), children: "\u03A3 Position (netto)" }), _jsx("th", { className: rlcClass(null, th), children: "Quelle" }), _jsx("th", { className: rlcClass(null, th), children: "Erstellt am" })] }) }), _jsx("tbody", { children: lvFiltered.map((l) => {
                                        const preis = toNumber(l.preis, 0);
                                        const menge = l.menge != null ? toNumber(l.menge, 0) : null;
                                        const sum = (menge != null ? menge * preis : preis) * (1 + toNumber(aufschlag, 0) / 100);
                                        return (_jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, td), children: l.posNr || "—" }), _jsx("td", { className: rlcClass(null, td), children: l.kurztext }), _jsx("td", { className: rlcClass(null, td), children: l.einheit || "—" }), _jsx("td", { className: rlcClass(null, { ...td, textAlign: "right" }), children: menge != null ? num(menge, 3) : "—" }), _jsx("td", { className: rlcClass(null, { ...td, textAlign: "right" }), children: num(preis) }), _jsx("td", { className: rlcClass(null, { ...td, textAlign: "right" }), children: num(sum) }), _jsx("td", { className: rlcClass(null, td), children: l.quelle || "—" }), _jsx("td", { className: rlcClass(null, td), children: new Date(l.createdAt).toLocaleDateString("de-DE") })] }, l.id));
                                    }) })] })] }), !!abschlaege.length &&
                _jsxs("div", { className: rlcClass(null, card), children: [_jsx("h3", { className: "rlc-migrated-pages-ki-autoabrechnung-tsx-947", children: "Abschlagsrechnungen" }), _jsxs("table", { className: rlcClass(null, tbl), children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, th), children: "Nr" }), _jsx("th", { className: rlcClass(null, th), children: "Datum" }), _jsx("th", { className: rlcClass(null, { ...th, textAlign: "right" }), children: "Netto (\u20AC)" }), _jsx("th", { className: rlcClass(null, { ...th, textAlign: "right" }), children: "Brutto (\u20AC)" }), _jsx("th", { className: rlcClass(null, th) })] }) }), _jsx("tbody", { children: abschlaege.map((a) => _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, td), children: a.nr }), _jsx("td", { className: rlcClass(null, td), children: a.datum }), _jsx("td", { className: rlcClass(null, { ...td, textAlign: "right" }), children: num(a.betrag) }), _jsx("td", { className: rlcClass(null, { ...td, textAlign: "right" }), children: num(a.betrag * (1 + toNumber(mwst, 0) / 100)) }), _jsx("td", { className: rlcClass(null, td), children: _jsx("button", { className: "btn", onClick: () => void delAbschlag(a), children: "\uD83D\uDDD1\uFE0F" }) })] }, a.id || `a-${a.nr}-${a.datum}`)) })] }), _jsxs("div", { className: "rlc-migrated-pages-ki-autoabrechnung-tsx-948", children: ["Ist Netto: ", num(istNetto), " \u20AC \u00B7 Ist Brutto: ", num(istBrutto), " \u20AC"] })] }), _jsxs("div", { className: rlcClass(null, card), children: [_jsx("h3", { className: "rlc-migrated-pages-ki-autoabrechnung-tsx-949", children: "Vergleich \u2013 Soll vs. Ist" }), _jsxs("div", { className: "rlc-migrated-pages-ki-autoabrechnung-tsx-950", children: [_jsx(Box, { label: "Soll Netto", value: `${num(sollNetto)} €` }), _jsx(Box, { label: "Ist Netto", value: `${num(istNetto)} €` }), _jsx(Box, { label: "Differenz Netto (Ist\u2212Soll)", value: `${num(diffNetto)} €`, color: diffNetto >= 0 ? "#065f46" : "#991b1b" }), _jsx(Box, { label: "Deckungsgrad", value: `${deckungsgrad}%` })] })] })] }));
}
/* ======================= Small UI ======================= */
function Kpi({ title, children }) {
    return (_jsxs("div", { className: "rlc-migrated-pages-ki-autoabrechnung-tsx-951", children: [_jsx("div", { className: "rlc-migrated-pages-ki-autoabrechnung-tsx-952", children: title }), _jsx("div", { className: "rlc-migrated-pages-ki-autoabrechnung-tsx-953", children: children })] }));
}
function Box({ label, value, color }) {
    return (_jsxs("div", { className: "rlc-migrated-pages-ki-autoabrechnung-tsx-954", children: [_jsx("div", { className: "rlc-migrated-pages-ki-autoabrechnung-tsx-955", children: label }), _jsx("div", { className: rlcClass(null, { fontSize: 18, fontWeight: 700, color: color || "inherit" }), children: value })] }));
}
