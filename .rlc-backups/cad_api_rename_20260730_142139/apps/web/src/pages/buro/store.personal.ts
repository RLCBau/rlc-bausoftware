import { RlcEmployee, EmpAttachment } from "./types";

const KEY="rlc-personal-db";
const load=():RlcEmployee[]=>JSON.parse(localStorage.getItem(KEY)||"[]");
const save=(a:RlcEmployee[])=>localStorage.setItem(KEY,JSON.stringify(a));

export const PersonalDB={
  list():RlcEmployee[]{ return load().sort((a,b)=>a.name.localeCompare(b.name)); },
  create():RlcEmployee{
    const e:RlcEmployee={
      id:crypto.randomUUID(), name:"", role:"", email:"", phone:"",
      hourlyRate:0, costCenter:"", projects:[],
      employmentType:"Vollzeit",
      contractStart:new Date().toISOString(), contractEnd:undefined,
      vacationTotal:25, vacationTaken:0,
      certs:[], attachments:[], updatedAt:Date.now()
    };
    const all=load(); all.push(e); save(all); return e;
  },
  upsert(e:RlcEmployee){ const all=load(); const i=all.findIndex(x=>x.id===e.id); if(i>=0) all[i]=e; else all.push(e); save(all); },
  remove(id:string){ save(load().filter(x=>x.id!==id)); },

  async attach(empId:string, f:File){
    const dataURL = await new Promise<string>(res=>{ const r=new FileReader(); r.onload=()=>res(String(r.result)); r.readAsDataURL(f); });
    const a:EmpAttachment={ id:crypto.randomUUID(), name:f.name, mime:f.type, size:f.size, dataURL };
    const all=load(); const e=all.find(x=>x.id===empId); if(!e) return;
    e.attachments=[a,...(e.attachments||[])]; e.updatedAt=Date.now(); save(all);
  },

  exportCSV(rows:RlcEmployee[]){
    const head="id;name;role;email;phone;hourlyRate;costCenter;projects;employmentType;contractStart;contractEnd;vacationTotal;vacationTaken";
    const body=rows.map(r=>[
      r.id, esc(r.name), esc(r.role??""), r.email??"", r.phone??"", r.hourlyRate??0, esc(r.costCenter??""),
      (r.projects??[]).join("|"), r.employmentType??"", r.contractStart??"", r.contractEnd??"",
      r.vacationTotal??0, r.vacationTaken??0
    ].join(";")).join("\n");
    return head+"\n"+body;
  },

  importCSV(txt:string){
    const lines=txt.split(/\r?\n/).filter(Boolean); if(lines.length<=1) return 0;
    const rows=lines.slice(1).map(l=>l.split(";"));
    const all=load();
    for(const r of rows){
      const e:RlcEmployee={
        id:r[0]||crypto.randomUUID(),
        name:unesc(r[1]||""), role:unesc(r[2]||""), email:r[3]||"", phone:r[4]||"",
        hourlyRate:+(r[5]||0), costCenter:unesc(r[6]||""),
        projects:(r[7]||"").split("|").filter(Boolean),
        employmentType:r[8] as any,
        contractStart:r[9]||undefined, contractEnd:r[10]||undefined,
        vacationTotal:+(r[11]||0), vacationTaken:+(r[12]||0),
        certs:[], attachments:[], updatedAt:Date.now()
      };
      const i=all.findIndex(x=>x.id===e.id); if(i>=0) all[i]=e; else all.push(e);
    }
    save(all); return rows.length;
  },

  exportJSON(){ return JSON.stringify(load()); },
  importJSON(txt:string){ const data: RlcEmployee[] = JSON.parse(txt||"[]"); save(data); return data.length; }
};

function esc(s:string){return (s||"").replace(/;/g,",");}
function unesc(s:string){return s;}
