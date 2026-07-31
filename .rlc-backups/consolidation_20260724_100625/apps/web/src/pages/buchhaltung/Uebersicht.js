import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useMemo } from "react";
import { useRechnungen, useZahlungen, useLieferscheine } from "./stores";
export default function Uebersicht() {
    const [re] = useRechnungen();
    const [za] = useZahlungen();
    const [ls] = useLieferscheine();
    const sumRe = useMemo(() => re.reduce((s, r) => s + (r.betragBrutto || 0), 0), [re]);
    const sumZa = useMemo(() => za.reduce((s, z) => s + (z.betrag || 0), 0), [za]);
    const sumLs = useMemo(() => ls.reduce((s, l) => s + (l.kosten || 0), 0), [ls]);
    const offen = Math.max(0, sumRe - sumZa);
    const cash = sumZa - sumLs;
    const guv = (re.reduce((s, r) => s + (r.betragNetto || 0), 0)) - sumLs;
    return (_jsxs("div", { children: [_jsx("h2", { children: "\u00DCbersicht" }), _jsxs("div", { className: "bh-cards", children: [_jsxs("div", { className: "bh-card", children: [_jsx("div", { className: "k", children: "Rechnungen (Brutto)" }), _jsxs("div", { className: "v", children: [sumRe.toFixed(2), " \u20AC"] })] }), _jsxs("div", { className: "bh-card", children: [_jsx("div", { className: "k", children: "Zahlungen" }), _jsxs("div", { className: "v", children: [sumZa.toFixed(2), " \u20AC"] })] }), _jsxs("div", { className: "bh-card", children: [_jsx("div", { className: "k", children: "Offene Posten" }), _jsxs("div", { className: "v", children: [offen.toFixed(2), " \u20AC"] })] }), _jsxs("div", { className: "bh-card", children: [_jsx("div", { className: "k", children: "Kosten (Lieferscheine)" }), _jsxs("div", { className: "v", children: [sumLs.toFixed(2), " \u20AC"] })] }), _jsxs("div", { className: "bh-card", children: [_jsx("div", { className: "k", children: "Cashflow" }), _jsxs("div", { className: "v", children: [cash.toFixed(2), " \u20AC"] })] }), _jsxs("div", { className: "bh-card", children: [_jsx("div", { className: "k", children: "GuV (\u2248 Umsatz \u2212 Kosten)" }), _jsxs("div", { className: "v", children: [guv.toFixed(2), " \u20AC"] })] })] })] }));
}
