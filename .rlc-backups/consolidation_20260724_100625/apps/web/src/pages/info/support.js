import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useState } from "react";
const shell = { maxWidth: 700, margin: "0 auto", padding: "12px 16px 40px", fontFamily: "Inter,system-ui,Arial" };
const input = { width: "100%", border: "1px solid #cbd5e1", borderRadius: 6, padding: "8px" };
const btn = { padding: "8px 12px", border: "1px solid #cbd5e1", background: "#fff", borderRadius: 6, marginTop: 8, cursor: "pointer" };
export default function Support() {
    const [name, setName] = useState(localStorage.getItem("rlc.info.support.name") || "");
    const [email, setEmail] = useState(localStorage.getItem("rlc.info.support.email") || "");
    const [text, setText] = useState("");
    const [ok, setOk] = useState("");
    const send = () => {
        const ticket = { id: Math.random().toString(36).slice(2, 10), name, email, text, ts: new Date().toISOString() };
        const arr = JSON.parse(localStorage.getItem("rlc.info.support.tickets") || "[]");
        arr.push(ticket);
        localStorage.setItem("rlc.info.support.tickets", JSON.stringify(arr));
        localStorage.setItem("rlc.info.support.name", name);
        localStorage.setItem("rlc.info.support.email", email);
        setOk("Feedback gespeichert (lokal).");
        setText("");
    };
    return (_jsxs("div", { style: shell, children: [_jsx("h2", { children: "Support / Feedback" }), _jsx("div", { style: { margin: "8px 0" }, children: "Wir antworten per E-Mail (Demo lokal)." }), _jsx("input", { style: input, placeholder: "Name", value: name, onChange: e => setName(e.target.value) }), _jsx("div", { style: { height: 8 } }), _jsx("input", { style: input, placeholder: "E-Mail", value: email, onChange: e => setEmail(e.target.value) }), _jsx("div", { style: { height: 8 } }), _jsx("textarea", { style: { ...input, height: 160 }, placeholder: "Beschreibe dein Anliegen\u2026", value: text, onChange: e => setText(e.target.value) }), _jsx("button", { style: btn, onClick: send, children: "Senden" }), _jsx("div", { style: { marginTop: 8, color: "#16a34a" }, children: ok })] }));
}
