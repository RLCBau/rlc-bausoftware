import React, { useState } from "react";
import { CadAPI, loadDoc, saveDoc } from "../../lib/cad/store";
import { Layer } from "../../lib/cad/types";

const shell = { maxWidth: 900, margin:"0 auto", padding:"12px 16px 40px", fontFamily:"Inter, system-ui, Arial", color:"#0f172a" } as const;
const table = { width:"100%", borderCollapse:"collapse", fontSize:13 } as const;
const thtd = { border:"1px solid #e2e8f0", padding:"6px 8px", verticalAlign:"middle" } as const;
const head = { ...thtd, background:"#f8fafc", fontWeight:600, textAlign:"left" as const } as const;
const input = { width:"100%", border:"1px solid #cbd5e1", borderRadius:6, padding:"4px 6px" } as const;
const btn = { padding:"6px 10px", border:"1px solid #cbd5e1", background:"#fff", borderRadius:6, fontSize:13, cursor:"pointer" } as const;

export default function CADTools() {
  const [doc, setDoc] = useState(loadDoc());

  const add = () => { const d= { ...doc }; CadAPI.addLayer(d); setDoc(d); saveDoc(d); };
  const del = (id:string) => { const d = { ...doc }; CadAPI.removeLayer(d, id); setDoc(d); saveDoc(d); };
  const upd = (id:string, p: Partial<Layer>) => {
    const d = { ...doc, layers: doc.layers.map(l => l.id===id?{...l, ...p}:l) };
    setDoc(d); saveDoc(d);
  };

  return (
    <div style={shell}>
      <h2 style={{ margin:"4px 0 12px", fontSize:20, fontWeight:700 }}>Layer & Eigenschaften</h2>
      <div style={{ marginBottom:10 }}>
        <button style={btn} onClick={add}>+ Layer</button>
      </div>

      <div style={{ overflow:"auto", border:"1px solid #e2e8f0", borderRadius:8 }}>
        <table style={table}>
          <thead><tr>
            <th style={head}>Name</th><th style={head}>Farbe</th><th style={head}>Sichtbar</th><th style={head}>Gesperrt</th><th style={head}>Aktion</th>
          </tr></thead>
          <tbody>
            {doc.layers.map(l=>(
              <tr key={l.id}>
                <td style={thtd}><input style={input} value={l.name} onChange={e=>upd(l.id,{name:e.target.value})}/></td>
                <td style={thtd}><input style={input} type="color" value={l.color} onChange={e=>upd(l.id,{color:e.target.value})}/></td>
                <td style={thtd}><input type="checkbox" checked={l.visible} onChange={e=>upd(l.id,{visible:e.target.checked})}/></td>
                <td style={thtd}><input type="checkbox" checked={l.locked} onChange={e=>upd(l.id,{locked:e.target.checked})}/></td>
                <td style={thtd}><button style={{...btn, color:"#b91c1c"}} onClick={()=>del(l.id)}>Löschen</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{fontSize:12, color:"#64748b", marginTop:8}}>Der aktive Layer im Zeichner ist der erste sichtbare & nicht gesperrte.</p>
    </div>
  );
}
