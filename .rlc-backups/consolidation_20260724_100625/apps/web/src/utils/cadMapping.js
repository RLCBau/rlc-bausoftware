// ============================================================
// 🔹 CAD → LV MAPPING ENGINE
// ============================================================
// ============================================================
// 🔧 REGOLE BASE (puoi estenderle liberamente)
// ============================================================
const RULES = [
    {
        match: { layer: /asphalt/i, text: /asphaltdeckschicht/i, kind: "AREA" },
        target: {
            pos: "001.002",
            kurztext: "Asphaltdeckschicht wiederherstellen",
            einheit: "m2",
            ep: 39.9,
        },
    },
    {
        match: { layer: /(speedpipe|leitung|trasse|rohr)/i, kind: "LINE" },
        target: {
            pos: "001.001",
            kurztext: "Speedpipe Verlegung 1,20 m Tiefe",
            einheit: "m",
            ep: 24.5,
        },
    },
    {
        match: { layer: /(kabel|strom)/i, kind: "LINE" },
        target: {
            pos: "002.010",
            kurztext: "Stromkabel im Schutzrohr verlegen",
            einheit: "m",
            ep: 18.9,
        },
    },
    {
        match: { layer: /(pflaster|stein)/i, kind: "AREA" },
        target: {
            pos: "003.005",
            kurztext: "Pflasterfläche herstellen",
            einheit: "m2",
            ep: 42.5,
        },
    },
];
// ============================================================
// 🔍 Utility: estrae "Pos1.00.14" → "1.00.14"
// ============================================================
export function extractPosFromText(t) {
    if (!t)
        return null;
    const m = t.match(/pos\.?\s*([\d.]+)/i);
    return m?.[1] ?? null;
}
// ============================================================
// 🤖 Euristica KI fallback (keyword scoring)
// ============================================================
function heuristic(item) {
    const L = (item.layer || "").toLowerCase() + " " + (item.label || "").toLowerCase();
    if (/(asphalt|deck|pflaster|fläche)/.test(L) && item.kind === "AREA") {
        return { pos: "001.002", kurztext: "Asphalt / Fläche", einheit: "m2" };
    }
    if (/(leitung|trasse|kanal|rohr|kabel)/.test(L) && item.kind === "LINE") {
        return { pos: "001.001", kurztext: "Leitungstrasse", einheit: "m" };
    }
    if (/(schacht|punkt|anschluss)/.test(L) && item.kind === "POINT") {
        return { pos: "009.001", kurztext: "Punkt / Anschluss", einheit: "stk" };
    }
    return null;
}
// ============================================================
// 🎯 Resolver principale
// Torna: LVTarget + {menge, unitText}
// ============================================================
export function resolveCadToLV(item) {
    // 1️⃣ Match regole esplicite
    const rule = RULES.find(r => (!r.match.kind || r.match.kind === item.kind) &&
        (!r.match.layer || r.match.layer.test(item.layer || "")) &&
        (!r.match.text || r.match.text.test(item.label || "")));
    let base = rule ? rule.target : heuristic(item);
    if (!base)
        return null;
    // 2️⃣ Posizione da testo (es. "Pos1.00.14")
    const p = extractPosFromText(item.label);
    if (p)
        base = { ...base, pos: p };
    // 3️⃣ Quantità numerica e unità leggibile
    const menge = base.einheit === "m2" ? (item.area_m2 ?? 0) :
        base.einheit === "m3" ? (item.volume_m3 ?? 0) :
            base.einheit === "stk" ? 1 :
                (item.length_m ?? 0);
    const unitText = base.einheit === "m2" ? "m²" :
        base.einheit === "m3" ? "m³" :
            base.einheit === "stk" ? "Stk" : "m";
    return { ...base, menge, unitText };
}
