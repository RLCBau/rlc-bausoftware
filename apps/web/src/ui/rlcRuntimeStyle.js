const cache = new Map();
let sheet = null;
function ensureSheet() {
    if (typeof document === "undefined")
        return null;
    if (sheet)
        return sheet;
    const node = document.createElement("style");
    node.dataset.rlcRuntimeTheme = "true";
    document.head.appendChild(node);
    sheet = node.sheet;
    return sheet;
}
function kebab(value) {
    if (value.startsWith("--"))
        return value;
    return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}
function serialize(style) {
    return Object.entries(style)
        .filter(([, value]) => value !== null && value !== undefined && value !== false)
        .map(([property, value]) => {
        const unitless = /^(animationIterationCount|columnCount|fillOpacity|flex|flexGrow|flexShrink|fontWeight|lineHeight|opacity|order|orphans|scale|strokeOpacity|widows|zIndex|zoom)$/;
        const rendered = typeof value === "number" && value !== 0 && !unitless.test(property)
            ? `${value}px`
            : String(value);
        return `${kebab(property)}:${rendered}`;
    })
        .join(";");
}
function semanticClass(style) {
    const background = String(style.background || style.backgroundImage || "");
    return background.includes("gradient") ? "rlc-gradient-surface" : "";
}
export function rlcClass(current, style) {
    if (!style)
        return current || "";
    const declaration = serialize(style);
    if (!declaration)
        return current || "";
    let generated = cache.get(declaration);
    if (!generated) {
        generated = `rlc-runtime-${cache.size + 1}`;
        cache.set(declaration, generated);
        ensureSheet()?.insertRule(`.${generated}{${declaration}}`);
    }
    return [current || "", semanticClass(style), generated].filter(Boolean).join(" ");
}
