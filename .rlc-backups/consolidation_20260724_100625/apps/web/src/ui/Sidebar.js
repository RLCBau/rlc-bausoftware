import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { NavLink } from "react-router-dom";
export default function Sidebar() {
    return (_jsx("aside", { style: { width: 300, padding: 12, borderRight: '1px solid var(--border)', height: '100vh', overflowY: 'auto' }, children: SECTIONS.map(m => (_jsxs("div", { style: { marginBottom: 16 }, children: [_jsxs("div", { style: { fontWeight: 700, marginBottom: 8 }, children: [m.emoji, " ", m.title] }), _jsx("ul", { style: { listStyle: 'none', padding: 0, margin: 0 }, children: m.subs.map(s => (_jsx("li", { style: { marginBottom: 6 }, children: _jsx(NavLink, { to: `/${m.id}/${s.id}`, className: ({ isActive }) => `link ${isActive ? 'active' : ''}`, children: s.title }) }, s.id))) })] }, m.id))) }));
}
