import { rlcClass } from "../../ui/rlcRuntimeStyle";import React from "react";

/* ================= STYLE ================= */

const shell = {
  maxWidth: 750,
  margin: "0 auto",
  padding: "12px 16px 40px",
  fontFamily: "Inter,system-ui,Arial"
} as const;

const table = {
  width: "100%",
  borderCollapse: "collapse" as const,
  fontSize: 13,
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  overflow: "hidden"
} as const;

const thtd = {
  borderBottom: "1px solid #e2e8f0",
  padding: "8px 10px",
  textAlign: "left" as const
} as const;

const head = {
  ...thtd,
  background: "#f8fafc",
  fontWeight: 600
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
  boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
} as const;

/* ================= COMPONENT ================= */

export default function Shortcuts() {
  const openSupport = () => {
    alert("Support Chat wird geöffnet (Integration folgt)");
  };

  return (
    <div className={rlcClass(null, shell)}>
      <h2>Tastenkürzel</h2>

      <table className={rlcClass(null, table)}>
        <thead>
          <tr>
            <th className={rlcClass(null, head)}>Aktion</th>
            <th className={rlcClass(null, head)}>Shortcut</th>
          </tr>
        </thead>

        <tbody>
          <tr>
            <td className={rlcClass(null, thtd)}>Suchen (Tabellen)</td>
            <td className={rlcClass(null, thtd)}>Ctrl / Cmd + F</td>
          </tr>

          <tr>
            <td className={rlcClass(null, thtd)}>Neue Zeile hinzufügen</td>
            <td className={rlcClass(null, thtd)}>Alt + N</td>
          </tr>

          <tr>
            <td className={rlcClass(null, thtd)}>Zeile löschen</td>
            <td className={rlcClass(null, thtd)}>Entf / Delete</td>
          </tr>

          <tr>
            <td className={rlcClass(null, thtd)}>Speichern (geplant)</td>
            <td className={rlcClass(null, thtd)}>Ctrl / Cmd + S</td>
          </tr>

          <tr>
            <td className={rlcClass(null, thtd)}>Navigation zurück</td>
            <td className={rlcClass(null, thtd)}>Alt + ←</td>
          </tr>

          <tr>
            <td className={rlcClass(null, thtd)}>Navigation vorwärts</td>
            <td className={rlcClass(null, thtd)}>Alt + →</td>
          </tr>

          <tr>
            <td className={rlcClass(null, thtd)}>CAD – Pan (verschieben)</td>
            <td className={rlcClass(null, thtd)}>Mittlere Maustaste / Pan Tool</td>
          </tr>

          <tr>
            <td className={rlcClass(null, thtd)}>CAD – Zoom</td>
            <td className={rlcClass(null, thtd)}>Mausrad</td>
          </tr>

          <tr>
            <td className={rlcClass(null, thtd)}>CAD – Auswahl löschen</td>
            <td className={rlcClass(null, thtd)}>Entf</td>
          </tr>
        </tbody>
      </table>

      {/* SUPPORT BUTTON */}
      <button className={rlcClass(null, supportBtn)} onClick={openSupport}>
        Support Chat
      </button>
    </div>);

}
