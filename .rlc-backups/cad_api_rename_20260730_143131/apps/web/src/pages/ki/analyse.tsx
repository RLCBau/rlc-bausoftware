import React, { useState } from "react";

const shell={maxWidth:800,margin:"0 auto",padding:"12px 16px",fontFamily:"Inter,system-ui,Arial"} as const;
const btn={padding:"6px 10px",border:"1px solid #cbd5e1",background:"#fff",borderRadius:6,fontSize:13,cursor:"pointer"} as const;
const table={width:"100%",borderCollapse:"collapse",fontSize:13,marginTop:12} as const;
const thtd={border:"1px solid #e2e8f0",padding:"6px 8px"} as const;
const head={...thtd,background:"#f8fafc",fontWeight:600} as const;

export default function Analyse() {
  const [res,setRes]=useState<any[]>([]);

  const run=()=>{
    setRes([{pos:"01.02",kosten:4500,risk:"mittel"},{pos:"02.05",kosten:8200,risk:"hoch"}]);
  };

  return (
    <div style={shell}>
      <h2>LV-Analyse</h2>
      <button style={btn} onClick={run}>Analyse starten</button>
      <table style={table}>
        <thead><tr><th style={head}>Pos</th><th style={head}>Kosten</th><th style={head}>Risiko</th></tr></thead>
        <tbody>
          {res.map(r=><tr key={r.pos}><td style={thtd}>{r.pos}</td><td style={thtd}>{r.kosten} €</td><td style={thtd}>{r.risk}</td></tr>)}
        </tbody>
      </table>
    </div>
  );
}
