import React from "react";
const shell={maxWidth:900,margin:"0 auto",padding:"12px 16px 40px",fontFamily:"Inter,system-ui,Arial",color:"#0f172a"} as const;
const qa={border:"1px solid #e2e8f0",borderRadius:8,padding:10,margin:"8px 0"} as const;

export default function FAQ() {
  return (
    <div style={shell}>
      <h2>FAQ</h2>
      <div style={qa}><b>Mengen-Formeln?</b><div>Einfache JS-Ausdrücke: <code>10*2+5</code>, <code>(12+8)/2</code>.</div></div>
      <div style={qa}><b>Daten weg?</b><div>Alles speichert lokal (Browser). Cache-Löschung leert die Daten.</div></div>
      <div style={qa}><b>Export?</b><div>CSV/SVG/JSON verfügbar; GAEB/DXF/DWG folgen.</div></div>
      <div style={qa}><b>Mehrbenutzer?</b><div>Geplant (API/DB). Aktuell Single-User (localStorage).</div></div>
    </div>
  );
}
