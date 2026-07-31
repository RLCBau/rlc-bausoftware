import React from "react";
import { LagerDB } from "./store.lager";
import { StockItem, PurchaseOrder, PoLine } from "./types";

const inp:React.CSSProperties={border:"1px solid var(--line)",borderRadius:6,padding:"6px 8px",fontSize:13};
const lbl:React.CSSProperties={fontSize:12,opacity:.8};
const th:React.CSSProperties={textAlign:"left",padding:"8px 10px",borderBottom:"1px solid var(--line)",fontSize:13,whiteSpace:"nowrap"};
const td:React.CSSProperties={padding:"6px 10px",borderBottom:"1px solid var(--line)",fontSize:13,verticalAlign:"middle"};

export default function Lager(){
  const [items,setItems]=React.useState<StockItem[]>(LagerDB.listItems());
  const [pos,setPOs]=React.useState<PurchaseOrder[]>(LagerDB.listPOs());
  const [sel,setSel]=React.useState<StockItem|null>(items[0]??null);
  const [selPO,setSelPO]=React.useState<PurchaseOrder|null>(pos[0]??null);
  const [q,setQ]=React.useState(""); const [onlyLow,setOnlyLow]=React.useState(false);

  const refresh=()=>{ setItems(LagerDB.listItems()); setPOs(LagerDB.listPOs()); };

  const filtered=()=>items.filter(i=>{
    const s=(i.name+" "+(i.sku??"")+" "+(i.location??"")).toLowerCase();
    const okQ=!q||s.includes(q.toLowerCase());
    const okL=!onlyLow || ((i.stock??0) <= (i.minStock??0));
    return okQ && okL;
  });

  // ==== Articoli ====
  const addItem=()=>{ const it=LagerDB.createItem(); refresh(); setSel(it); };
  const delItem=()=>{ if(!sel) return; if(!confirm("Artikel löschen?")) return; LagerDB.removeItem(sel.id); refresh(); setSel(LagerDB.listItems()[0]??null); };
  const upItem=(p:Partial<StockItem>)=>{
    if(!sel) return; const next={...sel,...p,updatedAt:Date.now()}; setSel(next); LagerDB.upsertItem(next); setItems(LagerDB.listItems());
  };
  const receive=(qty:number)=>{ if(!sel||!qty) return; LagerDB.move(sel.id,"IN",qty); refresh(); };
  const issue=(qty:number)=>{ if(!sel||!qty) return; LagerDB.move(sel.id,"OUT",qty); refresh(); };

  // ==== Ordini d'acquisto (PO) ====
  const addPO=()=>{ const p=LagerDB.createPO(); refresh(); setSelPO(p); };
  const delPO=()=>{ if(!selPO) return; if(!confirm("Bestellung löschen?")) return; LagerDB.removePO(selPO.id); refresh(); setSelPO(LagerDB.listPOs()[0]??null); };
  const upPO=(p:Partial<PurchaseOrder>)=>{
    if(!selPO) return; const next={...selPO,...p,updatedAt:Date.now()}; setSelPO(next); LagerDB.upsertPO(next); setPOs(LagerDB.listPOs());
  };
  const addLine=(item?:StockItem)=>{
    if(!selPO) return; const l:PoLine={id:crypto.randomUUID(), sku:item?.sku??"", name:item?.name??"", qty:1, price:0 }; 
    upPO({ lines:[l,...(selPO.lines||[])] });
  };
  const delLine=(id:string)=>{ if(!selPO) return; upPO({ lines:(selPO.lines||[]).filter(x=>x.id!==id) }); };
  const totalPO=(po:PurchaseOrder)=> (po.lines||[]).reduce((s,l)=>s+(l.qty*l.price),0);

  return (
    <div style={{display:"grid",gridTemplateRows:"auto 1fr auto",gap:10,padding:10}}>
      {/* Toolbar articoli */}
      <div className="card" style={{padding:"8px 10px",display:"flex",gap:8,alignItems:"center"}}>
        <button className="btn" onClick={addItem}>+ Artikel</button>
        <button className="btn" onClick={delItem} disabled={!sel}>Löschen</button>
        <div style={{flex:1}}/>
        <input placeholder="Suche Name / SKU / Lager…" value={q} onChange={e=>setQ(e.target.value)} style={{...inp,width:260}}/>
        <label style={{display:"flex",alignItems:"center",gap:6}}>
          <input type="checkbox" checked={onlyLow} onChange={e=>setOnlyLow(e.target.checked)}/> <span style={{fontSize:13}}>nur Unterbestand</span>
        </label>
        <button className="btn" onClick={()=>download("text/csv;charset=utf-8","lager.csv",LagerDB.exportCSV(filtered()))}>Export CSV</button>
      </div>

      {/* Griglia: Articoli | Editor + PO */}
      <div style={{display:"grid",gridTemplateColumns:"minmax(520px,48vw) 1fr",gap:10,minHeight:"60vh"}}>
        {/* LISTA ARTICOLI */}
        <div className="card" style={{padding:0,overflow:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr>
              <th style={th}>Name</th><th style={th}>SKU</th><th style={th}>Lager</th>
              <th style={th}>Bestand</th><th style={th}>min</th><th style={th}>Preis</th>
            </tr></thead>
            <tbody>
              {filtered().map(i=>{
                const low=(i.stock??0) <= (i.minStock??0);
                return (
                  <tr key={i.id} onClick={()=>setSel(i)} style={{cursor:"pointer",background:sel?.id===i.id?"#f1f5ff":undefined}}>
                    <td style={td}><b>{i.name}</b></td>
                    <td style={td}>{i.sku||"—"}</td>
                    <td style={td}>{i.location||"—"}</td>
                    <td style={{...td,color:low?"#c03":undefined}}>{i.stock??0}</td>
                    <td style={td}>{i.minStock??0}</td>
                    <td style={td}>{i.price?`${i.price.toFixed(2)} €`:"—"}</td>
                  </tr>
                );
              })}
              {filtered().length===0 && <tr><td style={{...td,opacity:.6}} colSpan={6}>Keine Artikel.</td></tr>}
            </tbody>
          </table>
        </div>

        {/* EDITOR ARTICOLO + MOVIMENTI */}
        <div className="card" style={{padding:12}}>
          {!sel? <div style={{opacity:.7}}>Links Artikel wählen oder neu anlegen.</div> : (
            <div style={{display:"grid",gridTemplateColumns:"120px 1fr 120px 1fr",gap:10}}>
              <label style={lbl}>Name</label>
              <input style={inp} value={sel.name} onChange={e=>upItem({name:e.target.value})}/>
              <label style={lbl}>SKU</label>
              <input style={inp} value={sel.sku??""} onChange={e=>upItem({sku:e.target.value})}/>
              <label style={lbl}>Lagerort</label>
              <input style={inp} value={sel.location??""} onChange={e=>upItem({location:e.target.value})}/>
              <label style={lbl}>Preis (€)</label>
              <input type="number" step="0.01" style={inp} value={sel.price??0} onChange={e=>upItem({price:+e.target.value})}/>
              <label style={lbl}>Bestand</label>
              <input type="number" style={inp} value={sel.stock??0} onChange={e=>upItem({stock:+e.target.value})}/>
              <label style={lbl}>Mindestbestand</label>
              <input type="number" style={inp} value={sel.minStock??0} onChange={e=>upItem({minStock:+e.target.value})}/>
              <div style={{gridColumn:"1 / -1",display:"flex",gap:8,justifyContent:"flex-end"}}>
                <button className="btn" onClick={()=>receive(Number(prompt("Eingang Menge:","1"))||0)}>+ Eingang</button>
                <button className="btn" onClick={()=>issue(Number(prompt("Ausgang Menge:","1"))||0)}>− Ausgang</button>
                <button className="btn" onClick={()=>{ if(!sel) return; addLine(sel); }}>In Bestellung übernehmen</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ORDINI (PO) */}
      <div className="card" style={{padding:"8px 10px"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
          <div style={{fontWeight:700}}>Bestellungen</div>
          <div style={{flex:1}}/>
          <button className="btn" onClick={addPO}>+ Bestellung</button>
          <button className="btn" onClick={delPO} disabled={!selPO}>Löschen</button>
        </div>
        {!selPO? <div style={{opacity:.7}}>Keine Bestellung ausgewählt.</div> : (
          <div style={{display:"grid",gridTemplateColumns:"120px 1fr 120px 1fr 120px 1fr",gap:10}}>
            <label style={lbl}>Nummer</label>
            <input style={inp} value={selPO.number} onChange={e=>upPO({number:e.target.value})}/>
            <label style={lbl}>Lieferant</label>
            <input style={inp} value={selPO.vendor??""} onChange={e=>upPO({vendor:e.target.value})}/>
            <label style={lbl}>Status</label>
            <select style={inp} value={selPO.status??"Entwurf"} onChange={e=>upPO({status:e.target.value as any})}>
              <option>Entwurf</option><option>Bestellt</option><option>Geliefert</option><option>Storniert</option>
            </select>
            <label style={lbl}>Lieferdatum</label>
            <input type="date" style={inp} value={toDateInput(selPO.deliveryDate)} onChange={e=>upPO({deliveryDate:new Date(e.target.value).toISOString()})}/>

            <div style={{gridColumn:"1 / -1"}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr><th style={th}>SKU</th><th style={th}>Bezeichnung</th><th style={th}>Menge</th><th style={th}>Preis</th><th style={th}>Summe</th><th style={th}></th></tr></thead>
                <tbody>
                  {(selPO.lines||[]).map(l=>(
                    <tr key={l.id}>
                      <td style={td}><input style={{...inp,width:"100%"}} value={l.sku} onChange={e=>upPO({lines:(selPO.lines||[]).map(x=>x.id===l.id?{...l,sku:e.target.value}:x)})}/></td>
                      <td style={td}><input style={{...inp,width:"100%"}} value={l.name} onChange={e=>upPO({lines:(selPO.lines||[]).map(x=>x.id===l.id?{...l,name:e.target.value}:x)})}/></td>
                      <td style={td}><input type="number" style={inp} value={l.qty} onChange={e=>upPO({lines:(selPO.lines||[]).map(x=>x.id===l.id?{...l,qty:+e.target.value}:x)})}/></td>
                      <td style={td}><input type="number" step="0.01" style={inp} value={l.price} onChange={e=>upPO({lines:(selPO.lines||[]).map(x=>x.id===l.id?{...l,price:+e.target.value}:x)})}/></td>
                      <td style={td}>{(l.qty*l.price).toFixed(2)} €</td>
                      <td style={{...td,whiteSpace:"nowrap"}}><button className="btn" onClick={()=>delLine(l.id)}>Entfernen</button></td>
                    </tr>
                  ))}
                  {(selPO.lines||[]).length===0 && <tr><td style={{...td,opacity:.6}} colSpan={6}>Keine Positionen.</td></tr>}
                  {(selPO.lines||[]).length>0 && (
                    <tr>
                      <td style={td} colSpan={4}><b>Gesamt</b></td>
                      <td style={{...td,fontWeight:700}}>{totalPO(selPO).toFixed(2)} €</td>
                      <td style={td}></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function toDateInput(iso?:string){ if(!iso) return ""; const d=new Date(iso); const p=(n:number)=>n.toString().padStart(2,"0"); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; }
function download(type:string,name:string,data:string){ const b=new Blob([data],{type}); const a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download=name; a.click(); URL.revokeObjectURL(a.href); }
