import {planInput,planDay,PlanError} from './constructionPlan';
import {InputError} from './officeAddons';
const DAY=86400000;
const dayNumber=(v:string)=>planDay(v)!.getTime()/DAY;
const iso=(n:number)=>new Date(n*DAY).toISOString();
export function scheduleInput(b:any){
 const start=planDay(b.start)!.toISOString().slice(0,10);
 if(!Array.isArray(b.weekdays)||!b.weekdays.length||b.weekdays.length>7||new Set(b.weekdays).size!==b.weekdays.length||b.weekdays.some((n:any)=>!Number.isInteger(n)||n<0||n>6))throw new InputError('Start-Wochentage auswählen.');
 if(typeof b.excludeNonWorking!=='boolean')throw new InputError('Ruhetagsauswahl erforderlich.');
 return {start,weekdays:[...b.weekdays].sort(),excludeNonWorking:b.excludeNonWorking};
}
// Durations and reservations cover continuous calendar spans. Only starts use the work calendar.
// Stable forward-only serial scheduling is a feasible proposal, not a globally optimal solution.
export function proposeSchedule(source:any,input:any,holidays:string[]){
 const plan=planInput(source),first=dayNumber(input.start),last=first+365;
 if(plan.tasks.length>500)throw new InputError('Terminierung auf höchstens 500 Vorgänge begrenzt.');
 const blocked:string[]=[],holidaySet=new Set(holidays),usage=new Map<string,Map<number,number>>();
 let operations=0;
 const budget=()=>{if(++operations>2000000)throw new PlanError('Plan zu komplex für automatische Vorschau. Bitte eingrenzen.',400);};
 const tasks=plan.tasks.map((t:any)=>({...t})),byId=new Map<string,any>(tasks.map((t:any)=>[t.id,t]));
 const span=(t:any)=>t.milestone?1:Math.max(1,t.dauerTage);
 const reserve=(t:any,start:number,check:boolean)=>{
  for(const [key,raw] of Object.entries(t.ressourcen)){const need=raw as number;if(!need)continue;
   if(!Object.prototype.hasOwnProperty.call(plan.capacity,key)||plan.capacity[key]<need){blocked.push(t.name+': Kapazität für '+key+' fehlt oder ist zu klein.');return false;}
   const days=usage.get(key)||new Map<number,number>();if(!usage.has(key))usage.set(key,days);
   for(let d=start;d<start+span(t);d++){budget();if(check&&(days.get(d)||0)+need>plan.capacity[key]+1e-9)return false;}
  }
  if(!check)for(const [key,raw] of Object.entries(t.ressourcen)){const need=raw as number;if(!need)continue;const days=usage.get(key)!;for(let d=start;d<start+span(t);d++){budget();days.set(d,(days.get(d)||0)+need);}}
  return true;
 };
 // Pinned work reserves capacity before unscheduled work is placed.
 for(const t of tasks.filter((t:any)=>t.progress>0)){
  if(!t.start||!t.end){blocked.push(t.name+': Begonnener Vorgang ohne Datum.');continue;}
  const start=dayNumber(t.start),end=dayNumber(t.end);
  if(start<first||end>last){blocked.push(t.name+': Fixierter Vorgang liegt außerhalb des 366-Tage-Fensters.');continue;}
  if(!reserve(t,start,true))blocked.push(t.name+': Fixierte Vorgänge überschreiten Kapazität.');else reserve(t,start,false);
 }
 const degree=new Map<string,number>(tasks.map((t:any)=>[String(t.id),t.deps.length])),edges=new Map<string,string[]>();
 for(const t of tasks)for(const dep of t.deps){const list=edges.get(dep)||[];list.push(t.id);edges.set(dep,list);}
 const queue=tasks.filter((t:any)=>!t.deps.length).map((t:any)=>t.id).sort(),done=new Set<string>();
 while(queue.length){
  const id=queue.shift()!,t=byId.get(id)!;
  let minimum=first;
  for(const dep of t.deps){const p=byId.get(dep)!;if(!done.has(dep)||!p.end){blocked.push(t.name+': Vorgänger nicht terminierbar.');minimum=last+1;}else minimum=Math.max(minimum,dayNumber(p.end)+1);}
  if(t.progress>0){if(t.start&&dayNumber(t.start)<minimum)blocked.push(t.name+': Fixiertes Datum verletzt Abhängigkeit oder Planstart.');}
  else{
   if(t.start)minimum=Math.max(minimum,dayNumber(t.start));
   if(span(t)>366)blocked.push(t.name+': Dauer überschreitet Vorschaufenster.');
   let placed=false;
   // Validate demands once, including when there is no available candidate.
   for(const [key,need] of Object.entries(t.ressourcen))if(Number(need)>0&&(!Object.prototype.hasOwnProperty.call(plan.capacity,key)||plan.capacity[key]<Number(need)))blocked.push(t.name+': Kapazität für '+key+' fehlt oder ist zu klein.');
   if(!blocked.length)for(let d=minimum;d+span(t)-1<=last;d++){budget();const date=iso(d).slice(0,10);if(!input.weekdays.includes(new Date(d*DAY).getUTCDay())||input.excludeNonWorking&&holidaySet.has(date))continue;if(!reserve(t,d,true))continue;reserve(t,d,false);t.start=iso(d);t.end=iso(d+span(t)-1);t.dauerTage=span(t);placed=true;break;}
   if(!placed)blocked.push(t.name+': Kein zulässiger Platz im 366-Tage-Fenster.');
  }
  done.add(id);for(const next of edges.get(id)||[]){degree.set(next,degree.get(next)!-1);if(degree.get(next)===0){queue.push(next);queue.sort();}}
 }
 const changes=tasks.map((t:any)=>{const old=plan.tasks.find((p:any)=>p.id===t.id)!;return {id:t.id,name:t.name,pinned:t.progress>0,beforeStart:old.start,beforeEnd:old.end,start:t.start,end:t.end,duration:t.dauerTage,changed:old.start!==t.start||old.end!==t.end||old.dauerTage!==t.dauerTage};});
 return {data:{start:input.start,tasks,capacity:plan.capacity},changes,blocked:[...new Set(blocked)],changedCount:changes.filter((r:any)=>r.changed).length,windowEnd:iso(last).slice(0,10)};
}
