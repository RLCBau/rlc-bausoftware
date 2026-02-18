import React from "react";
const shell = { maxWidth: 900, margin:"0 auto", padding:"12px 16px 40px", fontFamily:"Inter, system-ui, Arial", color:"#0f172a" } as const;

export default function BIMStub() {
  return (
    <div style={shell}>
      <h2 style={{ margin:"4px 0 12px", fontSize:20, fontWeight:700 }}>3D / BIM</h2>
      <p style={{ color:"#64748b" }}>Platzhalter – Anbindung Three.js/IFC.js folgt (IFC Viewer, 4D/5D).</p>
    </div>
  );
}
