import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React from "react";
/** ====== STORE INTERFACE (usa il tuo store reale) ======
 * Mi appoggio a un KommsDB con funzioni: list(), createThread(), removeThread(id),
 * addMessage(threadId, msg), upsertThread(patch), attach(threadId, file).
 * Se il tuo store ha nomi diversi, mappali internamente.
 */
import { KommsDB } from "./store.komms";
const th = { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--line)", fontSize: 13, whiteSpace: "nowrap" };
const td = { padding: "6px 10px", borderBottom: "1px solid var(--line)", fontSize: 13, verticalAlign: "middle" };
const inp = { border: "1px solid var(--line)", borderRadius: 6, padding: "6px 8px", fontSize: 13 };
const lbl = { fontSize: 12, opacity: .8 };
export default function Kommunikation() {
    const [threads, setThreads] = React.useState(KommsDB.list());
    const [selId, setSelId] = React.useState(threads[0]?.id ?? null);
    const [q, setQ] = React.useState("");
    const [onlyUnread, setOnlyUnread] = React.useState(false);
    const [proj, setProj] = React.useState("");
    const [compose, setCompose] = React.useState({ to: "", cc: "", subject: "", body: "" });
    const sel = threads.find(t => t.id === selId) ?? null;
    const refresh = () => setThreads(KommsDB.list());
    // actions thread
    const newThread = () => { const t = KommsDB.createThread(); refresh(); setSelId(t.id); };
    const delThread = () => { if (!sel)
        return; if (!confirm("Konversation löschen?"))
        return; KommsDB.removeThread(sel.id); refresh(); setSelId(KommsDB.list()[0]?.id ?? null); };
    const update = (patch) => { if (!sel)
        return; KommsDB.upsertThread({ ...sel, ...patch, updatedAt: Date.now() }); refresh(); };
    // filters
    const filtered = () => threads.filter(t => {
        const text = (t.subject + " " + (t.participants ?? []).join(" ") + " " + (t.projectId ?? "")).toLowerCase();
        const okQ = !q || text.includes(q.toLowerCase());
        const okUnread = !onlyUnread || (t.unreadCount ?? 0) > 0;
        const okP = !proj || (t.projectId ?? "") === proj;
        return okQ && okUnread && okP;
    });
    // message send
    const send = async () => {
        if (!sel)
            return;
        const body = compose.body.trim();
        if (!body)
            return;
        const msg = {
            id: crypto.randomUUID(),
            when: Date.now(),
            from: "Ich",
            to: compose.to ? compose.to.split(",").map(s => s.trim()).filter(Boolean) : [],
            cc: compose.cc ? compose.cc.split(",").map(s => s.trim()).filter(Boolean) : [],
            subject: compose.subject || sel.subject || "(ohne Betreff)",
            body,
            attachments: []
        };
        await KommsDB.addMessage(sel.id, msg);
        setCompose({ ...compose, body: "" });
        refresh();
    };
    // drop attachments to thread
    const onDrop = async (ev) => {
        ev.preventDefault();
        if (!sel)
            return;
        const f = ev.dataTransfer.files?.[0];
        if (!f)
            return;
        await KommsDB.attach(sel.id, f); // allega a thread come “Dateien”
        refresh();
    };
    // attachment preview
    const Att = ({ a }) => {
        const isImg = (a.mime || "").startsWith("image/");
        const isPDF = (a.mime || "").includes("pdf");
        const open = () => { const w = window.open(a.dataURL, "_blank"); if (!w)
            alert("Popup blockiert."); };
        return (_jsxs("div", { style: { border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden", background: "#fff" }, children: [_jsxs("div", { style: { padding: "6px 8px", fontSize: 12, display: "flex", alignItems: "center", gap: 8 }, children: [_jsx("span", { style: { fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: a.name }), _jsx("div", { style: { flex: 1 } }), _jsx("button", { className: "btn", onClick: open, children: "\u00D6ffnen" })] }), isImg && _jsx("img", { src: a.dataURL, alt: a.name, style: { width: "100%", height: "auto", display: "block" } }), isPDF && _jsx("iframe", { title: a.name, src: a.dataURL, style: { width: "100%", height: 200, border: 0 } })] }));
    };
    // quick mark read
    const markAllRead = () => { if (!sel)
        return; const t = { ...sel, unreadCount: 0 }; KommsDB.upsertThread(t); refresh(); };
    // projects list (simple from threads)
    const projects = Array.from(new Set(threads.map(t => t.projectId).filter(Boolean)));
    return (_jsxs("div", { style: { display: "grid", gridTemplateRows: "auto 1fr", gap: 10, padding: 10 }, children: [_jsxs("div", { className: "card", style: { padding: "8px 10px", display: "flex", gap: 8, alignItems: "center" }, children: [_jsx("button", { className: "btn", onClick: newThread, children: "+ Neue Konversation" }), _jsx("button", { className: "btn", onClick: delThread, disabled: !sel, children: "L\u00F6schen" }), _jsx("div", { style: { flex: 1 } }), _jsx("input", { placeholder: "Suche Betreff / Teilnehmer / Projekt\u2026", value: q, onChange: e => setQ(e.target.value), style: { ...inp, width: 300 } }), _jsxs("select", { value: proj, onChange: e => setProj(e.target.value), style: { ...inp, width: 160 }, children: [_jsx("option", { value: "", children: "Alle Projekte" }), projects.map(p => _jsx("option", { value: p, children: p }, p))] }), _jsxs("label", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [_jsx("input", { type: "checkbox", checked: onlyUnread, onChange: e => setOnlyUnread(e.target.checked) }), _jsx("span", { style: { fontSize: 13 }, children: "Nur ungelesene" })] })] }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "minmax(380px, 44vw) 1fr", gap: 10, minHeight: "60vh" }, children: [_jsx("div", { className: "card", style: { padding: 0, overflow: "auto" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: th, children: "Betreff" }), _jsx("th", { style: th, children: "Projekt" }), _jsx("th", { style: th, children: "Teilnehmer" }), _jsx("th", { style: th, children: "Ungelesen" }), _jsx("th", { style: th, children: "Aktualisiert" })] }) }), _jsx("tbody", { children: filtered().map(t => (_jsxs("tr", { onClick: () => setSelId(t.id), style: { cursor: "pointer", background: t.id === selId ? "#f1f5ff" : undefined }, children: [_jsx("td", { style: td, title: t.subject, children: _jsx("b", { children: t.subject || "(ohne Betreff)" }) }), _jsx("td", { style: td, children: t.projectId || "—" }), _jsxs("td", { style: td, title: (t.participants || []).join(", "), children: [(t.participants || []).slice(0, 3).join(", "), (t.participants || []).length > 3 ? "…" : ""] }), _jsx("td", { style: td, children: t.unreadCount ?? 0 }), _jsx("td", { style: td, children: new Date(t.updatedAt).toLocaleString() })] }, t.id))) })] }) }), _jsx("div", { className: "card", style: { padding: 12, display: "grid", gridTemplateRows: "auto auto 1fr auto", gap: 10 }, onDragOver: e => e.preventDefault(), onDrop: onDrop, children: !sel ? (_jsx("div", { style: { opacity: .7 }, children: "Links eine Konversation w\u00E4hlen oder neu erstellen." })) : (_jsxs(_Fragment, { children: [_jsxs("div", { style: { display: "grid", gridTemplateColumns: "120px 1fr 120px 1fr", gap: 10 }, children: [_jsx("label", { style: lbl, children: "Betreff" }), _jsx("input", { style: inp, value: sel.subject, onChange: e => update({ subject: e.target.value }) }), _jsx("label", { style: lbl, children: "Projekt-ID" }), _jsx("input", { style: inp, value: sel.projectId ?? "", onChange: e => update({ projectId: e.target.value }) }), _jsx("label", { style: lbl, children: "Teilnehmer" }), _jsx("input", { style: inp, placeholder: "kommagetrennt", value: (sel.participants ?? []).join(", "), onChange: e => update({ participants: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }) }), _jsx("div", {}), _jsx("div", { style: { display: "flex", gap: 8 }, children: _jsx("button", { className: "btn", onClick: markAllRead, children: "Als gelesen markieren" }) })] }), (sel.attachments?.length ?? 0) > 0 && (_jsxs("div", { children: [_jsx("div", { style: { fontWeight: 700, marginBottom: 6 }, children: "Dateien" }), _jsx("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }, children: sel.attachments.map(a => _jsx(Att, { a: a }, a.id)) })] })), _jsx("div", { style: { border: "1px solid var(--line)", borderRadius: 8, overflow: "auto", background: "#fff", padding: 10 }, children: sel.messages.length === 0 ? (_jsx("div", { style: { opacity: .6 }, children: "Noch keine Nachrichten." })) : (sel.messages
                                        .slice()
                                        .sort((a, b) => a.when - b.when)
                                        .map(m => (_jsxs("div", { style: { padding: "8px 10px", borderBottom: "1px dashed var(--line)" }, children: [_jsxs("div", { style: { display: "flex", gap: 6, alignItems: "baseline" }, children: [_jsx("div", { style: { fontWeight: 700 }, children: m.from }), _jsx("div", { style: { fontSize: 12, opacity: .7 }, children: new Date(m.when).toLocaleString() })] }), m.subject && _jsx("div", { style: { fontSize: 13, margin: "2px 0 6px 0" }, children: _jsx("b", { children: m.subject }) }), _jsx("div", { style: { whiteSpace: "pre-wrap", fontSize: 13 }, children: m.body }), m.attachments?.length ? (_jsx("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8, marginTop: 8 }, children: m.attachments.map(a => _jsx(Att, { a: a }, a.id)) })) : null] }, m.id)))) }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "80px 1fr 40px 1fr", gap: 8 }, children: [_jsx("label", { style: lbl, children: "An" }), _jsx("input", { style: inp, value: compose.to, onChange: e => setCompose(p => ({ ...p, to: e.target.value })), placeholder: "mail1@..., mail2@..." }), _jsx("label", { style: lbl, children: "CC" }), _jsx("input", { style: inp, value: compose.cc, onChange: e => setCompose(p => ({ ...p, cc: e.target.value })) }), _jsx("label", { style: lbl, children: "Betreff" }), _jsx("input", { style: { ...inp, gridColumn: "2 / -1" }, value: compose.subject, onChange: e => setCompose(p => ({ ...p, subject: e.target.value })) }), _jsx("label", { style: { ...lbl, gridColumn: "1 / -1" }, children: "Nachricht" }), _jsx("textarea", { style: { ...inp, gridColumn: "1 / -1", minHeight: 120, resize: "vertical" }, value: compose.body, onChange: e => setCompose(p => ({ ...p, body: e.target.value })), placeholder: "Schreibe eine Nachricht\u2026 (Anh\u00E4nge: Datei auf diesen Bereich ziehen)" }), _jsx("div", { style: { gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: 8 }, children: _jsx("button", { className: "btn", onClick: send, disabled: !compose.body.trim(), children: "Senden" }) })] })] })) })] })] }));
}
