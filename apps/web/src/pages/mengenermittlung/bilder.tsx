import React, { useState } from "react";

const shell: React.CSSProperties = { maxWidth: 1260, margin:"0 auto", padding:"12px 16px 40px",
  fontFamily:"Inter, system-ui, Arial, Helvetica, sans-serif", color:"#0f172a" };
const grid: React.CSSProperties = { display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(180px,1fr))", gap:12 };
const card: React.CSSProperties = { border:"1px solid #e2e8f0", borderRadius:8, overflow:"hidden", background:"#fff" };
const imgStyle: React.CSSProperties = { width:"100%", height:140, objectFit:"cover" };
const textInput: React.CSSProperties = { width:"100%", border:"1px solid #cbd5e1", borderRadius:6, padding:"6px 8px" };
const btn: React.CSSProperties = { padding:"6px 10px", border:"1px solid #cbd5e1", background:"#fff", borderRadius:6, fontSize:13, cursor:"pointer" };

type Bild = { id:string; url:string; posNr?:string; kommentar?:string };

export default function BilderZumAufmass() {
  const [bilder, setBilder] = useState<Bild[]>([]);
  const [pos, setPos] = useState("");
  const [kom, setKom] = useState("");

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    setBilder((p)=>[...p, { id:Math.random().toString(36).slice(2,9), url, posNr:pos, kommentar:kom }]);
    setKom(""); setPos("");
    e.currentTarget.value = "";
  };

  return (
    <div style={shell}>
      <h2 style={{ margin:"4px 0 12px", fontSize:20, fontWeight:700 }}>Bilder zum Aufmaß</h2>

      <div style={{ display:"flex", gap:8, alignItems:"center", margin:"0 0 10px" }}>
        <input placeholder="Pos-Nr (optional)" style={{...textInput, width:150}} value={pos} onChange={(e)=>setPos(e.target.value)} />
        <input placeholder="Kommentar (optional)" style={{...textInput, width:280}} value={kom} onChange={(e)=>setKom(e.target.value)} />
        <label style={btn}>
          Bild hinzufügen
          <input type="file" accept="image/*" onChange={onFile} style={{ display:"none" }} />
        </label>
      </div>

      <div style={grid}>
        {bilder.map(b=>(
          <div key={b.id} style={card}>
            <img src={b.url} alt="" style={imgStyle}/>
            <div style={{ padding:8, fontSize:12 }}>
              <div><b>Pos:</b> {b.posNr ?? "-"}</div>
              <div style={{ color:"#64748b" }}>{b.kommentar}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
