// apps/web/src/pages/mengenermittlung/Regieberichte.tsx
import React from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { useProject } from "../../store/useProject";

/* ===== Tipi ===== */
type Datei = { id: string; name: string; url: string; type: string };

type ReportType = "REGIE" | "TAGESBERICHT" | "BAUTAGEBUCH";

type RegieRow = {
  id?: string;
  projectId: string;
  date?: string; // yyyy-mm-dd
  worker?: string;
  hours?: number;
  machine?: string;
  material?: string;
  quantity?: number;
  unit?: string;
  comment?: string; // Beschreibung
  lvItemId?: string | null;
  lvItemPos?: string | null;
  photos?: Datei[]; // immagini/pdf per UI

  // PDF Header / Meta
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
  bemerkungen?: string; // per box "Bemerkungen"
};

type RegieHistoryItem = {
  date: string;
  filename: string;
  rows: number;
  savedAt?: string;
  pdfUrl?: string | null;
  fsKey?: string;
};

/** Workflow items (Inbox / Approved) */
type WorkflowStatus = "DRAFT" | "EINGEREICHT" | "FREIGEGEBEN" | "ABGELEHNT" | "REGISTRIERT";

type RegieWorkflowItem = {
  id: string; // docId
  projectId: string;
  projectCode?: string;
  date?: string;
  createdAt?: number;
  submittedAt?: number | null;
  workflowStatus: WorkflowStatus;
  title?: string; // optional
  note?: string; // optional
  rowsCount?: number; // optional
};

/* ===== Nachtrag Draft (client buffer) ===== */
type NachtragDraft = {
  projectId: string;
  createdAt: number;
  source: "REGIE";
  rows: Array<{
    pos: string; // REGIE.001
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
const rid = () => (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

const STATE_STORAGE_KEY = "rlc-regieberichte-state-v2";

const API_BASE =
  (import.meta as any)?.env?.VITE_API_URL ||
  (import.meta as any)?.env?.VITE_BACKEND_URL ||
  "http://localhost:4000";

function withApiBase(url: string) {
  // already absolute
  if (/^https?:\/\//i.test(url)) return url;
  // ensure leading slash
  const u = url.startsWith("/") ? url : `/${url}`;
  return `${API_BASE}${u}`;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(withApiBase(url), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

/** Safe JSON fetch: returns null if endpoint not present / fails. */
async function apiTry<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(withApiBase(url), {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
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

/**
 * FINAL must show ONLY files that are actually in "Regieberichte" (Final).
 * We keep this filter as a safety net, even though the correct endpoint
 * should already return only final/history items.
 */
function isFinalRegieberichtFilename(filename?: string) {
  const f = String(filename || "").trim();
  if (!f) return false;

  // normalize just the basename
  const base = f.split("/").pop() || f;

  // accept typical Final naming
  const low = base.toLowerCase();
  if (low.startsWith("regiebericht_")) return true;
  if (low.startsWith("regieberichte_")) return true;

  // reject typical "regie" prefix
  if (low.startsWith("regie_")) return false;

  if (low.includes("regiebericht")) return true;

  return false;
}

/** Converte URL (anche objectURL) in dataURL (JPEG). Se non decodificabile → null. */
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

/* ===== PDF Reader compatibile Vite ===== */
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

/* ===== Parser semplice Regie dal testo ===== */
function parseRegieFromText(txt: string, defaults: { projectId: string }): RegieRow[] {
  const date = (
    txt.match(/Datum[:\s]*([0-9]{2}\.[0-9]{2}\.[0-9]{4}|[0-9]{4}-[0-9]{2}-[0-9]{2})/i)?.[1] ??
    today()
  ).replace(/(\d{2})\.(\d{2})\.(\d{4})/, "$3-$2-$1");

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
      reportType: "REGIE",
    },
  ];
}

/* ===== Buffer KI locale ===== */
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
      reportType: "REGIE",
    }));
  } catch {
    return [];
  }
}

/* ===== Helper: rigenera URL per foto da dataUrl (quando ricarichi JSON) ===== */
function reviveRows(list: any[]): RegieRow[] {
  return (list || []).map((r: any) => ({
    ...r,
    photos: (r.photos || []).map((ph: any) => ({
      id: ph.id || rid(),
      name: ph.name || "Foto",
      type: ph.type || "image/jpeg",
      url: ph.url || ph.dataUrl || "",
    })),
  }));
}

/* helper per convertire URL → base64 */
async function toDataUrl(objUrl: string): Promise<string> {
  const res = await fetch(objUrl);
  const blob = await res.blob();
  return await new Promise<string>((resolve) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.readAsDataURL(blob);
  });
}

/* ===== REGIE POS Generator (per Projekt) ===== */
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

/* ===== Nachtrag Draft builder ===== */
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
        r.hours != null && r.hours !== 0 ? `Stunden: ${r.hours}` : null,
      ].filter(Boolean) as string[];

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
        date: r.date ? String(r.date).slice(0, 10) : undefined,
      };
    }),
  };
}

/* ===== Component ===== */
type TabKey = "INBOX" | "FREIGEGEBEN" | "FINAL";

export default function Regieberichte() {
  const q = useQuery();
  const { getSelectedProject } = useProject();
  const selectedProject = getSelectedProject();

  const qFromKi = q.get("from") === "ki";

  const qProjectId =
    q.get("projectId") ||
    sessionStorage.getItem("regie:openProjectId") ||
    (selectedProject?.code as string | undefined) ||
    (selectedProject?.id as string | undefined) ||
    "";

  const qDate = q.get("date") || today();

  const [tab, setTab] = React.useState<TabKey>("FINAL");

  const [projectId, setProjectId] = React.useState(qProjectId);
  const [rows, setRows] = React.useState<RegieRow[]>([]);
  const [selIdx, setSelIdx] = React.useState<number | null>(null);
  const [form, setForm] = React.useState<RegieRow>({
    projectId: qProjectId || "",
    date: qDate,
    photos: [],
    reportType: "REGIE",
    unit: "Std",
    hours: 0,
    quantity: 0,
  });

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = React.useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [kiImported, setKiImported] = React.useState<{ count: number; date: string } | null>(null);

  // FINAL store (legacy)
  const [history, setHistory] = React.useState<RegieHistoryItem[]>([]);

  // Workflow lists
  const [inboxItems, setInboxItems] = React.useState<RegieWorkflowItem[]>([]);
  const [approvedItems, setApprovedItems] = React.useState<RegieWorkflowItem[]>([]);

  const tableRef = React.useRef<HTMLTableSectionElement | null>(null);
  const [flashId, setFlashId] = React.useState<string | null>(null);

  const formDate = form.date;

  // ==========================
  // FIX: sempre usare FS-Key (projectCode) per filesystem routes
  // ==========================
  function looksLikeUuid(v?: string) {
    return (
      !!v &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
    );
  }

  /**
   * projectKey = sempre FS key (BA-2025-DEMO)
   * - preferisci selectedProject.code
   * - altrimenti, se projectId non è UUID, usalo come chiave FS
   */
  const projectKey =
    (selectedProject?.code as string | undefined) || (!looksLikeUuid(projectId) ? projectId : "") || "";

  React.useEffect(() => {
    if (projectId) sessionStorage.setItem("regie:openProjectId", projectId);
  }, [projectId]);

  /* ===== local state persist ===== */
  React.useEffect(() => {
    if (qFromKi) return;
    try {
      const raw = localStorage.getItem(STATE_STORAGE_KEY);
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
            reportType: r.reportType || "REGIE",
          }))
        );
      if (parsed.form)
        setForm({
          ...parsed.form,
          reportType: parsed.form.reportType || "REGIE",
        });
      if (parsed.tab) setTab(parsed.tab);
    } catch (e) {
      console.error("Konnte Regie-Zustand nicht laden", e);
    }
  }, [qFromKi]);

  React.useEffect(() => {
    try {
      localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify({ projectId, rows, form, tab }));
    } catch {
      // ignore
    }
  }, [projectId, rows, form, tab]);

  /* ===== FINAL: Verlauf laden ===== */
  const loadHistory = React.useCallback(async () => {
    if (!projectKey) {
      setHistory([]);
      return;
    }

    // 1) Prefer correct endpoint
    const primary = await apiTry<{ ok: boolean; items: RegieHistoryItem[] }>(
      `/api/regie/list?projectId=${encodeURIComponent(projectKey)}`
    );

    if (primary?.ok) {
      const items = (primary.items || []).filter((it) => isFinalRegieberichtFilename(it.filename));
      setHistory(items);
      return;
    }

    // 2) Fallback legacy endpoint (older builds)
    const legacy = await apiTry<{ ok: boolean; items: RegieHistoryItem[] }>(
      `/api/ki/regie/list?projectId=${encodeURIComponent(projectKey)}`
    );

    if (legacy?.ok) {
      const items = (legacy.items || []).filter((it) => isFinalRegieberichtFilename(it.filename));
      setHistory(items);
      return;
    }

    setHistory([]);
  }, [projectKey]);

  /* ===== WORKFLOW: lists ===== */
  const loadInbox = React.useCallback(async () => {
    if (!projectKey) {
      setInboxItems([]);
      return;
    }
    const res = await api<{ ok: boolean; items: RegieWorkflowItem[] }>(
      `/api/regie/inbox/list?projectId=${encodeURIComponent(projectKey)}`
    );
    setInboxItems(res.items || []);
  }, [projectKey]);

  const loadApproved = React.useCallback(async () => {
    if (!projectKey) {
      setApprovedItems([]);
      return;
    }

    // Prefer "freigegeben/final list" (server dependent)
    const primary = await apiTry<{ ok: boolean; items: RegieWorkflowItem[] }>(
      `/api/regie/final/list?projectId=${encodeURIComponent(projectKey)}`
    );
    if (primary?.ok) {
      setApprovedItems(primary.items || []);
      return;
    }

    const aliasA = await apiTry<{ ok: boolean; items: RegieWorkflowItem[] }>(
      `/api/regie/freigegeben/list?projectId=${encodeURIComponent(projectKey)}`
    );
    if (aliasA?.ok) {
      setApprovedItems(aliasA.items || []);
      return;
    }

    const legacy = await apiTry<{ ok: boolean; items: RegieWorkflowItem[] }>(
      `/api/regie/approved/list?projectId=${encodeURIComponent(projectKey)}`
    );

    setApprovedItems(legacy?.items || []);
  }, [projectKey]);

  const reloadActiveTab = React.useCallback(async () => {
    setError(null);
    try {
      if (!projectKey) return;
      if (tab === "FINAL") await loadHistory();
      if (tab === "INBOX") await loadInbox();
      if (tab === "FREIGEGEBEN") await loadApproved();
    } catch (e: any) {
      setError(msg(e));
    }
  }, [tab, projectKey, loadHistory, loadInbox, loadApproved]);

  React.useEffect(() => {
    if (!projectKey) return;
    reloadActiveTab();
  }, [projectKey, tab, reloadActiveTab]);

  /* ===== helper snapshot commit (legacy) ===== */
  async function commitSnapshot(proj: string, dateStr: string, rowsSnapshot: RegieRow[]) {
    if (!proj) return;
    const snapshot = { projectId: proj, date: dateStr, note: form.comment ?? "", rows: rowsSnapshot };
    await api<{ ok: boolean }>(`/api/ki/regie/commit/regiebericht`, {
      method: "POST",
      body: JSON.stringify(snapshot),
    });
  }

  /* ===== load by date (legacy editor) ===== */
  const loadByDate = React.useCallback(async () => {
    setError(null);
    if (!projectKey) return;
    setLoading(true);
    setPdfUrl(null);
    try {
      const d = (formDate || qDate || today()).slice(0, 10);
      const data = await api<{ ok: boolean; rows?: RegieRow[]; date?: string; note?: string }>(
        `/api/ki/regie?projectId=${encodeURIComponent(projectKey)}&date=${encodeURIComponent(d)}`
      );

      const list = (data.rows || []).map((r) => ({
        ...r,
        date: r.date?.slice(0, 10),
        reportType: r.reportType || "REGIE",
      }));
      setRows(list);
      setSelIdx(null);
      setForm((prev) => ({
        ...prev,
        projectId: projectKey,
        date: d,
        photos: [],
      }));
    } catch (e: any) {
      setError(msg(e));
    } finally {
      setLoading(false);
    }
  }, [projectKey, qDate, formDate]);

  /* ===== KI import ===== */
  React.useEffect(() => {
    if (!qFromKi || !projectKey) return;

    const kiRows = consumeKiBuffer(projectKey, q.get("date") || today());
    if (kiRows.length) {
      setRows((prev) => [...kiRows, ...prev]);
      setKiImported({
        count: kiRows.length,
        date: (q.get("date") || today()).slice(0, 10),
      });
    }

    sessionStorage.removeItem("regie:openProjectId");
  }, [qFromKi, projectKey, q]);

  /* ===== focus row ===== */
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
      bemerkungen: r.bemerkungen ?? "",
    });
  }

  /** Vollständig leeren (wie bisher) */
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
      bemerkungen: "",
    });
  }

  /** Nur Zeilen-Felder leeren, Header bleibt. */
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
      photos: [],
    }));
  }

  function setField<K extends keyof RegieRow>(k: K, v: RegieRow[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  /* ===== JSON-Import (manual) ===== */
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
          date: (r.date || d).slice(0, 10),
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

  /* ===== FINAL: load history item ===== */
  async function loadSavedReportItem(item: RegieHistoryItem) {
    if (!projectKey) return alert("Bitte zuerst eine Projekt-ID eingeben.");

    if (!isFinalRegieberichtFilename(item.filename)) {
      return alert("Dieser Eintrag gehört nicht zur Final-Regieberichte-Historie.");
    }

    try {
      setLoading(true);
      setError(null);

      const urlNew = `/api/regie/read?projectId=${encodeURIComponent(projectKey)}&filename=${encodeURIComponent(
        item.filename
      )}`;
      const urlAlt = `/api/regie?projectId=${encodeURIComponent(projectKey)}&filename=${encodeURIComponent(item.filename)}`;
      const urlLegacy = `/api/ki/regie/read?projectId=${encodeURIComponent(projectKey)}&filename=${encodeURIComponent(
        item.filename
      )}`;

      let data: any = null;
      data = await apiTry<any>(urlNew);
      if (!data) data = await apiTry<any>(urlAlt);
      if (!data) data = await apiTry<any>(urlLegacy);
      if (!data) throw new Error("Konnte Regiebericht-Datei nicht laden (kein passender Endpoint).");

      let loadedRows: RegieRow[] = [];
      if (Array.isArray(data.rows)) loadedRows = data.rows;
      else if (data.items && Array.isArray(data.items.aufmass)) loadedRows = data.items.aufmass;

      if (!loadedRows.length) return alert("Kein gespeicherter Regiebericht in dieser Datei gefunden.");

      const d =
        (data.date as string | undefined)?.slice(0, 10) ||
        (loadedRows[0].date && loadedRows[0].date!.slice(0, 10)) ||
        item.date.slice(0, 10);

      const list = reviveRows(loadedRows as any).map((r) => ({
        ...r,
        projectId: projectKey,
        date: (r.date || d).slice(0, 10),
        reportType: r.reportType || "REGIE",
      }));

      setRows(list);
      setSelIdx(null);
      setForm((prev) => ({
        ...prev,
        projectId: projectKey,
        date: d,
        photos: [],
        comment: (data as any).note ?? prev.comment ?? "",
      }));

      setPdfUrl((data as any).pdfUrl ?? item.pdfUrl ?? null);
    } catch (e: any) {
      console.error(e);
      setError(msg(e));
    } finally {
      setLoading(false);
    }
  }

  /* ============================================================
     WORKFLOW: READ (Inbox / Freigegeben)
     FIX #1: Endpoints unterscheiden sich je Build -> mehrere Kandidaten probieren
     FIX #2: Freigegeben JSON ist oft "flat" (kein snapshot.rows), deshalb robust normalisieren
     ============================================================ */

  function normalizeFileArray(arr: any[]): Datei[] {
    return (arr || [])
      .filter(Boolean)
      .map((x: any) => ({
        id: String(x.id || rid()),
        name: String(x.name || "Anhang"),
        type: String(x.type || guessType(String(x.name || ""))),
        url: String(x.url || x.path || ""),
      }))
      .filter((x) => !!x.url);
  }

  function normalizeWorkflowDocToLoaded(snap: any): { loadedRows: RegieRow[]; d: string; note: string; pdfUrl?: string | null } {
    // 1) modern: snapshot.rows
    const rowsIn = (snap?.rows || snap?.items?.aufmass || []) as any[];
    const d = String(snap?.date || today()).slice(0, 10);

    // 2) flat JSON (come il tuo esempio): contiene direttamente i campi
    const isFlatRegie =
      !Array.isArray(rowsIn) || rowsIn.length === 0
        ? !!snap && typeof snap === "object" && (snap.kind === "regie" || snap.reportType || snap.workflowStatus)
        : false;

    const note = String(snap?.note ?? snap?.comment ?? "").trim();

    if (Array.isArray(rowsIn) && rowsIn.length > 0) {
      const loadedRows = rowsIn.map((r) => ({
        ...r,
        projectId: projectKey,
        date: String(r.date || d).slice(0, 10),
        reportType: (r as any).reportType || "REGIE",
        photos: normalizeFileArray((r as any).photos || (r as any).attachments || []),
      })) as RegieRow[];
      return { loadedRows, d, note, pdfUrl: snap?.pdfUrl ?? null };
    }

    if (isFlatRegie) {
      // mapping dei campi "mitarbeiter/maschinen/materialien" -> worker/machine/material
      const photos = normalizeFileArray(snap.photos || snap.attachments || []);
      const row: RegieRow = {
        id: String(snap.id || rid()),
        projectId: projectKey,
        date: String(snap.date || d).slice(0, 10),
        reportType: (snap.reportType as ReportType) || "REGIE",
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
        photos,
      };

      return { loadedRows: [row], d: row.date || d, note: row.comment || note, pdfUrl: snap?.pdfUrl ?? null };
    }

    return { loadedRows: [], d, note, pdfUrl: snap?.pdfUrl ?? null };
  }

  async function loadWorkflowDoc(stage: "inbox" | "freigegeben" | "approved", docId: string) {
    if (!projectKey) return;

    // stage mapping: in alcuni build si chiama "freigegeben", in altri "approved", in altri "final"
    const stageKey = stage === "approved" ? "freigegeben" : stage;

    const candidates: string[] = [
      // più comune: /api/regie/<stage>/read
      `/api/regie/${stageKey}/read?projectId=${encodeURIComponent(projectKey)}&docId=${encodeURIComponent(docId)}`,
      // compat: /api/regie/approved/read
      stageKey === "freigegeben"
        ? `/api/regie/approved/read?projectId=${encodeURIComponent(projectKey)}&docId=${encodeURIComponent(docId)}`
        : "",
      // compat: /api/regie/final/read (alcuni server salvano i FREIGEGEBEN sotto "final")
      stageKey === "freigegeben"
        ? `/api/regie/final/read?projectId=${encodeURIComponent(projectKey)}&docId=${encodeURIComponent(docId)}`
        : "",
      // generic: /api/regie/read?stage=...
      `/api/regie/read?projectId=${encodeURIComponent(projectKey)}&docId=${encodeURIComponent(docId)}&stage=${encodeURIComponent(
        stageKey
      )}`,
      // alt generic
      `/api/regie/workflow/read?projectId=${encodeURIComponent(projectKey)}&docId=${encodeURIComponent(
        docId
      )}&stage=${encodeURIComponent(stageKey)}`,
    ].filter(Boolean);

    try {
      setLoading(true);
      setError(null);
      setPdfUrl(null);

      let data: any = null;
      let hitUrl: string | null = null;

      for (const u of candidates) {
        const r = await apiTry<any>(u);
        if (r) {
          data = r;
          hitUrl = u;
          break;
        }
      }

      if (!data) {
        throw new Error(`Not Found (keine passende Route).`);
      }

      // server responses often wrap into { ok, snapshot } or { data: { snapshot } }
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
        reportType: r.reportType || "REGIE",
      }));

      setRows(revived);
      setSelIdx(null);

      // Header/Form: usa la prima riga come “header carrier”
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
        photos: [],
      }));

      if (norm.pdfUrl) setPdfUrl(norm.pdfUrl);
    } catch (e: any) {
      console.error(e);
      setError("Workflow-Dokument konnte nicht geladen werden. " + msg(e));
    } finally {
      setLoading(false);
    }
  }

  async function approveInbox(docId: string) {
    if (!projectKey) return;
    if (!window.confirm("Einreichen/Freigeben? (Inbox → Freigegeben)")) return;
    try {
      setLoading(true);
      await api<{ ok: boolean }>(`/api/regie/inbox/approve`, {
        method: "POST",
        body: JSON.stringify({ projectId: projectKey, docId }),
      });
      await loadInbox();
      await loadApproved();
      alert("Freigegeben.");
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
      await api<{ ok: boolean }>(`/api/regie/inbox/reject`, {
        method: "POST",
        body: JSON.stringify({ projectId: projectKey, docId, reason }),
      });
      await loadInbox();
      alert("Abgelehnt.");
    } catch (e: any) {
      alert(msg(e));
    } finally {
      setLoading(false);
    }
  }

  async function registerApproved(docId: string) {
    if (!projectKey) return;
    if (!window.confirm("Registrieren? (Freigegeben → Final)")) return;
    try {
      setLoading(true);
      await api<{ ok: boolean; stored?: string; pdfUrl?: string | null }>(`/api/regie/register`, {
        method: "POST",
        body: JSON.stringify({ projectId: projectKey, docId }),
      });
      await loadApproved();
      await loadHistory(); // FINAL history
      alert("Registriert.");
    } catch (e: any) {
      alert(msg(e));
    } finally {
      setLoading(false);
    }
  }

  /* ========= PDF EXPORT (Refactor: rows param, no state mutation) ========= */
  async function exportPdfRows(rowsToExport: RegieRow[], opts: { preview: boolean; single?: boolean }) {
    if (!rowsToExport.length) {
      alert("Keine Einträge zum Exportieren.");
      return;
    }

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    const pageW = doc.internal.pageSize.getWidth();
    const margin = 10;
    const lineW = 0.2;

    const labelFont = 8;
    const valueFont = 8;

    doc.setLineWidth(lineW);
    doc.setFont("helvetica", "normal");

    const projectIdForBauNr = projectKey || rowsToExport[0].projectId || "";
    const baustelleName = selectedProject?.name || selectedProject?.code || projectIdForBauNr;
    const exportDate = (form.date || rowsToExport[0]?.date || today()).slice(0, 10);

    const chunkSize = 6; // max 6 Zeilen pro Seite
    const totalPages = Math.ceil(rowsToExport.length / chunkSize);

    for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
      if (pageIndex > 0) doc.addPage();

      const pageRows = rowsToExport.slice(pageIndex * chunkSize, (pageIndex + 1) * chunkSize);
      const headerRow = pageRows[0] || rowsToExport[0];

      const headTop = margin;
      const headH = 32;
      const leftW = 55;
      const rightW = 55;
      const midW = pageW - margin * 2 - leftW - rightW;

      const leftX = margin;
      const midX = leftX + leftW;
      const rightX = midX + midW;

      const headerType: ReportType = headerRow.reportType || "REGIE";

      // Rahmen
      doc.rect(leftX, headTop, leftW + midW + rightW, headH);
      doc.rect(leftX, headTop, leftW, headH);

      doc.setFontSize(labelFont);

      const cbSize = 10;
      let tx = leftX + 6;
      let ty = headTop + 10;

      const drawTypeRow = (label: string, type: ReportType) => {
        const isActive = headerType === type;
        doc.text(label, tx, ty);
        const boxY = ty - cbSize + 2;
        doc.rect(leftX + leftW - cbSize - 6, boxY, cbSize, cbSize);
        if (isActive) {
          doc.setFontSize(labelFont + 1);
          doc.text("X", leftX + leftW - cbSize - 6 + cbSize / 2, boxY + cbSize / 2 + 1, {
            align: "center",
          });
          doc.setFontSize(labelFont);
        }
        ty += 10;
      };

      drawTypeRow("Tagesbericht", "TAGESBERICHT");
      drawTypeRow("Bautagebuch", "BAUTAGEBUCH");
      drawTypeRow("Regiebericht", "REGIE");

      // Mittelblock
      doc.rect(midX, headTop, midW, headH);
      const midInnerX = midX + 6;
      let lineY = headTop + 10;

      doc.text("Baustelle:", midInnerX, lineY);
      doc.setFontSize(valueFont);
      doc.text(baustelleName || "-", midInnerX + 22, lineY);
      doc.setFontSize(labelFont);
      doc.line(midInnerX + 20, lineY + 1.5, midX + midW - 6, lineY + 1.5);

      lineY += 10;
      doc.text("Auftraggeber/Anschrift:", midInnerX, lineY);
      doc.setFontSize(valueFont);
      if (headerRow.auftraggeber) {
        doc.text(headerRow.auftraggeber, midInnerX + 42, lineY, { maxWidth: midW - 6 - 42 });
      }
      doc.setFontSize(labelFont);
      doc.line(midInnerX + 38, lineY + 1.5, midX + midW - 6, lineY + 1.5);

      // Rechter Block
      doc.rect(rightX, headTop, rightW, headH);

      const fieldH = headH / 3;
      let fy = headTop;

      const drawRightField = (label: string, value?: string) => {
        doc.rect(rightX, fy, rightW, fieldH);
        doc.setFontSize(labelFont);
        doc.text(label, rightX + rightW / 2, fy + 4, { align: "center" });
        if (value) {
          doc.setFontSize(valueFont);
          doc.text(value, rightX + rightW / 2, fy + fieldH - 2, { align: "center" });
        }
        fy += fieldH;
      };

      drawRightField("Bau-Nr.", projectIdForBauNr || "");
      drawRightField("Regie-Nr.", headerRow.regieNummer || "");
      drawRightField("Datum", (headerRow.date || exportDate || today()).slice(0, 10));

      // Wochentage + Zeiten
      let curY = headTop + headH + 8;

      const dayRowH = 10;
      const timeRowH = 10;
      const days = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

      const daysWidth = pageW - margin * 2;
      doc.rect(margin, curY, daysWidth, dayRowH + timeRowH * 2);

      const dayCellW = daysWidth / days.length;
      days.forEach((d, i) => {
        const x = margin + i * dayCellW;
        doc.rect(x, curY, dayCellW, dayRowH);
        doc.text(d, x + dayCellW / 2, curY + 6, { align: "center" });
      });

      curY += dayRowH;

      const labelsZeit = ["Arbeitsbeginn", "Pause 1", "Pause 2", "Arbeitsende", "Blatt Nr.", "Wetter"];
      const zeitCellW = daysWidth / labelsZeit.length;

      labelsZeit.forEach((txt, i) => {
        const x = margin + i * zeitCellW;
        doc.rect(x, curY, zeitCellW, timeRowH);
        doc.text(txt, x + zeitCellW / 2, curY + 6, { align: "center" });
      });

      curY += timeRowH;

      const zeitValues = [
        headerRow.arbeitsbeginn || "",
        headerRow.pause1 || "",
        headerRow.pause2 || "",
        headerRow.arbeitsende || "",
        headerRow.blattNr || "",
        headerRow.wetter || "",
      ];
      zeitValues.forEach((val, i) => {
        const x = margin + i * zeitCellW;
        doc.rect(x, curY, zeitCellW, timeRowH);
        if (val) {
          doc.setFontSize(valueFont);
          doc.text(val, x + zeitCellW / 2, curY + 6, { align: "center" });
          doc.setFontSize(labelFont);
        }
      });

      curY += timeRowH + 6;

      // Tabelle
      const tableTop = curY;
      const tableW = pageW - margin * 2;
      const tableH = 6 * 9;
      const headerH = 7;

      doc.rect(margin, tableTop, tableW, headerH + tableH);

      const colKosten = tableW * 0.1;
      const colGerät = tableW * 0.26;
      const colMitarbeiter = tableW * 0.18;
      const colStd = tableW * 0.08;
      const colBesLeist = tableW * 0.22;
      const colMat = tableW - (colKosten + colGerät + colMitarbeiter + colStd + colBesLeist);

      let colX = margin;
      const drawCol = (w: number, label: string) => {
        doc.rect(colX, tableTop, w, headerH + tableH);
        doc.setFontSize(labelFont);
        doc.text(label, colX + w / 2, tableTop + 4, { align: "center" });
        colX += w;
      };

      drawCol(colKosten, "Kostenstelle");
      drawCol(colGerät, "Bezeichnung der Geräte");
      drawCol(colMitarbeiter, "Mitarbeiter");
      drawCol(colStd, "Std.");
      drawCol(colBesLeist, "Besondere Leistungen");
      drawCol(colMat, "Material");

      const mainRowYStart = tableTop + headerH;
      const rowH = tableH / 6;

      for (let i = 0; i < 6; i++) {
        const y = mainRowYStart + i * rowH;
        doc.line(margin, y, margin + tableW, y);
      }

      doc.setFontSize(valueFont);

      pageRows.forEach((r, idx) => {
        if (idx >= 6) return;
        const textY = mainRowYStart + idx * rowH + rowH / 2 + 2;

        const hoursStr = r.hours != null ? num(r.hours) : "";
        const qtyStr = r.quantity != null && r.quantity !== 0 ? `${num(r.quantity)} ${r.unit || ""}`.trim() : "";
        const materialStr = [r.material || "", qtyStr].filter(Boolean).join(" – ");
        const besondereStr = r.comment || "";

        let txCol = margin + 2;

        if ((r as any).kostenstelle || headerRow.kostenstelle) {
          doc.text((r as any).kostenstelle || headerRow.kostenstelle || "", txCol, textY, {
            maxWidth: colKosten - 4,
          });
        }
        txCol += colKosten;

        if (r.machine || r.material) {
          doc.text(r.machine || r.material || "", txCol + 2, textY, { maxWidth: colGerät - 4 });
        }
        txCol += colGerät;

        if (r.worker) {
          doc.text(r.worker, txCol + 2, textY, { maxWidth: colMitarbeiter - 4 });
        }
        txCol += colMitarbeiter;

        if (hoursStr) {
          doc.text(hoursStr, txCol + colStd / 2, textY, { align: "center" });
        }
        txCol += colStd;

        if (besondereStr) {
          doc.text(besondereStr, txCol + 2, textY, { maxWidth: colBesLeist - 4 });
        }
        txCol += colBesLeist;

        if (materialStr) {
          doc.text(materialStr, txCol + 2, textY, { maxWidth: colMat - 4 });
        }
      });

      curY = tableTop + headerH + tableH + 8;

      // Beschreibung
      const beschH = 30;
      doc.rect(margin, curY, tableW, beschH);
      doc.setFontSize(labelFont);
      doc.text("Beschreibung der Arbeit, besondere Vorkommnisse, Anordnungen", margin + 2, curY + 5);

      curY += beschH + 6;

      // Foto + Bemerkungen
      const fotoBoxH = 55;
      const fotoBoxW = tableW * 0.58;
      const bemerkW = tableW - fotoBoxW;

      const fotoX = margin;
      const bemerkX = margin + fotoBoxW;

      doc.rect(fotoX, curY, fotoBoxW, fotoBoxH);
      doc.rect(bemerkX, curY, bemerkW, fotoBoxH);

      doc.setFontSize(labelFont);
      doc.text("Fotodokumentation", fotoX + 2, curY + 5);
      doc.text("Bemerkungen", bemerkX + 2, curY + 5);

      if (headerRow.bemerkungen) {
        doc.setFontSize(valueFont);
        doc.text(headerRow.bemerkungen, bemerkX + 2, curY + 11, { maxWidth: bemerkW - 4 });
        doc.setFontSize(labelFont);
      }

      const firstImg = pageRows.flatMap((r) => r.photos || []).find((p) => isImg(p.type)) || null;
      if (firstImg) {
        const dataUrl = await urlToDataURL(firstImg.url, "image/jpeg");
        if (dataUrl) {
          const imgMargin = 6;
          const imgW = fotoBoxW - imgMargin * 2;
          const imgH = fotoBoxH - imgMargin * 2 - 6;
          doc.addImage(dataUrl, "JPEG", fotoX + imgMargin, curY + imgMargin + 4, imgW, imgH);
        }
      }

      curY += fotoBoxH + 8;

      // Unterschriften
      const signH = 16;
      doc.rect(margin, curY, tableW, signH * 2);

      const midSignX = margin + tableW / 2;
      doc.line(midSignX, curY, midSignX, curY + signH * 2);

      doc.setFontSize(labelFont);
      doc.text("Geprüft", margin + 2, curY + 5);
      doc.text("Aufgestellt", midSignX + 2, curY + 5);

      const lineY1 = curY + signH - 4;
      doc.text("Bauleiter", margin + 2, lineY1 - 2);
      doc.line(margin + 22, lineY1, midSignX - 4, lineY1);

      doc.text("Polier", midSignX + 2, lineY1 - 2);
      doc.line(midSignX + 18, lineY1, margin + tableW - 4, lineY1);

      const lineY2 = curY + signH * 2 - 4;
      doc.text("Bauherr", margin + 2, lineY2 - 2);
      doc.line(margin + 22, lineY2, midSignX - 4, lineY2);

      doc.text("Bauführer", midSignX + 2, lineY2 - 2);
      doc.line(midSignX + 22, lineY2, margin + tableW - 4, lineY2);
    }

    const baseName = opts.single ? `Regiebericht_${exportDate}` : `Regieberichte_${exportDate}`;
    const fileName = `${baseName}_${projectIdForBauNr || "ohneProjekt"}.pdf`;

    if (opts.preview) {
      const blob = doc.output("blob");
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
      return;
    }

    doc.save(fileName);
  }

  async function exportPdf(preview = false) {
    await exportPdfRows(rows, { preview, single: false });
  }

  async function exportSingleRowPdf(row: RegieRow, preview = false) {
    await exportPdfRows([row], { preview, single: true });
  }

  /* ===== Save (legacy snapshot/day editing) ===== */
  async function save() {
    const proj =
      projectKey || form.projectId || (selectedProject?.code as string | undefined) || (selectedProject?.id as string | undefined) || "";

    if (!proj) {
      alert("Bitte Projekt-ID eingeben.");
      return;
    }

    try {
      setError(null);
      const optimisticId = form.id || rid();
      const dateStr = (form.date || today()).slice(0, 10);

      const local: RegieRow = {
        ...form,
        id: optimisticId,
        projectId: proj,
        date: dateStr,
        reportType: form.reportType || "REGIE",
      };

      let nextRows: RegieRow[] = [];
      setRows((prev) => {
        const updated = form.id ? prev.map((r) => (r.id === form.id ? local : r)) : [local, ...prev];
        nextRows = updated;
        return updated;
      });

      clearLineKeepHeader();

      const snapshot = { projectId: proj, date: dateStr, note: form.comment ?? "", rows: nextRows };

      const resp = await api<any>(`/api/ki/regie/commit/regiebericht`, {
        method: "POST",
        body: JSON.stringify(snapshot),
      });

      const reportId = resp?.reportId ?? resp?.id ?? resp?.nummer ?? "?";
      const stored = resp?.stored ?? resp?.filename ?? resp?.file ?? resp?.path ?? "-";

      alert(`Regiebericht gespeichert (Nr. ${reportId}).\nDatei: ${stored}`);

      await loadHistory();
    } catch (e: any) {
      console.error(e);
      setError(`Lokal gespeichert. Serverfehler: ${msg(e)}`);
    }
  }

  /* ===== Salva report (JSON + FOTO) legacy ===== */
  async function saveReportToServer() {
    const proj =
      projectKey || form.projectId || (selectedProject?.code as string | undefined) || (selectedProject?.id as string | undefined) || "";

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
          photos,
        });
      }

      const snapshot = {
        projectId: proj,
        date,
        note: form.comment ?? "",
        rows: rowsWithPhotos,
        items: { aufmass: rowsWithPhotos, lieferscheine: [] },
      };

      const resp = await api<any>(`/api/ki/regie/commit/regiebericht`, {
        method: "POST",
        body: JSON.stringify(snapshot),
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

  async function saveRowToServer(row: RegieRow) {
    const proj =
      projectKey || row.projectId || (selectedProject?.code as string | undefined) || (selectedProject?.id as string | undefined) || "";

    if (!proj) {
      alert("Bitte Projekt-ID eingeben.");
      return;
    }

    try {
      setLoading(true);
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
        items: { aufmass: [rowOut], lieferscheine: [] },
      };

      const resp = await api<any>(`/api/ki/regie/commit/regiebericht`, {
        method: "POST",
        body: JSON.stringify(payload),
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
      projectKey || row.projectId || (selectedProject?.code as string | undefined) || (selectedProject?.id as string | undefined) || "";

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
      const snapshot = { projectId: proj, date: dateStr, note: form.comment ?? "", rows: updated };
      await api<{ ok: boolean }>(`/api/ki/regie/commit/regiebericht`, {
        method: "POST",
        body: JSON.stringify(snapshot),
      });
      await loadHistory();
    } catch (e) {
      console.error(e);
      alert("Die Zeile wurde lokal gelöscht, aber der Server-Speicher konnte nicht aktualisiert werden: " + msg(e));
    }
  }

  /* ===== Foto/Allegati ===== */
  function addPhotos(files: FileList | null) {
    if (!files) return;
    const arr: Datei[] = Array.from(files).map((f) => ({
      id: rid(),
      name: f.name,
      url: URL.createObjectURL(f),
      type: f.type || guessType(f.name),
    }));
    setForm((p) => ({ ...p, photos: [...(p.photos || []), ...arr] }));
  }

  function removePhoto(id: string) {
    setForm((p) => ({
      ...p,
      photos: (p.photos || []).filter((ph) => ph.id !== id),
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
      type: "application/pdf",
    };

    const localRows = parsed.map((r) => {
      const ensuredPos = hasPos(r.lvItemPos) ? String(r.lvItemPos) : nextRegiePos(projectKey);
      return {
        ...r,
        id: rid(),
        lvItemPos: ensuredPos,
        lvItemId: r.lvItemId ?? ensuredPos,
        photos: [attach] as Datei[],
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

  function linkToAufmassLocal(args: { projectId: string; lvPos: string; regieId: string }) {
    const key = `aufmass-links`;
    const map = JSON.parse(localStorage.getItem(key) || "{}");
    const k = `${args.projectId}:${args.lvPos}`;
    map[k] = map[k] || { regieIds: [], lsIds: [] };
    if (!map[k].regieIds.includes(args.regieId)) map[k].regieIds.push(args.regieId);
    localStorage.setItem(key, JSON.stringify(map));
  }

  function ensureRegiePositions(list: RegieRow[], proj: string): { updated: RegieRow[]; created: number } {
    let created = 0;
    const updated = list.map((r) => {
      if (hasPos(r.lvItemPos)) return r;
      created++;
      const pos = nextRegiePos(proj);
      return { ...r, lvItemPos: pos, lvItemId: r.lvItemId ?? pos };
    });
    return { updated, created };
  }

  /* ============================================================
     NEU: REAL AUFMASS EXPORT
     ============================================================ */

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
      r.regieNummer ? `Regie-Nr.: ${r.regieNummer}` : null,
    ].filter(Boolean) as string[];

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
      source: "REGIE",
    };
  }

  async function appendRowsToAufmassServer(projectKey: string, aufmassRows: AufmassAppendRow[]) {
    if (!projectKey) throw new Error("Kein Projekt.");
    if (!aufmassRows.length) return { ok: true as const, appended: 0 };

    const url = `/api/aufmass/soll-ist/${encodeURIComponent(projectKey)}/append`;
    const res = await api<any>(url, { method: "POST", body: JSON.stringify({ rows: aufmassRows }) });

    const appended =
      typeof res?.appended === "number" ? res.appended : Array.isArray(res?.rows) ? res.rows.length : aufmassRows.length;

    return { ok: true as const, appended };
  }

  async function createNachtraegeFromRegie() {
    const projKey =
      (selectedProject?.code as string | undefined) || projectKey || form.projectId || (selectedProject?.id as string | undefined) || "";

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
        const out = await api<{ ok: boolean; created?: any[]; error?: string }>(
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
        rows: draft.rows.map((x) => ({ ...x, pos: String(x.pos || "").trim() })).filter((x) => x.pos.length > 0),
      };

      localStorage.setItem(NACHTRAG_BUFFER_KEY, JSON.stringify(sanitized));

      alert(
        `Nachträge erstellt.\nNeue Position(en): ${created}\nPos-Keys: ${lvPosList.length}\nServer erstellt: ${
          serverCreatedCount == null ? "—" : serverCreatedCount
        }\nDraft lokal: ${sanitized.rows.length}\n(Beispiel: ${sanitized.rows[0]?.pos || "—"})`
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
      projectKey || form.projectId || (selectedProject?.code as string | undefined) || (selectedProject?.id as string | undefined) || "";

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
      ID: r.id ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Regieberichte");
    XLSX.writeFile(wb, `Regieberichte_${projectKey || "ohneProjekt"}.xlsx`);
  }

  /* ===== Render ===== */
  return (
    <div className="page">
      {/* HEADER */}
      <div className="page-header">
        <div>
          <h2 className="page-title" style={{ marginBottom: 4 }}>
            Regieberichte
          </h2>
          <p className="page-subtitle" style={{ margin: 0 }}>
            Inbox → Freigabe → Büro (Final). Regieberichte erfassen, bearbeiten, registrieren, drucken.
          </p>
        </div>

        <div className="page-header-actions" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            id="regieJsonImport"
            type="file"
            accept="application/json"
            style={{ display: "none" }}
            onChange={(e) => handleJsonFileChange(e.target.files)}
          />

          <button className="btn" onClick={openJsonFilePicker} disabled={loading}>
            Regiebericht laden (Datei)
          </button>

          <button
            className="btn"
            onClick={() => void createNachtraegeFromRegie()}
            disabled={!rows.length || !projectKey || loading}
            title="Erstellt neue Positionen (REGIE.###) und erstellt Nachträge am Server + Draft lokal"
          >
            Nachträge erstellen
          </button>

          <button className="btn" onClick={() => void transferToAufmassEditor()} disabled={!rows.length || !projectKey || loading}>
            Ins Aufmaßeditor übertragen
          </button>

          <button className="btn" onClick={reloadActiveTab} disabled={loading || !projectKey}>
            Aktualisieren
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <TabButton active={tab === "INBOX"} onClick={() => setTab("INBOX")}>
          Inbox (Eingereicht) {inboxItems.length ? `• ${inboxItems.length}` : ""}
        </TabButton>
        <TabButton active={tab === "FREIGEGEBEN"} onClick={() => setTab("FREIGEGEBEN")}>
          Freigegeben {approvedItems.length ? `• ${approvedItems.length}` : ""}
        </TabButton>
        <TabButton active={tab === "FINAL"} onClick={() => setTab("FINAL")}>
          Final (Historie) {history.length ? `• ${history.length}` : ""}
        </TabButton>

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>Projekt-ID</span>
          <input value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="z. B. BA-2025-001" style={{ minWidth: 220 }} />
        </div>
      </div>

      {/* BODY */}
      <div
        className="page-body"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(290px, 330px) 1fr",
          gap: 16,
          alignItems: "flex-start",
        }}
      >
        {/* LINKER BLOCK – Form (Büro-Bearbeitung) */}
        <div className="card" style={{ padding: 10 }}>
          <h3 style={{ marginTop: 0, marginBottom: 6 }}>Büro-Bearbeitung</h3>

          {kiImported && (
            <div
              style={{
                margin: "4px 0 8px",
                padding: "6px 10px",
                border: "1px solid #c7f0d8",
                background: "#ecfdf5",
                borderRadius: 8,
                fontSize: 12,
              }}
            >
              <b>{kiImported.count}</b> Position(en) aus KI-Diktat für <b>{kiImported.date}</b> übernommen.
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 6 }}>
            <L label="Berichtstyp">
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", fontSize: 12 }}>
                {[
                  { key: "REGIE", label: "Regiebericht" },
                  { key: "TAGESBERICHT", label: "Tagesbericht" },
                  { key: "BAUTAGEBUCH", label: "Bautagebuch" },
                ].map((t) => {
                  const active = form.reportType === (t.key as ReportType);
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setField("reportType", t.key as ReportType)}
                      className="btn"
                      style={{
                        padding: "2px 8px",
                        fontSize: 11,
                        borderRadius: 999,
                        border: active ? "1px solid var(--primary)" : "1px solid var(--line)",
                        background: active ? "var(--primary-soft)" : "#fff",
                      }}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </L>

            <div style={{ display: "flex", gap: 6 }}>
              <L label="Datum" style={{ flex: 1 }}>
                <input type="date" value={form.date ?? ""} onChange={(e) => setField("date", e.target.value)} />
              </L>
              <L label="Stunden" style={{ width: 110 }}>
                <input type="number" step="0.25" value={form.hours ?? 0} onChange={(e) => setField("hours", Number(e.target.value))} />
              </L>
            </div>

            <L label="Regie-Nr.">
              <input value={form.regieNummer ?? ""} onChange={(e) => setField("regieNummer", e.target.value)} placeholder="z. B. R-001" />
            </L>

            <L label="Auftraggeber / Anschrift" full>
              <input value={form.auftraggeber ?? ""} onChange={(e) => setField("auftraggeber", e.target.value)} />
            </L>

            <L label="Mitarbeiter">
              <input value={form.worker ?? ""} onChange={(e) => setField("worker", e.target.value)} />
            </L>

            <div style={{ display: "flex", gap: 6 }}>
              <L label="Maschine" style={{ flex: 1 }}>
                <input value={form.machine ?? ""} onChange={(e) => setField("machine", e.target.value)} />
              </L>
              <L label="Material" style={{ flex: 1 }}>
                <input value={form.material ?? ""} onChange={(e) => setField("material", e.target.value)} />
              </L>
            </div>

            <div style={{ display: "flex", gap: 6 }}>
              <L label="Menge" style={{ flex: 1 }}>
                <input type="number" step="0.01" value={form.quantity ?? 0} onChange={(e) => setField("quantity", Number(e.target.value))} />
              </L>
              <L label="Einheit" style={{ width: 100 }}>
                <input value={form.unit ?? ""} onChange={(e) => setField("unit", e.target.value)} />
              </L>
            </div>

            <L label="LV-Position (ID)">
              <input
                value={form.lvItemId ?? ""}
                onChange={(e) => setField("lvItemId", e.target.value)}
                placeholder={form.lvItemPos ? `Pos: ${form.lvItemPos}` : "optional"}
              />
            </L>

            <div style={{ display: "flex", gap: 6 }}>
              <L label="Arbeitsbeginn" style={{ flex: 1 }}>
                <input value={form.arbeitsbeginn ?? ""} onChange={(e) => setField("arbeitsbeginn", e.target.value)} placeholder="z. B. 07:00" />
              </L>
              <L label="Arbeitsende" style={{ flex: 1 }}>
                <input value={form.arbeitsende ?? ""} onChange={(e) => setField("arbeitsende", e.target.value)} placeholder="z. B. 16:00" />
              </L>
            </div>

            <div style={{ display: "flex", gap: 6 }}>
              <L label="Pause 1" style={{ flex: 1 }}>
                <input value={form.pause1 ?? ""} onChange={(e) => setField("pause1", e.target.value)} placeholder="z. B. 09:00–09:15" />
              </L>
              <L label="Pause 2" style={{ flex: 1 }}>
                <input value={form.pause2 ?? ""} onChange={(e) => setField("pause2", e.target.value)} placeholder="optional" />
              </L>
            </div>

            <div style={{ display: "flex", gap: 6 }}>
              <L label="Blatt Nr." style={{ flex: 1 }}>
                <input value={form.blattNr ?? ""} onChange={(e) => setField("blattNr", e.target.value)} />
              </L>
              <L label="Wetter" style={{ flex: 1 }}>
                <input value={form.wetter ?? ""} onChange={(e) => setField("wetter", e.target.value)} placeholder="z. B. sonnig, 18°C" />
              </L>
            </div>

            <L label="Kostenstelle">
              <input value={form.kostenstelle ?? ""} onChange={(e) => setField("kostenstelle", e.target.value)} placeholder="z. B. 100-BA-01" />
            </L>

            <L label="Beschreibung" full>
              <textarea
                value={form.comment ?? ""}
                onChange={(e) => setField("comment", e.target.value)}
                style={{ height: 80, resize: "vertical" }}
                placeholder="Ausführliche Beschreibung / Bemerkung…"
              />
            </L>

            <L label="Bemerkungen (PDF-Feld unten)" full>
              <textarea
                value={form.bemerkungen ?? ""}
                onChange={(e) => setField("bemerkungen", e.target.value)}
                style={{ height: 60, resize: "vertical" }}
                placeholder="Bemerkungen für das untere Feld im Regiebericht…"
              />
            </L>

            <L label="Foto/Anhang (Bilder & PDF)">
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  id="regiePhotos"
                  type="file"
                  multiple
                  accept="image/*,.pdf,.heic,.heif"
                  onChange={(e) => addPhotos(e.target.files)}
                  style={{ display: "none" }}
                />
                <label htmlFor="regiePhotos" className="btn">
                  Dateien wählen
                </label>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {(form.photos || []).map((ph) => (
                    <div
                      key={ph.id}
                      style={{
                        position: "relative",
                        border: "1px solid var(--line)",
                        borderRadius: 10,
                        overflow: "hidden",
                        width: 90,
                        height: 90,
                        background: "#fafafa",
                      }}
                    >
                      {isImg(ph.type) ? (
                        <img
                          src={ph.url}
                          alt={ph.name}
                          onClick={() => setPreviewUrl(ph.url)}
                          style={{ width: "100%", height: "100%", objectFit: "cover", cursor: "zoom-in" }}
                        />
                      ) : isPdf(ph.type) ? (
                        <a
                          href={ph.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            display: "grid",
                            placeItems: "center",
                            width: "100%",
                            height: "100%",
                            fontSize: 12,
                            textDecoration: "underline",
                          }}
                        >
                          PDF
                        </a>
                      ) : (
                        <a
                          href={ph.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            display: "grid",
                            placeItems: "center",
                            width: "100%",
                            height: "100%",
                            fontSize: 11,
                          }}
                        >
                          FILE
                        </a>
                      )}

                      <button onClick={() => removePhoto(ph.id)} className="btn" style={{ position: "absolute", top: 4, right: 4, padding: "0 6px" }}>
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </L>

            <div style={{ display: "flex", gap: 6, marginTop: 2, flexWrap: "wrap" }}>
              <button className="btn" onClick={save} disabled={loading}>
                {form.id ? "Änderungen speichern" : "Eintrag anlegen (Snapshot)"}
              </button>
              <button className="btn" onClick={() => clearForm(true)} disabled={loading}>
                Formular leeren
              </button>
              <button className="btn" onClick={loadByDate} disabled={loading}>
                Neu laden (Datum)
              </button>
            </div>

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
              <button className="btn" onClick={exportXlsx} disabled={loading}>
                Export XLSX
              </button>
              <button className="btn" onClick={() => void exportPdf(false)} disabled={loading}>
                Export PDF
              </button>
              <button className="btn" onClick={() => void exportPdf(true)} disabled={loading}>
                PDF Vorschau
              </button>
            </div>

            <button
              className="btn"
              style={{ marginTop: 4 }}
              onClick={() => void saveReportToServer()}
              disabled={!rows.length || !projectKey || loading}
              title="Legacy snapshot speichern (mit Fotos als base64)"
            >
              Regiebericht speichern (Snapshot)
            </button>

            <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
              <input id="regieImport" type="file" accept="application/pdf" onChange={(e) => void importPdfRegie(e.target.files)} style={{ display: "none" }} />
              <label htmlFor="regieImport" className="btn">
                Import PDF
              </label>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>Extrahiert: Datum, Mitarbeiter, Stunden, Material, Menge, Einheit, Pos.</span>
            </div>

            {error && <div style={{ color: "crimson", marginTop: 4 }}>{error}</div>}
          </div>
        </div>

        {/* RECHTER BLOCK */}
        <div style={{ display: "grid", gap: 10 }}>
          {/* PDF + Liste */}
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 10, alignItems: "stretch" }}>
            <div className="card" style={{ padding: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <strong>PDF Vorschau</strong>
                <span style={{ fontSize: 11, color: "var(--muted)" }}>{pdfUrl ? "" : "Noch kein PDF geladen"}</span>
              </div>
              {pdfUrl ? (
                <iframe src={pdfUrl} style={{ width: "100%", height: 230, border: "1px solid var(--line)", borderRadius: 8 }} />
              ) : (
                <div
                  style={{
                    height: 230,
                    border: "1px dashed var(--line)",
                    borderRadius: 8,
                    display: "grid",
                    placeItems: "center",
                    fontSize: 12,
                    color: "var(--muted)",
                  }}
                >
                  Regiebericht wählen oder erzeugen…
                </div>
              )}
            </div>

            <div className="card" style={{ padding: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <strong>{tab === "INBOX" ? "Inbox (Eingereicht)" : tab === "FREIGEGEBEN" ? "Freigegeben" : "Final (Historie)"}</strong>
                <span style={{ fontSize: 11, color: "var(--muted)" }}>
                  {tab === "INBOX"
                    ? `${inboxItems.length} Eintrag(e)`
                    : tab === "FREIGEGEBEN"
                    ? `${approvedItems.length} Eintrag(e)`
                    : `${history.length} Eintrag(e)`}
                </span>
              </div>

              <div style={{ maxHeight: 230, overflowY: "auto", paddingRight: 4 }}>
                {!projectKey ? (
                  <div style={{ fontSize: 12, color: "var(--muted)", padding: "4px 2px" }}>Projekt-ID eingeben.</div>
                ) : tab === "FINAL" ? (
                  history.length === 0 ? (
                    <div style={{ fontSize: 12, color: "var(--muted)", padding: "4px 2px" }}>Noch keine Regieberichte gespeichert.</div>
                  ) : (
                    history.map((h) => (
                      <div
                        key={h.filename}
                        style={{ padding: "6px 4px", borderBottom: "1px solid var(--line)", display: "flex", gap: 6, alignItems: "flex-start" }}
                      >
                        <div style={{ flex: 1, fontSize: 12 }}>
                          <div style={{ fontWeight: 600 }}>
                            {h.date}{" "}
                            {h.savedAt ? `, ${new Date(h.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
                          </div>
                          <div style={{ color: "var(--muted)", marginTop: 2 }}>{h.rows} Position(en)</div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <button className="btn" style={{ fontSize: 11, padding: "2px 6px" }} onClick={() => void loadSavedReportItem(h)}>
                            Laden
                          </button>
                          {h.pdfUrl && (
                            <a className="btn" style={{ fontSize: 11, padding: "2px 6px", textAlign: "center" }} href={h.pdfUrl} target="_blank" rel="noreferrer">
                              PDF
                            </a>
                          )}
                        </div>
                      </div>
                    ))
                  )
                ) : tab === "INBOX" ? (
                  inboxItems.length === 0 ? (
                    <div style={{ fontSize: 12, color: "var(--muted)", padding: "4px 2px" }}>Keine Inbox-Einträge.</div>
                  ) : (
                    inboxItems.map((it) => (
                      <div key={it.id} style={{ padding: "6px 4px", borderBottom: "1px solid var(--line)", display: "flex", gap: 6, alignItems: "flex-start" }}>
                        <div style={{ flex: 1, fontSize: 12 }}>
                          <div style={{ fontWeight: 600 }}>
                            {it.date || "—"} • {it.rowsCount ?? "?"} Pos.
                          </div>
                          <div style={{ color: "var(--muted)", marginTop: 2 }}>
                            Status: {it.workflowStatus} • ID: {it.id.slice(0, 8)}
                          </div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <button className="btn" style={{ fontSize: 11, padding: "2px 6px" }} onClick={() => void loadWorkflowDoc("inbox", it.id)}>
                            Öffnen
                          </button>
                          <button className="btn" style={{ fontSize: 11, padding: "2px 6px" }} onClick={() => void approveInbox(it.id)}>
                            Freigeben
                          </button>
                          <button className="btn" style={{ fontSize: 11, padding: "2px 6px" }} onClick={() => void rejectInbox(it.id)}>
                            Ablehnen
                          </button>
                        </div>
                      </div>
                    ))
                  )
                ) : approvedItems.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--muted)", padding: "4px 2px" }}>Keine freigegebenen Einträge.</div>
                ) : (
                  approvedItems.map((it) => (
                    <div key={it.id} style={{ padding: "6px 4px", borderBottom: "1px solid var(--line)", display: "flex", gap: 6, alignItems: "flex-start" }}>
                      <div style={{ flex: 1, fontSize: 12 }}>
                        <div style={{ fontWeight: 600 }}>
                          {it.date || "—"} • {it.rowsCount ?? "?"} Pos.
                        </div>
                        <div style={{ color: "var(--muted)", marginTop: 2 }}>
                          Status: {it.workflowStatus} • ID: {it.id.slice(0, 8)}
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <button className="btn" style={{ fontSize: 11, padding: "2px 6px" }} onClick={() => void loadWorkflowDoc("freigegeben", it.id)}>
                          Öffnen
                        </button>
                        <button className="btn" style={{ fontSize: 11, padding: "2px 6px" }} onClick={() => void registerApproved(it.id)}>
                          Registrieren
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Tabelle Übersicht */}
          <div className="card" style={{ padding: 0 }}>
            <div
              style={{
                padding: "8px 10px",
                borderBottom: "1px solid var(--line)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 14 }}>Editor: Übersicht (geladener Bericht)</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>{rows.length} Eintrag(e)</div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <Th>Datum</Th>
                    <Th>Typ</Th>
                    <Th>Regie-Nr.</Th>
                    <Th>Mitarbeiter</Th>
                    <Th>Std</Th>
                    <Th>Maschine</Th>
                    <Th>Material</Th>
                    <Th>Menge</Th>
                    <Th>Einheit</Th>
                    <Th>Pos (REGIE/LV)</Th>
                    <Th>Beschreibung</Th>
                    <Th>Anhänge</Th>
                    <Th></Th>
                  </tr>
                </thead>

                <tbody ref={tableRef}>
                  {rows.length === 0 ? (
                    <tr>
                      <Td colSpan={13} style={{ textAlign: "center" }}>
                        {projectKey ? "Kein Bericht geladen (rechts auswählen)" : "Projekt-ID eingeben"}
                      </Td>
                    </tr>
                  ) : (
                    rows.map((r, i) => {
                      const isSelected = selIdx === i;
                      const isFlash = flashId && String(r.id) === String(flashId);

                      return (
                        <tr
                          key={r.id ?? `r-${i}`}
                          data-row-id={r.id || `r-${i}`}
                          style={{
                            background: isSelected ? "rgba(0,0,0,0.04)" : isFlash ? "rgba(34,197,94,0.15)" : undefined,
                            transition: "background .6s ease",
                          }}
                        >
                          <Td>{r.date}</Td>
                          <Td>{r.reportType === "TAGESBERICHT" ? "Tagesbericht" : r.reportType === "BAUTAGEBUCH" ? "Bautagebuch" : "Regiebericht"}</Td>
                          <Td>{r.regieNummer}</Td>
                          <Td>{r.worker}</Td>
                          <Td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{num(r.hours)}</Td>
                          <Td>{r.machine}</Td>
                          <Td>{r.material}</Td>
                          <Td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{num(r.quantity)}</Td>
                          <Td>{r.unit}</Td>
                          <Td>{r.lvItemPos ?? ""}</Td>
                          <Td style={{ maxWidth: 380, whiteSpace: "pre-wrap" }}>{r.comment}</Td>

                          <Td>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", maxWidth: 200 }}>
                              {(r.photos || []).slice(0, 4).map((ph) => (
                                <a
                                  key={ph.id}
                                  href={ph.url}
                                  onClick={(e) => {
                                    if (isImg(ph.type)) {
                                      e.preventDefault();
                                      setPreviewUrl(ph.url);
                                    }
                                  }}
                                  rel="noreferrer"
                                  style={{
                                    display: "block",
                                    width: 46,
                                    height: 46,
                                    border: "1px solid var(--line)",
                                    borderRadius: 8,
                                    overflow: "hidden",
                                  }}
                                >
                                  {isImg(ph.type) ? (
                                    <img src={ph.url} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                  ) : (
                                    <div style={{ fontSize: 10, display: "grid", placeItems: "center", height: "100%" }}>{isPdf(ph.type) ? "PDF" : "FILE"}</div>
                                  )}
                                </a>
                              ))}
                              {(r.photos?.length || 0) > 4 && <span style={{ fontSize: 11, opacity: 0.7 }}>+{r.photos!.length - 4}</span>}
                            </div>
                          </Td>

                          <Td>
                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                              <button className="btn" onClick={() => void saveRowToServer(r)} style={{ fontSize: 11, padding: "2px 6px" }} disabled={loading}>
                                Speichern
                              </button>
                              <button className="btn" onClick={() => select(i)} style={{ fontSize: 11, padding: "2px 6px" }} disabled={loading}>
                                Bearbeiten
                              </button>
                              <button className="btn" onClick={() => void del(r, i)} style={{ fontSize: 11, padding: "2px 6px" }} disabled={loading}>
                                Löschen
                              </button>

                              <button className="btn" onClick={() => void exportSingleRowPdf(r, false)} style={{ fontSize: 11, padding: "2px 6px" }} title="Nur diese Zeile als PDF" disabled={loading}>
                                PDF
                              </button>
                              <button className="btn" onClick={() => void exportSingleRowPdf(r, true)} style={{ fontSize: 11, padding: "2px 6px" }} title="Vorschau: nur diese Zeile" disabled={loading}>
                                PDF Vorschau
                              </button>
                            </div>
                          </Td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* LIGHTBOX */}
      {previewUrl && (
        <div
          onClick={() => setPreviewUrl(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.6)",
            display: "grid",
            placeItems: "center",
            zIndex: 9999,
          }}
        >
          <img
            src={previewUrl}
            style={{
              maxWidth: "98vw",
              maxHeight: "98vh",
              borderRadius: 12,
              boxShadow: "0 10px 30px rgba(0,0,0,.5)",
            }}
          />
        </div>
      )}
    </div>
  );
}

/* ===== UI helpers ===== */
function TabButton(props: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      className="btn"
      onClick={props.onClick}
      style={{
        padding: "4px 10px",
        borderRadius: 999,
        border: props.active ? "1px solid var(--primary)" : "1px solid var(--line)",
        background: props.active ? "var(--primary-soft)" : "#fff",
        fontSize: 12,
      }}
    >
      {props.children}
    </button>
  );
}

function L(props: React.PropsWithChildren<{ label: string; full?: boolean; style?: React.CSSProperties }>) {
  return (
    <label
      style={{
        display: "grid",
        gridTemplateColumns: props.full ? "1fr" : "110px 1fr",
        gap: 4,
        alignItems: "center",
        ...props.style,
      }}
    >
      <span style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.2 }}>{props.label}</span>
      <div>{props.children}</div>
    </label>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        textAlign: "left",
        padding: "6px 8px",
        borderBottom: "1px solid var(--line)",
        fontSize: 12,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}

function Td(props: React.HTMLAttributes<HTMLTableCellElement> & { children?: React.ReactNode }) {
  const { children, style, ...rest } = props;
  return (
    <td
      {...rest}
      style={{
        padding: "6px 8px",
        borderBottom: "1px solid var(--line)",
        verticalAlign: "top",
        fontSize: 12,
        ...style,
      }}
    >
      {children}
    </td>
  );
}
