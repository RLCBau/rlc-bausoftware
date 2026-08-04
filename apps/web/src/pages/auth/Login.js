import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/auth/Login.tsx
import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiUrl } from "../../lib/apiBase";
const AUTH_KEYS = [
    "rlc_token",
    "token",
    "authToken",
    "accessToken",
    "rlc.auth.token",
    "rlc_mobile_token"
];
function setAuth(token, user, company) {
    try {
        for (const key of AUTH_KEYS)
            localStorage.removeItem(key);
        localStorage.setItem("rlc_token", token);
        if (user?.companyId) {
            localStorage.setItem("rlc_company_id", user.companyId);
        }
        if (company) {
            localStorage.setItem("rlc_company", JSON.stringify(company));
        }
        localStorage.setItem("rlc_auth", JSON.stringify({
            token,
            user: user ?? null,
            company: company ?? null
        }));
    }
    catch {
        // ignore
    }
}
function getRedirectTarget(state) {
    const from = state?.from;
    if (typeof from === "string" && from.startsWith("/"))
        return from;
    return "/start";
}
function mapErrorMessage(code) {
    switch (String(code || "").trim()) {
        case "BAD_CREDENTIALS":
            return "E-Mail oder Passwort ist falsch.";
        case "EMAIL_NOT_VERIFIED":
            return "E-Mail noch nicht bestätigt.";
        case "EMAIL_ALREADY_VERIFIED":
            return "Diese E-Mail ist bereits bestätigt.";
        case "EMAIL_SEND_FAILED":
            return "E-Mail konnte nicht gesendet werden.";
        case "INVITE_INVALID":
            return "Der Einladungscode ist ungültig.";
        case "INVITE_INACTIVE":
            return "Der Einladungscode ist nicht mehr aktiv.";
        case "INVITE_EXPIRED":
            return "Der Einladungscode ist abgelaufen.";
        case "INVITE_ALREADY_USED":
            return "Der Einladungscode wurde bereits verwendet.";
        case "INVITE_EMAIL_MISMATCH":
            return "Der Einladungscode gehört zu einer anderen E-Mail-Adresse.";
        case "WEB_SEAT_LIMIT_REACHED":
            return "Keine freien Web-Lizenzen mehr verfügbar.";
        case "TOKEN_INVALID":
            return "Der Code ist ungültig oder abgelaufen.";
        case "company missing":
            return "Firma konnte nicht geladen werden.";
        default:
            return code || "Vorgang fehlgeschlagen.";
    }
}
const shell = {
    minHeight: "100vh",
    display: "grid",
    gridTemplateColumns: "1.08fr 0.92fr",
    background: "radial-gradient(circle at 14% 8%, rgba(23,105,224,0.14), transparent 28%), linear-gradient(180deg,#eef4ff 0%, #f8fafc 100%)"
};
const left = {
    padding: "52px 58px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center"
};
const right = {
    padding: "40px 48px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
};
const title = {
    margin: 0,
    fontSize: 42,
    lineHeight: 1.05,
    fontWeight: 750,
    letterSpacing: -1.1,
    color: "#0f1f3d"
};
const subtitle = {
    marginTop: 18,
    fontSize: 16,
    lineHeight: 1.6,
    color: "#475569",
    maxWidth: 760
};
const grid = {
    display: "grid",
    gridTemplateColumns: "repeat(2,minmax(220px,1fr))",
    gap: 14,
    marginTop: 28,
    maxWidth: 900
};
const featureCard = {
    background: "rgba(255,255,255,0.72)",
    border: "1px solid #dbe4f0",
    borderRadius: 18,
    padding: "18px 20px",
    boxShadow: "0 8px 24px rgba(15,23,42,0.05)"
};
const featureTitle = {
    fontSize: 15,
    fontWeight: 600,
    color: "#0f172a",
    marginBottom: 6
};
const featureText = {
    fontSize: 13,
    lineHeight: 1.55,
    color: "#475569"
};
const loginCard = {
    width: "100%",
    maxWidth: 480,
    background: "#ffffff",
    border: "1px solid #dbe4f0",
    borderRadius: 20,
    padding: 28,
    boxShadow: "0 18px 50px rgba(15,31,61,0.10)"
};
const hLogin = {
    margin: 0,
    fontSize: 26,
    lineHeight: 1.2,
    fontWeight: 600,
    color: "#0f172a"
};
const loginSub = {
    marginTop: 8,
    color: "#64748b",
    fontSize: 14
};
const label = {
    display: "block",
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 6,
    color: "#0f172a"
};
const input = {
    width: "100%",
    border: "1px solid #cbd5e1",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 14,
    outline: "none",
    background: "#fff",
    color: "#0f172a",
    boxSizing: "border-box"
};
const primaryBtn = {
    width: "100%",
    border: 0,
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    background: "#1769e0",
    color: "#fff"
};
const secondaryBtn = {
    width: "100%",
    border: "1px solid #cbd5e1",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 14,
    cursor: "pointer",
    background: "#fff",
    color: "#0f172a"
};
const tabBtn = (active) => ({
    flex: 1,
    border: active ? "1px solid #146ef5" : "1px solid #cbd5e1",
    background: active ? "#eaf2ff" : "#fff",
    color: active ? "#0b5bd3" : "#0f172a",
    borderRadius: 12,
    padding: "11px 12px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer"
});
const foot = {
    marginTop: 16,
    fontSize: 12,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 1.5
};
export default function Login() {
    const nav = useNavigate();
    const location = useLocation();
    const [mode, setMode] = React.useState("login");
    const [email, setEmail] = React.useState("");
    const [password, setPassword] = React.useState("");
    const [name, setName] = React.useState("");
    const [inviteCode, setInviteCode] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState(null);
    const [info, setInfo] = React.useState(null);
    const [canResend, setCanResend] = React.useState(false);
    const redirectTo = React.useMemo(() => getRedirectTarget(location.state), [location.state]);
    async function handleLogin(e) {
        e?.preventDefault();
        if (busy)
            return;
        const cleanEmail = email.trim().toLowerCase();
        const cleanPassword = password;
        if (!cleanEmail || !cleanPassword) {
            setError("Bitte E-Mail und Passwort eingeben.");
            return;
        }
        setBusy(true);
        setError(null);
        setInfo(null);
        setCanResend(false);
        try {
            const res = await fetch(apiUrl("/api/auth/login"), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json"
                },
                body: JSON.stringify({
                    email: cleanEmail,
                    password: cleanPassword,
                    mode: "SERVER_SYNC"
                })
            });
            const data = (await res.json().catch(() => null));
            if (!res.ok || !data?.ok || !data?.token) {
                setCanResend(Boolean(data?.canResend));
                throw new Error(mapErrorMessage(data?.error));
            }
            setAuth(data.token, data.user, data.company ?? null);
            nav(redirectTo, { replace: true });
        }
        catch (err) {
            setError(err?.message || "Login fehlgeschlagen.");
        }
        finally {
            setBusy(false);
        }
    }
    async function handleRegister(e) {
        e?.preventDefault();
        if (busy)
            return;
        const cleanEmail = email.trim().toLowerCase();
        const cleanPassword = password;
        const cleanName = name.trim();
        const cleanInviteCode = inviteCode.trim();
        if (!cleanEmail || !cleanPassword) {
            setError("Bitte E-Mail und Passwort eingeben.");
            return;
        }
        if (!cleanName) {
            setError("Bitte Namen eingeben.");
            return;
        }
        setBusy(true);
        setError(null);
        setInfo(null);
        setCanResend(false);
        try {
            const res = await fetch(apiUrl("/api/auth/register"), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json"
                },
                body: JSON.stringify({
                    email: cleanEmail,
                    password: cleanPassword,
                    name: cleanName,
                    inviteCode: cleanInviteCode || undefined,
                    mode: "SERVER_SYNC"
                })
            });
            const data = (await res.json().catch(() => null));
            if (!res.ok || !data?.ok || !data?.token) {
                setCanResend(Boolean(data?.canResend));
                throw new Error(mapErrorMessage(data?.error));
            }
            setAuth(data.token, data.user, data.company ?? null);
            if (data.user?.emailVerifiedAt) {
                nav(redirectTo, { replace: true });
                return;
            }
            setInfo(data.verificationSent ?
                "Registrierung erfolgreich. Bitte bestätigen Sie jetzt Ihre E-Mail." :
                "Registrierung erfolgreich. Bitte bestätigen Sie Ihre E-Mail.");
            setMode("login");
        }
        catch (err) {
            setError(err?.message || "Registrierung fehlgeschlagen.");
        }
        finally {
            setBusy(false);
        }
    }
    async function handleResend() {
        const cleanEmail = email.trim().toLowerCase();
        if (!cleanEmail || busy)
            return;
        setBusy(true);
        setError(null);
        setInfo(null);
        try {
            const res = await fetch(apiUrl("/api/auth/resend"), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json"
                },
                body: JSON.stringify({ email: cleanEmail })
            });
            const data = (await res.json().catch(() => null));
            if (!res.ok || data?.ok === false) {
                throw new Error(mapErrorMessage(data?.error || "Resend fehlgeschlagen"));
            }
            setInfo("Bestätigungs-E-Mail wurde erneut gesendet.");
        }
        catch (err) {
            setError(err?.message || "Resend fehlgeschlagen.");
        }
        finally {
            setBusy(false);
        }
    }
    return (_jsxs("div", { className: rlcClass(null, shell), children: [_jsxs("div", { className: rlcClass(null, left), children: [_jsx("div", { style: { display: "inline-flex", width: "fit-content", padding: "7px 11px", borderRadius: 999, background: "#eaf2ff", border: "1px solid #cfddf2", color: "#0b5bd3", fontSize: 12, fontWeight: 800, marginBottom: 16 }, children: "RLC BAUSOFTWARE \u00B7 WEB \u00B7 MOBILE \u00B7 CLOUD" }), _jsx("h1", { className: rlcClass(null, title), children: "Bauprojekte vollst\u00E4ndig digital steuern." }), _jsxs("div", { className: rlcClass(null, subtitle), children: ["RLC verbindet ", _jsx("b", { children: "Kalkulation" }), ", ", _jsx("b", { children: "LV" }), ", ", _jsx("b", { children: "CAD" }), ",", _jsx("b", { children: " Aufma\u00DF" }), ", ", _jsx("b", { children: "Baustelle" }), ", ", _jsx("b", { children: "Verwaltung" }), " und", _jsx("b", { children: " Buchhaltung" }), ". Alle Daten bleiben in derselben Projektstruktur und stehen \u2013 abh\u00E4ngig von Lizenz und Rolle \u2013 im Web und mobil bereit."] }), _jsxs("div", { className: rlcClass(null, grid), children: [_jsxs("div", { className: rlcClass(null, featureCard), children: [_jsx("div", { className: rlcClass(null, featureTitle), children: "Kalkulation, LV & KI" }), _jsx("div", { className: rlcClass(null, featureText), children: "GAEB-Leistungsverzeichnisse, Angebote, Nachtr\u00E4ge, Kostenans\u00E4tze und KI-gest\u00FCtzte Kalkulation zentral im Projekt bearbeiten." })] }), _jsxs("div", { className: rlcClass(null, featureCard), children: [_jsx("div", { className: rlcClass(null, featureTitle), children: "CAD, DWG/DXF & Georeferenzierung" }), _jsx("div", { className: rlcClass(null, featureText), children: "DXF-/DWG-Pl\u00E4ne, Layer, Objektfang, UTM-Punkte, Kartenhintergr\u00FCnde, Georeferenzierung sowie L\u00E4ngen- und Fl\u00E4chenermittlung nutzen." })] }), _jsxs("div", { className: rlcClass(null, featureCard), children: [_jsx("div", { className: rlcClass(null, featureTitle), children: "Aufma\u00DF, Mengen & Abrechnung" }), _jsx("div", { className: rlcClass(null, featureText), children: "Mengen aus CAD und Baustelle positionsbezogen \u00FCbernehmen, Aufma\u00DF strukturieren und f\u00FCr Angebote, Nachtr\u00E4ge und Rechnungen nutzen." })] }), _jsxs("div", { className: rlcClass(null, featureCard), children: [_jsx("div", { className: rlcClass(null, featureTitle), children: "Mobile Baustelle & B\u00FCro" }), _jsx("div", { className: rlcClass(null, featureText), children: "Regieberichte, Lieferscheine, Fotos und Arbeitszeiten offline erfassen, synchronisieren, im B\u00FCro pr\u00FCfen, freigeben und abrechnen." })] })] })] }), _jsx("div", { className: rlcClass(null, right), children: _jsxs("form", { className: rlcClass(null, loginCard), onSubmit: mode === "login" ? handleLogin : handleRegister, children: [_jsxs("div", { style: { marginBottom: 20 }, children: [_jsx("div", { style: { fontSize: 24, fontWeight: 800, color: "#0f1f3d", letterSpacing: -0.5 }, children: "RLC Bausoftware" }), _jsx("div", { style: { marginTop: 5, fontSize: 13, color: "#64748b" }, children: "Ihr Zugang zu Projekten, CAD, Kalkulation und Baustelle" })] }), _jsxs("div", { className: "rlc-migrated-pages-auth-login-tsx-58", children: [_jsx("button", { type: "button", className: rlcClass(null, tabBtn(mode === "login")), onClick: () => {
                                        setMode("login");
                                        setError(null);
                                        setInfo(null);
                                    }, children: "Anmelden" }), _jsx("button", { type: "button", className: rlcClass(null, tabBtn(mode === "register")), onClick: () => {
                                        setMode("register");
                                        setError(null);
                                        setInfo(null);
                                    }, children: "Registrieren" })] }), _jsx("h2", { className: rlcClass(null, hLogin), children: mode === "login" ? "Anmelden" : "Registrierung" }), _jsx("div", { className: rlcClass(null, loginSub), children: mode === "login" ?
                                "Bitte mit Ihrem Server-Zugang einloggen." :
                                "Neuen Zugang erstellen und optional Einladungscode eingeben." }), mode === "register" ?
                            _jsxs("div", { className: "rlc-migrated-pages-auth-login-tsx-59", children: [_jsx("label", { className: rlcClass(null, label), children: "Name" }), _jsx("input", { className: rlcClass(null, input), type: "text", autoComplete: "name", value: name, onChange: (e) => setName(e.target.value), placeholder: "Vor- und Nachname" })] }) :
                            null, _jsxs("div", { className: "rlc-migrated-pages-auth-login-tsx-60", children: [_jsx("label", { className: rlcClass(null, label), children: "E-Mail" }), _jsx("input", { className: rlcClass(null, input), type: "email", autoComplete: "username", value: email, onChange: (e) => setEmail(e.target.value), placeholder: "ihre@email.de" })] }), _jsxs("div", { className: "rlc-migrated-pages-auth-login-tsx-61", children: [_jsx("label", { className: rlcClass(null, label), children: "Passwort" }), _jsx("input", { className: rlcClass(null, input), type: "password", autoComplete: mode === "login" ? "current-password" : "new-password", value: password, onChange: (e) => setPassword(e.target.value), placeholder: "Passwort" })] }), mode === "register" ?
                            _jsxs("div", { className: "rlc-migrated-pages-auth-login-tsx-62", children: [_jsx("label", { className: rlcClass(null, label), children: "Einladungscode der Firma" }), _jsx("input", { className: rlcClass(null, input), type: "text", value: inviteCode, onChange: (e) => setInviteCode(e.target.value.toUpperCase()), placeholder: "z. B. RLC-7A3F-91BC" })] }) :
                            null, error ?
                            _jsx("div", { className: "rlc-migrated-pages-auth-login-tsx-63", children: error }) :
                            null, info ?
                            _jsx("div", { className: "rlc-migrated-pages-auth-login-tsx-64", children: info }) :
                            null, _jsxs("div", { className: "rlc-migrated-pages-auth-login-tsx-65", children: [_jsx("button", { type: "submit", className: rlcClass(null, primaryBtn), disabled: busy, children: busy ?
                                        mode === "login" ?
                                            "Anmeldung..." :
                                            "Registrierung..." :
                                        mode === "login" ?
                                            "Einloggen" :
                                            "Registrieren" }), mode === "login" && canResend ?
                                    _jsx("button", { type: "button", className: rlcClass(null, secondaryBtn), onClick: handleResend, disabled: busy, children: "Best\u00E4tigungs-E-Mail erneut senden" }) :
                                    null] }), _jsxs("div", { className: rlcClass(null, foot), children: ["RLC Bausoftware \u00B7 Cloud \u00B7 Web \u00B7 Mobile App", _jsx("br", {}), "Tiefbau \u00B7 Hochbau \u00B7 Planungsb\u00FCro \u00B7 Vermessung"] })] }) })] }));
}
