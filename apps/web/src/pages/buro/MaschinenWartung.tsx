import React from "react";
import {useSearchParams} from "react-router-dom";
import { apiUrl } from "../../lib/apiBase";

type Machine = {
  id: string;
  name: string;
  hours?: number;
};

type Maintenance = {
  id: string;
  machineId: string;
  date: string;
  hours: number;
  type?: string | null;
  workshop?: string | null;
  technician?: string | null;
  costNet: number;
  notes?: string | null;
  nextService?: string | null;
  status: string;
  machine?: Machine;
  isInspection?: boolean;
  inspectionKind?: string;
  equipmentIdentification?: string;
  inspectionBasis?: string;
  inspectionScope?: string;
  technicalMeasuresSuitable?: boolean;
  organisationalMeasuresSuitable?: boolean;
  inspectionResult?: string;
  inspectorQualifiedPerson?: string;
  inspectorSignatureConfirmed?: boolean;
  approvedBody?: string;
  nextInspection?: string;
  operatingLocation?: string;
  overwachungsbeduerftigeAnlage?: boolean;
  evidenceLock?: any;
};

function token() {
  for (const storage of [localStorage, sessionStorage]) {
    for (const key of ["rlc_token","token","authToken","accessToken","rlc_auth_token"]) {
      const value = storage.getItem(key);
      if (value?.trim()) return value.trim();
    }
  }
  return "";
}

async function request(path: string, init: RequestInit = {}) {
  const auth = token();

  const res = await fetch(apiUrl(path), {
    credentials: "include",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      ...(init.headers || {})
    }
  });

  const data = await res.json().catch(() => null);

  if (!res.ok || data?.ok === false) {
    throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
  }

  return data;
}

function dateInput(value?: string | null) {
  return value ? String(value).slice(0, 10) : "";
}

const field: React.CSSProperties = {
  width: "100%",
  border: "1px solid #d7deea",
  borderRadius: 7,
  padding: "8px 9px"
};

export default function MaschinenWartung({onDirtyChange}:{onDirtyChange?:(dirty:boolean)=>void}={}) {
  const [params]=useSearchParams();
  const [busy,setBusy]=React.useState(false),[error,setError]=React.useState(""),[message,setMessage]=React.useState(""),[history,setHistory]=React.useState<any[]>([]);
  const guard=React.useRef(false);
  const [machines, setMachines] = React.useState<Machine[]>([]);
  const [items, setItems] = React.useState<Maintenance[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(params.get("maintenanceId"));
  const [draft, setDraft] = React.useState<any>(null);
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(()=>{onDirtyChange?.(dirty);return()=>onDirtyChange?.(false);},[dirty,onDirtyChange]);
  const load = React.useCallback(async () => {
    setBusy(true);try{
    const [m, w, deadlines] = await Promise.all([
      request("/api/resource-costs/machines"),
      request("/api/resource-costs/machine-maintenance"),
      request("/api/resource-costs/machine-deadlines")
    ]);

    const allowed=new Set((deadlines.items||[]).map((x:any)=>x.machineId));
    setMachines(Array.isArray(m?.items) ? m.items.filter((x:any)=>allowed.has(x.id)) : []);
    setItems(Array.isArray(w?.items) ? w.items : []);
    }catch(e:any){setError(e.message);}finally{setBusy(false);}
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    const item = items.find((x) => x.id === selectedId);

    setDraft(item ? {
      ...item,
      date: dateInput(item.date),
      nextService: dateInput(item.nextService),
      nextInspection: dateInput(item.nextInspection)
    } : null);

    setDirty(false);
  }, [selectedId, items]);

  React.useEffect(()=>{if(!dirty)return;const f=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue="";};window.addEventListener("beforeunload",f);return()=>window.removeEventListener("beforeunload",f);},[dirty]);
  React.useEffect(()=>{let live=true;setHistory([]);if(selectedId)request("/api/resource-costs/machine-maintenance/"+encodeURIComponent(selectedId)+"/history").then(d=>{if(live)setHistory(d.items||[]);}).catch(()=>{if(live)setHistory([{id:"error",error:true}]);});return()=>{live=false;};},[selectedId,items]);
  const create = () => {
    if(busy||dirty&&!window.confirm("Ungespeicherte Änderungen verwerfen?"))return;
    const machine = machines[0];
    if (!machine) return;

    setSelectedId(null);
    setDraft({
      machineId: machine.id,
      date: new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Berlin",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()),
      hours: Number(machine.hours || 0),
      type: "Wartung",
      workshop: "",
      technician: "",
      costNet: 0,
      notes: "",
      nextService: "",
      status: "ERLEDIGT",
      isInspection: false,
      inspectionKind: "Wiederkehrende Prüfung",
      equipmentIdentification: "",
      inspectionBasis: "BetrSichV § 14",
      inspectionScope: "",
      technicalMeasuresSuitable: false,
      organisationalMeasuresSuitable: false,
      inspectionResult: "",
      inspectorQualifiedPerson: "",
      inspectorSignatureConfirmed: false,
      approvedBody: "",
      nextInspection: "",
      operatingLocation: "",
      overwachungsbeduerftigeAnlage: false
    });
    setDirty(true);
  };

  const save = async () => {
    if (!draft||guard.current||busy) return;
    guard.current=true;setBusy(true);setError("");setMessage("");
    try{

    const body = {
      ...draft,
      expectedUpdatedAt:draft.updatedAt,
      date: draft.date ? `${draft.date}T12:00:00.000Z` : null,
      nextService: draft.nextService ? `${draft.nextService}T12:00:00.000Z` : null,
      nextInspection: draft.nextInspection ? `${draft.nextInspection}T12:00:00.000Z` : null
    };

    let saved:any;
    if (draft.id) {
      saved=await request(`/api/resource-costs/machine-maintenance/${draft.id}`, {
        method: "PUT",
        body: JSON.stringify(body)
      });
    } else {
      const r = await request("/api/resource-costs/machine-maintenance", {
        method: "POST",
        body: JSON.stringify(body)
      });
      saved=r;
      if (r?.item?.id) setSelectedId(r.item.id);
    }

    if(saved?.item){const row={...saved.item,machine:machines.find(x=>x.id===saved.item.machineId)};setItems(current=>current.some(x=>x.id===row.id)?current.map(x=>x.id===row.id?row:x):[row,...current]);}
    await load();
    setDirty(false);setMessage("Wartung gespeichert.");
    }catch(e:any){setError(e.message);}finally{guard.current=false;setBusy(false);}
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {error&&<div className="card" role="alert">{error}</div>}{message&&<div className="card" role="status">{message}</div>}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,minmax(0,1fr))",
          gap: 10
        }}
      >
        <div className="card"><div className="muted">Wartungen</div><b style={{fontSize:24}}>{items.length}</b></div>
        <div className="card"><div className="muted">Maschinen</div><b style={{fontSize:24}}>{machines.length}</b></div>
        <div className="card"><div className="muted">Kosten erledigter Vorgänge</div><b style={{fontSize:24}}>{items.filter(x=>x.status==="ERLEDIGT").reduce((s,x)=>s+Number(x.costNet||0),0).toFixed(2)} €</b></div>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,360px),1fr))",
          gap: 12
        }}
      >
        <div className="card">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              paddingBottom: 10,
              marginBottom: 10,
              borderBottom: "1px solid #e4eaf2"
            }}
          >
            <strong>Wartungshistorie</strong>
            <div style={{flex:1}} />
            <button className="btn btn-primary" disabled={busy} onClick={create}>+ Wartung</button>
          </div>

          {items.map(item => (
            <button
              key={item.id}
              disabled={busy} onClick={() => {if(dirty&&!window.confirm("Ungespeicherte Änderungen verwerfen?"))return;setSelectedId(item.id);}}
              style={{
                width:"100%",textAlign:"left",padding:9,marginBottom:6,
                border:"1px solid #e4eaf2",borderRadius:8,
                background:selectedId===item.id?"#eff6ff":"#fff"
              }}
            >
              <b>{item.machine?.name || "Maschine"}</b>
              <div className="muted">{dateInput(item.date)} · {item.type || "Wartung"}</div>
            </button>
          ))}
        </div>

        <div className="card">
          {!draft ? <div className="muted">Wartung auswählen oder neu anlegen.</div> : (
            <fieldset disabled={busy||Boolean(draft.evidenceLock)} style={{display:"grid",gap:10,border:0,padding:0}}> 
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  paddingBottom: 10,
                  borderBottom: "1px solid #e4eaf2"
                }}
              >
                <strong style={{fontSize:18}}>Wartungsdatensatz</strong>
                <div style={{flex:1}} />
                {dirty && <span style={{fontSize:11,color:"#b54708",marginRight:8}}>Ungespeichert</span>}
                {draft.evidenceLock ? <span style={{fontSize:11,color:"#067647",marginRight:8}}>Prüfnachweis gesperrt</span> : null}
                <button className="btn btn-primary" disabled={!dirty || Boolean(draft.evidenceLock)} onClick={() => void save()}>Speichern</button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10
                }}
              >
              <div>
                <label className="muted">Maschine</label>
                <select disabled={!!draft.id} style={field} value={draft.machineId} onChange={e=>{setDraft({...draft,machineId:e.target.value});setDirty(true);}}>
                {machines.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>

              <div>
                <label className="muted">Datum</label>
                <input type="date" style={field} value={draft.date} onChange={e=>{setDraft({...draft,date:e.target.value});setDirty(true);}} />
              </div>

              <div>
                <label className="muted">Art</label>
                <input style={field} placeholder="Art" value={draft.type || ""} onChange={e=>{setDraft({...draft,type:e.target.value});setDirty(true);}} />
              </div>

              <div>
                <label className="muted">Werkstatt</label>
                <input style={field} placeholder="Werkstatt" value={draft.workshop || ""} onChange={e=>{setDraft({...draft,workshop:e.target.value});setDirty(true);}} />
              </div>

              <div>
                <label className="muted">Techniker</label>
                <input style={field} placeholder="Techniker" value={draft.technician || ""} onChange={e=>{setDraft({...draft,technician:e.target.value});setDirty(true);}} />
              </div>

              <div>
                <label className="muted">Kosten netto (€)</label>
                <input type="number" step="0.01" style={field} value={draft.costNet || 0} onChange={e=>{setDraft({...draft,costNet:Number(e.target.value)||0});setDirty(true);}} />
              </div>

              <div>
                <label className="muted">Nächster Service</label>
                <input type="date" style={field} value={draft.nextService || ""} onChange={e=>{setDraft({...draft,nextService:e.target.value});setDirty(true);}} />

              </div>

              <div>
                <label className="muted">Status</label>
                <select style={field} value={draft.status || "ERLEDIGT"} onChange={e=>{setDraft({...draft,status:e.target.value});setDirty(true);}}>
                <option value="GEPLANT">Geplant</option>
                <option value="OFFEN">Offen</option>
                <option value="ERLEDIGT">Erledigt</option>
                </select>
              </div>
              </div>

              <div style={{ borderTop: "1px solid #e4eaf2", paddingTop: 12, display:"grid", gap:10 }}>
                <label style={{display:"flex",gap:8,alignItems:"center",fontWeight:700}}>
                  <input type="checkbox" disabled={Boolean(draft.evidenceLock)} checked={Boolean(draft.isInspection)} onChange={e=>{setDraft({...draft,isInspection:e.target.checked,type:e.target.checked?"BetrSichV-Prüfung":draft.type});setDirty(true);}} />
                  Prüfnachweis nach BetrSichV führen
                </label>
                {draft.isInspection ? <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <div><label className="muted">Arbeitsmittel-/Anlagenidentifikation *</label><input disabled={Boolean(draft.evidenceLock)} style={field} value={draft.equipmentIdentification||""} onChange={e=>{setDraft({...draft,equipmentIdentification:e.target.value});setDirty(true);}} /></div>
                  <div><label className="muted">Art der Prüfung *</label><input disabled={Boolean(draft.evidenceLock)} style={field} value={draft.inspectionKind||""} onChange={e=>{setDraft({...draft,inspectionKind:e.target.value});setDirty(true);}} /></div>
                  <div><label className="muted">Prüfungsgrundlage *</label><input disabled={Boolean(draft.evidenceLock)} style={field} value={draft.inspectionBasis||""} onChange={e=>{setDraft({...draft,inspectionBasis:e.target.value});setDirty(true);}} /></div>
                  <div><label className="muted">Prüfumfang *</label><input disabled={Boolean(draft.evidenceLock)} style={field} value={draft.inspectionScope||""} onChange={e=>{setDraft({...draft,inspectionScope:e.target.value});setDirty(true);}} /></div>
                  <div><label className="muted">Prüfer / befähigte Person *</label><input disabled={Boolean(draft.evidenceLock)} style={field} value={draft.inspectorQualifiedPerson||""} onChange={e=>{setDraft({...draft,inspectorQualifiedPerson:e.target.value,technician:e.target.value});setDirty(true);}} /></div>
                  <div><label className="muted">Zugelassene Überwachungsstelle</label><input disabled={Boolean(draft.evidenceLock)} style={field} value={draft.approvedBody||""} onChange={e=>{setDraft({...draft,approvedBody:e.target.value});setDirty(true);}} /></div>
                  <div><label className="muted">Prüfergebnis *</label><select disabled={Boolean(draft.evidenceLock)} style={field} value={draft.inspectionResult||""} onChange={e=>{setDraft({...draft,inspectionResult:e.target.value});setDirty(true);}}><option value="">Bitte wählen</option><option value="OHNE_MAENGEL">ohne Mängel</option><option value="MIT_MAENGELN_WEITERBETRIEB">Mängel – Weiterbetrieb zulässig</option><option value="NICHT_BETRIEBSSICHER">nicht betriebssicher</option></select></div>
                  <div><label className="muted">Nächste Prüfung *</label><input disabled={Boolean(draft.evidenceLock)} type="date" style={field} value={draft.nextInspection||""} onChange={e=>{setDraft({...draft,nextInspection:e.target.value,nextService:e.target.value});setDirty(true);}} /></div>
                  <div><label className="muted">Betriebs-/Einsatzort</label><input disabled={Boolean(draft.evidenceLock)} style={field} value={draft.operatingLocation||""} onChange={e=>{setDraft({...draft,operatingLocation:e.target.value});setDirty(true);}} /></div>
                  <label style={{display:"flex",gap:8,alignItems:"center"}}><input disabled={Boolean(draft.evidenceLock)} type="checkbox" checked={Boolean(draft.overwachungsbeduerftigeAnlage)} onChange={e=>{setDraft({...draft,overwachungsbeduerftigeAnlage:e.target.checked});setDirty(true);}} /> Überwachungsbedürftige Anlage</label>
                  <label style={{display:"flex",gap:8,alignItems:"center"}}><input disabled={Boolean(draft.evidenceLock)} type="checkbox" checked={Boolean(draft.technicalMeasuresSuitable)} onChange={e=>{setDraft({...draft,technicalMeasuresSuitable:e.target.checked});setDirty(true);}} /> Technische Maßnahmen geeignet/funktionsfähig</label>
                  <label style={{display:"flex",gap:8,alignItems:"center"}}><input disabled={Boolean(draft.evidenceLock)} type="checkbox" checked={Boolean(draft.organisationalMeasuresSuitable)} onChange={e=>{setDraft({...draft,organisationalMeasuresSuitable:e.target.checked});setDirty(true);}} /> Organisatorische Maßnahmen geeignet</label>
                  <label style={{display:"flex",gap:8,alignItems:"center",gridColumn:"span 2"}}><input disabled={Boolean(draft.evidenceLock)} type="checkbox" checked={Boolean(draft.inspectorSignatureConfirmed)} onChange={e=>{setDraft({...draft,inspectorSignatureConfirmed:e.target.checked});setDirty(true);}} /> Unterschrift / elektronische Signatur des Prüfers bestätigt *</label>
                </div> : null}
              </div>

              <div
                style={{
                  borderTop: "1px solid #e4eaf2",
                  paddingTop: 10
                }}
              >
                <label className="muted">Bemerkungen</label>
                <textarea
                  style={{
                    ...field,
                    minHeight: 110,
                    resize: "vertical"
                  }} disabled={Boolean(draft.evidenceLock)} value={draft.notes || ""} onChange={e=>{setDraft({...draft,notes:e.target.value});setDirty(true);}} />
              </div>
            </fieldset>
          )}
        </div>
      </section>
      {!!selectedId&&<section className="card"><h3>Änderungsverlauf</h3>{history.map(h=><div key={h.id}>{h.error?<p role="alert">Verlauf konnte nicht geladen werden.</p>:<p>{new Date(h.createdAt).toLocaleString("de-DE")} · {h.meta?.after?.status||h.action} · {h.userId}</p>}</div>)}</section>}
    </div>
  );
}