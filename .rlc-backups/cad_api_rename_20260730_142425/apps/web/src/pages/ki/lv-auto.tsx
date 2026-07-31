import React, { useState } from "react";

const shell={maxWidth:1000,margin:"0 auto",padding:"12px 16px",fontFamily:"Inter,system-ui,Arial"} as const;
const input={width:"100%",border:"1px solid #cbd5e1",borderRadius:6,padding:"6px 8px",margin:"6px 0"} as const;
const btn={padding:"6px 10px",border:"1px solid #cbd5e1",background:"#fff",borderRadius:6,fontSize:13,cursor:"pointer"} as const;
const table={width:"100%",borderCollapse:"collapse",fontSize:13,marginTop:12} as const;
const thtd={border:"1px solid #e2e8f0",padding:"6px 8px"} as const;
const head={...thtd,background:"#f8fafc",fontWeight:600} as const;

export default function LVAuto() {
  const [desc,setDesc]=useState("");
  const [rows,setRows]=useState<any[]>([]);

  const generate=()=>{
    if (!desc.trim()) return;
    const fake=[{pos:"01.01.001",kurz:"Erdarbeiten",lang:"Aushub 30 cm, Verbau, Entsorgung",einheit:"m³",menge:120,preis:35}];
    setRows(fake);
  };

  return (
    <div style={shell}>
      <h2>Automatische LV-Erstellung</h2>
      <textarea style={{...input,height:100}} value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Baubeschreibung eingeben…"/>
      <button style={btn} onClick={generate}>LV generieren</button>
      <table style={table}>
        <thead><tr><th style={head}>Pos</th><th style={head}>Kurztext</th><th style={head}>Langtext</th><th style={head}>Einheit</th><th style={head}>Menge</th><th style={head}>Preis</th></tr></thead>
        <tbody>
          {rows.map(r=><tr key={r.pos}>
            <td style={thtd}>{r.pos}</td><td style={thtd}>{r.kurz}</td><td style={thtd}>{r.lang}</td><td style={thtd}>{r.einheit}</td><td style={thtd}>{r.menge}</td><td style={thtd}>{r.preis} €</td>
          </tr>)}
        </tbody>
      </table>
    </div>
  );
}
