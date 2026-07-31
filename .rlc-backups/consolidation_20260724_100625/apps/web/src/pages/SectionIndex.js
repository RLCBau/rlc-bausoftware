import { jsx as _jsx } from "react/jsx-runtime";
import { Link, useParams } from "react-router-dom";
import { Card } from "../ui/kit";
export default function SectionIndex() {
    const { macro } = useParams();
    const m = SECTIONS.find(x => x.id === macro);
    if (!m)
        return _jsx("p", { className: "muted", children: "Sezione non trovata." });
    return (_jsx(Card, { title: m.emoji + " " + m.title, children: _jsx("ul", { children: m.subs.map(s => (_jsx("li", { style: { marginBottom: 8 }, children: _jsx(Link, { to: `/${m.id}/${s.id}`, children: s.title }) }, s.id))) }) }));
}
