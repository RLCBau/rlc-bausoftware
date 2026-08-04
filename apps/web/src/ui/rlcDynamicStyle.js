const UNITLESS = new Set([
    "animationIterationCount",
    "aspectRatio",
    "borderImageOutset",
    "borderImageSlice",
    "borderImageWidth",
    "columnCount",
    "columns",
    "flex",
    "flexGrow",
    "flexShrink",
    "fontWeight",
    "gridArea",
    "gridColumn",
    "gridColumnEnd",
    "gridColumnStart",
    "gridRow",
    "gridRowEnd",
    "gridRowStart",
    "lineClamp",
    "lineHeight",
    "opacity",
    "order",
    "orphans",
    "scale",
    "tabSize",
    "widows",
    "zIndex",
    "zoom",
    "fillOpacity",
    "strokeOpacity",
    "strokeWidth",
]);
const THEME_COLOR_ALIASES = {
    "#ffffff": "var(--rlc-surface)",
    "#fff": "var(--rlc-surface)",
    white: "var(--rlc-surface)",
    "#f7f9fc": "var(--rlc-bg)",
    "#f5f8ff": "var(--rlc-primary-faint)",
    "#eaf2ff": "var(--rlc-primary-soft)",
    "#dde5f0": "var(--rlc-border)",
    "#bed6ff": "var(--rlc-border-strong)",
    "#146ef5": "var(--rlc-primary)",
    "#0b5bd3": "var(--rlc-primary-hover)",
    "#172033": "var(--rlc-text)",
    "#6d7890": "var(--rlc-muted)",
};
const COLOR_PROPERTIES = new Set([
    "color",
    "background",
    "backgroundColor",
    "borderColor",
    "borderTopColor",
    "borderRightColor",
    "borderBottomColor",
    "borderLeftColor",
    "outlineColor",
    "textDecorationColor",
]);
function normalizeValue(property, value) {
    if (value === null || value === undefined || value === false)
        return undefined;
    if (typeof value === "number" && value !== 0 && !UNITLESS.has(property)) {
        return `${value}px`;
    }
    return String(value);
}
/**
 * Unico ponte ammesso tra valori React calcolati e il CSS RLC.
 * Le proprietà vere vivono in rlc-inline-theme.css; qui vengono valorizzate
 * soltanto le variabili necessarie a misure, coordinate e stati runtime.
 */
export function rlcDynamicStyle(entries) {
    const variables = {};
    for (const [variableName, property, value] of entries) {
        variables[variableName] = normalizeValue(property, value);
    }
    return variables;
}
function normalizeThemeValue(property, value) {
    if (!COLOR_PROPERTIES.has(property) || typeof value !== "string")
        return value;
    return THEME_COLOR_ALIASES[value.trim().toLowerCase()] || value;
}
/**
 * Tutti gli style prop Web passano da questa funzione. Mantiene l'ordine
 * degli spread React, ma applica i token centrali ai colori RLC conosciuti.
 */
export function rlcStyleOps(operations) {
    const result = {};
    for (const operation of operations) {
        if (operation[0] === "spread") {
            const source = operation[1];
            if (source && typeof source === "object")
                Object.assign(result, source);
            continue;
        }
        const property = String(operation[1]);
        result[property] = normalizeThemeValue(property, operation[2]);
    }
    for (const property of Object.keys(result)) {
        result[property] = normalizeThemeValue(property, result[property]);
    }
    return result;
}
