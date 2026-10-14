import React,{useMemo,useState} from "react";
import {accountingApi,euro} from "./accountingApi";
type Entry={date:string;amount:number;text:string;reference:string;key:string};
const parseLine=(line:string,separator:string):string[]=>{
 const cells:string[]=[];let value="",quoted=false;
 for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(quoted&&line[i+1]==='"'){value+='"';i++}else quoted=!quoted;}
 else if(ch===separator&&!quoted){cells.push(value.trim());value=""}else value+=ch;}
 cells.push(value.trim());return cells;
};
const money=(v:string)=>{let t=v.replace(/[^0-9,.-]/g,"");if(t.includes(",")&&t.includes("."))t=t.lastIndexOf(",")>t.lastIndexOf(".")?t.replace(/\./g,"").replace(",","."):t.replace(/,/g,"");else if(t.includes(","))t=t.replace(",",".");const n=Number(t);return Number.isFinite(n)?n:NaN;};
const dateValue=(v:string)=>{const s=v.trim();const m=s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);if(m){const d=new Date(m[3]+"-"+m[2]+"-"+m[1]+"T12:00:00Z");return d.getUTCDate()===Number(m[1])&&d.getUTCMonth()+1===Number(m[2])?m[3]+"-"+m[2]+"-"+m[1]:"";}if(/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s)))return s;return "";};
export default function BankCsvPreview({invoices,bills,payments}:{invoices:any[];bills:any[];payments:any[]}){
 const [rows,setRows]=useState<Entry[]>([]),[error,setError]=useState(""),[name,setName]=useState("");
 const [sending,setSending]=useState(false),[message,setMessage]=useState("");
 const parse=async(f?:File)=>{
  setRows([]);setError("");setName("");setMessage("");
  if(!f)return;if(f.size>2_000_000){setError("CSV zu groß (maximal 2 MB).");return;}
  try{
   const text=await f.text();const lines=text.replace(/^\uFEFF/,"").split(/\r?\n/).filter(x=>x.trim());
   if(lines.length<2||lines.length>1001)throw Error("Erwartet werden Kopfzeile und maximal 1.000 Datenzeilen.");
   const sep=(lines[0].match(/;/g)||[]).length>=(lines[0].match(/,/g)||[]).length?";":",";
   const head=parseLine(lines[0],sep).map(v=>v.toLocaleLowerCase("de"));
   const pick=(terms:string[])=>head.findIndex(x=>terms.some(term=>x===term||x.includes(term)));
   const di=pick(["buchungstag","buchungsdatum","datum","date"]),ai=pick(["betrag","amount"]),ti=pick(["verwendungszweck","buchungstext","beschreibung","purpose","text"]),ri=pick(["referenz","end-to-end","reference","umsatz-id"]);
   if(di<0||ai<0)throw Error("Spalten für Datum und Betrag fehlen. CSV mit Buchungstag/Datum und Betrag verwenden.");
   const parsed=lines.slice(1).map((l,i)=>{const cell=parseLine(l,sep);const date=dateValue(cell[di]||"");const amount=money(cell[ai]||"");if(!date||!Number.isFinite(amount)||amount===0)throw Error("Ungültiges Datum oder Betrag in Zeile "+(i+2));const txt=cell[ti]||"";const ref=ri>=0?cell[ri]||"":"";return {date,amount,text:txt.slice(0,500),reference:ref.slice(0,180),key:[date,amount.toFixed(2),ref||txt].join("|").toLocaleLowerCase("de")};});
   setRows(parsed);setName(f.name);
  }catch(e:any){setError(e?.message||"CSV konnte nicht gelesen werden.");}
 };
 const persist=async()=>{
  if(!rows.length||!window.confirm("Bankbewegungen als separate Prüfdaten auf dem Server speichern? Es werden keine Zahlungen oder Buchungssätze erzeugt."))return;
  setSending(true);setError("");setMessage("");
  try{
   const response=await accountingApi("/api/accounting/bank-entries/import",{method:"POST",body:JSON.stringify({filename:name,rows:rows.map(r=>({date:r.date,amount:r.amount,text:r.text,reference:r.reference}))})});
   setMessage(`Bankbewegungen gespeichert: ${response.inserted}; Duplikate/erneut importierte: ${response.duplicates}. Keine Buchung erstellt.`);
  }catch(e:any){setError(e?.message||"Serverimport derzeit nicht verfügbar.");}
  finally{setSending(false);}
 };
 const enriched=useMemo(()=>{
  const seen=new Set<string>();
  return rows.map(r=>{
   const duplicate=seen.has(r.key);seen.add(r.key);
   const candidates=(r.amount>0?invoices:bills).filter((x:any)=>{
    const open=Number(x.openAmount||0);
    const value=Math.abs(r.amount);
    const text=(r.reference+" "+r.text).toLowerCase();
    return open>0.009&&Math.abs(open-value)<0.011&&String(x.number||"").length>2&&text.includes(String(x.number).toLowerCase());
   });
   const prior=payments.filter((p:any)=>Math.abs(Number(p.amount||0)-Math.abs(r.amount))<0.011&&String(p.date||"").slice(0,10)===r.date&&p.direction===(r.amount>0?"IN":"OUT"));
   return {...r,duplicate,prior:prior.length,candidates};
  });
 },[rows,invoices,bills,payments]);
 return <section className="card" style={{padding:16}}>
  <h3 style={{margin:"0 0 6px"}}>Bank-CSV · Prüfimport (Vorschau)</h3>
  <p className="bh-note">Lokale CSV-Analyse ohne Upload oder Buchung. Erforderlich: Datum/Buchungstag und Betrag; optional Verwendungszweck und Referenz. Nur semikolon- oder kommaseparierte CSV, keine CAMT-/MT940-Unterstützung.</p>
  <label className="btn" style={{display:"inline-block",cursor:"pointer"}}>CSV auswählen <input type="file" accept=".csv,text/csv" style={{display:"none"}} onChange={e=>void parse(e.target.files?.[0])}/></label>
  {name&&<span className="bh-note" style={{marginLeft:10}}>{name} · {enriched.length} Zeilen</span>}
  {error&&<p role="alert" style={{color:"#b42318"}}>{error}</p>}
  {!!enriched.length&&<><p className="bh-note">Doppelte CSV-Zeilen: {enriched.filter(x=>x.duplicate).length} · Mögliche bereits erfasste Zahlungen: {enriched.filter(x=>x.prior>0).length} · Eindeutige Belegvorschläge: {enriched.filter(x=>!x.duplicate&&x.candidates.length===1).length}. Treffer sind Vorschläge, keine Freigaben.</p>
  <div style={{overflowX:"auto",maxHeight:390,overflowY:"auto"}}><table className="bh-table"><thead><tr><th>Datum</th><th>Betrag</th><th>Verwendungszweck</th><th>Prüfergebnis</th></tr></thead><tbody>{enriched.map((r,i)=><tr key={i}><td>{r.date}</td><td>{euro(r.amount)} €</td><td>{r.text||r.reference||"—"}</td><td>{r.duplicate?"Doppelte CSV-Zeile":r.prior?"Möglicherweise bereits gebucht":r.candidates.length===1?"Belegvorschlag: "+r.candidates[0].number:r.candidates.length>1?"Mehrere mögliche Belege":"Manuell prüfen"}</td></tr>)}</tbody></table></div>
  <div className="rlc-page-toolbar" style={{flexWrap:"wrap"}}>
  <button type="button" className="btn btn-primary" disabled={sending||enriched.some(r=>r.duplicate)} onClick={()=>void persist()}>{sending?"Wird gespeichert …":"Prüfdaten serverseitig speichern"}</button>
  <button type="button" className="btn" onClick={()=>{setRows([]);setName("");setError("");setMessage("");}}>Vorschau verwerfen</button>
  </div>
  {enriched.some(r=>r.duplicate)&&<p role="alert" className="bh-note">Die Datei enthält identische Bewegungen. Bitte CSV zunächst prüfen; für den Import sind eindeutige Datensätze erforderlich.</p>}
  {message&&<p role="status">{message}</p>}</>}
 </section>
}
