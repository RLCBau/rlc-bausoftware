import React, { useState } from "react";
import { loadAufmass, saveAufmass } from "../../lib/storage";
import { evaluateExpression } from "../../lib/formulas";

const shell: React.CSSProperties = { maxWidth: 900, margin:"0 auto", padding:"12px 16px 40px",
  fontFamily:"Inter, system-ui, Arial, Helvetica, sans-serif", color:"#0f172a" };
const btn: React.CSSProperties = { padding:"6px 10px", border:"1px solid #cbd5e1", background:"#fff", borderRadius:6, fontSize:13, cursor:"pointer" };
const input: React.CSSProperties = { width: 260, border:"1px solid #cbd5e1", borderRadius:6, padding:"6px 8px", marginRight:8 };
const area: React.CSSProperties = { width:"100%", height:280, border:"1px solid #e2e8f0", borderRadius:8, padding:10, fontSize:12, whiteSpace:"pre-wrap" };

export default function Neuberechnung() {
  const [projekt, setProjekt] = useState("PROJ-001");
  const [log, setLog] = useState("");

  const run = () => {
    const doc = loadAufmass(projekt);
    if (!doc) { setLog("Kein Aufmaß gefunden."); return; }

    let sum = 0;
    const neu = doc.zeilen.map(z=>{
      const menge = evaluateExpression(z.formel, z.variablen as any);
      const betrag = menge * z.ep;
      sum += betrag;
      return { ...z, menge, betrag };
    });

    const out = { ...doc, zeilen: neu, nettoSumme: sum, stand: new Date().toISOString() };
    saveAufmass(out);

    setLog(`Neu berechnet (${projekt}) – Positionen: ${neu.length}\nNetto: ${sum.toFixed(2)} €\nZeit: ${out.stand}`);
  };

  return (
    <div style={shell}>
      <h2 style={{ margin:"4px 0 12px", fontSize:20, fontWeight:700 }}>Neuberechnung</h2>
      <div style={{ marginBottom:10 }}>
        <input value={projekt} onChange={(e)=>setProjekt(e.target.value)} style={input} />
        <button style={btn} onClick={run}>Neuberechnung starten</button>
      </div>
      <div style={area as any}>{log}</div>
    </div>
  );
}
