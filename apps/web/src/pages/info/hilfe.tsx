import { rlcClass } from "../../ui/rlcRuntimeStyle";import React from "react";

/* ================= STYLE ================= */

const shell = {
  maxWidth: 950,
  margin: "0 auto",
  padding: "12px 16px 40px",
  fontFamily: "Inter,system-ui,Arial",
  color: "#0f172a"
} as const;

const h3 = {
  margin: "18px 0 6px",
  fontSize: 16,
  fontWeight: 600
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
  boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
} as const;

/* ================= COMPONENT ================= */

export default function Hilfe() {
  const openSupport = () => {
    alert("Support Chat wird geöffnet (Integration folgt)");
  };

  return (
    <div className={rlcClass(null, shell)}>
      <h2>Hilfe / Anleitungen</h2>

      <h3 className={rlcClass(null, h3)}>1. Kalkulation</h3>
      <ul>
        <li className={rlcClass(null, li)}>
          <b>Preislisten verwalten</b> → Positionen direkt in die Kalkulation übernehmen.
        </li>
        <li className={rlcClass(null, li)}>
          <b>Mengenberechnung</b> mit Formeln (z.B. <code>12*3+5</code>).
        </li>
        <li className={rlcClass(null, li)}>
          <b>Angebot erstellen</b> → Export als CSV oder PDF.
        </li>
        <li className={rlcClass(null, li)}>
          <b>KI-Unterstützung</b> für automatische Vorschläge (in Entwicklung).
        </li>
      </ul>

      <h3 className={rlcClass(null, h3)}>2. Mengenermittlung</h3>
      <ul>
        <li className={rlcClass(null, li)}>
          Mengen pro Position erfassen (manuell, CAD oder KI).
        </li>
        <li className={rlcClass(null, li)}>
          Import aus PDF / CAD / LandXML möglich (teilweise aktiv).
        </li>
        <li className={rlcClass(null, li)}>
          Soll-Ist Vergleich für Abrechnung nutzen.
        </li>
      </ul>

      <h3 className={rlcClass(null, h3)}>3. CAD</h3>
      <ul>
        <li className={rlcClass(null, li)}>
          Zeichnen von Linien und Polylinien mit Zoom, Snap und Layern.
        </li>
        <li className={rlcClass(null, li)}>
          Import von Daten (JSON, CSV).
        </li>
        <li className={rlcClass(null, li)}>
          Export als SVG oder JSON.
        </li>
      </ul>

      <h3 className={rlcClass(null, h3)}>4. Büro & Verwaltung</h3>
      <ul>
        <li className={rlcClass(null, li)}>
          Projekte, Dokumente und Verträge zentral verwalten.
        </li>
        <li className={rlcClass(null, li)}>
          Kommunikation und Aufgabenplanung integriert.
        </li>
      </ul>

      <h3 className={rlcClass(null, h3)}>5. Buchhaltung</h3>
      <ul>
        <li className={rlcClass(null, li)}>
          Erstellung von Rechnungen (Eingang / Ausgang).
        </li>
        <li className={rlcClass(null, li)}>
          Zahlungsüberwachung und Mahnwesen.
        </li>
        <li className={rlcClass(null, li)}>
          Vorbereitung für DATEV / SAP Integration.
        </li>
      </ul>

      <h3 className={rlcClass(null, h3)}>Tipp</h3>
      <p className="rlc-migrated-pages-info-hilfe-tsx-816">
        Speichere häufig genutzte Daten und nutze die Tabellenstruktur für schnelle
        Wiederverwendung. Regelmäßige Exporte sichern deine Daten zusätzlich.
      </p>

      {/* SUPPORT BUTTON */}
      <button className={rlcClass(null, supportBtn)} onClick={openSupport}>
        Support Chat
      </button>
    </div>);

}
