import React, { useState } from "react";
import { loadAufmass } from "../../lib/storage";

const shell: React.CSSProperties = { maxWidth: 900, margin:"0 auto", padding:"12px 16px 40px",
  fontFamily:"Inter, system-ui, Arial, Helvetica, sans-serif", color:"#0f172a" };
const btn: React.CSSProperties = { padding:"6px 10px", border:"1px solid #cbd5e1", background:"#fff", borderRadius:6, fontSize:13, cursor:"pointer" };
const input: React.CSSProperties = { width: 260, border:"1px solid #cbd5e1", borderRadius:6, padding:"6px 8px", marginRight:8 };

export default function Ausdrucke() {
  const [projekt, setProjekt] = useState("PROJ-001");

  const csv = () => {
    const doc = loadAufmass(projekt);
    if (!doc) return;
    const rows = [
      ["PosNr","Kurztext","ME","EP","Formel","Menge","Betrag"],
      ...doc.zeilen.map(z=>[z.posNr,z.kurztext,z.einheit,z.ep,z.formel,z.menge,z.betrag]),
      ["","","","","","Netto",doc.nettoSumme]
    ];
    const content = rows.map(r=>r.map(c=>typeof c==="string"?`"${c.replace(/"/g,'""')}"`:c).join(";")).join("\n");
    const blob = new Blob([content], {type:"text/csv;charset=utf-8"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Aufmass_${projekt}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };

  const drucken = () => window.print();

  return (
    <div style={shell}>
      <h2 style={{ margin:"4px 0 12px", fontSize:20, fontWeight:700 }}>Ausdrucke</h2>
      <div style={{ marginBottom:10 }}>
        <input value={projekt} onChange={(e)=>setProjekt(e.target.value)} style={input} />
        <button style={btn} onClick={csv}>CSV Export</button>{" "}
        <button style={btn} onClick={drucken}>Drucken (Browser)</button>
      </div>
      <div style={{ color:"#64748b", fontSize:12 }}>
        Für PDF bitte die Druckfunktion des Browsers verwenden (Ziel „Als PDF speichern“).
      </div>
    </div>
  );
}
