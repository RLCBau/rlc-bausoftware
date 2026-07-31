import React, { useState } from "react";
const shell={maxWidth:800,margin:"0 auto",padding:"12px 16px 40px",fontFamily:"Inter,system-ui,Arial"} as const;
const card={border:"1px solid #e2e8f0",borderRadius:8,padding:10,margin:"10px 0"} as const;
const btn={padding:"6px 10px",border:"1px solid #cbd5e1",background:"#fff",borderRadius:6,fontSize:13,cursor:"pointer"} as const;

export default function Updates() {
  const [log,setLog]=useState("");
  const check=()=>{ setLog("Aktuelle Version: v0.4 · Server: offline-check (Demo)."); };
  return (
    <div style={shell}>
      <h2>Updates</h2>
      <button style={btn} onClick={check}>Auf Updates prüfen</button>
      <div style={card}>{log||"Noch keine Prüfung durchgeführt."}</div>
    </div>
  );
}
