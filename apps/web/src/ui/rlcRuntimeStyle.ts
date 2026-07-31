import type { CSSProperties } from "react";

const cache = new Map<string, string>();
let sheet: CSSStyleSheet | null = null;

function ensureSheet(): CSSStyleSheet | null {
  if (typeof document === "undefined") return null;
  if (sheet) return sheet;
  const node = document.createElement("style");
  node.dataset.rlcRuntimeTheme = "true";
  document.head.appendChild(node);
  sheet = node.sheet;
  return sheet;
}

function kebab(value: string): string {
  if (value.startsWith("--")) return value;
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function serialize(style: CSSProperties): string {
  return Object.entries(style)
    .filter(([, value]) => value !== null && value !== undefined && value !== false)
    .map(([property, value]) => {
      const unitless = /^(animationIterationCount|columnCount|fillOpacity|flex|flexGrow|flexShrink|fontWeight|lineHeight|opacity|order|orphans|scale|strokeOpacity|widows|zIndex|zoom)$/;
      const rendered =
        typeof value === "number" && value !== 0 && !unitless.test(property)
          ? `${value}px`
          : String(value);
      return `${kebab(property)}:${rendered}`;
    })
    .join(";");
}

function semanticClass(style: CSSProperties): string {
  const background = String(style.background || style.backgroundImage || "");
  return background.includes("gradient") ? "rlc-gradient-surface" : "";
}

export function rlcClass(
  current: string | null | undefined | false,
  style: CSSProperties | null | undefined | false
): string {
  if (!style) return current || "";
  const declaration = serialize(style);
  if (!declaration) return current || "";
  let generated = cache.get(declaration);
  if (!generated) {
    generated = `rlc-runtime-${cache.size + 1}`;
    cache.set(declaration, generated);
    ensureSheet()?.insertRule(`.${generated}{${declaration}}`);
  }
  return [current || "", semanticClass(style), generated].filter(Boolean).join(" ");
}
