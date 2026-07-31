import React, { useEffect, useState } from "react";
const shell={maxWidth:900,margin:"0 auto",padding:"12px 16px 40px",fontFamily:"Inter,system-ui,Arial"} as const;
const box={border:"1px solid #e2e8f0",borderRadius:8,padding:10,margin:"8px 0",background:"#fafafa"} as const;

export default function Systemstatus() {
  const [info,setInfo]=useState<any>({});
  useEffect(()=>{
    setInfo({
      ua: navigator.userAgent,
      lang: navigator.language,
      online: navigator.onLine,
      storage: !!window.localStorage,
      time: new Date().toISOString(),
    });
  },[]);
  const clearAll=()=>{ if (confirm("Lokalen Speicher wirklich leeren?")) { localStorage.clear(); alert("Lokale Daten gelöscht."); } };

  return (
    <div style={shell}>
      <h2>Systemstatus</h2>
      <div style={box}><b>Browser:</b> {info.ua}</div>
      <div style={box}><b>Sprache:</b> {info.lang} · <b>Online:</b> {String(info.online)} · <b>LocalStorage:</b> {String(info.storage)}</div>
      <div style={box}><b>Uhrzeit:</b> {info.time}</div>
      <button style={{padding:"6px 10px",border:"1px solid #cbd5e1",borderRadius:6}} onClick={clearAll}>Lokale Daten löschen</button>
    </div>
  );
}
