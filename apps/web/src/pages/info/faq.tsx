import React from "react";

/* ================= STYLE ================= */

const shell = {
  maxWidth: 900,
  margin: "0 auto",
  padding: "12px 16px 40px",
  fontFamily: "Inter,system-ui,Arial",
  color: "#0f172a",
} as const;

const qa = {
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  padding: 12,
  margin: "10px 0",
  background: "#fff",
} as const;

const q = { fontWeight: 600, marginBottom: 4 } as const;
const a = { color: "#334155", lineHeight: 1.5 } as const;

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

export default function FAQ() {
  const openSupport = () => {
    alert("Support Chat wird geöffnet (Integration folgt)");
  };

  return (
    <div style={shell}>
      <h2>FAQ</h2>

      <div style={qa}>
        <div style={q}>Wie funktionieren Mengen-Formeln?</div>
        <div style={a}>
          Es werden einfache mathematische Ausdrücke unterstützt, z. B.:
          <br />
          <code>10*2+5</code>, <code>(12+8)/2</code>
        </div>
      </div>

      <div style={qa}>
        <div style={q}>Was passiert mit meinen Daten?</div>
        <div style={a}>
          Aktuell werden alle Daten lokal im Browser gespeichert (LocalStorage).
          Beim Löschen des Browser-Caches gehen die Daten verloren.
        </div>
      </div>

      <div style={qa}>
        <div style={q}>Welche Exportmöglichkeiten gibt es?</div>
        <div style={a}>
          Aktuell verfügbar: CSV, SVG, JSON.
          <br />
          Geplant: GAEB, DXF, DWG, PDF (erweitert).
        </div>
      </div>

      <div style={qa}>
        <div style={q}>Unterstützt das System mehrere Benutzer?</div>
        <div style={a}>
          Aktuell: Single-User (lokal).
          <br />
          Geplant: Multi-User mit Rollenverwaltung (Cloud-Version).
        </div>
      </div>

      <div style={qa}>
        <div style={q}>Funktioniert die Software auch mobil?</div>
        <div style={a}>
          Ja. Die Mobile-App (iOS & Android) unterstützt Regieberichte,
          Lieferscheine, Fotos und Offline-Synchronisation.
        </div>
      </div>

      <div style={qa}>
        <div style={q}>Ist meine Verbindung sicher?</div>
        <div style={a}>
          Ja. Die Cloud-Version nutzt HTTPS (SSL/TLS), Reverse Proxy (Nginx)
          sowie serverseitige Sicherheitsmechanismen.
        </div>
      </div>

      {/* SUPPORT BUTTON */}
      <button style={supportBtn} onClick={openSupport}>
        Support Chat
      </button>
    </div>
  );
}





