import { CalEvent } from "./types";

const KEY = "rlc-calendar-db";

function load(): CalEvent[] {
  try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : []; }
  catch { return []; }
}
function save(data: CalEvent[]) { localStorage.setItem(KEY, JSON.stringify(data)); }

export const CalendarDB = {
  list(): CalEvent[] { return load().sort((a,b)=>new Date(a.start).getTime()-new Date(b.start).getTime()); },
  blank(): CalEvent {
    const now=new Date(); const later=new Date(now.getTime()+3600000);
    return { id:crypto.randomUUID(), title:"", start:now.toISOString(), end:later.toISOString(), attendees:[] };
  },
  upsert(e:CalEvent){ const all=load(); const i=all.findIndex(x=>x.id===e.id); if(i>=0)all[i]=e; else all.push(e); save(all); },
  remove(id:string){ save(load().filter(e=>e.id!==id)); },

  importICS(txt:string){ // semplice parse basico
    const events:CalEvent[]=[];
    const lines=txt.split(/\r?\n/); let cur:any={};
    for(const l of lines){
      if(l.startsWith("BEGIN:VEVENT")) cur={};
      else if(l.startsWith("END:VEVENT")){ if(cur.SUMMARY) events.push({
        id:crypto.randomUUID(), title:cur.SUMMARY, start:cur.DTSTART, end:cur.DTEND, location:cur.LOCATION, notes:cur.DESCRIPTION }); }
      else{
        const [k,v]=l.split(":"); if(k&&v) cur[k.trim()]=v.trim();
      }
    }
    const all=load(); all.push(...events); save(all); return events.length;
  },

  exportICS(evts:CalEvent[]){
    const esc=(s:string)=>s.replace(/\n/g,"\\n");
    const lines=[
      "BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//RLC Bausoftware//Kalender//DE"
    ];
    for(const e of evts){
      lines.push("BEGIN:VEVENT");
      lines.push("UID:"+e.id);
      lines.push("DTSTART:"+e.start.replace(/[-:]/g,"").split(".")[0]+"Z");
      lines.push("DTEND:"+e.end.replace(/[-:]/g,"").split(".")[0]+"Z");
      lines.push("SUMMARY:"+esc(e.title));
      if(e.location) lines.push("LOCATION:"+esc(e.location));
      if(e.notes) lines.push("DESCRIPTION:"+esc(e.notes));
      lines.push("END:VEVENT");
    }
    lines.push("END:VCALENDAR");
    return lines.join("\r\n");
  }
};
