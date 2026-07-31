import { rlcClass } from "../../ui/rlcRuntimeStyle";import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiUrl } from "../../lib/apiBase";
import { useProject } from "../../store/useProject";

type FotoFile = {
  file?: string;
  name?: string;
  publicUrl?: string;
  url?: string;
  uri?: string;
  type?: string;
};

type FotoDocument = Record<string, any> & {
  id: string;
  docId?: string;
  date?: string;
  mitarbeiter?: string;
  worker?: string;
  kostenstelle?: string;
  lvItemPos?: string;
  regieId?: string;
  lieferscheinId?: string;
  comment?: string;
  bemerkungen?: string;
  note?: string;
  main?: FotoFile | null;
  files?: FotoFile[];
  photos?: FotoFile[];
  attachments?: FotoFile[];
  imageUri?: string;
  pdfUrl?: string;
  workflowStatus?: string;
  status?: string;
  rejectionReason?: string;
};

type TabKey = "INBOX" | "VERWALTUNG";

type EditorState = {
  date: string;
  mitarbeiter: string;
  kostenstelle: string;
  lvItemPos: string;
  regieId: string;
  lieferscheinId: string;
  comment: string;
  bemerkungen: string;
};

function authHeaders(): Record<string, string> {
  const keys = [
  "rlc_token",
  "token",
  "authToken",
  "accessToken",
  "rlc_auth_token",
  "rlc.auth.token",
  "rlc_mobile_token"];


  for (const key of keys) {
    const token = localStorage.getItem(key) || sessionStorage.getItem(key);
    if (token?.trim()) return { Authorization: `Bearer ${token.trim()}` };
  }

  for (const storage of [localStorage, sessionStorage]) {
    try {
      const raw = storage.getItem("rlc_auth");
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const token = parsed?.token || parsed?.accessToken;
      if (token) return { Authorization: `Bearer ${String(token).trim()}` };
    } catch {


      // Alte oder ungültige Auth-Daten ignorieren.
    }}
  return {};
}

async function parsePayload(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    credentials: "include",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body && !(init.body instanceof FormData) ?
      { "Content-Type": "application/json" } :
      {}),
      ...authHeaders(),
      ...((init?.headers || {}) as Record<string, string>)
    }
  });

  const payload = await parsePayload(response);
  if (!response.ok || payload?.ok === false) {
    const detail =
    typeof payload === "string" ?
    payload :
    payload?.message || payload?.error || `HTTP ${response.status}`;
    throw new Error(detail);
  }

  return payload as T;
}

function itemsOf(payload: any): FotoDocument[] {
  const candidates = [
  payload,
  payload?.items,
  payload?.rows,
  payload?.documents,
  payload?.data,
  payload?.data?.items];


  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate as FotoDocument[];
  }

  return [];
}

function assetUrl(value?: string | null): string {
  const url = String(value || "").trim();
  if (!url) return "";
  if (/^(https?:|blob:|data:)/i.test(url)) return url;
  return apiUrl(url.startsWith("/") ? url : `/${url}`);
}

function fileUrl(file?: FotoFile | null): string {
  return assetUrl(file?.publicUrl || file?.url || file?.uri || "");
}

function uniqueFiles(doc: FotoDocument | null): FotoFile[] {
  if (!doc) return [];

  const all: FotoFile[] = [
  ...(doc.main ? [doc.main] : []),
  ...(Array.isArray(doc.files) ? doc.files : []),
  ...(Array.isArray(doc.photos) ? doc.photos : []),
  ...(Array.isArray(doc.attachments) ? doc.attachments : [])];


  if (doc.imageUri) {
    all.unshift({
      name: "Hauptfoto",
      uri: doc.imageUri,
      type: "image/jpeg"
    });
  }

  const seen = new Set<string>();
  return all.filter((entry) => {
    const url = fileUrl(entry);
    if (!url || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

function isImage(file: FotoFile): boolean {
  const value = String(file.type || file.name || file.file || fileUrl(file)).toLowerCase();
  return /image\//.test(value) || /\.(png|jpe?g|webp|gif|heic|heif)(\?|$)/.test(value);
}

function emptyEditor(): EditorState {
  return {
    date: new Date().toISOString().slice(0, 10),
    mitarbeiter: "",
    kostenstelle: "",
    lvItemPos: "",
    regieId: "",
    lieferscheinId: "",
    comment: "",
    bemerkungen: ""
  };
}

function editorFromDocument(doc: FotoDocument | null): EditorState {
  if (!doc) return emptyEditor();
  return {
    date: String(doc.date || doc.datum || new Date().toISOString()).slice(0, 10),
    mitarbeiter: String(doc.mitarbeiter || doc.worker || ""),
    kostenstelle: String(doc.kostenstelle || doc.costCenter || ""),
    lvItemPos: String(doc.lvItemPos || doc.lvPos || doc.position || ""),
    regieId: String(doc.regieId || doc.regieberichtId || ""),
    lieferscheinId: String(doc.lieferscheinId || doc.lsId || ""),
    comment: String(doc.comment || doc.note || doc.description || ""),
    bemerkungen: String(doc.bemerkungen || doc.notes || "")
  };
}

function storageDocument(projectKey: string, docId: string): FotoDocument | null {
  const key = `rlc:mobile-workflow:${projectKey}:FOTOS:${docId}`;
  for (const storage of [sessionStorage, localStorage]) {
    try {
      const raw = storage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed as FotoDocument;
    } catch {


      // Ungültigen Fallback ignorieren.
    }}return null;
}

function documentTitle(doc: FotoDocument): string {
  return String(
    doc.title ||
    doc.comment ||
    doc.note ||
    doc.main?.name ||
    doc.files?.[0]?.name ||
    doc.id ||
    "Foto / Notiz"
  );
}

function documentDate(doc: FotoDocument): string {
  return String(doc.date || doc.datum || doc.createdAt || "—").slice(0, 10);
}

export default function ProjektakteFotos() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { getSelectedProject } = useProject();
  const selectedProject = getSelectedProject();

  const projectKey =
  String(searchParams.get("projectId") || "").trim() ||
  String(selectedProject?.code || selectedProject?.id || "").trim();

  const routeDocId = String(searchParams.get("docId") || "").trim();
  const routeStage = String(searchParams.get("stage") || "").trim().toLowerCase();

  const [tab, setTab] = React.useState<TabKey>(routeStage === "inbox" ? "INBOX" : "VERWALTUNG");
  const [inbox, setInbox] = React.useState<FotoDocument[]>([]);
  const [archive, setArchive] = React.useState<FotoDocument[]>([]);
  const [selectedDoc, setSelectedDoc] = React.useState<FotoDocument | null>(null);
  const [editor, setEditor] = React.useState<EditorState>(emptyEditor());
  const [pdfUrl, setPdfUrl] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const selectedFiles = React.useMemo(() => uniqueFiles(selectedDoc), [selectedDoc]);
  const selectedId = String(selectedDoc?.id || selectedDoc?.docId || "").trim();
  const isInboxDocument = Boolean(selectedId && inbox.some((entry) => String(entry.id || entry.docId) === selectedId));

  const load = React.useCallback(async () => {
    if (!projectKey) {
      setInbox([]);
      setArchive([]);
      setSelectedDoc(null);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const encodedProject = encodeURIComponent(projectKey);
      const [inboxPayload, archivePayload] = await Promise.all([
      request<any>(`/api/fotos/inbox/list?projectId=${encodedProject}`),
      request<any>(`/api/fotos/freigegeben/list?projectId=${encodedProject}`)]
      );

      const nextInbox = itemsOf(inboxPayload).sort((a: FotoDocument, b: FotoDocument) =>
      documentDate(b).localeCompare(documentDate(a))
      );
      const nextArchive = itemsOf(archivePayload).sort((a: FotoDocument, b: FotoDocument) =>
      documentDate(b).localeCompare(documentDate(a))
      );

      setInbox(nextInbox);
      setArchive(nextArchive);

      let nextSelected: FotoDocument | null = null;

      if (routeDocId && routeStage === "inbox") {
        try {
          const payload = await request<any>(
            `/api/fotos/inbox/read?projectId=${encodedProject}&docId=${encodeURIComponent(routeDocId)}`
          );
          nextSelected = (payload?.snapshot || payload?.item || payload) as FotoDocument;
        } catch {
          nextSelected = storageDocument(projectKey, routeDocId);
        }
      }

      if (!nextSelected && routeDocId) {
        nextSelected =
        nextInbox.find((entry) => String(entry.id || entry.docId) === routeDocId) ||
        nextArchive.find((entry) => String(entry.id || entry.docId) === routeDocId) ||
        null;
      }

      if (!nextSelected && selectedId) {
        nextSelected =
        nextInbox.find((entry) => String(entry.id || entry.docId) === selectedId) ||
        nextArchive.find((entry) => String(entry.id || entry.docId) === selectedId) ||
        null;
      }

      if (!nextSelected) {
        nextSelected =
        routeStage === "inbox" ?
        nextInbox[0] || null :
        nextArchive[0] || null;
      }

      setSelectedDoc(nextSelected);
      setEditor(editorFromDocument(nextSelected));
      setPdfUrl(assetUrl(nextSelected?.pdfUrl || ""));
    } catch (loadError: any) {
      setError(loadError?.message || "Projektakte / Fotos konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [projectKey, routeDocId, routeStage]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function openDocument(
  doc: FotoDocument,
  nextTab: TabKey)
  {
    const id = String(doc.id || doc.docId || "").trim();

    if (!id) {
      setError("Dokument-ID fehlt.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      let fullDocument = doc;

      if (nextTab === "INBOX") {
        const payload = await request<any>(
          `/api/fotos/inbox/read?projectId=${encodeURIComponent(
            projectKey
          )}&docId=${encodeURIComponent(id)}`
        );

        fullDocument = (
        payload?.snapshot ||
        payload?.item ||
        payload) as
        FotoDocument;
      }

      setTab(nextTab);
      setSelectedDoc(fullDocument);
      setEditor(editorFromDocument(fullDocument));

      // In Inbox prima mostra direttamente foto/allegati.
      // Il PDF apparirà dopo PDF Vorschau.
      setPdfUrl(
        nextTab === "INBOX" ?
        "" :
        assetUrl(fullDocument.pdfUrl || "")
      );
    } catch (openError: any) {
      setError(
        openError?.message ||
        "Foto-Dokument konnte nicht geöffnet werden."
      );
    } finally {
      setLoading(false);
    }
  }

  function updateEditor<K extends keyof EditorState>(key: K, value: EditorState[K]) {
    setEditor((current) => ({ ...current, [key]: value }));
  }

  function editorPayload() {
    return {
      projectId: projectKey,
      projectCode: projectKey,
      docId: selectedId,
      id: selectedId,
      ...editor,
      worker: editor.mitarbeiter,
      note: editor.comment,
      status: selectedDoc?.status || "INBOX",
      workflowStatus: selectedDoc?.workflowStatus || "INBOX",
      main: selectedDoc?.main || null,
      files: Array.isArray(selectedDoc?.files) ? selectedDoc?.files : [],
      photos: Array.isArray(selectedDoc?.photos) ? selectedDoc?.photos : [],
      attachments: Array.isArray(selectedDoc?.attachments) ? selectedDoc?.attachments : [],
      imageUri: selectedDoc?.imageUri
    };
  }

  async function saveDraft(showMessage = true): Promise<FotoDocument> {
    if (!projectKey) throw new Error("Kein Projekt ausgewählt.");
    if (!selectedId) throw new Error("Kein Foto-Dokument ausgewählt.");
    if (!isInboxDocument) throw new Error("Freigegebene Einträge werden in der Projektakte nicht überschrieben.");

    setSaving(true);
    setError("");
    try {
      const result = await request<any>("/api/fotos/inbox/update", {
        method: "POST",
        body: JSON.stringify(editorPayload())
      });
      const updated = (result?.item || result?.snapshot || result) as FotoDocument;
      setSelectedDoc(updated);
      setEditor(editorFromDocument(updated));
      if (showMessage) setError("Änderungen gespeichert.");
      return updated;
    } finally {
      setSaving(false);
    }
  }

  async function approveSelected() {
    if (!selectedId || !isInboxDocument) return;
    if (!confirm("Foto-Dokument freigeben und dauerhaft in der Projektakte registrieren?")) return;

    setLoading(true);
    setError("");
    try {
      await saveDraft(false);
      const result = await request<any>("/api/fotos/inbox/approve", {
        method: "POST",
        body: JSON.stringify({ projectId: projectKey, docId: selectedId, id: selectedId })
      });
      const official = (result?.item || null) as FotoDocument | null;
      setTab("VERWALTUNG");
      setSelectedDoc(official);
      setEditor(editorFromDocument(official));
      setPdfUrl(assetUrl(official?.pdfUrl || ""));
      await load();
    } catch (approveError: any) {
      setError(approveError?.message || "Freigabe fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  async function rejectSelected() {
    if (!selectedId || !isInboxDocument) return;
    const reason = prompt("Grund der Ablehnung:", selectedDoc?.rejectionReason || "");
    if (!reason?.trim()) return;

    setLoading(true);
    setError("");
    try {
      await request("/api/fotos/inbox/reject", {
        method: "POST",
        body: JSON.stringify({ projectId: projectKey, docId: selectedId, id: selectedId, reason: reason.trim() })
      });
      await load();
    } catch (rejectError: any) {
      setError(rejectError?.message || "Ablehnung fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  async function createPdf(): Promise<string> {
    if (!projectKey) throw new Error("Kein Projekt ausgewählt.");
    if (!selectedDoc) throw new Error("Kein Foto-Dokument ausgewählt.");

    setLoading(true);
    setError("");
    try {
      const result = await request<any>("/api/fotos/preview", {
        method: "POST",
        body: JSON.stringify({ ...selectedDoc, ...editorPayload() })
      });
      const nextUrl = assetUrl(result?.pdfUrl || result?.url || "");
      if (!nextUrl) throw new Error("PDF-URL fehlt in der Serverantwort.");
      setPdfUrl(nextUrl);
      return nextUrl;
    } finally {
      setLoading(false);
    }
  }

  async function exportPdf() {
    try {
      const url = await createPdf();
      const link = document.createElement("a");
      link.href = url;
      link.download = `Fotodokumentation_${editor.date || "Export"}.pdf`;
      link.target = "_blank";
      link.rel = "noreferrer";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (pdfError: any) {
      setError(pdfError?.message || "PDF Export fehlgeschlagen.");
    }
  }

  async function uploadFiles(files: FileList | null) {
    if (!files?.length || !selectedId || !isInboxDocument) return;

    setLoading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("projectId", projectKey);
      form.append("projectCode", projectKey);
      form.append("docId", selectedId);
      form.append("id", selectedId);
      Array.from(files).forEach((file) => form.append("files", file));

      const result = await request<any>("/api/fotos/inbox/upload", {
        method: "POST",
        body: form
      });
      const updated = (result?.item || selectedDoc) as FotoDocument;
      setSelectedDoc(updated);
      setEditor(editorFromDocument(updated));
      await load();
    } catch (uploadError: any) {
      setError(uploadError?.message || "Datei-Upload fehlgeschlagen.");
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const list = tab === "INBOX" ? inbox : archive;

  return (
    <div className={rlcClass(null, pageStyle)}>
      <section className={rlcClass("rlc-page-hero", heroStyle)}>
        <div>
          <div className={rlcClass(null, heroBadgeStyle)}>Verwaltung</div>
          <h1 className={rlcClass(null, heroTitleStyle)}>Projektakte / Fotos</h1>
          <p className={rlcClass(null, heroSubtitleStyle)}>
            Mobile-Prüfung, Fotodokumentation und dauerhafte Projektakte in einem Workflow.
          </p>
        </div>
        <button type="button" className={rlcClass(null, heroButtonStyle)} onClick={() => navigate("/buro")}>Übersicht</button>
      </section>

      <div className={rlcClass(null, toolbarStyle)}>
        <div className="rlc-migrated-pages-buro-projektaktefotos-tsx-389">
          <TabButton active={tab === "INBOX"} onClick={() => setTab("INBOX")}>Inbox (Eingereicht) · {inbox.length}</TabButton>
          <TabButton active={tab === "VERWALTUNG"} onClick={() => setTab("VERWALTUNG")}>Verwaltung · {archive.length}</TabButton>
          <button type="button" className={rlcClass(null, secondaryButtonStyle)} onClick={() => void load()} disabled={loading}>Aktualisieren</button>
        </div>

        <div className="rlc-migrated-pages-buro-projektaktefotos-tsx-390">
          <button type="button" className={rlcClass(null, primaryButtonStyle)} onClick={() => void approveSelected()} disabled={!isInboxDocument || loading}>Freigeben</button>
          <button type="button" className={rlcClass(null, dangerButtonStyle)} onClick={() => void rejectSelected()} disabled={!isInboxDocument || loading}>Ablehnen</button>
          <span className={rlcClass(null, projectLabelStyle)}>Projekt-ID</span>
          <div className={rlcClass(null, projectBoxStyle)}>{projectKey || "—"}</div>
        </div>
      </div>

      {error ?
      <div className={rlcClass(null, { ...messageStyle, color: error === "Änderungen gespeichert." ? "#166534" : "#991b1b" })}>
          {error}
        </div> :
      null}

      <section className={rlcClass(null, cardStyle)}>
        <div className={rlcClass(null, cardHeaderStyle)}>
          <div>
            <h2 className={rlcClass(null, cardTitleStyle)}>Büro-Bearbeitung</h2>
            <div className={rlcClass(null, mutedStyle)}>
              {isInboxDocument ?
              "Mobile-Dokument laden, prüfen, bearbeiten und in die Projektakte freigeben." :
              "Freigegebene Fotodokumentation aus der Projektakte anzeigen."}
            </div>
          </div>
          <div className={rlcClass(null, mutedStyle)}>{selectedFiles.length} Datei(en)</div>
        </div>

        <div className={rlcClass(null, sectionBodyStyle)}>
          <SectionTitle>ALLGEMEINE INFORMATIONEN</SectionTitle>
          <div className={rlcClass(null, generalGridStyle)}>
            <Field label="Datum"><input type="date" value={editor.date} onChange={(event) => updateEditor("date", event.target.value)} disabled={!isInboxDocument} className={rlcClass(null, inputStyle)} /></Field>
            <Field label="Mitarbeiter"><input value={editor.mitarbeiter} onChange={(event) => updateEditor("mitarbeiter", event.target.value)} disabled={!isInboxDocument} className={rlcClass(null, inputStyle)} /></Field>
            <Field label="Bereich / Kostenstelle"><input value={editor.kostenstelle} onChange={(event) => updateEditor("kostenstelle", event.target.value)} disabled={!isInboxDocument} className={rlcClass(null, inputStyle)} /></Field>
          </div>

          <SectionTitle>ZUORDNUNG</SectionTitle>
          <div className={rlcClass(null, linksGridStyle)}>
            <Field label="LV-Position"><input value={editor.lvItemPos} onChange={(event) => updateEditor("lvItemPos", event.target.value)} disabled={!isInboxDocument} placeholder="z. B. 001.010" className={rlcClass(null, inputStyle)} /></Field>
            <Field label="Regiebericht"><input value={editor.regieId} onChange={(event) => updateEditor("regieId", event.target.value)} disabled={!isInboxDocument} placeholder="Regie-ID / Regie-Nr." className={rlcClass(null, inputStyle)} /></Field>
            <Field label="Lieferschein"><input value={editor.lieferscheinId} onChange={(event) => updateEditor("lieferscheinId", event.target.value)} disabled={!isInboxDocument} placeholder="Lieferschein-ID / LS-Nr." className={rlcClass(null, inputStyle)} /></Field>
          </div>

          <SectionTitle>BESCHREIBUNG UND DOKUMENTATION</SectionTitle>
          <div className={rlcClass(null, descriptionGridStyle)}>
            <Field label="Beschreibung"><textarea value={editor.comment} onChange={(event) => updateEditor("comment", event.target.value)} disabled={!isInboxDocument} rows={5} className={rlcClass(null, textareaStyle)} /></Field>
            <Field label="Bemerkungen"><textarea value={editor.bemerkungen} onChange={(event) => updateEditor("bemerkungen", event.target.value)} disabled={!isInboxDocument} rows={5} className={rlcClass(null, textareaStyle)} /></Field>
          </div>

          <div className={rlcClass(null, actionRowStyle)}>
            <input ref={fileInputRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={(event) => void uploadFiles(event.target.files)} />
            <button type="button" className={rlcClass(null, secondaryButtonStyle)} onClick={() => fileInputRef.current?.click()} disabled={!isInboxDocument || loading}>Dateien hinzufügen</button>
            <button type="button" className={rlcClass(null, secondaryButtonStyle)} onClick={() => void saveDraft()} disabled={!isInboxDocument || saving}>{saving ? "Speichert …" : "Entwurf speichern"}</button>
            <button type="button" className={rlcClass(null, secondaryButtonStyle)} onClick={() => void createPdf()} disabled={!selectedDoc || loading}>PDF Vorschau</button>
            <button type="button" className={rlcClass(null, secondaryButtonStyle)} onClick={() => void exportPdf()} disabled={!selectedDoc || loading}>PDF exportieren</button>
          </div>
        </div>
      </section>

      <div className={rlcClass(null, contentGridStyle)}>
        <section className={rlcClass(null, cardStyle)}>
          <div className={rlcClass(null, smallCardHeaderStyle)}>
            <h3 className={rlcClass(null, smallCardTitleStyle)}>Dokumentvorschau</h3>
            <span className={rlcClass(null, mutedStyle)}>{selectedDoc ? documentTitle(selectedDoc) : "Kein Dokument gewählt"}</span>
          </div>

          <div className={rlcClass(null, previewAreaStyle)}>
            {pdfUrl ?
            <iframe title="PDF Vorschau" src={pdfUrl} className={rlcClass(null, iframeStyle)} /> :
            selectedFiles.length ?
            <div className={rlcClass(null, photoGridStyle)}>
                {selectedFiles.map((file, index) =>
              <a key={`${fileUrl(file)}-${index}`} href={fileUrl(file)} target="_blank" rel="noreferrer" className={rlcClass(null, fileCardStyle)}>
                    {isImage(file) ? <img src={fileUrl(file)} alt={file.name || `Foto ${index + 1}`} className={rlcClass(null, photoStyle)} /> : <div className={rlcClass(null, pdfFileStyle)}>PDF</div>}
                    <span className={rlcClass(null, fileNameStyle)}>{file.name || file.file || `Datei ${index + 1}`}</span>
                  </a>
              )}
              </div> :

            <div className={rlcClass(null, emptyPreviewStyle)}>Foto-Dokument auswählen.</div>
            }
          </div>
        </section>

        <section className={rlcClass(null, cardStyle)}>
          <div className={rlcClass(null, smallCardHeaderStyle)}>
            <h3 className={rlcClass(null, smallCardTitleStyle)}>{tab === "INBOX" ? "Inbox (Eingereicht)" : "Projektakte"}</h3>
            <span className={rlcClass(null, mutedStyle)}>{list.length} Eintrag(e)</span>
          </div>

          <div className={rlcClass(null, listStyle)}>
            {list.map((doc) => {
              const id = String(doc.id || doc.docId || "");
              const active = id === selectedId;
              return (
                <div
                  key={id} className={rlcClass(null,
                  {
                    ...listItemStyle,
                    ...(active ? activeListItemStyle : {}),
                    cursor: "default"
                  })}>
                  
                  <button
                    type="button"
                    onClick={() => void openDocument(doc, tab)} className="rlc-migrated-pages-buro-projektaktefotos-tsx-391">









                    
                    <div className={rlcClass(null, listTitleStyle)}>
                      {documentDate(doc)} · {documentTitle(doc)}
                    </div>

                    <div className={rlcClass(null, mutedStyle)}>
                      {doc.kostenstelle || "Keine Kostenstelle"} ·{" "}
                      {uniqueFiles(doc).length} Datei(en)
                    </div>
                  </button>

                  <div className="rlc-migrated-pages-buro-projektaktefotos-tsx-392">






                    
                    <span className={rlcClass(null, statusStyle)}>
                      {doc.workflowStatus ||
                      doc.status || (
                      tab === "INBOX" ?
                      "EINGEREICHT" :
                      "FREIGEGEBEN")}
                    </span>

                    <button
                      type="button"
                      onClick={() => void openDocument(doc, tab)}
                      disabled={loading} className={rlcClass(null,
                      {
                        border: "1px solid #cbd5e1",
                        background: "#ffffff",
                        color: "#0f172a",
                        borderRadius: 8,
                        padding: "6px 11px",
                        fontWeight: 700,
                        cursor: loading ? "wait" : "pointer"
                      })}>
                      
                      Öffnen
                    </button>
                  </div>
                </div>);

            })}
            {!list.length ? <div className={rlcClass(null, emptyListStyle)}>Keine Einträge vorhanden.</div> : null}
          </div>
        </section>
      </div>
    </div>);

}

function Field({ label, children }: React.PropsWithChildren<{label: string;}>) {
  return (
    <label className="rlc-migrated-pages-buro-projektaktefotos-tsx-393">
      <span className={rlcClass(null, fieldLabelStyle)}>{label}</span>
      {children}
    </label>);

}

function SectionTitle({ children }: React.PropsWithChildren) {
  return (
    <div className={rlcClass(null, sectionTitleRowStyle)}>
      <span className={rlcClass(null, sectionTitleStyle)}>{children}</span>
      <span className={rlcClass(null, sectionLineStyle)} />
    </div>);

}

function TabButton({ active, children, onClick }: React.PropsWithChildren<{active: boolean;onClick: () => void;}>) {
  return (
    <button type="button" onClick={onClick} className={rlcClass(null, { ...tabButtonStyle, ...(active ? activeTabButtonStyle : {}) })}>
      {children}
    </button>);

}

const pageStyle: React.CSSProperties = { display: "grid", gap: 14, paddingBottom: 28 };
const heroStyle: React.CSSProperties = { background: "linear-gradient(135deg, #0B5BD3 0%, #0B5BD3 48%, #146EF5 100%)", color: "#fff", borderRadius: 22, padding: "18px 22px", boxShadow: "0 14px 34px rgba(15,23,42,0.16)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" };
const heroBadgeStyle: React.CSSProperties = { display: "inline-flex", padding: "5px 10px", borderRadius: 999, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.24)", fontSize: 12, fontWeight: 700, marginBottom: 8 };
const heroTitleStyle: React.CSSProperties = { margin: 0, fontSize: 28, lineHeight: 1.1, fontWeight: 700, letterSpacing: "-0.04em" };
const heroSubtitleStyle: React.CSSProperties = { margin: "7px 0 0", fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.78)" };
const heroButtonStyle: React.CSSProperties = { border: "1px solid rgba(255,255,255,0.42)", background: "rgba(255,255,255,0.08)", color: "#fff", borderRadius: 12, padding: "9px 12px", fontWeight: 700, cursor: "pointer" };
const toolbarStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 14px", border: "1px solid #dbe4f0", borderRadius: 14, background: "white" };
const tabButtonStyle: React.CSSProperties = { border: "1px solid transparent", background: "transparent", borderRadius: 10, padding: "9px 12px", fontWeight: 700, cursor: "pointer", color: "#0f172a" };
const activeTabButtonStyle: React.CSSProperties = { borderColor: "#dbe4f0", background: "#f8fafc" };
const primaryButtonStyle: React.CSSProperties = { border: "1px solid #0b5bd3", background: "#0b5bd3", color: "white", borderRadius: 10, padding: "10px 14px", fontWeight: 700, cursor: "pointer" };
const secondaryButtonStyle: React.CSSProperties = { border: "1px solid #cbd5e1", background: "white", color: "#0f172a", borderRadius: 10, padding: "9px 12px", fontWeight: 700, cursor: "pointer" };
const dangerButtonStyle: React.CSSProperties = { border: "1px solid #fecaca", background: "#fff7f7", color: "#b42318", borderRadius: 10, padding: "10px 14px", fontWeight: 700, cursor: "pointer" };
const projectLabelStyle: React.CSSProperties = { color: "#64748b", fontSize: 12 };
const projectBoxStyle: React.CSSProperties = { minWidth: 210, border: "1px solid #dbe4f0", borderRadius: 10, padding: "10px 12px", background: "white", fontWeight: 700 };
const messageStyle: React.CSSProperties = { padding: "10px 12px", border: "1px solid #dbe4f0", borderRadius: 10, background: "white", fontWeight: 600 };
const cardStyle: React.CSSProperties = { border: "1px solid #dbe4f0", borderRadius: 16, background: "white", overflow: "hidden" };
const cardHeaderStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, padding: "16px 18px", borderBottom: "1px solid #e2e8f0" };
const cardTitleStyle: React.CSSProperties = { margin: 0, fontSize: 18, fontWeight: 700 };
const mutedStyle: React.CSSProperties = { color: "#64748b", fontSize: 12 };
const sectionBodyStyle: React.CSSProperties = { display: "grid", gap: 16, padding: 18 };
const sectionTitleRowStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10 };
const sectionTitleStyle: React.CSSProperties = { color: "#082b76", fontSize: 12, fontWeight: 700, letterSpacing: ".02em", whiteSpace: "nowrap" };
const sectionLineStyle: React.CSSProperties = { height: 1, background: "#d7e2f1", flex: 1 };
const fieldLabelStyle: React.CSSProperties = { color: "#475569", fontSize: 12, fontWeight: 700 };
const inputStyle: React.CSSProperties = { width: "100%", minWidth: 0, boxSizing: "border-box", border: "1px solid #d5e0ef", borderRadius: 11, padding: "11px 12px", fontSize: 14, background: "white" };
const textareaStyle: React.CSSProperties = { ...inputStyle, resize: "vertical", fontFamily: "inherit", lineHeight: 1.45 };
const generalGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "minmax(150px,.8fr) minmax(220px,1.2fr) minmax(260px,2fr)", gap: 12 };
const linksGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 12 };
const descriptionGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 14 };
const actionRowStyle: React.CSSProperties = { display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center" };
const contentGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0,1.35fr) minmax(360px,.85fr)", gap: 14 };
const smallCardHeaderStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", padding: "12px 14px", borderBottom: "1px solid #e2e8f0" };
const smallCardTitleStyle: React.CSSProperties = { margin: 0, fontSize: 15, fontWeight: 700 };
const previewAreaStyle: React.CSSProperties = { minHeight: 360, padding: 12, background: "#f8fafc" };
const iframeStyle: React.CSSProperties = { width: "100%", minHeight: 520, border: "1px solid #dbe4f0", borderRadius: 10, background: "white" };
const photoGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px,1fr))", gap: 12 };
const fileCardStyle: React.CSSProperties = { display: "grid", gap: 7, padding: 9, border: "1px solid #dbe4f0", borderRadius: 11, background: "white", textDecoration: "none", color: "#0f172a", minWidth: 0 };
const photoStyle: React.CSSProperties = { width: "100%", height: 170, objectFit: "cover", borderRadius: 8, background: "#e2e8f0" };
const pdfFileStyle: React.CSSProperties = { height: 170, display: "grid", placeItems: "center", borderRadius: 8, background: "#eef2ff", color: "#0b5bd3", fontSize: 28, fontWeight: 700 };
const fileNameStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const emptyPreviewStyle: React.CSSProperties = { minHeight: 330, display: "grid", placeItems: "center", border: "1px dashed #cbd5e1", borderRadius: 12, color: "#64748b" };
const listStyle: React.CSSProperties = { display: "grid", maxHeight: 520, overflow: "auto" };
const listItemStyle: React.CSSProperties = { width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "13px 14px", border: 0, borderBottom: "1px solid #e2e8f0", background: "white", cursor: "pointer" };
const activeListItemStyle: React.CSSProperties = { background: "#eaf2ff", boxShadow: "inset 3px 0 0 #0b5bd3" };
const listTitleStyle: React.CSSProperties = { fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const statusStyle: React.CSSProperties = { padding: "4px 7px", borderRadius: 999, background: "#eef2ff", color: "#1e40af", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" };
const emptyListStyle: React.CSSProperties = { padding: 18, color: "#64748b" };
