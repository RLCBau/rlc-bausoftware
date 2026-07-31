import React from "react";
const shell={maxWidth:900,margin:"0 auto",padding:"12px 16px 40px",fontFamily:"Inter,system-ui,Arial"} as const;
const p={margin:"8px 0",color:"#334155"} as const;

export default function Impressum() {
  return (
    <div style={shell}>
      <h2>Impressum</h2>
      <p style={p}><b>Firma:</b> Demo BauSoftware GmbH</p>
      <p style={p}><b>Anschrift:</b> Musterstraße 1, 00000 Musterstadt</p>
      <p style={p}><b>Kontakt:</b> info@demo-bausoftware.de · +49 000 000000</p>
      <p style={p}><b>Vertretungsberechtigt:</b> Max Mustermann</p>
    </div>
  );
}
