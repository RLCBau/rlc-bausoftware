import { Machine, MachAttachment } from "./types";
const KEY="rlc-machines-db";
const load=():Machine[]=>JSON.parse(localStorage.getItem(KEY)||"[]");
const save=(a:Machine[])=>localStorage.setItem(KEY,JSON.stringify(a));

export const MachinesDB={
  list():Machine[]{ return load().sort((a,b)=>(a.name||"").localeCompare(b.name||"")); },
  create():Machine{
    const now=new Date().toISOString();
    const m:Machine={ id:crypto.randomUUID(), name:"", type:"", serial:"", projectId:"", location:"", status:"Betrieb",
      hours:0, lastService:now, serviceIntervalDays:180, nextService:now, maintenance:[], attachments:[], updatedAt:Date.now() };
    const all=load(); all.push(m); save(all); return m;
  },
  upsert(m:Machine){ const all=load(); const i=all.findIndex(x=>x.id===m.id); if(i>=0) all[i]=m; else all.push(m); save(all); },
  remove(id:string){ save(load().filter(x=>x.id!==id)); },

  async attach(machineId:string, f:File){
    const dataURL=await new Promise<string>(res=>{const r=new FileReader(); r.onload=()=>res(String(r.result)); r.readAsDataURL(f);});
    const a:MachAttachment={ id:crypto.randomUUID(), name:f.name, mime:f.type, size:f.size, dataURL };
    const all=load(); const m=all.find(x=>x.id===machineId); if(!m) return;
    m.attachments=[a,...(m.attachments||[])]; m.updatedAt=Date.now(); save(all);
  },

  exportCSV(rows:Machine[]){
    const h="id;name;type;serial;projectId;location;status;hours;lastService;serviceIntervalDays;nextService";
    const b=rows.map(r=>[
      r.id, esc(r.name??""), esc(r.type??""), esc(r.serial??""), r.projectId??"", esc(r.location??""),
      r.status??"", r.hours??0, r.lastService??"", r.serviceIntervalDays??0, r.nextService??""
    ].join(";")).join("\n");
    return h+"\n"+b;
  },
  importCSV(txt:string){
    const lines=txt.split(/\r?\n/).filter(Boolean); if(lines.length<=1) return 0;
    const rows=lines.slice(1).map(l=>l.split(";")); const all=load();
    for(const r of rows){
      const m:Machine={ id:r[0]||crypto.randomUUID(), name:unesc(r[1]||""), type:unesc(r[2]||""), serial:unesc(r[3]||""),
        projectId:r[4]||"", location:unesc(r[5]||""), status:(r[6] as any)||"Betrieb", hours:+(r[7]||0),
        lastService:r[8]||undefined, serviceIntervalDays:+(r[9]||0), nextService:r[10]||undefined,
        maintenance:[], attachments:[], updatedAt:Date.now() };
      const i=all.findIndex(x=>x.id===m.id); if(i>=0) all[i]=m; else all.push(m);
    }
    save(all); return rows.length;
  },
  exportJSON(){ return JSON.stringify(load()); },
  importJSON(txt:string){ const data:Machine[]=JSON.parse(txt||"[]"); save(data); return data.length; }
};
function esc(s:string){return (s||"").replace(/;/g,",");}
function unesc(s:string){return s;}
