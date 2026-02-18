import React, { useState } from "react";
import { BuroAPI } from "../../lib/buro/store";
import { Contract } from "../../lib/buro/types";

const shell={maxWidth:1000,margin:"0 auto",padding:"12px 16px",fontFamily:"Inter,system-ui,Arial"} as const;
const table={width:"100%",borderCollapse:"collapse",fontSize:13} as const;
const thtd={border:"1px solid #e2e8f0",padding:"6px 8px"} as const;
const head={...thtd,background:"#f8fafc",fontWeight:600} as const;
const input={width:"100%",border:"1px solid #cbd5e1",borderRadius:6,padding:"4px 6px"} as const;
const btn={padding:"6px 10px",border:"1px solid #cbd5e1",background:"#fff",borderRadius:6,fontSize:13,cursor:"pointer"} as const;

export default function Vertrage() {
  const [rows,setRows]=useState<Contract[]>(BuroAPI.contracts.all());

  const add=()=>{const n={id:BuroAPI.contracts.newid(),partner:"Neuer Partner",datum:new Date().toISOString().slice(0,10),wert:0,projektId:""}; const l=[...rows,n];setRows(l);BuroAPI.contracts.save(l);};
  const upd=(id:string,p:Partial<Contract>)=>{const l=rows.map(r=>r.id===id?{...r,...p}:r);setRows(l);BuroAPI.contracts.save(l);};
  const del=(id:string)=>{const l=rows.filter(r=>r.id!==id);setRows(l);BuroAPI.contracts.save(l);};

  return (
    <div style={shell}>
      <h2>Vertragsverwaltung</h2>
      <button style={btn} onClick={add}>+ Vertrag</button>
      <table style={table}>
        <thead><tr><th style={head}>Partner</th><th style={head}>Datum</th><th style={head}>Wert (€)</th><th style={head}>Projekt</th><th style={head}>Aktion</th></tr></thead>
        <tbody>
          {rows.map(r=><tr key={r.id}>
            <td style={thtd}><input style={input} value={r.partner} onChange={e=>upd(r.id,{partner:e.target.value})}/></td>
            <td style={thtd}><input style={input} type="date" value={r.datum} onChange={e=>upd(r.id,{datum:e.target.value})}/></td>
            <td style={thtd}><input style={input} type="number" value={r.wert} onChange={e=>upd(r.id,{wert:Number(e.target.value)})}/></td>
            <td style={thtd}><input style={input} value={r.projektId} onChange={e=>upd(r.id,{projektId:e.target.value})}/></td>
            <td style={thtd}><button style={{...btn,color:"#b91c1c"}} onClick={()=>del(r.id)}>Löschen</button></td>
          </tr>)}
        </tbody>
      </table>
    </div>
  );
}
