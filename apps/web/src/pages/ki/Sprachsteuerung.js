import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/ki/Sprachsteuerung.tsx
import React from "react";
import { useProject } from "../../store/useProject";
const shell = {
    display: "grid",
    gap: 16
};
const card = {
    border: "1px solid var(--line)",
    borderRadius: 10,
    padding: 16,
    background: "#fff",
    display: "grid",
    gap: 12
};
const input = {
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 14
};
export default function Sprachsteuerung() {
    const projectCtx = useProject();
    const currentProject = projectCtx?.currentProject ?? null;
    const storeProjectId = currentProject?.id ?? "";
    const projectCode = currentProject?.code ?? "";
    const [lang, setLang] = React.useState("de-DE");
    const [listening, setListening] = React.useState(false);
    const [interim, setInterim] = React.useState("");
    const [finalText, setFinalText] = React.useState("");
    const [projectInput, setProjectInput] = React.useState("");
    const [date, setDate] = React.useState(() => new Date().toISOString().slice(0, 10));
    const [error, setError] = React.useState(null);
    const recogRef = React.useRef(null);
    const restartTimerRef = React.useRef(null);
    const effectiveProjectId = React.useMemo(() => projectInput.trim() || storeProjectId || projectCode || "", [projectInput, storeProjectId, projectCode]);
    const resetRecognition = React.useCallback(() => {
        if (recogRef.current) {
            try {
                recogRef.current.stop();
            }
            catch { }
        }
        recogRef.current = null;
    }, []);
    const ensureRecognition = React.useCallback(() => {
        if (recogRef.current)
            return recogRef.current;
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            window.alert("Spracherkennung wird von diesem Browser nicht unterstützt. Bitte Chrome oder Edge verwenden.");
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
            setError(null);
        };
        rec.onend = () => {
            setListening(false);
        };
        rec.onerror = (e) => {
            console.warn("[Speech] error", e?.error || e);
            setError(e?.error || "Spracherkennung fehlgeschlagen");
        };
        rec.onresult = (evt) => {
            let interimChunk = "";
            let finalChunk = "";
            for (let i = evt.resultIndex; i < evt.results.length; i++) {
                const res = evt.results[i];
                const txt = res?.[0]?.transcript || "";
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
        resetRecognition();
        if (restartTimerRef.current) {
            window.clearTimeout(restartTimerRef.current);
        }
        restartTimerRef.current = window.setTimeout(() => {
            start();
        }, 120);
        return () => {
            if (restartTimerRef.current) {
                window.clearTimeout(restartTimerRef.current);
                restartTimerRef.current = null;
            }
        };
    }, [lang, listening, resetRecognition, start]);
    React.useEffect(() => {
        return () => {
            if (restartTimerRef.current) {
                window.clearTimeout(restartTimerRef.current);
            }
            resetRecognition();
        };
    }, [resetRecognition]);
    const composedText = finalText + (interim ? (finalText ? " " : "") + interim : "");
    async function saveAndOpenRegie() {
        try {
            if (!effectiveProjectId) {
                window.alert("Bitte Projekt-ID eingeben.");
                return;
            }
            if (!finalText.trim()) {
                window.alert("Kein Text erkannt.");
                return;
            }
            setError(null);
            const res = await fetch("/api/ki/parse-speech/save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text: finalText.trim(),
                    projectId: effectiveProjectId,
                    projectCode: projectCode || "",
                    date
                })
            });
            if (!res.ok)
                throw new Error(await res.text());
            const data = (await res.json());
            sessionStorage.setItem("regie:openProjectId", effectiveProjectId);
            if (data?.saved?.id) {
                sessionStorage.setItem("regie:focusId", String(data.saved.id));
            }
            window.location.href = `/mengenermittlung/regieberichte?projectId=${encodeURIComponent(effectiveProjectId)}`;
        }
        catch (e) {
            console.error(e);
            const msg = e instanceof Error ? e.message : "Speichern/Öffnen fehlgeschlagen";
            setError(msg);
            window.alert(msg);
        }
    }
    function openRegie() {
        if (!effectiveProjectId) {
            window.alert("Bitte Projekt-ID eingeben.");
            return;
        }
        sessionStorage.setItem("regie:openProjectId", effectiveProjectId);
        window.location.href = `/mengenermittlung/regieberichte?projectId=${encodeURIComponent(effectiveProjectId)}`;
    }
    async function parseWithKI() {
        try {
            if (!effectiveProjectId) {
                window.alert("Bitte Projekt-ID eingeben.");
                return;
            }
            if (!finalText.trim()) {
                window.alert("Kein Text erkannt.");
                return;
            }
            setError(null);
            const res = await fetch("/api/ki/parse-speech", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text: finalText.trim(),
                    projectId: effectiveProjectId,
                    projectCode: projectCode || "",
                    date
                })
            });
            if (!res.ok)
                throw new Error(await res.text());
            const data = (await res.json());
            const doSave = window.confirm("Gefundene Daten:\n\n" +
                JSON.stringify(data.item, null, 2) +
                "\n\nSoll der Eintrag gespeichert werden?");
            if (!doSave)
                return;
            const save = await fetch("/api/regie", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...(typeof data.item === "object" && data.item ? data.item : {}),
                    projectId: effectiveProjectId,
                    projectCode: projectCode || "",
                    date
                })
            });
            if (!save.ok)
                throw new Error(await save.text());
            window.alert("Regiebericht angelegt!");
        }
        catch (e) {
            console.error(e);
            const msg = e instanceof Error ? e.message : "KI-Parsing fehlgeschlagen";
            setError(msg);
            window.alert(msg);
        }
    }
    return (_jsxs("div", { className: rlcClass(null, shell), children: [_jsx("h1", { children: "Sprachsteuerung (Regieberichte diktieren)" }), _jsxs("div", { className: rlcClass(null, card), children: [_jsxs("div", { className: "rlc-migrated-pages-ki-sprachsteuerung-tsx-1042", children: [_jsx("label", { className: "rlc-migrated-pages-ki-sprachsteuerung-tsx-1043", children: "Sprache" }), _jsxs("select", { value: lang, onChange: (e) => setLang(e.target.value), className: rlcClass(null, { ...input, width: 180 }), children: [_jsx("option", { value: "de-DE", children: "Deutsch (de-DE)" }), _jsx("option", { value: "it-IT", children: "Italiano (it-IT)" }), _jsx("option", { value: "en-US", children: "English (en-US)" })] }), _jsx("label", { className: "rlc-migrated-pages-ki-sprachsteuerung-tsx-1044", children: "Projekt-ID" }), _jsx("input", { value: projectInput, onChange: (e) => setProjectInput(e.target.value), placeholder: "z. B. BA-2025-834", className: rlcClass(null, { ...input, flex: 1, minWidth: 160 }) }), _jsx("label", { className: "rlc-migrated-pages-ki-sprachsteuerung-tsx-1045", children: "Datum" }), _jsx("input", { type: "date", value: date, onChange: (e) => setDate(e.target.value), className: rlcClass(null, { ...input, width: 150 }) }), !listening ?
                                _jsx("button", { className: "btn", onClick: start, title: "Start", children: "\uD83C\uDF99\uFE0F Start" }) :
                                _jsx("button", { className: "btn", onClick: stop, title: "Stop", children: "\u23F9\uFE0F Stop" })] }), _jsxs("div", { className: "rlc-migrated-pages-ki-sprachsteuerung-tsx-1046", children: ["Aktiv: ", effectiveProjectId || "kein Projekt gewählt"] }), _jsxs("div", { className: "rlc-migrated-pages-ki-sprachsteuerung-tsx-1047", children: [_jsx("textarea", { value: composedText, onChange: (e) => {
                                    setFinalText(e.target.value);
                                    setInterim("");
                                }, placeholder: "gesprochenes Kommando\u2026", className: "rlc-migrated-pages-ki-sprachsteuerung-tsx-1048" }), listening &&
                                _jsx("div", { className: "rlc-migrated-pages-ki-sprachsteuerung-tsx-1049", children: "\u25CF recording" })] }), error && _jsx("div", { className: "rlc-migrated-pages-ki-sprachsteuerung-tsx-1050", children: error }), _jsxs("div", { className: "rlc-migrated-pages-ki-sprachsteuerung-tsx-1051", children: [_jsx("button", { className: "btn", onClick: parseWithKI, disabled: !finalText.trim(), children: "KI-Parsing" }), _jsx("button", { className: "btn", onClick: saveAndOpenRegie, disabled: !effectiveProjectId || !finalText.trim(), children: "\u279C Als Regiebericht speichern & \u00F6ffnen" }), _jsx("button", { className: "btn", onClick: openRegie, disabled: !effectiveProjectId, children: "Regieberichte \u00F6ffnen" }), _jsx("button", { className: "btn", onClick: () => {
                                    setFinalText("");
                                    setInterim("");
                                    setError(null);
                                }, children: "Leeren" })] })] })] }));
}
