import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/mengenermittlung/Lieferscheine.tsx
import React from "react";
import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";
import { useProject } from "../../store/useProject";
import { useNavigate } from "react-router-dom";
import MengPageHeader from "./MengPageHeader";

/* ===== Tipi ===== */
type Datei = {id: string;name: string;url: string;type: string;};

type WorkflowStatus = "DRAFT" | "EINGEREICHT" | "FREIGEGEBEN" | "ABGELEHNT";

type LsRow = {
  id?: string; // docId
  projectId: string;

  date?: string; // yyyy-mm-dd
  lieferscheinNummer?: string;

  supplier?: string; // Lieferant
  site?: string; // Baustelle
  driver?: string; // Fahrer
  material?: string;
  quantity?: number;
  unit?: string;

  kostenstelle?: string;
  lvItemPos?: string | null;

  comment?: string; // Beschreibung / Text
  bemerkungen?: string; // Feld "Bemerkungen" im PDF

  photos?: Datei[]; // UI field
  attachments?: Datei[]; // server field (compat)

  workflowStatus?: WorkflowStatus;
  submittedAt?: number | null;
  approvedAt?: number | null;
  rejectedAt?: number | null;
  rejectReason?: string | null;

  projectCode?: string;
};

type LsHistoryItem = {
  date: string;
  filename: string;
  rows: number;
  savedAt?: string;
  pdfUrl?: string | null;
  workflowStatus?: WorkflowStatus;
};

/* ===== Utils ===== */
const rid = () =>
// @ts-ignore
crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

const STATE_STORAGE_KEY = "rlc-lieferscheine-state-v3";

const API_ORIGIN =
(import.meta as any)?.env?.VITE_BACKEND_URL ||
(import.meta as any)?.env?.VITE_API_ORIGIN ||
"https://api.rlcbausoftware.com";

const API_BASE = `${String(API_ORIGIN).replace(/\/$/, "")}/api`;
const PROJECTS_BASE = `${String(API_ORIGIN).replace(/\/$/, "")}/projects`;

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


      // Alte ungültige Auth-Daten ignorieren.
    }}
  return {};
}

function apiUrl(pathOrUrl: string) {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const normalized = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${API_BASE}${normalized}`;
}

function publicUrl(pathOrUrl: string) {
  if (/^(https?:\/\/|blob:|data:|file:)/i.test(pathOrUrl)) return pathOrUrl;
  const normalized = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${String(API_ORIGIN).replace(/\/$/, "")}${normalized}`;
}

async function readApiPayload(res: Response): Promise<any> {
  const text = await res.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
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

async function apiForm<T>(path: string, fd: FormData): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    body: fd,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...authHeaders()
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

function today() {
  return new Date().toISOString().slice(0, 10);
}

function num(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ?
  n.toLocaleString(undefined, { maximumFractionDigits: 2 }) :
  "";
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

/** URL → dataURL (JPEG), se possibile */
async function urlToDataURL(
url: string,
preferType = "image/jpeg")
: Promise<string | null> {
  try {
    const res = await fetch(url);
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

/* ===== Parser semplice Lieferschein dal testo ===== */
function parseLsFromText(txt: string, defaults: {projectId: string;}): LsRow[] {
  const date = (
  txt.match(
    /Datum[:\s]*([0-9]{2}\.[0-9]{2}\.[0-9]{4}|[0-9]{4}-[0-9]{2}-[0-9]{2})/i
  )?.[1] ?? today()).
  replace(/(\d{2})\.(\d{2})\.(\d{4})/, "$3-$2-$1");

  const supplier =
  txt.match(/(Lieferant|Firma)[:\s]*([^\n]+)/i)?.[2]?.trim() ?? "";
  const site =
  txt.match(/(Baustelle|Projekt)[:\s]*([^\n]+)/i)?.[2]?.trim() ?? "";
  const driver =
  txt.match(/(Fahrer|Driver)[:\s]*([^\n]+)/i)?.[2]?.trim() ?? "";

  const material = txt.match(/Material[:\s]*([^\n]+)/i)?.[1]?.trim();
  const qty = Number(
    (txt.match(/(Menge|Quantity)[:\s]*([0-9]+(?:[.,][0-9]+)?)/i)?.[2] ?? "0").replace(
      ",",
      "."
    )
  );
  const unit =
  txt.match(/(Einheit|Unit)[:\s]*([A-Za-zÄÖÜäöüß]+)/i)?.[2]?.trim() ?? "";

  const comment =
  txt.match(/(Bemerkung|Hinweis|Notiz)[:\s]*([^\n]+)/i)?.[2]?.trim() ?? "";

  const lvPos =
  txt.match(/(LV[\s-]*Pos|Pos\.?)[:\s]*([A-Za-z0-9.\-]+)/i)?.[2]?.trim() ??
  null;

  const lsNr =
  txt.match(/(Lieferschein[-\s]*Nr\.?|Nr\.)[:\s]*([A-Za-z0-9\-\/]+)/i)?.[2]?.trim() ??
  "";

  return [
  {
    projectId: defaults.projectId,
    date,
    supplier,
    site,
    driver,
    material,
    quantity: qty,
    unit,
    comment,
    lvItemPos: lvPos,
    lieferscheinNummer: lsNr,
    workflowStatus: "DRAFT"
  }];

}

function normalizeStatus(s?: any): WorkflowStatus {
  const raw = String(s ?? "").trim();
  if (!raw) return "DRAFT";
  const u = raw.toUpperCase();

  if (u === "FREIGEGEBEN" || u.includes("FREIG") || u.includes("APPROV")) return "FREIGEGEBEN";
  if (u === "EINGEREICHT" || u.includes("EINGEREICH") || u.includes("SUBMIT") || u.includes("REVIEW"))
  return "EINGEREICHT";
  if (u === "ABGELEHNT" || u.includes("ABLEHN") || u.includes("REJECT")) return "ABGELEHNT";
  if (u === "DRAFT" || u === "ENTWURF" || u.includes("DRAFT") || u.includes("ENTWURF")) return "DRAFT";

  return "DRAFT";
}

function normalizeServerRow(r: any, projectId: string): LsRow {
  const photosRaw = Array.isArray(r?.photos) ? r.photos : [];
  const attRaw = Array.isArray(r?.attachments) ? r.attachments : [];

  const mapped = (list: any[]) =>
  list.map((ph: any) => ({
    id: String(ph?.id || rid()),
    name: String(ph?.name || ph?.originalname || "Datei"),
    type: String(ph?.type || guessType(String(ph?.name || "file"))),
    url: String(ph?.url || ph?.publicUrl || "")
  }));

  const photos = mapped(photosRaw.length ? photosRaw : attRaw);

  return {
    ...r,
    projectId: String(r?.projectId || projectId),
    id: String(r?.id || r?.docId || ""),
    date: r?.date ? String(r.date).slice(0, 10) : undefined,
    workflowStatus: normalizeStatus(r?.workflowStatus),
    photos,
    attachments: photos
  };
}

/* ===== COMPONENT ===== */
type Tab = "INBOX" | "FREIGEGEBEN" | "FINAL";

export default function Lieferscheine() {
  const { getSelectedProject } = useProject();
  const selectedProject = getSelectedProject();
  const navigate = useNavigate();

  // IMPORTANT: use FS-key if available (BA-....)
  const [projectId, setProjectId] = React.useState<string>(
    selectedProject?.code || selectedProject?.id as string | undefined || ""
  );

  // ✅ Routes laut App.tsx
  const PATH_BUERO = "/buro/projekte";
  const PATH_BUCHHALTUNG = "/buchhaltung/kostenuebersicht";


  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = React.useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);

  // server-driven lists
  const [inboxRows, setInboxRows] = React.useState<LsRow[]>([]);
  const [freigegebenRows, setFreigegebenRows] = React.useState<LsRow[]>([]);
  const [history, setHistory] = React.useState<LsHistoryItem[]>([]);

  // selection/edit form
  const [tab, setTab] = React.useState<Tab>("INBOX");
  const [selKey, setSelKey] = React.useState<string | null>(null);

  const [form, setForm] = React.useState<LsRow>({
    projectId: projectId || "",
    date: today(),
    photos: [],
    workflowStatus: "DRAFT"
  });

  // reject modal
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectText, setRejectText] = React.useState("");

  // upload staging (browser)
  const [pendingUploadFiles, setPendingUploadFiles] = React.useState<FileList | null>(null);

  // FINAL preview (single loaded history file)
  const [finalPreview, setFinalPreview] = React.useState<{
    date: string;
    filename: string;
    rows: LsRow[];
  } | null>(null);

  // keep form.projectId coherent
  React.useEffect(() => {
    setForm((p) => ({ ...p, projectId }));
  }, [projectId]);

  /* ===== persist small UI state only ===== */
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(STATE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {projectId?: string;tab?: Tab;};
      if (parsed.projectId) setProjectId(parsed.projectId);
      if (parsed.tab) setTab(parsed.tab);
    } catch {

      /* ignore */}
  }, []);

  React.useEffect(() => {
    try {
      localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify({ projectId, tab }));
    } catch {

      /* ignore */}
  }, [projectId, tab]);

  /* ============================================================
     LOADERS
     - Inbox:     /ls/inbox/list
     - Freig.:    /ls/freigegeben/list  (fallback se non esiste)
     - History:   /ls/list
     ============================================================ */

  const loadInbox = React.useCallback(async () => {
    if (!projectId) {
      setInboxRows([]);
      return;
    }
    const res = await api<any>(`/ls/inbox/list?projectId=${encodeURIComponent(projectId)}`);
    const items = Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [];
    const normalized = items.
    map((r: any) => normalizeServerRow(r, projectId)).
    filter((r: LsRow) => !!r.id);

    const inbox = normalized.filter((r: LsRow) => {
      const st = normalizeStatus(r.workflowStatus);
      return st === "DRAFT" || st === "EINGEREICHT" || st === "ABGELEHNT";
    });

    inbox.sort((a: LsRow, b: LsRow) => String(b.date || "").localeCompare(String(a.date || "")));
    setInboxRows(inbox);
  }, [projectId]);

  const loadFreigegeben = React.useCallback(async () => {
    if (!projectId) {
      setFreigegebenRows([]);
      return;
    }

    // 1) Try dedicated endpoint (recommended)
    try {
      const res = await api<any>(`/ls/freigegeben/list?projectId=${encodeURIComponent(projectId)}`);
      const items = Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [];
      const normalized = items.
      map((r: any) => normalizeServerRow(r, projectId)).
      filter((r: LsRow) => !!r.id).
      map((r: LsRow) => ({ ...r, workflowStatus: "FREIGEGEBEN" as WorkflowStatus }));

      normalized.sort((a: LsRow, b: LsRow) => String(b.date || "").localeCompare(String(a.date || "")));
      setFreigegebenRows(normalized);
      return;
    } catch (e) {


      // fallthrough to fallback
    } // 2) Fallback: if server keeps approved items inside inbox/list
    try {
      const res = await api<any>(`/ls/inbox/list?projectId=${encodeURIComponent(projectId)}`);
      const items = Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [];
      const normalized = items.
      map((r: any) => normalizeServerRow(r, projectId)).
      filter((r: LsRow) => !!r.id);

      const freig = normalized.filter((r: LsRow) => normalizeStatus(r.workflowStatus) === "FREIGEGEBEN");
      freig.sort((a: LsRow, b: LsRow) => String(b.date || "").localeCompare(String(a.date || "")));
      setFreigegebenRows(freig);
    } catch {
      setFreigegebenRows([]);
    }
  }, [projectId]);

  const loadHistory = React.useCallback(async () => {
    if (!projectId) {
      setHistory([]);
      return;
    }
    try {
      const res = await api<{ok: boolean;items: LsHistoryItem[];}>(
        `/ls/list?projectId=${encodeURIComponent(projectId)}`
      );
      setHistory(res?.items || []);
    } catch {
      setHistory([]);
    }
  }, [projectId]);

  const loadAll = React.useCallback(async () => {
    await Promise.allSettled([loadInbox(), loadFreigegeben(), loadHistory()]);
  }, [loadInbox, loadFreigegeben, loadHistory]);

  React.useEffect(() => {
    loadAll();
  }, [loadAll]);

  function setField<K extends keyof LsRow>(k: K, v: LsRow[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function clearForm() {
    setSelKey(null);
    setForm({
      projectId,
      date: today(),
      lieferscheinNummer: "",
      supplier: "",
      site: "",
      driver: "",
      material: "",
      quantity: 0,
      unit: "",
      kostenstelle: "",
      lvItemPos: "",
      comment: "",
      bemerkungen: "",
      photos: [],
      attachments: [],
      workflowStatus: "DRAFT",
      rejectReason: null,
      submittedAt: null,
      approvedAt: null,
      rejectedAt: null
    });
    setPendingUploadFiles(null);
  }

  function selectRow(r: LsRow) {
    setSelKey(String(r.id || ""));
    setForm({
      id: r.id,
      projectId: r.projectId || projectId,
      date: r.date ?? today(),
      lieferscheinNummer: r.lieferscheinNummer ?? "",
      supplier: r.supplier ?? "",
      site: r.site ?? "",
      driver: r.driver ?? "",
      material: r.material ?? "",
      quantity: r.quantity ?? 0,
      unit: r.unit ?? "",
      kostenstelle: r.kostenstelle ?? "",
      lvItemPos: r.lvItemPos ?? null,
      comment: r.comment ?? "",
      bemerkungen: r.bemerkungen ?? "",
      photos: (r.photos || r.attachments || []) as any,
      attachments: (r.photos || r.attachments || []) as any,
      workflowStatus: normalizeStatus(r.workflowStatus),
      submittedAt: r.submittedAt ?? null,
      approvedAt: r.approvedAt ?? null,
      rejectedAt: r.rejectedAt ?? null,
      rejectReason: r.rejectReason ?? null
    });
    setPendingUploadFiles(null);
  }

  /* ===== API: server workflow ===== */

  async function submitInboxCreate(base: LsRow): Promise<{docId: string;}> {
    const payload = {
      ...base,
      projectId,
      projectCode: projectId,
      workflowStatus: normalizeStatus(base.workflowStatus),
      date: String(base.date || today()).slice(0, 10)
    };
    const res = await api<any>(`/ls`, { method: "POST", body: JSON.stringify(payload) });
    const docId = String(res?.docId || res?.id || "").trim();
    if (!docId) throw new Error("Server-Submit fehlgeschlagen: docId fehlt.");
    return { docId };
  }

  async function updateInboxMeta(docId: string, nextMeta: any, files?: FileList | null) {
    const fd = new FormData();
    fd.append("projectId", projectId);
    fd.append("docId", docId);
    fd.append("meta", JSON.stringify(nextMeta || {}));
    if (files && files.length) Array.from(files).forEach((f) => fd.append("files", f));
    return apiForm<any>(`/ls/inbox/upload`, fd);
  }

  async function submitRowServer() {
    if (!projectId) return alert("Bitte Projekt-ID eingeben.");
    if (!form.id) return alert("Bitte zuerst speichern/anlegen, damit eine ID vorhanden ist.");

    const docId = String(form.id);
    try {
      setError(null);
      setLoading(true);

      const now = Date.now();
      const nextMeta = {
        ...form,
        id: docId,
        projectId,
        projectCode: projectId,
        workflowStatus: "EINGEREICHT" as WorkflowStatus,
        submittedAt: form.submittedAt || now,
        photos: undefined,
        attachments: undefined
      };

      await updateInboxMeta(docId, nextMeta, null);
      await loadAll();
      setTab("INBOX");
    } catch (e: any) {
      setError(msg(e));
    } finally {
      setLoading(false);
    }
  }

  async function approveRowServer(r: LsRow) {
    const docId = String(r.id || "");
    if (!docId) return;

    try {
      setError(null);
      setLoading(true);

      await api<any>(`/ls/inbox/approve`, {
        method: "POST",
        body: JSON.stringify({ projectId, docId })
      });

      await loadAll();
      clearForm();
      setTab("INBOX");
    } catch (e: any) {
      setError(msg(e));
    } finally {
      setLoading(false);
    }
  }

  function requestReject(r: LsRow) {
    setRejectText(r.rejectReason || "");
    setRejectOpen(true);
    selectRow(r);
  }

  async function confirmReject() {
    const docId = String(form.id || "");
    if (!docId) return setRejectOpen(false);
    const reason = (rejectText || "").trim();

    try {
      setError(null);
      setLoading(true);

      await api<any>(`/ls/inbox/reject`, {
        method: "POST",
        body: JSON.stringify({ projectId, docId, reason })
      });

      await loadAll();
      setRejectOpen(false);
      setTab("INBOX");
    } catch (e: any) {
      setError(msg(e));
    } finally {
      setLoading(false);
    }
  }

  async function saveToServerDraft() {
    if (!projectId) return alert("Bitte Projekt-ID eingeben.");

    try {
      setError(null);
      setLoading(true);

      const base: LsRow = {
        ...form,
        projectId,
        date: String(form.date || today()).slice(0, 10),
        workflowStatus: normalizeStatus(form.workflowStatus) || "DRAFT"
      };

      // create new doc
      if (!base.id) {
        const { docId } = await submitInboxCreate(base);

        const meta = {
          ...base,
          id: docId,
          projectId,
          projectCode: projectId,
          workflowStatus: base.workflowStatus
        };

        await updateInboxMeta(
          docId,
          meta,
          pendingUploadFiles && pendingUploadFiles.length ? pendingUploadFiles : null
        );
        setPendingUploadFiles(null);

        await loadAll();
        setForm((p) => ({ ...p, id: docId }));
        setSelKey(docId);
        setTab("INBOX");
        return;
      }

      // update existing doc
      const docId = String(base.id);
      const meta = {
        ...base,
        id: docId,
        projectId,
        projectCode: projectId,
        workflowStatus: base.workflowStatus,
        rejectReason: base.rejectReason ?? null
      };

      await updateInboxMeta(docId, meta, pendingUploadFiles);
      setPendingUploadFiles(null);

      await loadAll();
      setTab(normalizeStatus(base.workflowStatus) === "FREIGEGEBEN" ? "FREIGEGEBEN" : "INBOX");
    } catch (e: any) {
      setError(msg(e));
    } finally {
      setLoading(false);
    }
  }

  /* ===== Freigegeben -> Final (Historie) =====
     Expect server endpoint: POST /api/ls/save
     Suggested payload: { projectId }
     Optionally: { projectId, rows } if your server needs it
  */
  async function saveFreigegebenToFinal() {
    if (!projectId) return alert("Bitte Projekt-ID eingeben.");
    try {
      setError(null);
      setLoading(true);

      // try with rows (more robust)
      await api<any>(`/ls/save`, {
        method: "POST",
        body: JSON.stringify({
          projectId,
          rows: freigegebenRows
        })
      });

      await loadHistory();
      alert("Freigegeben gespeichert (Final/Historie aktualisiert).");
    } catch (e1: any) {
      // fallback without rows if server expects only projectId
      try {
        await api<any>(`/ls/save`, {
          method: "POST",
          body: JSON.stringify({ projectId })
        });
        await loadHistory();
        alert("Freigegeben gespeichert (Final/Historie aktualisiert).");
      } catch (e2: any) {
        setError(msg(e2));
      }
    } finally {
      setLoading(false);
    }
  }

  /* ===== Commit ONE Freigegeben -> Final (move single doc) ===== */
  async function commitOneFreigegebenToFinal(row: LsRow) {
    if (!projectId) return alert("Bitte Projekt-ID eingeben.");
    const docId = String(row.id || form.id || "");
    if (!docId) return alert("docId fehlt.");

    try {
      setError(null);
      setLoading(true);

      // 1) Save meta (use FORM as "latest edits" if currently editing same doc)
      const meta = {
        ...form,
        id: docId,
        projectId,
        projectCode: projectId,
        workflowStatus: "FREIGEGEBEN" as WorkflowStatus,
        photos: undefined,
        attachments: undefined
      };

      await updateInboxMeta(docId, meta, pendingUploadFiles);
      setPendingUploadFiles(null);

      // 2) Commit/move single file if endpoint exists
      try {
        await api(`/ls/freigegeben/commit`, {
          method: "POST",
          body: JSON.stringify({ projectId, docId })
        });
      } catch {
        // fallback: save with rows (server might only implement /ls/save)
        await api<any>(`/ls/save`, {
          method: "POST",
          body: JSON.stringify({ projectId, rows: [normalizeServerRow(meta, projectId)] })
        });
      }

      // 3) Reload lists + history
      await loadAll();

      // 4) Go to Final
      setTab("FINAL");
      alert("Gespeichert und nach Final verschoben.");
    } catch (e: any) {
      setError(msg(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadSavedLsItem(item: LsHistoryItem) {
    if (!projectId) return alert("Bitte zuerst eine Projekt-ID eingeben.");

    try {
      setLoading(true);
      setError(null);

      const res = await fetch(
        `${PROJECTS_BASE}/${encodeURIComponent(projectId)}/lieferscheine/${encodeURIComponent(
          item.filename
        )}`
      );
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      let loadedRows: LsRow[] = [];
      if (Array.isArray((data as any).rows)) loadedRows = (data as any).rows as LsRow[];else
      if ((data as any).items && Array.isArray((data as any).items.lieferscheine))
      loadedRows = (data as any).items.lieferscheine as LsRow[];

      if (!loadedRows.length) {
        const obj: any = data;
        const arrays = Object.values(obj).filter((v) => Array.isArray(v)) as any[];
        const candidate = arrays.find((arr) => arr.length && typeof arr[0] === "object");
        if (candidate) loadedRows = candidate as LsRow[];
      }

      if (!loadedRows.length) return alert("Kein gespeicherter Lieferschein in dieser Datei gefunden.");

      const d = (data as any).date?.slice(0, 10) || item.date?.slice(0, 10) || today();

      const list = loadedRows.
      map((r) => normalizeServerRow(r, projectId)).
      map((r) => ({
        ...r,
        projectId,
        date: (r.date || d).slice(0, 10),
        workflowStatus: "FREIGEGEBEN" as WorkflowStatus
      }));

      setPdfUrl((data as any).pdfUrl ?? item.pdfUrl ?? null);

      setFinalPreview({ date: d, rows: list, filename: item.filename });
      setTab("FINAL");
    } catch (e: any) {
      setError(msg(e));
    } finally {
      setLoading(false);
    }
  }

  function linkToAufmassLocal(args: {projectId: string;lvPos: string | null;lsId: string;}) {
    if (!args.lvPos) return;
    const key = "aufmass-links";
    const map = JSON.parse(localStorage.getItem(key) || "{}");
    const k = `${args.projectId}:${args.lvPos}`;
    map[k] = map[k] || { regieIds: [], lsIds: [] };
    if (!map[k].lsIds.includes(args.lsId)) map[k].lsIds.push(args.lsId);
    localStorage.setItem(key, JSON.stringify(map));
  }

  function transferToAufmassEditor() {
    const source =
    tab === "INBOX" ? inboxRows : tab === "FREIGEGEBEN" ? freigegebenRows : finalPreview?.rows || [];

    if (!projectId || !source.length) return alert("Projekt und mindestens eine Zeile erforderlich.");

    let count = 0;
    for (const r of source) {
      if (r.lvItemPos) {
        const lsId = String(r.id || rid());
        linkToAufmassLocal({ projectId, lvPos: r.lvItemPos, lsId });
        count++;
      }
    }

    if (!count) return alert("Keine LV-Positionen vorhanden, die ins Aufmaß übernommen werden können.");

    alert(`${count} Position(en) für das Aufmaß vorbereitet. Im Aufmaßeditor können sie übernommen werden.`);
  }

  async function importPdfLs(files: FileList | null) {
    if (!files || !files[0]) return;
    if (!projectId) return alert("Bitte Projekt-ID eingeben.");

    try {
      setError(null);
      setLoading(true);

      const file = files[0];
      const text = await readPdfText(file);
      const parsed = parseLsFromText(text, { projectId });
      if (!parsed.length) return alert("Kein Text/Daten im PDF erkannt.");

      for (const pr of parsed) {
        const base: LsRow = {
          ...pr,
          projectId,
          date: String(pr.date || today()).slice(0, 10),
          workflowStatus: "DRAFT"
        };

        const { docId } = await submitInboxCreate(base);

        const meta = {
          ...base,
          id: docId,
          projectId,
          projectCode: projectId,
          workflowStatus: "DRAFT"
        };

        const fd = new FormData();
        fd.append("projectId", projectId);
        fd.append("docId", docId);
        fd.append("meta", JSON.stringify(meta));
        fd.append("files", file);

        await apiForm<any>(`/ls/inbox/upload`, fd);

        if (base.lvItemPos) linkToAufmassLocal({ projectId, lvPos: base.lvItemPos, lsId: docId });
      }

      await loadAll();
      setTab("INBOX");
    } catch (e: any) {
      setError(msg(e));
    } finally {
      setLoading(false);
    }
  }

  function exportXlsx(list: LsRow[]) {
    if (!list.length) return alert("Keine Einträge zum Exportieren.");
    const data = list.map((r) => ({
      Datum: r.date ?? "",
      Lieferschein: r.lieferscheinNummer ?? "",
      Lieferant: r.supplier ?? "",
      Baustelle: r.site ?? "",
      Fahrer: r.driver ?? "",
      Material: r.material ?? "",
      Menge: r.quantity ?? "",
      Einheit: r.unit ?? "",
      Kostenstelle: r.kostenstelle ?? "",
      "LV-Pos": r.lvItemPos ?? "",
      Text: r.comment ?? "",
      Status: normalizeStatus(r.workflowStatus),
      ID: r.id ?? ""
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Lieferscheine");
    XLSX.writeFile(wb, `Lieferscheine_${projectId || "ohneProjekt"}.xlsx`);
  }

  async function requestServerPdf(list: LsRow[], preview: boolean) {
    const rows = list.length ? list : [form];
    const payload = {
      ...form,
      projectId,
      projectCode: projectId,
      projectName: selectedProject?.name || selectedProject?.code || projectId,
      date: String(form.date || rows[0]?.date || today()).slice(0, 10),
      rows,
      attachments: form.photos || form.attachments || [],
      photos: form.photos || form.attachments || []
    };

    const result = await api<{
      ok: boolean;
      pdfUrl: string;
      fileName: string;
    }>(`/ls/preview`, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    const absolute = publicUrl(result.pdfUrl);
    setPdfUrl(absolute);

    if (!preview) {
      window.open(absolute, "_blank", "noopener,noreferrer");
    }

    return result;
  }

  async function exportPdf(list: LsRow[], preview = false) {
    try {
      setError(null);
      setLoading(true);
      if (pendingUploadFiles?.length) await saveToServerDraft();
      await requestServerPdf(list.length ? list : [form], preview);
    } catch (e: any) {
      setError(msg(e));
      alert(`PDF konnte nicht erstellt werden: ${msg(e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function exportRowPdf(row: LsRow, _projectName?: string | null) {
    await requestServerPdf([row], false);
  }

  function addPhotos(files: FileList | null) {
    if (!files) return;

    setPendingUploadFiles(files);

    const arr: Datei[] = Array.from(files).map((f) => ({
      id: rid(),
      name: f.name,
      url: URL.createObjectURL(f),
      type: f.type || guessType(f.name)
    }));

    setForm((p) => ({
      ...p,
      photos: [...(p.photos || []), ...arr],
      attachments: [...(p.attachments || []), ...arr]
    }));
  }

  function removePhoto(id: string) {
    setForm((p) => ({
      ...p,
      photos: (p.photos || []).filter((ph) => ph.id !== id),
      attachments: (p.attachments || []).filter((ph) => ph.id !== id)
    }));
  }

  const selectedInbox = inboxRows.find(
    (item) => String(item.id || "") === String(form.id || "")
  );
  const selectedStatus = normalizeStatus(selectedInbox?.workflowStatus || form.workflowStatus);
  const canApprove = Boolean(form.id && selectedStatus === "EINGEREICHT");

  async function approveCurrent() {
    if (!form.id) return alert("Bitte zuerst einen Inbox-Lieferschein öffnen.");
    try {
      setLoading(true);
      setError(null);
      await saveToServerDraft();
      await approveRowServer({ ...form, id: form.id, workflowStatus: "EINGEREICHT" });
    } catch (e: any) {
      setError(msg(e));
    } finally {
      setLoading(false);
    }
  }

  function rejectCurrent() {
    if (!form.id) return alert("Bitte zuerst einen Inbox-Lieferschein öffnen.");
    requestReject({ ...form, id: form.id });
  }

  return (
    <div className="page rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1436">
      <style>{`
        .ls-form-grid {
          display: grid;
          grid-template-columns: repeat(12, minmax(0, 1fr));
          gap: 12px;
        }

        .ls-form-grid > *,
        .ls-description-grid > * {
          min-width: 0;
        }

        .ls-general-grid > *:nth-child(1),
        .ls-general-grid > *:nth-child(2) {
          grid-column: span 2;
        }

        .ls-general-grid > *:nth-child(3) {
          grid-column: span 5;
        }

        .ls-general-grid > *:nth-child(4) {
          grid-column: span 3;
        }

        .ls-delivery-grid > *:nth-child(1) {
          grid-column: span 3;
        }

        .ls-delivery-grid > *:nth-child(2) {
          grid-column: span 2;
        }

        .ls-delivery-grid > *:nth-child(3) {
          grid-column: span 3;
        }

        .ls-delivery-grid > *:nth-child(4),
        .ls-delivery-grid > *:nth-child(5) {
          grid-column: span 1;
        }

        .ls-delivery-grid > *:nth-child(6) {
          grid-column: span 2;
        }

        .ls-description-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }

        @media (max-width: 1100px) {
          .ls-general-grid > *,
          .ls-delivery-grid > * {
            grid-column: span 6 !important;
          }
        }

        @media (max-width: 720px) {
          .ls-general-grid > *,
          .ls-delivery-grid > * {
            grid-column: 1 / -1 !important;
          }

          .ls-description-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <MengPageHeader
        title="Lieferscheine"
        subtitle="Mobile → Inbox → Prüfung → Freigeben → Verwaltung" />

      <div
        className="card rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1439">








        
        <div className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1440">
          <strong>Inbox (Eingereicht) • {inboxRows.length}</strong>
          <button className="btn" onClick={() => navigate(PATH_BUERO)} disabled={!projectId}>
            Verwaltung
          </button>
          <button className="btn" onClick={loadAll} disabled={loading || !projectId}>
            Aktualisieren
          </button>
        </div>

        <div className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1441">
          <button

            onClick={approveCurrent}
            disabled={!canApprove || loading} className={rlcClass("btn",
              {
                background: canApprove ? "#1546B8" : undefined,
                color: canApprove ? "#fff" : undefined
              })}>
            
            Freigeben
          </button>
          <button
            className="btn rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1442"
            onClick={rejectCurrent}
            disabled={!canApprove || loading}>

            
            Ablehnen
          </button>
          <label className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1443">
            <span className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1444">Projekt-ID</span>
            <input
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)} className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1445" />

            
          </label>
        </div>
      </div>

      <div className="card rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1446">
        <div className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1447">








          
          <div>
            <h3 className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1448">Büro-Bearbeitung</h3>
            <div className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1449">
              Mobile-Dokument laden – prüfen, bearbeiten und direkt in Verwaltung freigeben.
            </div>
          </div>
          <div className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1450">
            {form.material || form.comment ? "1 Position(en)" : "0 Position(en)"}
          </div>
        </div>

        <div className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1451">
          <FormSection title="ALLGEMEINE INFORMATIONEN">
            <div className="ls-form-grid ls-general-grid">
              <Field label="Datum">
                <input type="date" value={form.date || ""} onChange={(e) => setField("date", e.target.value)} />
              </Field>
              <Field label="LS-Nr.">
                <input
                  value={form.lieferscheinNummer || ""}
                  onChange={(e) => setField("lieferscheinNummer", e.target.value)}
                  placeholder="z. B. LS-001" />
                
              </Field>
              <Field label="Lieferant / Anschrift">
                <input value={form.supplier || ""} onChange={(e) => setField("supplier", e.target.value)} />
              </Field>
              <Field label="Kostenstelle">
                <input value={form.kostenstelle || ""} onChange={(e) => setField("kostenstelle", e.target.value)} />
              </Field>
            </div>
          </FormSection>

          <FormSection title="LIEFERUNG UND ZUORDNUNG">
            <div className="ls-form-grid ls-delivery-grid">
              <Field label="Baustelle / Lieferort">
                <input value={form.site || ""} onChange={(e) => setField("site", e.target.value)} />
              </Field>
              <Field label="Fahrer / Fahrzeug">
                <input value={form.driver || ""} onChange={(e) => setField("driver", e.target.value)} />
              </Field>
              <Field label="Material / Leistung">
                <input value={form.material || ""} onChange={(e) => setField("material", e.target.value)} />
              </Field>
              <Field label="Menge">
                <input
                  type="number"
                  step="any"
                  value={form.quantity ?? 0}
                  onChange={(e) => setField("quantity", Number(e.target.value || 0))} />
                
              </Field>
              <Field label="Einheit">
                <input value={form.unit || ""} onChange={(e) => setField("unit", e.target.value)} />
              </Field>
              <Field label="LV-Position">
                <input value={form.lvItemPos || ""} onChange={(e) => setField("lvItemPos", e.target.value)} />
              </Field>
            </div>
          </FormSection>

          <FormSection title="BESCHREIBUNG UND DOKUMENTATION">
            <div className="ls-description-grid">
              <Field label="Beschreibung">
                <textarea
                  value={form.comment || ""}
                  onChange={(e) => setField("comment", e.target.value)}
                  placeholder="Material, Lieferung und Besonderheiten" className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1452" />

                
              </Field>
              <Field label="Bemerkungen">
                <textarea
                  value={form.bemerkungen || ""}
                  onChange={(e) => setField("bemerkungen", e.target.value)} className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1453" />

                
              </Field>
            </div>

            <div className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1454">
              <Field label="Foto / Anhang">
                <div className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1455">
                  <input
                    id="lsPhotosUnified"
                    type="file"
                    multiple
                    accept="image/*,application/pdf"
                    onChange={(e) => addPhotos(e.target.files)} className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1456" />

                  
                  <label htmlFor="lsPhotosUnified" className="btn">
                    Dateien wählen
                  </label>
                  {(form.photos || []).map((photo) =>
                  <div
                    key={photo.id} className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1457">









                    
                      {isImg(photo.type) ?
                    <img
                      src={publicUrl(photo.url)}
                      alt={photo.name}
                      onClick={() => setPreviewUrl(publicUrl(photo.url))} className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1458" /> :



                    <div className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1459">
                          PDF
                        </div>
                    }
                      <button
                      type="button"
                      onClick={() => removePhoto(photo.id)} className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1460">

                      
                        ×
                      </button>
                    </div>
                  )}
                </div>
              </Field>
            </div>
          </FormSection>

          <div className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1461">
            <button className="btn" onClick={saveToServerDraft} disabled={loading || !projectId}>
              Entwurf speichern
            </button>
            <button className="btn" onClick={submitRowServer} disabled={loading || !form.id || !projectId}>
              Einreichen
            </button>
            <button className="btn" onClick={clearForm} disabled={loading}>
              Formular leeren
            </button>
            <button className="btn" onClick={() => exportXlsx(inboxRows)} disabled={!inboxRows.length || loading}>
              Export XLSX
            </button>
            <button className="btn" onClick={() => exportPdf([form], true)} disabled={!projectId || loading}>
              PDF Vorschau
            </button>
            <button className="btn" onClick={() => exportPdf([form], false)} disabled={!projectId || loading}>
              PDF exportieren
            </button>
            <input
              id="lsImportUnified"
              type="file"
              accept="application/pdf"
              onChange={(e) => importPdfLs(e.target.files)} className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1462" />

            
            <label htmlFor="lsImportUnified" className="btn">
              Import PDF
            </label>
          </div>

          {error && <div className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1463">{error}</div>}
          {loading && <div className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1464">RLC arbeitet…</div>}
        </div>
      </div>

      <div className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1465">
        <div className="card rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1466">
          <div className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1467">
            <strong>PDF Vorschau</strong>
            <span className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1468">
              {pdfUrl ? "RLC PDF Core" : "Noch kein PDF geladen"}
            </span>
          </div>
          {pdfUrl ?
          <iframe
            src={pdfUrl}
            title="Lieferschein PDF Vorschau" className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1469" /> :



          <div className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1470">








            
              Lieferschein wählen oder PDF Vorschau erzeugen…
            </div>
          }
        </div>

        <div className="card rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1471">
          <div className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1472">
            <strong>Inbox (Eingereicht)</strong>
            <span className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1473">{inboxRows.length} Eintrag(e)</span>
          </div>
          <div className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1474">
            {inboxRows.length === 0 ?
            <div className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1475">Keine Lieferscheine in der Inbox.</div> :

            inboxRows.map((row) =>
            <div
              key={row.id} className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1476">







              
                  <div>
                    <strong>{row.date || "—"} · {row.lieferscheinNummer || "ohne LS-Nr."}</strong>
                    <div className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1477">
                      {row.supplier || "—"} · {row.material || "—"} · {normalizeStatus(row.workflowStatus)}
                    </div>
                  </div>
                  <button className="btn" onClick={() => selectRow(row)}>
                    Öffnen
                  </button>
                </div>
            )
            }
          </div>
        </div>
      </div>

      <div className="card rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1478">
        <div className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1479">






          
          <strong>Verwaltung · freigegebene Lieferscheine</strong>
          <span className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1480">{history.length} Dokument(e)</span>
        </div>
        <div className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1481">
          <table className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1482">
            <thead>
              <tr>
                <Th>Datum</Th>
                <Th>Dokument</Th>
                <Th>Positionen</Th>
                <Th>Gespeichert</Th>
                <Th>Aktion</Th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ?
              <tr><Td colSpan={5} style={{ textAlign: "center" }}>Noch keine freigegebenen Lieferscheine.</Td></tr> :

              history.map((item) =>
              <tr key={item.filename}>
                    <Td>{item.date}</Td>
                    <Td>{item.filename}</Td>
                    <Td>{item.rows}</Td>
                    <Td>{item.savedAt ? new Date(item.savedAt).toLocaleString("de-DE") : "—"}</Td>
                    <Td>
                      <div className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1483">
                        <button className="btn" onClick={() => loadSavedLsItem(item)}>Laden</button>
                        {item.pdfUrl &&
                    <a className="btn" href={publicUrl(item.pdfUrl)} target="_blank" rel="noreferrer">PDF</a>
                    }
                      </div>
                    </Td>
                  </tr>
              )
              }
            </tbody>
          </table>
        </div>
      </div>

      {rejectOpen &&
      <div
        onClick={() => setRejectOpen(false)} className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1484">









        
          <div onClick={(e) => e.stopPropagation()} className="card rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1485">
            <strong>Ablehnen – Grund</strong>
            <textarea
            value={rejectText}
            onChange={(e) => setRejectText(e.target.value)} className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1486" />

          
            <div className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1487">
              <button className="btn" onClick={() => setRejectOpen(false)}>Abbrechen</button>
              <button className="btn" onClick={confirmReject}>Ablehnen</button>
            </div>
          </div>
        </div>
      }

      {previewUrl &&
      <div
        onClick={() => setPreviewUrl(null)} className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1488">








        
          <img src={previewUrl} alt="Vorschau" className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1489" />
        </div>
      }
    </div>);

}

/* ===== UI helpers ===== */

function FormSection(props: React.PropsWithChildren<{title: string;}>) {
  return (
    <section>
      <div className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1490">
        <strong className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1491">
          {props.title}
        </strong>
        <div className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1492" />
      </div>
      {props.children}
    </section>);

}

function Field(props: React.PropsWithChildren<{label: string;}>) {
  const controls = React.Children.map(props.children, (child) => {
    if (!React.isValidElement(child)) return child;

    const element = child as React.ReactElement<any>;

    return React.cloneElement(element, {
      style: {
        width: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        ...((element.props as any).style || {})
      }
    });
  });

  return (
    <label className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1493">






      
      <span className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1494">





        
        {props.label}
      </span>

      {controls}
    </label>);

}

function TabBtn(props: {active: boolean;label: string;onClick: () => void;}) {
  return (
    <button

      onClick={props.onClick} className={rlcClass("btn",
        {
          fontSize: 12,
          padding: "4px 10px",
          border: props.active ? "1px solid var(--text)" : undefined,
          opacity: props.active ? 1 : 0.8
        })}>
      
      {props.label}
    </button>);

}

function L(
props: React.PropsWithChildren<{
  label: string;
  full?: boolean;
  style?: React.CSSProperties;
}>)
{
  return (
    <label className={rlcClass(null,
    {
      display: "grid",
      gridTemplateColumns: props.full ? "1fr" : "110px 1fr",
      gap: 4,
      alignItems: "center",
      ...props.style
    })}>
      
      <span className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1495">{props.label}</span>
      <div>{props.children}</div>
    </label>);

}

function Th({ children }: {children: React.ReactNode;}) {
  return (
    <th className="rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1496">







      
      {children}
    </th>);

}

function Td(
props: React.TdHTMLAttributes<HTMLTableCellElement> & {
  children?: React.ReactNode;
})
{
  const { children, style, ...rest } = props;
  return (
    <td
      {...rest} className={rlcClass(null,
      {
        padding: "6px 8px",
        borderBottom: "1px solid var(--line)",
        verticalAlign: "top",
        fontSize: 12,
        ...style
      })}>
      
      {children}
    </td>);

}
