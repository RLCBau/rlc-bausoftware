import React from "react";
const shell = { maxWidth: 900, margin:"0 auto", padding:"12px 16px 40px", fontFamily:"Inter, system-ui, Arial", color:"#0f172a" } as const;

export default function MachineFormats() {
  return (
    <div style={shell}>
      <h2 style={{ margin:"4px 0 12px", fontSize:20, fontWeight:700 }}>Machine Control – Formate</h2>
      <ul>
        <li>Trimble TTM (Terrain Model)</li>
        <li>Leica iCON (Road Alignment)</li>
        <li>Topcon MAGNET</li>
      </ul>
      <p style={{fontSize:12, color:"#64748b"}}>Exporter folgen: aktuell stehen CSV/SVG bereit, DWG/DXF/TTM werden ergänzt.</p>
    </div>
  );
}
