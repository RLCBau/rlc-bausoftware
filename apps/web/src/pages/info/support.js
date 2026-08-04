import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
import { API_BASE } from "../../lib/apiBase";
import { useMemo, useRef, useState } from "react";
function apiUrl(path) {
    const p = path.startsWith("/") ? path : `/${path}`;
    return API_BASE ? `${API_BASE}${p}` : p;
}
const shell = {
    maxWidth: 980,
    margin: "0 auto",
    padding: "12px 16px 40px",
    fontFamily: "Inter,system-ui,Arial",
    color: "#0f172a"
};
const headerCard = {
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    padding: 14,
    background: "#ffffff",
    marginBottom: 12
};
const chatWrap = {
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    background: "#ffffff",
    overflow: "hidden"
};
const messagesBox = {
    height: 460,
    overflowY: "auto",
    padding: 14,
    background: "#f8fafc"
};
const rowBase = {
    display: "flex",
    marginBottom: 10
};
const bubbleBase = {
    maxWidth: "78%",
    borderRadius: 12,
    padding: "10px 12px",
    fontSize: 14,
    lineHeight: 1.45,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)"
};
const composer = {
    borderTop: "1px solid #e2e8f0",
    padding: 12,
    background: "#fff"
};
const textareaStyle = {
    width: "100%",
    minHeight: 110,
    resize: "vertical",
    border: "1px solid #cbd5e1",
    borderRadius: 10,
    padding: 10,
    fontSize: 14,
    outline: "none",
    background: "#fff",
    boxSizing: "border-box"
};
const btnRow = {
    display: "flex",
    gap: 8,
    marginTop: 10,
    flexWrap: "wrap"
};
const primaryBtn = {
    padding: "10px 14px",
    border: "1px solid #0f172a",
    background: "#0f172a",
    color: "#fff",
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer"
};
const secondaryBtn = {
    padding: "10px 14px",
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#0f172a",
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer"
};
const smallInfo = {
    fontSize: 12,
    color: "#475569",
    marginTop: 8
};
function safeNowIso() {
    return new Date().toISOString();
}
function uid() {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
function readJson(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw)
            return fallback;
        return JSON.parse(raw);
    }
    catch {
        return fallback;
    }
}
function writeJson(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    }
    catch {
        // ignore localStorage errors
    }
}
function getAuthToken() {
    const candidates = [
        "rlc_token",
        "token",
        "authToken",
        "accessToken",
        "rlc.auth.token",
        "rlc_mobile_token"
    ];
    for (const key of candidates) {
        const v = localStorage.getItem(key);
        if (v && v.trim())
            return v.trim();
    }
    try {
        const authObj = readJson("rlc_auth", null);
        if (authObj?.token)
            return String(authObj.token);
        if (authObj?.accessToken)
            return String(authObj.accessToken);
    }
    catch {
        // ignore
    }
    return null;
}
function getProjectContext() {
    const projectKeys = [
        "rlc.currentProject",
        "rlc_current_project",
        "currentProject",
        "__RLC_CURRENT_PROJECT__"
    ];
    for (const key of projectKeys) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw)
                continue;
            const parsed = JSON.parse(raw);
            if (parsed)
                return parsed;
        }
        catch {
            // ignore
        }
    }
    return null;
}
function extractAnswer(data) {
    if (!data)
        return "Keine Antwort vom Server erhalten.";
    return (data.answer ||
        data.reply ||
        data.message ||
        data.error ||
        "Der Support hat geantwortet, aber ohne Textinhalt.");
}
export default function Support() {
    const storageKey = "rlc.info.support.chat.v1";
    const initialMessages = useMemo(() => {
        const saved = readJson(storageKey, []);
        if (saved.length > 0)
            return saved;
        return [
            {
                id: uid(),
                role: "assistant",
                text: "Willkommen beim RLC Support-Chat.\n\n" +
                    "Hier kannst du technische Probleme, Fragen zur Bedienung oder Fehler im Projekt melden.",
                ts: safeNowIso()
            }
        ];
    }, []);
    const [messages, setMessages] = useState(initialMessages);
    const [text, setText] = useState("");
    const [sending, setSending] = useState(false);
    const [status, setStatus] = useState("");
    const boxRef = useRef(null);
    function persist(next) {
        setMessages(next);
        writeJson(storageKey, next);
        setTimeout(() => {
            if (boxRef.current) {
                boxRef.current.scrollTop = boxRef.current.scrollHeight;
            }
        }, 30);
    }
    async function send() {
        const value = text.trim();
        if (!value || sending)
            return;
        const userMsg = {
            id: uid(),
            role: "user",
            text: value,
            ts: safeNowIso()
        };
        const nextAfterUser = [...messages, userMsg];
        persist(nextAfterUser);
        setText("");
        setSending(true);
        setStatus("Nachricht wird gesendet...");
        const token = getAuthToken();
        const project = getProjectContext();
        try {
            const res = await fetch(apiUrl("/api/support/chat"), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                    message: value,
                    messages: nextAfterUser.map((m) => ({
                        role: m.role,
                        content: m.text
                    })),
                    context: {
                        source: "web-info-support",
                        projectId: project?.id ?? null,
                        projectCode: project?.code ?? null,
                        projectName: project?.name ?? null,
                        path: window.location.pathname,
                        userAgent: navigator.userAgent
                    }
                })
            });
            let data = null;
            try {
                data = (await res.json());
            }
            catch {
                data = null;
            }
            if (!res.ok) {
                const errText = data?.error ||
                    data?.message ||
                    `Serverfehler (${res.status}) beim Support-Chat.`;
                const assistantMsg = {
                    id: uid(),
                    role: "assistant",
                    text: "Support-Chat derzeit nicht verfügbar.\n\n" +
                        errText +
                        "\n\n" + (!token ?
                        "Hinweis: Der Endpoint /api/support/chat ist serverseitig geschützt. Wenn du nicht eingeloggt bist, kommt oft 401/403." :
                        "Bitte Server-Logs prüfen oder Auth/Subscription prüfen."),
                    ts: safeNowIso()
                };
                persist([...nextAfterUser, assistantMsg]);
                setStatus("Fehler beim Senden.");
                return;
            }
            const assistantMsg = {
                id: uid(),
                role: "assistant",
                text: extractAnswer(data),
                ts: safeNowIso()
            };
            persist([...nextAfterUser, assistantMsg]);
            setStatus("Nachricht erfolgreich gesendet.");
        }
        catch (err) {
            const assistantMsg = {
                id: uid(),
                role: "assistant",
                text: "Verbindung zum Support-Server fehlgeschlagen.\n\n" +
                    `Fehler: ${err?.message || "Unbekannter Fehler"}\n\n` +
                    "Bitte prüfe API-URL, Login und Serverstatus.",
                ts: safeNowIso()
            };
            persist([...nextAfterUser, assistantMsg]);
            setStatus("Server nicht erreichbar.");
        }
        finally {
            setSending(false);
        }
    }
    function clearChat() {
        const next = [
            {
                id: uid(),
                role: "assistant",
                text: "Chatverlauf wurde gelöscht.",
                ts: safeNowIso()
            }
        ];
        persist(next);
        setStatus("Chatverlauf gelöscht.");
    }
    return (_jsxs("div", { className: rlcClass(null, shell), children: [_jsxs("div", { className: rlcClass(null, headerCard), children: [_jsx("h2", { className: "rlc-migrated-pages-info-support-tsx-817", children: "Support / Chat" }), _jsxs("div", { className: "rlc-migrated-pages-info-support-tsx-818", children: ["Intelligenter Support direkt im Web, \u00E4hnlich wie in der Mobile-App. Der Chat sendet an ", _jsx("code", { children: "/api/support/chat" }), "."] }), _jsxs("div", { className: rlcClass(null, smallInfo), children: ["API: ", _jsx("b", { children: API_BASE || "relative /api" })] })] }), _jsxs("div", { className: rlcClass(null, chatWrap), children: [_jsx("div", { ref: boxRef, className: rlcClass(null, messagesBox), children: messages.map((m) => {
                            const isUser = m.role === "user";
                            return (_jsx("div", { className: rlcClass(null, {
                                    ...rowBase,
                                    justifyContent: isUser ? "flex-end" : "flex-start"
                                }), children: _jsxs("div", { className: rlcClass(null, {
                                        ...bubbleBase,
                                        background: isUser ? "#0f172a" : "#ffffff",
                                        color: isUser ? "#ffffff" : "#0f172a",
                                        border: isUser ? "1px solid #0f172a" : "1px solid #e2e8f0"
                                    }), children: [_jsx("div", { className: "rlc-migrated-pages-info-support-tsx-819", children: isUser ? "Du" : "RLC Support" }), _jsx("div", { children: m.text })] }) }, m.id));
                        }) }), _jsxs("div", { className: rlcClass(null, composer), children: [_jsx("textarea", { className: rlcClass(null, textareaStyle), placeholder: "Beschreibe dein Problem oder deine Frage...", value: text, onChange: (e) => setText(e.target.value) }), _jsxs("div", { className: rlcClass(null, btnRow), children: [_jsx("button", { className: rlcClass(null, {
                                            ...primaryBtn,
                                            opacity: sending ? 0.7 : 1
                                        }), onClick: send, disabled: sending, type: "button", children: sending ? "Wird gesendet..." : "Nachricht senden" }), _jsx("button", { className: rlcClass(null, secondaryBtn), onClick: clearChat, disabled: sending, type: "button", children: "Chat leeren" })] }), _jsx("div", { className: rlcClass(null, smallInfo), children: status || "Bereit." })] })] })] }));
}
