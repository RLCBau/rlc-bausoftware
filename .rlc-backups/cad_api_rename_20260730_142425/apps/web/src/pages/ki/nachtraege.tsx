import React, { useState } from "react";

const shell={maxWidth:900,margin:"0 auto",padding:"12px 16px",fontFamily:"Inter,system-ui,Arial"} as const;
const input={width:"100%",border:"1px solid #cbd5e1",borderRadius:6,padding:"6px 8px",margin:"6px 0"} as const;
const btn={padding:"6px 10px",border:"1px solid #cbd5e1",background:"#fff",borderRadius:6,fontSize:13,cursor:"pointer"} as const;

export default function Nachtraege() {
  const [lv,setLv]=useState("");
  const [off,setOff]=useState("");
  const [diff,setDiff]=useState<string[]>([]);

  const check=()=>{
    setDiff(["Position 02.01: Menge in Angebot höher","Position 03.05: Einheitspreis abweichend"]);
  };

  return (
    <div style={shell}>
      <h2>Nachtragserkennung</h2>
      <textarea style={{...input,height:80}} value={lv} onChange={e=>setLv(e.target.value)} placeholder="LV-Text"/>
      <textarea style={{...input,height:80}} value={off} onChange={e=>setOff(e.target.value)} placeholder="Angebot-Text"/>
      <button style={btn} onClick={check}>Vergleichen</button>
      <ul>{diff.map((d,i)=><li key={i}>{d}</li>)}</ul>
    </div>
  );
}
