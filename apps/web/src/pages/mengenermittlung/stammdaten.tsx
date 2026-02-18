import React, { useEffect, useState } from "react";

const shell: React.CSSProperties = { maxWidth: 900, margin:"0 auto", padding:"12px 16px 40px",
  fontFamily:"Inter, system-ui, Arial, Helvetica, sans-serif", color:"#0f172a" };
const table: React.CSSProperties = { width:"100%", borderCollapse:"collapse", fontSize:13 };
const thtd: React.CSSProperties = { border:"1px solid #e2e8f0", padding:"6px 8px", verticalAlign:"middle" };
const head: React.CSSProperties = { ...thtd, background:"#f8fafc", fontWeight:600, textAlign:"left" };
const textInput: React.CSSProperties = { width:"100%", border:"1px solid #cbd5e1", borderRadius:6, padding:"6px 8px" };
const btn: React.CSSProperties = { padding:"6px 10px", border:"1px solid #cbd5e1", background:"#fff", borderRadius:6, fontSize:13, cursor:"pointer" };

type Regel = { id:string; einheit:string; standardFormel:string; beschreibung?:string; };
const KEY = "rlc.mengenermittlung.stammdaten";

export default function Stammdaten() {
  const [regeln, setRegeln] = useState<Regel[]>([]);

  useEffect(()=>{ try{
    const raw = localStorage.getItem(KEY); if (!raw) return;
    setRegeln(JSON.parse(raw) as Regel[]);
  }catch{} }, []);

  useEffect(()=>{ try{
    localStorage.setItem(KEY, JSON.stringify(regeln));
  }catch{} }, [regeln]);

  const add = ()=> setRegeln(p=>[...p,{ id:Math.random().toString(36).slice(2,9), einheit:"m", standardFormel:"=N", beschreibung:"" }]);
  const del = (id:string)=> setRegeln(p=>p.filter(x=>x.id!==id));
  const upd = (id:string, patch: Partial<Regel>)=> setRegeln(p=>p.map(x=>x.id===id?{...x,...patch}:x));

  return (
    <div style={shell}>
      <h2 style={{ margin:"4px 0 12px", fontSize:20, fontWeight:700 }}>Stammdaten – Standardformeln</h2>
      <div style={{ marginBottom:10 }}><button style={btn} onClick={add}>+ Regel</button></div>

      <div style={{ overflow:"auto", border:"1px solid #e2e8f0", borderRadius:8 }}>
        <table style={table}>
          <thead>
            <tr><th style={head}>Einheit</th><th style={head}>Standard-Formel</th><th style={head}>Beschreibung</th><th style={head}>Aktion</th></tr>
          </thead>
          <tbody>
            {regeln.map(r=>(
              <tr key={r.id}>
                <td style={thtd}><input style={textInput} value={r.einheit} onChange={(e)=>upd(r.id,{einheit:e.target.value})}/></td>
                <td style={thtd}><input style={textInput} value={r.standardFormel} onChange={(e)=>upd(r.id,{standardFormel:e.target.value})}/></td>
                <td style={thtd}><input style={textInput} value={r.beschreibung||""} onChange={(e)=>upd(r.id,{beschreibung:e.target.value})}/></td>
                <td style={thtd}><button style={{...btn,color:"#b91c1c"}} onClick={()=>del(r.id)}>Löschen</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize:12, color:"#64748b", marginTop:8 }}>
        Diese Regeln können vom Editor genutzt werden, um bei neuen Positionen je nach Einheit eine
        Start-Formel vorzuschlagen (z. B. <code>m² → =L*B</code>, <code>m³ → =L*B*H</code>).
      </p>
    </div>
  );
}
