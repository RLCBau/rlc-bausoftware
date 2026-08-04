import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
/* ================= STYLE ================= */
const shell = {
    maxWidth: 900,
    margin: "0 auto",
    padding: "12px 16px 40px",
    fontFamily: "Inter,system-ui,Arial",
    color: "#0f172a"
};
const qa = {
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: 12,
    margin: "10px 0",
    background: "#fff"
};
const q = { fontWeight: 600, marginBottom: 4 };
const a = { color: "#334155", lineHeight: 1.5 };
const supportBtn = {
    position: "fixed",
    right: 20,
    bottom: 20,
    background: "#0ea5e9",
    color: "#fff",
    border: "none",
    borderRadius: 999,
    padding: "12px 18px",
    fontWeight: 600,
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
};
/* ================= COMPONENT ================= */
export default function FAQ() {
    const openSupport = () => {
        alert("Support Chat wird geöffnet (Integration folgt)");
    };
    return (_jsxs("div", { className: rlcClass(null, shell), children: [_jsx("h2", { children: "FAQ" }), _jsxs("div", { className: rlcClass(null, qa), children: [_jsx("div", { className: rlcClass(null, q), children: "Wie funktionieren Mengen-Formeln?" }), _jsxs("div", { className: rlcClass(null, a), children: ["Es werden einfache mathematische Ausdr\u00FCcke unterst\u00FCtzt, z. B.:", _jsx("br", {}), _jsx("code", { children: "10*2+5" }), ", ", _jsx("code", { children: "(12+8)/2" })] })] }), _jsxs("div", { className: rlcClass(null, qa), children: [_jsx("div", { className: rlcClass(null, q), children: "Was passiert mit meinen Daten?" }), _jsx("div", { className: rlcClass(null, a), children: "Aktuell werden alle Daten lokal im Browser gespeichert (LocalStorage). Beim L\u00F6schen des Browser-Caches gehen die Daten verloren." })] }), _jsxs("div", { className: rlcClass(null, qa), children: [_jsx("div", { className: rlcClass(null, q), children: "Welche Exportm\u00F6glichkeiten gibt es?" }), _jsxs("div", { className: rlcClass(null, a), children: ["Aktuell verf\u00FCgbar: CSV, SVG, JSON.", _jsx("br", {}), "Geplant: GAEB, DXF, DWG, PDF (erweitert)."] })] }), _jsxs("div", { className: rlcClass(null, qa), children: [_jsx("div", { className: rlcClass(null, q), children: "Unterst\u00FCtzt das System mehrere Benutzer?" }), _jsxs("div", { className: rlcClass(null, a), children: ["Aktuell: Single-User (lokal).", _jsx("br", {}), "Geplant: Multi-User mit Rollenverwaltung (Cloud-Version)."] })] }), _jsxs("div", { className: rlcClass(null, qa), children: [_jsx("div", { className: rlcClass(null, q), children: "Funktioniert die Software auch mobil?" }), _jsx("div", { className: rlcClass(null, a), children: "Ja. Die Mobile-App (iOS & Android) unterst\u00FCtzt Regieberichte, Lieferscheine, Fotos und Offline-Synchronisation." })] }), _jsxs("div", { className: rlcClass(null, qa), children: [_jsx("div", { className: rlcClass(null, q), children: "Ist meine Verbindung sicher?" }), _jsx("div", { className: rlcClass(null, a), children: "Ja. Die Cloud-Version nutzt HTTPS (SSL/TLS), Reverse Proxy (Nginx) sowie serverseitige Sicherheitsmechanismen." })] }), _jsx("button", { className: rlcClass(null, supportBtn), onClick: openSupport, children: "Support Chat" })] }));
}
