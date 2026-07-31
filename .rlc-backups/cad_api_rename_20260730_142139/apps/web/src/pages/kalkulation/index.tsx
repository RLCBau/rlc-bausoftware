import React from "react";
import { Link, Outlet, useLocation } from "react-router-dom";

const shell: React.CSSProperties = { display: "grid", gridTemplateColumns: "240px 1fr", height: "calc(100vh - 0px)" };
const aside: React.CSSProperties = { borderRight: "1px solid #e2e8f0", padding: 10, fontFamily: "Inter, system-ui, Arial", fontSize: 13 };
const main: React.CSSProperties = { overflow: "auto" };
const item: React.CSSProperties = { display: "block", padding: "8px 10px", margin: "4px 6px", borderRadius: 6, color: "#0f172a", textDecoration: "none" };
const title: React.CSSProperties = { margin: "14px 6px 8px", color: "#334155", fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: .4 };

export default function KalkulationIndex() {
  const loc = useLocation();
  const is = (p: string) => (loc.pathname === p ? { background: "#f1f5f9", fontWeight: 600 } : {});
  return (
    <div style={shell}>
      <aside style={aside}>
        <div style={title}>Angebotsphase</div>
        <Link style={{ ...item, ...is("/kalkulation/projekt") }} to="/kalkulation/projekt">Projekt</Link>
        <Link style={{ ...item, ...is("/kalkulation/lvUpload") }} to="/kalkulation/lvUpload">LV hochladen/erstellen</Link>
        <Link style={{ ...item, ...is("/kalkulation/gaeb") }} to="/kalkulation/gaeb">GAEB Import/Export</Link>
        <Link style={{ ...item, ...is("/kalkulation/manuell") }} to="/kalkulation/manuell">Kalkulation (manuell)</Link>
        <Link style={{ ...item, ...is("/kalkulation/preise") }} to="/kalkulation/preise">Preislisten (Material/Arbeit/Maschine)</Link>
        <Link style={{ ...item, ...is("/kalkulation/aufschlag") }} to="/kalkulation/aufschlag">Aufschläge / Rabatte</Link>
        <Link style={{ ...item, ...is("/kalkulation/vergleich") }} to="/kalkulation/vergleich">Versionsvergleich</Link>
        <Link style={{ ...item, ...is("/kalkulation/angebot") }} to="/kalkulation/angebot">Angebot generieren</Link>
        <div style={title}>Sonstiges</div>
        <Link style={{ ...item, ...is("/kalkulation/lvOhnePreis") }} to="/kalkulation/lvOhnePreis">LV ohne Preise exportieren</Link>
        <Link style={{ ...item, ...is("/kalkulation/crm") }} to="/kalkulation/crm">CRM-Verfolgung</Link>
      </aside>
      <main style={main}><Outlet /></main>
    </div>
  );
}
