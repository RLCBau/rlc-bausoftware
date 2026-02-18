import React from "react";
const shell={maxWidth:900,margin:"0 auto",padding:"12px 16px 40px",fontFamily:"Inter,system-ui,Arial"} as const;
const p={margin:"8px 0",color:"#334155"} as const;

export default function Datenschutz() {
  return (
    <div style={shell}>
      <h2>Datenschutz (Kurzfassung)</h2>
      <p style={p}>Alle Daten werden aktuell <b>lokal im Browser</b> gespeichert (localStorage). Ohne Cloud-Übertragung.</p>
      <p style={p}>Beim Löschen des Browser-Caches können Daten verloren gehen. Export-Funktionen stehen bereit.</p>
      <p style={p}>Für eine produktive Cloud-Version folgen AVV, Rollen- & Rechte-Konzept und verschlüsselte Speicherung.</p>
    </div>
  );
}
