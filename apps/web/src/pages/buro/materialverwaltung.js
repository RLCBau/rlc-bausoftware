import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
import React from "react";
import { MaterialDB } from "./store.material";
const th = {
    textAlign: "left",
    padding: "8px 10px",
    borderBottom: "1px solid var(--line)",
    fontSize: 13,
    whiteSpace: "nowrap"
};
const td = {
    padding: "6px 10px",
    borderBottom: "1px solid var(--line)",
    fontSize: 13,
    verticalAlign: "middle"
};
const inp = {
    border: "1px solid var(--line)",
    borderRadius: 6,
    padding: "6px 8px",
    fontSize: 13
};
const lbl = {
    fontSize: 12,
    opacity: 0.8
};
function getMoveWhen(m) {
    const v = m.when ??
        m.date ??
        m.createdAt ??
        m.timestamp ??
        "";
    return String(v || "");
}
export default function Materialverwaltung() {
    const [all, setAll] = React.useState(MaterialDB.list());
    const [selId, setSelId] = React.useState(MaterialDB.list()[0]?.id ?? null);
    const [q, setQ] = React.useState("");
    const [proj, setProj] = React.useState("");
    const [onlyLow, setOnlyLow] = React.useState(false);
    const refresh = React.useCallback(() => {
        const next = MaterialDB.list();
        setAll(next);
        setSelId((prev) => {
            if (prev && next.some((x) => x.id === prev))
                return prev;
            return next[0]?.id ?? null;
        });
    }, []);
    const sel = React.useMemo(() => all.find((x) => x.id === selId) ?? null, [all, selId]);
    const filtered = React.useMemo(() => {
        const qq = q.trim().toLowerCase();
        return all.filter((m) => {
            const s = `${m.name} ${m.code ?? ""} ${m.projectId ?? ""} ${m.location ?? ""}`.toLowerCase();
            const okQ = !qq || s.includes(qq);
            const okP = !proj || (m.projectId ?? "") === proj;
            const okL = !onlyLow || (m.stock ?? 0) <= (m.minStock ?? 0);
            return okQ && okP && okL;
        });
    }, [all, q, proj, onlyLow]);
    const projects = React.useMemo(() => Array.from(new Set(all.map((m) => m.projectId).filter(Boolean))), [all]);
    const add = React.useCallback(() => {
        const it = MaterialDB.create();
        refresh();
        setSelId(it.id);
    }, [refresh]);
    const del = React.useCallback(() => {
        if (!sel)
            return;
        if (!confirm("Artikel löschen?"))
            return;
        MaterialDB.remove(sel.id);
        refresh();
    }, [sel, refresh]);
    const up = React.useCallback((p) => {
        if (!sel)
            return;
        const next = { ...sel, ...p, updatedAt: Date.now() };
        MaterialDB.upsert(next);
        setSelId(next.id);
        refresh();
    }, [sel, refresh]);
    const move = React.useCallback((dir) => {
        if (!sel)
            return;
        const qty = Number(prompt(dir === "IN" ? "Eingang Menge:" : "Ausgang Menge:", "1"));
        if (!qty || qty <= 0)
            return;
        const rawMove = {
            id: crypto.randomUUID(),
            when: new Date().toISOString(),
            dir,
            qty,
            projectId: sel.projectId || "",
            note: ""
        };
        MaterialDB.addMove(sel.id, rawMove);
        refresh();
    }, [sel, refresh]);
    const onDrop = React.useCallback(async (ev) => {
        ev.preventDefault();
        if (!sel)
            return;
        const f = ev.dataTransfer.files?.[0];
        if (!f)
            return;
        await MaterialDB.attach(sel.id, f);
        refresh();
    }, [sel, refresh]);
    const open = React.useCallback((a) => {
        const w = window.open(a.dataURL, "_blank");
        if (!w)
            alert("Popup blockiert.");
    }, []);
    const importCSV = React.useCallback(() => {
        pickFile(async (f) => {
            const n = MaterialDB.importCSV(await f.text());
            alert(`Import: ${n} Artikel.`);
            refresh();
        });
    }, [refresh]);
    const exportCSV = React.useCallback(() => {
        download("text/csv;charset=utf-8", "material.csv", MaterialDB.exportCSV(filtered));
    }, [filtered]);
    const exportJSON = React.useCallback(() => {
        download("application/json", "material_backup.json", MaterialDB.exportJSON());
    }, []);
    const importJSON = React.useCallback(() => {
        pickFile(async (f) => {
            const n = MaterialDB.importJSON(await f.text());
            alert(`Backup importiert: ${n}.`);
            refresh();
        });
    }, [refresh]);
    const printLabel = React.useCallback(() => {
        if (!sel)
            return;
        const html = `
      <html>
        <body style="font-family:Inter,Arial;padding:12px">
          <div style="border:1px solid #333;padding:10px;width:280px">
            <div style="font-weight:700">${escapeHtml(sel.name || "")}</div>
            <div>${escapeHtml(sel.code || "")}</div>
            <div style="font-size:12px;opacity:.8">${escapeHtml(sel.location || "")}</div>
          </div>
          <script>window.print();</script>
        </body>
      </html>
    `;
        const w = window.open("", "_blank");
        if (!w) {
            alert("Popup blockiert.");
            return;
        }
        w.document.write(html);
        w.document.close();
    }, [sel]);
    return (_jsxs("div", { className: "rlc-migrated-pages-buro-materialverwaltung-tsx-559", children: [_jsxs("div", { className: "card rlc-migrated-pages-buro-materialverwaltung-tsx-560", children: [_jsx("button", { className: "btn", onClick: add, children: "+ Artikel" }), _jsx("button", { className: "btn", onClick: del, disabled: !sel, children: "L\u00F6schen" }), _jsx("div", { className: "rlc-migrated-pages-buro-materialverwaltung-tsx-561" }), _jsx("input", { placeholder: "Suche Name / Code / Projekt\u2026", value: q, onChange: (e) => setQ(e.target.value), className: rlcClass(null, { ...inp, width: 280 }) }), _jsxs("select", { value: proj, onChange: (e) => setProj(e.target.value), className: rlcClass(null, { ...inp, width: 160 }), children: [_jsx("option", { value: "", children: "Alle Projekte" }), projects.map((p) => _jsx("option", { value: p, children: p }, p))] }), _jsxs("label", { className: "rlc-migrated-pages-buro-materialverwaltung-tsx-562", children: [_jsx("input", { type: "checkbox", checked: onlyLow, onChange: (e) => setOnlyLow(e.target.checked) }), _jsx("span", { className: "rlc-migrated-pages-buro-materialverwaltung-tsx-563", children: "nur Unterbestand" })] }), _jsx("button", { className: "btn", onClick: importCSV, children: "Import CSV" }), _jsx("button", { className: "btn", onClick: exportCSV, children: "Export CSV" }), _jsx("button", { className: "btn", onClick: importJSON, children: "Import JSON" }), _jsx("button", { className: "btn", onClick: exportJSON, children: "Export JSON" })] }), _jsxs("div", { className: "rlc-migrated-pages-buro-materialverwaltung-tsx-564", children: [_jsx("div", { className: "card rlc-migrated-pages-buro-materialverwaltung-tsx-565", children: _jsxs("table", { className: "rlc-migrated-pages-buro-materialverwaltung-tsx-566", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, th), children: "Name" }), _jsx("th", { className: rlcClass(null, th), children: "Code" }), _jsx("th", { className: rlcClass(null, th), children: "Projekt" }), _jsx("th", { className: rlcClass(null, th), children: "Ort" }), _jsx("th", { className: rlcClass(null, th), children: "Einheit" }), _jsx("th", { className: rlcClass(null, th), children: "Bestand" }), _jsx("th", { className: rlcClass(null, th), children: "min" }), _jsx("th", { className: rlcClass(null, th), children: "Preis Netto" })] }) }), _jsxs("tbody", { children: [filtered.map((it) => {
                                            const low = (it.stock ?? 0) <= (it.minStock ?? 0);
                                            return (_jsxs("tr", { onClick: () => setSelId(it.id), className: rlcClass(null, {
                                                    cursor: "pointer",
                                                    background: sel?.id === it.id ? "#f1f5ff" : undefined
                                                }), children: [_jsx("td", { className: rlcClass(null, td), children: _jsx("b", { children: it.name }) }), _jsx("td", { className: rlcClass(null, td), children: it.code || "—" }), _jsx("td", { className: rlcClass(null, td), children: it.projectId || "—" }), _jsx("td", { className: rlcClass(null, td), children: it.location || "—" }), _jsx("td", { className: rlcClass(null, td), children: it.unit || "—" }), _jsx("td", { className: rlcClass(null, { ...td, color: low ? "#c03" : undefined }), children: it.stock ?? 0 }), _jsx("td", { className: rlcClass(null, td), children: it.minStock ?? 0 }), _jsx("td", { className: rlcClass(null, td), children: typeof it.priceNet === "number" ?
                                                            `${it.priceNet.toFixed(2)} €` :
                                                            "—" })] }, it.id));
                                        }), filtered.length === 0 &&
                                            _jsx("tr", { children: _jsx("td", { className: rlcClass(null, { ...td, opacity: 0.6 }), colSpan: 8, children: "Keine Artikel." }) })] })] }) }), _jsx("div", { className: "card rlc-migrated-pages-buro-materialverwaltung-tsx-567", onDragOver: (e) => e.preventDefault(), onDrop: onDrop, children: !sel ?
                            _jsx("div", { className: "rlc-migrated-pages-buro-materialverwaltung-tsx-568", children: "Links Artikel w\u00E4hlen oder neu anlegen." }) :
                            _jsxs("div", { className: "rlc-migrated-pages-buro-materialverwaltung-tsx-569", children: [_jsx("label", { className: rlcClass(null, lbl), children: "Name" }), _jsx("input", { className: rlcClass(null, inp), value: sel.name, onChange: (e) => up({ name: e.target.value }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Code (Barcode/RFID)" }), _jsx("input", { className: rlcClass(null, inp), value: sel.code ?? "", onChange: (e) => up({ code: e.target.value }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Projekt-ID" }), _jsx("input", { className: rlcClass(null, inp), value: sel.projectId ?? "", onChange: (e) => up({ projectId: e.target.value }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Ort/Lager" }), _jsx("input", { className: rlcClass(null, inp), value: sel.location ?? "", onChange: (e) => up({ location: e.target.value }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Einheit" }), _jsx("input", { className: rlcClass(null, inp), value: sel.unit ?? "", onChange: (e) => up({ unit: e.target.value }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Bestand" }), _jsx("input", { type: "number", className: rlcClass(null, inp), value: sel.stock ?? 0, onChange: (e) => up({ stock: Number(e.target.value) || 0 }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Mindestbestand" }), _jsx("input", { type: "number", className: rlcClass(null, inp), value: sel.minStock ?? 0, onChange: (e) => up({ minStock: Number(e.target.value) || 0 }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Preis Netto (\u20AC)" }), _jsx("input", { type: "number", step: "0.01", className: rlcClass(null, inp), value: sel.priceNet ?? 0, onChange: (e) => up({ priceNet: Number(e.target.value) || 0 }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Lieferant" }), _jsx("input", { className: rlcClass(null, inp), value: sel.supplier ?? "", onChange: (e) => up({ supplier: e.target.value }) }), _jsxs("div", { className: "rlc-migrated-pages-buro-materialverwaltung-tsx-570", children: [_jsx("button", { className: "btn", onClick: () => move("IN"), children: "+ Eingang" }), _jsx("button", { className: "btn", onClick: () => move("OUT"), children: "\u2212 Ausgang" }), _jsx("button", { className: "btn", onClick: printLabel, children: "Etikett drucken" })] }), _jsx("label", { className: rlcClass(null, { ...lbl, gridColumn: "1 / -1" }), children: "Bewegungen" }), _jsx("div", { className: "rlc-migrated-pages-buro-materialverwaltung-tsx-571", children: _jsxs("table", { className: "rlc-migrated-pages-buro-materialverwaltung-tsx-572", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, th), children: "Datum" }), _jsx("th", { className: rlcClass(null, th), children: "Typ" }), _jsx("th", { className: rlcClass(null, th), children: "Menge" }), _jsx("th", { className: rlcClass(null, th), children: "Projekt" }), _jsx("th", { className: rlcClass(null, th), children: "Notiz" })] }) }), _jsxs("tbody", { children: [(sel.moves || []).
                                                            slice().
                                                            sort((a, b) => new Date(getMoveWhen(b)).getTime() -
                                                            new Date(getMoveWhen(a)).getTime()).
                                                            map((m) => _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, td), children: getMoveWhen(m) ?
                                                                        new Date(getMoveWhen(m)).toLocaleString() :
                                                                        "—" }), _jsx("td", { className: rlcClass(null, td), children: m.dir }), _jsx("td", { className: rlcClass(null, td), children: m.qty }), _jsx("td", { className: rlcClass(null, td), children: m.projectId || "—" }), _jsx("td", { className: rlcClass(null, td), children: m.note || "—" })] }, m.id)), (sel.moves || []).length === 0 &&
                                                            _jsx("tr", { children: _jsx("td", { className: rlcClass(null, { ...td, opacity: 0.6 }), colSpan: 5, children: "Keine Bewegungen." }) })] })] }) }), _jsx("label", { className: rlcClass(null, { ...lbl, gridColumn: "1 / -1" }), children: "Dokumente / Bilder (Drag&Drop)" }), _jsxs("div", { className: "rlc-migrated-pages-buro-materialverwaltung-tsx-573", children: [(sel.attachments || []).map((a) => _jsxs("div", { className: "rlc-migrated-pages-buro-materialverwaltung-tsx-574", children: [_jsxs("div", { className: "rlc-migrated-pages-buro-materialverwaltung-tsx-575", children: [_jsx("b", { title: a.name, className: "rlc-migrated-pages-buro-materialverwaltung-tsx-576", children: a.name }), _jsx("div", { className: "rlc-migrated-pages-buro-materialverwaltung-tsx-577" }), _jsx("button", { className: "btn", onClick: () => open(a), children: "\u00D6ffnen" })] }), (a.mime || "").startsWith("image/") &&
                                                        _jsx("img", { src: a.dataURL, alt: a.name, className: "rlc-migrated-pages-buro-materialverwaltung-tsx-578" })] }, a.id)), (sel.attachments || []).length === 0 &&
                                                _jsx("div", { className: "rlc-migrated-pages-buro-materialverwaltung-tsx-579", children: "Keine Anh\u00E4nge." })] })] }) })] })] }));
}
function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (m) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[m]);
}
function pickFile(onPick) {
    const i = document.createElement("input");
    i.type = "file";
    i.onchange = () => {
        const f = i.files?.[0];
        if (f)
            onPick(f);
    };
    i.click();
}
function download(type, name, data) {
    const b = new Blob([data], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
}
