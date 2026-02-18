import React, { useMemo, useState } from "react";

const shell = { maxWidth: 1260, margin:"0 auto", padding:"12px 16px 40px", fontFamily:"Inter, system-ui, Arial", color:"#0f172a" } as const;
const toolbar = { display:"flex", gap:8, alignItems:"center", marginBottom:10, flexWrap:"wrap" } as const;
const btn = { padding:"6px 10px", border:"1px solid #cbd5e1", background:"#fff", borderRadius:6, fontSize:13, cursor:"pointer" } as const;
const table = { width:"100%", borderCollapse:"collapse", fontSize:13 } as const;
const thtd = { border:"1px solid #e2e8f0", padding:"6px 8px", verticalAlign:"middle" } as const;
const head = { ...thtd, background:"#f8fafc", fontWeight:600, textAlign:"left" as const } as const;

type Pos = { position:string; kurztext:string; einheit:string; menge:number; ep:number; betrag:number; };

function load(proj:string, key:"A"|"B"): Pos[] {
  try { const raw = localStorage.getItem(`VERGL:${proj}:${key}`); if(!raw) return []; return JSON.parse(raw) as Pos[]; }
  catch { return []; }
}

export default function Versionsvergleich() {
  const [projekt, setProjekt] = useState("PROJ-ANG-001");
  const [A, setA] = useState<Pos[]>(load(projekt,"A"));
  const [B, setB] = useState<Pos[]>(load(projekt,"B"));

  const diff = useMemo(()=>{
    const mapA = new Map(A.map(p=>[p.position,p]));
    const mapB = new Map(B.map(p=>[p.position,p]));
    const keys = Array.from(new Set([...mapA.keys(),...mapB.keys()])).sort();
    return keys.map(k=>{
      const a = mapA.get(k); const b = mapB.get(k);
      return {
        position: k,
        kurztext: (a?.kurztext || b?.kurztext || ""),
        einheit: a?.einheit || b?.einheit || "",
        betragA: a?.betrag || 0,
        betragB: b?.betrag || 0,
        delta: (b?.betrag||0) - (a?.betrag||0),
      };
    });
  },[A,B]);

  const sumA = A.reduce((s,p)=>s+p.betrag,0);
  const sumB = B.reduce((s,p)=>s+p.betrag,0);
  const fmt = (n:number)=> new Intl.NumberFormat("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2}).format(n||0);

  const importCsv = (which:"A"|"B", f:File) => {
    const rd = new FileReader();
    rd.onload = () => {
      const text = String(rd.result||"");
      const lines = text.split(/\r?\n/).filter(Boolean);
      // Position;Kurztext;ME;Menge;EP;Betrag
      const rows = lines.slice(1).map(l=>l.split(";").map(s=>s.replace(/^"|"$/g,"")));
      const arr: Pos[] = rows.map(c=>({ position:c[0], kurztext:c[1], einheit:c[2], menge:Number(c[3]||0), ep:Number(c[4]||0), betrag:Number(c[5]||0) }));
      localStorage.setItem(`VERGL:${projekt}:${which}`, JSON.stringify(arr));
      which==="A"?setA(arr):setB(arr);
    };
    rd.readAsText(f,"utf-8");
  };

  return (
    <div style={shell}>
      <h2 style={{ margin:"4px 0 12px", fontSize:20, fontWeight:700 }}>Versionsvergleich</h2>
      <div style={toolbar}>
        <input value={projekt} onChange={e=>setProjekt(e.target.value)} style={{ border:"1px solid #cbd5e1", borderRadius:6, padding:"6px 8px", width:220 }} />
        <label style={btn}>Import A (CSV)<input type="file" accept=".csv,text/csv" onChange={e=>{const f=e.target.files?.[0]; if(f) importCsv("A",f); e.currentTarget.value="";}} style={{display:"none"}}/></label>
        <label style={btn}>Import B (CSV)<input type="file" accept=".csv,text/csv" onChange={e=>{const f=e.target.files?.[0]; if(f) importCsv("B",f); e.currentTarget.value="";}} style={{display:"none"}}/></label>
      </div>

      <div style={{ overflow:"auto", border:"1px solid #e2e8f0", borderRadius:8 }}>
        <table style={table}>
          <thead><tr>
            <th style={head}>Pos</th><th style={head}>Kurztext</th><th style={head}>ME</th>
            <th style={head}>Betrag A</th><th style={head}>Betrag B</th><th style={head}>Delta</th>
          </tr></thead>
          <tbody>
            {diff.map((d,i)=>(
              <tr key={i}>
                <td style={thtd}>{d.position}</td>
                <td style={thtd}>{d.kurztext}</td>
                <td style={thtd}>{d.einheit}</td>
                <td style={thtd}>{fmt(d.betragA)}</td>
                <td style={thtd}>{fmt(d.betragB)}</td>
                <td style={{...thtd, color: d.delta>=0?"#065f46":"#b91c1c"}}>{fmt(d.delta)}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={3} style={{...thtd, textAlign:"right" as const}}><b>Summe</b></td>
              <td style={thtd}><b>{fmt(sumA)}</b></td>
              <td style={thtd}><b>{fmt(sumB)}</b></td>
              <td style={{...thtd, color: (sumB-sumA)>=0?"#065f46":"#b91c1c"}}><b>{fmt(sumB - sumA)}</b></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
