import React from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "../../lib/apiBase";
import { useProject } from "../../store/useProject";

type Kind = "guarantees" | "certificates";
type Item = { supplierPartyId?: string | null; supplierParty?: {id:string;name:string} | null; id: string; title: string; number?: string; issuer: string; amount?: string; type: string; status: string; validFrom?: string | null; validUntil?: string | null; contractId?: string | null; documentId?: string | null; notes?: string | null; revision: number; expiry: string; contract?: {title: string; partner?: string}; document?: {name: string}; reviewedAt?: string | null };
type Form = { supplierPartyId:string; title: string; number: string; issuer: string; amount: string; type: string; status: string; validFrom: string; validUntil: string; contractId: string; documentId: string; notes: string };
const guaranteeTypes = ["Vertragserfüllung", "Gewährleistung", "Vorauszahlung", "Sonstige"];
const guaranteeStatuses = ["Entwurf", "Aktiv", "Freigabe beantragt", "Zurückgegeben", "Archiviert"];
const certificateTypes = ["Freistellungsbescheinigung", "Unbedenklichkeitsbescheinigung", "Versicherung", "Gewerbeanmeldung", "Qualifikation", "Sonstige"];
const certificateStatuses = ["Ungeprüft", "Geprüft", "Abgelehnt", "Archiviert"];
function token() {
  for (const key of ["rlc_token", "token", "authToken", "accessToken", "rlc_auth_token", "rlc_access_token", "rlc.auth.token"])
    for (const s of [localStorage, sessionStorage]) { const v = s.getItem(key); if (v?.trim()) return v.trim(); }
  return "";
}
async function request(path: string, init?: RequestInit) {
  const t = token();
  const r = await fetch(API_BASE + path, { credentials: "include", ...init, headers: { Accept: "application/json", ...(init?.body ? {"Content-Type": "application/json"} : {}), ...(t ? { Authorization: "Bearer " + t } : {}), ...init?.headers } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.ok === false) throw new Error(data.error || "Vorgang fehlgeschlagen (" + r.status + ").");
  return data;
}
function blank(kind: Kind): Form { return {supplierPartyId:"", title: "", number: "", issuer: "", amount: "0.00", type: kind === "guarantees" ? guaranteeTypes[0] : certificateTypes[0], status: kind === "guarantees" ? "Entwurf" : "Ungeprüft", validFrom: "", validUntil: "", contractId: "", documentId: "", notes: ""}; }
function toForm(row: Item, kind: Kind): Form { return { ...blank(kind), ...row, supplierPartyId:row.supplierPartyId||"", number: row.number || "", amount: row.amount || "0.00", validFrom: row.validFrom?.slice(0,10) || "", validUntil: row.validUntil?.slice(0,10) || "", contractId: row.contractId || "", documentId: row.documentId || "", notes: row.notes || "" }; }
export default function OfficeAddons({kind}: {kind: Kind}) {
  const { getSelectedProject } = useProject();
  const project = getSelectedProject();
  const projectId = String(project?.id || "");
  const title = kind === "guarantees" ? "Bürgschaftsverwaltung" : "NU-Management · Nachweise";
  const types = kind === "guarantees" ? guaranteeTypes : certificateTypes;
  const statuses = kind === "guarantees" ? guaranteeStatuses : certificateStatuses;
  const [items, setItems] = React.useState<Item[]>([]);
  const [selectedId, setSelectedId] = React.useState("");
  const [form, setForm] = React.useState<Form>(() => blank(kind));
  const [dirty, setDirty] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [showArchived, setShowArchived] = React.useState(false);
  const [contracts, setContracts] = React.useState<any[]>([]);
  const [suppliers,setSuppliers]=React.useState<any[]>([]);
  const [documents, setDocuments] = React.useState<any[]>([]);
  const selected = items.find(i => i.id === selectedId);
  const contextKey = kind + ":" + projectId;
  const activeProject = React.useRef(contextKey); activeProject.current = contextKey;
  const generation = React.useRef(0);
  const load = React.useCallback(async () => {
    const n = ++generation.current;
    if (!projectId) { setItems([]); setContracts([]); setDocuments([]); setSuppliers([]); return; }
    setLoading(true); setError("");
    try {
      const [data, links, supplierData] = await Promise.all([
        request("/api/office-addons/" + kind + "?projectId=" + encodeURIComponent(projectId)),
        request("/api/office-addons/links?projectId=" + encodeURIComponent(projectId)),
        kind==="certificates"?request("/api/business-contacts?type=SUPPLIER&includeArchived=true"):Promise.resolve({items:[]}),
      ]);
      if (n !== generation.current || activeProject.current !== kind + ":" + projectId) return;
      setItems(data.items || []); setContracts(links.contracts || []); setDocuments(links.documents || []); setSuppliers(supplierData.items||[]);
    } catch (e: any) { if (n === generation.current) setError(e.message); }
    finally { if (n === generation.current) setLoading(false); }
  }, [projectId, kind]);
  React.useEffect(() => {
    setItems([]); setSuppliers([]); setSelectedId(""); setForm(blank(kind)); setDirty(false); setMessage("");
    void load();
    return () => { generation.current++; };
  }, [load, kind]);
  React.useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  const [history,setHistory]=React.useState<any[]>([]);
  const [historyLoading,setHistoryLoading]=React.useState(false);
  React.useEffect(()=>{
    let live=true;setHistory([]);
    if(!selectedId || !projectId){setHistoryLoading(false);return;}
    setHistoryLoading(true);
    request("/api/office-addons/"+kind+"/"+encodeURIComponent(selectedId)+"/history")
      .then(data=>{if(live)setHistory(data.items || []);})
      .catch(()=>{if(live)setHistory([{id:"history-error",error:true}]);})
      .finally(()=>{if(live)setHistoryLoading(false);});
    return ()=>{live=false;};
  },[selectedId,contextKey,selected?.revision]);
  function choose(row?: Item) {
    if (dirty && !window.confirm("Ungespeicherte Änderungen verwerfen?")) return;
    setSelectedId(row?.id || ""); setForm(row ? toForm(row, kind) : blank(kind)); setDirty(false); setMessage(""); setError("");
  }
  function update(key: keyof Form, value: string) { setForm(f => ({...f, [key]: value})); setDirty(true); setMessage(""); }
  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!projectId || busy) return;
    const sourceProject = contextKey; setBusy(true); setError(""); setMessage("");
    try {
      const data = await request("/api/office-addons/" + kind + (selected ? "/" + encodeURIComponent(selected.id) : ""), {
        method: selected ? "PUT" : "POST", body: JSON.stringify({...form, ...(kind==="guarantees"?{supplierPartyId:undefined}:{}), projectId, ...(selected ? {revision: selected.revision} : {})}),
      });
      if (activeProject.current !== sourceProject) return;
      await load();
      if (activeProject.current !== sourceProject) return;
      setSelectedId(data.item.id); setForm(toForm(data.item, kind)); setDirty(false); setMessage("Gespeichert.");
    } catch (e: any) { if (activeProject.current === sourceProject) setError(e.message); }
    finally { setBusy(false); }
  }
  const visible = items.filter(i => (showArchived || i.status !== "Archiviert") && (!query || [i.title, i.number, i.issuer, i.type, i.contract?.partner, i.supplierParty?.name].join(" ").toLowerCase().includes(query.toLowerCase())));
  const due = items.filter(i => i.status !== "Archiviert" && i.status !== "Zurückgegeben" && i.expiry !== "Gültig" && i.expiry !== "Ohne Frist").length;
  const locked = selected?.status === "Archiviert" || selected?.status === "Zurückgegeben";
  function exportCsv() {
    const rows = [["Bezeichnung","Nummer","Aussteller","Art","Status","Betrag EUR","Gültig ab","Gültig bis","Frist","Vertrag",...(kind==="certificates"?["Lieferant"]:[])], ...visible.map(i => [i.title,i.number || "",i.issuer,i.type,i.status,i.amount || "",i.validFrom?.slice(0,10) || "",i.validUntil?.slice(0,10) || "",i.expiry,i.contract?.title || "",...(kind==="certificates"?[i.supplierParty?.name||""]:[])])];
    const cell = (v: string) => '"' + (/^[=+\-@\t\r]/.test(v) ? "'" : "") + v.replace(/"/g,'""') + '"';
    const blob = new Blob(["\uFEFF" + rows.map(r => r.map(cell).join(";")).join("\r\n")], {type: "text/csv;charset=utf-8"});
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = kind + "-" + projectId.replace(/[^a-z0-9_-]/gi,"_") + ".csv"; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
  }
  return <div className="card">
    <header className="rlc-page-hero rlc-page-hero--split">
      <div><div className="rlc-page-hero__eyebrow">Büro & Verwaltung</div><h1>{title}</h1><p>Projekt {[project?.code, project?.name].filter(Boolean).join(" · ") || "auswählen"} · {items.filter(i => i.status !== "Archiviert").length} Unterlagen · {due} Fristen prüfen</p></div>
      <div className="rlc-page-hero__actions"><button className="rlc-page-hero__button" disabled={!projectId || busy || loading} onClick={() => choose()}>+ Neu anlegen</button></div>
    </header>
    <div className="rlc-page-toolbar" style={{flexWrap:"wrap"}}>
      <Link className="btn" to="/buro/buero-kommunikation">Büro</Link><Link className="btn" to="/buro/vertraege">Verträge</Link><Link className="btn" to="/buro/dokumente">Dokumente</Link>{kind==="certificates"&&<Link className="btn" to="/buro/kontakte">Adressen & Kontakte</Link>}
      <Link className="btn" to={kind === "guarantees" ? "/buro/nachunternehmer" : "/buro/buergschaften"}>{kind === "guarantees" ? "NU-Nachweise" : "Bürgschaften"}</Link>
      <input className="rlc-page-toolbar__search" aria-label="Unterlagen suchen" placeholder="Bezeichnung, Partner oder Aussteller suchen …" value={query} onChange={e => setQuery(e.target.value)} />
      <label><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> Archivierte anzeigen</label>
      <button className="btn" disabled={busy || loading} onClick={() => {if (dirty && !window.confirm("Ungespeicherte Änderungen verwerfen?")) return; setDirty(false); setSelectedId(""); setForm(blank(kind)); void load();}}>Aktualisieren</button>
      <button className="btn" disabled={!visible.length || loading} onClick={exportCsv}>CSV exportieren</button>
    </div>
    {error && <div className="card" role="alert">{error}</div>}
    {message && <div className="card" role="status">{message}</div>}
    {!projectId ? <div className="rlc-page-empty">Bitte zuerst ein Projekt auswählen.</div> : loading ? <div className="rlc-page-empty" role="status">Unterlagen werden geladen …</div> :
    <div className="rlc-page-workspace" style={{gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,340px),1fr))",alignItems:"start"}}>
      <section className="rlc-page-list"><div className="rlc-page-list-head">{visible.length} Unterlagen</div><div className="rlc-page-list-scroll">
        {!visible.length && <div className="rlc-page-empty">Keine Unterlagen vorhanden.</div>}
        {visible.map(i => <button type="button" key={i.id} disabled={busy} className={"rlc-page-document" + (i.id === selectedId ? " is-active" : "")} onClick={() => choose(i)}>
          <strong>{i.title}</strong><div className="rlc-page-document-meta"><span>{i.supplierParty?.name || i.contract?.partner || i.issuer}</span><span>{i.status}</span></div>
          <div className="rlc-page-document-meta"><span>{i.type}</span><span>{i.validUntil ? new Date(i.validUntil).toLocaleDateString("de-DE") : "Ohne Frist"} · {i.expiry}</span></div>
          {i.amount !== undefined && <div>{Number(i.amount).toLocaleString("de-DE",{style:"currency",currency:"EUR"})}</div>}
        </button>)}
      </div></section>
      <section className="rlc-page-detail"><div className="rlc-page-detail-head"><div className="rlc-page-detail-kicker">{selected ? "Unterlage · Version " + selected.revision : "Neue Unterlage"}</div><h2>{selected?.title || title}</h2></div>
        <form onSubmit={save} style={{padding:18,display:"grid",gap:14}}>
          <fieldset disabled={busy || !!locked} style={{border:0,padding:0,margin:0,display:"grid",gap:14}}>
            <Field label="Bezeichnung"><input required maxLength={250} value={form.title} onChange={e=>update("title",e.target.value)} /></Field>
            {kind === "guarantees" && <><Field label="Bürgschaftsnummer"><input required maxLength={100} value={form.number} onChange={e=>update("number",e.target.value)} /></Field><Field label="Betrag EUR"><input required inputMode="decimal" pattern="[0-9]{1,12}([.,][0-9]{1,2})?" value={form.amount} onChange={e=>update("amount",e.target.value)} /></Field></>}
            <Field label={kind === "guarantees" ? "Bürge / Bank / Versicherung" : "Aussteller"}><input required={kind === "guarantees"} maxLength={250} value={form.issuer} onChange={e=>update("issuer",e.target.value)} /></Field>
            <Field label="Art"><select value={form.type} onChange={e=>update("type",e.target.value)}>{types.map(t=><option key={t}>{t}</option>)}</select></Field>
            <Field label="Vertrag"><select required={kind === "certificates"} value={form.contractId} onChange={e=>update("contractId",e.target.value)}><option value="">Bitte auswählen</option>{contracts.filter(c=>kind === "guarantees" || ["Nachunternehmervertrag","Liefervertrag"].includes(c.contractType)).map(c=><option key={c.id} value={c.id}>{[c.partner,c.title].filter(Boolean).join(" · ")}</option>)}</select></Field>
            {kind==="certificates"&&<Field label="Lieferant aus Adressen & Kontakte"><select value={form.supplierPartyId} onChange={e=>update("supplierPartyId",e.target.value)}><option value="">Noch nicht zugeordnet</option>{suppliers.filter(x=>!x.profile.archived||x.id===form.supplierPartyId).map(x=><option key={x.id} value={x.id}>{x.name}{x.profile.archived?" · archiviert":""}</option>)}{form.supplierPartyId&&!suppliers.some(x=>x.id===form.supplierPartyId)&&<option value={form.supplierPartyId}>{selected?.supplierParty?.name||"Vorhandene Zuordnung"}</option>}</select></Field>}
            <Field label="Gültig ab"><input type="date" value={form.validFrom} onChange={e=>update("validFrom",e.target.value)} /></Field>
            <Field label="Gültig bis"><input type="date" min={form.validFrom || undefined} value={form.validUntil} onChange={e=>update("validUntil",e.target.value)} /></Field>
            <Field label="Dokument aus der Projektakte"><select value={form.documentId} onChange={e=>update("documentId",e.target.value)}><option value="">Kein Dokument verknüpft</option>{documents.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
            <Field label="Bemerkung"><textarea maxLength={5000} rows={4} value={form.notes} onChange={e=>update("notes",e.target.value)} /></Field>
          </fieldset>
          <Field label="Status"><select disabled={busy || selected?.status === "Archiviert" || !selected} value={form.status} onChange={e=>update("status",e.target.value)}>{statuses.map(s=><option key={s}>{s}</option>)}</select></Field>
          {locked && <div className="muted">Diese Unterlage ist gegen inhaltliche Änderungen gesperrt.</div>}
          {kind === "certificates" && <div className="muted">„Geprüft“ dokumentiert Ihre manuelle Prüfung. Bei Lieferantenwechsel zuerst als „Ungeprüft“ speichern und erneut prüfen. Die Zuordnung erfolgt bewusst durch Auswahl; bestehende Verträge und Dokumente bleiben erhalten.</div>}
          {selected?.reviewedAt && <div className="muted">Zuletzt geprüft: {new Date(selected.reviewedAt).toLocaleString("de-DE")}</div>}
          <div className="rlc-page-detail-actions"><button className="btn btn-primary" disabled={busy || selected?.status === "Archiviert" || (!!selected && !dirty)} type="submit">{busy ? "Wird gespeichert …" : "Speichern"}</button>
          {dirty && <button className="btn" type="button" disabled={busy} onClick={()=>choose(selected)}>Änderungen verwerfen</button>}</div>
        </form>
        {selected && <section style={{padding:18,borderTop:"1px solid var(--border, #e2e8f0)"}} aria-label="Verlauf">
          <h3>Verlauf</h3>
          {historyLoading?<p role="status">Verlauf wird geladen …</p>:history.map(entry=>entry.error?<p key={entry.id} role="alert">Verlauf konnte nicht geladen werden. Bitte aktualisieren.</p>:<div key={entry.id} style={{padding:"8px 0"}}>
            <strong>{entry.action==="OFFICE_ADDON_CREATE"?"Angelegt":"Geändert"}</strong> · {new Date(entry.createdAt).toLocaleString("de-DE")}
            <div className="muted">{entry.meta?.after?.status || entry.meta?.status || ""}{(entry.meta?.revision || entry.meta?.after?.revision)? " · Version "+(entry.meta?.revision || entry.meta?.after?.revision):""}</div>
          </div>)}
        </section>}
      </section>
    </div>}
  </div>;
}
function Field({label,children}: {label:string;children:React.ReactElement<any>}) { return <label style={{display:"grid",gap:6}}><strong style={{fontSize:12}}>{label}</strong>{React.cloneElement(children,{style:{width:"100%",boxSizing:"border-box",...children.props.style}})}</label>; }

export { request as officeAddonRequest };
