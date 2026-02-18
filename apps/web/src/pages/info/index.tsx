import React from "react";
import { Link, Outlet, useLocation } from "react-router-dom";

const shell: React.CSSProperties = { display:"grid", gridTemplateColumns:"240px 1fr", height:"calc(100vh - 0px)" };
const aside: React.CSSProperties = { borderRight:"1px solid #e2e8f0", padding:10, fontFamily:"Inter, system-ui, Arial", fontSize:13 };
const main: React.CSSProperties = { overflow:"auto" };
const item: React.CSSProperties = { display:"block", padding:"8px 10px", margin:"4px 6px", borderRadius:6, color:"#0f172a", textDecoration:"none" };
const title: React.CSSProperties = { margin:"14px 6px 8px", color:"#334155", fontWeight:700, fontSize:12, textTransform:"uppercase", letterSpacing:.4 };

export default function InfoIndex() {
  const loc = useLocation();
  const is = (p:string)=> (loc.pathname===p?{background:"#f1f5f9", fontWeight:600}:{} );
  return (
    <div style={shell}>
      <aside style={aside}>
        <div style={title}>Info & Hilfe</div>
        <Link style={{...item,...is("/info/hilfe")}} to="/info/hilfe">Hilfe / Anleitungen</Link>
        <Link style={{...item,...is("/info/faq")}} to="/info/faq">FAQ</Link>
        <Link style={{...item,...is("/info/shortcuts")}} to="/info/shortcuts">Tastenkürzel</Link>
        <Link style={{...item,...is("/info/changelog")}} to="/info/changelog">Changelog</Link>
        <Link style={{...item,...is("/info/system")}} to="/info/system">Systemstatus</Link>
        <Link style={{...item,...is("/info/updates")}} to="/info/updates">Updates</Link>
        <div style={title}>Rechtliches</div>
        <Link style={{...item,...is("/info/datenschutz")}} to="/info/datenschutz">Datenschutz</Link>
        <Link style={{...item,...is("/info/impressum")}} to="/info/impressum">Impressum</Link>
        <div style={title}>Kontakt</div>
        <Link style={{...item,...is("/info/support")}} to="/info/support">Support / Feedback</Link>
        <Link style={{...item,...is("/info/ueber")}} to="/info/ueber">Über die App</Link>
      </aside>
      <main style={main}><Outlet/></main>
    </div>
  );
}
