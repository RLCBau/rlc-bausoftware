import { rlcClass } from "../../ui/rlcRuntimeStyle";import { API_BASE } from "../../lib/apiBase";
import MengPageHeader from "./MengPageHeader";
// apps/web/src/pages/mengenermittlung/Regieberichte.tsx
import React from "react";
import * as XLSX from "xlsx";
import { useProject } from "../../store/useProject";

/* ===== Tipi ===== */
type Datei = {id: string;name: string;url: string;type: string;};

type ReportType = "REGIE" | "TAGESBERICHT" | "BAUTAGEBUCH";

type RegieRow = {
  id?: string;
  projectId: string;
  date?: string;
  worker?: string;
  hours?: number;
  machine?: string;
  material?: string;
  quantity?: number;
  unit?: string;
  comment?: string;
  lvItemId?: string | null;
  lvItemPos?: string | null;
  photos?: Datei[];

  reportType?: ReportType;
  regieNummer?: string;
  auftraggeber?: string;
  arbeitsbeginn?: string;
  arbeitsende?: string;
  pause1?: string;
  pause2?: string;
  blattNr?: string;
  wetter?: string;
  kostenstelle?: string;
  bemerkungen?: string;
};

type RegieHistoryItem = {
  date: string;
  filename: string;
  rows: number;
  savedAt?: string;
  pdfUrl?: string | null;
  fsKey?: string;
  reportType?: ReportType;
};

type WorkflowStatus = "DRAFT" | "EINGEREICHT" | "FREIGEGEBEN" | "ABGELEHNT" | "REGISTRIERT";

type RegieWorkflowItem = {
  id: string;
  projectId: string;
  projectCode?: string;
  date?: string;
  createdAt?: number;
  submittedAt?: number | null;
  workflowStatus: WorkflowStatus;
  title?: string;
  note?: string;
  rowsCount?: number;
  reportType?: ReportType;
};

type NachtragDraft = {
  projectId: string;
  createdAt: number;
  source: "REGIE";
  rows: Array<{
    pos: string;
    kurztext: string;
    langtext?: string;
    einheit: string;
    qty: number;
    hint?: string;
    regieRowId?: string;
    date?: string;
  }>;
};

const NACHTRAG_BUFFER_KEY = "rlc:nachtrag-buffer";

/* ===== Utils ===== */
const rid = () => crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

const STATE_STORAGE_KEY = "rlc-regieberichte-state-v2";



function withApiBase(url: string) {
  if (/^https?:\/\//i.test(url)) return url;
  const u = url.startsWith("/") ? url : `/${url}`;
  return `${API_BASE}${u}`;
}

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
    const token =
    localStorage.getItem(key) ||
    sessionStorage.getItem(key);

    if (token?.trim()) {
      return { Authorization: `Bearer ${token.trim()}` };
    }
  }

  for (const storage of [localStorage, sessionStorage]) {
    try {
      const raw = storage.getItem("rlc_auth");
      if (!raw) continue;

      const parsed = JSON.parse(raw);
      const token = parsed?.token || parsed?.accessToken;

      if (token) {
        return { Authorization: `Bearer ${String(token).trim()}` };
      }
    } catch {


      // Ungültige alte Auth-Daten ignorieren.
    }}
  return {};
}

async function readApiPayload(res: Response): Promise<any> {
  const text = await res.text();

  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(withApiBase(url), {
    credentials: "include",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...authHeaders(),
      ...((init?.headers || {}) as Record<string, string>)
    }
  });

  const payload = await readApiPayload(res);

  if (!res.ok || payload?.ok === false) {
    const detail =
    typeof payload === "string" ?
    payload :
    payload?.message || payload?.error || `HTTP ${res.status}`;

    throw new Error(detail);
  }

  return payload as T;
}

async function apiTry<T>(url: string, init?: RequestInit): Promise<T | null> {
  const res = await fetch(withApiBase(url), {
    credentials: "include",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...authHeaders(),
      ...((init?.headers || {}) as Record<string, string>)
    }
  });

  const payload = await readApiPayload(res);

  if (res.status === 404) return null;

  if (!res.ok || payload?.ok === false) {
    const detail =
    typeof payload === "string" ?
    payload :
    payload?.message || payload?.error || `HTTP ${res.status}`;

    throw new Error(detail);
  }

  return payload as T;
}

function useQuery() {
  const [q] = React.useState(() => new URLSearchParams(window.location.search));
  return q;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function num(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "";
}

function msg(e: any) {
  return typeof e === "string" ? e : e?.message ?? "Fehler";
}

const isImg = (t?: string) => !!t && t.startsWith("image/");
const isPdf = (t?: string) => t === "application/pdf";

function guessType(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (!ext) return "application/octet-stream";
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "heic", "heif"].includes(ext))
  return `image/${ext === "jpg" ? "jpeg" : ext}`;
  if (ext === "pdf") return "application/pdf";
  return "application/octet-stream";
}

function isFinalRegieberichtFilename(filename?: string) {
  const f = String(filename || "").trim();
  if (!f) return false;

  const base = f.split("/").pop() || f;
  const low = base.toLowerCase();

  if (low.startsWith("regiebericht_")) return true;
  if (low.startsWith("regieberichte_")) return true;
  if (low.startsWith("regie_")) return false;
  if (low.includes("regiebericht")) return true;

  return false;
}

async function urlToDataURL(url: string, preferType = "image/jpeg"): Promise<string | null> {
  try {
    const res = await fetch(withApiBase(url));
    const blob = await res.blob();
    try {
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0);
      return canvas.toDataURL(preferType);
    } catch {
      if (blob.type.startsWith("image/")) {
        const reader = new FileReader();
        return await new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      }
      return null;
    }
  } catch {
    return null;
  }
}

async function readPdfText(file: File): Promise<string> {
  const pdfjsLib: any = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  const array = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjsLib.getDocument({ data: array }).promise;
  let text = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = content.items.map((it: any) => it.str);
    text += items.join(" ") + "\n";
  }
  return text.replace(/\s+/g, " ").trim();
}

function parseRegieFromText(txt: string, defaults: {projectId: string;}): RegieRow[] {
  const date = (
  txt.match(/Datum[:\s]*([0-9]{2}\.[0-9]{2}\.[0-9]{4}|[0-9]{4}-[0-9]{2}-[0-9]{2})/i)?.[1] ??
  today()).
  replace(/(\d{2})\.(\d{2})\.(\d{4})/, "$3-$2-$1");

  const worker = txt.match(/Mitarbeiter[:\s]*([A-Za-zÄÖÜäöüß\-.\s]+)/i)?.[1]?.trim();
  const hours = Number((txt.match(/Stunden[:\s]*([0-9]+(?:[.,][0-9]+)?)/i)?.[1] ?? "0").replace(",", "."));
  const machine = txt.match(/Maschine[:\s]*([A-Za-z0-9\-\/.\s]+)/i)?.[1]?.trim();
  const material = txt.match(/Material[:\s]*([^\n]+)/i)?.[1]?.trim();
  const qty = Number((txt.match(/Menge[:\s]*([0-9]+(?:[.,][0-9]+)?)/i)?.[1] ?? "0").replace(",", "."));
  const unit = txt.match(/Einheit[:\s]*([A-Za-zÄÖÜäöüß]+)/i)?.[1]?.trim() ?? "Std";
  const comment = txt.match(/(Beschreibung|Bemerkung)[:\s]*([^\n]+)/i)?.[2]?.trim();
  const lvPos = txt.match(/(LV[\s-]*Pos|Pos\.?)[:\s]*([A-Za-z0-9.\-]+)/i)?.[2]?.trim();

  return [
  {
    projectId: defaults.projectId,
    date,
    worker,
    hours,
    machine,
    material,
    quantity: qty,
    unit,
    comment,
    lvItemPos: lvPos,
    reportType: "REGIE"
  }];

}

const KI_BUFFER_KEY = "ki-regie-buffer";
function consumeKiBuffer(projectId: string, date: string): RegieRow[] {
  try {
    const raw = localStorage.getItem(KI_BUFFER_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!data || data.projectId !== projectId) return [];
    const items: any[] = Array.isArray(data.items) ? data.items : [];
    const d = (date || today()).slice(0, 10);
    const picked = items.filter((it) => (it.date || d).slice(0, 10) === d);
    localStorage.removeItem(KI_BUFFER_KEY);
    return picked.map((it) => ({
      id: rid(),
      projectId,
      date: d,
      worker: it.worker || "",
      hours: it.hours || 0,
      machine: it.machine || "",
      material: it.material || "",
      quantity: it.menge ?? it.quantity ?? 0,
      unit: it.einheit || it.unit || "",
      comment: it.kurztext || it.comment || "",
      lvItemPos: it.lvItemPos || "",
      photos: it.photos || [],
      reportType: "REGIE"
    }));
  } catch {
    return [];
  }
}

function reviveRows(list: any[]): RegieRow[] {
  return (list || []).map((r: any) => ({
    ...r,
    photos: (r.photos || []).map((ph: any) => ({
      id: ph.id || rid(),
      name: ph.name || "Foto",
      type: ph.type || "image/jpeg",
      url: ph.url || ph.dataUrl || ""
    }))
  }));
}

async function toDataUrl(objUrl: string): Promise<string> {
  const res = await fetch(objUrl);
  const blob = await res.blob();
  return await new Promise<string>((resolve) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.readAsDataURL(blob);
  });
}

function regieCounterKey(projectId: string) {
  return `rlc:regiePosCounter:${projectId}`;
}

function nextRegiePos(projectId: string) {
  const key = regieCounterKey(projectId);
  const cur = Number(localStorage.getItem(key) || "0");
  const next = cur + 1;
  localStorage.setItem(key, String(next));
  return `REGIE.${String(next).padStart(3, "0")}`;
}

function hasPos(v?: string | null) {
  return !!v && String(v).trim().length > 0;
}

function buildNachtragDraft(projectId: string, rows: RegieRow[]): NachtragDraft {
  return {
    projectId,
    createdAt: Date.now(),
    source: "REGIE",
    rows: rows.map((r) => {
      const kurzBase = (r.comment || r.material || r.machine || "Regie-Leistung").trim();
      const kurztext = (kurzBase || "Regie-Leistung").slice(0, 120);

      const parts = [
      r.comment ? `Leistung: ${r.comment}` : null,
      r.worker ? `Mitarbeiter: ${r.worker}` : null,
      r.machine ? `Maschine: ${r.machine}` : null,
      r.material ? `Material: ${r.material}` : null,
      r.quantity != null && r.quantity !== 0 ? `Menge: ${r.quantity} ${r.unit || ""}`.trim() : null,
      r.hours != null && r.hours !== 0 ? `Stunden: ${r.hours}` : null].
      filter(Boolean) as string[];

      const einheit = r.hours && r.hours > 0 ? "h" : r.unit || "Stk";
      const qty = r.hours && r.hours > 0 ? Number(r.hours) : Number(r.quantity || 0);

      return {
        pos: String(r.lvItemPos || "").trim(),
        kurztext,
        langtext: parts.join(" | "),
        einheit,
        qty: Number.isFinite(qty) ? qty : 0,
        hint: [r.worker, r.machine, r.material].filter(Boolean).join(" / "),
        regieRowId: r.id ? String(r.id) : undefined,
        date: r.date ? String(r.date).slice(0, 10) : undefined
      };
    })
  };
}

type TabKey = "INBOX" | "VERWALTUNG";

export default function Regieberichte() {
  const q = useQuery();
  const routeReportType: ReportType = "REGIE";
  const stateStorageKey = `${STATE_STORAGE_KEY}:${routeReportType}`;
  const { getSelectedProject } = useProject();
  const selectedProject = getSelectedProject();

  const qFromKi = q.get("from") === "ki";
  const qDocId = q.get("docId") || "";
  const qSourceMobile = q.get("source") === "mobile";

  const qProjectId =
  q.get("projectId") ||
  sessionStorage.getItem("regie:openProjectId") ||
  selectedProject?.code as string | undefined ||
  selectedProject?.id as string | undefined ||
  "";

  const qDate = q.get("date") || today();

  const [tab, setTab] = React.useState<TabKey>(qSourceMobile ? "INBOX" : "VERWALTUNG");

  const [projectId, setProjectId] = React.useState(qProjectId);
  const [rows, setRows] = React.useState<RegieRow[]>([]);
  const [selIdx, setSelIdx] = React.useState<number | null>(null);
  const [form, setForm] = React.useState<RegieRow>({
    projectId: qProjectId || "",
    date: qDate,
    photos: [],
    reportType: routeReportType,
    unit: "Std",
    hours: 0,
    quantity: 0
  });

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = React.useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [activeWorkflowDocId, setActiveWorkflowDocId] = React.useState<string | null>(qDocId || null);
  const [kiImported, setKiImported] = React.useState<{count: number;date: string;} | null>(null);

  const [history, setHistory] = React.useState<RegieHistoryItem[]>([]);
  const [inboxItems, setInboxItems] = React.useState<RegieWorkflowItem[]>([]);

  const tableRef = React.useRef<HTMLTableSectionElement | null>(null);
  const [flashId, setFlashId] = React.useState<string | null>(null);

  const formDate = form.date;

  function looksLikeUuid(v?: string) {
    return (
      !!v &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v));

  }

  const projectKey =
  String(q.get("projectId") || "").trim() ||
  selectedProject?.code as string | undefined || (
  !looksLikeUuid(projectId) ? projectId : "") ||
  selectedProject?.id as string | undefined ||
  projectId ||
  "";
  React.useEffect(() => {
    if (projectId) sessionStorage.setItem("regie:openProjectId", projectId);
  }, [projectId]);

  React.useEffect(() => {
    if (qFromKi || qSourceMobile) return;
    try {
      const raw = localStorage.getItem(stateStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        projectId?: string;
        rows?: RegieRow[];
        form?: RegieRow;
        tab?: TabKey;
      };
      if (parsed.projectId) setProjectId(parsed.projectId);
      if (parsed.rows && parsed.rows.length)
      setRows(
        parsed.rows.map((r) => ({
          ...r,
          reportType: r.reportType || routeReportType
        }))
      );
      if (parsed.form)
      setForm({
        ...parsed.form,
        reportType: parsed.form.reportType || routeReportType
      });
      if (parsed.tab === "INBOX") setTab("INBOX");else
      if (parsed.tab) setTab("VERWALTUNG");
    } catch (e) {
      console.error("Konnte Regie-Zustand nicht laden", e);
    }
  }, [qFromKi, routeReportType, stateStorageKey]);

  React.useEffect(() => {
    try {
      localStorage.setItem(stateStorageKey, JSON.stringify({ projectId, rows, form, tab }));
    } catch {

      /* ignore */}
  }, [projectId, rows, form, tab, stateStorageKey]);

  const loadHistory = React.useCallback(async () => {
    if (!projectKey) {
      setHistory([]);
      return;
    }

    const primary = await apiTry<{ok: boolean;items: RegieHistoryItem[];}>(
      `/api/regie/list?projectId=${encodeURIComponent(projectKey)}`
    );

    if (primary?.ok) {
      const items = (primary.items || []).filter(
        (it) =>
        isFinalRegieberichtFilename(it.filename) &&
        String(it.reportType || "REGIE") === routeReportType
      );
      setHistory(items);
      return;
    }

    const legacy = await apiTry<{ok: boolean;items: RegieHistoryItem[];}>(
      `/api/ki/regie/list?projectId=${encodeURIComponent(projectKey)}`
    );

    if (legacy?.ok) {
      const items = (legacy.items || []).filter(
        (it) =>
        isFinalRegieberichtFilename(it.filename) &&
        String(it.reportType || "REGIE") === routeReportType
      );
      setHistory(items);
      return;
    }

    setHistory([]);
  }, [projectKey, routeReportType]);

  const loadInbox = React.useCallback(async () => {
    if (!projectKey) {
      setInboxItems([]);
      return;
    }
    const res = await api<{ok: boolean;items: RegieWorkflowItem[];}>(
      `/api/regie/inbox/list?projectId=${encodeURIComponent(projectKey)}`
    );
    setInboxItems(
      (res.items || []).filter((item) => String(item.reportType || "REGIE") === routeReportType)
    );
  }, [projectKey, routeReportType]);

  const reloadActiveTab = React.useCallback(async () => {
    setError(null);
    try {
      if (!projectKey) return;
      if (tab === "INBOX") await loadInbox();
      if (tab === "VERWALTUNG") await loadHistory();
    } catch (e: any) {
      setError(msg(e));
    }
  }, [tab, projectKey, loadHistory, loadInbox]);

  React.useEffect(() => {
    if (!projectKey) return;
    void reloadActiveTab();
  }, [projectKey, tab, reloadActiveTab]);

  async function commitSnapshot(proj: string, dateStr: string, rowsSnapshot: RegieRow[]) {
    if (!proj) return;
    const snapshot = { projectId: proj, date: dateStr, note: form.comment ?? "", rows: rowsSnapshot };
    await api<{ok: boolean;}>(`/api/regie/commit/regiebericht`, {
      method: "POST",
      body: JSON.stringify(snapshot)
    });
  }

  const loadByDate = React.useCallback(async () => {
    setError(null);
    if (!projectKey) return;
    setLoading(true);
    setPdfUrl(null);
    try {
      const d = (formDate || qDate || today()).slice(0, 10);
      const data = await api<{ok: boolean;rows?: RegieRow[];date?: string;note?: string;}>(
        `/api/ki/regie?projectId=${encodeURIComponent(projectKey)}&date=${encodeURIComponent(d)}`
      );

      const list = (data.rows || []).map((r) => ({
        ...r,
        date: r.date?.slice(0, 10),
        reportType: r.reportType || "REGIE"
      }));
      setRows(list);
      setSelIdx(null);
      setForm((prev) => ({
        ...prev,
        projectId: projectKey,
        date: d,
        photos: []
      }));
    } catch (e: any) {
      setError(msg(e));
    } finally {
      setLoading(false);
    }
  }, [projectKey, qDate, formDate]);

  React.useEffect(() => {
    if (!qFromKi || !projectKey) return;

    const kiRows = consumeKiBuffer(projectKey, q.get("date") || today());
    if (kiRows.length) {
      setRows((prev) => [...kiRows, ...prev]);
      setKiImported({
        count: kiRows.length,
        date: (q.get("date") || today()).slice(0, 10)
      });
    }

    sessionStorage.removeItem("regie:openProjectId");
  }, [qFromKi, projectKey, q]);

  React.useEffect(() => {
    if (!rows.length) return;

    const focusId = sessionStorage.getItem("regie:focusId");
    if (!focusId) return;

    sessionStorage.removeItem("regie:focusId");

    const idx = rows.findIndex((r) => String(r.id) === String(focusId));
    if (idx >= 0) {
      setSelIdx(idx);
      setFlashId(String(rows[idx].id || ""));
      setTimeout(() => {
        const el = document.querySelector<HTMLTableRowElement>(`tr[data-row-id="${CSS.escape(String(focusId))}"]`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });

        setTimeout(() => {
          setFlashId(null);
        }, 2400);
      }, 80);
    }
  }, [rows]);

  function select(i: number) {
    setSelIdx(i);
    const r = rows[i];

    setForm({
      id: r.id,
      projectId: r.projectId || projectKey,
      date: r.date ?? today(),
      worker: r.worker ?? "",
      hours: r.hours ?? 0,
      machine: r.machine ?? "",
      material: r.material ?? "",
      quantity: r.quantity ?? 0,
      unit: r.unit ?? "Std",
      comment: r.comment ?? "",
      lvItemId: r.lvItemId ?? "",
      lvItemPos: r.lvItemPos ?? undefined,
      photos: r.photos ?? [],
      reportType: r.reportType || "REGIE",
      regieNummer: r.regieNummer ?? "",
      auftraggeber: r.auftraggeber ?? "",
      arbeitsbeginn: r.arbeitsbeginn ?? "",
      arbeitsende: r.arbeitsende ?? "",
      pause1: r.pause1 ?? "",
      pause2: r.pause2 ?? "",
      blattNr: r.blattNr ?? "",
      wetter: r.wetter ?? "",
      kostenstelle: r.kostenstelle ?? "",
      bemerkungen: r.bemerkungen ?? ""
    });
  }

  function clearForm(keepProject = true) {
    setSelIdx(null);
    setForm({
      projectId: keepProject ? projectKey : "",
      date: today(),
      unit: "Std",
      hours: 0,
      quantity: 0,
      comment: "",
      photos: [],
      reportType: "REGIE",
      regieNummer: "",
      auftraggeber: "",
      arbeitsbeginn: "",
      arbeitsende: "",
      pause1: "",
      pause2: "",
      blattNr: "",
      wetter: "",
      kostenstelle: "",
      bemerkungen: ""
    });
  }

  function clearLineKeepHeader() {
    setSelIdx(null);
    setForm((prev) => ({
      ...prev,
      id: undefined,
      worker: "",
      hours: 0,
      machine: "",
      material: "",
      quantity: 0,
      unit: prev.unit || "Std",
      comment: "",
      lvItemId: "",
      lvItemPos: undefined,
      photos: []
    }));
  }

  function setField<K extends keyof RegieRow>(k: K, v: RegieRow[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function handleJsonFileChange(files: FileList | null) {
    if (!files || !files[0]) return;
    const file = files[0];

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result as string;
        const data = JSON.parse(text);

        let loadedRows: RegieRow[] = [];
        let snapshotDate: string | undefined;
        let snapshotProject: string | undefined;

        if (Array.isArray(data)) {
          loadedRows = data as RegieRow[];
        } else if (data && typeof data === "object") {
          const obj: any = data;

          if (Array.isArray(obj.rows)) loadedRows = obj.rows as RegieRow[];

          if ((!loadedRows || !loadedRows.length) && obj.items && Array.isArray(obj.items.aufmass))
          loadedRows = obj.items.aufmass as RegieRow[];

          if (!loadedRows || !loadedRows.length) {
            const arrays = Object.values(obj).filter((v) => Array.isArray(v)) as any[];
            const candidate = arrays.find((arr) => arr.length && typeof arr[0] === "object");
            if (candidate) loadedRows = candidate as RegieRow[];
          }

          if (typeof obj.date === "string") snapshotDate = obj.date.slice(0, 10);
          if (typeof obj.projectId === "string") snapshotProject = obj.projectId;
        }

        if (!loadedRows || !loadedRows.length) {
          alert("Im JSON wurden keine Regieberichte gefunden.");
          return;
        }

        const proj = snapshotProject || projectKey || qProjectId || "";
        const d = snapshotDate || loadedRows[0]?.date?.slice(0, 10) || today().slice(0, 10);

        const normalizedRows = loadedRows.map((r) => ({
          ...r,
          id: r.id || rid(),
          projectId: r.projectId || proj,
          date: (r.date || d).slice(0, 10)
        }));

        const rowsWithPhotos = reviveRows(normalizedRows as any);

        setProjectId(proj);
        setRows(rowsWithPhotos);
        setSelIdx(null);
        setForm((prev) => ({ ...prev, projectId: proj, date: d, photos: [] }));

        alert(`Regiebericht aus Datei geladen (${rowsWithPhotos.length} Zeilen).`);
      } catch (e: any) {
        console.error(e);
        alert("Die JSON-Datei konnte nicht gelesen werden: " + (e?.message || "Unbekannter Fehler"));
      }
    };

    reader.readAsText(file, "utf-8");
  }

  function openJsonFilePicker() {
    const el = document.getElementById("regieJsonImport") as HTMLInputElement | null;
    if (el) {
      el.value = "";
      el.click();
    }
  }

  async function loadSavedReportItem(item: RegieHistoryItem) {
    if (!projectKey) return alert("Bitte zuerst eine Projekt-ID eingeben.");

    if (!isFinalRegieberichtFilename(item.filename)) {
      return alert("Dieser Eintrag gehört nicht zur Final-Regieberichte-Historie.");
    }

    try {
      setLoading(true);
      setError(null);

      const urlPrimary = `/api/regie?projectId=${encodeURIComponent(projectKey)}&filename=${encodeURIComponent(item.filename)}`;
      const urlLegacy = `/api/ki/regie/read?projectId=${encodeURIComponent(projectKey)}&filename=${encodeURIComponent(
        item.filename
      )}`;

      let data: any = null;
      data = await apiTry<any>(urlPrimary);
      if (!data) data = await apiTry<any>(urlLegacy);
      if (!data) throw new Error("Konnte Regiebericht-Datei nicht laden (kein passender Endpoint).");

      let loadedRows: RegieRow[] = [];
      if (Array.isArray(data.rows)) loadedRows = data.rows;else
      if (data.items && Array.isArray(data.items.aufmass)) loadedRows = data.items.aufmass;

      if (!loadedRows.length) return alert("Kein gespeicherter Regiebericht in dieser Datei gefunden.");

      const d =
      (data.date as string | undefined)?.slice(0, 10) ||
      loadedRows[0].date && loadedRows[0].date!.slice(0, 10) ||
      item.date.slice(0, 10);

      const list = reviveRows(loadedRows as any).map((r) => ({
        ...r,
        projectId: projectKey,
        date: (r.date || d).slice(0, 10),
        reportType: r.reportType || "REGIE"
      }));

      setRows(list);
      setSelIdx(null);
      const head = list[0] || {} as RegieRow;
      setForm((prev) => ({
        ...prev,
        id: head.id,
        projectId: projectKey,
        date: d,
        reportType: head.reportType || "REGIE",
        regieNummer: head.regieNummer || (data as any).regieNummer || "",
        auftraggeber: head.auftraggeber || (data as any).auftraggeber || "",
        worker: head.worker || "",
        hours: Number(head.hours || 0),
        machine: head.machine || "",
        material: head.material || "",
        quantity: Number(head.quantity || 0),
        unit: head.unit || "Std",
        lvItemId: head.lvItemId || "",
        lvItemPos: head.lvItemPos || "",
        arbeitsbeginn: head.arbeitsbeginn || (data as any).arbeitsbeginn || "",
        arbeitsende: head.arbeitsende || (data as any).arbeitsende || "",
        pause1: head.pause1 || (data as any).pause1 || "",
        pause2: head.pause2 || (data as any).pause2 || "",
        blattNr: head.blattNr || (data as any).blattNr || "",
        wetter: head.wetter || (data as any).wetter || "",
        kostenstelle: head.kostenstelle || (data as any).kostenstelle || "",
        comment: head.comment || (data as any).note || "",
        bemerkungen: head.bemerkungen || (data as any).bemerkungen || "",
        photos: head.photos || []
      }));

      setActiveWorkflowDocId(null);
      const loadedPdf = (data as any).pdfUrl ?? item.pdfUrl ?? null;
      setPdfUrl(loadedPdf ? withApiBase(loadedPdf) : null);
    } catch (e: any) {
      console.error(e);
      setError(msg(e));
    } finally {
      setLoading(false);
    }
  }

  function normalizeFileArray(arr: any[]): Datei[] {
    return (arr || []).
    filter(Boolean).
    map((x: any) => ({
      id: String(x.id || rid()),
      name: String(x.name || "Anhang"),
      type: String(x.type || guessType(String(x.name || ""))),
      url: String(x.url || x.dataUrl || x.path || "")
    })).
    filter((x) => !!x.url);
  }

  function normalizeWorkflowDocToLoaded(snap: any): {loadedRows: RegieRow[];d: string;note: string;pdfUrl?: string | null;} {
    const rowsIn = (snap?.rows || snap?.items?.aufmass || []) as any[];
    const d = String(snap?.date || today()).slice(0, 10);

    const isFlatRegie =
    !Array.isArray(rowsIn) || rowsIn.length === 0 ?
    !!snap && typeof snap === "object" && (snap.kind === "regie" || snap.reportType || snap.workflowStatus) :
    false;

    const note = String(snap?.note ?? snap?.comment ?? "").trim();

    if (Array.isArray(rowsIn) && rowsIn.length > 0) {
      const rootFiles = normalizeFileArray(
        snap?.photos ||
        snap?.attachments ||
        snap?.files ||
        []
      );

      const loadedRows = rowsIn.map((rawRow: any, index: number) => {
        const r = rawRow || {};

        return {
          ...r,

          id: String(r.id || rid()),
          projectId: projectKey,

          date: String(
            r.date ||
            r.datum ||
            snap?.date ||
            snap?.datum ||
            d
          ).slice(0, 10),

          reportType:
          r.reportType as ReportType ||
          r.docType as ReportType ||
          snap?.reportType as ReportType ||
          routeReportType,

          regieNummer: String(
            r.regieNummer ||
            r.regieNr ||
            snap?.regieNummer ||
            snap?.regieNr ||
            snap?.nummer ||
            ""
          ),

          auftraggeber: String(
            r.auftraggeber ||
            r.client ||
            r.customer ||
            snap?.auftraggeber ||
            snap?.client ||
            snap?.customer ||
            ""
          ),

          worker: String(
            r.worker ||
            r.mitarbeiter || (
            index === 0 ?
            snap?.worker || snap?.mitarbeiter || "" :
            "")
          ),

          hours: Number(
            r.hours ??
            r.stunden ?? (
            index === 0 ?
            snap?.hours ?? snap?.stunden ?? 0 :
            0)
          ),

          machine: String(
            r.machine ||
            r.maschine || (
            index === 0 ?
            snap?.machine || snap?.maschine || "" :
            "")
          ),

          material: String(
            r.material ||
            r.materialien || (
            index === 0 ?
            snap?.material || snap?.materialien || "" :
            "")
          ),

          quantity: Number(
            r.quantity ??
            r.menge ?? (
            index === 0 ?
            snap?.quantity ?? snap?.menge ?? 0 :
            0)
          ),

          unit: String(
            r.unit ||
            r.einheit ||
            snap?.unit ||
            snap?.einheit ||
            "Std"
          ),

          comment: String(
            r.comment ||
            r.text ||
            r.taetigkeit || (
            index === 0 ?
            snap?.comment || snap?.text || "" :
            "")
          ),

          bemerkungen: String(
            r.bemerkungen ||
            r.notes || (
            index === 0 ?
            snap?.bemerkungen || snap?.notes || "" :
            "")
          ),

          arbeitsbeginn: String(
            r.arbeitsbeginn ||
            r.von ||
            r.timeFrom ||
            snap?.arbeitsbeginn ||
            ""
          ),

          arbeitsende: String(
            r.arbeitsende ||
            r.bis ||
            r.timeTo ||
            snap?.arbeitsende ||
            ""
          ),

          pause1: String(r.pause1 || snap?.pause1 || ""),
          pause2: String(r.pause2 || snap?.pause2 || ""),

          blattNr: String(
            r.blattNr ||
            r.blatt ||
            snap?.blattNr ||
            snap?.blatt ||
            ""
          ),

          wetter: String(
            r.wetter ||
            r.weather ||
            snap?.wetter ||
            snap?.weather ||
            ""
          ),

          kostenstelle: String(
            r.kostenstelle ||
            r.costCenter ||
            snap?.kostenstelle ||
            snap?.costCenter ||
            ""
          ),

          lvItemId: String(
            r.lvItemId ||
            r.positionId ||
            snap?.lvItemId ||
            ""
          ),

          lvItemPos: String(
            r.lvItemPos ||
            r.pos ||
            r.position ||
            snap?.lvItemPos ||
            ""
          ),

          photos: normalizeFileArray(
            r.photos ||
            r.attachments ||
            r.files || (
            index === 0 ? rootFiles : [])
          )
        } as RegieRow;
      });

      return {
        loadedRows,
        d: loadedRows[0]?.date || d,
        note: loadedRows[0]?.comment || note,
        pdfUrl:
        snap?.pdfUrl ||
        snap?.pdfUri ||
        snap?.fileUrl ||
        snap?.previewUrl ||
        snap?.documentUrl ||
        null
      };
    }
    if (isFlatRegie) {
      const photos = normalizeFileArray(snap.photos || snap.attachments || []);
      const row: RegieRow = {
        id: String(snap.id || rid()),
        projectId: projectKey,
        date: String(snap.date || d).slice(0, 10),
        reportType: snap.reportType as ReportType || "REGIE",
        comment: String(snap.comment || ""),
        bemerkungen: String(snap.bemerkungen || ""),
        hours: Number(snap.hours || 0),
        unit: String(snap.unit || "Std"),
        worker: String(snap.worker || snap.mitarbeiter || ""),
        machine: String(snap.machine || snap.maschinen || ""),
        material: String(snap.material || snap.materialien || ""),
        quantity: Number(snap.quantity || 0),
        lvItemPos: String(snap.lvItemPos || ""),
        lvItemId: String(snap.lvItemId || ""),
        regieNummer: String(snap.regieNummer || ""),
        auftraggeber: String(snap.auftraggeber || ""),
        arbeitsbeginn: String(snap.arbeitsbeginn || ""),
        arbeitsende: String(snap.arbeitsende || ""),
        pause1: String(snap.pause1 || ""),
        pause2: String(snap.pause2 || ""),
        blattNr: String(snap.blattNr || ""),
        wetter: String(snap.wetter || ""),
        kostenstelle: String(snap.kostenstelle || ""),
        photos
      };

      return { loadedRows: [row], d: row.date || d, note: row.comment || note, pdfUrl: snap?.pdfUrl ?? null };
    }

    return { loadedRows: [], d, note, pdfUrl: snap?.pdfUrl ?? null };
  }

  async function loadWorkflowDoc(stage: "inbox" | "freigegeben" | "approved", docId: string) {
    if (!projectKey) return;

    const stageKey = stage === "approved" ? "freigegeben" : stage;

    const candidates: string[] = [
    `/api/regie/${stageKey}/read?projectId=${encodeURIComponent(projectKey)}&docId=${encodeURIComponent(docId)}`,
    stageKey === "freigegeben" ?
    `/api/regie/approved/read?projectId=${encodeURIComponent(projectKey)}&docId=${encodeURIComponent(docId)}` :
    "",
    stageKey === "freigegeben" ?
    `/api/regie/final/read?projectId=${encodeURIComponent(projectKey)}&docId=${encodeURIComponent(docId)}` :
    "",
    `/api/regie/read?projectId=${encodeURIComponent(projectKey)}&docId=${encodeURIComponent(docId)}&stage=${encodeURIComponent(
      stageKey
    )}`,
    `/api/regie/workflow/read?projectId=${encodeURIComponent(projectKey)}&docId=${encodeURIComponent(
      docId
    )}&stage=${encodeURIComponent(stageKey)}`].
    filter(Boolean);

    try {
      setLoading(true);
      setError(null);
      setPdfUrl(null);

      let data: any = null;
      let hitUrl: string | null = null;

      const handoffKey = `rlc:mobile-workflow:${projectKey}:REGIE:${docId}`;
      const handoffRaw = sessionStorage.getItem(handoffKey);
      if (handoffRaw) {
        try {
          data = JSON.parse(handoffRaw);
          hitUrl = "sessionStorage";
        } catch {
          sessionStorage.removeItem(handoffKey);
        }
      }

      if (!data) {
        for (let index = 0; index < sessionStorage.length; index++) {
          const key = sessionStorage.key(index);
          if (!key || !key.startsWith(`rlc:mobile-workflow:${projectKey}:REGIE:`)) continue;
          try {
            const candidate = JSON.parse(sessionStorage.getItem(key) || "null");
            if (candidate?.id === docId) {
              data = candidate;
              hitUrl = "sessionStorage:scan";
              break;
            }
          } catch {


            // Ungültigen Eintrag ignorieren.
          }}}

      if (!data) {
        const lastRaw = sessionStorage.getItem("rlc:mobile-workflow:last");
        if (lastRaw) {
          try {
            const last = JSON.parse(lastRaw);
            if (last?.docId === docId && last?.document) {
              data = last.document;
              hitUrl = "sessionStorage:last";
            }
          } catch {


            // Ungültigen Übergabewert ignorieren.
          }}}

      if (!data) {
        for (const u of candidates) {
          const r = await apiTry<any>(u);
          if (r) {
            data = r;
            hitUrl = u;
            break;
          }
        }
      }

      if (!data) {
        throw new Error(`Not Found (keine passende Route).`);
      }

      const snap = data?.snapshot || data?.data?.snapshot || data;

      const norm = normalizeWorkflowDocToLoaded(snap);
      if (!norm.loadedRows.length) {
        console.warn("Workflow read OK, but no rows detected. url=", hitUrl, "payload=", data);
        throw new Error("Dokument geladen, aber keine Zeilen gefunden (Format unbekannt).");
      }

      const revived = reviveRows(norm.loadedRows as any).map((r) => ({
        ...r,
        projectId: projectKey,
        date: String(r.date || norm.d).slice(0, 10),
        reportType: r.reportType || "REGIE"
      }));

      setRows(revived);
      setSelIdx(0);
      setActiveWorkflowDocId(docId);

      const head = revived[0];

      setForm((prev) => ({
        ...prev,
        projectId: projectKey,
        date: String(head.date || norm.d).slice(0, 10),
        reportType: head.reportType || "REGIE",
        comment: String(head.comment || norm.note || prev.comment || ""),
        bemerkungen: String(head.bemerkungen || prev.bemerkungen || ""),
        regieNummer: head.regieNummer || prev.regieNummer || "",
        auftraggeber: head.auftraggeber || prev.auftraggeber || "",
        arbeitsbeginn: head.arbeitsbeginn || prev.arbeitsbeginn || "",
        arbeitsende: head.arbeitsende || prev.arbeitsende || "",
        pause1: head.pause1 || prev.pause1 || "",
        pause2: head.pause2 || prev.pause2 || "",
        blattNr: head.blattNr || prev.blattNr || "",
        wetter: head.wetter || prev.wetter || "",
        kostenstelle: head.kostenstelle || prev.kostenstelle || "",
        worker: head.worker || prev.worker || "",
        hours: Number(head.hours || prev.hours || 0),
        machine: head.machine || prev.machine || "",
        material: head.material || prev.material || "",
        quantity: Number(head.quantity || prev.quantity || 0),
        unit: head.unit || prev.unit || "Std",
        lvItemId: head.lvItemId || prev.lvItemId || "",
        lvItemPos: head.lvItemPos || prev.lvItemPos || "",
        photos: head.photos || []
      }));

      if (norm.pdfUrl) setPdfUrl(withApiBase(norm.pdfUrl));
    } catch (e: any) {
      console.error(e);
      setError("Workflow-Dokument konnte nicht geladen werden. " + msg(e));
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    if (!qSourceMobile || !qDocId || !projectKey) return;
    setTab("INBOX");
    void loadWorkflowDoc("inbox", qDocId);
    // Nur beim expliziten Mobile-Handoff laden.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qSourceMobile, qDocId, projectKey]);

  function rowsIncludingCurrentForm(): RegieRow[] {
    if (!form.id) return rows;

    const project = projectKey || form.projectId || "";
    const current: RegieRow = {
      ...form,
      projectId: project,
      date: String(form.date || today()).slice(0, 10),
      reportType: form.reportType || "REGIE"
    };

    return rows.map((row) => String(row.id || "") === String(form.id || "") ? current : row);
  }

  async function persistInboxDocument(
  docId: string,
  snapshotRows: RegieRow[] = rowsIncludingCurrentForm(),
  header: RegieRow = form)
  {
    if (!projectKey) throw new Error("Projekt-ID fehlt.");

    const exportRows = await rowsForServerPdf(snapshotRows);
    const head = exportRows[0] || header;
    const rootPhotos = await Promise.all((header.photos || []).map(attachmentForServer));

    await api<{ok: boolean;}>(`/api/regie/inbox/update`, {
      method: "POST",
      body: JSON.stringify({
        projectId: projectKey,
        docId,
        date: String(header.date || head.date || today()).slice(0, 10),
        reportType: header.reportType || head.reportType || "REGIE",
        regieNummer: header.regieNummer || head.regieNummer || "",
        auftraggeber: header.auftraggeber || head.auftraggeber || "",
        arbeitsbeginn: header.arbeitsbeginn || head.arbeitsbeginn || "",
        arbeitsende: header.arbeitsende || head.arbeitsende || "",
        pause1: header.pause1 || head.pause1 || "",
        pause2: header.pause2 || head.pause2 || "",
        blattNr: header.blattNr || head.blattNr || "",
        wetter: header.wetter || head.wetter || "",
        kostenstelle: header.kostenstelle || head.kostenstelle || "",
        comment: header.comment || head.comment || "",
        bemerkungen: header.bemerkungen || head.bemerkungen || "",
        photos: rootPhotos,
        attachments: rootPhotos,
        rows: exportRows,
        items: { aufmass: exportRows, lieferscheine: [] }
      })
    });
  }

  async function approveInbox(docId: string) {
    if (!projectKey) return;
    if (!window.confirm("Regiebericht freigeben und direkt in Verwaltung speichern?")) return;
    try {
      setLoading(true);
      if (activeWorkflowDocId === docId) {
        await persistInboxDocument(docId);
      }
      const result = await api<{ok: boolean;pdfUrl?: string | null;filename?: string;reportId?: string;}>(
        `/api/regie/inbox/approve`,
        {
          method: "POST",
          body: JSON.stringify({ projectId: projectKey, docId })
        }
      );
      setActiveWorkflowDocId(null);
      if (result.pdfUrl) setPdfUrl(withApiBase(result.pdfUrl));
      await Promise.all([loadInbox(), loadHistory()]);
      setTab("VERWALTUNG");
      alert("Freigegeben und in Verwaltung gespeichert.");
    } catch (e: any) {
      alert(msg(e));
    } finally {
      setLoading(false);
    }
  }

  async function rejectInbox(docId: string) {
    if (!projectKey) return;
    const reason = window.prompt("Ablehnungsgrund (optional):", "") ?? "";
    try {
      setLoading(true);
      await api<{ok: boolean;}>(`/api/regie/inbox/reject`, {
        method: "POST",
        body: JSON.stringify({ projectId: projectKey, docId, reason })
      });
      await loadInbox();
      if (activeWorkflowDocId === docId) setActiveWorkflowDocId(null);
      alert("Abgelehnt.");
    } catch (e: any) {
      alert(msg(e));
    } finally {
      setLoading(false);
    }
  }

  async function attachmentForServer(photo: Datei) {
    const url = String(photo.url || "");
    if (!url) return { name: photo.name, type: photo.type, url: "" };

    if (url.startsWith("data:")) {
      return { name: photo.name, type: photo.type, dataUrl: url };
    }

    if (url.startsWith("blob:")) {
      try {
        return {
          name: photo.name,
          type: photo.type,
          dataUrl: await toDataUrl(url)
        };
      } catch {
        return { name: photo.name, type: photo.type, url };
      }
    }

    return { name: photo.name, type: photo.type, url };
  }

  async function rowsForServerPdf(rowsToExport: RegieRow[]) {
    return Promise.all(
      rowsToExport.map(async (row) => ({
        ...row,
        photos: await Promise.all((row.photos || []).map(attachmentForServer))
      }))
    );
  }

  async function exportPdfRows(rowsToExport: RegieRow[], opts: {preview: boolean;single?: boolean;}) {
    if (!rowsToExport.length) {
      alert("Keine Einträge zum Exportieren.");
      return;
    }
    if (!projectKey) {
      alert("Bitte Projekt-ID eingeben.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const exportRows = await rowsForServerPdf(rowsToExport);
      const exportDate = String(form.date || exportRows[0]?.date || today()).slice(0, 10);
      const result = await api<{ok: boolean;pdfUrl: string;}>(`/api/regie/preview`, {
        method: "POST",
        body: JSON.stringify({
          projectId: projectKey,
          projectName: selectedProject?.name || selectedProject?.code || projectKey,
          date: exportDate,
          regieNummer: form.regieNummer || exportRows[0]?.regieNummer || "",
          auftraggeber: form.auftraggeber || exportRows[0]?.auftraggeber || "",
          arbeitsbeginn: form.arbeitsbeginn || exportRows[0]?.arbeitsbeginn || "",
          arbeitsende: form.arbeitsende || exportRows[0]?.arbeitsende || "",
          pause1: form.pause1 || exportRows[0]?.pause1 || "",
          pause2: form.pause2 || exportRows[0]?.pause2 || "",
          blattNr: form.blattNr || exportRows[0]?.blattNr || "",
          wetter: form.wetter || exportRows[0]?.wetter || "",
          kostenstelle: form.kostenstelle || exportRows[0]?.kostenstelle || "",
          bemerkungen: form.bemerkungen || exportRows[0]?.bemerkungen || "",
          rows: exportRows,
          items: { aufmass: exportRows, lieferscheine: [] }
        })
      });

      const absoluteUrl = withApiBase(result.pdfUrl);
      if (opts.preview) {
        setPdfUrl(`${absoluteUrl}${absoluteUrl.includes("?") ? "&" : "?"}v=${Date.now()}`);
        return;
      }

      const response = await fetch(absoluteUrl, {
        credentials: "include",
        headers: { ...authHeaders() }
      });
      if (!response.ok) throw new Error(`PDF Download fehlgeschlagen: HTTP ${response.status}`);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `${opts.single ? "Regiebericht" : "Regieberichte"}_${exportDate}_${projectKey}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
    } catch (e: any) {
      setError(`PDF konnte nicht erstellt werden: ${msg(e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function exportPdf(preview = false) {
    await exportPdfRows(rows, { preview, single: false });
  }

  async function exportSingleRowPdf(row: RegieRow, preview = false) {
    await exportPdfRows([row], { preview, single: true });
  }

  async function save() {
    const proj =
    projectKey || form.projectId || selectedProject?.code as string | undefined || selectedProject?.id as string | undefined || "";

    if (!proj) {
      alert("Bitte Projekt-ID eingeben.");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const local: RegieRow = {
        ...form,
        id: form.id || rid(),
        projectId: proj,
        date: String(form.date || today()).slice(0, 10),
        reportType: form.reportType || "REGIE"
      };

      const nextRows = form.id ?
      rows.map((row) => String(row.id || "") === String(form.id || "") ? local : row) :
      [local, ...rows];

      setRows(nextRows);
      setSelIdx(form.id ? nextRows.findIndex((row) => row.id === local.id) : 0);

      if (activeWorkflowDocId) {
        await persistInboxDocument(activeWorkflowDocId, nextRows, local);
        alert("Änderungen im Mobile-Dokument gespeichert.");
      } else {
        alert("Eintrag im Entwurf übernommen. Mit „In Verwaltung speichern“ wird der Regiebericht offiziell gespeichert.");
      }

      clearLineKeepHeader();
    } catch (e: any) {
      console.error(e);
      setError(`Speichern fehlgeschlagen: ${msg(e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function saveReportToServer() {
    const proj =
    projectKey || form.projectId || selectedProject?.code as string | undefined || selectedProject?.id as string | undefined || "";

    if (!proj || !rows.length) {
      alert("Projekt und mindestens eine Zeile erforderlich.");
      return;
    }

    try {
      setLoading(true);
      const date = (form.date || rows[0]?.date || today()).slice(0, 10);

      const rowsWithPhotos: any[] = [];
      for (const r of rows) {
        const photos: any[] = [];
        for (const ph of r.photos || []) {
          if (isImg(ph.type)) {
            const dataUrl = await toDataUrl(ph.url);
            photos.push({ id: ph.id, name: ph.name, type: ph.type, dataUrl });
          } else {
            photos.push({ id: ph.id, name: ph.name, type: ph.type, url: ph.url });
          }
        }
        rowsWithPhotos.push({
          ...r,
          projectId: proj,
          date: (r.date || date).slice(0, 10),
          photos
        });
      }

      const head = rowsWithPhotos[0] || form;
      const snapshot = {
        projectId: proj,
        projectName: selectedProject?.name || selectedProject?.code || proj,
        date,
        reportType: form.reportType || head.reportType || "REGIE",
        regieNummer: form.regieNummer || head.regieNummer || "",
        auftraggeber: form.auftraggeber || head.auftraggeber || "",
        arbeitsbeginn: form.arbeitsbeginn || head.arbeitsbeginn || "",
        arbeitsende: form.arbeitsende || head.arbeitsende || "",
        pause1: form.pause1 || head.pause1 || "",
        pause2: form.pause2 || head.pause2 || "",
        blattNr: form.blattNr || head.blattNr || "",
        wetter: form.wetter || head.wetter || "",
        kostenstelle: form.kostenstelle || head.kostenstelle || "",
        bemerkungen: form.bemerkungen || head.bemerkungen || "",
        note: form.comment || head.comment || "",
        rows: rowsWithPhotos,
        items: { aufmass: rowsWithPhotos, lieferscheine: [] }
      };

      const resp = await api<any>(`/api/regie/commit/regiebericht`, {
        method: "POST",
        body: JSON.stringify(snapshot)
      });

      const reportId = resp?.reportId ?? resp?.id ?? resp?.nummer ?? "?";
      const stored = resp?.stored ?? resp?.filename ?? resp?.file ?? resp?.path ?? "-";

      if (resp?.pdfUrl) setPdfUrl(withApiBase(resp.pdfUrl));
      alert(`Regiebericht gespeichert (Nr. ${reportId}).\nDatei: ${stored}`);
      await loadHistory();
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Speichern fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  async function saveRowToServer(row: RegieRow) {
    const proj =
    projectKey || row.projectId || selectedProject?.code as string | undefined || selectedProject?.id as string | undefined || "";

    if (!proj) {
      alert("Bitte Projekt-ID eingeben.");
      return;
    }

    try {
      setLoading(true);

      if (activeWorkflowDocId) {
        await persistInboxDocument(activeWorkflowDocId, rows, row);
        alert("Mobile-Dokument gespeichert.");
        return;
      }

      const date = (row.date || form.date || today()).slice(0, 10);

      const photos: any[] = [];
      for (const ph of row.photos || []) {
        if (isImg(ph.type)) {
          const dataUrl = await toDataUrl(ph.url);
          photos.push({ id: ph.id, name: ph.name, type: ph.type, dataUrl });
        } else {
          photos.push({ id: ph.id, name: ph.name, type: ph.type, url: ph.url });
        }
      }

      const rowOut = { ...row, projectId: proj, date, photos };

      const payload = {
        projectId: proj,
        date,
        note: row.comment ?? "",
        rows: [rowOut],
        items: { aufmass: [rowOut], lieferscheine: [] }
      };

      const resp = await api<any>(`/api/regie/commit/regiebericht`, {
        method: "POST",
        body: JSON.stringify(payload)
      });

      const reportId = resp?.reportId ?? resp?.id ?? resp?.nummer ?? "?";
      const stored = resp?.stored ?? resp?.filename ?? resp?.file ?? resp?.path ?? "-";

      alert(`Regiebericht gespeichert (Nr. ${reportId}).\nDatei: ${stored}`);
      await loadHistory();
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Speichern fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  async function del(row: RegieRow, index: number) {
    if (!window.confirm("Diesen Regiebericht wirklich löschen?")) return;

    const proj =
    projectKey || row.projectId || selectedProject?.code as string | undefined || selectedProject?.id as string | undefined || "";

    const updated = rows.filter((_, i) => i !== index);
    setRows(updated);

    if (selIdx === index) {
      clearForm(true);
    } else if (selIdx !== null && selIdx > index) {
      setSelIdx(selIdx - 1);
    }

    try {
      if (!proj) return;
      const dateStr = (row.date || form.date || today()).slice(0, 10);
      if (activeWorkflowDocId) {
        await persistInboxDocument(activeWorkflowDocId, updated, { ...form, date: dateStr });
        await loadInbox();
      } else {
        const snapshot = { projectId: proj, date: dateStr, note: form.comment ?? "", rows: updated };
        await api<{ok: boolean;}>(`/api/regie/commit/regiebericht`, {
          method: "POST",
          body: JSON.stringify(snapshot)
        });
        await loadHistory();
      }
    } catch (e) {
      console.error(e);
      alert("Die Zeile wurde lokal gelöscht, aber der Server-Speicher konnte nicht aktualisiert werden: " + msg(e));
    }
  }

  function addPhotos(files: FileList | null) {
    if (!files) return;
    const arr: Datei[] = Array.from(files).map((f) => ({
      id: rid(),
      name: f.name,
      url: URL.createObjectURL(f),
      type: f.type || guessType(f.name)
    }));
    setForm((p) => ({ ...p, photos: [...(p.photos || []), ...arr] }));
  }

  function removePhoto(id: string) {
    setForm((p) => ({
      ...p,
      photos: (p.photos || []).filter((ph) => ph.id !== id)
    }));
  }

  async function importPdfRegie(files: FileList | null) {
    if (!files || !files[0]) return;
    if (!projectKey) return alert("Inserisci Project-ID prima dell'import.");
    const file = files[0];
    const text = await readPdfText(file);
    const parsed = parseRegieFromText(text, { projectId: projectKey });
    if (!parsed.length) return alert("Nessun dato riconosciuto nel PDF.");

    const attach: Datei = {
      id: rid(),
      name: file.name,
      url: URL.createObjectURL(file),
      type: "application/pdf"
    };

    const localRows = parsed.map((r) => {
      const ensuredPos = hasPos(r.lvItemPos) ? String(r.lvItemPos) : nextRegiePos(projectKey);
      return {
        ...r,
        id: rid(),
        lvItemPos: ensuredPos,
        lvItemId: r.lvItemId ?? ensuredPos,
        photos: [attach] as Datei[]
      };
    });

    let nextRows: RegieRow[] = [];
    setRows((prev) => {
      const updated = [...localRows, ...prev];
      nextRows = updated;
      return updated;
    });

    try {
      const snapshotDate = parsed[0]?.date?.slice(0, 10) || (form.date || today()).slice(0, 10);
      await commitSnapshot(projectKey, snapshotDate, nextRows);
      await loadHistory();
    } catch (e) {
      console.warn(e);
    }

    for (const r of localRows) {
      const regieId = String(r.id || rid());
      linkToAufmassLocal({ projectId: projectKey, lvPos: String(r.lvItemPos || ""), regieId });
    }
  }

  function linkToAufmassLocal(args: {projectId: string;lvPos: string;regieId: string;}) {
    const key = `aufmass-links`;
    const map = JSON.parse(localStorage.getItem(key) || "{}");
    const k = `${args.projectId}:${args.lvPos}`;
    map[k] = map[k] || { regieIds: [], lsIds: [] };
    if (!map[k].regieIds.includes(args.regieId)) map[k].regieIds.push(args.regieId);
    localStorage.setItem(key, JSON.stringify(map));
  }

  function ensureRegiePositions(list: RegieRow[], proj: string): {updated: RegieRow[];created: number;} {
    let created = 0;
    const updated = list.map((r) => {
      if (hasPos(r.lvItemPos)) return r;
      created++;
      const pos = nextRegiePos(proj);
      return { ...r, lvItemPos: pos, lvItemId: r.lvItemId ?? pos };
    });
    return { updated, created };
  }

  type AufmassAppendRow = {
    pos: string;
    text: string;
    unit: string;
    soll?: number;
    ist: number;
    ep?: number;
    formula?: string;
    note?: string;
    factor?: number;
    source?: string;
  };

  function regieRowToAufmassRow(r: RegieRow): AufmassAppendRow | null {
    const pos = String(r.lvItemPos || "").trim();
    if (!pos) return null;

    const ist =
    r.hours != null && Number(r.hours) > 0 ? Number(r.hours) : r.quantity != null ? Number(r.quantity) : 0;

    const unit = r.hours != null && Number(r.hours) > 0 ? "h" : (r.unit || "").trim() || "Stk";

    const text = (r.comment || "").trim() || (r.material || "").trim() || (r.machine || "").trim() || "Regie";

    const noteParts = [
    r.worker ? `Mitarbeiter: ${r.worker}` : null,
    r.machine ? `Maschine: ${r.machine}` : null,
    r.material ? `Material: ${r.material}` : null,
    r.date ? `Datum: ${String(r.date).slice(0, 10)}` : null,
    r.regieNummer ? `Regie-Nr.: ${r.regieNummer}` : null].
    filter(Boolean) as string[];

    return {
      pos,
      text,
      unit,
      soll: 0,
      ist: Number.isFinite(ist) ? ist : 0,
      ep: 0,
      formula: "",
      note: noteParts.join(" | "),
      factor: 1,
      source: "REGIE"
    };
  }

  async function appendRowsToAufmassServer(projectKeyValue: string, aufmassRows: AufmassAppendRow[]) {
    if (!projectKeyValue) throw new Error("Kein Projekt.");
    if (!aufmassRows.length) return { ok: true as const, appended: 0 };

    const url = `/api/aufmass/soll-ist/${encodeURIComponent(projectKeyValue)}/append`;
    const res = await api<any>(url, { method: "POST", body: JSON.stringify({ rows: aufmassRows }) });

    const appended =
    typeof res?.appended === "number" ? res.appended : Array.isArray(res?.rows) ? res.rows.length : aufmassRows.length;

    return { ok: true as const, appended };
  }

  async function createNachtraegeFromRegie() {
    const projKey =
    selectedProject?.code as string | undefined || projectKey || form.projectId || selectedProject?.id as string | undefined || "";

    if (!projKey) return alert("Bitte Projekt-ID eingeben.");
    if (!rows.length) return alert("Keine Regie-Zeilen vorhanden.");

    try {
      setLoading(true);

      const { updated, created } = ensureRegiePositions(rows, projKey);
      setRows(updated);

      const lvPosList = Array.from(
        new Set(updated.map((r) => String(r.lvItemPos || "").trim()).filter((p) => p.length > 0))
      );

      let serverCreatedCount: number | null = null;
      try {
        const out = await api<{ok: boolean;created?: any[];error?: string;}>(
          `/api/verknuepfung/nachtrag/${encodeURIComponent(projKey)}`,
          { method: "POST", body: JSON.stringify({ lvPos: lvPosList }) }
        );
        serverCreatedCount = Array.isArray(out?.created) ? out.created.length : null;
      } catch (e: any) {
        console.warn("Nachträge server create failed:", e);
      }

      const draft = buildNachtragDraft(projKey, updated);
      const sanitized: NachtragDraft = {
        ...draft,
        rows: draft.rows.map((x) => ({ ...x, pos: String(x.pos || "").trim() })).filter((x) => x.pos.length > 0)
      };

      localStorage.setItem(NACHTRAG_BUFFER_KEY, JSON.stringify(sanitized));

      alert(
        `Nachträge erstellt.\nNeue Position(en): ${created}\nPos-Keys: ${lvPosList.length}\nServer erstellt: ${
        serverCreatedCount == null ? "—" : serverCreatedCount}\nDraft lokal: ${
        sanitized.rows.length}\n(Beispiel: ${sanitized.rows[0]?.pos || "—"})`
      );

      window.location.href = `/kalkulation/nachtraege?projectId=${encodeURIComponent(projKey)}&from=regie`;
    } catch (e: any) {
      alert(msg(e));
    } finally {
      setLoading(false);
    }
  }

  async function transferToAufmassEditor() {
    const proj =
    projectKey || form.projectId || selectedProject?.code as string | undefined || selectedProject?.id as string | undefined || "";

    if (!proj || !rows.length) {
      alert("Projekt und mindestens eine Zeile erforderlich.");
      return;
    }

    try {
      setLoading(true);

      const { updated, created } = ensureRegiePositions(rows, proj);
      setRows(updated);

      let localCount = 0;
      for (const r of updated) {
        const pos = String(r.lvItemPos || "").trim();
        if (!pos) continue;
        const regieId = String(r.id || rid());
        linkToAufmassLocal({ projectId: proj, lvPos: pos, regieId });
        localCount++;
      }

      const aufmassRows = updated.map(regieRowToAufmassRow).filter(Boolean) as AufmassAppendRow[];
      const serverRes = await appendRowsToAufmassServer(proj, aufmassRows);

      alert(
        `${localCount} Position(en) für das Aufmaß vorbereitet.\nNeue REGIE-Positionen automatisch erstellt: ${created}\nServer Aufmaß append: ${serverRes.appended}`
      );

      window.location.href = `/mengenermittlung/aufmasseditor?projectId=${encodeURIComponent(proj)}&from=regie`;
    } catch (e: any) {
      console.error(e);
      alert(`Aufmaß-Transfer fehlgeschlagen: ${msg(e)}`);
    } finally {
      setLoading(false);
    }
  }

  function exportXlsx() {
    if (!rows.length) return alert("Keine Einträge zum Exportieren.");
    const data = rows.map((r) => ({
      Datum: r.date ?? "",
      Mitarbeiter: r.worker ?? "",
      Stunden: r.hours ?? "",
      Maschine: r.machine ?? "",
      Material: r.material ?? "",
      Menge: r.quantity ?? "",
      Einheit: r.unit ?? "",
      "Pos (REGIE/LV)": r.lvItemPos ?? "",
      Beschreibung: r.comment ?? "",
      ID: r.id ?? ""
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Regieberichte");
    XLSX.writeFile(wb, `Regieberichte_${projectKey || "ohneProjekt"}.xlsx`);
  }

  return (
    <div className="page regie-only-page">
      <style>{`
        .regie-only-page {
          --regie-blue: #1546b8;
          --regie-blue-dark: #0b2f7f;
          --regie-soft: #eef4ff;
          --regie-line: #d9e2f0;
          --regie-text: #14213d;
          --regie-muted: #61708c;
        }
        .regie-only-page .btn {
          min-height: 36px !important;
          padding: 7px 12px !important;
          border-radius: 8px !important;
          font-size: 12px !important;
          font-weight: 700;
          white-space: nowrap;
        }
        .regie-only-page .regie-primary {
          background: var(--regie-blue) !important;
          border-color: var(--regie-blue) !important;
          color: #fff !important;
        }
        .regie-only-page .regie-danger {
          color: #b42318 !important;
          border-color: #f2b8b5 !important;
          background: #fff7f6 !important;
        }
        .regie-toolbar {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          padding: 10px 12px;
          margin-bottom: 14px;
          border: 1px solid var(--regie-line);
          border-radius: 12px;
          background: #fff;
        }
        .regie-toolbar-spacer { flex: 1; }
        .regie-project {
          display: grid;
          grid-template-columns: auto minmax(180px, 250px);
          align-items: center;
          gap: 8px;
        }
        .regie-project span { font-size: 12px; color: var(--regie-muted); }
        .regie-project input { min-height: 36px; }
        .regie-card {
          border: 1px solid var(--regie-line);
          border-radius: 14px;
          background: #fff;
          box-shadow: 0 8px 22px rgba(20, 33, 61, 0.05);
        }
        .regie-card-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 14px 16px;
          border-bottom: 1px solid var(--regie-line);
        }
        .regie-card-head h3 { margin: 0; font-size: 17px; color: var(--regie-text); }
        .regie-card-head p { margin: 3px 0 0; font-size: 12px; color: var(--regie-muted); }
        .regie-form {
          display: grid;
          grid-template-columns: repeat(12, minmax(0, 1fr));
          gap: 12px;
          padding: 16px;
        }
        .regie-field {
          display: grid;
          gap: 5px;
          min-width: 0;
        }
        .regie-field > span {
          font-size: 11px;
          font-weight: 700;
          color: var(--regie-muted);
        }
        .regie-field input,
        .regie-field textarea {
          width: 100%;
          min-height: 40px;
          box-sizing: border-box;
        }
        .regie-field textarea { resize: vertical; }
        .span-1 { grid-column: span 1; }
        .span-2 { grid-column: span 2; }
        .span-3 { grid-column: span 3; }
        .span-4 { grid-column: span 4; }
        .span-5 { grid-column: span 5; }
        .span-6 { grid-column: span 6; }
        .span-8 { grid-column: span 8; }
        .span-12 { grid-column: 1 / -1; }
        .regie-section-label {
          grid-column: 1 / -1;
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 3px;
          color: var(--regie-blue-dark);
          font-size: 12px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: .04em;
        }
        .regie-section-label::after {
          content: "";
          height: 1px;
          flex: 1;
          background: var(--regie-line);
        }
        .regie-attachments {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          flex-wrap: wrap;
        }
        .regie-thumb {
          position: relative;
          width: 78px;
          height: 78px;
          overflow: hidden;
          border: 1px solid var(--regie-line);
          border-radius: 10px;
          background: #f8fafc;
        }
        .regie-thumb img { width: 100%; height: 100%; object-fit: cover; cursor: zoom-in; }
        .regie-thumb .btn { position: absolute; top: 3px; right: 3px; min-height: 27px !important; padding: 1px 7px !important; }
        .regie-actionbar {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          padding: 12px 16px 16px;
          border-top: 1px solid var(--regie-line);
        }
        .regie-actionbar .group {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
        }
        .regie-actionbar .separator {
          width: 1px;
          height: 28px;
          background: var(--regie-line);
          margin: 0 2px;
        }
        .regie-workspace {
          display: grid;
          grid-template-columns: minmax(0, 1.35fr) minmax(340px, .85fr);
          gap: 14px;
          margin-top: 14px;
        }
        .regie-preview-body { padding: 10px; }
        .regie-preview-body iframe {
          width: 100%;
          height: 430px;
          border: 1px solid var(--regie-line);
          border-radius: 10px;
          background: #f8fafc;
        }
        .regie-empty {
          min-height: 430px;
          display: grid;
          place-items: center;
          border: 1px dashed var(--regie-line);
          border-radius: 10px;
          color: var(--regie-muted);
          font-size: 13px;
          background: #fbfcfe;
        }
        .regie-list { max-height: 430px; overflow: auto; padding: 6px 10px 10px; }
        .regie-list-item {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 10px;
          align-items: center;
          padding: 11px 4px;
          border-bottom: 1px solid var(--regie-line);
        }
        .regie-list-item.active {
          margin: 4px 0;
          padding: 10px;
          border: 1px solid #aec5f4;
          border-radius: 9px;
          background: var(--regie-soft);
        }
        .regie-list-title { font-size: 13px; font-weight: 800; color: var(--regie-text); }
        .regie-list-meta { margin-top: 3px; font-size: 11px; color: var(--regie-muted); }
        .regie-list-actions { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
        .regie-list-actions .btn { min-height: 31px !important; padding: 4px 8px !important; font-size: 11px !important; }
        .regie-table-card { margin-top: 14px; overflow: hidden; }
        .regie-table-wrap { overflow: auto; }
        .regie-table { width: 100%; min-width: 1450px; border-collapse: collapse; table-layout: fixed; }
        .regie-table th {
          padding: 9px 8px;
          background: #f5f7fb;
          border-bottom: 1px solid var(--regie-line);
          color: #34425e;
          font-size: 11px;
          text-align: left;
          white-space: nowrap;
        }
        .regie-table td {
          padding: 9px 8px;
          border-bottom: 1px solid var(--regie-line);
          color: var(--regie-text);
          font-size: 11px;
          vertical-align: top;
          overflow-wrap: anywhere;
        }
        .regie-row-actions { display: flex; gap: 5px; flex-wrap: wrap; }
        .regie-row-actions .btn { min-height: 29px !important; padding: 3px 7px !important; font-size: 10px !important; }
        @media (max-width: 1200px) {
          .regie-form { grid-template-columns: repeat(6, minmax(0, 1fr)); }
          .span-8, .span-12 { grid-column: 1 / -1; }
          .span-5, .span-6 { grid-column: span 6; }
          .span-4 { grid-column: span 3; }
          .span-3 { grid-column: span 3; }
          .span-2 { grid-column: span 2; }
          .regie-workspace { grid-template-columns: 1fr; }
        }
        @media (max-width: 720px) {
          .regie-form { grid-template-columns: 1fr; }
          .regie-form > * { grid-column: 1 / -1 !important; }
          .regie-project { grid-template-columns: 1fr; }
          .regie-toolbar-spacer { display: none; }
        }
      `}</style>

      <MengPageHeader
        title="Regieberichte"
        subtitle="Mobile → Inbox → Prüfung → Freigeben → Verwaltung"
        actions={
          <>
          <input
            id="regieJsonImport"
            type="file"
            accept="application/json"

            onChange={(e) => handleJsonFileChange(e.target.files)} className="rlc-migrated-pages-mengenermittlung-regieberichte-tsx-1323" />
          
          <button className="btn" onClick={openJsonFilePicker} disabled={loading}>Datei laden</button>
          <button className="btn" onClick={() => void createNachtraegeFromRegie()} disabled={!rows.length || !projectKey || loading}>
            Nachträge erstellen
          </button>
          <button className="btn" onClick={() => void transferToAufmassEditor()} disabled={!rows.length || !projectKey || loading}>
            Ins Aufmaßeditor übertragen
          </button>
          <button className="btn" onClick={() => void reloadActiveTab()} disabled={loading || !projectKey}>Aktualisieren</button>
          </>
        }
      />

      <div className="regie-toolbar">
        <TabButton active={tab === "INBOX"} onClick={() => setTab("INBOX")}>
          Inbox (Eingereicht) {inboxItems.length ? `• ${inboxItems.length}` : ""}
        </TabButton>
        <TabButton active={tab === "VERWALTUNG"} onClick={() => setTab("VERWALTUNG")}>
          Verwaltung {history.length ? `• ${history.length}` : ""}
        </TabButton>

        <div className="regie-toolbar-spacer" />

        {activeWorkflowDocId &&
        <>
            <button className="btn regie-primary" onClick={() => void approveInbox(activeWorkflowDocId)} disabled={loading}>
              Freigeben
            </button>
            <button className="btn regie-danger" onClick={() => void rejectInbox(activeWorkflowDocId)} disabled={loading}>
              Ablehnen
            </button>
          </>
        }

        <div className="regie-project">
          <span>Projekt-ID</span>
          <input value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="z. B. BA-2026-028" />
        </div>
      </div>

      <div className="regie-card">
        <div className="regie-card-head">
          <div>
            <h3>Büro-Bearbeitung</h3>
            <p>{activeWorkflowDocId ? "Mobile-Dokument geladen – prüfen, bearbeiten und freigeben." : "Regiebericht erfassen oder einen gespeicherten Bericht bearbeiten."}</p>
          </div>
          <div className="rlc-migrated-pages-mengenermittlung-regieberichte-tsx-1324">{rows.length} Position(en)</div>
        </div>

        {kiImported &&
        <div className="rlc-migrated-pages-mengenermittlung-regieberichte-tsx-1325">
            <b>{kiImported.count}</b> Position(en) aus KI-Diktat für <b>{kiImported.date}</b> übernommen.
          </div>
        }

        <div className="regie-form">
          <div className="regie-section-label">Allgemeine Informationen</div>

          <label className="regie-field span-2"><span>Datum</span><input type="date" value={form.date ?? ""} onChange={(e) => setField("date", e.target.value)} /></label>
          <label className="regie-field span-2"><span>Regie-Nr.</span><input value={form.regieNummer ?? ""} onChange={(e) => setField("regieNummer", e.target.value)} placeholder="z. B. R-001" /></label>
          <label className="regie-field span-5"><span>Auftraggeber / Anschrift</span><input value={form.auftraggeber ?? ""} onChange={(e) => setField("auftraggeber", e.target.value)} /></label>
          <label className="regie-field span-3"><span>Kostenstelle</span><input value={form.kostenstelle ?? ""} onChange={(e) => setField("kostenstelle", e.target.value)} /></label>

          <div className="regie-section-label">Leistung und Personal</div>

          <label className="regie-field span-3"><span>Mitarbeiter</span><input value={form.worker ?? ""} onChange={(e) => setField("worker", e.target.value)} /></label>
          <label className="regie-field span-1"><span>Stunden</span><input type="number" step="0.25" value={form.hours ?? 0} onChange={(e) => setField("hours", Number(e.target.value))} /></label>
          <label className="regie-field span-2"><span>Maschine</span><input value={form.machine ?? ""} onChange={(e) => setField("machine", e.target.value)} /></label>
          <label className="regie-field span-2"><span>Material</span><input value={form.material ?? ""} onChange={(e) => setField("material", e.target.value)} /></label>
          <label className="regie-field span-1"><span>Menge</span><input type="number" step="0.01" value={form.quantity ?? 0} onChange={(e) => setField("quantity", Number(e.target.value))} /></label>
          <label className="regie-field span-1"><span>Einheit</span><input value={form.unit ?? ""} onChange={(e) => setField("unit", e.target.value)} /></label>
          <label className="regie-field span-2"><span>LV-Position</span><input value={form.lvItemId ?? ""} onChange={(e) => setField("lvItemId", e.target.value)} placeholder={form.lvItemPos ? `Pos: ${form.lvItemPos}` : "optional"} /></label>

          <div className="regie-section-label">Arbeitszeit und Baustelle</div>

          <label className="regie-field span-2"><span>Arbeitsbeginn</span><input value={form.arbeitsbeginn ?? ""} onChange={(e) => setField("arbeitsbeginn", e.target.value)} placeholder="07:00" /></label>
          <label className="regie-field span-2"><span>Arbeitsende</span><input value={form.arbeitsende ?? ""} onChange={(e) => setField("arbeitsende", e.target.value)} placeholder="16:00" /></label>
          <label className="regie-field span-2"><span>Pause 1</span><input value={form.pause1 ?? ""} onChange={(e) => setField("pause1", e.target.value)} /></label>
          <label className="regie-field span-2"><span>Pause 2</span><input value={form.pause2 ?? ""} onChange={(e) => setField("pause2", e.target.value)} /></label>
          <label className="regie-field span-2"><span>Blatt Nr.</span><input value={form.blattNr ?? ""} onChange={(e) => setField("blattNr", e.target.value)} /></label>
          <label className="regie-field span-2"><span>Wetter</span><input value={form.wetter ?? ""} onChange={(e) => setField("wetter", e.target.value)} placeholder="sonnig, 18 °C" /></label>

          <div className="regie-section-label">Beschreibung und Dokumentation</div>

          <label className="regie-field span-6"><span>Beschreibung</span><textarea value={form.comment ?? ""} onChange={(e) => setField("comment", e.target.value)} rows={5} placeholder="Ausgeführte Arbeiten und besondere Vorkommnisse" /></label>
          <label className="regie-field span-6"><span>Bemerkungen</span><textarea value={form.bemerkungen ?? ""} onChange={(e) => setField("bemerkungen", e.target.value)} rows={5} placeholder="Zusätzliche Hinweise für den Regiebericht" /></label>

          <div className="regie-field span-12">
            <span>Fotos und Anhänge</span>
            <div className="regie-attachments">
              <input id="regiePhotos" type="file" multiple accept="image/*,.pdf,.heic,.heif" onChange={(e) => addPhotos(e.target.files)} className="rlc-migrated-pages-mengenermittlung-regieberichte-tsx-1326" />
              <label htmlFor="regiePhotos" className="btn">Dateien wählen</label>
              {(form.photos || []).map((ph) =>
              <div className="regie-thumb" key={ph.id}>
                  {isImg(ph.type) ?
                <img src={ph.url} alt={ph.name} onClick={() => setPreviewUrl(ph.url)} /> :

                <a href={ph.url} target="_blank" rel="noreferrer" className="rlc-migrated-pages-mengenermittlung-regieberichte-tsx-1327">
                      {isPdf(ph.type) ? "PDF" : "DATEI"}
                    </a>
                }
                  <button className="btn" onClick={() => removePhoto(ph.id)}>×</button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="regie-actionbar">
          <div className="group">
            <button className="btn regie-primary" onClick={() => void save()} disabled={loading}>
              {form.id ? "Änderungen speichern" : "Eintrag hinzufügen"}
            </button>
            <button className="btn" onClick={() => clearForm(true)} disabled={loading}>Formular leeren</button>
            <button className="btn" onClick={() => void loadByDate()} disabled={loading}>Nach Datum laden</button>
          </div>
          <div className="separator" />
          <div className="group">
            <button className="btn" onClick={() => void exportPdf(true)} disabled={loading || !rows.length}>PDF Vorschau</button>
            <button className="btn" onClick={() => void exportPdf(false)} disabled={loading || !rows.length}>PDF exportieren</button>
            <button className="btn" onClick={exportXlsx} disabled={loading || !rows.length}>XLSX exportieren</button>
          </div>
          <div className="separator" />
          <div className="group">
            <button className="btn" onClick={() => void saveReportToServer()} disabled={!rows.length || !projectKey || loading}>In Verwaltung speichern</button>
            <input id="regieImport" type="file" accept="application/pdf" onChange={(e) => void importPdfRegie(e.target.files)} className="rlc-migrated-pages-mengenermittlung-regieberichte-tsx-1328" />
            <label htmlFor="regieImport" className="btn">PDF importieren</label>
          </div>
        </div>

        {error && <div className="rlc-migrated-pages-mengenermittlung-regieberichte-tsx-1329">{error}</div>}
      </div>

      <div className="regie-workspace">
        <div className="regie-card">
          <div className="regie-card-head">
            <div><h3>PDF Vorschau</h3><p>Einheitliches Server-PDF für Mobile und Web.</p></div>
            {pdfUrl && <a className="btn" href={pdfUrl} target="_blank" rel="noreferrer">Öffnen</a>}
          </div>
          <div className="regie-preview-body">
            {pdfUrl ? <iframe src={pdfUrl} title="Regiebericht PDF Vorschau" /> : <div className="regie-empty">Regiebericht laden oder PDF Vorschau erzeugen</div>}
          </div>
        </div>

        <div className="regie-card">
          <div className="regie-card-head">
            <div>
              <h3>{tab === "INBOX" ? "Inbox (Eingereicht)" : "Verwaltung"}</h3>
              <p>{tab === "INBOX" ? "Dokumente aus dem Mobile-Workflow" : "Freigegebene und gespeicherte Regieberichte"}</p>
            </div>
            <span className="rlc-migrated-pages-mengenermittlung-regieberichte-tsx-1330">{tab === "INBOX" ? inboxItems.length : history.length} Eintrag(e)</span>
          </div>
          <div className="regie-list">
            {!projectKey ?
            <div className="regie-empty rlc-migrated-pages-mengenermittlung-regieberichte-tsx-1331">Projekt-ID eingeben</div> :
            tab === "INBOX" ?
            inboxItems.length === 0 ?
            <div className="regie-empty rlc-migrated-pages-mengenermittlung-regieberichte-tsx-1332">Keine eingereichten Regieberichte</div> :
            inboxItems.map((it) =>
            <div key={it.id} className={`regie-list-item ${activeWorkflowDocId === it.id ? "active" : ""}`}>
                  <div>
                    <div className="regie-list-title">{it.date || "—"} · {it.rowsCount ?? "?"} Position(en)</div>
                    <div className="regie-list-meta">Status: {it.workflowStatus} · ID: {it.id.slice(0, 8)}</div>
                  </div>
                  <div className="regie-list-actions">
                    <button className="btn" onClick={() => void loadWorkflowDoc("inbox", it.id)}>Öffnen</button>
                    <button className="btn regie-primary" onClick={() => void approveInbox(it.id)}>Freigeben</button>
                    <button className="btn regie-danger" onClick={() => void rejectInbox(it.id)}>Ablehnen</button>
                  </div>
                </div>
            ) :
            history.length === 0 ?
            <div className="regie-empty rlc-migrated-pages-mengenermittlung-regieberichte-tsx-1333">Noch keine Regieberichte in Verwaltung</div> :
            history.map((item) =>
            <div key={item.filename} className="regie-list-item">
                <div>
                  <div className="regie-list-title">{item.date} · {item.rows} Position(en)</div>
                  <div className="regie-list-meta">{item.savedAt ? new Date(item.savedAt).toLocaleString() : item.filename}</div>
                </div>
                <div className="regie-list-actions">
                  <button className="btn" onClick={() => void loadSavedReportItem(item)}>Laden</button>
                  {item.pdfUrl && <a className="btn" href={withApiBase(item.pdfUrl)} target="_blank" rel="noreferrer">PDF</a>}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="regie-card regie-table-card">
        <div className="regie-card-head">
          <div><h3>Geladener Regiebericht</h3><p>Positionen, Stunden, Maschinen, Material und Anhänge</p></div>
          <span className="rlc-migrated-pages-mengenermittlung-regieberichte-tsx-1334">{rows.length} Eintrag(e)</span>
        </div>
        <div className="regie-table-wrap">
          <table className="regie-table">
            <colgroup>
              <col className="rlc-migrated-pages-mengenermittlung-regieberichte-tsx-1335" /><col className="rlc-migrated-pages-mengenermittlung-regieberichte-tsx-1336" /><col className="rlc-migrated-pages-mengenermittlung-regieberichte-tsx-1337" /><col className="rlc-migrated-pages-mengenermittlung-regieberichte-tsx-1338" />
              <col className="rlc-migrated-pages-mengenermittlung-regieberichte-tsx-1339" /><col className="rlc-migrated-pages-mengenermittlung-regieberichte-tsx-1340" /><col className="rlc-migrated-pages-mengenermittlung-regieberichte-tsx-1341" /><col className="rlc-migrated-pages-mengenermittlung-regieberichte-tsx-1342" />
              <col className="rlc-migrated-pages-mengenermittlung-regieberichte-tsx-1343" /><col className="rlc-migrated-pages-mengenermittlung-regieberichte-tsx-1344" /><col className="rlc-migrated-pages-mengenermittlung-regieberichte-tsx-1345" /><col className="rlc-migrated-pages-mengenermittlung-regieberichte-tsx-1346" />
              <col className="rlc-migrated-pages-mengenermittlung-regieberichte-tsx-1347" /><col className="rlc-migrated-pages-mengenermittlung-regieberichte-tsx-1348" />
            </colgroup>
            <thead>
              <tr>
                <th>Datum</th><th>Typ</th><th>Regie-Nr.</th><th>Auftraggeber</th><th>Mitarbeiter</th><th>Std.</th><th>Maschine</th><th>Material</th>
                <th>Menge</th><th>Einheit</th><th>Pos. (REGIE/LV)</th><th>Beschreibung</th><th>Anhänge</th><th>Aktionen</th>
              </tr>
            </thead>
            <tbody ref={tableRef}>
              {rows.length === 0 ?
              <tr><td colSpan={14} className="rlc-migrated-pages-mengenermittlung-regieberichte-tsx-1349">Kein Regiebericht geladen</td></tr> :
              rows.map((r, i) => {
                const selected = selIdx === i;
                const flashing = flashId && String(r.id) === String(flashId);
                return (
                  <tr key={r.id ?? `r-${i}`} data-row-id={r.id || `r-${i}`} className={rlcClass(null, { background: selected ? "#eef4ff" : flashing ? "#ecfdf3" : undefined })}>
                    <td>{r.date}</td>
                    <td>{r.reportType === "TAGESBERICHT" ? "Tagesbericht" : r.reportType === "BAUTAGEBUCH" ? "Bautagebuch" : "Regiebericht"}</td>
                    <td>{r.regieNummer || "—"}</td>
                    <td>{r.auftraggeber || "—"}</td>
                    <td>{r.worker || "—"}</td>
                    <td className="rlc-migrated-pages-mengenermittlung-regieberichte-tsx-1350">{num(r.hours)}</td>
                    <td>{r.machine || "—"}</td>
                    <td>{r.material || "—"}</td>
                    <td className="rlc-migrated-pages-mengenermittlung-regieberichte-tsx-1351">{num(r.quantity)}</td>
                    <td>{r.unit || "—"}</td>
                    <td>{r.lvItemPos || "—"}</td>
                    <td className="rlc-migrated-pages-mengenermittlung-regieberichte-tsx-1352">{r.comment || "—"}</td>
                    <td>
                      <div className="rlc-migrated-pages-mengenermittlung-regieberichte-tsx-1353">
                        {(r.photos || []).slice(0, 4).map((ph) =>
                        <a key={ph.id} href={ph.url} onClick={(e) => {if (isImg(ph.type)) {e.preventDefault();setPreviewUrl(ph.url);}}} target="_blank" rel="noreferrer">
                            {isImg(ph.type) ? <img src={ph.url} alt={ph.name} className="rlc-migrated-pages-mengenermittlung-regieberichte-tsx-1354" /> : <span className="btn">PDF</span>}
                          </a>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="regie-row-actions">
                        <button className="btn" onClick={() => select(i)} disabled={loading}>Bearbeiten</button>
                        <button className="btn" onClick={() => void saveRowToServer(r)} disabled={loading}>Speichern</button>
                        <button className="btn" onClick={() => void exportSingleRowPdf(r, true)} disabled={loading}>PDF Vorschau</button>
                        <button className="btn regie-danger" onClick={() => void del(r, i)} disabled={loading}>Löschen</button>
                      </div>
                    </td>
                  </tr>);

              })}
            </tbody>
          </table>
        </div>
      </div>

      {previewUrl &&
      <div onClick={() => setPreviewUrl(null)} className="rlc-migrated-pages-mengenermittlung-regieberichte-tsx-1355">
          <img src={previewUrl} alt="Vorschau" className="rlc-migrated-pages-mengenermittlung-regieberichte-tsx-1356" />
        </div>
      }
    </div>);

}


/* ===== UI helpers ===== */
function TabButton(props: {active: boolean;onClick: () => void;children?: React.ReactNode;}) {
  return (
    <button

      onClick={props.onClick} className={rlcClass("btn",
        {
          minHeight: 38,
          padding: "7px 14px",
          borderRadius: 8,
          border: props.active ? "1px solid var(--primary)" : "1px solid var(--line)",
          background: props.active ? "var(--primary-soft)" : "#fff",
          fontSize: 12,
          fontWeight: 600
        })}>
      
      {props.children}
    </button>);

}
