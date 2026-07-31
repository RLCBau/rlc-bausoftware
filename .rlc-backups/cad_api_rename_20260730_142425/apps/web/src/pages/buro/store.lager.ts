import { StockItem, PurchaseOrder } from "./types";

const KEY_ITEMS="rlc-lager-items";
const KEY_POS  ="rlc-lager-pos";

const loadI=():StockItem[] => JSON.parse(localStorage.getItem(KEY_ITEMS)||"[]");
const saveI=(a:StockItem[]) => localStorage.setItem(KEY_ITEMS,JSON.stringify(a));
const loadP=():PurchaseOrder[] => JSON.parse(localStorage.getItem(KEY_POS)||"[]");
const saveP=(a:PurchaseOrder[]) => localStorage.setItem(KEY_POS,JSON.stringify(a));

export const LagerDB={
  // Items
  listItems():StockItem[]{ return loadI().sort((a,b)=>(a.name||"").localeCompare(b.name||"")); },
  createItem():StockItem{
    const it:StockItem={ id:crypto.randomUUID(), name:"", sku:"", location:"", price:0, stock:0, minStock:0, updatedAt:Date.now() };
    const all=loadI(); all.push(it); saveI(all); return it;
  },
  upsertItem(it:StockItem){ const all=loadI(); const i=all.findIndex(x=>x.id===it.id); if(i>=0) all[i]=it; else all.push(it); saveI(all); },
  removeItem(id:string){ saveI(loadI().filter(x=>x.id!==id)); },
  move(id:string,dir:"IN"|"OUT",qty:number){ const all=loadI(); const it=all.find(x=>x.id===id); if(!it) return; it.stock=(it.stock||0)+(dir==="IN"?qty:-qty); it.updatedAt=Date.now(); saveI(all); },

  exportCSV(rows:StockItem[]){
    const h="id;name;sku;location;price;stock;minStock";
    const b=rows.map(r=>[r.id, esc(r.name||""), esc(r.sku||""), esc(r.location||""), r.price??0, r.stock??0, r.minStock??0].join(";")).join("\n");
    return h+"\n"+b;
  },

  // POs
  listPOs():PurchaseOrder[]{ return loadP().sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0)); },
  createPO():PurchaseOrder{
    const p:PurchaseOrder={ id:crypto.randomUUID(), number:`PO-${Date.now()}`, vendor:"", status:"Entwurf", deliveryDate:"", lines:[], updatedAt:Date.now() };
    const all=loadP(); all.push(p); saveP(all); return p;
  },
  upsertPO(po:PurchaseOrder){ const all=loadP(); const i=all.findIndex(x=>x.id===po.id); if(i>=0) all[i]=po; else all.push(po); saveP(all); },
  removePO(id:string){ saveP(loadP().filter(x=>x.id!==id)); },
};

function esc(s:string){return (s||"").replace(/;/g,",");}
