import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../ui/rlcRuntimeStyle"; // apps/web/src/lib/ui/Placeholder.tsx
export default function Placeholder({ title, description = "Inhalt folgt – Struktur bleibt fix.", action, icon }) {
    return (_jsxs("div", { className: "card rlc-migrated-shared-placeholder-tsx-1567", children: [icon && _jsx("div", { className: "rlc-migrated-shared-placeholder-tsx-1568", children: icon }), _jsx("div", { className: "card-title rlc-migrated-shared-placeholder-tsx-1569", children: title }), _jsx("div", { className: rlcClass("muted", { marginBottom: action ? 16 : 0 }), children: description }), action && _jsx("div", { children: action })] }));
}
