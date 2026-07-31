import React from "react";
const shell={maxWidth:950,margin:"0 auto",padding:"12px 16px 40px",fontFamily:"Inter,system-ui,Arial",color:"#0f172a"} as const;
const h3={margin:"16px 0 6px",fontSize:16,fontWeight:700} as const;
const li={margin:"4px 0"} as const;

export default function Hilfe() {
  return (
    <div style={shell}>
      <h2>Hilfe / Anleitungen</h2>
      <h3 style={h3}>1. Kalkulation</h3>
      <ul>
        <li style={li}><b>Preislisten</b> pflegen → Positionen in <i>Kalkulation (manuell)</i> übernehmen.</li>
        <li style={li}><b>Mengen</b> unterstützen einfache Formeln (z.B. <code>12*3+5</code>).</li>
        <li style={li}><b>Angebot</b>: CSV Export, PDF via Drucken.</li>
      </ul>

      <h3 style={h3}>2. CAD</h3>
      <ul>
        <li style={li}><b>Zeichnen</b>: Linie/Polylinie, Snap, Pan/Zoom, Löschen.</li>
        <li style={li}><b>Import</b>: JSON/CSV-Punkte. <b>Export</b>: JSON/SVG.</li>
      </ul>

      <h3 style={h3}>3. Büro & Buchhaltung</h3>
      <ul>
        <li style={li}><b>Projekte/Dokumente/Verträge</b> tabellarisch verwalten.</li>
        <li style={li}><b>Rechnungen</b> (Eingang/Ausgang), Zahlungen, Mahnwesen, USt.</li>
      </ul>

      <h3 style={h3}>Tipp</h3>
      <p>Nutze <i>Tastenkürzel</i> und speichere häufige Daten in den jeweiligen Tabellen (localStorage).</p>
    </div>
  );
}
