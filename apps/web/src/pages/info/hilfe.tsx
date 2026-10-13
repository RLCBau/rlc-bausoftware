import React, {useState} from "react";
import {Link} from "react-router-dom";
import "./hilfe.css";
import "./serviceCenter.css";

const incidents = [
 {name:"GAEB-Import",steps:["Dateiformat (X83/D83) und Projekt prüfen.","Importvorschau und die konkrete Fehlermeldung kontrollieren.","Problematische Position notieren und bei Bedarf Support kontaktieren."],path:"/kalkulation/lv-import",label:"Import öffnen"},
 {name:"Kalkulation / EP",steps:["Betroffene LV-Position und Einheit kontrollieren.","Urkalkulation, Ressourcen und Status needs_review prüfen.","Ungeklärte EP nicht durch historische Preise ersetzen."],path:"/kalkulation/mit-ki",label:"Kalkulation öffnen"},
 {name:"Mobile-Synchronisierung",steps:["Auf beiden Geräten Projekt und Benutzer kontrollieren.","Netzwerk und Synchronisationsstatus der Mobile-App prüfen.","Fehlenden Datentyp und Zeitpunkt für Support dokumentieren."],path:"/mobile",label:"Mobile öffnen"},
 {name:"Zugriff / Berechtigungen",steps:["Anmeldung und gewähltes Projekt kontrollieren.","Rolle und Projektmitgliedschaft von einem Administrator prüfen lassen.","Bei anhaltendem Problem betroffene Funktion im Support melden."],path:"/buro/nutzerverwaltung",label:"Benutzerverwaltung öffnen"}
];
export default function Hilfe(){
 const [selected,setSelected]=useState<number|null>(null);
 return <main className="rlc-help rlc-service-center">
 <header className="rlc-page-hero rlc-help-hero"><div className="rlc-page-hero__eyebrow">RLC Bausoftware · Service</div><h1>Service- & Hilfe-Center</h1><p>Technische Unterstützung, gezielte Fehlerdiagnose und direkter Kontakt zum RLC-Support.</p></header>
 <section className="rlc-service-grid" aria-label="Service-Angebote">
 <Link className="rlc-service-card" to="/info/support"><span className="rlc-service-card-icon">✉</span><h2>Support kontaktieren</h2><p>Technisches Problem melden, Fragen stellen oder Verbesserungsvorschläge einsenden.</p><strong>Support öffnen →</strong></Link>
 <button className="rlc-service-card" type="button" onClick={()=>document.getElementById("rlc-diagnose")?.scrollIntoView({behavior:"smooth"})}><span className="rlc-service-card-icon">⚙</span><h2>Problem diagnostizieren</h2><p>Geführte Erstprüfung für GAEB, EP, Mobile und Zugriffsprobleme.</p><strong>Diagnose starten →</strong></button>
 <button className="rlc-service-card" type="button" onClick={()=>window.dispatchEvent(new Event("rlc:open-copilot"))}><span className="rlc-service-card-icon">✦</span><h2>RLC Copilot</h2><p>Den integrierten Assistenten zu einer konkreten Funktion oder Arbeitsaufgabe befragen.</p><strong>Copilot öffnen →</strong></button>
 <Link className="rlc-service-card" to="/info/faq"><span className="rlc-service-card-icon">?</span><h2>Fragen & Antworten</h2><p>139 Antworten zu Modulen, Bedienung, Mobile und Zusammenhängen durchsuchen.</p><strong>FAQ öffnen →</strong></Link>
 </section>
 <section id="rlc-diagnose" className="rlc-service-diagnostic"><div className="rlc-help-heading"><div><span>GEFÜHRTE ERSTPRÜFUNG</span><h2>Was funktioniert nicht?</h2></div></div><p>Wählen Sie den betroffenen Bereich. Die Prüfschritte verändern keine Projekt- oder Benutzerdaten.</p>
 <div className="rlc-service-diagnostic-options">{incidents.map((x,i)=><button key={x.name} type="button" aria-pressed={selected===i} className={selected===i?"selected":""} onClick={()=>setSelected(i)}>{x.name}</button>)}</div>
 {selected!==null&&<div className="rlc-service-diagnostic-result"><h3>{incidents[selected].name} · Prüfung</h3><ol>{incidents[selected].steps.map(step=><li key={step}>{step}</li>)}</ol><div className="rlc-service-actions"><Link className="rlc-help-action" to={incidents[selected].path}>{incidents[selected].label} →</Link><Link to="/info/support">Problem melden →</Link></div></div>}
 </section>
 <section className="rlc-service-bottom"><div><h2>System & Verbindung</h2><p>API-Erreichbarkeit und Browserstatus prüfen. Ein erreichbarer Server bedeutet nicht automatisch, dass jeder Fachprozess fehlerfrei funktioniert.</p><Link to="/info/system">Systemstatus anzeigen →</Link></div><div><h2>Dokumentation</h2><p>Die Fachfragen sind in der FAQ nach Modulen gegliedert. Für rechtliche Informationen stehen die Datenschutz- und Anbieterangaben gesondert bereit.</p><Link to="/info/faq">FAQ durchsuchen →</Link></div></section>
 <footer className="rlc-help-footer"><div><strong>RLC Service</strong><p>Keine Passwörter oder Zugangstokens an den Support senden.</p></div><div><Link to="/info/support">Support</Link><Link to="/info/datenschutz">Datenschutz</Link><Link to="/info/impressum">Impressum</Link></div></footer>
 </main>;
}