import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
export function Card({ title, children, className = "" }) {
    return (_jsxs("div", { className: `card ${className}`.trim(), children: [title ? _jsx("div", { className: "card-title", children: title }) : null, children] }));
}
export function Row({ children, className = "" }) {
    return _jsx("div", { className: `toolbar ${className}`.trim(), children: children });
}
export function Collapsible({ title, defaultOpen = false, children, className = "" }) {
    const [open, setOpen] = useState(defaultOpen);
    return (_jsxs("div", { className: `${`card ${className}`.trim()} rlc-migrated-ui-kit-tsx-1579`, children: [_jsxs("button", { type: "button", className: "card-h rlc-migrated-ui-kit-tsx-1580", onClick: () => setOpen((v) => !v), "aria-expanded": open, children: [title, " ", open ? "▾" : "▸"] }), open ? _jsx("div", { className: "card-b", children: children }) : null] }));
}
