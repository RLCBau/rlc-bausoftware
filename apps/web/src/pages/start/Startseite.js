import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/start/Startseite.tsx
import { Link } from "react-router-dom";
import bgImage from "../../assets/construction-bg.jpg";
import logoSvg from "../../assets/lo-curto.svg";
import logoPng from "../../assets/lo-curto.png";
const shell = {
    position: "relative",
    minHeight: "100vh",
    overflow: "hidden",
    color: "#fff",
    textAlign: "center",
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
};
const bg = {
    position: "absolute",
    inset: 0,
    backgroundImage: `url(${bgImage})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    filter: "brightness(0.6)"
};
const gradient = {
    position: "absolute",
    inset: 0,
    background: "radial-gradient(ellipse at center, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.65) 100%)"
};
const card = {
    position: "relative",
    zIndex: 2,
    maxWidth: 980,
    padding: "48px 32px"
};
const title = {
    fontSize: 56,
    lineHeight: 1.1,
    margin: "18px 0 12px",
    fontWeight: 700,
    letterSpacing: ".5px"
};
const subtitle = {
    fontSize: 20,
    lineHeight: 1.7,
    opacity: 0.95,
    margin: "0 auto 32px"
};
const ctas = {
    display: "flex",
    gap: 16,
    justifyContent: "center",
    flexWrap: "wrap"
};
const btn = (variant) => ({
    padding: "11px 18px",
    borderRadius: 10,
    border: variant === "ghost" ? "1px solid rgba(255,255,255,.5)" : "none",
    background: variant === "ghost" ?
        "transparent" :
        "linear-gradient(135deg, #0ea5e9 0%, #22c55e 100%)",
    color: "#fff",
    fontSize: 14,
    fontWeight: 600,
    letterSpacing: ".2px",
    textDecoration: "none",
    boxShadow: variant === "ghost" ?
        "none" :
        "0 8px 30px rgba(34,197,94,.35), 0 4px 12px rgba(14,165,233,.25)"
});
export default function Startseite() {
    return (_jsxs("main", { className: rlcClass(null, shell), children: [_jsx("div", { className: rlcClass(null, bg) }), _jsx("div", { className: rlcClass(null, gradient) }), _jsxs("section", { className: rlcClass(null, card), children: [_jsx("img", { src: logoSvg, onError: (e) => {
                            e.currentTarget.src = logoPng;
                        }, alt: "Lo Curto \u00E2\u20AC\u201C Wappen", className: "rlc-migrated-pages-start-startseite-tsx-1565" }), _jsx("h1", { className: rlcClass(null, title), children: "RLC Bausoftware" }), _jsxs("p", { className: rlcClass(null, subtitle), children: ["Die ", _jsx("b", { children: "RLC Bausoftware" }), " ist die neue intelligente Plattform f\u00C3\u00BCr", _jsx("b", { children: " Kalkulation" }), ", ", _jsx("b", { children: "Massenermittlung" }), ", ", _jsx("b", { children: "CAD" }), ",", " ", _jsx("b", { children: "B\u00C3\u00BCro / Verwaltung" }), ", ", _jsx("b", { children: "KI" }), ", ", _jsx("b", { children: "Info / Hilfe" }), " und", " ", _jsx("b", { children: "Buchhaltung" }), ". Ziel ist eine durchg\u00C3\u00A4ngige, moderne und leistungsstarke Bausoftware, die den kompletten Bauprozess von der Planung bis zur Abrechnung digital, transparent und effizient abbildet."] }), _jsxs("div", { className: rlcClass(null, ctas), children: [_jsx(Link, { to: "/kalkulation", style: btn("primary"), children: "\u00E2\u2020\u2019 Kalkulation starten" }), _jsx(Link, { to: "/mengenermittlung/aufmasseditor", style: btn("ghost"), children: "Massenermittlung \u00C3\u00B6ffnen" }), _jsx(Link, { to: "/cad", style: btn("ghost"), children: "CAD / BIM" })] })] })] }));
}
