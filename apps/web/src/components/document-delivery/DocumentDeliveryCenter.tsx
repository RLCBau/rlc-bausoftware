import { rlcClass } from "../../ui/rlcRuntimeStyle";import React from "react";
import { useLocation } from "react-router-dom";
import { apiUrl } from "../../lib/apiBase";
import { useProject } from "../../store/useProject";

type DeliveryFormat = "pdf" | "xlsx" | "csv" | "json" | "xml" | "zip";

type DeliveryFile = {
  name: string;
  url: string;
  mime: string;
  size: number;
  sha256: string;
};

type ExportResponse = {
  ok: boolean;
  exportId: string;
  files: DeliveryFile[];
  package: DeliveryFile;
  encryptedPackage?: DeliveryFile | null;
  manifest?: DeliveryFile;
};

type CapturedTable = {
  title: string;
  headers: string[];
  rows: string[][];
};

type ModuleDescriptor = {
  key: string;
  label: string;
  confidential?: boolean;
  specialist?: string[];
};

const ALL_FORMATS: Array<{key: DeliveryFormat;label: string;}> = [
{ key: "pdf", label: "PDF" },
{ key: "xlsx", label: "XLSX" },
{ key: "csv", label: "CSV" },
{ key: "json", label: "JSON" },
{ key: "xml", label: "XML" },
{ key: "zip", label: "ZIP" }];


const EXCLUDED_PATHS = [
"/",
"/start",
"/login",
"/preise",
"/projekt/auswahl",
"/projektauswahl",
"/projekt/uebersicht"];


function authHeaders(): Record<string, string> {
  const keys = [
  "rlc_token",
  "token",
  "authToken",
  "accessToken",
  "rlc_auth_token",
  "rlc.auth.token"];


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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    credentials: "include",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...authHeaders(),
      ...((init?.headers || {}) as Record<string, string>)
    }
  });

  const text = await response.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok || payload?.ok === false) {
    throw new Error(
      typeof payload === "string" ?
      payload :
      payload?.message || payload?.error || `HTTP ${response.status}`
    );
  }

  return payload as T;
}

function moduleFromPath(pathname: string): ModuleDescriptor {
  const path = pathname.toLowerCase();

  if (path.includes("regiebericht")) return { key: "regieberichte", label: "Regieberichte" };
  if (path.includes("lieferschein")) return { key: "lieferscheine", label: "Lieferscheine" };
  if (path.includes("/buro/fotos") || path.includes("projektakte")) return { key: "fotos", label: "Projektakte / Fotos" };
  if (path.includes("tagesbericht")) return { key: "tagesberichte", label: "Tagesberichte" };
  if (path.includes("bautagebuch")) return { key: "bautagebuch", label: "Bautagebuch" };
  if (path.includes("aufmass")) return { key: "aufmass", label: "Aufmaß", specialist: ["REB X31", "DA11"] };
  if (path.includes("mengenermittlung")) return { key: "mengenermittlung", label: "Mengenermittlung" };
  if (path.includes("/kalkulation/rezepte") || path.includes("/kalkulation/recipes")) {
    return {
      key: "urkalkulation",
      label: "Urkalkulation",
      confidential: true,
      specialist: ["interner Kostenansatz", "RecipeLines", "Breakdown"]
    };
  }
  if (path.includes("/kalkulation/angebot") || path.includes("/buro/angebote")) {
    return { key: "angebot", label: "Angebot", specialist: ["GAEB X84"] };
  }
  if (path.includes("nachtra")) return { key: "nachtraege", label: "Nachträge" };
  if (path.includes("gaeb")) {
    return {
      key: "gaeb",
      label: "GAEB",
      specialist: ["X83", "X84", "X86", "X89"]
    };
  }
  if (path.includes("kalkulation")) {
    return {
      key: "kalkulation",
      label: "Kalkulation",
      specialist: ["GAEB X83", "GAEB X84", "GAEB X86", "GAEB X89"]
    };
  }
  if (path.includes("abschlagsrechnung")) return { key: "abschlagsrechnungen", label: "Abschlagsrechnungen" };
  if (path.includes("rechnung")) {
    return {
      key: "rechnungen",
      label: "Rechnungen",
      specialist: ["XRechnung", "ZUGFeRD"]
    };
  }
  if (path.includes("cad")) {
    return {
      key: "cad",
      label: "CAD / Vermessung",
      specialist: ["DWG", "DXF", "IFC", "BCF", "LandXML"]
    };
  }
  if (path.includes("dokument")) return { key: "dokumente", label: "Dokumentenverwaltung" };
  if (path.includes("buchhaltung")) return { key: "buchhaltung", label: "Buchhaltung" };
  if (path.includes("buro")) return { key: "verwaltung", label: "Verwaltung" };

  return { key: "dokument", label: "Dokument" };
}

function textOf(element: Element | null): string {
  return String(element?.textContent || "").replace(/\s+/g, " ").trim();
}

function labelForControl(control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string {
  const id = String(control.id || "").trim();
  if (id) {
    const explicit = document.querySelector(`label[for="${CSS.escape(id)}"]`);
    const explicitText = textOf(explicit);
    if (explicitText) return explicitText;
  }

  const parentLabel = control.closest("label");
  if (parentLabel) {
    const clone = parentLabel.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("input,select,textarea,button").forEach((node) => node.remove());
    const value = textOf(clone);
    if (value) return value;
  }

  const aria = String(control.getAttribute("aria-label") || "").trim();
  if (aria) return aria;

  const placeholder = String(control.getAttribute("placeholder") || "").trim();
  if (placeholder) return placeholder;

  return control.name || id || "Feld";
}

function controlValue(control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): any {
  if (control instanceof HTMLInputElement) {
    const type = String(control.type || "").toLowerCase();
    if (["password", "hidden", "file"].includes(type)) return undefined;
    if (type === "checkbox" || type === "radio") return control.checked;
  }
  return control.value;
}

function captureTables(): CapturedTable[] {
  return Array.from(document.querySelectorAll("main table, .content table, table")).
  slice(0, 30).
  map((table, tableIndex) => {
    const headers = Array.from(table.querySelectorAll("thead th")).
    map(textOf).
    filter(Boolean);
    const rows = Array.from(table.querySelectorAll("tbody tr")).
    slice(0, 2000).
    map((row) =>
    Array.from(row.querySelectorAll("th,td")).
    map(textOf).
    slice(0, 80)
    ).
    filter((row) => row.length > 0);
    const title =
    textOf(table.closest("section,article")?.querySelector("h1,h2,h3,h4") ?? null) ||
    `Tabelle ${tableIndex + 1}`;
    return { title, headers, rows };
  }).
  filter((table) => table.rows.length > 0 || table.headers.length > 0);
}

function detectPdfUrl(): string {
  const candidates = [
  ...Array.from(document.querySelectorAll<HTMLIFrameElement>("iframe[src]")),
  ...Array.from(document.querySelectorAll<HTMLEmbedElement>("embed[src]")),
  ...Array.from(document.querySelectorAll<HTMLObjectElement>("object[data]")),
  ...Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*=".pdf"],a[href*="/preview"]'))];


  for (const element of candidates) {
    const raw =
    element instanceof HTMLObjectElement ?
    element.data :
    element instanceof HTMLAnchorElement ?
    element.href :
    element.src;
    if (!raw) continue;
    try {
      const url = new URL(raw, window.location.href);
      if (url.origin === window.location.origin) return `${url.pathname}${url.search}`;
      return url.toString();
    } catch {
      continue;
    }
  }
  return "";
}

function detectAttachments(): Array<{name: string;url: string;mime?: string;}> {
  const out = new Map<string, {name: string;url: string;mime?: string;}>();
  const elements = [
  ...Array.from(document.querySelectorAll<HTMLImageElement>('img[src*="/projects/"]')),
  ...Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/projects/"]'))];


  for (const element of elements) {
    const raw = element instanceof HTMLImageElement ? element.src : element.href;
    if (!raw) continue;
    try {
      const url = new URL(raw, window.location.href);
      const normalized = url.origin === window.location.origin ? `${url.pathname}${url.search}` : url.toString();
      const name = decodeURIComponent(url.pathname.split("/").pop() || "Anhang");
      // PDF-Dateien werden nicht als Anlagen übernommen. Der PDF Core erzeugt
      // das aktuelle Moduldokument zentral und verhindert alte Fremd-PDFs im Paket.
      if (/\.pdf(?:$|[?#])/i.test(url.pathname)) continue;
      if (!out.has(normalized)) {
        out.set(normalized, {
          name,
          url: normalized,
          mime: element instanceof HTMLImageElement ? "image/*" : undefined
        });
      }
    } catch {


      // Ungültige URL ignorieren.
    }}
  return Array.from(out.values()).slice(0, 100);
}

function captureDomSnapshot(module: ModuleDescriptor, project: any, pathname: string) {
  const fields: Record<string, any> = {};
  const controls = Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      'main input,main select,main textarea,.content input,.content select,.content textarea'
    )
  );

  controls.forEach((control, index) => {
    const value = controlValue(control);
    if (value === undefined) return;
    const label = labelForControl(control);
    const key = fields[label] === undefined ? label : `${label} (${index + 1})`;
    fields[key] = value;
  });

  const headings = Array.from(document.querySelectorAll("main h1,main h2,main h3,.content h1,.content h2,.content h3")).
  map(textOf).
  filter(Boolean).
  slice(0, 80);

  const root = document.querySelector("main") || document.querySelector(".content") || document.body;
  const visibleText = String(root?.textContent || "").
  replace(/\s+/g, " ").
  trim().
  slice(0, 50000);

  const params = new URLSearchParams(window.location.search);

  return {
    schema: "RLC-WEB-DOCUMENT-SNAPSHOT-1.0",
    module: module.key,
    moduleLabel: module.label,
    route: pathname,
    query: Object.fromEntries(params.entries()),
    documentId: params.get("docId") || params.get("id") || "",
    project: project || null,
    capturedAt: new Date().toISOString(),
    title: headings[0] || document.title || module.label,
    headings,
    fields,
    tables: captureTables(),
    visibleText
  };
}

async function fetchFirstAvailable(paths: string[]): Promise<any | null> {
  for (const path of paths) {
    try {
      return await request<any>(path);
    } catch {


      // Nächsten Adapter versuchen.
    }}return null;
}

async function loadStructuredModuleData(module: ModuleDescriptor, projectKey: string): Promise<any | null> {
  if (!projectKey) return null;

  switch (module.key) {
    case "kalkulation":
    case "ki-kalkulation":
      return fetchFirstAvailable([
      `/api/kalkulation/${encodeURIComponent(projectKey)}/ki`,
      `/api/kalkulation/storage/ki/${encodeURIComponent(projectKey)}`,
      `/api/kalkulation/storage/kalkulation-mit-ki/${encodeURIComponent(projectKey)}`]
      );
    case "urkalkulation":
      return fetchFirstAvailable([
      `/api/kalkulation/storage/urkalkulation/${encodeURIComponent(projectKey)}`]
      );
    case "angebot":
      return fetchFirstAvailable([
      `/api/kalkulation/angebot/${encodeURIComponent(projectKey)}`]
      );
    case "regieberichte":
      return fetchFirstAvailable([
      `/api/regie/list?projectId=${encodeURIComponent(projectKey)}`]
      );
    case "lieferscheine":
      return fetchFirstAvailable([
      `/api/ls/list?projectId=${encodeURIComponent(projectKey)}`]
      );
    case "fotos":
      return fetchFirstAvailable([
      `/api/fotos/projects/${encodeURIComponent(projectKey)}/fotos/notes`,
      `/api/photos/projects/${encodeURIComponent(projectKey)}/fotos/notes`]
      );
    case "tagesberichte":
    case "bautagebuch":
      return fetchFirstAvailable([
      `/api/tagesbericht/inbox/list?projectId=${encodeURIComponent(projectKey)}`,
      `/api/tagesberichte?projectId=${encodeURIComponent(projectKey)}`]
      );
    default:
      return null;
  }
}

async function downloadUrl(url: string, filename?: string): Promise<void> {
  const anchor = document.createElement("a");

  anchor.href = apiUrl(url);
  anchor.style.display = "none";
  anchor.rel = "noopener";

  if (filename) {
    anchor.download = filename;
  }

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

async function saveFilesToDirectory(files: DeliveryFile[]) {
  const picker = (window as any).showDirectoryPicker as undefined | (() => Promise<any>);
  if (!picker) throw new Error("Ordnerauswahl wird von diesem Browser nicht unterstützt.");

  const directory = await picker();
  for (const file of files) {
    const response = await fetch(apiUrl(file.url), {
      credentials: "include",
      headers: authHeaders()
    });
    if (!response.ok) throw new Error(`${file.name}: HTTP ${response.status}`);
    const blob = await response.blob();
    const handle = await directory.getFileHandle(file.name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
  }
}

function Field({ label, children }: React.PropsWithChildren<{label: string;}>) {
  return (
    <label className="rlc-migrated-components-document-delivery-documentdeliverycenter-tsx-33">
      <span className="rlc-migrated-components-document-delivery-documentdeliverycenter-tsx-34">{label}</span>
      {children}
    </label>);

}

export default function DocumentDeliveryCenter() {
  const location = useLocation();
  const { getSelectedProject } = useProject();
  const project = getSelectedProject();
  const projectKey = String(project?.code || project?.id || "").trim();
  const module = React.useMemo(() => moduleFromPath(location.pathname), [location.pathname]);

  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [formats, setFormats] = React.useState<Set<DeliveryFormat>>(
    new Set(["pdf", "xlsx", "csv", "json", "xml", "zip"])
  );
  const [recipient, setRecipient] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [lastExport, setLastExport] = React.useState<ExportResponse | null>(null);

  React.useEffect(() => {
    setSubject(`${module.label} · ${projectKey || "Projekt"}`);
    setMessage(`Anbei erhalten Sie den Export aus RLC Bausoftware.\n\nProjekt: ${projectKey || "—"}\nModul: ${module.label}`);
    setError("");
    setSuccess("");
    setLastExport(null);
  }, [location.pathname, module.label, projectKey]);

  const hidden =
  EXCLUDED_PATHS.includes(location.pathname) ||
  location.pathname.startsWith("/info/") ||
  location.pathname.startsWith("/mobile/pruefung") ||
  !projectKey;

  if (hidden) return null;

  function toggleFormat(format: DeliveryFormat) {
    setFormats((current) => {
      const next = new Set(current);
      if (next.has(format)) next.delete(format);else
      next.add(format);
      if (!next.size) next.add("pdf");
      return next;
    });
  }

  async function buildPayload() {
    const dom = captureDomSnapshot(module, project, location.pathname);
    const requiresProfessionalPdf =
    module.key === "aufmass" || module.key === "kalkulation";

    const pdfProducer = requiresProfessionalPdf ?
    (window as any).__RLC_DOCUMENT_PDF_PRODUCER__ :
    null;
    const generatedPdf =
    typeof pdfProducer === "function" ?
    await pdfProducer() :
    null;

    if (
    module.key === "aufmass" && (
    !generatedPdf?.base64 || !generatedPdf?.name))
    {
      throw new Error(
        "Das professionelle Aufmaß-PDF konnte nicht erzeugt werden."
      );
    }
    const structured = await loadStructuredModuleData(module, projectKey);
    const params = new URLSearchParams(location.search);
    const documentId = params.get("docId") || params.get("id") || dom.documentId || "";
    const dateValue =
    Object.entries(dom.fields).find(([key]) => /datum|date/i.test(key))?.[1] ||
    new Date().toISOString().slice(0, 10);

    return {
      projectId: projectKey,
      projectName: project?.name || projectKey,
      moduleKey: module.key,
      documentId,
      title: dom.title || module.label,
      date: String(dateValue || "").slice(0, 10),
      data: {
        structured,
        page: dom
      },
      formats: Array.from(formats),
      pdfBase64: generatedPdf?.base64 || "",
      pdfFileName: generatedPdf?.name || "",
      pdfUrl: requiresProfessionalPdf || generatedPdf ?
      "" :
      detectPdfUrl(),
      attachments: detectAttachments(),
      confidential: Boolean(module.confidential),
      encryptionPassword: module.confidential ? password : ""
    };
  }

  async function createExport(downloadAfterCreate = false): Promise<ExportResponse> {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      if (module.confidential && password.length < 8) {
        throw new Error("Die Urkalkulation benötigt ein Passwort mit mindestens 8 Zeichen.");
      }
      const payload = await buildPayload();
      const result = await request<ExportResponse>("/api/document-delivery/export", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setLastExport(result);
      if (downloadAfterCreate) {
        const selected = result.encryptedPackage || result.package;
        if (!selected?.url) throw new Error("Exportpaket fehlt.");
        await downloadUrl(selected.url, selected.name);
        setSuccess("Exportpaket wurde erstellt und heruntergeladen.");
      } else {
        setSuccess("Exportpaket wurde auf dem Server erstellt.");
      }
      return result;
    } catch (e: any) {
      setError(e?.message || "Export fehlgeschlagen.");
      throw e;
    } finally {
      setBusy(false);
    }
  }

  async function exportPackage() {
    try {
      const result = await createExport();
      const selected = result.encryptedPackage || result.package;
      if (!selected?.url) throw new Error("Exportpaket fehlt.");
      await downloadUrl(selected.url, selected.name);
    } catch {


      // Fehler wird bereits angezeigt.
    }}
  async function exportFolder() {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await createExport(false);
      const selected = result.encryptedPackage || result.package;
      if (!selected?.url) throw new Error("Exportpaket fehlt.");
      await downloadUrl(selected.url, selected.name);
      setSuccess("Exportpaket wurde auf den PC heruntergeladen.");
    } catch (e: any) {
      setError(e?.message || "Export auf den PC fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function sendEmail() {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      if (!recipient.trim()) throw new Error("Empfänger-E-Mail fehlt.");
      if (module.confidential && password.length < 8) {
        throw new Error("Die Urkalkulation benötigt ein Passwort mit mindestens 8 Zeichen.");
      }
      const payload = await buildPayload();
      await request("/api/document-delivery/email", {
        method: "POST",
        body: JSON.stringify({
          ...payload,
          to: recipient.trim(),
          subject: subject.trim() || `${module.label} · ${projectKey}`,
          message,
          attachIndividualFiles: false
        })
      });
      setSuccess(`E-Mail wurde an ${recipient.trim()} gesendet.`);
    } catch (e: any) {
      setError(e?.message || "E-Mail konnte nicht gesendet werden.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="E-Mail und externer Dokumentexport" className="rlc-migrated-components-document-delivery-documentdeliverycenter-tsx-35">














        
        Senden / Exportieren
      </button>

      {open ?
      <div
        role="dialog"
        aria-modal="true"









        onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }} className="rlc-migrated-components-document-delivery-documentdeliverycenter-tsx-36">
        
          <section className="rlc-migrated-components-document-delivery-documentdeliverycenter-tsx-37">









          
            <header className="rlc-migrated-components-document-delivery-documentdeliverycenter-tsx-38">









            
              <div>
                <div className="rlc-migrated-components-document-delivery-documentdeliverycenter-tsx-39">RLC Document Delivery Core</div>
                <h2 className="rlc-migrated-components-document-delivery-documentdeliverycenter-tsx-40">{module.label}</h2>
                <div className="rlc-migrated-components-document-delivery-documentdeliverycenter-tsx-41">Projekt {projectKey}</div>
              </div>
              <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Schließen" className="rlc-migrated-components-document-delivery-documentdeliverycenter-tsx-42">










              
                ×
              </button>
            </header>

            <div className="rlc-migrated-components-document-delivery-documentdeliverycenter-tsx-43">
              {module.confidential ?
            <div className="rlc-migrated-components-document-delivery-documentdeliverycenter-tsx-44">
                  <strong>Vertrauliche Urkalkulation.</strong> Ein Passwort mit mindestens 8 Zeichen ist verpflichtend. Extern wird ausschließlich das verschlüsselte Paket ausgegeben.
                </div> :
            null}

              <div>
                <div className="rlc-migrated-components-document-delivery-documentdeliverycenter-tsx-45">Exportformate</div>
                <div className="rlc-migrated-components-document-delivery-documentdeliverycenter-tsx-46">
                  {ALL_FORMATS.map((format) =>
                <label
                  key={format.key} className={rlcClass(null,
                  {
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "8px 10px",
                    border: "1px solid #dbe4f0",
                    borderRadius: 10,
                    background: formats.has(format.key) ? "#eaf1ff" : "#fff",
                    fontWeight: 700,
                    cursor: "pointer"
                  })}>
                  
                      <input
                    type="checkbox"
                    checked={formats.has(format.key)}
                    onChange={() => toggleFormat(format.key)} />
                  
                      {format.label}
                    </label>
                )}
                </div>
                {module.specialist?.length ?
              <div className="rlc-migrated-components-document-delivery-documentdeliverycenter-tsx-47">
                    Fachformate bleiben zusätzlich im Fachmodul verfügbar: {module.specialist.join(" · ")}
                  </div> :
              null}
              </div>

              {module.confidential ?
            <Field label="Passwort für verschlüsseltes Exportpaket">
                  <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Mindestens 8 Zeichen" className={rlcClass(null,
                inputStyle)} />
              
                </Field> :
            null}

              <div className="rlc-migrated-components-document-delivery-documentdeliverycenter-tsx-48">
                <button type="button" className="btn" onClick={() => void createExport(false)} disabled={busy}>
                  Export erstellen
                </button>
                <button type="button" className="btn" onClick={() => void exportPackage()} disabled={busy}>
                  Exportpaket ZIP
                </button>
                <button type="button" className="btn" onClick={() => void createExport(true)} disabled={busy}>
                  Auf PC herunterladen
                </button>
              </div>

              <div className="rlc-migrated-components-document-delivery-documentdeliverycenter-tsx-49">
                <h3 className="rlc-migrated-components-document-delivery-documentdeliverycenter-tsx-50">Per E-Mail senden</h3>
                <div className="rlc-migrated-components-document-delivery-documentdeliverycenter-tsx-51">
                  <Field label="Empfänger">
                    <input type="email" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="empfaenger@firma.de" className={rlcClass(null, inputStyle)} />
                  </Field>
                  <Field label="Betreff">
                    <input value={subject} onChange={(event) => setSubject(event.target.value)} className={rlcClass(null, inputStyle)} />
                  </Field>
                </div>
                <Field label="Nachricht">
                  <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={5} className={rlcClass(null, { ...inputStyle, resize: "vertical" })} />
                </Field>
                <div className="rlc-migrated-components-document-delivery-documentdeliverycenter-tsx-52">
                  <button
                  type="button"
                  onClick={() => void sendEmail()}
                  disabled={busy} className={rlcClass(null,
                  {
                    border: "1px solid #0B2F7F",
                    borderRadius: 10,
                    background: "#1546B8",
                    color: "#fff",
                    padding: "10px 16px",
                    fontWeight: 700,
                    cursor: busy ? "wait" : "pointer"
                  })}>
                  
                    Per E-Mail senden
                  </button>
                </div>
              </div>

              {busy ? <div className="rlc-migrated-components-document-delivery-documentdeliverycenter-tsx-53">RLC erstellt das Exportpaket …</div> : null}
              {success ? <div className="rlc-migrated-components-document-delivery-documentdeliverycenter-tsx-54">{success}</div> : null}
              {error ? <div className="rlc-migrated-components-document-delivery-documentdeliverycenter-tsx-55">{error}</div> : null}
            </div>
          </section>
        </div> :
      null}
    </>);

}

const inputStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  padding: "10px 11px",
  font: "inherit"
};
