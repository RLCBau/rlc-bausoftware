import React,{useMemo,useState} from "react";
import {Link} from "react-router-dom";
import "./infoProfessional.css";
import faqCatalog from "./faqCatalog.json";
const faq: {group:string;q:string;a:string;path:string}[] = faqCatalog;
export default function FAQ(){
const [search,setSearch]=useState("");const [group,setGroup]=useState("Alle");const [open,setOpen]=useState<number|null>(0);
const groups=["Alle",...new Set(faq.map(x=>x.group))];
const results=useMemo(()=>faq.map((x,i)=>({...x,i})).filter(x=>(group==="Alle"||x.group===group)&&[x.q,x.a,x.group].join(" ").toLocaleLowerCase("de").includes(search.toLocaleLowerCase("de"))),[search,group]);
return <main className="rlc-info-pro"><header className="rlc-page-hero"><span>RLC WISSENSDATENBANK</span><h1>Häufige Fragen</h1><p>139 Fragen zu allen Web-Modulen, Mobile, RLC Copilot und den Verbindungen zwischen den Bereichen.</p><input aria-label="FAQ durchsuchen" placeholder="Frage oder Stichwort suchen …" value={search} onChange={e=>setSearch(e.target.value)}/></header>
<div className="rlc-info-chips">{groups.map(g=><button key={g} type="button" className={group===g?"active":""} onClick={()=>{setGroup(g);setOpen(null)}}>{g}</button>)}</div>
<section className="rlc-info-panel"><div className="rlc-info-panel-head"><h2>Fragen und Antworten</h2><small>{results.length} Einträge</small></div>{results.map(x=><div className="rlc-info-faq" key={x.i}><button type="button" aria-expanded={open===x.i} onClick={()=>setOpen(open===x.i?null:x.i)}><span><small>{x.group}</small><strong>{x.q}</strong></span><b>{open===x.i?"−":"+"}</b></button>{open===x.i&&<div className="rlc-info-answer"><p>{x.a}</p><Link className="rlc-info-answer-link" to={x.path}>Bereich öffnen →</Link></div>}</div>)}{!results.length&&<p>Keine Treffer. Andere Suchbegriffe eingeben oder den Support kontaktieren.</p>}</section><footer className="rlc-info-footer"><span>Weitere Hilfe benötigt?</span><Link to="/info/hilfe">Anleitungen</Link><Link to="/info/support">Support & Feedback →</Link></footer></main>}
