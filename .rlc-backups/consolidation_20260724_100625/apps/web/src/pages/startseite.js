import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link } from "react-router-dom";
const shell = {
    position: "relative",
    minHeight: "100vh",
    overflow: "hidden",
    color: "#fff",
    textAlign: "center",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
};
const bg = {
    position: "absolute",
    inset: 0,
    backgroundImage: "url('/src/assets/construction-bg.jpg')",
    backgroundSize: "cover",
    backgroundPosition: "center",
    filter: "brightness(0.6)",
};
const gradient = {
    position: "absolute",
    inset: 0,
    background: "radial-gradient(ellipse at center, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.65) 100%)",
};
const card = {
    position: "relative",
    zIndex: 2,
    maxWidth: 980,
    padding: "48px 32px",
};
const title = {
    fontSize: 56,
    lineHeight: 1.1,
    margin: "18px 0 12px",
    fontWeight: 800,
    letterSpacing: ".5px",
};
const subtitle = {
    fontSize: 20,
    lineHeight: 1.7,
    opacity: 0.95,
    margin: "0 auto 32px",
};
const ctas = {
    display: "flex",
    gap: 16,
    justifyContent: "center",
    flexWrap: "wrap",
};
const btn = (variant) => ({
    padding: "11px 18px",
    borderRadius: 10,
    border: variant === "ghost" ? "1px solid rgba(255,255,255,.5)" : "none",
    background: variant === "ghost"
        ? "transparent"
        : "linear-gradient(135deg, #0ea5e9 0%, #22c55e 100%)",
    color: "#fff",
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: ".2px",
    textDecoration: "none",
    boxShadow: variant === "ghost"
        ? "none"
        : "0 8px 30px rgba(34,197,94,.35), 0 4px 12px rgba(14,165,233,.25)",
});
export default function Startseite() {
    return (_jsxs("main", { style: shell, children: [_jsx("div", { style: bg }), _jsx("div", { style: gradient }), _jsxs("section", { style: card, children: [_jsx("img", { src: "/src/assets/lo-curto.svg", onError: (e) => {
                            e.currentTarget.src = "/src/assets/lo-curto.png";
                        }, alt: "Lo Curto \u2013 Wappen", style: { width: 160, height: "auto", marginBottom: 8 } }), _jsx("h1", { style: title, children: "RLC Bausoftware" }), _jsxs("p", { style: subtitle, children: ["Die ", _jsx("b", { children: "RLC Bausoftware" }), " ist die neue, intelligente Plattform f\u00FCr Kalkulation, Massenermittlung, CAD, B\u00FCro & Verwaltung, Abrechnung, KI-gest\u00FCtzte Assistenz sowie Info & Hilfe. Unser Ziel: die", _jsx("b", { children: " leistungsst\u00E4rkste und modernste Bausoftware" }), " am Markt, die den kompletten Bauprozess \u2013 von Planung bis Abrechnung \u2013 effizient, transparent und teilweise automatisiert abbildet."] }), _jsxs("div", { style: ctas, children: [_jsx(Link, { to: "/kalkulation", style: btn("primary"), children: "\u2192 Kalkulation starten" }), _jsx(Link, { to: "/mengenermittlung", style: btn("ghost"), children: "Mengenermittlung ansehen" }), _jsx(Link, { to: "/cad", style: btn("ghost"), children: "CAD / BIM" })] })] })] }));
}
