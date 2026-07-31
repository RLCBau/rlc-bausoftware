import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
const card = {
    border: "1px solid var(--line)",
    borderRadius: 10,
    padding: 16,
    background: "#fff",
    display: "grid",
    gap: 12,
};
export default function Sprachsteuerung() {
    const [lang, setLang] = React.useState("de-DE");
    const [listening, setListening] = React.useState(false);
    const [interim, setInterim] = React.useState("");
    const [finalText, setFinalText] = React.useState("");
    const [projectId, setProjectId] = React.useState("");
    const [date, setDate] = React.useState(() => new Date().toISOString().slice(0, 10));
    const recogRef = React.useRef(null);
    // --- init SpeechRecognition
    const ensureRecognition = React.useCallback(() => {
        if (recogRef.current)
            return recogRef.current;
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            alert("Spracherkennung wird von diesem Browser nicht unterstützt. Bitte Chrome/Edge verwenden.");
            return null;
        }
        const rec = new SR();
        rec.lang = lang;
        rec.continuous = true;
        rec.interimResults = true;
        rec.maxAlternatives = 1;
        rec.onstart = () => {
            setListening(true);
            setInterim("");
        };
        rec.onend = () => setListening(false);
        rec.onerror = (e) => console.warn("[Speech] error", e?.error || e);
        rec.onresult = (evt) => {
            let interimChunk = "", finalChunk = "";
            for (let i = evt.resultIndex; i < evt.results.length; i++) {
                const res = evt.results[i];
                const txt = res[0].transcript;
                if (res.isFinal)
                    finalChunk += txt;
                else
                    interimChunk += txt;
            }
            if (interimChunk)
                setInterim(interimChunk.trim());
            if (finalChunk) {
                setFinalText((old) => (old + (old ? " " : "") + finalChunk.trim()).trim());
                setInterim("");
            }
        };
        recogRef.current = rec;
        return rec;
    }, [lang]);
    const start = React.useCallback(() => {
        const rec = ensureRecognition();
        if (!rec)
            return;
        try {
            rec.start();
        }
        catch (e) {
            console.debug(e);
        }
    }, [ensureRecognition]);
    const stop = React.useCallback(() => {
        const rec = ensureRecognition();
        if (!rec)
            return;
        try {
            rec.stop();
        }
        catch (e) {
            console.debug(e);
        }
    }, [ensureRecognition]);
    React.useEffect(() => {
        if (!listening)
            return;
        stop();
        setTimeout(start, 120);
    }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps
    const composedText = finalText + (interim ? (finalText ? " " : "") + interim : "");
    // === salva e apri Regieberichte ===
    async function saveAndOpenRegie() {
        try {
            if (!projectId)
                return alert("Bitte Projekt-ID eingeben.");
            if (!finalText.trim())
                return alert("Kein Text erkannt.");
            const res = await fetch("/api/ki/parse-speech/save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: finalText, projectId, date }),
            });
            if (!res.ok)
                throw new Error(await res.text());
            const data = await res.json();
            sessionStorage.setItem("regie:openProjectId", projectId);
            if (data?.saved?.id)
                sessionStorage.setItem("regie:focusId", String(data.saved.id));
            window.location.href = `/mengenermittlung/regieberichte?projectId=${encodeURIComponent(projectId)}`;
        }
        catch (e) {
            console.error(e);
            alert(e?.message || "Speichern/Öffnen fehlgeschlagen");
        }
    }
    // === apri solo Regieberichte ===
    function openRegie() {
        if (!projectId)
            return alert("Bitte Projekt-ID eingeben.");
        sessionStorage.setItem("regie:openProjectId", projectId);
        window.location.href = `/mengenermittlung/regieberichte?projectId=${encodeURIComponent(projectId)}`;
    }
    // === Parsing KI standard ===
    async function parseWithKI() {
        try {
            if (!projectId)
                return alert("Bitte Projekt-ID eingeben.");
            const res = await fetch("/api/ki/parse-speech", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: finalText, projectId, date }),
            });
            if (!res.ok)
                throw new Error(await res.text());
            const data = await res.json();
            const doSave = confirm("Gefundene Daten:\n\n" +
                JSON.stringify(data.item, null, 2) +
                "\n\nSoll der Eintrag gespeichert werden?");
            if (!doSave)
                return;
            const save = await fetch("/api/regie", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...data.item, date: new Date(data.item.date) }),
            });
            if (!save.ok)
                throw new Error(await save.text());
            alert("Regiebericht angelegt!");
        }
        catch (e) {
            console.error(e);
            alert(e?.message || "KI-Parsing fehlgeschlagen");
        }
    }
    return (_jsxs("div", { style: { display: "grid", gap: 16 }, children: [_jsx("h1", { children: "Sprachsteuerung (Regieberichte diktieren)" }), _jsxs("div", { style: card, children: [_jsxs("div", { style: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }, children: [_jsx("label", { style: { fontSize: 13, color: "var(--muted)" }, children: "Sprache" }), _jsxs("select", { value: lang, onChange: (e) => setLang(e.target.value), style: { padding: "6px 8px" }, children: [_jsx("option", { value: "de-DE", children: "Deutsch (de-DE)" }), _jsx("option", { value: "it-IT", children: "Italiano (it-IT)" }), _jsx("option", { value: "en-US", children: "English (en-US)" })] }), _jsx("label", { style: { marginLeft: 16, fontSize: 13, color: "var(--muted)" }, children: "Projekt-ID" }), _jsx("input", { value: projectId, onChange: (e) => setProjectId(e.target.value), placeholder: "z. B. BA-2025-834", style: { padding: "6px 8px", flex: 1, minWidth: 160 } }), _jsx("label", { style: { marginLeft: 16, fontSize: 13, color: "var(--muted)" }, children: "Datum" }), _jsx("input", { type: "date", value: date, onChange: (e) => setDate(e.target.value), style: { padding: "6px 8px" } }), !listening ? (_jsx("button", { className: "btn", onClick: start, title: "Start", children: "\uD83C\uDF99\uFE0F Start" })) : (_jsx("button", { className: "btn", onClick: stop, title: "Stop", children: "\u23F9\uFE0F Stop" }))] }), _jsxs("div", { style: { position: "relative" }, children: [_jsx("textarea", { value: composedText, onChange: (e) => setFinalText(e.target.value), placeholder: "gesprochenes Kommando\u2026", style: {
                                    width: "100%",
                                    minHeight: 160,
                                    padding: 12,
                                    border: "1px solid var(--line)",
                                    borderRadius: 8,
                                    fontSize: 14,
                                } }), listening && (_jsx("div", { style: { position: "absolute", right: 12, top: 12, fontSize: 12, color: "#16a34a" }, children: "\u25CF recording" }))] }), _jsxs("div", { style: { display: "flex", flexWrap: "wrap", gap: 8 }, children: [_jsx("button", { className: "btn", onClick: parseWithKI, disabled: !finalText.trim(), children: "KI-Parsing" }), _jsx("button", { className: "btn", onClick: saveAndOpenRegie, disabled: !projectId || !finalText.trim(), children: "\u279C Als Regiebericht speichern & \u00F6ffnen" }), _jsx("button", { className: "btn", onClick: openRegie, disabled: !projectId, children: "Regieberichte \u00F6ffnen" }), _jsx("button", { className: "btn", onClick: () => { setFinalText(""); setInterim(""); }, children: "Leeren" })] })] })] }));
}
