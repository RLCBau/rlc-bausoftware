import React from "react";
import {
  Doc, Layer, Entity, TextEnt, CircleEnt, V2
} from "../utils/cadTypesUtils"; // <— aggiorna se serve

export function Panel(props: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border:"1px solid #e6e6e6", borderRadius:8, background:"#ffffff" }}>
      <div style={{ padding:"6px 8px", borderBottom:"1px solid #eee", fontWeight:600, fontSize:12 }}>{props.title}</div>
      <div style={{ padding:8, display:"flex", flexDirection:"column", gap:6 }}>{props.children}</div>
    </div>
  );
}

type LeftPanelsProps = {
  doc: Doc;
  setDoc: React.Dispatch<React.SetStateAction<Doc>>;
  selected: Entity[];
  apply: (cmd: any) => void;
  undo: () => void;
  redo: () => void;
  cmdHistory: string[];

  snapsUi: React.ReactNode;
  filesUi: React.ReactNode;
  settingsUi: React.ReactNode;
};

export default function LeftPanels({
  doc, setDoc, selected, apply, undo, redo, cmdHistory, snapsUi, filesUi, settingsUi
}: LeftPanelsProps) {
  return (
    <div style={{ width:310, borderRight:"1px solid #eee", padding:"8px", display:"flex", flexDirection:"column", gap:8, background:"#fafafa" }}>
      {/* LAYERS */}
      <Panel title="Layers">
        <div style={{ display:"flex", gap:6, marginBottom:6 }}>
          <input placeholder="New layer name" id="newLayerName" style={{ flex:1, padding:"4px 6px", border:"1px solid #ddd", borderRadius:4 }}/>
          <button onClick={()=>{
            const el=document.getElementById("newLayerName") as HTMLInputElement;
            const name=(el.value||"").trim() || `L${doc.layers.length+1}`;
            const id=Math.random().toString(36).slice(2);
            const nl:Layer={id,name,color:"#333333",visible:true,locked:false,lineWidth:1};
            setDoc(d=>({...d,layers:[...d.layers,nl], currentLayerId:id})); el.value="";
          }}>＋</button>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:220, overflow:"auto" }}>
          {doc.layers.map(l => (
            <div key={l.id} style={{ display:"grid", gridTemplateColumns:"18px 18px 1fr 60px 18px 22px", alignItems:"center", gap:6, padding:"4px 6px", border:"1px solid #eaeaea", borderRadius:6, background: doc.currentLayerId===l.id ? "#fff" : "#f7f7f7" }}>
              <input type="color" value={l.color} onChange={(e)=>setDoc(d=>({...d,layers:d.layers.map(x=>x.id===l.id?{...x,color:e.target.value}:x)}))}/>
              <input type="checkbox" title="Visible" checked={l.visible} onChange={(e)=>setDoc(d=>({...d,layers:d.layers.map(x=>x.id===l.id?{...x,visible:e.target.checked}:x)}))}/>
              <input value={l.name} onChange={(e)=>setDoc(d=>({...d,layers:d.layers.map(x=>x.id===l.id?{...x,name:e.target.value}:x)}))} style={{ width:"100%", border:"none", background:"transparent" }}/>
              <select value={l.lineWidth} onChange={(e)=>setDoc(d=>({...d,layers:d.layers.map(x=>x.id===l.id?{...x,lineWidth:Number(e.target.value)}:x)}))}>
                {[0.5,1,1.5,2,3].map(w=><option key={w} value={w}>{w}px</option>)}
              </select>
              <input type="checkbox" title="Lock" checked={l.locked} onChange={(e)=>setDoc(d=>({...d,layers:d.layers.map(x=>x.id===l.id?{...x,locked:e.target.checked}:x)}))}/>
              <button title="Set current" onClick={()=>setDoc(d=>({...d,currentLayerId:l.id}))} style={{ fontSize:11, padding:"2px 4px" }}>●</button>
            </div>
          ))}
        </div>
      </Panel>

      {/* PROPERTIES */}
      <Panel title="Properties">
        {selected.length===0 ? (
          <div style={{ color:"#777" }}>Nessuna selezione</div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            <div style={{ fontSize:12, color:"#555" }}>{selected.length} entità</div>

            <label style={{ fontSize:12 }}>Layer:
              <select
                value={selected[0].layerId}
                onChange={(e)=>{
                  const layId=e.target.value;
                  for (const ent of selected) {
                    const before=JSON.parse(JSON.stringify(ent));
                    const after={...before, layerId:layId};
                    apply({ kind:"update", before, after });
                  }
                }}>
                {doc.layers.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>

            <label style={{ fontSize:12 }}>Color:
              <input
                type="color"
                value={selected[0].style.color}
                onChange={(e)=>{
                  for (const ent of selected) {
                    const before=JSON.parse(JSON.stringify(ent));
                    const after={...before, style:{...ent.style, color:e.target.value}};
                    apply({ kind:"update", before, after });
                  }
                }}/>
            </label>

            <label style={{ fontSize:12 }}>Line width:
              <select
                value={selected[0].style.lineWidth}
                onChange={(e)=>{
                  const lw=Number(e.target.value);
                  for (const ent of selected) {
                    const before=JSON.parse(JSON.stringify(ent));
                    const after={...before, style:{...ent.style, lineWidth:lw}};
                    apply({ kind:"update", before, after });
                  }
                }}>
                {[0.5,1,1.5,2,3].map(w=><option key={w} value={w}>{w}px</option>)}
              </select>
            </label>

            {/* TEXT props */}
            {selected[0].kind==="TEXT" && (()=> {
              const t = selected[0] as TextEnt;
              return (
                <>
                  <label style={{ fontSize:12 }}>Text:
                    <input
                      value={t.text}
                      onChange={(e)=>{
                        const val=e.target.value;
                        for (const ent of selected) if (ent.kind==="TEXT") {
                          const before=JSON.parse(JSON.stringify(ent));
                          const after={...before, text:val};
                          apply({ kind:"update", before, after });
                        }
                      }}/>
                  </label>
                  <label style={{ fontSize:12 }}>Height:
                    <input type="number" step={0.1}
                      value={t.height}
                      onChange={(e)=>{
                        const h=Number(e.target.value)||t.height;
                        for (const ent of selected) if (ent.kind==="TEXT") {
                          const before=JSON.parse(JSON.stringify(ent));
                          const after={...before, height:h};
                          apply({ kind:"update", before, after });
                        }
                      }}/>
                  </label>
                  <label style={{ fontSize:12 }}>Rotation:
                    <input type="number" step={1}
                      value={t.rotation||0}
                      onChange={(e)=>{
                        const r=Number(e.target.value)||0;
                        for (const ent of selected) if (ent.kind==="TEXT") {
                          const before=JSON.parse(JSON.stringify(ent));
                          const after={...before, rotation:r};
                          apply({ kind:"update", before, after });
                        }
                      }}/>
                  </label>
                </>
              );
            })()}

            {/* CIRCLE props */}
            {selected[0].kind==="CIRCLE" && (()=> {
              const c = selected[0] as CircleEnt;
              return (
                <label style={{ fontSize:12 }}>Radius:
                  <input type="number" step={0.01}
                    value={c.r}
                    onChange={(e)=>{
                      const r=Math.max(0.0001, Number(e.target.value)||c.r);
                      for (const ent of selected) if (ent.kind==="CIRCLE") {
                        const before=JSON.parse(JSON.stringify(ent));
                        const after={...before, r};
                        apply({ kind:"update", before, after });
                      }
                    }}/>
                </label>
              );
            })()}
          </div>
        )}
      </Panel>

      {/* SNAPS & SETTINGS (from parent) */}
      <Panel title="Snaps & Settings">
        {settingsUi}
        {snapsUi}
      </Panel>

      {/* BLOCKS */}
      <Panel title="Blocks">
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          <input id="blkName" placeholder="Nome blocco" style={{ flex:1, padding:"4px 6px", border:"1px solid #ddd", borderRadius:4 }}/>
          <button onClick={()=>{
            const inp=document.getElementById("blkName") as HTMLInputElement;
            const name=(inp.value||"").trim(); if(!name){ alert("Nome blocco vuoto"); return; }
            if (!doc.blocks) doc.blocks = {};
            const sel = selected;
            if(sel.length===0){ alert("Nessuna selezione"); return; }
            const pts: V2[] = [];
            sel.forEach(e=>{
              if(e.kind==="LINE"){ pts.push(e.a,e.b); }
              else if(e.kind==="RECT"){ pts.push(e.a,e.b); }
              else if(e.kind==="CIRCLE"){ pts.push(e.c); }
              else if(e.kind==="POLYLINE"){ pts.push(...e.pts); }
            });
            const base = pts.length? {
              x: pts.reduce((a,p)=>a+p.x,0)/pts.length,
              y: pts.reduce((a,p)=>a+p.y,0)/pts.length
            } : {x:0,y:0};
            const lib = { ...(doc.blocks||{}) , [name]: { base, ents: sel.map(e=>JSON.parse(JSON.stringify(e))) } };
            setDoc({ ...doc, blocks: lib });
            inp.value=""; alert("Blocco salvato");
          }}>Crea</button>
        </div>

        <div style={{ display:"flex", gap:6, alignItems:"center", marginTop:6 }}>
          <select id="blkPick" style={{ flex:1 }}>
            {Object.keys(doc.blocks||{}).map(k=><option key={k} value={k}>{k}</option>)}
          </select>
          <button onClick={()=>{
            const sel=(document.getElementById("blkPick") as HTMLSelectElement)?.value;
            if(!sel){ alert("Nessun blocco"); return; }
            const ev=new CustomEvent("rlc-insert-block",{ detail:{ name: sel }});
            window.dispatchEvent(ev);
          }}>Inserisci</button>
        </div>
      </Panel>

      {/* HISTORY */}
      <Panel title="History">
        <div style={{ maxHeight:120, overflow:"auto", fontFamily:"monospace", fontSize:12 }}>
          {cmdHistory.map((h,i)=><div key={i}>{"> "+h}</div>)}
        </div>
        <div style={{ display:"flex", gap:6, marginTop:6 }}>
          <button onClick={undo}>Undo</button>
          <button onClick={redo}>Redo</button>
        </div>
      </Panel>

      {/* FILES */}
      <Panel title="Files">{filesUi}</Panel>
    </div>
  );
}
