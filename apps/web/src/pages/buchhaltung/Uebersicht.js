import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from "react";
import { useRechnungen, useZahlungen, useLieferscheine } from "./stores";
import "./styles.css";
function safeNumber(v, fallback = 0) {
    if (v === null || v === undefined || v === "")
        return fallback;
    const normalized = typeof v === "string" ? v.replace(/\s/g, "").replace(",", ".") : v;
    const n = Number(normalized);
    return Number.isFinite(n) ? n : fallback;
}
const fmt = (n) => safeNumber(n).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});
export default function Uebersicht() {
    const [re] = useRechnungen();
    const [za] = useZahlungen();
    const [ls] = useLieferscheine();
    const sumRe = useMemo(() => (re || []).reduce((s, r) => s + safeNumber(r.betragBrutto ?? r.brutto ?? 0), 0), [re]);
    const sumReNetto = useMemo(() => (re || []).reduce((s, r) => s + safeNumber(r.betragNetto ?? r.netto ?? 0), 0), [re]);
    const sumZa = useMemo(() => (za || []).reduce((s, z) => s + safeNumber(z.betrag ?? 0), 0), [za]);
    const sumLs = useMemo(() => (ls || []).reduce((s, l) => s + safeNumber(l.kosten ?? l.betrag ?? 0), 0), [ls]);
    const offen = Math.max(0, sumRe - sumZa);
    const cash = sumZa - sumLs;
    const guv = sumReNetto - sumLs;
    return (_jsxs("div", { className: "bh-page", children: [_jsx("h2", { children: "\u00DCbersicht" }), _jsxs("div", { className: "bh-cards", children: [_jsxs("div", { className: "bh-card", children: [_jsx("div", { className: "k", children: "Rechnungen (Brutto)" }), _jsxs("div", { className: "v", children: [fmt(sumRe), " \u20AC"] })] }), _jsxs("div", { className: "bh-card", children: [_jsx("div", { className: "k", children: "Zahlungen" }), _jsxs("div", { className: "v", children: [fmt(sumZa), " \u20AC"] })] }), _jsxs("div", { className: "bh-card", children: [_jsx("div", { className: "k", children: "Offene Posten" }), _jsxs("div", { className: "v", children: [fmt(offen), " \u20AC"] })] }), _jsxs("div", { className: "bh-card", children: [_jsx("div", { className: "k", children: "Kosten (Lieferscheine)" }), _jsxs("div", { className: "v", children: [fmt(sumLs), " \u20AC"] })] }), _jsxs("div", { className: "bh-card", children: [_jsx("div", { className: "k", children: "Cashflow" }), _jsxs("div", { className: "v", children: [fmt(cash), " \u20AC"] })] }), _jsxs("div", { className: "bh-card", children: [_jsx("div", { className: "k", children: "GuV (\u2248 Umsatz \u2212 Kosten)" }), _jsxs("div", { className: "v", children: [fmt(guv), " \u20AC"] })] })] })] }));
}
