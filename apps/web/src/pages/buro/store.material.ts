import { MaterialItem, MatMove, MatAttachment } from "./types";
const KEY="rlc-material-db";
const load=():MaterialItem[]=>JSON.parse(localStorage.getItem(KEY)||"[]");
const save=(a:MaterialItem[])=>localStorage.setItem(KEY,JSON.stringify(a));

export const MaterialDB={
  list():MaterialItem[]{ return load().sort((a,b)=>(a.name||"").localeCompare(b.name||"")); },
  create():MaterialItem{
    const it:MaterialItem={ id:crypto.randomUUID(), name:"", code:"", unit:"Stk", stock:0, minStock:0, priceNet:0,
      projectId:"", location:"", supplier:"", moves:[], attachments:[], updatedAt:Date.now() };
    const all=load(); all.push(it); save(all); return it;
  },
  upsert(it:MaterialItem){ const all=load(); const i=all.findIndex(x=>x.id===it.id); if(i>=0) all[i]=it; else all.push(it); save(all); },
  remove(id:string){ save(load().filter(x=>x.id!==id)); },

  addMove(itemId:string, m:MatMove){
    const all=load(); const it=all.find(x=>x.id===itemId); if(!it) return;
    it.moves=[m,...(it.moves||[])];
    it.stock = (it.stock||0) + (m.dir==="IN"?m.qty: -m.qty);
    it.updatedAt=Date.now(); save(all);
  },

  async attach(itemId:string, f:File){
    const dataURL=await new Promise<string>(res=>{ const r=new FileReader(); r.onload=()=>res(String(r.result)); r.readAsDataURL(f); });
    const a:MatAttachment={ id:crypto.randomUUID(), name:f.name, mime:f.type, size:f.size, dataURL };
    const all=load(); const it=all.find(x=>x.id===itemId); if(!it) return;
    it.attachments=[a,...(it.attachments||[])]; it.updatedAt=Date.now(); save(all);
  },

  exportCSV(rows:MaterialItem[]){
    const h="id;name;code;projectId;location;unit;stock;minStock;priceNet;supplier";
    const b=rows.map(r=>[
      r.id, esc(r.name||""), esc(r.code||""), r.projectId||"", esc(r.location||""), r.unit||"",
      r.stock??0, r.minStock??0, r.priceNet??0, esc(r.supplier||"")
    ].join(";")).join("\n");
    return h+"\n"+b;
  },
  importCSV(txt:string){
    const lines=txt.split(/\r?\n/).filter(Boolean); if(lines.length<=1) return 0;
    const rows=lines.slice(1).map(l=>l.split(";")); const all=load();
    for(const r of rows){
      const it:MaterialItem={ id:r[0]||crypto.randomUUID(), name:unesc(r[1]||""), code:unesc(r[2]||""), projectId:r[3]||"",
        location:unesc(r[4]||""), unit:r[5]||"", stock:+(r[6]||0), minStock:+(r[7]||0), priceNet:+(r[8]||0),
        supplier:unesc(r[9]||""), moves:[], attachments:[], updatedAt:Date.now() };
      const i=all.findIndex(x=>x.id===it.id); if(i>=0) all[i]=it; else all.push(it);
    }
    save(all); return rows.length;
  },
  exportJSON(){ return JSON.stringify(load()); },
  importJSON(txt:string){ const data:MaterialItem[]=JSON.parse(txt||"[]"); save(data); return data.length; }
};
function esc(s:string){return (s||"").replace(/;/g,",");}
function unesc(s:string){return s;}
