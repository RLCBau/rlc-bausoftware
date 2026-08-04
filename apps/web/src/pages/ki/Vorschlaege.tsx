import React from "react";
import { LV, LVPos } from "./store.lv";
import { useKiPropose } from "./useKiPropose";
import { useKiSuggest } from "./useKiSuggest";

const card: React.CSSProperties = { padding:"12px 16px", borderRadius:10, border:"1px solid var(--line)", background:"#fff" };
const inp: React.CSSProperties = { border:"1px solid var(--line)", borderRadius:8, padding:"8px 10px", fontSize:14 };
const th: React.CSSProperties = { textAlign:"left", padding:"8px 10px", borderBottom:"1px solid var(--line)", fontSize:13, whiteSpace:"nowrap" };
const td: React.CSSProperties = { padding:"6px 10px", borderBottom:"1px solid var(--line)", fontSize:13, verticalAlign:"middle" };

export default function Vorschlaege() {
  const [desc, setDesc] = React.useState("");
  const [items, setItems] = React.useState<(LVPos & {confidence?:number})[]>([]);
  const [busyAdd, setBusyAdd] = React.useState(false);

  const { propose, loading: genLoading } = useKiPropose();
  const { suggest, loading: priceLoading } = useKiSuggest();

  async function handleGenerate() {
    const out = await propose(desc);
    setItems(out);
  }

  async function priceAll() {
    const next: (LVPos & {confidence?:number})[] = [];
    for (const it of items) {
      const s = await suggest(it.kurztext, it.einheit);
      next.push({ ...it, preis: s.unitPrice, confidence: s.confidence });
    }
    setItems(next);
  }

  async function addToLV() {
    setBusyAdd(true);
    try {
      LV.bulkUpsert(items.map(i => ({ ...i, id: i.id || crypto.randomUUID() })));
      alert(`${items.length} Positionen in LV eingefügt.`);
    } finally {
      setBusyAdd(false);
    }
  }

  return (
    <div style={{ display:"grid", gap:12 }}>
      <div style={card}>
        <h1 style={{ margin:"0 0 10px" }}>Vorschläge (KI)</h1>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 220px", gap:12 }}>
          <textarea style={{ ...inp, minHeight:110 }} placeholder="Projektbeschreibung… (Ort, Gewerke, Leitungen/Trassen, Straßentyp, Tiefen, Materialien, Mengen grob…)"
                    value={desc} onChange={e=>setDesc(e.target.value)} />
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            <button className="btn" onClick={handleGenerate} disabled={!desc || genLoading}>
              {genLoading ? "Generiere…" : "Vorschläge generieren"}
            </button>
            <button className="btn" onClick={priceAll} disabled={items.length===0 || priceLoading}>
              {priceLoading ? "Bepreise…" : "KI-Preise berechnen"}
            </button>
            <button className="btn" onClick={addToLV} disabled={items.length===0 || busyAdd}>
              {busyAdd ? "Füge hinzu…" : "→ In LV übernehmen"}
            </button>
          </div>
        </div>
      </div>

      <div style={card}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr>
              <th style={th}>Kap.</th>
              <th style={th}>Pos-Nr</th>
              <th style={th}>Kurztext</th>
              <th style={th}>Einheit</th>
              <th style={th}>Menge</th>
              <th style={th}>E-Preis [€]</th>
              <th style={th}>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => {
              const kap = getChapter(r.posNr);
              return (
                <tr key={r.id}>
                  <td style={td}>{kap}</td>
                  <td style={td}><input style={{ ...inp, width:90 }} value={r.posNr||""} onChange={e=>setItems(p=>p.map(x=>x.id===r.id?{...x,posNr:e.target.value}:x))}/></td>
                  <td style={td}><input style={{ ...inp, width:"100%" }} value={r.kurztext} onChange={e=>setItems(p=>p.map(x=>x.id===r.id?{...x,kurztext:e.target.value}:x))}/></td>
                  <td style={td}><input style={{ ...inp, width:70 }} value={r.einheit} onChange={e=>setItems(p=>p.map(x=>x.id===r.id?{...x,einheit:e.target.value}:x))}/></td>
                  <td style={td}><input style={{ ...inp, width:90, textAlign:"right" }} type="number" value={r.menge||0} onChange={e=>setItems(p=>p.map(x=>x.id===r.id?{...x,menge:+e.target.value}:x))}/></td>
                  <td style={td}><input style={{ ...inp, width:100, textAlign:"right" }} type="number" value={r.preis ?? ""} onChange={e=>setItems(p=>p.map(x=>x.id===r.id?{...x,preis:+e.target.value}:x))}/></td>
                  <td style={td}>{r.confidence!=null ? Math.round(r.confidence*100)+"%" : "—"}</td>
                </tr>
              );
            })}
            {items.length===0 && <tr><td style={{ ...td, opacity:.6 }} colSpan={7}>Noch keine Vorschläge.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function getChapter(posNr?:string){ if(!posNr) return "—"; const m=posNr.match(/^(\d{2})/); return m?m[1]:"—"; }
