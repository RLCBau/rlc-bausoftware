import React from "react";
import { PersonalDB } from "./store.personal";
import { MachinesDB } from "./store.machines";
import { ResDB } from "./store.ressourcen";
import { RlcEmployee, Machine, ResAssign } from "./types";

const inp:React.CSSProperties={border:"1px solid var(--line)",borderRadius:6,padding:"6px 8px",fontSize:13};
const th:React.CSSProperties={textAlign:"left",padding:"8px 10px",borderBottom:"1px solid var(--line)",fontSize:13,whiteSpace:"nowrap"};
const td:React.CSSProperties={padding:"6px 10px",borderBottom:"1px solid var(--line)",fontSize:13,verticalAlign:"middle"};

function monday(d=new Date()){ const x=new Date(d); const day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); x.setHours(0,0,0,0); return x; }
function addDays(d:Date,n:number){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function ymd(d:Date){ return d.toISOString().slice(0,10); }

export default function Ressourcenplanung(){
  const [week0,setWeek0]=React.useState<Date>(monday());
  const [people,setPeople]=React.useState<RlcEmployee[]>(PersonalDB.list());
  const [machines,setMachines]=React.useState<Machine[]>(MachinesDB.list());
  const [assign,setAssign]=React.useState<ResAssign[]>(ResDB.list());
  const [q,setQ]=React.useState(""); const [proj,setProj]=React.useState("");

  const refresh=()=>{ setPeople(PersonalDB.list()); setMachines(MachinesDB.list()); setAssign(ResDB.list()); };

  const days=[0,1,2,3,4,5,6].map(i=>addDays(week0,i));
  const dayKeys=days.map(ymd);
  const resources=[...people.map(p=>({kind:"emp" as const, id:p.id, name:p.name})),
                   ...machines.map(m=>({kind:"mac" as const, id:m.id, name:m.name||m.serial||"Maschine"})) ]
                  .filter(r=>!q || r.name.toLowerCase().includes(q.toLowerCase()));

  const projects=Array.from(new Set(assign.map(a=>a.projectId).filter(Boolean))).sort();

  const cellData=(rId:string,day:string)=>assign.filter(a=>a.resourceId===rId && a.date===day && (!proj || a.projectId===proj));
  const sumDay=(rId:string,day:string)=>cellData(rId,day).reduce((s,a)=>s+(a.hours||0),0);

  const newAssign=(rId:string, date:string)=>{ 
    const a:ResAssign={ id:crypto.randomUUID(), resourceId:rId, date, projectId:"", hours:8, notes:"" };
    ResDB.upsert(a); refresh();
  };
  const upd=(patch:ResAssign)=>{ ResDB.upsert(patch); setAssign(ResDB.list()); };
  const del=(id:string)=>{ ResDB.remove(id); setAssign(ResDB.list()); };

  const prevWeek=()=>setWeek0(addDays(week0,-7));
  const nextWeek=()=>setWeek0(addDays(week0, 7));

  return (
    <div style={{display:"grid",gridTemplateRows:"auto 1fr",gap:10,padding:10}}>
      {/* Toolbar */}
      <div className="card" style={{padding:"8px 10px",display:"flex",gap:8,alignItems:"center"}}>
        <button className="btn" onClick={prevWeek}>◀ KW</button>
        <div style={{fontWeight:700}}>{`KW ${kw(week0)}  (${ymd(days[0])} – ${ymd(days[6])})`}</div>
        <button className="btn" onClick={nextWeek}>KW ▶</button>
        <div style={{flex:1}}/>
        <input placeholder="Suche Ressource…" value={q} onChange={e=>setQ(e.target.value)} style={{...inp,width:220}}/>
        <select value={proj} onChange={e=>setProj(e.target.value)} style={{...inp,width:180}}>
          <option value="">Alle Projekte</option>
          {projects.map(p=><option key={p} value={p}>{p}</option>)}
        </select>
        <button className="btn" onClick={()=>{ResDB.clearWeek(dayKeys); refresh();}}>Woche leeren</button>
        <button className="btn" onClick={()=>download("text/csv;charset=utf-8","ressourcen.csv",ResDB.exportCSV(assign))}>Export CSV</button>
      </div>

      {/* Grid */}
      <div className="card" style={{padding:0,overflow:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead>
            <tr>
              <th style={{...th,width:240}}>Ressource</th>
              {days.map((d,i)=><th key={i} style={th}>{d.toLocaleDateString(undefined,{weekday:"short", day:"2-digit", month:"2-digit"})}</th>)}
              <th style={th}>Σ Woche</th>
            </tr>
          </thead>
          <tbody>
            {resources.map(r=>{
              const weekSum=dayKeys.reduce((s,k)=>s+sumDay(r.id,k),0);
              return (
                <tr key={r.id}>
                  <td style={td}><b>{r.name}</b> <span style={{opacity:.6,fontSize:12}}>({r.kind==="emp"?"MA":"Maschine"})</span></td>
                  {dayKeys.map((k,idx)=>{
                    const sum=sumDay(r.id,k);
                    const over=(r.kind==="emp" && sum>8);
                    const items=cellData(r.id,k);
                    return (
                      <td key={idx} style={{...td,verticalAlign:"top",background:over?"#fff3f0":undefined}}>
                        {items.map(a=>(
                          <div key={a.id} style={{border:"1px solid var(--line)",borderRadius:6,padding:"6px 8px",marginBottom:6,background:"#fafafa"}}>
                            <div style={{display:"flex",gap:6,alignItems:"center"}}>
                              <input style={{...inp,width:90}} placeholder="Projekt" value={a.projectId}
                                     onChange={e=>upd({...a,projectId:e.target.value})}/>
                              <input type="number" min={0} max={24} style={{...inp,width:70}} value={a.hours}
                                     onChange={e=>upd({...a,hours:+e.target.value})}/>
                              <button className="btn" onClick={()=>del(a.id)}>✕</button>
                            </div>
                            <input style={{...inp,marginTop:6,width:"100%"}} placeholder="Notiz"
                                   value={a.notes??""} onChange={e=>upd({...a,notes:e.target.value})}/>
                          </div>
                        ))}
                        <button className="btn" onClick={()=>newAssign(r.id,k)}>+ Eintrag</button>
                        {sum>0 && <div style={{marginTop:4,fontSize:12,opacity:.7}}>Σ {sum}h</div>}
                      </td>
                    );
                  })}
                  <td style={{...td,fontWeight:700}}>{weekSum}h</td>
                </tr>
              );
            })}
            {resources.length===0 && <tr><td style={{...td,opacity:.6}} colSpan={9}>Keine Ressourcen gefunden.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function kw(d:Date){ const t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())); const n=(t.getUTCDay()+6)%7; t.setUTCDate(t.getUTCDate()-n+3); const f=new Date(Date.UTC(t.getUTCFullYear(),0,4)); return 1+Math.round(((t.getTime()-f.getTime())/86400000-3+((f.getUTCDay()+6)%7))/7); }
function download(type:string,name:string,data:string){ const b=new Blob([data],{type}); const a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download=name; a.click(); URL.revokeObjectURL(a.href); }
