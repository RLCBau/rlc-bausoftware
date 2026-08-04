import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
import React from "react";
import { KommsDB } from "./store.komms";
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
const inp = {
    border: "1px solid var(--line)",
    borderRadius: 6,
    padding: "6px 8px",
    fontSize: 13
};
const lbl = {
    fontSize: 12,
    opacity: 0.8
};
const EMPTY_COMPOSE = {
    to: "",
    cc: "",
    subject: "",
    body: ""
};
function pickFile(cb) {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = false;
    input.onchange = async () => {
        const file = input.files?.[0];
        if (!file)
            return;
        await cb(file);
    };
    input.click();
}
export default function Kommunikation() {
    const [threads, setThreads] = React.useState(KommsDB.list());
    const [selId, setSelId] = React.useState(KommsDB.list()[0]?.id ?? null);
    const [q, setQ] = React.useState("");
    const [onlyUnread, setOnlyUnread] = React.useState(false);
    const [proj, setProj] = React.useState("");
    const [compose, setCompose] = React.useState(EMPTY_COMPOSE);
    const refresh = React.useCallback(() => {
        const next = KommsDB.list();
        setThreads(next);
        setSelId((prev) => {
            if (prev && next.some((t) => t.id === prev))
                return prev;
            return next[0]?.id ?? null;
        });
    }, []);
    const sel = React.useMemo(() => threads.find((t) => t.id === selId) ?? null, [threads, selId]);
    const filtered = React.useMemo(() => {
        const qq = q.trim().toLowerCase();
        return threads.filter((t) => {
            const text = `${t.subject ?? ""} ${(t.participants ?? []).join(" ")} ${t.projectId ?? ""}`.
                toLowerCase();
            const okQ = !qq || text.includes(qq);
            const okUnread = !onlyUnread || (t.unreadCount ?? 0) > 0;
            const okP = !proj || (t.projectId ?? "") === proj;
            return okQ && okUnread && okP;
        });
    }, [threads, q, onlyUnread, proj]);
    const projects = React.useMemo(() => Array.from(new Set(threads.map((t) => t.projectId).filter(Boolean))), [threads]);
    const newThread = React.useCallback(() => {
        const t = KommsDB.createThread();
        refresh();
        setSelId(t.id);
        setCompose(EMPTY_COMPOSE);
    }, [refresh]);
    const delThread = React.useCallback(() => {
        if (!sel)
            return;
        if (!window.confirm("Konversation löschen?"))
            return;
        KommsDB.removeThread(sel.id);
        refresh();
        setCompose(EMPTY_COMPOSE);
    }, [sel, refresh]);
    const update = React.useCallback((patch) => {
        if (!sel)
            return;
        const next = {
            ...sel,
            ...patch,
            updatedAt: Date.now()
        };
        KommsDB.upsertThread(next);
        refresh();
    }, [sel, refresh]);
    const uploadNewVersion = React.useCallback(() => {
        if (!sel)
            return;
        pickFile(async (f) => {
            await KommsDB.attach(sel.id, f);
            refresh();
        });
    }, [sel, refresh]);
    const send = React.useCallback(async () => {
        if (!sel)
            return;
        const body = compose.body.trim();
        if (!body)
            return;
        const subject = (compose.subject || sel.subject || "(ohne Betreff)").trim();
        const toList = compose.to ?
            compose.to.
                split(",").
                map((s) => s.trim()).
                filter(Boolean) :
            [];
        const ccList = compose.cc ?
            compose.cc.
                split(",").
                map((s) => s.trim()).
                filter(Boolean) :
            [];
        const msg = {
            id: crypto.randomUUID(),
            when: Date.now(),
            from: "Ich",
            to: toList,
            cc: ccList,
            subject,
            body,
            attachments: []
        };
        await KommsDB.addMessage(sel.id, msg);
        const existingParticipants = Array.isArray(sel.participants) ?
            sel.participants :
            [];
        const participantSet = new Set([
            ...existingParticipants,
            ...toList,
            ...ccList
        ]);
        KommsDB.upsertThread({
            ...sel,
            subject,
            participants: Array.from(participantSet),
            updatedAt: Date.now()
        });
        setCompose((prev) => ({
            ...prev,
            subject,
            body: ""
        }));
        refresh();
    }, [sel, compose, refresh]);
    const onDrop = React.useCallback(async (ev) => {
        ev.preventDefault();
        if (!sel)
            return;
        const f = ev.dataTransfer.files?.[0];
        if (!f)
            return;
        await KommsDB.attach(sel.id, f);
        refresh();
    }, [sel, refresh]);
    const markAllRead = React.useCallback(() => {
        if (!sel)
            return;
        KommsDB.upsertThread({
            ...sel,
            unreadCount: 0,
            updatedAt: Date.now()
        });
        refresh();
    }, [sel, refresh]);
    React.useEffect(() => {
        if (!sel) {
            setCompose(EMPTY_COMPOSE);
            return;
        }
        setCompose((prev) => ({
            ...prev,
            subject: prev.subject || sel.subject || ""
        }));
    }, [selId, sel]);
    return (_jsxs("div", { className: "rlc-migrated-pages-buro-kommunikation-tsx-485", children: [_jsxs("div", { className: "card rlc-migrated-pages-buro-kommunikation-tsx-486", children: [_jsx("button", { className: "btn", onClick: newThread, children: "+ Neue Konversation" }), _jsx("button", { className: "btn", onClick: delThread, disabled: !sel, children: "L\u00F6schen" }), _jsx("button", { className: "btn", onClick: uploadNewVersion, disabled: !sel, children: "Datei anh\u00E4ngen" }), _jsx("div", { className: "rlc-migrated-pages-buro-kommunikation-tsx-487" }), _jsx("input", { placeholder: "Suche Betreff / Teilnehmer / Projekt\u2026", value: q, onChange: (e) => setQ(e.target.value), className: rlcClass(null, { ...inp, width: 300 }) }), _jsxs("select", { value: proj, onChange: (e) => setProj(e.target.value), className: rlcClass(null, { ...inp, width: 160 }), children: [_jsx("option", { value: "", children: "Alle Projekte" }), projects.map((p) => _jsx("option", { value: p, children: p }, p))] }), _jsxs("label", { className: "rlc-migrated-pages-buro-kommunikation-tsx-488", children: [_jsx("input", { type: "checkbox", checked: onlyUnread, onChange: (e) => setOnlyUnread(e.target.checked) }), _jsx("span", { className: "rlc-migrated-pages-buro-kommunikation-tsx-489", children: "Nur ungelesene" })] })] }), _jsxs("div", { className: "rlc-migrated-pages-buro-kommunikation-tsx-490", children: [_jsx("div", { className: "card rlc-migrated-pages-buro-kommunikation-tsx-491", children: _jsxs("table", { className: "rlc-migrated-pages-buro-kommunikation-tsx-492", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, th), children: "Betreff" }), _jsx("th", { className: rlcClass(null, th), children: "Projekt" }), _jsx("th", { className: rlcClass(null, th), children: "Teilnehmer" }), _jsx("th", { className: rlcClass(null, th), children: "Ungelesen" }), _jsx("th", { className: rlcClass(null, th), children: "Aktualisiert" })] }) }), _jsx("tbody", { children: filtered.length === 0 ?
                                        _jsx("tr", { children: _jsx("td", { className: rlcClass(null, { ...td, opacity: 0.7 }), colSpan: 5, children: "Keine Konversationen gefunden." }) }) :
                                        filtered.map((t) => _jsxs("tr", { onClick: () => setSelId(t.id), className: rlcClass(null, {
                                                cursor: "pointer",
                                                background: t.id === selId ? "#f1f5ff" : undefined
                                            }), children: [_jsx("td", { className: rlcClass(null, td), title: t.subject, children: _jsx("b", { children: t.subject || "(ohne Betreff)" }) }), _jsx("td", { className: rlcClass(null, td), children: t.projectId || "—" }), _jsxs("td", { className: rlcClass(null, td), title: (t.participants || []).join(", "), children: [(t.participants || []).slice(0, 3).join(", "), (t.participants || []).length > 3 ? "…" : ""] }), _jsx("td", { className: rlcClass(null, td), children: t.unreadCount ?? 0 }), _jsx("td", { className: rlcClass(null, td), children: new Date(t.updatedAt).toLocaleString() })] }, t.id)) })] }) }), _jsx("div", { className: "card rlc-migrated-pages-buro-kommunikation-tsx-493", onDragOver: (e) => e.preventDefault(), onDrop: onDrop, children: !sel ?
                            _jsx("div", { className: "rlc-migrated-pages-buro-kommunikation-tsx-494", children: "Links eine Konversation w\u00E4hlen oder neu erstellen." }) :
                            _jsxs(_Fragment, { children: [_jsxs("div", { className: "rlc-migrated-pages-buro-kommunikation-tsx-495", children: [_jsx("label", { className: rlcClass(null, lbl), children: "Betreff" }), _jsx("input", { className: rlcClass(null, inp), value: sel.subject ?? "", onChange: (e) => update({ subject: e.target.value }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Projekt-ID" }), _jsx("input", { className: rlcClass(null, inp), value: sel.projectId ?? "", onChange: (e) => update({ projectId: e.target.value }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Teilnehmer" }), _jsx("input", { className: rlcClass(null, inp), placeholder: "kommagetrennt", value: (sel.participants ?? []).join(", "), onChange: (e) => update({
                                                    participants: e.target.value.
                                                        split(",").
                                                        map((s) => s.trim()).
                                                        filter(Boolean)
                                                }) }), _jsx("div", {}), _jsx("div", { className: "rlc-migrated-pages-buro-kommunikation-tsx-496", children: _jsx("button", { className: "btn", onClick: markAllRead, children: "Als gelesen markieren" }) })] }), (sel.attachments?.length ?? 0) > 0 &&
                                        _jsxs("div", { children: [_jsx("div", { className: "rlc-migrated-pages-buro-kommunikation-tsx-497", children: "Dateien" }), _jsx("div", { className: "rlc-migrated-pages-buro-kommunikation-tsx-498", children: (sel.attachments ?? []).map((a) => _jsx(AttachmentPreview, { a: a }, a.id)) })] }), _jsx("div", { className: "rlc-migrated-pages-buro-kommunikation-tsx-499", children: sel.messages.length === 0 ?
                                            _jsx("div", { className: "rlc-migrated-pages-buro-kommunikation-tsx-500", children: "Noch keine Nachrichten." }) :
                                            sel.messages.
                                                slice().
                                                sort((a, b) => a.when - b.when).
                                                map((m) => _jsxs("div", { className: "rlc-migrated-pages-buro-kommunikation-tsx-501", children: [_jsxs("div", { className: "rlc-migrated-pages-buro-kommunikation-tsx-502", children: [_jsx("div", { className: "rlc-migrated-pages-buro-kommunikation-tsx-503", children: m.from }), _jsx("div", { className: "rlc-migrated-pages-buro-kommunikation-tsx-504", children: new Date(m.when).toLocaleString() })] }), m.subject ?
                                                        _jsx("div", { className: "rlc-migrated-pages-buro-kommunikation-tsx-505", children: _jsx("b", { children: m.subject }) }) :
                                                        null, _jsx("div", { className: "rlc-migrated-pages-buro-kommunikation-tsx-506", children: m.body }), (m.attachments?.length ?? 0) > 0 ?
                                                        _jsx("div", { className: "rlc-migrated-pages-buro-kommunikation-tsx-507", children: (m.attachments ?? []).map((a) => _jsx(AttachmentPreview, { a: a }, a.id)) }) :
                                                        null] }, m.id)) }), _jsxs("div", { className: "rlc-migrated-pages-buro-kommunikation-tsx-508", children: [_jsx("label", { className: rlcClass(null, lbl), children: "An" }), _jsx("input", { className: rlcClass(null, inp), value: compose.to, onChange: (e) => setCompose((p) => ({ ...p, to: e.target.value })), placeholder: "mail1@..., mail2@..." }), _jsx("label", { className: rlcClass(null, lbl), children: "CC" }), _jsx("input", { className: rlcClass(null, inp), value: compose.cc, onChange: (e) => setCompose((p) => ({ ...p, cc: e.target.value })) }), _jsx("label", { className: rlcClass(null, lbl), children: "Betreff" }), _jsx("input", { className: rlcClass(null, { ...inp, gridColumn: "2 / -1" }), value: compose.subject, onChange: (e) => setCompose((p) => ({ ...p, subject: e.target.value })) }), _jsx("label", { className: rlcClass(null, { ...lbl, gridColumn: "1 / -1" }), children: "Nachricht" }), _jsx("textarea", { className: rlcClass(null, {
                                                    ...inp,
                                                    gridColumn: "1 / -1",
                                                    minHeight: 120,
                                                    resize: "vertical"
                                                }), value: compose.body, onChange: (e) => setCompose((p) => ({ ...p, body: e.target.value })), placeholder: "Schreibe eine Nachricht\u2026 (Anh\u00E4nge: Datei auf diesen Bereich ziehen)" }), _jsx("div", { className: "rlc-migrated-pages-buro-kommunikation-tsx-509", children: _jsx("button", { className: "btn", onClick: send, disabled: !compose.body.trim(), children: "Senden" }) })] })] }) })] })] }));
}
function AttachmentPreview({ a }) {
    const isImg = (a.mime || "").startsWith("image/");
    const isPDF = (a.mime || "").includes("pdf");
    const open = () => {
        const w = window.open(a.dataURL, "_blank");
        if (!w)
            window.alert("Popup blockiert.");
    };
    return (_jsxs("div", { className: "rlc-migrated-pages-buro-kommunikation-tsx-510", children: [_jsxs("div", { className: "rlc-migrated-pages-buro-kommunikation-tsx-511", children: [_jsx("span", { title: a.name, className: "rlc-migrated-pages-buro-kommunikation-tsx-512", children: a.name }), _jsx("div", { className: "rlc-migrated-pages-buro-kommunikation-tsx-513" }), _jsx("button", { className: "btn", onClick: open, children: "\u00D6ffnen" })] }), isImg ?
                _jsx("img", { src: a.dataURL, alt: a.name, className: "rlc-migrated-pages-buro-kommunikation-tsx-514" }) :
                null, isPDF ?
                _jsx("iframe", { title: a.name, src: a.dataURL, className: "rlc-migrated-pages-buro-kommunikation-tsx-515" }) :
                null] }));
}
