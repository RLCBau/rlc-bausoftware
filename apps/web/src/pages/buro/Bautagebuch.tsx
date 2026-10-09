import DiaryTimeExport from "./DiaryTimeExport";
import {diaryBookSources} from "./diaryBookSources";
import { rlcClass } from "../../ui/rlcRuntimeStyle";import { archiveWebPdfFromUrl } from "../../lib/dmsArchive";
import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiUrl } from "../../lib/apiBase";
import { useProject } from "../../store/useProject";

type Tagesbericht = Record<string, any>;

function authHeaders(): Record<string, string> {
  for (const key of [
  "rlc_token",
  "token",
  "authToken",
  "accessToken",
  "rlc_auth_token"])
  {
    const token = localStorage.getItem(key) || sessionStorage.getItem(key);

    if (token?.trim()) {
      return { Authorization: `Bearer ${token.trim()}` };
    }
  }

  return {};
}

async function request(path: string, init?: RequestInit) {
  const response = await fetch(apiUrl(path), {
    credentials: "include",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...authHeaders(),
      ...(init?.headers || {})
    }
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || payload?.ok === false) {
    throw new Error(
      payload?.message || payload?.error || `HTTP ${response.status}`
    );
  }

  return payload;
}

function assetUrl(value?: string | null): string {
  const url = String(value || "").trim();

  if (!url) return "";
  if (/^(https?:|blob:|data:)/i.test(url)) return url;

  return apiUrl(url.startsWith("/") ? url : `/${url}`);
}

function itemsOf(payload: any): any[] {
  for (const value of [
  payload,
  payload?.items,
  payload?.reports,
  payload?.data,
  payload?.data?.items])
  {
    if (Array.isArray(value)) return value;
  }

  return [];
}

function normalizeReport(raw: any, projectKey: string): Tagesbericht {
  const wrapper = raw || {};
  const report =
  Array.isArray(wrapper.rows) && wrapper.rows.length ?
  wrapper.rows[0] :
  wrapper;

  const sourceDocId = String(
    wrapper.sourceDocId ||
    wrapper.id ||
    wrapper.docId ||
    report.sourceDocId ||
    report.id ||
    ""
  ).trim();

  return {
    ...wrapper,
    ...report,
    id: String(report.id || sourceDocId).trim(),
    sourceDocId,
    projectId: String(
      report.projectId || wrapper.projectId || projectKey
    ).trim(),
    projectCode: String(
      report.projectCode ||
      wrapper.projectCode ||
      projectKey
    ).trim(),
    date: String(
      report.date ||
      report.datum ||
      wrapper.date ||
      wrapper.datum ||
      ""
    ).slice(0, 10),
    weather:
    report.weather ||
    report.wetter ||
    wrapper.weather ||
    wrapper.wetter ||
    "",
    temperature:
    report.temperature ||
    report.temperatur ||
    wrapper.temperature ||
    wrapper.temperatur ||
    "",
    workers:
    report.workers ||
    report.mitarbeiter ||
    wrapper.workers ||
    wrapper.mitarbeiter ||
    "",
    machines:
    report.machines ||
    report.maschinen ||
    wrapper.machines ||
    wrapper.maschinen ||
    "",
    materials:
    report.materials ||
    report.materialien ||
    report.material ||
    wrapper.materials ||
    wrapper.materialien ||
    wrapper.material ||
    "",
    workDone:
    report.workDone ||
    report.arbeiten ||
    report.taetigkeiten ||
    report.taetigkeit ||
    report.comment ||
    wrapper.workDone ||
    wrapper.arbeiten ||
    wrapper.comment ||
    "",
    issues:
    report.issues ||
    report.vorkommnisse ||
    wrapper.issues ||
    wrapper.vorkommnisse ||
    "",
    notes:
    report.notes ||
    report.bemerkungen ||
    report.notizen ||
    wrapper.notes ||
    wrapper.notizen ||
    wrapper.note ||
    "",
    attachments: Array.isArray(report.attachments) ?
    report.attachments :
    Array.isArray(wrapper.attachments) ?
    wrapper.attachments :
    [],
    lines: Array.isArray(report.lines) ?
    report.lines :
    Array.isArray(report.rows) &&
    report.rows.every(
      (line: any) =>
      String(line?.reportType || "").toUpperCase() !==
      "TAGESBERICHT"
    ) ?
    report.rows :
    [],
    reportType: "BAUTAGEBUCH",
    workflowStatus:
    (wrapper.official ? wrapper.workflowStatus : report.workflowStatus) ||
    wrapper.workflowStatus ||
    wrapper.status ||
    "",
    inBautagebuch: Boolean(
      report.inBautagebuch || wrapper.inBautagebuch
    )
  };
}

function hoursOf(item: Tagesbericht): number {
  return (Array.isArray(item.lines) ? item.lines : []).reduce(
    (sum: number, line: any) =>
    sum + Number(line.stunden || line.hours || 0),
    0
  );
}

function groupByDate(
items: Tagesbericht[])
: Array<[string, Tagesbericht[]]> {
  const groups = new Map<string, Tagesbericht[]>();

  for (const item of items) {
    const date = String(
      item.date || item.datum || "Ohne Datum"
    ).slice(0, 10);

    const current = groups.get(date) || [];
    current.push(item);
    groups.set(date, current);
  }

  return Array.from(groups.entries()).sort(([a], [b]) =>
  b.localeCompare(a)
  );
}

export default function Bautagebuch() {
  const { getSelectedProject } = useProject();
  const project = getSelectedProject();
  const projectKey = String(
    project?.id || project?.code || ""
  ).trim();

  const [params] = useSearchParams();
  const routeDocId = String(params.get("docId") || "").trim();
  const routeSource = String(params.get("source") || "").trim().toLowerCase();
  const routeStage = String(params.get("stage") || "inbox").trim().toLowerCase();

  const [items, setItems] = React.useState<Tagesbericht[]>([]);
  const [openDates, setOpenDates] = React.useState<Set<string>>(
    new Set()
  );
  const [month, setMonth] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [bookPdfUrl, setBookPdfUrl] = React.useState("");
  const [bookFinalStatus, setBookFinalStatus] = React.useState<any>(null);
  const [bookFinalizing, setBookFinalizing] = React.useState(false);
  const [bookPdfLoading, setBookPdfLoading] =
  React.useState(false);

  const generation=React.useRef(0),actionOwner=React.useRef(projectKey+'|'+month);actionOwner.current=projectKey+'|'+month;
  const [detailIds,setDetailIds]=React.useState<Set<string>>(new Set());
  const load = React.useCallback(async () => {
    const n=++generation.current;setItems([]);setError('');
    if(!projectKey){setLoading(false);return;}setLoading(true);
    try {
      if(routeSource==='mobile'&&routeDocId){
        const base='/api/inbox/'+encodeURIComponent(projectKey)+'/BAUTAGEBUCH';
        const endpoint=routeStage==='approved'?base+'/approved':routeStage==='final'?base+'/final':base;
        const payload=await request(endpoint);if(n!==generation.current)return;
        const target=itemsOf(payload).find((r:any)=>String(r.id||r.docId||'')===routeDocId);
        const normalized=target?[normalizeReport(target,projectKey)]:[];setItems(normalized);
        if(normalized[0]?.date){setMonth(normalized[0].date.slice(0,7));setOpenDates(new Set([normalized[0].date]));}return;
      }
      const responses=await Promise.allSettled([
        request('/api/tagesbericht/list?projectId='+encodeURIComponent(projectKey)),
        request('/api/tagesbericht/inbox/list?projectId='+encodeURIComponent(projectKey))
      ]);
      if(n!==generation.current)return;
      for(const r of responses)if(r.status==='rejected')throw r.reason;
      const official=itemsOf((responses[0] as PromiseFulfilledResult<any>).value),inbox=itemsOf((responses[1] as PromiseFulfilledResult<any>).value);
      setItems(diaryBookSources(official,inbox).map(r=>normalizeReport(r,projectKey)).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))));
    }catch(e:any){if(n===generation.current){setItems([]);setError(e.message||'Bautagebuch konnte nicht geladen werden.');}}
    finally{if(n===generation.current)setLoading(false);}
  },[projectKey,routeDocId,routeSource,routeStage]);
  React.useEffect(()=>{setBookPdfUrl('');setBookFinalStatus(null);setDetailIds(new Set());void load();return()=>{generation.current++;};},[load]);

  const filtered = items.filter(
    (item) =>
    !month ||
    String(item.date || item.datum || "").startsWith(month)
  );

  const totalHours = filtered.reduce(
    (sum, item) => sum + hoursOf(item),
    0
  );

  const grouped = groupByDate(filtered);
  const isMobileDocument = routeSource === "mobile" && Boolean(routeDocId);

  React.useEffect(() => {
    let cancelled = false;
    if (!projectKey || !/^\d{4}-\d{2}$/.test(month || "")) { setBookFinalStatus(null); return; }
    void request(`/api/tagesbericht/bautagebuch/final-status?projectId=${encodeURIComponent(projectKey)}&month=${encodeURIComponent(month)}`)
      .then((data:any) => { if (!cancelled) setBookFinalStatus(data); })
      .catch(() => { if (!cancelled) setBookFinalStatus(null); });
    return () => { cancelled = true; };
  }, [projectKey, month]);

  async function finalizeBook() {
    if (!projectKey || !/^\d{4}-\d{2}$/.test(month || "")) { setError("Für den Abschluss bitte einen Monat YYYY-MM wählen."); return; }
    const owner=projectKey+"|"+month;
    setBookFinalizing(true); setError("");
    try {
      const result = await request("/api/tagesbericht/bautagebuch/finalize", { method:"POST", body:JSON.stringify({ projectId:projectKey, projectCode:projectKey, projectName:String(project?.name || projectKey), month }) });
      if(actionOwner.current!==owner)return;
      setBookFinalStatus({ finalized:true, manifest:result.manifest });
      const url = assetUrl(result?.pdfUrl || ""); if (url) setBookPdfUrl(url);
    } catch (e:any) { if(actionOwner.current===owner)setError(e?.message || "Bautagebuch konnte nicht abgeschlossen werden."); }
    finally { setBookFinalizing(false); }
  }

  async function createBookPdf(): Promise<string> {
    if (!projectKey) {
      throw new Error("Kein Projekt ausgewählt.");
    }

    if (!filtered.length) {
      throw new Error(
        "Im gewählten Zeitraum sind keine Tagesberichte vorhanden."
      );
    }

    const owner=projectKey+"|"+month;
    setBookPdfLoading(true);
    setError("");

    try {
      const result = await request(
        "/api/tagesbericht/bautagebuch/preview",
        {
          method: "POST",
          body: JSON.stringify({
            projectId: projectKey,
            projectCode: projectKey,
            projectName: String(project?.name || projectKey),
            month,
            reports: filtered.map((report) => ({
              ...report,
              projectId: projectKey,
              projectCode: projectKey,
              reportType: "TAGESBERICHT",
              attachments: report.attachments || [],
              lines: report.lines || []
            }))
          })
        }
      );

      const nextUrl = assetUrl(
        result?.pdfUrl || result?.url || ""
      );

      if (!nextUrl) {
        throw new Error(
          "PDF-URL fehlt in der Serverantwort."
        );
      }

      if(actionOwner.current!==owner)throw new Error("Projekt oder Zeitraum inzwischen geändert.");
      setBookPdfUrl(nextUrl);
      return nextUrl;
    } catch (e: any) {
      if(actionOwner.current===owner)setError(
        e?.message ||
        "Bautagebuch-PDF Vorschau fehlgeschlagen."
      );
      throw e;
    } finally {
      setBookPdfLoading(false);
    }
  }

  async function exportBookPdf() {
    try {
      const url = await createBookPdf();

      const fileName = `Bautagebuch_${projectKey}_${
      month || "Gesamt"}.pdf`;

      const dmsProjectId = String(project?.id || "").trim();

      if (dmsProjectId) {
        await archiveWebPdfFromUrl(
          dmsProjectId,
          fileName,
          url
        );
      }

      const link = document.createElement("a");

      link.href = url;
      link.download = fileName;

      link.target = "_blank";
      link.rel = "noreferrer";

      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {


      // Fehler wird in createBookPdf angezeigt.
    }}
  function toggleDate(date: string) {
    setOpenDates((current) => {
      const next = new Set(current);

      if (next.has(date)) next.delete(date);else
      next.add(date);

      return next;
    });
  }

  function reportLink(
  item: Tagesbericht,
  mode: "view" | "edit")
  : string {
    const docId = String(
      item.sourceDocId || item.id || ""
    ).trim();

    const query = new URLSearchParams({
      projectId: projectKey,
      docId,
      source: "bautagebuch",
      mode
    });

    return `/buro/tagesberichte?${query.toString()}`;
  }

  return (
    <div className="rlc-migrated-pages-buro-bautagebuch-tsx-317">





      
      <ModuleHero
        title="Bautagebuch"
        subtitle={
          isMobileDocument
            ? "Bautagebuch-Eintrag aus der Mobile-App prüfen und weiterbearbeiten."
            : "Bautagebuch-Einträge chronologisch bündeln und zentral verwalten."
        } />
      

      <div className="rlc-migrated-pages-buro-bautagebuch-tsx-318">
        <div className="rlc-migrated-pages-buro-bautagebuch-tsx-321">






          
          <button
            className="btn"
            onClick={() => void createBookPdf().catch(()=>{})}
            disabled={loading || bookPdfLoading || !filtered.length}>
            
            PDF Vorschau Bautagebuch
          </button>

          <button
            className="btn"
            onClick={() => void exportBookPdf()}
            disabled={loading || bookPdfLoading || !filtered.length}>
            
            PDF Bautagebuch exportieren
          </button>

          <button
            className="btn primary"
            onClick={() => void finalizeBook()}
            disabled={loading || isMobileDocument || bookFinalizing || !filtered.length || !/^\d{4}-\d{2}$/.test(month || "") || Boolean(bookFinalStatus?.finalized)}
            title={!month ? "Monat wählen" : bookFinalStatus?.finalized ? "Dieser Monatsabschluss ist bereits gesperrt." : "Nur freigegebene Tagesberichte serverseitig abschließen"}>
            {bookFinalizing ? "Wird abgeschlossen…" : bookFinalStatus?.finalized ? "Monatsabschluss gesperrt" : "Bautagebuch abschließen"}
          </button>

          {bookFinalStatus?.finalized ? (
            <span style={{fontSize:12,color:"#067647",fontWeight:700}}>
              FINAL · {bookFinalStatus?.manifest?.reportCount || 0} Berichte · SHA-256 gesichert
            </span>
          ) : null}

          {!isMobileDocument ? (


            <Link


              className="btn"


              to={`/buro/tagesberichte?projectId=${encodeURIComponent(projectKey)}`}


            >


              Tagesberichte öffnen


            </Link>


          ) : null}

          <button
            className="btn"
            onClick={() => void load()}
            disabled={loading}>
            
            Aktualisieren
          </button>
        </div>
      </div>

      {error ?
      <div className="rlc-migrated-pages-buro-bautagebuch-tsx-322">






        
          {error}
        </div> :
      null}

      <div className="rlc-migrated-pages-buro-bautagebuch-tsx-323">






        
        <Stat
          label={isMobileDocument ? "Bautagebuch-Einträge" : "Tagesberichte"}
          value={filtered.length} />
        
        <Stat
          label="Gesamtstunden"
          value={totalHours.toLocaleString("de-DE")} />
        
        <Stat
          label="Vorkommnisse"
          value={
          filtered.filter((item) =>
          String(item.issues || "").trim()
          ).length
          } />
        
        <Stat
          label="Maschinen im Einsatz"
          value={
          filtered.filter(
            (item) =>
            String(item.machines || "").trim() ||
            (item.lines || []).some((line: any) =>
            String(
              line.maschine || line.machine || ""
            ).trim()
            )
          ).length
          } />
        
      </div>

      <label className="rlc-migrated-pages-buro-bautagebuch-tsx-324">








        
        Monat
        <input
          value={month}
          onChange={(e) => {
            setMonth(e.target.value);
            setBookPdfUrl("");
          }}
          type="month"
          disabled={bookPdfLoading||bookFinalizing} />
        
      </label>

      {!isMobileDocument&&<DiaryTimeExport projectId={projectKey} month={month} />}
      <p className="muted">Freigegebene Originale und ausdrücklich übernommene Entwürfe. Der Monatsabschluss enthält ausschließlich freigegebene Tagesberichte.</p>
      <BookPdfPreviewPanel
        url={bookPdfUrl}
        loading={bookPdfLoading}
        reportCount={filtered.length}
        period={month || "Gesamter Zeitraum"} />
      

      <div className="rlc-migrated-pages-buro-bautagebuch-tsx-325">
        {grouped.map(([date, reports]) => {
          const isOpen = openDates.has(date);

          return (
            <section
              key={date} className="rlc-migrated-pages-buro-bautagebuch-tsx-326">






              
              <button
                type="button"
                onClick={() => toggleDate(date)} className="rlc-migrated-pages-buro-bautagebuch-tsx-327">












                
                <div>
                  <div className="rlc-migrated-pages-buro-bautagebuch-tsx-328">




                    
                    {date}
                  </div>

                  <div className="rlc-migrated-pages-buro-bautagebuch-tsx-329">





                    
                    {reports.length} {isMobileDocument
                      ? reports.length === 1
                        ? "Bautagebuch-Eintrag"
                        : "Bautagebuch-Einträge"
                      : "Tagesbericht(e)"} ·{" "}
                    {reports.
                    reduce(
                      (sum, report) =>
                      sum + hoursOf(report),
                      0
                    ).
                    toLocaleString("de-DE")}{" "}
                    Std.
                  </div>
                </div>

                <span className="rlc-migrated-pages-buro-bautagebuch-tsx-330">




                  
                  {isOpen ? "▼" : "▶"}
                </span>
              </button>

              {isOpen ?
              <div className="rlc-migrated-pages-buro-bautagebuch-tsx-331">





                
                  {reports.map((item, index) =>
                <article
                  key={item.sourceDocId || item.id} className="rlc-migrated-pages-buro-bautagebuch-tsx-332">











                  
                      <div className="rlc-migrated-pages-buro-bautagebuch-tsx-333">





                    
                        <div className="rlc-migrated-pages-buro-bautagebuch-tsx-334">






                      
                          <strong>
                            {isMobileDocument ? "Bautagebuch-Eintrag" : "Tagesbericht"} {index + 1}
                          </strong>

                          {item.inBautagebuch ?
                      <span className="rlc-migrated-pages-buro-bautagebuch-tsx-335">








                        
                              ÜBERNOMMEN
                            </span> :
                      null}
                        </div>

                        <div className="rlc-migrated-pages-buro-bautagebuch-tsx-336">
                          {item.workDone ||
                      item.title ||
                      item.comment ||
                      "Tagesbericht"}
                        </div>

                        <div className="rlc-migrated-pages-buro-bautagebuch-tsx-337">






                      
                          <CompactDetail
                        label="Wetter"
                        value={item.weather} />
                      
                          <CompactDetail
                        label="Mitarbeiter"
                        value={item.workers} />
                      
                          <CompactDetail
                        label="Stunden"
                        value={hoursOf(
                          item
                        ).toLocaleString("de-DE")} />
                      
                          <CompactDetail
                        label="Maschinen"
                        value={item.machines} />
                      
                          <CompactDetail
                        label="Materialien"
                        value={item.materials} />
                      
                          <CompactDetail
                        label="Fotos / Anhänge"
                        value={
                        Array.isArray(
                          item.attachments
                        ) ?
                        item.attachments.length :
                        0
                        } />
                      
                        </div>

                        {item.notes ?
                    <CompactDetail
                      label="Notizen"
                      value={item.notes} /> :

                    null}
                      </div>

                      <div className="rlc-migrated-pages-buro-bautagebuch-tsx-338">





                    
                        {item.official?<><button className="btn" onClick={()=>setDetailIds(old=>{const next=new Set(old);const id=item.filename||item.id;next.has(id)?next.delete(id):next.add(id);return next;})}>Originaldetails</button><span className="muted">Freigegeben · Original gesperrt</span></>:<><Link className="btn" to={reportLink(item,'view')}>Öffnen</Link><Link className="btn" to={reportLink(item,'edit')}>Bearbeiten</Link></>}
                      </div>
                      {item.official&&detailIds.has(item.filename||item.id)&&<section className="card" style={{padding:14,gridColumn:'1 / -1'}}><h3>Original · {item.filename}</h3><p>{item.workDone}</p><p>Vorkommnisse: {item.issues||'–'}</p><p>Bemerkungen: {item.notes||'–'}</p><div style={{overflowX:'auto'}}><table><thead><tr>{['Von','Bis','Pause Min.','Stunden','Mitarbeiter','Maschine','Ort','Tätigkeit'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{(item.lines||[]).map((r:any,i:number)=><tr key={i}><td>{r.von||r.start||'–'}</td><td>{r.bis||r.end||'–'}</td><td>{r.pauseMin??r.breakMinutes??'–'}</td><td>{r.stunden??r.hours??'–'}</td><td>{r.mitarbeiter||r.employeeName||r.worker||'–'}</td><td>{r.maschine||r.machine||'–'}</td><td>{r.ort||r.location||'–'}</td><td>{r.taetigkeit||r.activity||r.notiz||'–'}</td></tr>)}</tbody></table></div></section>}
                    </article>
                )}
                </div> :
              null}
            </section>);

        })}

        {!grouped.length && !error ?
        <div className="rlc-migrated-pages-buro-bautagebuch-tsx-339">





          
            {loading?"Wird geladen …":!projectKey?"Projekt auswählen.":"Keine Tagesberichte im gewählten Monat."}
          </div> :
        null}
      </div>
    </div>);

}

function BookPdfPreviewPanel({
  url,
  loading,
  reportCount,
  period





}: {url: string;loading: boolean;reportCount: number;period: string;}) {
  if (!url && !loading) return null;

  return (
    <section className="rlc-migrated-pages-buro-bautagebuch-tsx-340">






      
      <div className={rlcClass(null,
      {
        padding: "14px 16px",
        borderBottom: url ?
        "1px solid #e2e8f0" :
        0
      })}>
        
        <div className="rlc-migrated-pages-buro-bautagebuch-tsx-341">
          PDF Bautagebuch
        </div>

        <div className="rlc-migrated-pages-buro-bautagebuch-tsx-342">





          
          Gesamtes Bautagebuch · Zeitraum {period} ·{" "}
          {reportCount} Tagesbericht(e)
        </div>
      </div>

      {loading ?
      <div className="rlc-migrated-pages-buro-bautagebuch-tsx-343">







        
          Bautagebuch-PDF wird erstellt …
        </div> :
      null}

      {url ?
      <iframe
        title="Bautagebuch Gesamt-PDF Vorschau"
        src={url} className="rlc-migrated-pages-buro-bautagebuch-tsx-344" /> :








      null}
    </section>);

}

function ModuleHero({
  title,
  subtitle



}: {title: string;subtitle: string;}) {
  return (
    <section className="rlc-page-hero">









      
      <div className="rlc-page-hero__eyebrow">






        
        Verwaltung · Bauausführung
      </div>

      <h1 className="rlc-migrated-pages-buro-bautagebuch-tsx-347">





        
        {title}
      </h1>

      <p>





        
        {subtitle}
      </p>
    </section>);

}

function CompactDetail({
  label,
  value



}: {label: string;value: any;}) {
  return (
    <div className="rlc-migrated-pages-buro-bautagebuch-tsx-349">







      
      <div className="rlc-migrated-pages-buro-bautagebuch-tsx-350">





        
        {label}
      </div>

      <div className="rlc-migrated-pages-buro-bautagebuch-tsx-351">




        
        {value == null || value === "" ?
        "—" :
        String(value)}
      </div>
    </div>);

}

function Stat({
  label,
  value



}: {label: string;value: React.ReactNode;}) {
  return (
    <div className="rlc-migrated-pages-buro-bautagebuch-tsx-352">






      
      <div className="rlc-migrated-pages-buro-bautagebuch-tsx-353">
        {value}
      </div>

      <div className="rlc-migrated-pages-buro-bautagebuch-tsx-354">
        {label}
      </div>
    </div>);

}
