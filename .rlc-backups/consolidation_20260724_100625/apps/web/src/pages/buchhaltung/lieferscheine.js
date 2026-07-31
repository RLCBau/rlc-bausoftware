import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useMemo, useState } from "react";
import { useLieferscheine } from "./stores";
import "./styles.css";
const eur = (n) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function parseDate(s) {
    // supporta ISO o dd.mm.yyyy
    if (!s)
        return new Date(0);
    if (/\d{2}\.\d{2}\.\d{4}/.test(s)) {
        const [d, m, y] = s.split(".").map(Number);
        return new Date(y, (m || 1) - 1, d || 1);
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? new Date(0) : d;
}
export default function LieferscheineKosten() {
    const [ls, setLs] = useLieferscheine();
    const [q, setQ] = useState("");
    const [ks, setKs] = useState("ALL");
    const [lieferant, setLieferant] = useState("ALL");
    const [sort, setSort] = useState("datum_desc");
    const kostenstellen = useMemo(() => {
        const all = Array.from(new Set(ls.map((x) => x.kostenstelle).filter(Boolean)));
        all.sort((a, b) => String(a).localeCompare(String(b)));
        return ["ALL", ...all];
    }, [ls]);
    const lieferanten = useMemo(() => {
        const all = Array.from(new Set(ls.map((x) => x.lieferant).filter(Boolean)));
        all.sort((a, b) => String(a).localeCompare(String(b)));
        return ["ALL", ...all];
    }, [ls]);
    const filtered = useMemo(() => {
        let arr = ls.slice();
        if (ks !== "ALL")
            arr = arr.filter((x) => x.kostenstelle === ks);
        if (lieferant !== "ALL")
            arr = arr.filter((x) => (x.lieferant || "") === lieferant);
        if (q.trim()) {
            const qq = q.trim().toLowerCase();
            arr = arr.filter((x) => {
                const hay = [
                    x.nummer,
                    x.datum,
                    x.kostenstelle,
                    x.lieferant,
                    String(x.kosten ?? ""),
                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase();
                return hay.includes(qq);
            });
        }
        arr.sort((a, b) => {
            const da = parseDate(a.datum).getTime();
            const db = parseDate(b.datum).getTime();
            const ka = Number(a.kosten || 0);
            const kb = Number(b.kosten || 0);
            switch (sort) {
                case "datum_asc":
                    return da - db;
                case "datum_desc":
                    return db - da;
                case "kosten_asc":
                    return ka - kb;
                case "kosten_desc":
                    return kb - ka;
                default:
                    return db - da;
            }
        });
        return arr;
    }, [ls, q, ks, lieferant, sort]);
    const sum = useMemo(() => filtered.reduce((s, x) => s + (x.kosten || 0), 0), [filtered]);
    const addEmpty = () => {
        const now = new Date();
        const iso = now.toISOString().slice(0, 10);
        const item = {
            id: cryptoRandomId(),
            nummer: `LS-${String(ls.length + 1).padStart(3, "0")}`,
            datum: iso,
            kostenstelle: "Projekt",
            kosten: 0,
            lieferant: "",
        };
        setLs((prev) => [item, ...prev]);
    };
    const update = (id, patch) => {
        setLs((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    };
    const remove = (id) => {
        if (!confirm("Lieferschein löschen?"))
            return;
        setLs((prev) => prev.filter((x) => x.id !== id));
    };
    const exportCSV = () => {
        const rows = filtered.map((x) => ({
            Nummer: x.nummer || "",
            Datum: x.datum || "",
            Kostenstelle: x.kostenstelle || "",
            Lieferant: x.lieferant || "",
            Kosten: Number(x.kosten || 0).toFixed(2),
        }));
        downloadCSV(rows, "lieferscheine_kosten.csv");
    };
    return (_jsxs("div", { className: "bh-page", children: [_jsxs("div", { className: "bh-header-row", children: [_jsx("h2", { children: "Lieferscheine (Kosten)" }), _jsxs("div", { className: "bh-actions", children: [_jsx("button", { className: "bh-btn", onClick: addEmpty, children: "+ Neu" }), _jsx("button", { className: "bh-btn ghost", onClick: exportCSV, disabled: !filtered.length, children: "Export CSV" })] })] }), _jsxs("div", { className: "bh-filters", children: [_jsxs("div", { children: [_jsx("label", { children: "Suche" }), _jsx("input", { value: q, onChange: (e) => setQ(e.target.value), placeholder: "Nummer / Lieferant / Kostenstelle\u2026" })] }), _jsxs("div", { children: [_jsx("label", { children: "Kostenstelle" }), _jsx("select", { value: ks, onChange: (e) => setKs(e.target.value), children: kostenstellen.map((x) => (_jsx("option", { value: x, children: x }, x))) })] }), _jsxs("div", { children: [_jsx("label", { children: "Lieferant" }), _jsx("select", { value: lieferant, onChange: (e) => setLieferant(e.target.value), children: lieferanten.map((x) => (_jsx("option", { value: x, children: x }, x))) })] }), _jsxs("div", { children: [_jsx("label", { children: "Sortierung" }), _jsxs("select", { value: sort, onChange: (e) => setSort(e.target.value), children: [_jsx("option", { value: "datum_desc", children: "Datum (neu \u2192 alt)" }), _jsx("option", { value: "datum_asc", children: "Datum (alt \u2192 neu)" }), _jsx("option", { value: "kosten_desc", children: "Kosten (hoch \u2192 niedrig)" }), _jsx("option", { value: "kosten_asc", children: "Kosten (niedrig \u2192 hoch)" })] })] }), _jsx("div", { className: "bh-filters-right", children: _jsxs("div", { style: { fontWeight: 700, paddingTop: 22 }, children: ["Summe: ", eur(sum), " \u20AC"] }) })] }), _jsxs("div", { className: "bh-panel", children: [_jsx("div", { className: "bh-panel-head", children: _jsxs("h3", { children: ["Eintr\u00E4ge (", filtered.length, ")"] }) }), _jsxs("table", { className: "bh-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Nummer" }), _jsx("th", { children: "Datum" }), _jsx("th", { children: "Kostenstelle" }), _jsx("th", { children: "Lieferant" }), _jsx("th", { style: { textAlign: "right" }, children: "Kosten (\u20AC)" }), _jsx("th", { children: "Aktion" })] }) }), _jsxs("tbody", { children: [filtered.map((x) => (_jsxs("tr", { children: [_jsx("td", { children: _jsx("input", { value: x.nummer || "", onChange: (e) => update(x.id, { nummer: e.target.value }), style: { width: 160 } }) }), _jsx("td", { children: _jsx("input", { value: x.datum || "", onChange: (e) => update(x.id, { datum: e.target.value }), style: { width: 140 } }) }), _jsx("td", { children: _jsx("input", { value: x.kostenstelle || "", onChange: (e) => update(x.id, { kostenstelle: e.target.value }), style: { width: 220 } }) }), _jsx("td", { children: _jsx("input", { value: x.lieferant || "", onChange: (e) => update(x.id, { lieferant: e.target.value }), style: { width: 220 } }) }), _jsx("td", { style: { textAlign: "right" }, children: _jsx("input", { value: String(x.kosten ?? 0), onChange: (e) => update(x.id, { kosten: Number(e.target.value || 0) }), style: { width: 140, textAlign: "right" } }) }), _jsx("td", { style: { whiteSpace: "nowrap" }, children: _jsx("button", { className: "bh-btn ghost", onClick: () => remove(x.id), children: "L\u00F6schen" }) })] }, x.id))), filtered.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 6, style: { textAlign: "center", color: "#777" }, children: "Keine Lieferscheine im aktuellen Filter." }) }))] })] }), _jsxs("div", { className: "bh-note", style: { marginTop: 10 }, children: ["Hinweis: Diese Seite nutzt den Buchhaltung-Store ", _jsx("code", { children: "useLieferscheine()" }), "(Key: ", _jsx("code", { children: "rlc_bh_lieferscheine" }), ")."] })] })] }));
}
function downloadCSV(rows, filename) {
    if (!rows.length)
        return;
    const headers = Object.keys(rows[0]);
    const csv = [
        headers.join(";"),
        ...rows.map((r) => headers.map((h) => String(r[h] ?? "")).join(";")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
}
function cryptoRandomId() {
    try {
        // @ts-ignore
        if (globalThis.crypto?.randomUUID)
            return globalThis.crypto.randomUUID();
    }
    catch { }
    return `id_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}
