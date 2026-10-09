import React from "react";
import { Link } from "react-router-dom";
import { apiUrl } from "../../lib/apiBase";

const shell: React.CSSProperties = {
  maxWidth: 1050,
  margin: "0 auto",
  padding: "12px 16px 48px",
  fontFamily: "Inter,system-ui,Arial",
};

const card: React.CSSProperties = {
  border: "1px solid #dbe4ef",
  borderRadius: 12,
  padding: 16,
  margin: "12px 0",
  background: "#fff",
  boxShadow: "0 4px 16px rgba(15,23,42,.04)",
};

const p: React.CSSProperties = {
  margin: "7px 0",
  color: "#334155",
  lineHeight: 1.55,
};

const h3: React.CSSProperties = {
  margin: "0 0 8px",
  fontSize: 16,
  color: "#0f172a",
};

const note: React.CSSProperties = {
  border: "1px solid #bfdbfe",
  background: "#eff6ff",
  color: "#1e3a8a",
  borderRadius: 10,
  padding: 12,
  marginTop: 10,
  lineHeight: 1.5,
};

function Item({ children }: { children: React.ReactNode }) {
  return <li style={{ margin: "5px 0", color: "#334155", lineHeight: 1.5 }}>{children}</li>;
}

function authHeaders(): Record<string,string> {
  for (const storage of [localStorage, sessionStorage]) for (const key of ["rlc_token","token","authToken","accessToken","rlc_auth_token"]) {
    const value=storage.getItem(key); if(value?.trim()) return {Authorization:`Bearer ${value.trim()}`};
  }
  return {};
}
async function api(path:string, init:RequestInit={}) {
  const response=await fetch(apiUrl(path),{credentials:"include",...init,headers:{Accept:"application/json",...(init.body?{"Content-Type":"application/json"}:{}),...authHeaders(),...(init.headers||{})}});
  const data=await response.json().catch(()=>null);
  if(!response.ok||data?.ok===false) throw new Error(data?.error||data?.message||`HTTP ${response.status}`);
  return data;
}
const input:React.CSSProperties={width:"100%",border:"1px solid #cbd5e1",borderRadius:7,padding:"8px 9px",boxSizing:"border-box"};
const grid3:React.CSSProperties={display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:9};
const emptyPrivacy:any={
  employeeGpsEnabled:false,employeeGpsPurpose:"",employeeGpsLegalBasis:"",employeeGpsRetentionDays:0,
  aiExternalProcessingEnabled:false,aiProviderName:"",aiPurpose:"",aiLegalBasis:"",aiPersonalDataPolicy:"MINIMIZE",aiRetentionDays:0,aiThirdCountryTransfer:false,aiTransferMechanism:"",
  avvSigned:false,avvSignedAt:null,avvReference:"",tomReviewed:false,tomReviewedAt:null,tomReference:"",vvtReviewed:false,vvtReviewedAt:null,vvtReference:"",
  dsfaRequired:false,dsfaCompleted:false,dsfaCompletedAt:null,dsfaReference:"",deletionConceptReviewed:false,deletionConceptReviewedAt:null,deletionConceptReference:"",privacyContact:"",dpoContact:""
};

export default function Datenschutz() {
  const [profile,setProfile]=React.useState<any>(emptyPrivacy);
  const [requests,setRequests]=React.useState<any[]>([]);
  const [selected,setSelected]=React.useState<any|null>(null);
  const [privacyDenied,setPrivacyDenied]=React.useState(false);
  const [message,setMessage]=React.useState("");
  const [aiAudit,setAiAudit]=React.useState<any>({summary:{calls:0,totalTokens:0,byModel:{}},items:[]});
  const load=React.useCallback(async()=>{
    setMessage("");
    try { const p=await api("/api/company/privacy-profile"); setProfile({...emptyPrivacy,...(p.profile||{})}); } catch(e:any){ setMessage(e.message); }
    try { const r=await api("/api/privacy-compliance"); const rows=Array.isArray(r.items)?r.items:[]; setRequests(rows); setPrivacyDenied(false); setSelected((cur:any)=>cur?rows.find((x:any)=>x.id===cur.id)||null:null); } catch(e:any){ setPrivacyDenied(true); }
    try { const a=await api("/api/privacy-compliance/ai-audit"); setAiAudit(a||{summary:{calls:0,totalTokens:0,byModel:{}},items:[]}); } catch {}
  },[]);
  React.useEffect(()=>{void load();},[load]);
  const saveProfile=async()=>{try{const r=await api("/api/company/privacy-profile",{method:"PUT",body:JSON.stringify(profile)});setProfile({...emptyPrivacy,...r.profile});setMessage("Datenschutz-Profil gespeichert.");}catch(e:any){setMessage(e.message);}};
  const createRequest=async()=>{try{const r=await api("/api/privacy-compliance",{method:"POST",body:JSON.stringify({requestType:"ACCESS",receivedAt:new Date().toISOString(),subjectName:"",contact:""})});await load();setSelected(r.item);}catch(e:any){setMessage(e.message);}};
  const saveRequest=async(finalize=false)=>{if(!selected)return;try{const payload={...selected,status:finalize?"COMPLETED":selected.status||"OPEN"};const r=await api(`/api/privacy-compliance/${selected.id}`,{method:"PUT",body:JSON.stringify(payload)});await load();setSelected(r.item);setMessage(finalize?"Betroffenenanfrage abgeschlossen und gesperrt.":"Betroffenenanfrage gespeichert.");}catch(e:any){setMessage(e.message);}};
  const patchRequest=(patch:any)=>{if(selected&&!selected.evidenceLock)setSelected({...selected,...patch});};
  return (
    <div style={shell}>
      <header className="rlc-page-hero">
        <div className="rlc-page-hero__eyebrow">RLC · Datenschutz</div>
        <h1>Datenschutz und Datenverarbeitung</h1>
        <p>
          Produktinformation zur Verarbeitung personenbezogener Daten in RLC Bausoftware
          nach DSGVO und BDSG.
        </p>
      </header>

      <div style={note}>
        <b>Wichtig:</b> RLC verarbeitet nicht ausschließlich Daten im Browser. Je nach
        genutztem Modul werden Daten auf dem RLC-Server bzw. in der Cloud gespeichert,
        synchronisiert oder an konfigurierte Dienste übermittelt. Die jeweils nutzende
        Firma muss ihre konkrete Datenschutzerklärung, Rechtsgrundlagen, Aufbewahrungs-
        und Löschfristen sowie Auftragsverarbeiter für ihren Betrieb festlegen.
      </div>

      <section style={card}>
        <h3 style={h3}>1. Verantwortlicher und Rollen</h3>
        <p style={p}>
          Verantwortlicher für Mitarbeiter-, Kunden-, Projekt- und Baustellendaten ist
          grundsätzlich die Firma, die RLC im eigenen Betrieb einsetzt. Die aktuellen
          Kontaktdaten der Firma sind unter <Link to="/info/impressum">Impressum</Link>{" "}
          bzw. in den Firmendaten zu hinterlegen.
        </p>
        <p style={p}>
          Soweit RLC oder ein Hosting-/Cloud-Anbieter Daten ausschließlich im Auftrag
          verarbeitet, ist vor Produktivbetrieb ein wirksamer Vertrag zur
          Auftragsverarbeitung nach Art. 28 DSGVO erforderlich.
        </p>
      </section>

      <section style={card}>
        <h3 style={h3}>2. Verarbeitete Datenkategorien</h3>
        <ul>
          <Item>Benutzerkonto, Rollen, Login-, Sicherheits- und Auditdaten.</Item>
          <Item>Firmen-, Kunden-, Lieferanten-, Vertrags- und Projektdaten.</Item>
          <Item>Personal-, Arbeitszeit-, Qualifikations- und Unterweisungsdaten.</Item>
          <Item>Baustellendokumentation, Regieberichte, Bautagebuch, Fotos und Anhänge.</Item>
          <Item>Rechnungs-, Buchhaltungs-, Zahlungs- und E-Rechnungsdaten.</Item>
          <Item>GPS-/Standortdaten, sofern eine Standortfunktion aktiv genutzt wird.</Item>
          <Item>KI-Eingaben und die für eine KI-Funktion übermittelten Projektdaten.</Item>
          <Item>Geräte-, Mobile-Lizenz- und technische Diagnosedaten.</Item>
        </ul>
      </section>

      <section style={card}>
        <h3 style={h3}>3. Zwecke und Rechtsgrundlagen</h3>
        <p style={p}>
          Die Verarbeitung muss je Funktion auf eine konkrete Rechtsgrundlage gestützt
          werden. Typische Grundlagen sind Art. 6 Abs. 1 lit. b DSGVO
          (Vertrag/Vertragsanbahnung), lit. c (gesetzliche Verpflichtung), lit. f
          (berechtigtes Interesse) sowie für Beschäftigtendaten zusätzlich § 26 BDSG.
          Eine Einwilligung nach Art. 6 Abs. 1 lit. a DSGVO wird nur verwendet, wenn sie
          tatsächlich freiwillig und widerruflich erteilt werden kann.
        </p>
        <p style={p}>
          Standortüberwachung von Beschäftigten darf nicht pauschal oder dauerhaft
          erfolgen. GPS darf nur für einen dokumentierten, erforderlichen Zweck und mit
          angemessener Zugriffsbeschränkung und Löschfrist eingesetzt werden.
        </p>
      </section>

      <section style={card}>
        <h3 style={h3}>4. Empfänger, Cloud, E-Mail und KI</h3>
        <ul>
          <Item>
            Daten können an den konfigurierten Hosting-/Cloud-Anbieter übermittelt
            werden, soweit dies für Betrieb, Speicherung, Backup oder DMS erforderlich ist.
          </Item>
          <Item>
            Beim Versand von Dokumenten verarbeitet der konfigurierte E-Mail-Dienst die
            erforderlichen Empfänger-, Absender- und Dokumentdaten.
          </Item>
          <Item>
            Bei aktiv genutzten KI-Funktionen können die für die jeweilige Anfrage
            benötigten Inhalte an den konfigurierten KI-Anbieter übertragen werden.
            Nicht erforderliche personenbezogene Daten sollen vor der Übermittlung
            vermieden oder minimiert werden.
          </Item>
          <Item>
            Werden Anbieter außerhalb EU/EWR eingesetzt, müssen die Voraussetzungen der
            Art. 44 ff. DSGVO für Drittlandübermittlungen dokumentiert und erfüllt sein.
          </Item>
        </ul>
      </section>

      <section style={card}>
        <h3 style={h3}>5. Speicherung, Aufbewahrung und Löschung</h3>
        <p style={p}>
          RLC trennt fachliche Aufbewahrungspflichten von datenschutzrechtlicher
          Löschung. Steuer- und handelsrechtlich aufzubewahrende Unterlagen dürfen nicht
          vor Ablauf der gesetzlichen Frist gelöscht werden. Nicht mehr erforderliche
          personenbezogene Daten sind nach dem dokumentierten Löschkonzept zu löschen
          oder zu anonymisieren, sofern keine gesetzliche Pflicht oder ein zulässiger
          Rechtsgrund entgegensteht.
        </p>
        <p style={p}>
          E-Rechnungen und andere strukturierte steuerrelevante Originaldaten sind in
          ihrer ursprünglichen Form und nachvollziehbar aufzubewahren. DMS-Versionen,
          Hashwerte und Auditprotokolle dienen der Nachvollziehbarkeit von Änderungen.
        </p>
      </section>

      <section style={card}>
        <h3 style={h3}>6. Betroffenenrechte</h3>
        <p style={p}>
          Betroffene Personen können – soweit die gesetzlichen Voraussetzungen erfüllt
          sind – insbesondere Auskunft, Berichtigung, Löschung, Einschränkung,
          Datenübertragbarkeit und Widerspruch verlangen. Einwilligungen können mit
          Wirkung für die Zukunft widerrufen werden. Außerdem besteht ein
          Beschwerderecht bei einer zuständigen Datenschutzaufsichtsbehörde.
        </p>
      </section>

      <section style={card}>
        <h3 style={h3}>7. Technische und organisatorische Maßnahmen</h3>
        <ul>
          <Item>Authentifizierung, rollen- und mandantenbezogene Zugriffskontrolle.</Item>
          <Item>TLS/HTTPS für Übertragungen und geschützte Serverzugriffe.</Item>
          <Item>Versionierung, SHA-256-Integritätsnachweise und Auditprotokolle im DMS.</Item>
          <Item>Backups, Wiederherstellung und Zugriffsbeschränkungen auf Systemebene.</Item>
          <Item>Datenminimierung und Zweckbindung für Mobile-, Foto-, GPS- und KI-Funktionen.</Item>
        </ul>
      </section>

      <section style={card}>
        <h3 style={h3}>8. Pflichten vor Produktivbetrieb</h3>
        <p style={p}>
          Der Firmenadministrator muss insbesondere Verantwortlichen/Kontaktdaten,
          Berechtigungskonzept, Lösch- und Aufbewahrungsfristen, AV-Verträge,
          Verzeichnis der Verarbeitungstätigkeiten und – soweit erforderlich –
          Datenschutz-Folgenabschätzungen dokumentieren. RLC stellt hierfür technische
          Funktionen bereit; die konkrete betriebliche Rechtmäßigkeit hängt zusätzlich
          vom tatsächlichen Einsatz durch die jeweilige Firma ab.
        </p>
      </section>

      <section style={card}>
        <h3 style={h3}>Datenschutz-Center · operative Firmenkonfiguration</h3>
        <div style={grid3}>
          <label><span>Datenschutzkontakt</span><input style={input} value={profile.privacyContact||""} onChange={e=>setProfile({...profile,privacyContact:e.target.value})}/></label>
          <label><span>Datenschutzbeauftragter / Kontakt</span><input style={input} value={profile.dpoContact||""} onChange={e=>setProfile({...profile,dpoContact:e.target.value})}/></label>
          <label><span>Externe KI-Verarbeitung</span><select style={input} value={profile.aiExternalProcessingEnabled?"ON":"OFF"} onChange={e=>setProfile({...profile,aiExternalProcessingEnabled:e.target.value==="ON"})}><option value="OFF">AUS</option><option value="ON">EIN</option></select></label>
          <label><span>KI-Anbieter</span><input style={input} disabled={!profile.aiExternalProcessingEnabled} value={profile.aiProviderName||""} onChange={e=>setProfile({...profile,aiProviderName:e.target.value})}/></label>
          <label><span>KI-Zweck</span><input style={input} disabled={!profile.aiExternalProcessingEnabled} value={profile.aiPurpose||""} onChange={e=>setProfile({...profile,aiPurpose:e.target.value})}/></label>
          <label><span>KI-Rechtsgrundlage</span><input style={input} disabled={!profile.aiExternalProcessingEnabled} value={profile.aiLegalBasis||""} onChange={e=>setProfile({...profile,aiLegalBasis:e.target.value})}/></label>
          <label><span>KI Lösch-/Aufbewahrungsfrist (Tage)</span><input type="number" min={0} max={3650} style={input} disabled={!profile.aiExternalProcessingEnabled} value={profile.aiRetentionDays||0} onChange={e=>setProfile({...profile,aiRetentionDays:Number(e.target.value||0)})}/></label>
          <label style={{display:"flex",gap:7,alignItems:"center"}}><input type="checkbox" checked={Boolean(profile.aiThirdCountryTransfer)} onChange={e=>setProfile({...profile,aiThirdCountryTransfer:e.target.checked})}/> KI-Drittlandtransfer</label>
          <label><span>Transfermechanismus</span><input style={input} disabled={!profile.aiThirdCountryTransfer} value={profile.aiTransferMechanism||""} onChange={e=>setProfile({...profile,aiTransferMechanism:e.target.value})} placeholder="z. B. Angemessenheitsbeschluss / SCC"/></label>
        </div>
        <div style={{...grid3,marginTop:12}}>
          {[
            ["avvSigned","AVV / Art. 28 geprüft","avvReference"],["tomReviewed","TOM geprüft","tomReference"],["vvtReviewed","VVT gepflegt","vvtReference"],["deletionConceptReviewed","Löschkonzept geprüft","deletionConceptReference"]
          ].map(([flag,label,ref])=><div key={flag} style={{border:"1px solid #dbe4ef",borderRadius:8,padding:9}}><label style={{display:"flex",gap:7,alignItems:"center"}}><input type="checkbox" checked={Boolean(profile[flag])} onChange={e=>setProfile({...profile,[flag]:e.target.checked})}/><b>{label}</b></label><input style={{...input,marginTop:7}} value={profile[ref]||""} onChange={e=>setProfile({...profile,[ref]:e.target.value})} placeholder="Referenz / Ablageort"/></div>)}
          <div style={{border:"1px solid #dbe4ef",borderRadius:8,padding:9}}><label style={{display:"flex",gap:7}}><input type="checkbox" checked={Boolean(profile.dsfaRequired)} onChange={e=>setProfile({...profile,dsfaRequired:e.target.checked})}/><b>DSFA erforderlich</b></label><label style={{display:"flex",gap:7,marginTop:7}}><input type="checkbox" checked={Boolean(profile.dsfaCompleted)} onChange={e=>setProfile({...profile,dsfaCompleted:e.target.checked})}/>DSFA abgeschlossen</label><input style={{...input,marginTop:7}} value={profile.dsfaReference||""} onChange={e=>setProfile({...profile,dsfaReference:e.target.value})} placeholder="DSFA-Referenz"/></div>
        </div>
        <div style={{marginTop:12}}><button className="btn btn-primary" onClick={()=>void saveProfile()}>Datenschutz-Profil speichern</button></div>
      </section>

      <section style={card}>
        <h3 style={h3}>KI-Verarbeitungsprotokoll</h3>
        <p style={p}>Nur Metadaten: Anbieter, Modell, Funktion, Projekt/Position und Tokenverbrauch. Prompt- und Dokumentinhalte werden hier nicht gespeichert.</p>
        <div style={{display:"grid",gridTemplateColumns:"180px 180px 1fr",gap:9}}>
          <div style={{border:"1px solid #dbe4ef",borderRadius:8,padding:10}}><div style={p}>KI-Aufrufe</div><b style={{fontSize:22}}>{Number(aiAudit?.summary?.calls||0)}</b></div>
          <div style={{border:"1px solid #dbe4ef",borderRadius:8,padding:10}}><div style={p}>Token gesamt</div><b style={{fontSize:22}}>{Number(aiAudit?.summary?.totalTokens||0).toLocaleString("de-DE")}</b></div>
          <div style={{border:"1px solid #dbe4ef",borderRadius:8,padding:10}}><div style={p}>Provider / Modelle</div><b>{Object.entries(aiAudit?.summary?.byModel||{}).map(([k,v])=>`${k}: ${v}`).join(" · ") || "Noch keine protokollierten Aufrufe"}</b></div>
        </div>
        {Array.isArray(aiAudit?.items)&&aiAudit.items.length>0?<div style={{marginTop:10,maxHeight:220,overflow:"auto"}}>{aiAudit.items.slice(0,25).map((x:any)=><div key={x.id} style={{padding:"6px 0",borderBottom:"1px solid #edf2f7",fontSize:12}}><b>{x.feature}</b> · {x.provider}/{x.model} · {String(x.at||"").replace("T"," ").slice(0,19)} · {Number(x.totalTokens||0)} Token {x.projectCode?`· ${x.projectCode}`:""}</div>)}</div>:null}
      </section>

      <section style={card}>
        <div style={{display:"flex",alignItems:"center",gap:10}}><div><h3 style={h3}>Betroffenenanfragen</h3><div style={p}>Auskunft, Berichtigung, Löschung, Einschränkung, Übertragbarkeit, Widerspruch und Widerruf.</div></div><div style={{flex:1}}/>{!privacyDenied&&<button className="btn btn-primary" onClick={()=>void createRequest()}>+ Anfrage</button>}</div>
        {privacyDenied ? <div style={note}>Dieser Bereich ist auf berechtigte Datenschutz-/Administratorrollen beschränkt.</div> : <div style={{display:"grid",gridTemplateColumns:"minmax(280px,.65fr) minmax(520px,1.35fr)",gap:12,marginTop:10}}>
          <div>{requests.map((r:any)=><button key={r.id} onClick={()=>setSelected(r)} style={{width:"100%",textAlign:"left",padding:9,marginBottom:6,border:"1px solid #dbe4ef",borderRadius:8,background:selected?.id===r.id?"#eff6ff":"#fff"}}><b>{r.subjectName||"Ohne Name"}</b><div>{r.requestType} · {String(r.receivedAt||"").slice(0,10)} {r.evidenceLock?"· abgeschlossen":""}</div></button>)}</div>
          <div>{!selected?<div style={p}>Anfrage auswählen oder neu anlegen.</div>:<div style={{display:"grid",gap:9}}>
            <div style={{display:"flex",gap:8,alignItems:"center"}}><b>{selected.evidenceLock?"Abgeschlossene Anfrage":"Betroffenenanfrage bearbeiten"}</b><div style={{flex:1}}/>{selected.compliance?.deadline&&<span>Frist: {String(selected.compliance.deadline).slice(0,10)}</span>}<button className="btn" disabled={Boolean(selected.evidenceLock)} onClick={()=>void saveRequest(false)}>Speichern</button><button className="btn btn-primary" disabled={Boolean(selected.evidenceLock)} onClick={()=>void saveRequest(true)}>Abschließen</button></div>
            {selected.compliance?.warnings?.map((x:string)=><div key={x} style={{...note,borderColor:"#fde68a",background:"#fffbeb",color:"#92400e"}}>{x}</div>)}
            <div style={grid3}>
              <label><span>Recht</span><select disabled={Boolean(selected.evidenceLock)} style={input} value={selected.requestType||"ACCESS"} onChange={e=>patchRequest({requestType:e.target.value})}><option value="ACCESS">Art. 15 Auskunft</option><option value="RECTIFICATION">Art. 16 Berichtigung</option><option value="ERASURE">Art. 17 Löschung</option><option value="RESTRICTION">Art. 18 Einschränkung</option><option value="PORTABILITY">Art. 20 Datenübertragbarkeit</option><option value="OBJECTION">Art. 21 Widerspruch</option><option value="CONSENT_WITHDRAWAL">Einwilligung widerrufen</option></select></label>
              <label><span>Betroffene Person</span><input disabled={Boolean(selected.evidenceLock)} style={input} value={selected.subjectName||""} onChange={e=>patchRequest({subjectName:e.target.value})}/></label>
              <label><span>Kontakt</span><input disabled={Boolean(selected.evidenceLock)} style={input} value={selected.contact||""} onChange={e=>patchRequest({contact:e.target.value})}/></label>
              <label><span>Eingang</span><input disabled={Boolean(selected.evidenceLock)} type="date" style={input} value={String(selected.receivedAt||"").slice(0,10)} onChange={e=>patchRequest({receivedAt:e.target.value})}/></label>
              <label><span>Identität geprüft am</span><input disabled={Boolean(selected.evidenceLock)} type="date" style={input} value={String(selected.identityVerifiedAt||"").slice(0,10)} onChange={e=>patchRequest({identityVerifiedAt:e.target.value||null})}/></label>
              <label><span>Status</span><select disabled={Boolean(selected.evidenceLock)} style={input} value={selected.status||"OPEN"} onChange={e=>patchRequest({status:e.target.value})}><option value="OPEN">Offen</option><option value="IN_PROGRESS">In Bearbeitung</option><option value="COMPLETED">Erledigt</option><option value="REJECTED">Abgelehnt</option><option value="WITHDRAWN">Zurückgezogen</option></select></label>
              <label style={{display:"flex",gap:7,alignItems:"center"}}><input type="checkbox" disabled={Boolean(selected.evidenceLock)} checked={Boolean(selected.extended)} onChange={e=>patchRequest({extended:e.target.checked})}/> Fristverlängerung</label>
              <label><span>Verlängerungsgrund</span><input disabled={Boolean(selected.evidenceLock)||!selected.extended} style={input} value={selected.extensionReason||""} onChange={e=>patchRequest({extensionReason:e.target.value})}/></label>
              <label><span>Verlängerung mitgeteilt am</span><input disabled={Boolean(selected.evidenceLock)||!selected.extended} type="date" style={input} value={String(selected.extensionNotifiedAt||"").slice(0,10)} onChange={e=>patchRequest({extensionNotifiedAt:e.target.value||null})}/></label>
            </div>
            <label><span>Beschreibung / Umfang</span><textarea disabled={Boolean(selected.evidenceLock)} style={{...input,minHeight:75}} value={selected.description||""} onChange={e=>patchRequest({description:e.target.value})}/></label>
            <label><span>Antwort-/Exportreferenz</span><input disabled={Boolean(selected.evidenceLock)} style={input} value={selected.responseReference||""} onChange={e=>patchRequest({responseReference:e.target.value})}/></label>
            <label><span>Ablehnungsgrund / Rechtsgrund</span><textarea disabled={Boolean(selected.evidenceLock)} style={{...input,minHeight:65}} value={selected.rejectionReason||""} onChange={e=>patchRequest({rejectionReason:e.target.value})}/></label>
          </div>}</div>
        </div>}
      </section>

      {message&&<div style={note}>{message}</div>}
    </div>
  );
}
