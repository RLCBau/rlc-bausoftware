import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { useProject } from "../../store/useProject";
import { useLieferscheine } from "./stores";
import "./styles.css";
const eur = (n) => safeNumber(n).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});
function safeTrim(v) {
    return String(v ?? "").trim();
}
function safeNumber(v, fallback = 0) {
    if (v === null || v === undefined || v === "")
        return fallback;
    const normalized = typeof v === "string" ? v.replace(/\s/g, "").replace(",", ".") : v;
    const n = Number(normalized);
    return Number.isFinite(n) ? n : fallback;
}
function parseDate(s) {
    const value = safeTrim(s);
    if (!value)
        return new Date(0);
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(value)) {
        const [d, m, y] = value.split(".").map(Number);
        return new Date(y, (m || 1) - 1, d || 1);
    }
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? new Date(0) : d;
}
export default function LieferscheineKosten() {
    const { getSelectedProject } = useProject();
    const project = getSelectedProject?.();
    const activeProjectId = safeTrim(project?.id);
    const activeProjectCode = safeTrim(project?.code);
    const activeProjectKey = activeProjectCode || activeProjectId;
    const [ls, setLs] = useLieferscheine();
    const [q, setQ] = useState("");
    const [ks, setKs] = useState("ALL");
    const [lieferant, setLieferant] = useState("ALL");
    const [sort, setSort] = useState("datum_desc");
    const normalizedLs = useMemo(() => {
        return (ls || []).map((x) => ({
            ...x,
            id: safeTrim(x.id) || cryptoRandomId(),
            nummer: safeTrim(x.nummer),
            datum: safeTrim(x.datum),
            kostenstelle: safeTrim(x.kostenstelle),
            lieferant: safeTrim(x.lieferant),
            kosten: safeNumber(x.kosten ?? x.betrag ?? 0),
            projekt: safeTrim(x.projekt),
            projectId: safeTrim(x.projectId),
            projectCode: safeTrim(x.projectCode)
        }));
    }, [ls]);
    const projectFiltered = useMemo(() => {
        if (!activeProjectKey)
            return normalizedLs;
        const hasProjectInfo = normalizedLs.some((x) => safeTrim(x.projectCode) || safeTrim(x.projectId) || safeTrim(x.projekt));
        if (!hasProjectInfo)
            return normalizedLs;
        return normalizedLs.filter((x) => {
            return [x.projectCode, x.projectId, x.projekt].
                map((v) => safeTrim(v)).
                filter(Boolean).
                includes(activeProjectKey);
        });
    }, [normalizedLs, activeProjectKey]);
    const kostenstellen = useMemo(() => {
        const all = Array.from(new Set(projectFiltered.map((x) => safeTrim(x.kostenstelle)).filter(Boolean)));
        all.sort((a, b) => String(a).localeCompare(String(b), "de"));
        return ["ALL", ...all];
    }, [projectFiltered]);
    const lieferanten = useMemo(() => {
        const all = Array.from(new Set(projectFiltered.map((x) => safeTrim(x.lieferant)).filter(Boolean)));
        all.sort((a, b) => String(a).localeCompare(String(b), "de"));
        return ["ALL", ...all];
    }, [projectFiltered]);
    const filtered = useMemo(() => {
        let arr = projectFiltered.slice();
        if (ks !== "ALL") {
            arr = arr.filter((x) => safeTrim(x.kostenstelle) === ks);
        }
        if (lieferant !== "ALL") {
            arr = arr.filter((x) => safeTrim(x.lieferant) === lieferant);
        }
        if (q.trim()) {
            const qq = q.trim().toLowerCase();
            arr = arr.filter((x) => {
                const hay = [
                    x.nummer,
                    x.datum,
                    x.kostenstelle,
                    x.lieferant,
                    String(x.kosten ?? ""),
                    x.projectCode,
                    x.projectId,
                    x.projekt
                ].
                    filter(Boolean).
                    join(" ").
                    toLowerCase();
                return hay.includes(qq);
            });
        }
        return arr.slice().sort((a, b) => {
            const da = parseDate(a.datum).getTime();
            const db = parseDate(b.datum).getTime();
            const ka = safeNumber(a.kosten, 0);
            const kb = safeNumber(b.kosten, 0);
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
    }, [projectFiltered, q, ks, lieferant, sort]);
    const totalSum = useMemo(() => filtered.reduce((s, x) => s + safeNumber(x.kosten, 0), 0), [filtered]);
    const addEmpty = () => {
        const now = new Date();
        const iso = now.toISOString().slice(0, 10);
        const item = {
            id: cryptoRandomId(),
            nummer: `LS-${String(normalizedLs.length + 1).padStart(3, "0")}`,
            datum: iso,
            kostenstelle: "Projekt",
            kosten: 0,
            lieferant: "",
            ...(activeProjectId ? { projectId: activeProjectId } : {}),
            ...(activeProjectCode ? { projectCode: activeProjectCode } : {})
        };
        setLs((prev) => [item, ...prev]);
    };
    const update = (id, patch) => {
        setLs((prev) => prev.map((x) => x.id === id ?
            {
                ...x,
                ...patch,
                ...(patch.kosten !== undefined ?
                    { kosten: safeNumber(patch.kosten, 0) } :
                    {})
            } :
            x));
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
            Kosten: safeNumber(x.kosten, 0).toFixed(2),
            Projektcode: x.projectCode || "",
            ProjektID: x.projectId || ""
        }));
        downloadCSV(rows, "lieferscheine_kosten.csv");
    };
    return (_jsxs("div", { className: "bh-page", children: [_jsxs("div", { className: "bh-header-row", children: [_jsxs("div", { children: [_jsx("h2", { children: "Lieferscheine (Kosten)" }), _jsx("div", { className: "bh-note rlc-migrated-pages-buchhaltung-lieferscheine-tsx-237", children: activeProjectKey ?
                                    _jsxs(_Fragment, { children: ["Aktuelles Projekt: ", _jsx("b", { children: activeProjectKey })] }) :
                                    "Kein Projekt ausgewählt" })] }), _jsxs("div", { className: "bh-actions", children: [_jsx("button", { className: "bh-btn", onClick: addEmpty, children: "+ Neu" }), _jsx("button", { className: "bh-btn ghost", onClick: exportCSV, disabled: !filtered.length, children: "Export CSV" })] })] }), _jsxs("div", { className: "bh-filters", children: [_jsxs("div", { children: [_jsx("label", { children: "Suche" }), _jsx("input", { value: q, onChange: (e) => setQ(e.target.value), placeholder: "Nummer / Lieferant / Kostenstelle\u2026" })] }), _jsxs("div", { children: [_jsx("label", { children: "Kostenstelle" }), _jsx("select", { value: ks, onChange: (e) => setKs(e.target.value), children: kostenstellen.map((x) => _jsx("option", { value: x, children: x === "ALL" ? "Alle" : x }, x)) })] }), _jsxs("div", { children: [_jsx("label", { children: "Lieferant" }), _jsx("select", { value: lieferant, onChange: (e) => setLieferant(e.target.value), children: lieferanten.map((x) => _jsx("option", { value: x, children: x === "ALL" ? "Alle" : x }, x)) })] }), _jsxs("div", { children: [_jsx("label", { children: "Sortierung" }), _jsxs("select", { value: sort, onChange: (e) => setSort(e.target.value), children: [_jsx("option", { value: "datum_desc", children: "Datum (neu \u2192 alt)" }), _jsx("option", { value: "datum_asc", children: "Datum (alt \u2192 neu)" }), _jsx("option", { value: "kosten_desc", children: "Kosten (hoch \u2192 niedrig)" }), _jsx("option", { value: "kosten_asc", children: "Kosten (niedrig \u2192 hoch)" })] })] }), _jsx("div", { className: "bh-filters-right", children: _jsxs("div", { className: "rlc-migrated-pages-buchhaltung-lieferscheine-tsx-238", children: ["Summe: ", eur(totalSum), " \u20AC"] }) })] }), _jsxs("div", { className: "bh-panel", children: [_jsx("div", { className: "bh-panel-head", children: _jsxs("h3", { children: ["Eintr\u00E4ge (", filtered.length, ")"] }) }), _jsxs("table", { className: "bh-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Nummer" }), _jsx("th", { children: "Datum" }), _jsx("th", { children: "Kostenstelle" }), _jsx("th", { children: "Lieferant" }), _jsx("th", { className: "rlc-migrated-pages-buchhaltung-lieferscheine-tsx-239", children: "Kosten (\u20AC)" }), _jsx("th", { children: "Aktion" })] }) }), _jsxs("tbody", { children: [filtered.map((x) => _jsxs("tr", { children: [_jsx("td", { children: _jsx("input", { value: x.nummer || "", onChange: (e) => update(x.id, { nummer: e.target.value }), className: "rlc-migrated-pages-buchhaltung-lieferscheine-tsx-240" }) }), _jsx("td", { children: _jsx("input", { value: x.datum || "", onChange: (e) => update(x.id, { datum: e.target.value }), className: "rlc-migrated-pages-buchhaltung-lieferscheine-tsx-241" }) }), _jsx("td", { children: _jsx("input", { value: x.kostenstelle || "", onChange: (e) => update(x.id, { kostenstelle: e.target.value }), className: "rlc-migrated-pages-buchhaltung-lieferscheine-tsx-242" }) }), _jsx("td", { children: _jsx("input", { value: x.lieferant || "", onChange: (e) => update(x.id, { lieferant: e.target.value }), className: "rlc-migrated-pages-buchhaltung-lieferscheine-tsx-243" }) }), _jsx("td", { className: "rlc-migrated-pages-buchhaltung-lieferscheine-tsx-244", children: _jsx("input", { value: String(safeNumber(x.kosten, 0)), onChange: (e) => update(x.id, { kosten: safeNumber(e.target.value, 0) }), className: "rlc-migrated-pages-buchhaltung-lieferscheine-tsx-245" }) }), _jsx("td", { className: "rlc-migrated-pages-buchhaltung-lieferscheine-tsx-246", children: _jsx("button", { className: "bh-btn ghost", onClick: () => remove(x.id), children: "L\u00F6schen" }) })] }, x.id)), filtered.length === 0 &&
                                        _jsx("tr", { children: _jsx("td", { colSpan: 6, className: "rlc-migrated-pages-buchhaltung-lieferscheine-tsx-247", children: "Keine Lieferscheine im aktuellen Filter." }) })] })] }), _jsxs("div", { className: "bh-note rlc-migrated-pages-buchhaltung-lieferscheine-tsx-248", children: ["Hinweis: Diese Seite nutzt aktuell den Buchhaltung-Store", " ", _jsx("code", { children: "useLieferscheine()" }), " (Key: ", _jsx("code", { children: "rlc_bh_lieferscheine" }), "). Sp\u00E4ter sollte sie mit derselben Lieferschein-Logik wie mobile/server zusammengef\u00FChrt werden, damit Buchhaltung und Baustelle auf dieselben Daten zugreifen."] })] })] }));
}
function downloadCSV(rows, filename) {
    if (!rows.length) {
        alert("Keine Daten für den Export vorhanden.");
        return;
    }
    const headers = Object.keys(rows[0]);
    const csv = [
        headers.join(";"),
        ...rows.map((r) => headers.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(";"))
    ].
        join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    const href = URL.createObjectURL(blob);
    a.href = href;
    a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(href);
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
