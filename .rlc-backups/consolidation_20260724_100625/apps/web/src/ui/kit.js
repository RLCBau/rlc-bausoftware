import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function Card({ title, children }) {
    return (_jsxs("div", { className: "card", children: [title && _jsx("div", { className: "card-title", children: title }), children] }));
}
export function Row({ children }) {
    return _jsx("div", { className: "toolbar", children: children });
}
export function Collapsible(p) {
    const [open, set] = useState(!!p.defaultOpen);
    return (_jsxs("div", { className: "card", style: { marginBottom: 12 }, children: [_jsxs("div", { className: "card-h", style: { cursor: 'pointer' }, onClick: () => set(o => !o), children: [p.title, " ", open ? '▾' : '▸'] }), open && _jsx("div", { className: "card-b", children: p.children })] }));
}
