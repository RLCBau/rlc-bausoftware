import React from "react";
const shell={maxWidth:800,margin:"0 auto",padding:"12px 16px 40px",fontFamily:"Inter,system-ui,Arial"} as const;
const card={border:"1px solid #e2e8f0",borderRadius:8,padding:10,margin:"10px 0"} as const;

export default function Changelog() {
  return (
    <div style={shell}>
      <h2>Changelog</h2>
      <div style={card}>
        <b>v0.4</b> – Kalkulation erweitert (Preislisten, Vergleich, Angebot), CAD 2D Editor, Buchhaltung Basis.
      </div>
      <div style={card}>
        <b>v0.3</b> – Struktur 7 Makrosektionen, Tabelle-UI uniforme, Speicher lokal.
      </div>
      <div style={card}>
        <b>v0.2</b> – Mengenermittlung mit Formeln, Aufmaßeditor.
      </div>
      <div style={card}>
        <b>v0.1</b> – Projekt-Setup, Routing, Layout.
      </div>
    </div>
  );
}
