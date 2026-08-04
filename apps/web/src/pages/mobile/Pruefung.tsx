import { rlcClass } from "../../ui/rlcRuntimeStyle";import React from "react";
import { Link, useParams } from "react-router-dom";
import { apiUrl } from "../../lib/apiBase";
import { useProject } from "../../store/useProject";

type WorkflowType =
"REGIE" |
"LIEFERSCHEIN" |
"TAGESBERICHT" |
"BAUTAGEBUCH" |
"FOTOS" |
"ANGEBOT" |
"MENGENERMITTLUNG" |
"ABSCHLAGSRECHNUNG" |
"RECHNUNG" |
"ARBEITSZEIT";

type WorkflowDocument = Record<string, any> & {
  id: string;
  title?: string;
  workflowStatus?: string;
  submittedAt?: number;
  approvedAt?: number;
  rejectionReason?: string;
};

const CONFIG: Record<WorkflowType, {title: string;finalTo: string;finalLabel: string;}> = {
  REGIE: { title: "Regieberichte", finalTo: "/buro/regieberichte", finalLabel: "Regieberichte" },
  LIEFERSCHEIN: {
    title: "Lieferscheine",
    finalTo: "/buro/lieferscheine",
    finalLabel: "Lieferscheinverwaltung"
  },
  TAGESBERICHT: {
    title: "Tagesberichte",
    finalTo: "/buro/tagesberichte",
    finalLabel: "Tagesberichte"
  },
  BAUTAGEBUCH: {
    title: "Bautagebuch",
    finalTo: "/buro/bautagebuch",
    finalLabel: "Bautagebuch"
  },
  FOTOS: { title: "Fotos / Notizen", finalTo: "/buro/fotos", finalLabel: "Projektakte" },
  ANGEBOT: { title: "Angebote", finalTo: "/buro/angebote", finalLabel: "Angebotsverwaltung" },
  MENGENERMITTLUNG: {
    title: "Mengenermittlung",
    finalTo: "/mengenermittlung/aufmasseditor",
    finalLabel: "Aufmaß-Editor"
  },
  ABSCHLAGSRECHNUNG: {
    title: "Abschlagsrechnungen",
    finalTo: "/buchhaltung/abschlagsrechnungen",
    finalLabel: "Abschlagsrechnungen"
  },
  RECHNUNG: {
    title: "Rechnungen",
    finalTo: "/buchhaltung/rechnungen",
    finalLabel: "Rechnungsverwaltung"
  },
  ARBEITSZEIT: {
    title: "Arbeitszeiten",
    finalTo: "/mobile/arbeitszeiten",
    finalLabel: "Arbeitszeiten"
  }
};

function authHeaders(): Record<string, string> {
  for (const key of ["rlc_token", "token", "authToken", "accessToken", "rlc_auth_token"]) {
    const token = localStorage.getItem(key) || sessionStorage.getItem(key);
    if (token?.trim()) return { Authorization: `Bearer ${token.trim()}` };
  }
  return {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
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
    throw new Error(payload?.message || payload?.error || `HTTP ${response.status}`);
  }
  return payload as T;
}


async function requestOptional<T>(path: string): Promise<T | null> {
  try {
    return await request<T>(path);
  } catch (error: any) {
    const message = String(error?.message || "");
    if (message.includes("404") || message.toLowerCase().includes("not found")) return null;
    throw error;
  }
}

function itemsOf(payload: any): WorkflowDocument[] {
  const candidates = [
  payload,
  payload?.items,
  payload?.rows,
  payload?.reports,
  payload?.documents,
  payload?.data,
  payload?.data?.items,
  payload?.data?.rows,
  payload?.data?.reports,
  payload?.data?.documents];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate as WorkflowDocument[];
  }
  return [];
}

function reportTypeOf(doc: WorkflowDocument) {
  return String(doc.reportType || doc.type || "REGIE").trim().toUpperCase();
}

function filterForType(type: WorkflowType, docs: WorkflowDocument[]) {
  if (type === "REGIE" || type === "TAGESBERICHT" || type === "BAUTAGEBUCH") {
    return docs.filter((doc) => reportTypeOf(doc) === type);
  }
  return docs;
}

function documentFileUrl(doc: WorkflowDocument) {
  const candidates = [
  doc.pdfUrl,
  doc.pdfUri,
  doc.fileUrl,
  doc.downloadUrl,
  doc.previewUrl,
  doc.documentUrl,
  doc.attachmentUrl,
  doc.file?.url,
  doc.pdf?.url];


  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }

  return "";
}

function valueText(value: any) {
  if (value == null || value === "") return "—";
  if (Array.isArray(value)) {
    if (!value.length) return "Keine";
    return value.
    map((item, index) => {
      if (!item || typeof item !== "object") return `${index + 1}. ${String(item)}`;
      const fields = [
      item.von ? `Von: ${item.von}` : "",
      item.bis ? `Bis: ${item.bis}` : "",
      item.pauseMin != null ? `Pause: ${item.pauseMin} Min.` : "",
      item.stunden != null || item.hours != null ? `Stunden: ${item.stunden ?? item.hours}` : "",
      item.mitarbeiter || item.worker ? `Mitarbeiter: ${item.mitarbeiter || item.worker}` : "",
      item.maschine || item.machine ? `Maschine: ${item.maschine || item.machine}` : "",
      item.ort ? `Ort: ${item.ort}` : "",
      item.taetigkeit || item.comment ? `Tätigkeit: ${item.taetigkeit || item.comment}` : "",
      item.notiz ? `Notiz: ${item.notiz}` : ""].
      filter(Boolean);
      return `${index + 1}. ${fields.join(" · ")}`;
    }).
    join("\n");
  }
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function documentFields(type: WorkflowType, doc: WorkflowDocument): Array<[string, any]> {
  if (type === "REGIE") {
    const rows = Array.isArray(doc.rows) ? doc.rows : [];
    return [
    ["Datum", doc.date || doc.datum],
    ["Regie-Nr.", doc.regieNummer || doc.regieNumber || doc.nr],
    ["Auftraggeber", doc.auftraggeber],
    ["Mitarbeiter", doc.mitarbeiter || doc.worker || rows[0]?.worker],
    ["Stunden", doc.hours ?? rows.reduce((sum: number, row: any) => sum + Number(row?.hours || 0), 0)],
    ["Arbeitsbeginn", doc.arbeitsbeginn],
    ["Arbeitsende", doc.arbeitsende],
    ["Kostenstelle", doc.kostenstelle],
    ["Beschreibung", doc.comment || doc.text || doc.bemerkungen],
    ["Positionen", rows],
    ["Fotos", Array.isArray(doc.photos) ? `${doc.photos.length} Foto(s)` : "Keine"],
    ["Anhänge", Array.isArray(doc.attachments) ? `${doc.attachments.length} Anhang/Anhänge` : "Keine"],
    ["Status", doc.workflowStatus]];

  }

  if (type === "ARBEITSZEIT") {
    const employee =
      doc.employeeName ||
      doc.employee ||
      doc.mitarbeiter ||
      doc.submittedBy?.employeeName ||
      doc.submittedBy?.displayName ||
      doc.submittedBy?.userName;

    const events = Array.isArray(doc.events)
      ? doc.events
      : Array.isArray(doc.timeEvents)
        ? doc.timeEvents
        : [];

    return [
      ["Datum", doc.date || doc.datum],
      ["Mitarbeiter", employee],
      ["Arbeitsbeginn", doc.start || doc.arbeitsbeginn],
      ["Arbeitsende", doc.end || doc.arbeitsende],
      ["Pause", `${Number(doc.breakMinutes ?? doc.pauseMinutes ?? 0)} Min.`],
      ["Nettoarbeitszeit", `${Number(doc.hours ?? doc.netHours ?? 0).toFixed(2)} h`],
      ["Tätigkeit", doc.activity || doc.taetigkeit],
      ["Maschinen", doc.machines || doc.maschinen],
      ["Material", doc.materials || doc.material],
      ["Bemerkung", doc.note || doc.bemerkung],
      ["GPS-Ereignisse", events],
      ["Eingereicht von", doc.submittedBy?.displayName || doc.submittedBy?.userName],
      ["Status", doc.workflowStatus]
    ];
  }
  if (type === "TAGESBERICHT") {
    return [
    ["Datum", doc.date || doc.datum],
    ["Wetter", doc.weather || doc.wetter],
    ["Temperatur", doc.temperature || doc.temperatur],
    ["Mitarbeiter", doc.workers || doc.mitarbeiter],
    ["Maschinen", doc.machines || doc.maschinen],
    ["Ausgeführte Arbeiten", doc.workDone || doc.arbeiten],
    ["Vorkommnisse", doc.issues || doc.vorkommnisse],
    ["Notizen", doc.notes || doc.notizen],
    ["Tageszeilen", doc.lines || doc.rows],
    ["Anhänge", doc.attachments],
    ["Status", doc.workflowStatus]];

  }

  if (type === "BAUTAGEBUCH") {
    return [
    ["Datum", doc.date || doc.datum],
    ["Zeitraum", doc.monthLabel || doc.zeitraum],
    ["Anzahl Tagesberichte", doc.totalReports ?? (Array.isArray(doc.rows) ? doc.rows.length : 0)],
    ["Tagesberichte", doc.rows],
    ["Status", doc.workflowStatus]];

  }

  const labels: Record<string, string> = {
    title: "Titel",
    datum: "Datum",
    date: "Datum",
    workflowStatus: "Status",
    submittedAt: "Eingereicht am",
    approvedAt: "Freigegeben am",
    rows: "Positionen",
    comment: "Beschreibung",
    text: "Text",
    photos: "Fotos",
    attachments: "Anhänge",
    projectCode: "Projekt"
  };

  return Object.entries(doc).
  filter(([key, value]) => labels[key] && value !== undefined && value !== null && value !== "").
  map(([key, value]) => [labels[key], value]);
}
function docTitle(doc: WorkflowDocument) {
  return String(
    doc.title || doc.angebotTitle || doc.angebotNr || doc.rechnungNr || doc.nr || doc.id
  );
}

function docDate(doc: WorkflowDocument) {
  const value = doc.submittedAt || doc.approvedAt || doc.updatedAt || doc.createdAt;
  if (typeof value === "number") return new Date(value).toLocaleString("de-DE");
  return String(doc.datum || doc.date || "—");
}

export default function MobilePruefung() {
  const { type: rawType = "" } = useParams();
  const type = rawType.toUpperCase() as WorkflowType;
  const config = CONFIG[type];
  const { getSelectedProject } = useProject();
  const project = getSelectedProject();
  const projectKey = String(project?.code || project?.id || "").trim();

  const [inbox, setInbox] = React.useState<WorkflowDocument[]>([]);
  const [approved, setApproved] = React.useState<WorkflowDocument[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [selectedDoc, setSelectedDoc] = React.useState<WorkflowDocument | null>(null);
  const [openedIds, setOpenedIds] = React.useState<Set<string>>(() => new Set());

  function openForReview(doc: WorkflowDocument) {
    setSelectedDoc(doc);
    setOpenedIds((current) => {
      const next = new Set(current);
      next.add(doc.id);
      return next;
    });
    setError("");
  }


  const load = React.useCallback(async () => {
    if (!config || !projectKey) {
      setInbox([]);
      setApproved([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const encodedProject = encodeURIComponent(projectKey);
      const base = `/api/inbox/${encodedProject}/${encodeURIComponent(type)}`;

      const endpoints =
      type === "REGIE" || type === "TAGESBERICHT" || type === "BAUTAGEBUCH" ?
      {
        inbox:
        type === "TAGESBERICHT" ?
        `/api/tagesbericht/inbox/list?projectId=${encodedProject}` :
        `/api/regie/inbox/list?projectId=${encodedProject}`,
        inboxFallback: `/api/regie/inbox/list?projectId=${encodedProject}`,
        approved: `/api/regie/freigegeben/list?projectId=${encodedProject}`
      } :
      type === "LIEFERSCHEIN" ?
      {
        inbox: `/api/ls/inbox/list?projectId=${encodedProject}`,
        approved: `/api/ls/freigegeben/list?projectId=${encodedProject}`
      } :
      type === "FOTOS" ?
      {
        inbox: `/api/fotos/inbox/list?projectId=${encodedProject}`,
        approved: `/api/fotos/freigegeben/list?projectId=${encodedProject}`
      } :
      { inbox: base, approved: `${base}/approved` };

      let incoming: any;
      try {
        incoming = await request<any>(endpoints.inbox);
      } catch (error) {
        if ("inboxFallback" in endpoints && endpoints.inboxFallback) {
          incoming = await request<any>(endpoints.inboxFallback);
        } else {
          throw error;
        }
      }

      const released = await requestOptional<any>(endpoints.approved);
      setInbox(filterForType(type, itemsOf(incoming)));
      setApproved(filterForType(type, itemsOf(released)));
    } catch (e: any) {
      setError(e?.message || "Eingangsprüfung konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [config, projectKey, type]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function approve(doc: WorkflowDocument) {
    if (!openedIds.has(doc.id)) {
      setError("Dokument zuerst mit „Öffnen / Prüfen“ kontrollieren.");
      return;
    }
    if (!confirm(`„${docTitle(doc)}“ freigeben und ins Fachmodul übernehmen?`)) return;
    try {
      setLoading(true);
      const usesRegieWorkflow =
      type === "REGIE" || type === "TAGESBERICHT" || type === "BAUTAGEBUCH";
      const approvePath = usesRegieWorkflow ?
      "/api/regie/inbox/approve" :
      type === "LIEFERSCHEIN" ?
      "/api/ls/inbox/approve" :
      type === "FOTOS" ?
      "/api/fotos/inbox/approve" :
      `/api/inbox/${encodeURIComponent(projectKey)}/${encodeURIComponent(type)}/${encodeURIComponent(doc.id)}/approve`;
      const approveBody =
      usesRegieWorkflow || type === "LIEFERSCHEIN" || type === "FOTOS" ?
      { projectId: projectKey, docId: doc.id, id: doc.id, reportType: type } :
      {};
      await request(approvePath, { method: "POST", body: JSON.stringify(approveBody) });
      await load();
    } catch (e: any) {
      setError(e?.message || "Freigabe fehlgeschlagen.");
      setLoading(false);
    }
  }

  async function reject(doc: WorkflowDocument) {
    const reason = prompt("Grund der Ablehnung:", doc.rejectionReason || "");
    if (!reason?.trim()) return;
    try {
      setLoading(true);
      const usesRegieWorkflow =
      type === "REGIE" || type === "TAGESBERICHT" || type === "BAUTAGEBUCH";
      const rejectPath = usesRegieWorkflow ?
      "/api/regie/inbox/reject" :
      type === "LIEFERSCHEIN" ?
      "/api/ls/inbox/reject" :
      type === "FOTOS" ?
      "/api/fotos/inbox/reject" :
      `/api/inbox/${encodeURIComponent(projectKey)}/${encodeURIComponent(type)}/${encodeURIComponent(doc.id)}/reject`;
      const rejectBody =
      usesRegieWorkflow || type === "LIEFERSCHEIN" || type === "FOTOS" ?
      {
        projectId: projectKey,
        docId: doc.id,
        id: doc.id,
        reportType: type,
        reason: reason.trim()
      } :
      { reason: reason.trim() };
      await request(rejectPath, { method: "POST", body: JSON.stringify(rejectBody) });
      await load();
    } catch (e: any) {
      setError(e?.message || "Ablehnung fehlgeschlagen.");
      setLoading(false);
    }
  }

  if (!config) {
    return <div className="rlc-migrated-pages-mobile-pruefung-tsx-1497">Unbekanntes Prüfmodul.</div>;
  }

  return (
    <div className="rlc-migrated-pages-mobile-pruefung-tsx-1498">
      <div className="rlc-page-hero rlc-page-hero--split">
        <div>
          <div className="rlc-page-hero__eyebrow">Mobile · Eingangsprüfung</div>
          <h1 className="rlc-migrated-pages-mobile-pruefung-tsx-1501">{config.title}</h1>
          <div className="rlc-migrated-pages-mobile-pruefung-tsx-1502">Projekt: {projectKey || "Kein Projekt gewählt"}</div>
        </div>
        <div className="rlc-migrated-pages-mobile-pruefung-tsx-1503">
          <button type="button" onClick={() => void load()} disabled={loading || !projectKey} className={rlcClass(null, buttonStyle)}>
            {loading ? "Lädt …" : "Aktualisieren"}
          </button>
          <Link to={config.finalTo} style={{ ...buttonStyle, textDecoration: "none", background: "#0b5bd3", color: "white" }}>
            {config.finalLabel} →
          </Link>
        </div>
      </div>

      {error ? <div className={rlcClass(null, errorStyle)}>{error}</div> : null}
      {!projectKey ? <div className={rlcClass(null, errorStyle)}>Bitte zuerst ein Projekt auswählen.</div> : null}

      <section>
        <h2 className="rlc-migrated-pages-mobile-pruefung-tsx-1504">Eingang ({inbox.length})</h2>
        <div className={rlcClass(null, gridStyle)}>
          {inbox.map((doc) =>
          <article key={doc.id} className={rlcClass(null, cardStyle)}>
              <div className="rlc-migrated-pages-mobile-pruefung-tsx-1505">{docTitle(doc)}</div>
              <div className={rlcClass(null, metaStyle)}>{docDate(doc)} · ID {doc.id}</div>
              {doc.rejectionReason ? <div className="rlc-migrated-pages-mobile-pruefung-tsx-1506">Abgelehnt: {doc.rejectionReason}</div> : null}
              <div className="rlc-migrated-pages-mobile-pruefung-tsx-1507">
                {Array.isArray(doc.rows) ? `${doc.rows.length} Position(en)` : doc.workflowStatus || "EINGEREICHT"}
              </div>
              <div className="rlc-migrated-pages-mobile-pruefung-tsx-1508">
                <button
                type="button"
                onClick={() => openForReview(doc)}
                disabled={loading} className={rlcClass(null,
                { ...buttonStyle, background: "#0b5bd3", color: "white" })}>
                
                  Öffnen / Prüfen
                </button>
                <button
                type="button"
                onClick={() => void approve(doc)}
                disabled={loading || !openedIds.has(doc.id)}
                title={!openedIds.has(doc.id) ? "Dokument zuerst öffnen und prüfen" : undefined} className={rlcClass(null,
                {
                  ...buttonStyle,
                  background: openedIds.has(doc.id) ? "#166534" : "#94a3b8",
                  color: "white",
                  cursor: openedIds.has(doc.id) ? "pointer" : "not-allowed"
                })}>
                
                  Freigeben
                </button>
                <button type="button" onClick={() => void reject(doc)} disabled={loading} className={rlcClass(null, buttonStyle)}>
                  Ablehnen
                </button>
              </div>
            </article>
          )}
          {!inbox.length ? <div className={rlcClass(null, emptyStyle)}>Keine Dokumente im Eingang.</div> : null}
        </div>
      </section>

      <section>
        <h2 className="rlc-migrated-pages-mobile-pruefung-tsx-1509">Freigegeben und übernommen ({approved.length})</h2>
        <div className={rlcClass(null, gridStyle)}>
          {approved.map((doc) =>
          <article key={doc.id} className={rlcClass(null, cardStyle)}>
              <div className="rlc-migrated-pages-mobile-pruefung-tsx-1510">{docTitle(doc)}</div>
              <div className={rlcClass(null, metaStyle)}>{docDate(doc)} · {doc.workflowStatus || "FREIGEGEBEN"}</div>
              <div className="rlc-migrated-pages-mobile-pruefung-tsx-1511">Im Fachmodul registriert</div>
            </article>
          )}
          {!approved.length ? <div className={rlcClass(null, emptyStyle)}>Noch keine freigegebenen Dokumente.</div> : null}
        </div>
      </section>

      {selectedDoc ?
      <div className={rlcClass(null, modalBackdropStyle)} onMouseDown={() => setSelectedDoc(null)}>
          <div className={rlcClass(null, modalStyle)} onMouseDown={(event) => event.stopPropagation()}>
            <div className="rlc-migrated-pages-mobile-pruefung-tsx-1512">
              <div>
                <div className="rlc-migrated-pages-mobile-pruefung-tsx-1513">Dokumentprüfung</div>
                <h2 className="rlc-migrated-pages-mobile-pruefung-tsx-1514">{docTitle(selectedDoc)}</h2>
              </div>
              <button type="button" onClick={() => setSelectedDoc(null)} className={rlcClass(null, buttonStyle)}>
                Schließen
              </button>
            </div>

            {documentFileUrl(selectedDoc) ?
          <div className="rlc-migrated-pages-mobile-pruefung-tsx-1515">
                <a
              href={documentFileUrl(selectedDoc)}
              target="_blank"
              rel="noreferrer" className={rlcClass(null,
              { ...buttonStyle, textDecoration: "none", width: "fit-content", background: "#0b5bd3", color: "white" })}>
              
                  PDF / Datei öffnen
                </a>
                <iframe
              title={`Vorschau ${docTitle(selectedDoc)}`}
              src={documentFileUrl(selectedDoc)} className="rlc-migrated-pages-mobile-pruefung-tsx-1516" />

            
              </div> :
          null}

            <div className={rlcClass(null, detailGridStyle)}>
              {documentFields(type, selectedDoc).map(([label, value]) =>
            <div key={label} className={rlcClass(null, detailRowStyle)}>
                  <div className="rlc-migrated-pages-mobile-pruefung-tsx-1517">{label}</div>
                  <div className="rlc-migrated-pages-mobile-pruefung-tsx-1518">
                    {valueText(value)}
                  </div>
                </div>
            )}
            </div>

            <div className="rlc-migrated-pages-mobile-pruefung-tsx-1519">
              <Link
              to={`${config.finalTo}?projectId=${encodeURIComponent(projectKey)}&docId=${encodeURIComponent(selectedDoc.id)}&stage=inbox&source=mobile`}
              onClick={() => {
                const key = `rlc:mobile-workflow:${projectKey}:${type}:${selectedDoc.id}`;
                const documentPayload = JSON.stringify(selectedDoc);
                const lastPayload = JSON.stringify({
                  projectKey,
                  type,
                  docId: selectedDoc.id,
                  document: selectedDoc,
                  storedAt: Date.now()
                });

                sessionStorage.setItem(key, documentPayload);
                sessionStorage.setItem("rlc:mobile-workflow:last", lastPayload);
                localStorage.setItem(key, documentPayload);
                localStorage.setItem("rlc:mobile-workflow:last", lastPayload);
              }}
              style={{ ...buttonStyle, textDecoration: "none", background: "#0f172a", color: "white" }}>
              
                Im Fachmodul öffnen
              </Link>

              <button
              type="button"
              onClick={() => {
                setSelectedDoc(null);
                void approve(selectedDoc);
              }}
              disabled={loading} className={rlcClass(null,
              { ...buttonStyle, background: "#166534", color: "white" })}>
              
                Geprüft und freigeben
              </button>
            </div>
          </div>
        </div> :
      null}
    </div>);

}

const gridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 };
const cardStyle: React.CSSProperties = { display: "grid", gap: 8, padding: 15, border: "1px solid #dbe4f0", borderRadius: 14, background: "white" };
const metaStyle: React.CSSProperties = { color: "#64748b", fontSize: 11 };
const buttonStyle: React.CSSProperties = { border: "1px solid #cbd5e1", borderRadius: 9, background: "white", color: "#0f172a", padding: "8px 11px", fontWeight: 700, cursor: "pointer" };
const errorStyle: React.CSSProperties = { padding: 12, border: "1px solid #fecaca", borderRadius: 10, background: "#fef2f2", color: "#991b1b" };
const modalBackdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 3000,
  display: "grid",
  placeItems: "center",
  padding: 18,
  background: "rgba(15, 23, 42, 0.55)"
};

const modalStyle: React.CSSProperties = {
  width: "min(1100px, 96vw)",
  maxHeight: "92vh",
  overflow: "auto",
  display: "grid",
  gap: 16,
  padding: 18,
  borderRadius: 16,
  background: "#f8fafc",
  boxShadow: "0 24px 80px rgba(15,23,42,0.35)"
};

const detailGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 10
};

const detailRowStyle: React.CSSProperties = {
  display: "grid",
  gap: 5,
  padding: 11,
  border: "1px solid #dbe4f0",
  borderRadius: 10,
  background: "white"
};
const emptyStyle: React.CSSProperties = { padding: 16, border: "1px dashed #cbd5e1", borderRadius: 12, color: "#64748b" };
