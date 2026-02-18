import { HandoverDoc, HandoverAttachment } from "./types";

const KEY="rlc-uebergabe-db";
const load=():HandoverDoc[]=>JSON.parse(localStorage.getItem(KEY)||"[]");
const save=(a:HandoverDoc[])=>localStorage.setItem(KEY,JSON.stringify(a));

export const UebergabeDB={
  list():HandoverDoc[]{ return load().sort((a,b)=> (a.updatedAt||0) > (b.updatedAt||0) ? -1:1 ); },
  create():HandoverDoc{
    const d:HandoverDoc={ id:crypto.randomUUID(), title:"Abnahme", projectId:"", client:"", address:"", date:new Date().toISOString(),
      status:"Entwurf", checklist:[], signs:{}, attachments:[], updatedAt:Date.now() };
    const all=load(); all.push(d); save(all); return d;
  },
  upsert(d:HandoverDoc){ const all=load(); const i=all.findIndex(x=>x.id===d.id); if(i>=0) all[i]=d; else all.push(d); save(all); },
  remove(id:string){ save(load().filter(x=>x.id!==id)); },

  exportCSV(rows:HandoverDoc[]){
    const h="id;title;projectId;client;address;date;status;done/total";
    const b=rows.map(r=>{
      const total=r.checklist?.length||0; const done=r.checklist?.filter(i=>i.status==="ok").length||0;
      return [r.id, esc(r.title), r.projectId??"", esc(r.client??""), esc(r.address??""), r.date??"", r.status??"", `${done}/${total}`].join(";");
    }).join("\n");
    return h+"\n"+b;
  },
  exportJSON(){ return JSON.stringify(load()); },
  importJSON(txt:string){ const data:HandoverDoc[]=JSON.parse(txt||"[]"); save(data); return data.length; },

  async attach(docId:string, f:File){
    const dataURL=await new Promise<string>(res=>{ const r=new FileReader(); r.onload=()=>res(String(r.result)); r.readAsDataURL(f); });
    const a:HandoverAttachment={ id:crypto.randomUUID(), name:f.name, mime:f.type, size:f.size, dataURL };
    const all=load(); const d=all.find(x=>x.id===docId); if(!d) return;
    d.attachments=[a,...(d.attachments||[])]; d.updatedAt=Date.now(); save(all);
  }
};
function esc(s:string){return (s||"").replace(/;/g,",");}
