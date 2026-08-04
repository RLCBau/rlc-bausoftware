import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { DocsDB } from "./store.docs";
/* ================= STYLES ================= */
const th = {
    textAlign: "left",
    padding: "8px 10px",
    borderBottom: "1px solid var(--line)",
    fontSize: 13,
    whiteSpace: "nowrap"
};
const td = {
    padding: "6px 10px",
    borderBottom: "1px solid var(--line)",
    fontSize: 13,
    verticalAlign: "middle"
};
const lbl = { fontSize: 13, opacity: 0.8 };
const inp = {
    border: "1px solid var(--line)",
    borderRadius: 6,
    padding: "6px 8px",
    fontSize: 13
};
/* ================= COMPONENT ================= */
export default function Dokumente() {
    const [all, setAll] = React.useState(DocsDB.list());
    const [selId, setSelId] = React.useState(all[0]?.id ?? null);
    const [q, setQ] = React.useState("");
    const [tagFilter, setTagFilter] = React.useState("");
    const [zoom, setZoom] = React.useState(1);
    const [showSig, setShowSig] = React.useState(false);
    const sel = all.find((d) => d.id === selId) ?? null;
    const cur = sel?.versions?.[0];
    const refresh = () => {
        const list = DocsDB.list();
        setAll(list);
        if (selId) {
            const exists = list.find((x) => x.id === selId);
            if (!exists)
                setSelId(list[0]?.id ?? null);
        }
    };
    /* ================= SAFE HELPERS ================= */
    const getStatus = () => sel?.status || "Entwurf";
    const getSigs = () => sel?.signatures || [];
    const getHist = () => sel?.history || [];
    const patch = (p) => {
        if (!sel)
            return;
        DocsDB.upsert({
            ...sel,
            ...p,
            updatedAt: Date.now()
        });
        refresh();
    };
    /* ================= ACTIONS ================= */
    const addDoc = () => {
        const d = DocsDB.create();
        refresh();
        setSelId(d.id);
    };
    const delDoc = () => {
        if (!sel)
            return;
        if (!confirm("Dokument löschen?"))
            return;
        DocsDB.remove(sel.id);
        refresh();
    };
    const update = (p) => {
        if (!sel)
            return;
        DocsDB.upsert({ ...sel, ...p });
        refresh();
    };
    /* ================= VERSION ================= */
    const uploadNewVersion = async () => pickFile(async (f) => {
        if (!sel)
            return;
        await DocsDB.addVersion(sel.id, f);
        addHist("status", `Neue Version: ${f.name}`);
        refresh();
    });
    const onDrop = async (ev) => {
        ev.preventDefault();
        if (!sel)
            return;
        const f = ev.dataTransfer.files?.[0];
        if (!f)
            return;
        await DocsDB.addVersion(sel.id, f);
        addHist("status", `Neue Version (Drag&Drop): ${f.name}`);
        refresh();
    };
    /* ================= HISTORY ================= */
    const addHist = (type, message) => {
        if (!sel)
            return;
        const hist = getHist();
        const rec = {
            id: crypto.randomUUID(),
            when: Date.now(),
            type,
            message
        };
        patch({ history: [rec, ...hist] });
    };
    /* ================= FILTER ================= */
    const filtered = React.useMemo(() => {
        return all.filter((d) => {
            const s = (d.title +
                " " +
                (d.tags ?? []).join(" ")).
                toLowerCase();
            const okQ = !q || s.includes(q.toLowerCase());
            const okT = !tagFilter ||
                (d.tags ?? []).map((t) => t.toLowerCase()).includes(tagFilter.toLowerCase());
            return okQ && okT;
        });
    }, [all, q, tagFilter]);
    const allTags = React.useMemo(() => Array.from(new Set(all.flatMap((d) => d.tags ?? []))).sort(), [all]);
    /* ================= PREVIEW ================= */
    const renderPreview = (v) => {
        if (!v)
            return _jsx("div", { className: "rlc-migrated-pages-buro-vertraege-tsx-655", children: "Keine Vorschau." });
        const isPDF = (v.mime || "").includes("pdf");
        const isImg = (v.mime || "").startsWith("image/");
        return isPDF ?
            _jsx("iframe", { src: v.dataURL, className: "rlc-migrated-pages-buro-vertraege-tsx-656" }) :
            isImg ?
                _jsx("img", { src: v.dataURL, className: "rlc-migrated-pages-buro-vertraege-tsx-657" }) :
                _jsx("div", { children: "Keine Vorschau verf\u00FCgbar" });
    };
    /* ================= UI ================= */
    return (_jsxs("div", { className: "rlc-migrated-pages-buro-vertraege-tsx-658", children: [_jsx("button", { onClick: addDoc, children: "+ Dokument" }), _jsxs("div", { className: "rlc-migrated-pages-buro-vertraege-tsx-659", children: [_jsx("div", { children: filtered.map((d) => _jsx("div", { onClick: () => setSelId(d.id), children: d.title }, d.id)) }), _jsx("div", { children: renderPreview(cur) })] })] }));
}
/* ================= UTILS ================= */
function pickFile(onPick) {
    const i = document.createElement("input");
    i.type = "file";
    i.onchange = () => {
        const f = i.files?.[0];
        if (f)
            onPick(f);
    };
    i.click();
}
