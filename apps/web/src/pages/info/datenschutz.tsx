import React from "react";

/* ================= STYLE ================= */

const shell = {
  maxWidth: 900,
  margin: "0 auto",
  padding: "12px 16px 40px",
  fontFamily: "Inter,system-ui,Arial",
} as const;

const p = {
  margin: "8px 0",
  color: "#334155",
  lineHeight: 1.5,
} as const;

const card = {
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  padding: 14,
  margin: "12px 0",
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

export default function Datenschutz() {
  const openSupport = () => {
    alert("Support Chat wird geöffnet (kommt gleich)");
  };

  return (
    <div style={shell}>
      <h2>Datenschutz (Kurzfassung)</h2>

      <div style={card}>
        <p style={p}>
          Aktuell werden alle Daten <b>lokal im Browser</b> gespeichert
          (LocalStorage). Es erfolgt <b>keine automatische Übertragung</b> an externe Server.
        </p>

        <p style={p}>
          Beim Löschen des Browser-Caches können Daten verloren gehen.
          Es wird empfohlen, regelmäßig die integrierten{" "}
          <b>Export-Funktionen (PDF / Excel)</b> zu nutzen.
        </p>
      </div>

      <div style={card}>
        <h4>Geplante Cloud-Version</h4>

        <p style={p}>
          In der produktiven Cloud-Version werden folgende Sicherheitsmaßnahmen
          umgesetzt:
        </p>

        <p style={p}>• DSGVO-konforme Datenverarbeitung</p>
        <p style={p}>• Verschlüsselte Speicherung (Server + Transport)</p>
        <p style={p}>• Rollen- und Rechteverwaltung (User / Bauleiter / Admin)</p>
        <p style={p}>• Audit-Logs & Zugriffskontrolle</p>
        <p style={p}>• AVV (Auftragsverarbeitungsvertrag)</p>
      </div>

      <div style={card}>
        <h4>Sicherheit</h4>
        <p style={p}>
          Die Server-Infrastruktur ist bereits durch Reverse Proxy (Nginx),
          HTTPS (SSL/TLS) sowie Firewall-Regeln abgesichert.
        </p>
      </div>

      {/* SUPPORT BUTTON */}
      <button style={supportBtn} onClick={openSupport}>
        Support Chat
      </button>
    </div>
  );
}





