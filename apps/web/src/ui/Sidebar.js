import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { NavLink } from "react-router-dom";
export default function Sidebar({ sections }) {
    return (_jsx("aside", { className: "rlc-migrated-ui-sidebar-tsx-1574", children: sections.map((section) => _jsxs("div", { className: "rlc-migrated-ui-sidebar-tsx-1575", children: [_jsxs("div", { className: "rlc-migrated-ui-sidebar-tsx-1576", children: [section.emoji ? `${section.emoji} ` : "", section.title] }), _jsx("ul", { className: "rlc-migrated-ui-sidebar-tsx-1577", children: section.subs.map((sub) => _jsx("li", { className: "rlc-migrated-ui-sidebar-tsx-1578", children: _jsx(NavLink, { to: `/${section.id}/${sub.id}`, className: ({ isActive }) => `link ${isActive ? "active" : ""}`, children: sub.title }) }, sub.id)) })] }, section.id)) }));
}
