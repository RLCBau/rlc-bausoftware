import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./styles.css";
import { useProject } from "../../store/useProject";
import { useRechnungen, useZahlungen, useLieferscheine } from "./stores";
/** =========================
 *  HELPERS
 *  ========================= */
const safeTrim = (v) => String(v ?? "").trim();
const safeNumber = (v, fallback = 0) => {
    if (v === null || v === undefined || v === "")
        return fallback;
    const normalized = typeof v === "string" ? v.replace(/\s/g, "").replace(",", ".") : v;
    const n = Number(normalized);
    return Number.isFinite(n) ? n : fallback;
};
const parseDate = (s) => {
    const value = safeTrim(s);
    if (!value)
        return new Date("1970-01-01");
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(value)) {
        const [d, m, y] = value.split(".").map(Number);
        return new Date(y, (m || 1) - 1, d || 1);
    }
    const dt = new Date(value);
    return Number.isNaN(dt.getTime()) ? new Date("1970-01-01") : dt;
};
const withinDays = (d, days) => {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - days);
    return d >= from;
};
const isSameMonth = (d, ref) => d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
const eur = (n) => safeNumber(n).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});
const sum = (arr) => arr.reduce((a, b) => a + safeNumber(b), 0);
const bruttoOf = (r) => safeNumber(r.netto) * (1 + safeNumber(r.mwstPct) / 100);
const projectKeysOf = (row) => [row.projectCode, row.projectId, row.projekt].
    map((v) => safeTrim(v)).
    filter(Boolean);
const matchesZeitraum = (datum, zeitraum) => {
    const d = parseDate(datum);
    switch (zeitraum) {
        case "30":
            return withinDays(d, 30);
        case "60":
            return withinDays(d, 60);
        case "90":
            return withinDays(d, 90);
        case "YTD":
            return d.getFullYear() === new Date().getFullYear();
        case "THIS_MONTH":
            return isSameMonth(d, new Date());
        default:
            return true;
    }
};
const invoiceStatusOf = (r) => {
    const brutto = bruttoOf(r);
    const gezahlt = safeNumber(r.gezahlt);
    if (gezahlt >= brutto - 0.01)
        return "PAID";
    if (gezahlt <= 0.01)
        return "OPEN";
    return "PART";
};
const csvEscape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const downloadCSV = (rows, filename) => {
    if (!rows.length) {
        alert("Keine Daten für den Export vorhanden.");
        return;
    }
    const headers = Object.keys(rows[0] || {});
    const csv = [
        headers.join(";"),
        ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(";"))
    ].
        join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    const href = URL.createObjectURL(blob);
    a.href = href;
    a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(href);
};
const spark = (series) => {
    if (!series.length)
        return "—";
    const max = Math.max(...series, 0);
    const glyphs = "▁▂▃▄▅▆▇█";
    return series.
        map((n) => {
        const idx = max === 0 ? 0 : Math.round(safeNumber(n) / max * (glyphs.length - 1));
        return glyphs.charAt(idx);
    }).
        join("");
};
/** =========================
 *  COMPONENT
 *  ========================= */
export default function Kostenuebersicht() {
    const nav = useNavigate();
    const ctx = useProject();
    const cur = ctx?.currentProject || ctx?.selectedProject || ctx?.getSelectedProject?.() || null;
    const currentProjectCode = safeTrim(cur?.code);
    const currentProjectId = safeTrim(cur?.id);
    const activeProjectKey = currentProjectCode || currentProjectId || "";
    const [rechnungen] = useRechnungen();
    const [zahlungen] = useZahlungen();
    const [lieferscheine] = useLieferscheine();
    const [zeitraum, setZeitraum] = useState("THIS_MONTH");
    const [kunde, setKunde] = useState("ALL");
    const [status, setStatus] = useState("ALL");
    const rechnungenUI = useMemo(() => {
        return (rechnungen || []).map((r) => ({
            id: String(r.id ?? ""),
            nr: String(r.nummer ?? r.nr ?? r.id ?? "—"),
            datum: String(r.datum || ""),
            faellig: r.faellig ? String(r.faellig) : undefined,
            kunde: String(r.kunde ?? r.client ?? r.auftraggeber ?? "—"),
            netto: safeNumber(r.betragNetto ?? r.netto ?? 0),
            mwstPct: safeNumber(r.mwstPct ?? r.mwst ?? 19),
            gezahlt: safeNumber(r.gezahlt ?? 0),
            projekt: r.projekt ? String(r.projekt) : undefined,
            projectId: r.projectId ? String(r.projectId) : undefined,
            projectCode: r.projectCode ? String(r.projectCode) : undefined
        }));
    }, [rechnungen]);
    const zahlungenUI = useMemo(() => {
        return (zahlungen || []).map((z) => ({
            id: String(z.id ?? ""),
            datum: String(z.datum || ""),
            kunde: z.kunde ? String(z.kunde) : undefined,
            betrag: safeNumber(z.betrag ?? 0),
            referenz: z.referenz ? String(z.referenz) : undefined,
            projekt: z.projekt ? String(z.projekt) : undefined,
            projectId: z.projectId ? String(z.projectId) : undefined,
            projectCode: z.projectCode ? String(z.projectCode) : undefined
        }));
    }, [zahlungen]);
    const kostenUI = useMemo(() => {
        return (lieferscheine || []).map((ls) => ({
            id: String(ls.id ?? ""),
            datum: String(ls.datum || ""),
            kostenstelle: ls.kostenstelle ? String(ls.kostenstelle) : undefined,
            lieferant: ls.lieferant ? String(ls.lieferant) : undefined,
            betrag: safeNumber(ls.kosten ?? ls.betrag ?? 0),
            projekt: ls.projekt ? String(ls.projekt) : undefined,
            projectId: ls.projectId ? String(ls.projectId) : undefined,
            projectCode: ls.projectCode ? String(ls.projectCode) : undefined
        }));
    }, [lieferscheine]);
    const filterByProject = (rows) => {
        if (!activeProjectKey)
            return rows;
        const hasAnyProjectInfo = rows.some((row) => projectKeysOf(row).length > 0);
        if (!hasAnyProjectInfo)
            return rows;
        return rows.filter((row) => projectKeysOf(row).includes(activeProjectKey));
    };
    const rechnungenProjectFiltered = useMemo(() => filterByProject(rechnungenUI), [rechnungenUI, activeProjectKey]);
    const zahlungenProjectFiltered = useMemo(() => filterByProject(zahlungenUI), [zahlungenUI, activeProjectKey]);
    const kostenProjectFiltered = useMemo(() => filterByProject(kostenUI), [kostenUI, activeProjectKey]);
    const kundenListe = useMemo(() => {
        const ks = Array.from(new Set(rechnungenProjectFiltered.map((r) => safeTrim(r.kunde)).filter(Boolean)));
        return ["ALL", ...ks];
    }, [rechnungenProjectFiltered]);
    const rechnungenGefiltert = useMemo(() => {
        let arr = rechnungenProjectFiltered.filter((r) => matchesZeitraum(r.datum, zeitraum));
        if (kunde !== "ALL") {
            arr = arr.filter((r) => safeTrim(r.kunde) === kunde);
        }
        if (status !== "ALL") {
            arr = arr.filter((r) => invoiceStatusOf(r) === status);
        }
        return arr;
    }, [rechnungenProjectFiltered, zeitraum, kunde, status]);
    const zahlungenGefiltert = useMemo(() => {
        return zahlungenProjectFiltered.filter((z) => {
            const okZeit = matchesZeitraum(z.datum, zeitraum);
            const okKunde = kunde === "ALL" ? true : safeTrim(z.kunde) === kunde;
            return okZeit && okKunde;
        });
    }, [zahlungenProjectFiltered, zeitraum, kunde]);
    const kostenGefiltert = useMemo(() => {
        return kostenProjectFiltered.filter((k) => matchesZeitraum(k.datum, zeitraum));
    }, [kostenProjectFiltered, zeitraum]);
    const reBrutto = useMemo(() => sum(rechnungenGefiltert.map((r) => bruttoOf(r))), [rechnungenGefiltert]);
    const zahlungenSum = useMemo(() => sum(zahlungenGefiltert.map((z) => safeNumber(z.betrag))), [zahlungenGefiltert]);
    const reGezahlt = zahlungenSum;
    const offenePosten = Math.max(0, reBrutto - reGezahlt);
    const kosten = useMemo(() => sum(kostenGefiltert.map((k) => safeNumber(k.betrag))), [kostenGefiltert]);
    const deckungsbeitrag = reGezahlt - kosten;
    const offeneListe = useMemo(() => {
        return rechnungenGefiltert.
            map((r) => {
            const brutto = bruttoOf(r);
            const bezahlt = safeNumber(r.gezahlt);
            return {
                ...r,
                offen: Math.max(0, brutto - bezahlt),
                brutto,
                bezahlt
            };
        }).
            filter((r) => r.offen > 0.01).
            sort((a, b) => b.offen - a.offen).
            slice(0, 10);
    }, [rechnungenGefiltert]);
    const kostenByKs = useMemo(() => {
        const map = new Map();
        for (const k of kostenGefiltert) {
            const key = safeTrim(k.kostenstelle) || "—";
            map.set(key, (map.get(key) || 0) + safeNumber(k.betrag));
        }
        return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    }, [kostenGefiltert]);
    const exportKPIs = () => {
        downloadCSV([
            { Kennzahl: "Rechnungen (Brutto)", Wert: reBrutto.toFixed(2) },
            { Kennzahl: "Zahlungseingänge", Wert: reGezahlt.toFixed(2) },
            { Kennzahl: "Offene Posten", Wert: offenePosten.toFixed(2) },
            { Kennzahl: "Kosten (Belege/Lieferscheine)", Wert: kosten.toFixed(2) },
            { Kennzahl: "Deckungsbeitrag", Wert: deckungsbeitrag.toFixed(2) }
        ], "kostenuebersicht_kpi.csv");
    };
    const exportOffen = () => {
        downloadCSV(offeneListe.map((o) => ({
            Nr: o.nr,
            Kunde: o.kunde,
            Datum: o.datum,
            Brutto: o.brutto.toFixed(2),
            Gezahlt: safeNumber(o.bezahlt).toFixed(2),
            Offen: o.offen.toFixed(2),
            Faellig: o.faellig || ""
        })), "offene_posten.csv");
    };
    const exportKosten = () => {
        downloadCSV(kostenByKs.map(([ks, betrag]) => ({
            Kostenstelle: ks,
            Betrag: betrag.toFixed(2)
        })), "kosten_nach_kostenstelle.csv");
    };
    const serieZahlungen = useMemo(() => {
        const days = [6, 5, 4, 3, 2, 1, 0];
        return days.map((daysAgo) => {
            const start = new Date();
            start.setHours(0, 0, 0, 0);
            start.setDate(start.getDate() - daysAgo);
            const end = new Date(start);
            end.setDate(end.getDate() + 1);
            return sum(zahlungenProjectFiltered.
                filter((z) => {
                const dt = parseDate(z.datum);
                return dt >= start && dt < end;
            }).
                map((z) => safeNumber(z.betrag)));
        });
    }, [zahlungenProjectFiltered]);
    return (_jsxs("div", { className: "bh-page", children: [_jsxs("div", { className: "bh-header-row", children: [_jsx("h2", { children: "Kosten\u00FCbersicht pro Projekt (live)" }), _jsxs("div", { className: "bh-actions", children: [_jsx("button", { className: "bh-btn ghost", onClick: () => nav("/buchhaltung/rechnungen"), children: "\u2192 Zu Rechnungen" }), _jsx("button", { className: "bh-btn ghost", onClick: () => nav("/buchhaltung/zahlungen"), children: "\u2192 Zu Zahlungen" }), _jsx("button", { className: "bh-btn ghost", onClick: () => nav("/buchhaltung/reports"), children: "\u2192 Zu Belegen" }), _jsx("button", { className: "bh-btn ghost", onClick: () => nav("/mengenermittlung/lieferscheine"), children: "\u2192 Zu Lieferscheinen" })] })] }), _jsxs("div", { className: "bh-filters", children: [_jsxs("div", { children: [_jsx("label", { children: "Zeitraum" }), _jsxs("select", { value: zeitraum, onChange: (e) => setZeitraum(e.target.value), children: [_jsx("option", { value: "THIS_MONTH", children: "Dieser Monat" }), _jsx("option", { value: "30", children: "Letzte 30 Tage" }), _jsx("option", { value: "60", children: "Letzte 60 Tage" }), _jsx("option", { value: "90", children: "Letzte 90 Tage" }), _jsx("option", { value: "YTD", children: "YTD" }), _jsx("option", { value: "ALL", children: "Alle" })] })] }), _jsxs("div", { children: [_jsx("label", { children: "Kunde" }), _jsx("select", { value: kunde, onChange: (e) => setKunde(e.target.value), children: kundenListe.map((k) => _jsx("option", { value: k, children: k === "ALL" ? "Alle" : k }, k)) })] }), _jsxs("div", { children: [_jsx("label", { children: "Status" }), _jsxs("select", { value: status, onChange: (e) => setStatus(e.target.value), children: [_jsx("option", { value: "ALL", children: "Alle" }), _jsx("option", { value: "OPEN", children: "Offen" }), _jsx("option", { value: "PART", children: "Teilbezahlt" }), _jsx("option", { value: "PAID", children: "Bezahlt" })] })] }), _jsx("div", { className: "bh-filters-right", children: _jsx("button", { className: "bh-btn", onClick: exportKPIs, children: "Export KPI (CSV)" }) })] }), _jsxs("div", { className: "bh-cards", children: [_jsxs("div", { className: "bh-card", children: [_jsx("div", { className: "k", children: "Rechnungen (Brutto)" }), _jsxs("div", { className: "v", children: [eur(reBrutto), " \u20AC"] }), _jsxs("div", { className: "s", children: ["Zahlungsserie: ", spark(serieZahlungen)] })] }), _jsxs("div", { className: "bh-card", children: [_jsx("div", { className: "k", children: "Zahlungseing\u00E4nge" }), _jsxs("div", { className: "v", children: [eur(reGezahlt), " \u20AC"] })] }), _jsxs("div", { className: "bh-card", children: [_jsx("div", { className: "k", children: "Offene Posten" }), _jsxs("div", { className: "v", children: [eur(offenePosten), " \u20AC"] })] }), _jsxs("div", { className: "bh-card", children: [_jsx("div", { className: "k", children: "Kosten (Belege/Lieferscheine)" }), _jsxs("div", { className: "v", children: [eur(kosten), " \u20AC"] }), _jsx("div", { className: "s", children: _jsxs("span", { className: "rlc-migrated-pages-buchhaltung-kostenuebersicht-tsx-167", children: ["Quelle: ", _jsx("code", { children: "useLieferscheine()" })] }) })] }), _jsxs("div", { className: "bh-card", children: [_jsx("div", { className: "k", children: "Deckungsbeitrag (Zahlungen \u2212 Kosten)" }), _jsxs("div", { className: "v", children: [eur(deckungsbeitrag), " \u20AC"] })] })] }), _jsxs("div", { className: "bh-grid-2", children: [_jsxs("div", { className: "bh-panel", children: [_jsxs("div", { className: "bh-panel-head", children: [_jsx("h3", { children: "Top 10 Offene Posten" }), _jsx("button", { className: "bh-btn ghost", onClick: exportOffen, children: "Export CSV" })] }), _jsxs("table", { className: "bh-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Nr." }), _jsx("th", { children: "Kunde" }), _jsx("th", { children: "Datum" }), _jsx("th", { children: "F\u00E4llig" }), _jsx("th", { children: "Brutto (\u20AC)" }), _jsx("th", { children: "Gezahlt (\u20AC)" }), _jsx("th", { children: "Offen (\u20AC)" }), _jsx("th", { children: "Aktion" })] }) }), _jsxs("tbody", { children: [offeneListe.map((o) => _jsxs("tr", { children: [_jsx("td", { children: o.nr }), _jsx("td", { children: o.kunde }), _jsx("td", { children: o.datum }), _jsx("td", { children: o.faellig || "—" }), _jsx("td", { children: eur(o.brutto) }), _jsx("td", { children: eur(safeNumber(o.bezahlt)) }), _jsx("td", { className: "rlc-migrated-pages-buchhaltung-kostenuebersicht-tsx-168", children: eur(o.offen) }), _jsx("td", { children: _jsx(Link, { to: "/buchhaltung/zahlungen", className: "bh-link", children: "zu Zahlungen" }) })] }, o.id)), offeneListe.length === 0 &&
                                                _jsx("tr", { children: _jsx("td", { colSpan: 8, className: "rlc-migrated-pages-buchhaltung-kostenuebersicht-tsx-169", children: "Keine offenen Posten im Filterzeitraum." }) })] })] })] }), _jsxs("div", { className: "bh-panel", children: [_jsxs("div", { className: "bh-panel-head", children: [_jsx("h3", { children: "Kosten nach Kostenstelle" }), _jsx("button", { className: "bh-btn ghost", onClick: exportKosten, children: "Export CSV" })] }), _jsxs("table", { className: "bh-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Kostenstelle" }), _jsx("th", { children: "Summe (\u20AC)" })] }) }), _jsxs("tbody", { children: [kostenByKs.map(([ks, betrag]) => _jsxs("tr", { children: [_jsx("td", { children: ks }), _jsx("td", { children: eur(betrag) })] }, ks)), kostenByKs.length === 0 &&
                                                _jsx("tr", { children: _jsx("td", { colSpan: 2, className: "rlc-migrated-pages-buchhaltung-kostenuebersicht-tsx-170", children: "Keine Kosten im Filterzeitraum." }) })] })] })] })] }), _jsxs("div", { className: "bh-note rlc-migrated-pages-buchhaltung-kostenuebersicht-tsx-171", children: ["*Live-Daten aus ", _jsx("code", { children: "stores.ts" }), " (Rechnungen/Zahlungen/Lieferscheine).", " ", activeProjectKey ?
                        _jsxs(_Fragment, { children: ["Aktuelles Projekt: ", _jsx("b", { children: activeProjectKey })] }) :
                        _jsx(_Fragment, { children: "Kein Projekt gew\u00E4hlt: Projektfilter wird nicht angewendet." })] })] }));
}
