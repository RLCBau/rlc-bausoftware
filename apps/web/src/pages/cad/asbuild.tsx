import React, { useMemo } from "react";
import { loadDoc } from "../../lib/cad/store";
import { LineEntity, PolylineEntity } from "../../lib/cad/types";

const shell = { maxWidth: 900, margin:"0 auto", padding:"12px 16px 40px", fontFamily:"Inter, system-ui, Arial", color:"#0f172a" } as const;
const table = { width:"100%", borderCollapse:"collapse", fontSize:13 } as const;
const thtd = { border:"1px solid #e2e8f0", padding:"6px 8px", verticalAlign:"middle" } as const;
const head = { ...thtd, background:"#f8fafc", fontWeight:600, textAlign:"left" as const } as const;

export default function AsBuilt() {
  const doc = loadDoc();

  const res = useMemo(()=>{
    const soll = doc.entities.filter(e => doc.layers.find(l=>l.id===e.layerId)?.name.toLowerCase()==="0");
    const ist  = doc.entities.filter(e => doc.layers.find(l=>l.id===e.layerId)?.name.toLowerCase()==="bestand");

    const len = (e: LineEntity | PolylineEntity) => {
      if (e.type === "line") return Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y);
      let s = 0; for (let i=0;i<e.points.length-1;i++) s += Math.hypot(e.points[i+1].x-e.points[i].x, e.points[i+1].y-e.points[i].y);
      return s;
    };

    const sumSoll = soll.reduce((a,e)=> a + (e.type==="point"?0:len(e as any)), 0);
    const sumIst  = ist.reduce((a,e)=> a + (e.type==="point"?0:len(e as any)), 0);

    return { sumSoll, sumIst, delta: sumIst - sumSoll };
  }, [doc]);

  const fmt = (n:number)=> new Intl.NumberFormat("de-DE",{maximumFractionDigits:2}).format(n||0);

  return (
    <div style={shell}>
      <h2 style={{ margin:"4px 0 12px", fontSize:20, fontWeight:700 }}>As-Built – Soll/Ist Vergleich</h2>
      <table style={table}>
        <thead><tr><th style={head}>Kennzahl</th><th style={head}>Wert (m)</th></tr></thead>
        <tbody>
          <tr><td style={thtd}>Soll (Layer „0“)</td><td style={thtd}>{fmt(res.sumSoll)}</td></tr>
          <tr><td style={thtd}>Ist (Layer „Bestand“)</td><td style={thtd}>{fmt(res.sumIst)}</td></tr>
          <tr><td style={{...thtd, fontWeight:700}}>Δ Ist-Soll</td><td style={{...thtd, fontWeight:700, color: res.delta>=0?"#065f46":"#b91c1c"}}>{fmt(res.delta)}</td></tr>
        </tbody>
      </table>
      <p style={{fontSize:12, color:"#64748b", marginTop:8}}>Hinweis: Detaillierte Geometrie-Differenzen (Offset/Stations) folgen.</p>
    </div>
  );
}

