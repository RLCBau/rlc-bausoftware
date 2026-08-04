import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export default function PageHeader({ breadcrumb, title, subtitle }) {
    return (_jsxs("header", { className: "rlc-page-hero", children: [breadcrumb ? _jsx("div", { className: "rlc-page-hero__eyebrow", children: breadcrumb }) : null, _jsx("h1", { children: title }), subtitle ? _jsx("p", { children: subtitle }) : null] }));
}
