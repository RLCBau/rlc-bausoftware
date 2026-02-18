import { SafetyRecord } from "./types";

const KEY="rlc-sicherheit-db";
const load=():SafetyRecord[]=>JSON.parse(localStorage.getItem(KEY)||"[]");
const save=(a:SafetyRecord[])=>localStorage.setItem(KEY,JSON.stringify(a));

export const SafetyDB={
  list():SafetyRecord[]{return load();},
  upsert(a:SafetyRecord){const all=load();const i=all.findIndex(x=>x.id===a.id);if(i>=0)all[i]=a;else all.push(a);save(all);},
  remove(id:string){save(load().filter(x=>x.id!==id));},
  create():SafetyRecord{
    const n:SafetyRecord={id:crypto.randomUUID(),title:"Neue Unterweisung",date:new Date().toISOString(),nextDate:"",notes:"",attachments:[]};
    const all=load();all.push(n);save(all);return n;
  },
  attach:async(id:string,f:File)=>{
    const all=load();const i=all.findIndex(x=>x.id===id);if(i<0)return;
    const data=await f.arrayBuffer();
    const base=URL.createObjectURL(new Blob([data],{type:f.type}));
    const a={id:crypto.randomUUID(),name:f.name,mime:f.type,dataURL:base};
    all[i].attachments=[...(all[i].attachments||[]),a];
    save(all);
  },
  exportCSV(rows:SafetyRecord[]){
    const h="id;title;person;project;date;nextDate;notes";
    const b=rows.map(r=>[r.id,r.title,r.person??"",r.project??"",r.date??"",r.nextDate??"",(r.notes??"").replace(/;/g,",")].join(";")).join("\n");
    return h+"\n"+b;
  }
};
