import React, { useState } from "react";

const shell={maxWidth:700,margin:"0 auto",padding:"12px 16px",fontFamily:"Inter,system-ui,Arial"} as const;
const btn={padding:"6px 10px",border:"1px solid #cbd5e1",background:"#fff",borderRadius:6,fontSize:13,cursor:"pointer"} as const;

export default function Sprach() {
  const [text,setText]=useState("");
  const [rows,setRows]=useState<string[]>([]);

  const simulate=()=>{
    if (!text.trim()) return;
    setRows([...rows,`Erkannt: ${text}`]);
    setText("");
  };

  return (
    <div style={shell}>
      <h2>Sprachsteuerung</h2>
      <input value={text} onChange={e=>setText(e.target.value)} placeholder="gesprochenes Kommando…" style={{width:"100%",padding:6,border:"1px solid #cbd5e1",borderRadius:6}}/>
      <button style={btn} onClick={simulate}>Simulieren</button>
      <ul>{rows.map((r,i)=><li key={i}>{r}</li>)}</ul>
    </div>
  );
}
