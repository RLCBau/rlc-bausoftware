import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
import React from "react";
import { UebergabeDB } from "./store.uebergabe";
/* ================= STYLES ================= */
const inp = {
    border: "1px solid var(--line)",
    borderRadius: 6,
    padding: "6px 8px",
    fontSize: 13
};
const lbl = { fontSize: 12, opacity: 0.8 };
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
/* ================= COMPONENT ================= */
export default function Uebergabe() {
    const [all, setAll] = React.useState(UebergabeDB.list());
    const [sel, setSel] = React.useState(all[0] ?? null);
    const [q, setQ] = React.useState("");
    const [proj, setProj] = React.useState("");
    const refresh = () => {
        const list = UebergabeDB.list();
        setAll(list);
        // keep selection valid
        if (sel) {
            const found = list.find((x) => x.id === sel.id);
            setSel(found ?? list[0] ?? null);
        }
    };
    /* ================= FILTER ================= */
    const filtered = React.useMemo(() => {
        return all.filter((d) => {
            const s = (d.title +
                " " + (d.projectId ?? "") +
                " " + (d.client ?? "")).
                toLowerCase();
            const okQ = !q || s.includes(q.toLowerCase());
            const okP = !proj || d.projectId === proj;
            return okQ && okP;
        });
    }, [all, q, proj]);
    const projects = React.useMemo(() => Array.from(new Set(all.map((d) => d.projectId).filter(Boolean))), [all]);
    /* ================= ACTIONS ================= */
    const add = () => {
        const d = UebergabeDB.create();
        refresh();
        setSel(d);
    };
    const del = () => {
        if (!sel)
            return;
        if (!confirm("Protokoll löschen?"))
            return;
        UebergabeDB.remove(sel.id);
        refresh();
    };
    const up = (p) => {
        if (!sel)
            return;
        const next = {
            ...sel,
            ...p,
            updatedAt: Date.now()
        };
        setSel(next);
        UebergabeDB.upsert(next);
        setAll(UebergabeDB.list());
    };
    /* ================= CHECKLIST ================= */
    const addItem = () => {
        if (!sel)
            return;
        const it = {
            id: crypto.randomUUID(),
            text: "",
            status: "open",
            note: ""
        };
        up({ checklist: [it, ...(sel.checklist || [])] });
    };
    const delItem = (id) => {
        if (!sel)
            return;
        up({
            checklist: (sel.checklist || []).filter((i) => i.id !== id)
        });
    };
    /* ================= SIGN ================= */
    const addSign = (role) => {
        if (!sel)
            return;
        pickFile(async (f) => {
            const url = await fileToDataURL(f);
            const s = {
                role,
                name: "",
                when: new Date().toISOString(),
                image: url
            };
            const signs = { ...(sel.signs || {}) };
            signs[role] = s;
            up({ signs });
        });
    };
    /* ================= ATTACHMENTS ================= */
    const onDrop = async (ev) => {
        ev.preventDefault();
        if (!sel)
            return;
        const f = ev.dataTransfer.files?.[0];
        if (!f)
            return;
        await UebergabeDB.attach(sel.id, f);
        refresh();
    };
    const open = (a) => {
        const w = window.open(a.dataURL, "_blank");
        if (!w)
            alert("Popup blockiert.");
    };
    /* ================= EXPORT ================= */
    const exportCSV = () => download("text/csv;charset=utf-8", "uebergabe.csv", UebergabeDB.exportCSV(filtered));
    const exportJSON = () => download("application/json", "uebergabe_backup.json", UebergabeDB.exportJSON());
    const importJSON = () => pickFile(async (f) => {
        const n = UebergabeDB.importJSON(await f.text());
        alert(`Backup importiert: ${n}.`);
        refresh();
    });
    /* ================= UI ================= */
    return (_jsxs("div", { className: "rlc-migrated-pages-buro-uebergabe-tsx-650", children: [_jsxs("div", { className: "card rlc-migrated-pages-buro-uebergabe-tsx-651", children: [_jsx("button", { className: "btn", onClick: add, children: "+ Protokoll" }), _jsx("button", { className: "btn", onClick: del, disabled: !sel, children: "L\u00F6schen" }), _jsx("div", { className: "rlc-migrated-pages-buro-uebergabe-tsx-652" }), _jsx("input", { placeholder: "Suche\u2026", value: q, onChange: (e) => setQ(e.target.value), className: rlcClass(null, { ...inp, width: 280 }) }), _jsxs("select", { value: proj, onChange: (e) => setProj(e.target.value), className: rlcClass(null, { ...inp, width: 160 }), children: [_jsx("option", { value: "", children: "Alle Projekte" }), projects.map((p) => _jsx("option", { children: p }, p))] }), _jsx("button", { className: "btn", onClick: exportCSV, children: "Export CSV" }), _jsx("button", { className: "btn", onClick: importJSON, children: "Import JSON" }), _jsx("button", { className: "btn", onClick: exportJSON, children: "Export JSON" })] }), _jsxs("div", { className: "rlc-migrated-pages-buro-uebergabe-tsx-653", children: [_jsx("div", { className: "card rlc-migrated-pages-buro-uebergabe-tsx-654", children: filtered.map((d) => _jsxs("div", { onClick: () => setSel(d), className: rlcClass(null, {
                                padding: 10,
                                cursor: "pointer",
                                background: sel?.id === d.id ? "#eef2ff" : undefined
                            }), children: [_jsx("b", { children: d.title }), " \u2014 ", d.projectId || "—"] }, d.id)) }), _jsx("div", { className: "card", onDrop: onDrop, onDragOver: (e) => e.preventDefault(), children: !sel ?
                            _jsx("div", { children: "Kein Protokoll gew\u00E4hlt" }) :
                            _jsx("input", { value: sel.title, onChange: (e) => up({ title: e.target.value }), className: rlcClass(null, inp) }) })] })] }));
}
/* ================= UTILS ================= */
function toDateInput(iso) {
    if (!iso)
        return "";
    const d = new Date(iso);
    const p = (n) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
async function fileToDataURL(f) {
    return await new Promise((res) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.readAsDataURL(f);
    });
}
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
function download(type, name, data) {
    const b = new Blob([data], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
}
