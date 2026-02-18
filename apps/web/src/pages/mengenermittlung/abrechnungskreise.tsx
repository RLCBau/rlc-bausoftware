import React, { useMemo, useState } from "react";
import { evaluateExpression } from "../../lib/formulas";
import { AufmassZeile } from "../../lib/types";

const shell: React.CSSProperties = { maxWidth: 1260, margin:"0 auto", padding:"12px 16px 40px", fontFamily:"Inter, system-ui, Arial, Helvetica, sans-serif", color:"#0f172a" };
const toolbar: React.CSSProperties = { display:"flex", gap:8, alignItems:"center", marginBottom:10, flexWrap:"wrap" };
const textInput: React.CSSProperties = { width: 220, border:"1px solid #cbd5e1", borderRadius:6, padding:"6px 8px" };
const table: React.CSSProperties = { width:"100%", borderCollapse:"collapse", fontSize:13 };
const thtd: React.CSSProperties = { border:"1px solid #e2e8f0", padding:"6px 8px", verticalAlign:"middle" };
const head: React.CSSProperties = { ...thtd, background:"#f8fafc", fontWeight:600, textAlign:"left", position:"sticky", top:0, zIndex:1 };

const fmt = (n:number)=> new Intl.NumberFormat("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2}).format(n||0);

// Demo: attribuiamo un "Kreis" leggendo un tag in kurztext: "[AK:Kreis-1]" ecc.
const DEMO_POS: AufmassZeile[] = [
  { id:"1", posNr:"100.001", kurztext:"[AK:K1] Graben ausheben", einheit:"m³", ep:16, variablen:{L:12,B:0.7,H:1.2}, formel:"=L*B*H", menge:0, betrag:0 },
  { id:"2", posNr:"100.002", kurztext:"[AK:K1] Rohre verlegen", einheit:"m", ep:24.5, variablen:{L:12}, formel:"=L", menge:0, betrag:0 },
  { id:"3", posNr:"200.100", kurztext:"[AK:K2] Asphaltdeckschicht", einheit:"m²", ep:39.9, variablen:{L:22,B:3}, formel:"=L*B", menge:0, betrag:0 },
];

export default function Abrechnungskreise() {
  const [filter, setFilter] = useState("");

  const grouped = useMemo(()=>{
    const map = new Map<string, AufmassZeile[]>();
    for (const p of DEMO_POS) {
      const m = p.kurztext.match(/\[AK:(.+?)\]/);
      const key = m?.[1] ?? "Unzugeordnet";
      if (!map.has(key)) map.set(key, []);
      // calcola
      const menge = evaluateExpression(p.formel, p.variablen as any);
      const betrag = menge * p.ep;
      map.get(key)!.push({...p, menge, betrag});
    }
    // filtro
    const arr = [...map.entries()].filter(e => e[0].toLowerCase().includes(filter.trim().toLowerCase()));
    return arr.map(([kreis, pos]) => ({
      kreis,
      pos,
      sumMenge: pos.reduce((a,b)=>a+(b.menge||0),0),
      sumBetrag: pos.reduce((a,b)=>a+(b.betrag||0),0),
    }));
  }, [filter]);

  const total = useMemo(()=> grouped.reduce((a,b)=>a+b.sumBetrag,0),[grouped]);

  return (
    <div style={shell}>
      <h2 style={{ margin:"4px 0 12px", fontSize:20, fontWeight:700 }}>Abrechnungskreise</h2>
      <div style={toolbar}>
        <input placeholder="Filter Kreis…" style={textInput} value={filter} onChange={(e)=>setFilter(e.target.value)} />
      </div>

      {grouped.map(g=>(
        <div key={g.kreis} style={{ border:"1px solid #e2e8f0", borderRadius:8, marginBottom:14 }}>
          <div style={{ padding:"8px 10px", background:"#f8fafc", fontWeight:700 }}>{g.kreis}</div>
          <div style={{ overflow:"auto" }}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={head}>Pos-Nr</th><th style={head}>Kurztext</th><th style={head}>ME</th><th style={head}>EP</th>
                  <th style={head}>Formel</th><th style={head}>Menge</th><th style={head}>Betrag</th>
                </tr>
              </thead>
              <tbody>
                {g.pos.map(p=>(
                  <tr key={p.id}>
                    <td style={thtd}>{p.posNr}</td><td style={thtd}>{p.kurztext}</td><td style={thtd}>{p.einheit}</td>
                    <td style={thtd}>{fmt(p.ep)}</td><td style={thtd}>{p.formel}</td>
                    <td style={thtd}>{fmt(p.menge)}</td><td style={thtd}>{fmt(p.betrag)}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={5} style={{...thtd, textAlign:"right" as const}}><b>Summe Kreis</b></td>
                  <td style={thtd}><b>{fmt(g.sumMenge)}</b></td>
                  <td style={thtd}><b>{fmt(g.sumBetrag)}</b></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div style={{ textAlign:"right", fontWeight:700 }}>Gesamtsumme: {fmt(total)} €</div>
    </div>
  );
}
