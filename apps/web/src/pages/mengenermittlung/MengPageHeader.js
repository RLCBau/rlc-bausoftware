import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useNavigate } from "react-router-dom";
export default function MengPageHeader({ title, subtitle, badge = "Mengenermittlung", actions }) {
    const navigate = useNavigate();
    return (_jsxs("header", { className: "rlc-page-hero rlc-page-hero--split", children: [_jsxs("div", { children: [_jsx("div", { className: "rlc-page-hero__eyebrow", children: badge }), _jsx("h1", { children: title }), subtitle ? _jsx("p", { children: subtitle }) : null] }), _jsxs("div", { className: "rlc-page-hero__actions", children: [actions, _jsx("button", { type: "button", className: "rlc-page-hero__button", onClick: () => navigate("/mengenermittlung"), children: "\u00DCbersicht" })] })] }));
}
