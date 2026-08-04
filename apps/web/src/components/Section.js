import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../ui/rlcRuntimeStyle";
import { Outlet } from "react-router-dom";
export default function Section({ left, right, centerVisible = true, children, style }) {
    const twoCols = centerVisible === false;
    const gridTemplateColumns = twoCols ?
        "260px minmax(0, 1fr)" :
        right ?
            "260px minmax(0, 1fr) 320px" :
            "260px minmax(0, 1fr)";
    const content = children ?? _jsx(Outlet, {});
    return (_jsxs("div", { className: rlcClass(null, {
            display: "grid",
            gridTemplateColumns,
            gap: 16,
            padding: 16,
            alignItems: "start",
            ...style
        }), children: [_jsx("aside", { className: "rlc-migrated-components-section-tsx-15", children: left }), twoCols ?
                _jsx("section", { className: "rlc-migrated-components-section-tsx-16", children: content }) :
                _jsxs(_Fragment, { children: [_jsx("main", { className: "rlc-migrated-components-section-tsx-17", children: content }), right ? _jsx("aside", { className: "rlc-migrated-components-section-tsx-18", children: right }) : null] })] }));
}
