import { rlcClass } from "../../ui/rlcRuntimeStyle";import React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiUrl } from "../../lib/apiBase";
import { useProject } from "../../store/useProject";

type TagesberichtLine = {
  id: string;
  von?: string;
  bis?: string;
  pauseMin?: number;
  stunden?: number;
  mitarbeiter?: string;
  maschine?: string;
  ort?: string;
  taetigkeit?: string;
  notiz?: string;
};

type Tagesbericht = {
  id: string;
  sourceDocId?: string;
  projectId: string;
  projectCode: string;
  date: string;
  weather?: string;
  temperature?: string;
  workers?: string;
  machines?: string;
  materials?: string;
  workDone?: string;
  issues?: string;
  notes?: string;
  attachments?: any[];
  pdfUrl?: string;
  lines?: TagesberichtLine[];
  reportType: "TAGESBERICHT";
  workflowStatus?: string;
  inBautagebuch?: boolean;
  bautagebuchTransferredAt?: number;
  createdAt?: number;
  updatedAt?: number;
};

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
  const firstRow =
  Array.isArray(wrapper.rows) && wrapper.rows.length ?
  wrapper.rows[0] :
  Array.isArray(wrapper.lines) &&
  wrapper.lines.length === 1 &&
  String(wrapper.lines[0]?.reportType || "").toUpperCase() ===
  "TAGESBERICHT" ?
  wrapper.lines[0] :
  wrapper;

  const report = firstRow || {};
  const sourceDocId = String(
    wrapper.id ||
    wrapper.docId ||
    wrapper.documentId ||
    report.sourceDocId ||
    report.id ||
    ""
  ).trim();

  const id = String(report.id || sourceDocId || crypto.randomUUID()).trim();

  return {
    ...wrapper,
    ...report,
    id,
    sourceDocId,
    projectId: String(
      report.projectId || wrapper.projectId || projectKey
    ).trim(),
    projectCode: String(
      report.projectCode ||
      wrapper.projectCode ||
      report.projectId ||
      wrapper.projectId ||
      projectKey
    ).trim(),
    date: String(
      report.date ||
      report.datum ||
      wrapper.date ||
      wrapper.datum ||
      new Date().toISOString().slice(0, 10)
    ).slice(0, 10),
    weather: String(
      report.weather ||
      report.wetter ||
      wrapper.weather ||
      wrapper.wetter ||
      ""
    ),
    temperature: String(
      report.temperature ||
      report.temperatur ||
      wrapper.temperature ||
      wrapper.temperatur ||
      ""
    ),
    workers: String(
      report.workers ||
      report.mitarbeiter ||
      wrapper.workers ||
      wrapper.mitarbeiter ||
      ""
    ),
    machines: String(
      report.machines ||
      report.maschinen ||
      wrapper.machines ||
      wrapper.maschinen ||
      ""
    ),
    materials: String(
      report.materials ||
      report.materialien ||
      report.material ||
      wrapper.materials ||
      wrapper.materialien ||
      wrapper.material ||
      ""
    ),
    workDone: String(
      report.workDone ||
      report.arbeiten ||
      report.taetigkeit ||
      report.comment ||
      wrapper.workDone ||
      wrapper.arbeiten ||
      wrapper.comment ||
      ""
    ),
    issues: String(
      report.issues ||
      report.vorkommnisse ||
      wrapper.issues ||
      wrapper.vorkommnisse ||
      ""
    ),
    notes: String(
      report.notes ||
      report.notizen ||
      wrapper.notes ||
      wrapper.notizen ||
      wrapper.note ||
      ""
    ),
    attachments: Array.isArray(report.attachments) ?
    report.attachments :
    Array.isArray(wrapper.attachments) ?
    wrapper.attachments :
    [],
    pdfUrl: String(report.pdfUrl || wrapper.pdfUrl || ""),
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
    reportType: "TAGESBERICHT",
    workflowStatus: String(
      report.workflowStatus ||
      wrapper.workflowStatus ||
      wrapper.status ||
      "DRAFT"
    ),
    inBautagebuch: Boolean(
      report.inBautagebuch || wrapper.inBautagebuch
    ),
    bautagebuchTransferredAt: Number(
      report.bautagebuchTransferredAt ||
      wrapper.bautagebuchTransferredAt ||
      0
    ) || undefined,
    createdAt: Number(
      report.createdAt || wrapper.createdAt || Date.now()
    ),
    updatedAt: Number(
      report.updatedAt || wrapper.updatedAt || Date.now()
    )
  };
}

function emptyReport(projectKey: string): Tagesbericht {
  return {
    id: crypto.randomUUID(),
    sourceDocId: "",
    projectId: projectKey,
    projectCode: projectKey,
    date: new Date().toISOString().slice(0, 10),
    weather: "",
    temperature: "",
    workers: "",
    machines: "",
    materials: "",
    workDone: "",
    issues: "",
    notes: "",
    attachments: [],
    lines: [],
    reportType: "TAGESBERICHT",
    workflowStatus: "DRAFT",
    inBautagebuch: false,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

function reportHours(report: Tagesbericht): number {
  return (report.lines || []).reduce(
    (sum, line) => sum + Number(line.stunden || 0),
    0
  );
}

export default function Tagesberichte() {
  const navigate = useNavigate();
  const { getSelectedProject } = useProject();
  const project = getSelectedProject();
  const projectKey = String(project?.code || project?.id || "").trim();
  const [params] = useSearchParams();
  const routeDocId = String(params.get("docId") || "").trim();

  const [items, setItems] = React.useState<Tagesbericht[]>([]);
  const [selected, setSelected] = React.useState<Tagesbericht | null>(null);
  const [savedSummary, setSavedSummary] =
  React.useState<Tagesbericht | null>(null);
  const [month, setMonth] = React.useState(
    new Date().toISOString().slice(0, 7)
  );
  const [search, setSearch] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [pdfUrl, setPdfUrl] = React.useState("");
  const [pdfLoading, setPdfLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!projectKey) return;

    setLoading(true);
    setError("");

    try {
      const responses = await Promise.all([
      request(
        `/api/regie/inbox/list?projectId=${encodeURIComponent(projectKey)}`
      ).catch(() => ({ items: [] })),
      request(
        `/api/regie/freigegeben/list?projectId=${encodeURIComponent(projectKey)}`
      ).catch(() => ({ items: [] })),
      request(
        `/api/regie/final/list?projectId=${encodeURIComponent(projectKey)}`
      ).catch(() => ({ items: [] })),
      request(
        `/api/tagesbericht/inbox/list?projectId=${encodeURIComponent(projectKey)}`
      ).catch(() => ({ items: [] }))]
      );

      const normalized = responses.
      flatMap(itemsOf).
      filter((item) => {
        const first =
        Array.isArray(item?.rows) && item.rows.length ?
        item.rows[0] :
        item;
        return (
          String(
            first?.reportType ||
            item?.reportType ||
            first?.type ||
            item?.type ||
            ""
          ).toUpperCase() === "TAGESBERICHT");

      }).
      map((item) => normalizeReport(item, projectKey));

      const unique = Array.from(
        new Map<string, Tagesbericht>(
          normalized.map((item) => [
          item.sourceDocId || item.id,
          item]
          )
        ).values()
      ).sort((a, b) =>
      String(b.date || "").localeCompare(String(a.date || ""))
      );

      setItems(unique);

      if (routeDocId) {
        const key = `rlc:mobile-workflow:${projectKey}:TAGESBERICHT:${routeDocId}`;
        const raw = sessionStorage.getItem(key);

        if (raw) {
          setSelected(
            normalizeReport(JSON.parse(raw), projectKey)
          );
        } else {
          setSelected(
            unique.find(
              (item) =>
              item.id === routeDocId ||
              item.sourceDocId === routeDocId
            ) || null
          );
        }
      } else {
        setSelected((current) => {
          if (!current) return current;

          return (
            unique.find(
              (item) =>
              item.id === current.id ||
              item.sourceDocId === current.sourceDocId
            ) || current);

        });
      }
    } catch (e: any) {
      setError(
        e?.message || "Tagesberichte konnten nicht geladen werden."
      );
    } finally {
      setLoading(false);
    }
  }, [projectKey, routeDocId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    setPdfUrl(assetUrl(selected?.pdfUrl || ""));
  }, [selected?.id, selected?.pdfUrl]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();

    return items.filter((item) => {
      if (month && !String(item.date || "").startsWith(month)) {
        return false;
      }

      if (!q) return true;

      return [
      item.date,
      item.weather,
      item.temperature,
      item.workers,
      item.machines,
      item.materials,
      item.workDone,
      item.issues,
      item.notes,
      ...(item.lines || []).flatMap((line) => [
      line.mitarbeiter,
      line.maschine,
      line.ort,
      line.taetigkeit,
      line.notiz]
      )].

      join(" ").
      toLowerCase().
      includes(q);
    });
  }, [items, month, search]);

  function update<K extends keyof Tagesbericht>(
  key: K,
  value: Tagesbericht[K])
  {
    setSelected((current) =>
    current ?
    { ...current, [key]: value, updatedAt: Date.now() } :
    current
    );
  }

  function addLine() {
    setSelected((current) =>
    current ?
    {
      ...current,
      lines: [
      ...(current.lines || []),
      {
        id: crypto.randomUUID(),
        von: "",
        bis: "",
        pauseMin: 0,
        stunden: 0,
        mitarbeiter: "",
        maschine: "",
        ort: "",
        taetigkeit: "",
        notiz: ""
      }]

    } :
    current
    );
  }

  function updateLine(
  id: string,
  key: keyof TagesberichtLine,
  value: any)
  {
    setSelected((current) =>
    current ?
    {
      ...current,
      lines: (current.lines || []).map((line) =>
      line.id === id ? { ...line, [key]: value } : line
      ),
      updatedAt: Date.now()
    } :
    current
    );
  }

  async function save(options?: {
    transferToBautagebuch?: boolean;
  }): Promise<Tagesbericht | null> {
    if (!selected || !projectKey) return null;

    setLoading(true);
    setError("");

    const transfer = Boolean(options?.transferToBautagebuch);
    const now = Date.now();

    const nextReport: Tagesbericht = {
      ...selected,
      projectId: projectKey,
      projectCode: projectKey,
      reportType: "TAGESBERICHT",
      inBautagebuch: transfer || selected.inBautagebuch,
      bautagebuchTransferredAt: transfer ?
      now :
      selected.bautagebuchTransferredAt,
      updatedAt: now
    };

    try {
      const snapshot = {
        id: nextReport.sourceDocId || nextReport.id,
        docId: nextReport.sourceDocId || nextReport.id,
        projectId: projectKey,
        projectCode: projectKey,
        date: nextReport.date,
        note: nextReport.notes || "",
        reportType: "TAGESBERICHT",
        workflowStatus: nextReport.workflowStatus || "DRAFT",
        inBautagebuch: nextReport.inBautagebuch,
        bautagebuchTransferredAt:
        nextReport.bautagebuchTransferredAt,
        rows: [nextReport]
      };

      const payload = await request(
        "/api/ki/regie/commit/regiebericht",
        {
          method: "POST",
          body: JSON.stringify(snapshot)
        }
      );

      const returned =
      payload?.snapshot ||
      payload?.item ||
      payload?.report ||
      payload?.data ||
      nextReport;

      const saved = normalizeReport(returned, projectKey);

      const finalSaved: Tagesbericht = {
        ...nextReport,
        ...saved,
        id: saved.id || nextReport.id,
        sourceDocId:
        saved.sourceDocId ||
        nextReport.sourceDocId ||
        nextReport.id,
        inBautagebuch:
        transfer ||
        saved.inBautagebuch ||
        nextReport.inBautagebuch,
        bautagebuchTransferredAt:
        transfer ?
        now :
        saved.bautagebuchTransferredAt ||
        nextReport.bautagebuchTransferredAt
      };

      setSelected(finalSaved);
      setSavedSummary(finalSaved);
      setItems((current) => {
        const identity =
        finalSaved.sourceDocId || finalSaved.id;
        const withoutCurrent = current.filter(
          (item) =>
          (item.sourceDocId || item.id) !== identity &&
          item.id !== finalSaved.id
        );

        return [finalSaved, ...withoutCurrent].sort((a, b) =>
        String(b.date || "").localeCompare(
          String(a.date || "")
        )
        );
      });

      if (transfer) {
        navigate(
          `/buro/bautagebuch?docId=${encodeURIComponent(
            finalSaved.sourceDocId || finalSaved.id
          )}&source=tagesbericht`
        );
      }

      return finalSaved;
    } catch (e: any) {
      setError(e?.message || "Speichern fehlgeschlagen.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  function pdfPayload(report: Tagesbericht) {
    return {
      ...report,
      projectId: projectKey,
      projectCode: projectKey,
      reportType: "TAGESBERICHT",
      attachments: report.attachments || [],
      lines: report.lines || []
    };
  }

  async function createPdf(): Promise<string> {
    if (!selected || !projectKey) {
      throw new Error("Kein Tagesbericht ausgewählt.");
    }

    setPdfLoading(true);
    setError("");

    try {
      const result = await request("/api/tagesbericht/preview", {
        method: "POST",
        body: JSON.stringify(pdfPayload(selected))
      });

      const nextUrl = assetUrl(result?.pdfUrl || result?.url || "");
      if (!nextUrl) {
        throw new Error("PDF-URL fehlt in der Serverantwort.");
      }

      setPdfUrl(nextUrl);
      return nextUrl;
    } catch (e: any) {
      setError(e?.message || "PDF Vorschau fehlgeschlagen.");
      throw e;
    } finally {
      setPdfLoading(false);
    }
  }

  async function exportPdf() {
    try {
      const url = await createPdf();
      const link = document.createElement("a");
      link.href = url;
      link.download = `Tagesbericht_${selected?.date || "Export"}.pdf`;
      link.target = "_blank";
      link.rel = "noreferrer";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {


      // Fehler wird in createPdf angezeigt.
    }}
  async function approve() {
    if (!selected) return;

    await request("/api/regie/inbox/approve", {
      method: "POST",
      body: JSON.stringify({
        projectId: projectKey,
        docId: selected.sourceDocId || selected.id,
        reportType: "TAGESBERICHT"
      })
    });

    window.location.assign("/mobile/pruefung/TAGESBERICHT");
  }

  const totalHours = filtered.reduce(
    (sum, item) => sum + reportHours(item),
    0
  );

  return (
    <div className="rlc-migrated-pages-buro-tagesberichte-tsx-394">





      
      <ModuleHero
        title="Tagesberichte"
        subtitle="Mobile-Prüfung, Bearbeitung und Übergabe in das Bautagebuch in einem durchgängigen Workflow." />
      

      <div className="rlc-migrated-pages-buro-tagesberichte-tsx-395">
        <div className="rlc-migrated-pages-buro-tagesberichte-tsx-398">
          <button
            className="btn"
            onClick={() => {
              setSelected(emptyReport(projectKey));
              setSavedSummary(null);
              setPdfUrl("");
            }}>
            
            + Neuer Tagesbericht
          </button>

          <Link className="btn" to="/buro/bautagebuch">
            Bautagebuch öffnen
          </Link>

          <button
            className="btn"
            onClick={() => void load()}
            disabled={loading}>
            
            Aktualisieren
          </button>
        </div>
      </div>

      {error ?
      <div className="rlc-migrated-pages-buro-tagesberichte-tsx-399">






        
          {error}
        </div> :
      null}

      <div className="rlc-migrated-pages-buro-tagesberichte-tsx-400">






        
        <Stat label="Einträge" value={filtered.length} />
        <Stat
          label="Gesamtstunden"
          value={totalHours.toLocaleString("de-DE")} />
        
        <Stat
          label="Vorkommnisse"
          value={
          filtered.filter((item) => item.issues?.trim()).length
          } />
        
      </div>

      <div className="rlc-migrated-pages-buro-tagesberichte-tsx-401">










        
        <FilterField label="Monat">
          <input
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            placeholder="YYYY-MM" />
          
        </FilterField>

        <FilterField label="Suche">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Wetter, Tätigkeit, Mitarbeiter …" />
          
        </FilterField>
      </div>

      <div className={rlcClass(null,
      {
        display: "grid",
        gridTemplateColumns: selected ?
        "360px minmax(0,1fr)" :
        "1fr",
        gap: 14,
        alignItems: "start"
      })}>
        
        <div className="rlc-migrated-pages-buro-tagesberichte-tsx-402">
          {filtered.map((item) =>
          <button
            key={item.sourceDocId || item.id}
            type="button"
            onClick={() => {
              setSelected(item);
              setSavedSummary(null);
              setPdfUrl(assetUrl(item.pdfUrl || ""));
            }} className={rlcClass(null,
            {
              textAlign: "left",
              padding: 14,
              border: "1px solid #dbe4f0",
              borderRadius: 14,
              background:
              selected?.id === item.id ?
              "#eaf2ff" :
              "#fff",
              cursor: "pointer"
            })}>
            
              <strong>{item.date}</strong>

              <div className="rlc-migrated-pages-buro-tagesberichte-tsx-403">




              
                {item.workDone ||
              item.notes ||
              "Kein Beschreibungstext"}
              </div>

              <div className="rlc-migrated-pages-buro-tagesberichte-tsx-404">





              
                Wetter: {item.weather || "—"} · Zeilen:{" "}
                {(item.lines || []).length} · Stunden:{" "}
                {reportHours(item).toLocaleString("de-DE")}
              </div>
            </button>
          )}

          {!filtered.length ?
          <div className="rlc-migrated-pages-buro-tagesberichte-tsx-405">





            
              Keine Tagesberichte gefunden.
            </div> :
          null}
        </div>

        {selected ?
        <div className="rlc-migrated-pages-buro-tagesberichte-tsx-406">









          
            <h2 className="rlc-migrated-pages-buro-tagesberichte-tsx-407">
              Tagesbericht bearbeiten
            </h2>

            <div className={rlcClass(null, formGrid)}>
              <Field label="Datum">
                <input
                type="date"
                value={selected.date}
                onChange={(e) =>
                update("date", e.target.value)
                } />
              
              </Field>

              <Field label="Wetter">
                <input
                value={selected.weather || ""}
                onChange={(e) =>
                update("weather", e.target.value)
                } />
              
              </Field>

              <Field label="Temperatur">
                <input
                value={selected.temperature || ""}
                onChange={(e) =>
                update("temperature", e.target.value)
                } />
              
              </Field>

              <Field label="Mitarbeiter">
                <input
                value={selected.workers || ""}
                onChange={(e) =>
                update("workers", e.target.value)
                } />
              
              </Field>

              <Field label="Maschinen">
                <input
                value={selected.machines || ""}
                onChange={(e) =>
                update("machines", e.target.value)
                } />
              
              </Field>

              <Field label="Materialien">
                <input
                value={selected.materials || ""}
                onChange={(e) =>
                update("materials", e.target.value)
                } />
              
              </Field>

              <Field label="Ausgeführte Arbeiten" full>
                <textarea
                value={selected.workDone || ""}
                onChange={(e) =>
                update("workDone", e.target.value)
                } />
              
              </Field>

              <Field
              label="Vorkommnisse / Behinderungen"
              full>
              
                <textarea
                value={selected.issues || ""}
                onChange={(e) =>
                update("issues", e.target.value)
                } />
              
              </Field>

              <Field label="Notizen" full>
                <textarea
                value={selected.notes || ""}
                onChange={(e) =>
                update("notes", e.target.value)
                } />
              
              </Field>
            </div>

            <div className="rlc-migrated-pages-buro-tagesberichte-tsx-408">





            
              <h3 className="rlc-migrated-pages-buro-tagesberichte-tsx-409">Tageszeilen</h3>
              <button className="btn" onClick={addLine}>
                + Zeile
              </button>
            </div>

            <div className="rlc-migrated-pages-buro-tagesberichte-tsx-410">
              {(selected.lines || []).map((line) =>
            <div
              key={line.id} className="rlc-migrated-pages-buro-tagesberichte-tsx-411">








              
                  <input
                placeholder="Von"
                value={line.von || ""}
                onChange={(e) =>
                updateLine(
                  line.id,
                  "von",
                  e.target.value
                )
                } />
              
                  <input
                placeholder="Bis"
                value={line.bis || ""}
                onChange={(e) =>
                updateLine(
                  line.id,
                  "bis",
                  e.target.value
                )
                } />
              
                  <input
                type="number"
                placeholder="Std."
                value={line.stunden || 0}
                onChange={(e) =>
                updateLine(
                  line.id,
                  "stunden",
                  Number(e.target.value)
                )
                } />
              
                  <input
                placeholder="Ort"
                value={line.ort || ""}
                onChange={(e) =>
                updateLine(
                  line.id,
                  "ort",
                  e.target.value
                )
                } />
              
                  <input
                placeholder="Mitarbeiter"
                value={line.mitarbeiter || ""}
                onChange={(e) =>
                updateLine(
                  line.id,
                  "mitarbeiter",
                  e.target.value
                )
                } />
              
                  <input
                placeholder="Maschine"
                value={line.maschine || ""}
                onChange={(e) =>
                updateLine(
                  line.id,
                  "maschine",
                  e.target.value
                )
                } />
              
                  <input
                placeholder="Tätigkeit"
                value={line.taetigkeit || ""}
                onChange={(e) =>
                updateLine(
                  line.id,
                  "taetigkeit",
                  e.target.value
                )
                } />
              
                </div>
            )}
            </div>

            <div className="rlc-migrated-pages-buro-tagesberichte-tsx-412">






            
              <button
              className="btn"
              onClick={() => void createPdf()}
              disabled={loading || pdfLoading}>
              
                PDF Vorschau
              </button>

              <button
              className="btn"
              onClick={() => void exportPdf()}
              disabled={loading || pdfLoading}>
              
                PDF exportieren
              </button>

              <button
              className="btn"
              onClick={() => {
                setSelected(null);
                setPdfUrl("");
              }}>
              
                Schließen
              </button>

              <button
              className="btn"
              onClick={() => void save()}
              disabled={loading}>
              
                Entwurf speichern
              </button>

              <button
              className="btn rlc-migrated-pages-buro-tagesberichte-tsx-413"




              onClick={() =>
              void save({
                transferToBautagebuch: true
              })
              }
              disabled={loading}>
              
                In Bautagebuch übernehmen
              </button>

              {params.get("source") === "mobile" ?
            <button
              className="btn rlc-migrated-pages-buro-tagesberichte-tsx-414"




              onClick={() => void approve()}
              disabled={loading}>
              
                  Geprüft und freigeben
                </button> :
            null}
            </div>

            {savedSummary ?
          <SavedSummary report={savedSummary} /> :
          null}
          </div> :
        null}
      </div>

      {selected ?
      <PdfPreviewPanel
        url={pdfUrl}
        loading={pdfLoading}
        onCreate={() => void createPdf()} /> :

      null}
    </div>);

}

function FilterField({
  label,
  children
}: React.PropsWithChildren<{label: string;}>) {
  return (
    <label className="rlc-migrated-pages-buro-tagesberichte-tsx-415">








      
      <span>{label}</span>
      <div className="rlc-migrated-pages-buro-tagesberichte-tsx-416">



        
        {React.Children.map(children, (child) =>
        React.isValidElement(child) ?
        React.cloneElement(child as React.ReactElement<any>, {
          style: {
            width: "100%",
            minWidth: 0,
            boxSizing: "border-box",
            ...((child.props as any).style || {})
          }
        }) :
        child
        )}
      </div>
    </label>);

}

function PdfPreviewPanel({
  url,
  loading,
  onCreate




}: {url: string;loading: boolean;onCreate: () => void;}) {
  return (
    <section className="rlc-migrated-pages-buro-tagesberichte-tsx-417">






      
      <div className="rlc-migrated-pages-buro-tagesberichte-tsx-418">








        
        <div>
          <div className="rlc-migrated-pages-buro-tagesberichte-tsx-419">PDF Vorschau</div>
          <div className="rlc-migrated-pages-buro-tagesberichte-tsx-420">
            Einheitlicher RLC PDF Core mit Firmenlogo und Firmendaten.
          </div>
        </div>

        {!url ?
        <button className="btn" onClick={onCreate} disabled={loading}>
            {loading ? "PDF wird erstellt …" : "PDF Vorschau erstellen"}
          </button> :
        null}
      </div>

      {url ?
      <iframe
        title="Tagesbericht PDF Vorschau"
        src={url} className="rlc-migrated-pages-buro-tagesberichte-tsx-421" /> :









      <div className="rlc-migrated-pages-buro-tagesberichte-tsx-422">







        
          Noch keine PDF Vorschau erstellt.
        </div>
      }
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

      <h1 className="rlc-migrated-pages-buro-tagesberichte-tsx-425">





        
        {title}
      </h1>

      <p>





        
        {subtitle}
      </p>
    </section>);

}

function SavedSummary({
  report


}: {report: Tagesbericht;}) {
  return (
    <section className="rlc-migrated-pages-buro-tagesberichte-tsx-427">








      
      <div className="rlc-migrated-pages-buro-tagesberichte-tsx-428">






        
        <div>
          <div className="rlc-migrated-pages-buro-tagesberichte-tsx-429">






            
            Gespeicherte Zusammenfassung
          </div>
          <h3 className="rlc-migrated-pages-buro-tagesberichte-tsx-430">
            Tagesbericht {report.date}
          </h3>
        </div>

        {report.inBautagebuch ?
        <span className="rlc-migrated-pages-buro-tagesberichte-tsx-431">








          
            Im Bautagebuch
          </span> :
        null}
      </div>

      <div className="rlc-migrated-pages-buro-tagesberichte-tsx-432">






        
        <SummaryValue label="Wetter" value={report.weather} />
        <SummaryValue
          label="Temperatur"
          value={report.temperature} />
        
        <SummaryValue
          label="Mitarbeiter"
          value={report.workers} />
        
        <SummaryValue
          label="Stunden"
          value={reportHours(report).toLocaleString("de-DE")} />
        
        <SummaryValue
          label="Maschinen"
          value={report.machines} />
        
        <SummaryValue
          label="Materialien"
          value={report.materials} />
        
        <SummaryValue
          label="Tageszeilen"
          value={(report.lines || []).length} />
        
        <SummaryValue
          label="Anhänge"
          value={(report.attachments || []).length} />
        
      </div>

      <SummaryValue
        label="Ausgeführte Arbeiten"
        value={report.workDone} />
      
      <SummaryValue
        label="Vorkommnisse"
        value={report.issues} />
      
      <SummaryValue label="Notizen" value={report.notes} />
    </section>);

}

function SummaryValue({
  label,
  value



}: {label: string;value: React.ReactNode;}) {
  return (
    <div className="rlc-migrated-pages-buro-tagesberichte-tsx-433">







      
      <div className="rlc-migrated-pages-buro-tagesberichte-tsx-434">





        
        {label}
      </div>
      <div className="rlc-migrated-pages-buro-tagesberichte-tsx-435">





        
        {value == null || value === "" ? "—" : value}
      </div>
    </div>);

}

const formGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2,minmax(0,1fr))",
  gap: 10
};

function Field({
  label,
  full,
  children



}: React.PropsWithChildren<{label: string;full?: boolean;}>) {
  return (
    <label className={rlcClass(null,
    {
      display: "grid",
      gap: 5,
      gridColumn: full ? "1 / -1" : undefined,
      color: "#475569",
      fontSize: 12,
      fontWeight: 700,
      minWidth: 0
    })}>
      
      {label}
      {children}
    </label>);

}

function Stat({
  label,
  value



}: {label: string;value: React.ReactNode;}) {
  return (
    <div className="rlc-migrated-pages-buro-tagesberichte-tsx-436">






      
      <div className="rlc-migrated-pages-buro-tagesberichte-tsx-437">
        {value}
      </div>
      <div className="rlc-migrated-pages-buro-tagesberichte-tsx-438">
        {label}
      </div>
    </div>);

}
