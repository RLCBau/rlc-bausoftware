import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./styles.css";
import { useProject } from "../../store/useProject";
import { useRechnungen, useZahlungen, useLieferscheine } from "./stores";
/** =========================
 *  HELPER
 *  ========================= */
const parseDate = (s) => {
    // supporta dd.mm.yyyy o ISO
    if (/\d{2}\.\d{2}\.\d{4}/.test(s)) {
        const [d, m, y] = s.split(".").map(Number);
        return new Date(y, (m || 1) - 1, d || 1);
    }
    return new Date(s);
};
const withinDays = (d, days) => {
    const from = new Date();
    from.setDate(from.getDate() - days);
    return d >= from;
};
const isSameMonth = (d, ref) => d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
const eur = (n) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const sum = (arr) => arr.reduce((a, b) => a + b, 0);
/** =========================
 *  COMPONENT
 *  ========================= */
export default function Kostenuebersicht() {
    const nav = useNavigate();
    // Project context (per filtro)
    const ctx = useProject();
    const cur = ctx?.currentProject || ctx?.selectedProject || null;
    const currentProjectCode = cur?.code ?? null;
    const currentProjectId = cur?.id ?? ctx?.projectId ?? null;
    // Store data
    const [rechnungen] = useRechnungen();
    const [zahlungen] = useZahlungen();
    const [lieferscheine] = useLieferscheine();
    // Filtri UI
    const [zeitraum, setZeitraum] = useState("THIS_MONTH");
    const [kunde, setKunde] = useState("ALL");
    const [status, setStatus] = useState("ALL");
    /**
     * =========================================================
     * Mapping DALLO STORE -> UI-Model
     * Nota: i tuoi types in ./types non includono sempre project/kunde.
     * Qui facciamo mapping "robusto":
     * - Rechnung: progetto (se presente) o fallback: currentProjectCode
     * - Zahlung: se manca kunde, la lasciamo vuota
     * - Lieferschein: costo = field "kosten" (dal tuo type Lieferschein)
     * =========================================================
     */
    const rechnungenUI = useMemo(() => {
        return (rechnungen || []).map((r) => ({
            id: String(r.id),
            nr: String(r.nummer ?? r.nr ?? r.id),
            datum: String(r.datum || ""),
            faellig: r.faellig ? String(r.faellig) : undefined,
            kunde: String(r.kunde ?? r.client ?? r.auftraggeber ?? "—"),
            netto: Number(r.betragNetto ?? r.netto ?? 0),
            mwstPct: Number(r.mwst ?? r.mwstPct ?? 19),
            // se non hai il dettaglio "gezahlt" sul type Rechnung, resta 0;
            // se lo aggiungi in futuro, qui lo prende automaticamente.
            gezahlt: Number(r.gezahlt ?? 0),
        }));
    }, [rechnungen]);
    const zahlungenUI = useMemo(() => {
        return (zahlungen || []).map((z) => ({
            id: String(z.id),
            datum: String(z.datum || ""),
            kunde: z.kunde ? String(z.kunde) : undefined,
            betrag: Number(z.betrag ?? 0),
            referenz: z.referenz ? String(z.referenz) : undefined,
        }));
    }, [zahlungen]);
    const kostenUI = useMemo(() => {
        return (lieferscheine || []).map((ls) => ({
            id: String(ls.id),
            datum: String(ls.datum || ""),
            kostenstelle: ls.kostenstelle ? String(ls.kostenstelle) : undefined,
            lieferant: ls.lieferant ? String(ls.lieferant) : undefined,
            betrag: Number(ls.kosten ?? ls.betrag ?? 0),
            projekt: ls.projekt ? String(ls.projekt) : undefined, // opzionale (se lo aggiungi in futuro)
        }));
    }, [lieferscheine]);
    // Filtro per progetto (best-effort)
    // - Se nelle righe esiste "projekt"/"projectId"/"projectCode", usalo.
    // - Altrimenti: non filtrare (per non perdere dati).
    const filterByProject = (rows, getter) => {
        const key = currentProjectCode || currentProjectId;
        if (!key)
            return rows;
        // se nessuna riga ha info progetto -> non filtrare
        const hasAnyProjectInfo = rows.some((x) => {
            const v = getter(x);
            return v !== undefined && v !== null && String(v).trim() !== "";
        });
        if (!hasAnyProjectInfo)
            return rows;
        return rows.filter((x) => String(getter(x) ?? "") === String(key));
    };
    // Qui puoi personalizzare quale field usare quando in futuro aggiungi project linkage nei types
    const rechnungenProjectFiltered = useMemo(() => {
        return filterByProject(rechnungenUI, (r) => r.projekt ?? r.projectId ?? r.projectCode);
    }, [rechnungenUI, currentProjectCode, currentProjectId]);
    const zahlungenProjectFiltered = useMemo(() => {
        return filterByProject(zahlungenUI, (z) => z.projekt ?? z.projectId ?? z.projectCode);
    }, [zahlungenUI, currentProjectCode, currentProjectId]);
    const kostenProjectFiltered = useMemo(() => {
        // nel tuo Lieferschein type attuale NON c’è progetto: quindi (oggi) non filtra,
        // ma è pronto appena aggiungi projekt/projectId/projectCode.
        return filterByProject(kostenUI, (k) => k.projekt ?? k.projectId ?? k.projectCode);
    }, [kostenUI, currentProjectCode, currentProjectId]);
    // Derivati per i filtri (Kunde)
    const kundenListe = useMemo(() => {
        const ks = Array.from(new Set(rechnungenProjectFiltered.map((r) => r.kunde).filter(Boolean)));
        return ["ALL", ...ks];
    }, [rechnungenProjectFiltered]);
    const rechnungenGefiltert = useMemo(() => {
        let arr = rechnungenProjectFiltered.slice();
        // Zeitraum
        arr = arr.filter((r) => {
            const d = parseDate(r.datum);
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
        });
        // Kunde
        if (kunde !== "ALL")
            arr = arr.filter((r) => r.kunde === kunde);
        // Status
        if (status !== "ALL") {
            arr = arr.filter((r) => {
                const brutto = r.netto * (1 + r.mwstPct / 100);
                if (status === "PAID")
                    return r.gezahlt >= brutto - 0.01;
                if (status === "OPEN")
                    return r.gezahlt <= 0.01;
                if (status === "PART")
                    return r.gezahlt > 0.01 && r.gezahlt < brutto - 0.01;
                return true;
            });
        }
        return arr;
    }, [rechnungenProjectFiltered, zeitraum, kunde, status]);
    const zahlungenGefiltert = useMemo(() => {
        return zahlungenProjectFiltered.filter((z) => {
            const d = parseDate(z.datum);
            const okZeit = zeitraum === "30"
                ? withinDays(d, 30)
                : zeitraum === "60"
                    ? withinDays(d, 60)
                    : zeitraum === "90"
                        ? withinDays(d, 90)
                        : zeitraum === "YTD"
                            ? d.getFullYear() === new Date().getFullYear()
                            : zeitraum === "THIS_MONTH"
                                ? isSameMonth(d, new Date())
                                : true;
            const okKunde = kunde === "ALL" ? true : z.kunde === kunde;
            return okZeit && okKunde;
        });
    }, [zahlungenProjectFiltered, zeitraum, kunde]);
    const kostenGefiltert = useMemo(() => {
        return kostenProjectFiltered.filter((k) => {
            const d = parseDate(k.datum);
            const okZeit = zeitraum === "30"
                ? withinDays(d, 30)
                : zeitraum === "60"
                    ? withinDays(d, 60)
                    : zeitraum === "90"
                        ? withinDays(d, 90)
                        : zeitraum === "YTD"
                            ? d.getFullYear() === new Date().getFullYear()
                            : zeitraum === "THIS_MONTH"
                                ? isSameMonth(d, new Date())
                                : true;
            return okZeit;
        });
    }, [kostenProjectFiltered, zeitraum]);
    // KPI calcoli
    const reBrutto = useMemo(() => sum(rechnungenGefiltert.map((r) => r.netto * (1 + r.mwstPct / 100))), [rechnungenGefiltert]);
    /**
     * IMPORTANT:
     * - Se il tuo modello "Zahlung" rappresenta pagamenti reali, qui usiamo SOMMA pagamenti come KPI "Zahlungseingänge".
     * - Il campo r.gezahlt sulle rechnungen resta utile per lo status OPEN/PART/PAID se lo compili.
     */
    const zahlungenSum = useMemo(() => sum(zahlungenGefiltert.map((z) => z.betrag)), [zahlungenGefiltert]);
    const reGezahlt = zahlungenSum; // KPI (live) = pagamenti registrati
    const offenePosten = Math.max(0, reBrutto - reGezahlt);
    const kosten = useMemo(() => sum(kostenGefiltert.map((k) => k.betrag)), [kostenGefiltert]);
    const deckungsbeitrag = reGezahlt - kosten;
    // Tabelle Offene Posten (Top 10)
    const offeneListe = useMemo(() => {
        return rechnungenGefiltert
            .map((r) => {
            const brutto = r.netto * (1 + r.mwstPct / 100);
            // “gezahlt” pro Rechnung è opzionale; se non lo gestisci ancora, la riga resta "offen".
            const bezahlt = Number(r.gezahlt ?? 0);
            return { ...r, offen: Math.max(0, brutto - bezahlt), brutto, bezahlt };
        })
            .filter((r) => r.offen > 0.01)
            .sort((a, b) => b.offen - a.offen)
            .slice(0, 10);
    }, [rechnungenGefiltert]);
    // Aggregazione costi per Kostenstelle
    const kostenByKs = useMemo(() => {
        const map = new Map();
        for (const k of kostenGefiltert) {
            const key = k.kostenstelle || "—";
            map.set(key, (map.get(key) || 0) + k.betrag);
        }
        return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    }, [kostenGefiltert]);
    // mini sparkline ascii (0..7)
    const spark = (series) => {
        if (!series.length)
            return "—";
        const max = Math.max(...series);
        const glyphs = "▁▂▃▄▅▆▇█";
        return series
            .map((n) => {
            const idx = max === 0 ? 0 : Math.round((n / max) * (glyphs.length - 1));
            return glyphs[idx];
        })
            .join("");
    };
    // CSV export
    const downloadCSV = (rows, filename) => {
        const headers = Object.keys(rows[0] || {});
        const csv = [headers.join(";"), ...rows.map((r) => headers.map((h) => String(r[h] ?? "")).join(";"))].join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    };
    const exportKPIs = () => {
        downloadCSV([
            { Kennzahl: "Rechnungen (Brutto)", Wert: reBrutto.toFixed(2) },
            { Kennzahl: "Zahlungseingänge", Wert: reGezahlt.toFixed(2) },
            { Kennzahl: "Offene Posten", Wert: offenePosten.toFixed(2) },
            { Kennzahl: "Kosten (Belege/Lieferscheine)", Wert: kosten.toFixed(2) },
            { Kennzahl: "Deckungsbeitrag", Wert: deckungsbeitrag.toFixed(2) },
        ], "kostenuebersicht_kpi.csv");
    };
    const exportOffen = () => {
        downloadCSV(offeneListe.map((o) => ({
            Nr: o.nr,
            Kunde: o.kunde,
            Datum: o.datum,
            Brutto: o.brutto.toFixed(2),
            Gezahlt: Number(o.bezahlt ?? 0).toFixed(2),
            Offen: o.offen.toFixed(2),
            Faellig: o.faellig || "",
        })), "offene_posten.csv");
    };
    const exportKosten = () => {
        downloadCSV(kostenByKs.map(([ks, betrag]) => ({
            Kostenstelle: ks,
            Betrag: betrag.toFixed(2),
        })), "kosten_nach_kostenstelle.csv");
    };
    // Serie: ultimi 7 step (Zahlungen)
    const serieZahlungen = useMemo(() => {
        const days = [7, 6, 5, 4, 3, 2, 1].reverse();
        return days.map((d) => {
            const since = new Date();
            since.setDate(since.getDate() - d);
            const till = new Date();
            till.setDate(till.getDate() - (d - 1));
            return sum(zahlungenProjectFiltered.filter((z) => {
                const dt = parseDate(z.datum);
                return dt >= since && dt < till;
            }).map((z) => z.betrag));
        });
    }, [zahlungenProjectFiltered]);
    return (_jsxs("div", { className: "bh-page", children: [_jsxs("div", { className: "bh-header-row", children: [_jsx("h2", { children: "Kosten\u00FCbersicht pro Projekt (live)" }), _jsxs("div", { className: "bh-actions", children: [_jsx("button", { className: "bh-btn ghost", onClick: () => nav("/buchhaltung/rechnungen"), children: "\u2192 Zu Rechnungen" }), _jsx("button", { className: "bh-btn ghost", onClick: () => nav("/buchhaltung/zahlungen"), children: "\u2192 Zu Zahlungen" }), _jsx("button", { className: "bh-btn ghost", onClick: () => nav("/buchhaltung/reports"), children: "\u2192 Zu Belegen" }), _jsx("button", { className: "bh-btn ghost", onClick: () => nav("/mengenermittlung/lieferscheine"), children: "\u2192 Zu Lieferscheinen" })] })] }), _jsxs("div", { className: "bh-filters", children: [_jsxs("div", { children: [_jsx("label", { children: "Zeitraum" }), _jsxs("select", { value: zeitraum, onChange: (e) => setZeitraum(e.target.value), children: [_jsx("option", { value: "THIS_MONTH", children: "Dieser Monat" }), _jsx("option", { value: "30", children: "Letzte 30 Tage" }), _jsx("option", { value: "60", children: "Letzte 60 Tage" }), _jsx("option", { value: "90", children: "Letzte 90 Tage" }), _jsx("option", { value: "YTD", children: "YTD" }), _jsx("option", { value: "ALL", children: "Alle" })] })] }), _jsxs("div", { children: [_jsx("label", { children: "Kunde" }), _jsx("select", { value: kunde, onChange: (e) => setKunde(e.target.value), children: kundenListe.map((k) => (_jsx("option", { value: k, children: k }, k))) })] }), _jsxs("div", { children: [_jsx("label", { children: "Status" }), _jsxs("select", { value: status, onChange: (e) => setStatus(e.target.value), children: [_jsx("option", { value: "ALL", children: "Alle" }), _jsx("option", { value: "OPEN", children: "Offen" }), _jsx("option", { value: "PART", children: "Teilbezahlt" }), _jsx("option", { value: "PAID", children: "Bezahlt" })] })] }), _jsx("div", { className: "bh-filters-right", children: _jsx("button", { className: "bh-btn", onClick: exportKPIs, children: "Export KPI (CSV)" }) })] }), _jsxs("div", { className: "bh-cards", children: [_jsxs("div", { className: "bh-card", children: [_jsx("div", { className: "k", children: "Rechnungen (Brutto)" }), _jsxs("div", { className: "v", children: [eur(reBrutto), " \u20AC"] }), _jsxs("div", { className: "s", children: ["Zahlungsserie: ", spark(serieZahlungen)] })] }), _jsxs("div", { className: "bh-card", children: [_jsx("div", { className: "k", children: "Zahlungseing\u00E4nge" }), _jsxs("div", { className: "v", children: [eur(reGezahlt), " \u20AC"] })] }), _jsxs("div", { className: "bh-card", children: [_jsx("div", { className: "k", children: "Offene Posten" }), _jsxs("div", { className: "v", children: [eur(offenePosten), " \u20AC"] })] }), _jsxs("div", { className: "bh-card", children: [_jsx("div", { className: "k", children: "Kosten (Belege/Lieferscheine)" }), _jsxs("div", { className: "v", children: [eur(kosten), " \u20AC"] }), _jsx("div", { className: "s", children: _jsxs("span", { style: { opacity: 0.8 }, children: ["Quelle: ", _jsx("code", { children: "useLieferscheine()" })] }) })] }), _jsxs("div", { className: "bh-card", children: [_jsx("div", { className: "k", children: "Deckungsbeitrag (Zahlungen \u2212 Kosten)" }), _jsxs("div", { className: "v", children: [eur(deckungsbeitrag), " \u20AC"] })] })] }), _jsxs("div", { className: "bh-grid-2", children: [_jsxs("div", { className: "bh-panel", children: [_jsxs("div", { className: "bh-panel-head", children: [_jsx("h3", { children: "Top 10 Offene Posten" }), _jsx("button", { className: "bh-btn ghost", onClick: exportOffen, children: "Export CSV" })] }), _jsxs("table", { className: "bh-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Nr." }), _jsx("th", { children: "Kunde" }), _jsx("th", { children: "Datum" }), _jsx("th", { children: "F\u00E4llig" }), _jsx("th", { children: "Brutto (\u20AC)" }), _jsx("th", { children: "Gezahlt (\u20AC)" }), _jsx("th", { children: "Offen (\u20AC)" }), _jsx("th", { children: "Aktion" })] }) }), _jsxs("tbody", { children: [offeneListe.map((o) => (_jsxs("tr", { children: [_jsx("td", { children: o.nr }), _jsx("td", { children: o.kunde }), _jsx("td", { children: o.datum }), _jsx("td", { children: o.faellig || "—" }), _jsx("td", { children: eur(o.brutto) }), _jsx("td", { children: eur(Number(o.bezahlt ?? 0)) }), _jsx("td", { style: { fontWeight: 600 }, children: eur(o.offen) }), _jsx("td", { children: _jsx(Link, { to: "/buchhaltung/zahlungen", className: "bh-link", children: "zu Zahlungen" }) })] }, o.id))), offeneListe.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 8, style: { textAlign: "center", color: "#777" }, children: "Keine offenen Posten im Filterzeitraum." }) }))] })] })] }), _jsxs("div", { className: "bh-panel", children: [_jsxs("div", { className: "bh-panel-head", children: [_jsx("h3", { children: "Kosten nach Kostenstelle" }), _jsx("button", { className: "bh-btn ghost", onClick: exportKosten, children: "Export CSV" })] }), _jsxs("table", { className: "bh-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Kostenstelle" }), _jsx("th", { children: "Summe (\u20AC)" })] }) }), _jsxs("tbody", { children: [kostenByKs.map(([ks, betrag]) => (_jsxs("tr", { children: [_jsx("td", { children: ks }), _jsx("td", { children: eur(betrag) })] }, ks))), kostenByKs.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 2, style: { textAlign: "center", color: "#777" }, children: "Keine Kosten im Filterzeitraum." }) }))] })] })] })] }), _jsxs("div", { className: "bh-note", style: { marginTop: 8 }, children: ["*Live-Daten aus ", _jsx("code", { children: "stores.ts" }), " (Rechnungen/Zahlungen/Lieferscheine).", " ", currentProjectCode || currentProjectId ? (_jsxs(_Fragment, { children: ["Aktuelles Projekt: ", _jsx("b", { children: currentProjectCode || currentProjectId })] })) : (_jsx(_Fragment, { children: "Kein Projekt gew\u00E4hlt: Projektfilter wird nicht angewendet." }))] })] }));
}
