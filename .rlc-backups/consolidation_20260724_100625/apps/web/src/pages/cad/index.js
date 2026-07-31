import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { NavLink, Outlet } from "react-router-dom";
export default function CadLayout() {
    const link = (to, label) => (_jsx(NavLink, { to: to, style: ({ isActive }) => ({
            display: "block",
            padding: "10px 12px",
            borderRadius: 8,
            textDecoration: "none",
            color: isActive ? "#0b57d0" : "#333",
            background: isActive ? "rgba(11,87,208,0.08)" : "transparent",
            fontWeight: 500,
            marginBottom: 6,
        }), children: label }));
    return (_jsxs("div", { style: { display: "flex", height: "100%", gap: 16 }, children: [_jsxs("aside", { style: { width: 280, padding: 12, borderRight: "1px solid #eee" }, children: [_jsx("div", { style: { fontWeight: 700, marginBottom: 8 }, children: "CAD" }), link("/cad/editor2d", "2D-Zeichnungsmodul")] }), _jsx("main", { style: { flex: 1, minWidth: 0 }, children: _jsx(Outlet, {}) })] }));
}
