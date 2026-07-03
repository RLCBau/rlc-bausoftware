import React from "react";

/* ================= STYLE ================= */

const shell = {
  maxWidth: 800,
  margin: "0 auto",
  padding: "12px 16px 40px",
  fontFamily: "Inter,system-ui,Arial",
} as const;

const card = {
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  padding: 12,
  margin: "10px 0",
  background: "#fff",
} as const;

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
  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
} as const;

/* ================= COMPONENT ================= */

export default function Changelog() {
  const openSupport = () => {
    // futuro: collegamento reale API /chat
    alert("Support Chat wird geöffnet (kommt gleich)");
  };

  return (
    <div style={shell}>
      <h2>Changelog</h2>

      <div style={card}>
        <b>v0.5</b> – Support Chat integriert, API-Verbindung vorbereitet,
        Verbesserungen Stabilität & UI.
      </div>

      <div style={card}>
        <b>v0.4</b> – Kalkulation erweitert (Preislisten, Vergleich, Angebot),
        CAD 2D Editor, Buchhaltung Basis.
      </div>

      <div style={card}>
        <b>v0.3</b> – Struktur 7 Makrosektionen, Tabelle-UI uniforme,
        Speicher lokal.
      </div>

      <div style={card}>
        <b>v0.2</b> – Mengenermittlung mit Formeln, Aufmaßeditor.
      </div>

      <div style={card}>
        <b>v0.1</b> – Projekt-Setup, Routing, Layout.
      </div>

      {/* SUPPORT BUTTON */}
      <button style={supportBtn} onClick={openSupport}>
        Support Chat
      </button>
    </div>
  );
}





