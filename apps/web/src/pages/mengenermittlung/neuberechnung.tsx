// apps/web/src/pages/mengenermittlung/Neuberechnung.tsx
import React, { useState } from "react";
import { loadAufmass, saveAufmass } from "../../lib/storage";
import { evaluateExpression } from "../../lib/formulas";

const shell: React.CSSProperties = {
  maxWidth: 900,
  margin: "0 auto",
  padding: "12px 16px 40px",
  fontFamily: "Inter, system-ui, Arial, Helvetica, sans-serif",
  color: "#0f172a",
};

const btn: React.CSSProperties = {
  padding: "6px 10px",
  border: "1px solid #cbd5e1",
  background: "#fff",
  borderRadius: 6,
  fontSize: 13,
  cursor: "pointer",
};

const input: React.CSSProperties = {
  width: 260,
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  padding: "6px 8px",
  marginRight: 8,
};

const area: React.CSSProperties = {
  width: "100%",
  minHeight: 280,
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  padding: 10,
  fontSize: 12,
  whiteSpace: "pre-wrap",
  background: "#fff",
};

function toSafeNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export default function Neuberechnung() {
  const [projekt, setProjekt] = useState("PROJ-001");
  const [log, setLog] = useState("");

  const run = () => {
    const projektId = String(projekt || "").trim();
    if (!projektId) {
      setLog("Projekt-ID fehlt.");
      return;
    }

    const doc = loadAufmass(projektId);
    if (!doc) {
      setLog(`Kein Aufmaß gefunden für Projekt ${projektId}.`);
      return;
    }

    let sum = 0;
    let fehler = 0;

    const neu = (Array.isArray(doc.zeilen) ? doc.zeilen : []).map((z, index) => {
      let menge = 0;

      try {
        menge = toSafeNumber(evaluateExpression(z.formel, z.variablen as any));
      } catch {
        menge = 0;
        fehler += 1;
      }

      const ep = toSafeNumber(z.ep);
      const betrag = menge * ep;
      sum += betrag;

      return {
        ...z,
        id: z.id || `row-${index}`,
        menge,
        betrag,
      };
    });

    const out = {
      ...doc,
      projektId: doc.projektId || projektId,
      zeilen: neu,
      nettoSumme: sum,
      stand: new Date().toISOString(),
    };

    saveAufmass(out);

    const lines = [
      `Neu berechnet (${projektId})`,
      `Positionen: ${neu.length}`,
      `Netto: ${sum.toFixed(2)} €`,
      `Zeit: ${out.stand}`,
    ];

    if (fehler > 0) {
      lines.push(`Warnung: ${fehler} Formel(n) konnten nicht berechnet werden und wurden auf 0 gesetzt.`);
    }

    setLog(lines.join("\n"));
  };

  return (
    <div style={shell}>
      <h2 style={{ margin: "4px 0 12px", fontSize: 20, fontWeight: 700 }}>
        Neuberechnung
      </h2>

      <div style={{ marginBottom: 10 }}>
        <input
          value={projekt}
          onChange={(e) => setProjekt(e.target.value)}
          style={input}
          placeholder="Projekt-ID"
        />
        <button style={btn} onClick={run}>
          Neuberechnung starten
        </button>
      </div>

      <div style={area}>{log}</div>
    </div>
  );
}





