import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
import { NavLink, Outlet } from "react-router-dom";
const shellStyle = {
    display: "flex",
    alignItems: "stretch",
    gap: 16,
    minHeight: "100%",
    width: "100%",
    boxSizing: "border-box"
};
const asideStyle = {
    width: 280,
    padding: 14,
    borderRight: "1px solid #e5e7eb",
    background: "#fafafa",
    flexShrink: 0,
    boxSizing: "border-box"
};
const titleStyle = {
    fontWeight: 600,
    fontSize: 16,
    marginBottom: 12,
    color: "#111827"
};
const groupTitleStyle = {
    fontSize: 12,
    fontWeight: 600,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    margin: "14px 0 8px"
};
const mainStyle = {
    flex: 1,
    minWidth: 0,
    boxSizing: "border-box"
};
function getLinkStyle(isActive) {
    return {
        display: "block",
        padding: "10px 12px",
        borderRadius: 10,
        textDecoration: "none",
        color: isActive ? "#0b57d0" : "#374151",
        background: isActive ? "rgba(11,87,208,0.10)" : "transparent",
        border: isActive ?
            "1px solid rgba(11,87,208,0.18)" :
            "1px solid transparent",
        fontWeight: isActive ? 600 : 500,
        marginBottom: 6,
        transition: "all 0.15s ease"
    };
}
function MenuLink({ to, label, end = false }) {
    return (_jsx(NavLink, { to: to, end: end, style: ({ isActive }) => getLinkStyle(isActive), children: label }));
}
export default function CadLayout() {
    return (_jsxs("div", { className: rlcClass(null, shellStyle), children: [_jsxs("aside", { className: rlcClass(null, asideStyle), children: [_jsx("div", { className: rlcClass(null, titleStyle), children: "CAD / Viewer" }), _jsx(MenuLink, { to: "/cad", label: "\u00DCbersicht", end: true }), _jsx("div", { className: rlcClass(null, groupTitleStyle), children: "Viewer" }), _jsx(MenuLink, { to: "/cad/viewer", label: "CAD Viewer" }), _jsx(MenuLink, { to: "/cad/pdf-viewer", label: "PDF Viewer" }), _jsx(MenuLink, { to: "/cad/map", label: "CAD mit Karte" }), _jsx("div", { className: rlcClass(null, groupTitleStyle), children: "Auswertung" }), _jsx(MenuLink, { to: "/cad/asbuild", label: "As-Built" }), _jsx(MenuLink, { to: "/cad/tools", label: "Layer & Eigenschaften" })] }), _jsx("main", { className: rlcClass(null, mainStyle), children: _jsx(Outlet, {}) })] }));
}
