import React from "react";
import { Link, Outlet, useLocation } from "react-router-dom";

const shell: React.CSSProperties = { display:"grid", gridTemplateColumns:"240px 1fr", height:"calc(100vh - 0px)" };
const aside: React.CSSProperties = { borderRight:"1px solid #e2e8f0", padding:10, fontFamily:"Inter, system-ui, Arial", fontSize:13 };
const main: React.CSSProperties = { overflow:"auto" };
const item: React.CSSProperties = { display:"block", padding:"8px 10px", margin:"4px 6px", borderRadius:6, color:"#0f172a", textDecoration:"none" };
const title: React.CSSProperties = { margin:"14px 6px 8px", color:"#334155", fontWeight:700, fontSize:12, textTransform:"uppercase", letterSpacing:.4 };

export default function KIIndex() {
  const loc = useLocation();
  const is = (p:string)=> (loc.pathname===p?{background:"#f1f5f9", fontWeight:600}:{} );
  return (
    <div style={shell}>
      <aside style={aside}>
        <div style={title}>KI</div>
        <Link style={{...item,...is("/ki/lv-auto")}} to="/ki/lv-auto">Automatische LV-Erstellung</Link>
        <Link style={{...item,...is("/ki/vorschlaege")}} to="/ki/vorschlaege">Vorschläge</Link>
        <Link style={{...item,...is("/ki/nachtraege")}} to="/ki/nachtraege">Nachtragserkennung</Link>
        <Link style={{...item,...is("/ki/analyse")}} to="/ki/analyse">LV-Analyse</Link>
        <Link style={{...item,...is("/ki/foto")}} to="/ki/foto">Fotoerkennung</Link>
        <Link style={{...item,...is("/ki/sprach")}} to="/ki/sprach">Sprachsteuerung</Link>
      </aside>
      <main style={main}><Outlet/></main>
    </div>
  );
}
