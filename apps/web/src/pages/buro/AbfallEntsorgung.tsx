import React from "react";
import { apiUrl } from "../../lib/apiBase";

type Project={id:string;code?:string|null;name?:string|null};
type Compliance={valid:boolean;errors:string[];warnings:string[];gewabfDocumentationRequired:boolean;hazardousEvidenceRequired:boolean;ebvDocumentationRequired:boolean};
type WasteRecord={
  id:string; date?:string; status?:string; wasteCode?:string; description?:string; hazardous?:boolean;
  quantity?:number; quantityUnit?:string; carrierName?:string; receiverName?:string; receiverAddress?:string;
  recoveryMethod?:string; destination?:string; separateCollection?:boolean; separationDeviationReason?:string;
  evidenceRefs?:string; receiverDeclaration?:string; disposalProofNumber?:string; consignmentNoteNumber?:string;
  ebvRelevant?:boolean; materialClass?:string; deliveryNoteNumber?:string; placingLocation?:string;
  placingMethod?:string; groundwaterCoverSoil?:string; coverSheetPresent?:boolean;
  notificationRequired?:boolean; preNotificationSubmittedAt?:string|null; finalNotificationSubmittedAt?:string|null;
  measureCompleted?:boolean; evidenceLock?:any; compliance?:Compliance;
};
function token(){for(const s of [localStorage,sessionStorage])for(const k of ["rlc_token","token","authToken","accessToken","rlc_auth_token"]){const v=s.getItem(k);if(v?.trim())return v.trim();}return "";}
async function request(path:string,init:RequestInit={}){const t=token();const r=await fetch(apiUrl(path),{credentials:"include",...init,headers:{Accept:"application/json",...(init.body?{"Content-Type":"application/json"}:{}),...(t?{Authorization:`Bearer ${t}`}:{}),...(init.headers||{})}});const d=await r.json().catch(()=>null);if(!r.ok||d?.ok===false)throw new Error(d?.message||d?.error||`HTTP ${r.status}`);return d;}
const field:React.CSSProperties={width:"100%",border:"1px solid #d7deea",borderRadius:7,padding:"8px 9px",boxSizing:"border-box"};
const grid:React.CSSProperties={display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:10};

export default function AbfallEntsorgung(){
  const [projects,setProjects]=React.useState<Project[]>([]);
  const [project,setProject]=React.useState("");
  const [meta,setMeta]=React.useState<any>({totalWasteVolumeM3:0,producerName:"",producerAddress:"",ownerName:""});
  const [rows,setRows]=React.useState<WasteRecord[]>([]);
  const [selected,setSelected]=React.useState<string|null>(null);
  const [draft,setDraft]=React.useState<WasteRecord|null>(null);
  const [dirty,setDirty]=React.useState(false);
  const [error,setError]=React.useState("");

  React.useEffect(()=>{void request("/api/projects").then(d=>setProjects(Array.isArray(d.projects)?d.projects:[])).catch(e=>setError(e.message));},[]);
  const load=React.useCallback(async(p:string)=>{setProject(p);setError("");setSelected(null);setDraft(null);if(!p){setRows([]);return;}try{const d=await request(`/api/waste-compliance/${encodeURIComponent(p)}`);setMeta(d.data?.project||{totalWasteVolumeM3:0});setRows(Array.isArray(d.data?.records)?d.data.records:[]);}catch(e:any){setError(e.message);}},[]);
  React.useEffect(()=>{const x=rows.find(r=>r.id===selected)||null;setDraft(x?{...x}:null);setDirty(false);},[rows,selected]);

  const saveMeta=async()=>{if(!project)return;await request(`/api/waste-compliance/${encodeURIComponent(project)}/project`,{method:"PUT",body:JSON.stringify(meta)});await load(project);};
  const create=async()=>{if(!project)return;const d=await request(`/api/waste-compliance/${encodeURIComponent(project)}/records`,{method:"POST",body:JSON.stringify({date:new Date().toISOString().slice(0,10),quantityUnit:"t",separateCollection:true,hazardous:false,ebvRelevant:false,status:"OPEN"})});await load(project);setSelected(d.record.id);};
  const save=async(finalize=false)=>{if(!project||!draft)return;try{const d=await request(`/api/waste-compliance/${encodeURIComponent(project)}/records/${draft.id}`,{method:"PUT",body:JSON.stringify({...draft,status:finalize?"FINAL":draft.status||"OPEN"})});await load(project);setSelected(d.record.id);setDirty(false);}catch(e:any){setError(e.message);}};
  const patch=(x:Partial<WasteRecord>)=>{if(draft&&!draft.evidenceLock){setDraft({...draft,...x});setDirty(true);}};
  const compliance=draft?.compliance;
  const locked=Boolean(draft?.evidenceLock);

  return <div style={{display:"grid",gap:12}}>
    <section className="card" style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
      <div><strong style={{fontSize:18}}>Abfall / Entsorgung</strong><div className="muted">GewAbfV · ErsatzbaustoffV · NachweisV</div></div>
      <div style={{flex:1}}/>
      <select style={{...field,width:360}} value={project} onChange={e=>void load(e.target.value)}>
        <option value="">Projekt auswählen</option>{projects.map(p=><option key={p.id} value={p.code||p.id}>{p.code||p.id}{p.name?` · ${p.name}`:""}</option>)}
      </select>
    </section>

    {project&&<section className="card" style={grid}>
      <label><span className="muted">Gesamtes Abfallvolumen Bau-/Abbruchmaßnahme (m³)</span><input type="number" min={0} style={field} value={meta.totalWasteVolumeM3||0} onChange={e=>setMeta({...meta,totalWasteVolumeM3:Number(e.target.value||0)})}/></label>
      <label><span className="muted">Abfallerzeuger / Besitzer</span><input style={field} value={meta.producerName||""} onChange={e=>setMeta({...meta,producerName:e.target.value})}/></label>
      <label><span className="muted">Anschrift Erzeuger</span><input style={field} value={meta.producerAddress||""} onChange={e=>setMeta({...meta,producerAddress:e.target.value})}/></label>
      <label><span className="muted">Bauherr / Grundstückseigentümer</span><input style={field} value={meta.ownerName||""} onChange={e=>setMeta({...meta,ownerName:e.target.value})}/></label>
      <div style={{alignSelf:"end"}}><button className="btn" onClick={()=>void saveMeta()}>Projektdaten speichern</button></div>
      <div className="muted" style={{alignSelf:"end"}}>{Number(meta.totalWasteVolumeM3||0)>10?"GewAbfV-Dokumentation erforderlich":"≤ 10 m³: GewAbfV-Ausnahme für §§8/9-Dokumentation; andere Pflichten bleiben bestehen."}</div>
    </section>}

    {project&&<section style={{display:"grid",gridTemplateColumns:"minmax(320px,.65fr) minmax(700px,1.35fr)",gap:12}}>
      <div className="card">
        <div style={{display:"flex",alignItems:"center",marginBottom:10}}><strong>Entsorgungsnachweise</strong><div style={{flex:1}}/><button className="btn btn-primary" onClick={()=>void create()}>+ Nachweis</button></div>
        {rows.map(r=><button key={r.id} onClick={()=>setSelected(r.id)} style={{width:"100%",textAlign:"left",padding:9,marginBottom:6,border:"1px solid #e4eaf2",borderRadius:8,background:selected===r.id?"#eff6ff":"#fff"}}>
          <b>{r.wasteCode||"ohne AVV"} · {r.description||"Neuer Nachweis"}</b><div className="muted">{r.date||""} · {r.quantity||0} {r.quantityUnit||""} {r.evidenceLock?"· abgeschlossen":""}</div>
        </button>)}
      </div>

      <div className="card">
        {!draft?<div className="muted">Nachweis auswählen oder neu anlegen.</div>:<div style={{display:"grid",gap:12}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}><strong style={{fontSize:18}}>Abfall-/Entsorgungsnachweis</strong><div style={{flex:1}}/>{locked?<span style={{color:"#067647",fontSize:12}}>gesperrt · Hash vorhanden</span>:null}<button className="btn" disabled={!dirty||locked} onClick={()=>void save(false)}>Speichern</button><button className="btn btn-primary" disabled={locked||Boolean(compliance&&!compliance.valid)} onClick={()=>void save(true)}>Nachweis abschließen</button></div>
          {compliance?.errors?.length?<div style={{padding:10,border:"1px solid #fecaca",background:"#fef2f2",borderRadius:8,color:"#991b1b"}}><b>Pflichtangaben fehlen</b><ul>{compliance.errors.map(x=><li key={x}>{x}</li>)}</ul></div>:null}
          {compliance?.warnings?.length?<div style={{padding:10,border:"1px solid #fde68a",background:"#fffbeb",borderRadius:8}}><ul>{compliance.warnings.map(x=><li key={x}>{x}</li>)}</ul></div>:null}
          <div style={grid}>
            <label><span className="muted">Datum</span><input disabled={locked} type="date" style={field} value={(draft.date||"").slice(0,10)} onChange={e=>patch({date:e.target.value})}/></label>
            <label><span className="muted">AVV-Abfallschlüssel *</span><input disabled={locked} style={field} value={draft.wasteCode||""} onChange={e=>patch({wasteCode:e.target.value})} placeholder="z. B. 17 01 01"/></label>
            <label><span className="muted">Bezeichnung *</span><input disabled={locked} style={field} value={draft.description||""} onChange={e=>patch({description:e.target.value})}/></label>
            <label><span className="muted">Menge *</span><input disabled={locked} type="number" step="0.001" style={field} value={draft.quantity||0} onChange={e=>patch({quantity:Number(e.target.value||0)})}/></label>
            <label><span className="muted">Einheit *</span><select disabled={locked} style={field} value={draft.quantityUnit||"t"} onChange={e=>patch({quantityUnit:e.target.value})}><option value="t">t</option><option value="m3">m³</option><option value="kg">kg</option></select></label>
            <label style={{display:"flex",gap:8,alignItems:"center"}}><input disabled={locked} type="checkbox" checked={Boolean(draft.hazardous)} onChange={e=>patch({hazardous:e.target.checked})}/> gefährlicher Abfall</label>
            <label><span className="muted">Beförderer *</span><input disabled={locked} style={field} value={draft.carrierName||""} onChange={e=>patch({carrierName:e.target.value})}/></label>
            <label><span className="muted">Übernehmer / Entsorger *</span><input disabled={locked} style={field} value={draft.receiverName||""} onChange={e=>patch({receiverName:e.target.value})}/></label>
            <label><span className="muted">Anschrift Übernehmer *</span><input disabled={locked} style={field} value={draft.receiverAddress||""} onChange={e=>patch({receiverAddress:e.target.value})}/></label>
            <label><span className="muted">Verwertungs-/Entsorgungsart *</span><input disabled={locked} style={field} value={draft.recoveryMethod||""} onChange={e=>patch({recoveryMethod:e.target.value})}/></label>
            <label><span className="muted">Verbleib / Ziel *</span><input disabled={locked} style={field} value={draft.destination||""} onChange={e=>patch({destination:e.target.value})}/></label>
            <label style={{display:"flex",gap:8,alignItems:"center"}}><input disabled={locked} type="checkbox" checked={Boolean(draft.separateCollection)} onChange={e=>patch({separateCollection:e.target.checked})}/> getrennt gesammelt</label>
          </div>

          <div style={grid}>
            <label><span className="muted">Abweichung Getrenntsammlung – Begründung</span><textarea disabled={locked} style={{...field,minHeight:72}} value={draft.separationDeviationReason||""} onChange={e=>patch({separationDeviationReason:e.target.value})}/></label>
            <label><span className="muted">Lageplan/Fotos/Liefer-/Wiegeschein – Referenzen</span><textarea disabled={locked} style={{...field,minHeight:72}} value={draft.evidenceRefs||""} onChange={e=>patch({evidenceRefs:e.target.value})}/></label>
            <label><span className="muted">Übernehmererklärung</span><textarea disabled={locked} style={{...field,minHeight:72}} value={draft.receiverDeclaration||""} onChange={e=>patch({receiverDeclaration:e.target.value})}/></label>
          </div>

          {draft.hazardous?<div style={grid}>
            <label><span className="muted">Entsorgungs-/Sammelentsorgungsnachweis Nr. *</span><input disabled={locked} style={field} value={draft.disposalProofNumber||""} onChange={e=>patch({disposalProofNumber:e.target.value})}/></label>
            <label><span className="muted">Begleitschein / Übernahmeschein Nr. *</span><input disabled={locked} style={field} value={draft.consignmentNoteNumber||""} onChange={e=>patch({consignmentNoteNumber:e.target.value})}/></label>
          </div>:null}

          <div style={{borderTop:"1px solid #e4eaf2",paddingTop:10}}>
            <label style={{display:"flex",gap:8,alignItems:"center",fontWeight:700}}><input disabled={locked} type="checkbox" checked={Boolean(draft.ebvRelevant)} onChange={e=>patch({ebvRelevant:e.target.checked})}/> Mineralischer Ersatzbaustoff / EBV relevant</label>
          </div>
          {draft.ebvRelevant?<div style={grid}>
            <label><span className="muted">Materialklasse *</span><input disabled={locked} style={field} value={draft.materialClass||""} onChange={e=>patch({materialClass:e.target.value})}/></label>
            <label><span className="muted">Lieferscheinnummer *</span><input disabled={locked} style={field} value={draft.deliveryNoteNumber||""} onChange={e=>patch({deliveryNoteNumber:e.target.value})}/></label>
            <label><span className="muted">Einbauort *</span><input disabled={locked} style={field} value={draft.placingLocation||""} onChange={e=>patch({placingLocation:e.target.value})}/></label>
            <label><span className="muted">Einbauweise / Anlage-Nr. *</span><input disabled={locked} style={field} value={draft.placingMethod||""} onChange={e=>patch({placingMethod:e.target.value})}/></label>
            <label><span className="muted">Grundwasserdeckschicht *</span><input disabled={locked} style={field} value={draft.groundwaterCoverSoil||""} onChange={e=>patch({groundwaterCoverSoil:e.target.value})} placeholder="Sand / Lehm, Schluff oder Ton"/></label>
            <label style={{display:"flex",gap:8,alignItems:"center"}}><input disabled={locked} type="checkbox" checked={Boolean(draft.coverSheetPresent)} onChange={e=>patch({coverSheetPresent:e.target.checked})}/> Deckblatt nach §25 vorhanden *</label>
            <label style={{display:"flex",gap:8,alignItems:"center"}}><input disabled={locked} type="checkbox" checked={Boolean(draft.notificationRequired)} onChange={e=>patch({notificationRequired:e.target.checked})}/> Vor-/Abschlussanzeige erforderlich</label>
            <label><span className="muted">Voranzeige übermittelt am</span><input disabled={locked} type="date" style={field} value={(draft.preNotificationSubmittedAt||"").slice(0,10)} onChange={e=>patch({preNotificationSubmittedAt:e.target.value||null})}/></label>
            <label style={{display:"flex",gap:8,alignItems:"center"}}><input disabled={locked} type="checkbox" checked={Boolean(draft.measureCompleted)} onChange={e=>patch({measureCompleted:e.target.checked})}/> Baumaßnahme / Einbau abgeschlossen</label>
            <label><span className="muted">Abschlussanzeige übermittelt am</span><input disabled={locked} type="date" style={field} value={(draft.finalNotificationSubmittedAt||"").slice(0,10)} onChange={e=>patch({finalNotificationSubmittedAt:e.target.value||null})}/></label>
          </div>:null}
        </div>}
      </div>
    </section>}
    {error?<div className="card" style={{color:"#b42318"}}>{error}</div>:null}
  </div>;
}
