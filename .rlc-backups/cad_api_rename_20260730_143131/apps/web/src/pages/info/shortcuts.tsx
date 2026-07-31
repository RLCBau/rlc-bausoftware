import React from "react";
const shell={maxWidth:700,margin:"0 auto",padding:"12px 16px 40px",fontFamily:"Inter,system-ui,Arial"} as const;
const table={width:"100%",borderCollapse:"collapse",fontSize:13} as const;
const thtd={border:"1px solid #e2e8f0",padding:"6px 8px"} as const;
const head={...thtd,background:"#f8fafc",fontWeight:600} as const;

export default function Shortcuts() {
  return (
    <div style={shell}>
      <h2>Tastenkürzel</h2>
      <table style={table}>
        <thead><tr><th style={head}>Aktion</th><th style={head}>Shortcut</th></tr></thead>
        <tbody>
          <tr><td style={thtd}>Suchen (Tabellen)</td><td style={thtd}>Ctrl/Cmd + F</td></tr>
          <tr><td style={thtd}>Zeile hinzufügen</td><td style={thtd}>Alt + N</td></tr>
          <tr><td style={thtd}>Löschen</td><td style={thtd}>Entf</td></tr>
          <tr><td style={thtd}>CAD Pan</td><td style={thtd}>Werkzeug „Pan“</td></tr>
        </tbody>
      </table>
    </div>
  );
}
