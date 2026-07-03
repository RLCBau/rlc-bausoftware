import React from "react";

/* ================= STYLE ================= */

const shell = {
  maxWidth: 950,
  margin: "0 auto",
  padding: "12px 16px 40px",
  fontFamily: "Inter,system-ui,Arial",
  color: "#0f172a",
} as const;

const h3 = {
  margin: "18px 0 6px",
  fontSize: 16,
  fontWeight: 700,
} as const;

const li = { margin: "6px 0", color: "#334155" } as const;

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

export default function Hilfe() {
  const openSupport = () => {
    alert("Support Chat wird geöffnet (Integration folgt)");
  };

  return (
    <div style={shell}>
      <h2>Hilfe / Anleitungen</h2>

      <h3 style={h3}>1. Kalkulation</h3>
      <ul>
        <li style={li}>
          <b>Preislisten verwalten</b> → Positionen direkt in die Kalkulation übernehmen.
        </li>
        <li style={li}>
          <b>Mengenberechnung</b> mit Formeln (z.B. <code>12*3+5</code>).
        </li>
        <li style={li}>
          <b>Angebot erstellen</b> → Export als CSV oder PDF.
        </li>
        <li style={li}>
          <b>KI-Unterstützung</b> für automatische Vorschläge (in Entwicklung).
        </li>
      </ul>

      <h3 style={h3}>2. Mengenermittlung</h3>
      <ul>
        <li style={li}>
          Mengen pro Position erfassen (manuell, CAD oder KI).
        </li>
        <li style={li}>
          Import aus PDF / CAD / LandXML möglich (teilweise aktiv).
        </li>
        <li style={li}>
          Soll-Ist Vergleich für Abrechnung nutzen.
        </li>
      </ul>

      <h3 style={h3}>3. CAD</h3>
      <ul>
        <li style={li}>
          Zeichnen von Linien und Polylinien mit Zoom, Snap und Layern.
        </li>
        <li style={li}>
          Import von Daten (JSON, CSV).
        </li>
        <li style={li}>
          Export als SVG oder JSON.
        </li>
      </ul>

      <h3 style={h3}>4. Büro & Verwaltung</h3>
      <ul>
        <li style={li}>
          Projekte, Dokumente und Verträge zentral verwalten.
        </li>
        <li style={li}>
          Kommunikation und Aufgabenplanung integriert.
        </li>
      </ul>

      <h3 style={h3}>5. Buchhaltung</h3>
      <ul>
        <li style={li}>
          Erstellung von Rechnungen (Eingang / Ausgang).
        </li>
        <li style={li}>
          Zahlungsüberwachung und Mahnwesen.
        </li>
        <li style={li}>
          Vorbereitung für DATEV / SAP Integration.
        </li>
      </ul>

      <h3 style={h3}>Tipp</h3>
      <p style={{ color: "#334155" }}>
        Speichere häufig genutzte Daten und nutze die Tabellenstruktur für schnelle
        Wiederverwendung. Regelmäßige Exporte sichern deine Daten zusätzlich.
      </p>

      {/* SUPPORT BUTTON */}
      <button style={supportBtn} onClick={openSupport}>
        Support Chat
      </button>
    </div>
  );
}





