import React from "react";
const shell={maxWidth:700,margin:"0 auto",padding:"12px 16px 40px",fontFamily:"Inter,system-ui,Arial"} as const;

export default function Ueber() {
  return (
    <div style={shell}>
      <h2>Über die App</h2>
      <p>Modulare Bausoftware mit 7 Makrosektionen: Mengenermittlung, Kalkulation, CAD, Büro, Buchhaltung, Info, (weiteres Modul).</p>
      <p>Ziel: Werkzeug auf Niveau „AddOne/BRZ“ – schneller, schlanker, fokussiert auf reale Baustellenprozesse.</p>
      <p>Version: v0.4 (Demo, lokal).</p>
    </div>
  );
}
