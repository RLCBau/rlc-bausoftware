import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
const card = { border: "1px solid var(--line)", borderRadius: 10, padding: 16, background: "#fff" };
const tbl = { width: "100%", borderCollapse: "collapse" };
const th = { padding: "8px 10px", borderBottom: "1px solid var(--line)", background: "#f7f7f7", textAlign: "left", whiteSpace: "nowrap" };
const td = { padding: "6px 10px", borderBottom: "1px solid #eee", verticalAlign: "top", fontSize: 13 };
const inp = { border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", fontSize: 14 };
const num = (v, d = 2) => v == null || !Number.isFinite(v) ? "" : v.toLocaleString(undefined, { maximumFractionDigits: d });
async function api(url, init) {
    const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
/* ======================= Component ======================= */
export default function AbrechnungAuto() {
    const [projectId, setProjectId] = React.useState(() => {
        const q = new URLSearchParams(window.location.search).get("projectId") || "";
        const s = sessionStorage.getItem("projectId") || "";
        return q || s || "";
    });
    const [lv, setLV] = React.useState([]);
    const [abschlaege, setAbschlaege] = React.useState([]);
    const [loading, setLoading] = React.useState(false);
    const [filterText, setFilterText] = React.useState("");
    const [mwst, setMwst] = React.useState(19);
    const [aufschlag, setAufschlag] = React.useState(0); // opzionale markup globale
    // persist Project-ID
    React.useEffect(() => {
        if (projectId)
            sessionStorage.setItem("projectId", projectId);
    }, [projectId]);
    /* ----------------------- Loaders ----------------------- */
    async function loadLV() {
        if (!projectId)
            return alert("Bitte Projekt-ID eingeben");
        const res = await api(`/api/lv/by-project/${encodeURIComponent(projectId)}`);
        setLV((res.items || []).slice().sort(sortLV));
    }
    async function loadAbschlaege() {
        if (!projectId)
            return alert("Bitte Projekt-ID eingeben");
        const res = await api(`/api/abrechnung/by-project/${encodeURIComponent(projectId)}`);
        const items = (res.items || []).slice().sort((a, b) => a.nr - b.nr);
        setAbschlaege(items);
    }
    async function loadAll() {
        setLoading(true);
        try {
            await Promise.all([loadLV(), loadAbschlaege()]);
        }
        finally {
            setLoading(false);
        }
    }
    /* ----------------------- Helpers calcolo ----------------------- */
    function sortLV(a, b) {
        const pa = (a.posNr || "").padStart(10, "0");
        const pb = (b.posNr || "").padStart(10, "0");
        return pa.localeCompare(pb);
    }
    const lvFiltered = React.useMemo(() => {
        if (!filterText.trim())
            return lv;
        const s = filterText.toLowerCase();
        return lv.filter(it => (it.posNr || "").toLowerCase().includes(s) ||
            (it.kurztext || "").toLowerCase().includes(s) ||
            (it.quelle || "").toLowerCase().includes(s));
    }, [lv, filterText]);
    // Σ LV (Soll)
    const sollNetto = React.useMemo(() => {
        // Se abbiamo menge e preis → menge * preis; altrimenti, se c'è solo preis → somma dei preis
        let sum = 0;
        for (const r of lv) {
            const preis = Number(r.preis ?? 0);
            const menge = r.menge != null ? Number(r.menge) : null;
            sum += (menge != null ? (menge * preis) : preis);
        }
        // markup opzionale
        return sum * (1 + (aufschlag || 0) / 100);
    }, [lv, aufschlag]);
    // Σ Abschläge (Ist)
    const istNetto = React.useMemo(() => abschlaege.reduce((s, a) => s + (a.betrag || 0), 0), [abschlaege]);
    const diffNetto = istNetto - sollNetto;
    const mwstSoll = sollNetto * (mwst / 100);
    const mwstIst = istNetto * (mwst / 100);
    const sollBrutto = sollNetto + mwstSoll;
    const istBrutto = istNetto + mwstIst;
    const deckungsgrad = sollNetto > 0 ? Math.round((istNetto / sollNetto) * 100) : 0;
    /* ----------------------- Abschlag CRUD (semplice) ----------------------- */
    async function addAbschlag() {
        if (!projectId)
            return alert("Projekt-ID fehlt");
        const betragStr = prompt("Betrag (netto):");
        if (!betragStr)
            return;
        const betrag = Number(betragStr.replace(",", "."));
        if (!Number.isFinite(betrag) || betrag <= 0)
            return alert("Ungültiger Betrag.");
        const res = await api(`/api/abrechnung/save`, {
            method: "POST",
            body: JSON.stringify({ projectId, betrag }),
        });
        setAbschlaege(prev => [...prev, res.item].sort((a, b) => a.nr - b.nr));
    }
    async function delAbschlag(a) {
        if (!a.id)
            return;
        if (!confirm(`Abschlag Nr. ${a.nr} löschen?`))
            return;
        await api(`/api/abrechnung/${a.id}`, { method: "DELETE" });
        setAbschlaege(prev => prev.filter(x => x.id !== a.id));
    }
    /* ----------------------- Export CSV ----------------------- */
    function exportCSV() {
        if (!lv.length && !abschlaege.length)
            return alert("Nichts zu exportieren.");
        const head = [
            "ProjektID", "Typ", "PosNr", "Kurztext", "Einheit", "Menge", "EP", "Quelle", "Datum/Erstellt", "BetragNetto"
        ];
        const rows = [];
        for (const r of lv) {
            rows.push([
                projectId,
                "LV",
                r.posNr || "",
                r.kurztext || "",
                r.einheit || "",
                r.menge ?? "",
                r.preis ?? "",
                r.quelle || "",
                new Date(r.createdAt).toLocaleDateString(),
                ""
            ]);
        }
        for (const a of abschlaege) {
            rows.push([
                projectId,
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
        const csv = [head.join(";"), ...rows.map(r => r.map(v => String(v).replace(/;/g, ",")).join(";"))].join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `Abrechnung_${projectId || "ohneProjekt"}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    }
    /* ----------------------- Export PDF + Buchhaltung ----------------------- */
    async function exportPDF(andSendToBuchhaltung = true) {
        if (!projectId)
            return alert("Projekt-ID fehlt");
        if (!lv.length)
            return alert("Kein LV geladen.");
        const doc = new jsPDF({ orientation: "landscape", unit: "mm" });
        doc.setFontSize(16);
        doc.text(`Abrechnung – Projekt ${projectId}`, 14, 16);
        // KPI Box
        const startY = 22;
        doc.setFontSize(11);
        doc.text(`Soll (Netto): ${num(sollNetto)} €  |  Ist (Netto): ${num(istNetto)} €  |  Δ: ${num(diffNetto)} €  |  Deckungsgrad: ${deckungsgrad}%`, 14, startY);
        // LV Tabelle
        autoTable(doc, {
            startY: startY + 6,
            head: [["Pos", "Kurztext", "Einheit", "Menge", "EP (netto)", "Σ Position (netto)", "Quelle", "Erstellt am"]],
            body: lv.map(l => {
                const preis = Number(l.preis || 0);
                const menge = l.menge != null ? Number(l.menge) : null;
                const sum = (menge != null ? menge * preis : preis) * (1 + (aufschlag || 0) / 100);
                return [
                    l.posNr || "—",
                    l.kurztext || "",
                    l.einheit || "—",
                    menge != null ? num(menge, 3) : "—",
                    num(preis),
                    num(sum),
                    l.quelle || "—",
                    new Date(l.createdAt).toLocaleDateString(),
                ];
            }),
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [20, 20, 20], textColor: 255 },
            columnStyles: { 5: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
            margin: { left: 14, right: 14 },
        });
        // Abschläge
        let y = doc.lastAutoTable.finalY + 8;
        doc.setFontSize(12);
        doc.text("Abschlagsrechnungen", 14, y);
        autoTable(doc, {
            startY: y + 5,
            head: [["Nr", "Datum", "Netto (€)", "Brutto (€)"]],
            body: abschlaege.map(a => [a.nr, a.datum, num(a.betrag), num(a.betrag * (1 + mwst / 100))]),
            styles: { fontSize: 9, cellPadding: 2 },
            headStyles: { fillColor: [230, 230, 230] },
            columnStyles: { 2: { halign: "right" }, 3: { halign: "right" } },
            margin: { left: 14, right: 14 },
        });
        // Totali
        y = doc.lastAutoTable.finalY + 8;
        doc.setFontSize(12);
        doc.text(`MwSt: ${mwst}%   ·   Aufschlag: ${aufschlag}%`, 14, y);
        y += 6;
        doc.text(`Soll Netto: ${num(sollNetto)} € | Soll Brutto: ${num(sollBrutto)} €`, 14, y);
        y += 6;
        doc.text(`Ist Netto (Abschläge): ${num(istNetto)} € | Ist Brutto: ${num(istBrutto)} €`, 14, y);
        y += 6;
        doc.text(`Differenz Netto (Ist − Soll): ${num(diffNetto)} €`, 14, y);
        doc.save(`Abrechnung_${projectId}.pdf`);
        if (andSendToBuchhaltung) {
            // invio sintetico a Buchhaltung (Ist aggregato)
            const body = {
                projectId,
                summeNetto: istNetto,
                summeBrutto: istBrutto,
                quelle: "Abrechnung (Ist/Aggregat)",
            };
            try {
                await api(`/api/buchhaltung/save`, { method: "POST", body: JSON.stringify(body) });
                alert("PDF exportiert und in Buchhaltung gespeichert ✅");
            }
            catch (e) {
                alert("PDF ok, aber Buchhaltung-Transfer fehlgeschlagen: " + (e?.message || e));
            }
        }
    }
    /* ----------------------- Render ----------------------- */
    return (_jsxs("div", { style: { display: "grid", gap: 16, padding: 16 }, children: [_jsx("h1", { children: "Abrechnung \u2013 Automatik & Soll-Ist-Vergleich" }), _jsxs("div", { style: card, children: [_jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr auto auto auto auto", gap: 12, alignItems: "center" }, children: [_jsx("input", { placeholder: "Projekt-ID", value: projectId, onChange: e => setProjectId(e.target.value), style: { ...inp } }), _jsx("button", { className: "btn", onClick: loadLV, disabled: !projectId || loading, children: "LV laden" }), _jsx("button", { className: "btn", onClick: loadAbschlaege, disabled: !projectId || loading, children: "Abschl\u00E4ge laden" }), _jsx("button", { className: "btn", onClick: loadAll, disabled: !projectId || loading, children: "Alles laden" }), _jsx("button", { className: "btn", onClick: addAbschlag, disabled: !projectId, children: "+ Abschlag" })] }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginTop: 12 }, children: [_jsx(Kpi, { title: "LV-Positionen", children: lv.length }), _jsx(Kpi, { title: "Abschl\u00E4ge", children: abschlaege.length }), _jsx(Kpi, { title: "Soll Netto (\u20AC)", children: _jsx("b", { children: num(sollNetto) }) }), _jsx(Kpi, { title: "Ist Netto (\u20AC)", children: _jsx("b", { children: num(istNetto) }) }), _jsx(Kpi, { title: "\u0394 Netto (Ist\u2212Soll)", children: _jsx("span", { style: { color: diffNetto >= 0 ? "#065f46" : "#991b1b" }, children: num(diffNetto) }) }), _jsxs(Kpi, { title: "Deckungsgrad", children: [deckungsgrad, "%"] })] }), _jsxs("div", { style: { display: "flex", gap: 12, alignItems: "center", marginTop: 12, flexWrap: "wrap" }, children: [_jsxs("div", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [_jsx("span", { style: { fontSize: 13, color: "var(--muted)" }, children: "MwSt" }), _jsx("input", { type: "number", value: mwst, onChange: e => setMwst(Number(e.target.value)), style: { ...inp, width: 90 } }), "%"] }), _jsxs("div", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [_jsx("span", { style: { fontSize: 13, color: "var(--muted)" }, children: "Aufschlag" }), _jsx("input", { type: "number", value: aufschlag, onChange: e => setAufschlag(Number(e.target.value)), style: { ...inp, width: 90 } }), "%"] }), _jsxs("div", { style: { marginLeft: "auto", display: "flex", gap: 8 }, children: [_jsx("input", { placeholder: "Filter (Pos/Kurztext/Quelle)", value: filterText, onChange: e => setFilterText(e.target.value), style: { ...inp, minWidth: 240 } }), _jsx("button", { className: "btn", onClick: () => exportPDF(true), disabled: !lv.length, children: "PDF & \u2192 Buchhaltung" }), _jsx("button", { className: "btn", onClick: exportCSV, disabled: !lv.length && !abschlaege.length, children: "CSV Export" })] })] })] }), !!lvFiltered.length && (_jsxs("div", { style: card, children: [_jsxs("h3", { style: { marginTop: 0 }, children: ["LV-Positionen (gefiltert: ", lvFiltered.length, "/", lv.length, ")"] }), _jsxs("table", { style: tbl, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: th, children: "Pos" }), _jsx("th", { style: th, children: "Kurztext" }), _jsx("th", { style: th, children: "Einheit" }), _jsx("th", { style: th, children: "Menge" }), _jsx("th", { style: th, children: "EP (netto)" }), _jsx("th", { style: th, children: "\u03A3 Position (netto)" }), _jsx("th", { style: th, children: "Quelle" }), _jsx("th", { style: th, children: "Erstellt am" })] }) }), _jsx("tbody", { children: lvFiltered.map((l) => {
                                    const preis = Number(l.preis || 0);
                                    const menge = l.menge != null ? Number(l.menge) : null;
                                    const sum = (menge != null ? menge * preis : preis) * (1 + (aufschlag || 0) / 100);
                                    return (_jsxs("tr", { children: [_jsx("td", { style: td, children: l.posNr || "—" }), _jsx("td", { style: td, children: l.kurztext }), _jsx("td", { style: td, children: l.einheit || "—" }), _jsx("td", { style: { ...td, textAlign: "right" }, children: menge != null ? num(menge, 3) : "—" }), _jsx("td", { style: { ...td, textAlign: "right" }, children: num(preis) }), _jsx("td", { style: { ...td, textAlign: "right" }, children: num(sum) }), _jsx("td", { style: td, children: l.quelle || "—" }), _jsx("td", { style: td, children: new Date(l.createdAt).toLocaleDateString() })] }, l.id));
                                }) })] })] })), !!abschlaege.length && (_jsxs("div", { style: card, children: [_jsx("h3", { style: { marginTop: 0 }, children: "Abschlagsrechnungen" }), _jsxs("table", { style: tbl, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: th, children: "Nr" }), _jsx("th", { style: th, children: "Datum" }), _jsx("th", { style: { ...th, textAlign: "right" }, children: "Netto (\u20AC)" }), _jsx("th", { style: { ...th, textAlign: "right" }, children: "Brutto (\u20AC)" }), _jsx("th", { style: th })] }) }), _jsx("tbody", { children: abschlaege.map(a => (_jsxs("tr", { children: [_jsx("td", { style: td, children: a.nr }), _jsx("td", { style: td, children: a.datum }), _jsx("td", { style: { ...td, textAlign: "right" }, children: num(a.betrag) }), _jsx("td", { style: { ...td, textAlign: "right" }, children: num(a.betrag * (1 + mwst / 100)) }), _jsx("td", { style: td, children: _jsx("button", { className: "btn", onClick: () => delAbschlag(a), children: "\uD83D\uDDD1\uFE0F" }) })] }, a.id || `a-${a.nr}-${a.datum}`))) })] }), _jsxs("div", { style: { marginTop: 8, fontWeight: 600 }, children: ["Ist Netto: ", num(istNetto), " \u20AC \u00B7 Ist Brutto: ", num(istBrutto), " \u20AC"] })] })), _jsxs("div", { style: card, children: [_jsx("h3", { style: { marginTop: 0 }, children: "Vergleich \u2013 Soll vs. Ist" }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }, children: [_jsx(Box, { label: "Soll Netto", value: `${num(sollNetto)} €` }), _jsx(Box, { label: "Ist Netto", value: `${num(istNetto)} €` }), _jsx(Box, { label: "Differenz Netto (Ist\u2212Soll)", value: `${num(diffNetto)} €`, color: diffNetto >= 0 ? "#065f46" : "#991b1b" }), _jsx(Box, { label: "Deckungsgrad", value: `${deckungsgrad}%` })] })] })] }));
}
/* ======================= Small UI ======================= */
function Kpi({ title, children }) {
    return (_jsxs("div", { style: { border: "1px dashed var(--line)", borderRadius: 10, padding: "10px 12px", background: "#fafafa" }, children: [_jsx("div", { style: { fontSize: 12, color: "var(--muted)" }, children: title }), _jsx("div", { style: { fontSize: 16, fontWeight: 700 }, children: children })] }));
}
function Box({ label, value, color }) {
    return (_jsxs("div", { style: { border: "1px solid #e5e7eb", borderRadius: 10, padding: 12 }, children: [_jsx("div", { style: { fontSize: 12, color: "var(--muted)" }, children: label }), _jsx("div", { style: { fontSize: 18, fontWeight: 800, color: color || "inherit" }, children: value })] }));
}
