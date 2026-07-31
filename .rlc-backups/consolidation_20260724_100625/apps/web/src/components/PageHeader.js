import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
export default function PageHeader({ breadcrumb, title, subtitle }) {
    return (_jsxs("div", { className: "mb-4", children: [breadcrumb && _jsx("div", { className: "text-xs text-gray-500", children: breadcrumb }), _jsx("h1", { className: "text-xl font-semibold", children: title }), subtitle && _jsx("p", { className: "text-sm text-gray-600", children: subtitle })] }));
}
