import React from "react";
const shell = { maxWidth: 900, margin:"0 auto", padding:"12px 16px 40px", fontFamily:"Inter, system-ui, Arial", color:"#0f172a" } as const;
const btn = { padding:"6px 10px", border:"1px solid #cbd5e1", background:"#fff", borderRadius:6, fontSize:13, cursor:"pointer" } as const;

export default function LVOhnePreis() {
  const exportCsv = () => {
    const head = "Position;Kurztext;ME;Menge\n";
    const body = [
      ["001.001","Speedpipe Verlegung 1,20 m","m","180"],
      ["001.002","Asphaltdeckschicht wiederherstellen","m²","150"]
    ].map(r=>r.join(";")).join("\n");
    const blob = new Blob([head+body],{type:"text/csv;charset=utf-8"});
    const a = document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="LV_ohne_Preise.csv"; a.click(); URL.revokeObjectURL(a.href);
  };
  return (
    <div style={shell}>
      <h2 style={{ margin:"4px 0 12px", fontSize:20, fontWeight:700 }}>LV ohne Preise exportieren</h2>
      <button style={btn} onClick={exportCsv}>CSV exportieren</button>
    </div>
  );
}
