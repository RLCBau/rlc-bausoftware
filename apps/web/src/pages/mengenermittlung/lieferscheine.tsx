// apps/web/src/pages/mengenermittlung/Lieferscheine.tsx
import React from "react";
import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";
import { useProject } from "../../store/useProject";
import { useNavigate } from "react-router-dom";

/* ===== Tipi ===== */
type Datei = { id: string; name: string; url: string; type: string };

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
  "http://localhost:4000";

const API_BASE = `${String(API_ORIGIN).replace(/\/$/, "")}/api`;
const PROJECTS_BASE = `${String(API_ORIGIN).replace(/\/$/, "")}/projects`;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let txt = "";
    try {
      txt = await res.text();
    } catch {
      /* ignore */
    }
    throw new Error(txt || `${res.status} ${res.statusText}`);
  }
  const text = await res.text().catch(() => "");
  return (text ? JSON.parse(text) : null) as T;
}

async function apiForm<T>(path: string, fd: FormData): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { method: "POST", body: fd });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `${res.status} ${res.statusText}`);
  }
  const text = await res.text().catch(() => "");
  return (text ? JSON.parse(text) : null) as T;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function num(v: any) {
  const n = Number(v);
  return Number.isFinite(n)
    ? n.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : "";
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
  preferType = "image/jpeg"
): Promise<string | null> {
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
function parseLsFromText(txt: string, defaults: { projectId: string }): LsRow[] {
  const date = (
    txt.match(
      /Datum[:\s]*([0-9]{2}\.[0-9]{2}\.[0-9]{4}|[0-9]{4}-[0-9]{2}-[0-9]{2})/i
    )?.[1] ?? today()
  ).replace(/(\d{2})\.(\d{2})\.(\d{4})/, "$3-$2-$1");

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
      workflowStatus: "DRAFT",
    },
  ];
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
      url: String(ph?.url || ph?.publicUrl || ""),
    }));

  const photos = mapped(photosRaw.length ? photosRaw : attRaw);

  return {
    ...r,
    projectId: String(r?.projectId || projectId),
    id: String(r?.id || r?.docId || ""),
    date: r?.date ? String(r.date).slice(0, 10) : undefined,
    workflowStatus: normalizeStatus(r?.workflowStatus),
    photos,
    attachments: photos,
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
    selectedProject?.code || (selectedProject?.id as string | undefined) || ""
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
    workflowStatus: "DRAFT",
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
      const parsed = JSON.parse(raw) as { projectId?: string; tab?: Tab };
      if (parsed.projectId) setProjectId(parsed.projectId);
      if (parsed.tab) setTab(parsed.tab);
    } catch {
      /* ignore */
    }
  }, []);

  React.useEffect(() => {
    try {
      localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify({ projectId, tab }));
    } catch {
      /* ignore */
    }
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
    const normalized = items
      .map((r: any) => normalizeServerRow(r, projectId))
      .filter((r: LsRow) => !!r.id);

    const inbox = normalized.filter((r: LsRow) => {
      const st = normalizeStatus(r.workflowStatus);
      return st === "DRAFT" || st === "EINGEREICHT" || st === "ABGELEHNT";
    });

    inbox.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
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
      const normalized = items
        .map((r: any) => normalizeServerRow(r, projectId))
        .filter((r: LsRow) => !!r.id)
        .map((r: LsRow) => ({ ...r, workflowStatus: "FREIGEGEBEN" as WorkflowStatus }));

      normalized.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
      setFreigegebenRows(normalized);
      return;
    } catch (e) {
      // fallthrough to fallback
    }

    // 2) Fallback: if server keeps approved items inside inbox/list
    try {
      const res = await api<any>(`/ls/inbox/list?projectId=${encodeURIComponent(projectId)}`);
      const items = Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [];
      const normalized = items
        .map((r: any) => normalizeServerRow(r, projectId))
        .filter((r: LsRow) => !!r.id);

      const freig = normalized.filter((r: LsRow) => normalizeStatus(r.workflowStatus) === "FREIGEGEBEN");
      freig.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
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
      const res = await api<{ ok: boolean; items: LsHistoryItem[] }>(
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
      rejectedAt: null,
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
      rejectReason: r.rejectReason ?? null,
    });
    setPendingUploadFiles(null);
  }

  /* ===== API: server workflow ===== */

  async function submitInboxCreate(base: LsRow): Promise<{ docId: string }> {
    const payload = {
      ...base,
      projectId,
      projectCode: projectId,
      workflowStatus: normalizeStatus(base.workflowStatus),
      date: String(base.date || today()).slice(0, 10),
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
        attachments: undefined,
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
        body: JSON.stringify({ projectId, docId }),
      });

      await loadAll();
      setTab("FREIGEGEBEN");
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
        body: JSON.stringify({ projectId, docId, reason }),
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
        workflowStatus: normalizeStatus(form.workflowStatus) || "DRAFT",
      };

      // create new doc
      if (!base.id) {
        const { docId } = await submitInboxCreate(base);

        const meta = {
          ...base,
          id: docId,
          projectId,
          projectCode: projectId,
          workflowStatus: base.workflowStatus,
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
        rejectReason: base.rejectReason ?? null,
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
          rows: freigegebenRows,
        }),
      });

      await loadHistory();
      alert("Freigegeben gespeichert (Final/Historie aktualisiert).");
    } catch (e1: any) {
      // fallback without rows if server expects only projectId
      try {
        await api<any>(`/ls/save`, {
          method: "POST",
          body: JSON.stringify({ projectId }),
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
        attachments: undefined,
      };

      await updateInboxMeta(docId, meta, pendingUploadFiles);
      setPendingUploadFiles(null);

      // 2) Commit/move single file if endpoint exists
      try {
        await api(`/ls/freigegeben/commit`, {
          method: "POST",
          body: JSON.stringify({ projectId, docId }),
        });
      } catch {
        // fallback: save with rows (server might only implement /ls/save)
        await api<any>(`/ls/save`, {
          method: "POST",
          body: JSON.stringify({ projectId, rows: [normalizeServerRow(meta, projectId)] }),
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
      if (Array.isArray((data as any).rows)) loadedRows = (data as any).rows as LsRow[];
      else if ((data as any).items && Array.isArray((data as any).items.lieferscheine))
        loadedRows = (data as any).items.lieferscheine as LsRow[];

      if (!loadedRows.length) {
        const obj: any = data;
        const arrays = Object.values(obj).filter((v) => Array.isArray(v)) as any[];
        const candidate = arrays.find((arr) => arr.length && typeof arr[0] === "object");
        if (candidate) loadedRows = candidate as LsRow[];
      }

      if (!loadedRows.length) return alert("Kein gespeicherter Lieferschein in dieser Datei gefunden.");

      const d = (data as any).date?.slice(0, 10) || item.date?.slice(0, 10) || today();

      const list = loadedRows
        .map((r) => normalizeServerRow(r, projectId))
        .map((r) => ({
          ...r,
          projectId,
          date: (r.date || d).slice(0, 10),
          workflowStatus: "FREIGEGEBEN" as WorkflowStatus,
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

  function linkToAufmassLocal(args: { projectId: string; lvPos: string | null; lsId: string }) {
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
          workflowStatus: "DRAFT",
        };

        const { docId } = await submitInboxCreate(base);

        const meta = {
          ...base,
          id: docId,
          projectId,
          projectCode: projectId,
          workflowStatus: "DRAFT",
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
      ID: r.id ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Lieferscheine");
    XLSX.writeFile(wb, `Lieferscheine_${projectId || "ohneProjekt"}.xlsx`);
  }

  function safeText(doc: jsPDF, text: string, x: number, y: number, maxW: number) {
    if (!text) return;
    const lines = doc.splitTextToSize(String(text), maxW);
    doc.text(lines, x, y);
  }

  async function exportPdf(list: LsRow[], preview = false) {
    if (!list.length) return alert("Keine Einträge zum Exportieren.");

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    const pageW = doc.internal.pageSize.getWidth();
    const margin = 10;
    const lineW = 0.2;
    const labelFont = 8;
    const valueFont = 8;

    doc.setLineWidth(lineW);
    doc.setFont("helvetica", "normal");

    const projectIdForBauNr = projectId || list[0].projectId || "";
    const baustelleName = selectedProject?.name || selectedProject?.code || projectIdForBauNr;
    const exportDate = (form.date || list[0]?.date || today()).slice(0, 10);

    const chunkSize = 6;
    const totalPages = Math.ceil(list.length / chunkSize);

    for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
      if (pageIndex > 0) doc.addPage();

      const pageRows = list.slice(pageIndex * chunkSize, (pageIndex + 1) * chunkSize);
      const headerRow = pageRows[0] || list[0];

      const headTop = margin;
      const headH = 32;
      const leftW = 55;
      const rightW = 55;
      const midW = pageW - margin * 2 - leftW - rightW;
      const leftX = margin;
      const midX = leftX + leftW;
      const rightX = midX + midW;

      doc.rect(leftX, headTop, leftW + midW + rightW, headH);

      doc.rect(leftX, headTop, leftW, headH);
      doc.setFontSize(labelFont + 1);
      doc.text("Lieferschein", leftX + leftW / 2, headTop + headH / 2, { align: "center" });
      doc.setFontSize(labelFont);

      doc.rect(midX, headTop, midW, headH);
      const midInnerX = midX + 6;
      let lineY = headTop + 10;

      doc.text("Baustelle:", midInnerX, lineY);
      doc.setFontSize(valueFont);
      safeText(doc, baustelleName || "-", midInnerX + 22, lineY, midW - 6 - 22);
      doc.setFontSize(labelFont);
      doc.line(midInnerX + 20, lineY + 1.5, midX + midW - 6, lineY + 1.5);
      lineY += 10;

      doc.text("Lieferant:", midInnerX, lineY);
      doc.setFontSize(valueFont);
      safeText(doc, headerRow.supplier || "-", midInnerX + 22, lineY, midW - 6 - 22);
      doc.setFontSize(labelFont);
      doc.line(midInnerX + 20, lineY + 1.5, midX + midW - 6, lineY + 1.5);

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
      drawRightField("LS-Nr.", headerRow.lieferscheinNummer || "");
      drawRightField("Datum", (headerRow.date || exportDate || today()).slice(0, 10));

      let curY = headTop + headH + 8;
      const tableTop = curY;
      const tableW = pageW - margin * 2;
      const headerH = 7;
      const rowH = 9;
      const tableH = rowH * 6;

      doc.rect(margin, tableTop, tableW, headerH + tableH);

      const colKosten = tableW * 0.1;
      const colLieferant = tableW * 0.22;
      const colBaustelle = tableW * 0.2;
      const colMaterial = tableW * 0.2;
      const colMenge = tableW * 0.1;
      const colBem = tableW - (colKosten + colLieferant + colBaustelle + colMaterial + colMenge);

      let colX = margin;
      const drawCol = (w: number, label: string) => {
        doc.rect(colX, tableTop, w, headerH + tableH);
        doc.setFontSize(labelFont);
        doc.text(label, colX + w / 2, tableTop + 4, { align: "center" });
        colX += w;
      };

      drawCol(colKosten, "Kostenstelle");
      drawCol(colLieferant, "Lieferant / Fahrer");
      drawCol(colBaustelle, "Baustelle");
      drawCol(colMaterial, "Material");
      drawCol(colMenge, "Menge / Einheit");
      drawCol(colBem, "Bemerkungen");

      const mainRowYStart = tableTop + headerH;

      for (let i = 0; i <= 6; i++) {
        const y = mainRowYStart + i * rowH;
        doc.line(margin, y, margin + tableW, y);
      }

      doc.setFontSize(valueFont);

      pageRows.forEach((r, idx) => {
        if (idx >= 6) return;

        const baseY = mainRowYStart + idx * rowH;
        const textY = baseY + 6.2;

        const mengeStr =
          r.quantity != null && r.quantity !== 0 ? `${num(r.quantity)} ${r.unit || ""}`.trim() : "";

        let txCol = margin + 2;

        if (r.kostenstelle) safeText(doc, r.kostenstelle, txCol, textY, colKosten - 4);
        txCol += colKosten;

        const lfText = [r.supplier || "", r.driver || ""].filter(Boolean).join(" / ");
        if (lfText) safeText(doc, lfText, txCol + 2, textY, colLieferant - 4);
        txCol += colLieferant;

        if (r.site) safeText(doc, r.site, txCol + 2, textY, colBaustelle - 4);
        txCol += colBaustelle;

        if (r.material) safeText(doc, r.material, txCol + 2, textY, colMaterial - 4);
        txCol += colMaterial;

        if (mengeStr) doc.text(mengeStr, txCol + colMenge / 2, textY, { align: "center" });
        txCol += colMenge;

        if (r.comment) safeText(doc, r.comment, txCol + 2, textY, colBem - 4);
      });

      curY = tableTop + headerH + tableH + 8;

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
        safeText(doc, headerRow.bemerkungen, bemerkX + 2, curY + 11, bemerkW - 4);
        doc.setFontSize(labelFont);
      }

      const firstImg =
        pageRows.flatMap((r) => r.photos || r.attachments || []).find((p) => isImg(p.type)) || null;

      if (firstImg) {
        const dataUrl = await urlToDataURL(firstImg.url, "image/jpeg");
        if (dataUrl) {
          const imgMargin = 6;
          const imgW = fotoBoxW - imgMargin * 2;
          const imgH = fotoBoxH - imgMargin * 2 - 6;
          doc.addImage(dataUrl, "JPEG", fotoX + imgMargin, curY + imgMargin + 4, imgW, imgH);
        }
      }
    }

    const fileName = `Lieferscheine_${exportDate}_${projectId || "ohneProjekt"}.pdf`;

    if (preview) {
      const blob = doc.output("blob");
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
      return;
    }

    doc.save(fileName);
  }

  async function exportRowPdf(row: LsRow, projectName?: string | null) {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    const margin = 10;

    const projectIdForBauNr = projectId || row.projectId || "";
    const baustelleName = projectName || selectedProject?.name || selectedProject?.code || projectIdForBauNr;
    const exportDate = (row.date || form.date || today()).slice(0, 10);

    doc.setFontSize(12);
    doc.text("Lieferschein", margin, margin + 6);

    doc.setFontSize(9);
    doc.text(`Bau-Nr.: ${projectIdForBauNr}`, margin, margin + 14);
    doc.text(`Baustelle: ${baustelleName}`, margin, margin + 19);
    doc.text(`LS-Nr.: ${row.lieferscheinNummer || "-"}`, margin, margin + 24);
    doc.text(`Datum: ${exportDate}`, margin, margin + 29);

    doc.text(`Lieferant: ${row.supplier || "-"}`, margin, margin + 37);
    doc.text(`Fahrer: ${row.driver || "-"}`, margin, margin + 42);
    doc.text(`Material: ${row.material || "-"}`, margin, margin + 47);
    doc.text(`Menge: ${(row.quantity ?? 0).toString()} ${row.unit || ""}`.trim(), margin, margin + 52);
    doc.text(`Kostenstelle: ${row.kostenstelle || "-"}`, margin, margin + 57);
    doc.text(`LV-Pos: ${row.lvItemPos || "-"}`, margin, margin + 62);

    const fileName = `Lieferschein_${exportDate}_${projectIdForBauNr || "ohneProjekt"}_${row.id || "row"}.pdf`;
    doc.save(fileName);
  }

  function addPhotos(files: FileList | null) {
    if (!files) return;

    setPendingUploadFiles(files);

    const arr: Datei[] = Array.from(files).map((f) => ({
      id: rid(),
      name: f.name,
      url: URL.createObjectURL(f),
      type: f.type || guessType(f.name),
    }));

    setForm((p) => ({
      ...p,
      photos: [...(p.photos || []), ...arr],
      attachments: [...(p.attachments || []), ...arr],
    }));
  }

  function removePhoto(id: string) {
    setForm((p) => ({
      ...p,
      photos: (p.photos || []).filter((ph) => ph.id !== id),
      attachments: (p.attachments || []).filter((ph) => ph.id !== id),
    }));
  }

  const activeList: LsRow[] =
    tab === "INBOX" ? inboxRows : tab === "FREIGEGEBEN" ? freigegebenRows : finalPreview?.rows || [];

  const rightTitle =
    tab === "INBOX" ? "Inbox" : tab === "FREIGEGEBEN" ? "Freigegeben" : "Final (Historie)";

  const rightCount =
    tab === "INBOX" ? inboxRows.length : tab === "FREIGEGEBEN" ? freigegebenRows.length : history.length;

  const canEditFinal = (r: LsRow) => true;

  function openAndEditFromFinal(r: LsRow) {
    selectRow(r);
    setTab("FREIGEGEBEN");
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2 className="page-title" style={{ marginBottom: 4 }}>
            Lieferscheine
          </h2>
          <p className="page-subtitle" style={{ margin: 0 }}>
            Inbox → Freigabe → Final (Historie).
          </p>
        </div>

        <div
          className="page-header-actions"
          style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
        >
          {/* ✅ Shortcuts to macro sections */}
           <button className="btn" onClick={() => navigate(PATH_BUERO)} disabled={!projectId}>
    Büro / Verwaltung
  </button>

  <button className="btn" onClick={() => navigate(PATH_BUCHHALTUNG)} disabled={!projectId}>
    Buchhaltung
  </button>


          <button className="btn" onClick={transferToAufmassEditor} disabled={!activeList.length || !projectId}>
            Ins Aufmaßeditor übertragen
          </button>

          <button className="btn" onClick={() => loadHistory()} disabled={!projectId}>
            Final aktualisieren
          </button>

          <button className="btn" onClick={() => loadAll()} disabled={!projectId}>
            Inbox/Freigabe aktualisieren
          </button>

          {tab === "FREIGEGEBEN" && (
            <button
              className="btn"
              onClick={saveFreigegebenToFinal}
              disabled={!projectId || !freigegebenRows.length || loading}
            >
              Speichern → Final
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div
        className="card"
        style={{
          padding: 8,
          marginBottom: 10,
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <TabBtn active={tab === "INBOX"} onClick={() => setTab("INBOX")} label={`Inbox (${inboxRows.length})`} />
        <TabBtn
          active={tab === "FREIGEGEBEN"}
          onClick={() => setTab("FREIGEGEBEN")}
          label={`Freigegeben (${freigegebenRows.length})`}
        />
        <TabBtn active={tab === "FINAL"} onClick={() => setTab("FINAL")} label={`Final (Historie) (${history.length})`} />
        {tab === "FINAL" && (
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            Final zeigt nur gespeicherte (freigegebene) Dateien.
          </span>
        )}
      </div>

      <div
        className="page-body"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(290px, 330px) 1fr",
          gap: 16,
          alignItems: "flex-start",
        }}
      >
        {/* LEFT */}
        <div className="card" style={{ padding: 10 }}>
          <h3 style={{ marginTop: 0, marginBottom: 6 }}>Lieferschein erfassen</h3>

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 6 }}>
            <L label="Projekt-ID">
              <input value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="z. B. BA-2025-001" />
            </L>

            <div style={{ display: "flex", gap: 6 }}>
              <L label="Datum" style={{ flex: 1 }}>
                <input type="date" value={form.date ?? ""} onChange={(e) => setField("date", e.target.value)} />
              </L>
              <L label="LS-Nr." style={{ width: 120 }}>
                <input
                  value={form.lieferscheinNummer ?? ""}
                  onChange={(e) => setField("lieferscheinNummer", e.target.value)}
                  placeholder="z. B. LS-001"
                />
              </L>
            </div>

            <L label="Lieferant">
              <input value={form.supplier ?? ""} onChange={(e) => setField("supplier", e.target.value)} />
            </L>

            <L label="Baustelle">
              <input value={form.site ?? ""} onChange={(e) => setField("site", e.target.value)} />
            </L>

            <L label="Fahrer">
              <input value={form.driver ?? ""} onChange={(e) => setField("driver", e.target.value)} />
            </L>

            <L label="Material">
              <input value={form.material ?? ""} onChange={(e) => setField("material", e.target.value)} />
            </L>

            <div style={{ display: "flex", gap: 6 }}>
              <L label="Menge" style={{ flex: 1 }}>
                <input
                  type="number"
                  step="0.01"
                  value={form.quantity ?? 0}
                  onChange={(e) => setField("quantity", Number(e.target.value))}
                />
              </L>
              <L label="Einheit" style={{ width: 100 }}>
                <input value={form.unit ?? ""} onChange={(e) => setField("unit", e.target.value)} />
              </L>
            </div>

            <L label="Kostenstelle">
              <input
                value={form.kostenstelle ?? ""}
                onChange={(e) => setField("kostenstelle", e.target.value)}
                placeholder="z. B. 100-BA-01"
              />
            </L>

            <L label="LV-Position">
              <input
                value={String(form.lvItemPos ?? "")}
                onChange={(e) => setField("lvItemPos", e.target.value)}
                placeholder="z. B. 001.002"
              />
            </L>

            <L label="Text / Beschreibung" full>
              <textarea
                value={form.comment ?? ""}
                onChange={(e) => setField("comment", e.target.value)}
                style={{ height: 70, resize: "vertical" }}
                placeholder="z. B. 2 Fahrten, Zufahrt Nord…"
              />
            </L>

            <L label="Bemerkungen (PDF-Feld unten)" full>
              <textarea
                value={form.bemerkungen ?? ""}
                onChange={(e) => setField("bemerkungen", e.target.value)}
                style={{ height: 60, resize: "vertical" }}
                placeholder="Bemerkungen für das Feld im Lieferschein-PDF…"
              />
            </L>

            <L label="Foto/Anhang (Bilder & PDF)">
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  id="lsPhotos"
                  type="file"
                  multiple
                  accept="image/*,.pdf,.heic,.heif"
                  onChange={(e) => addPhotos(e.target.files)}
                  style={{ display: "none" }}
                />
                <label htmlFor="lsPhotos" className="btn">
                  Dateien wählen
                </label>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {(form.photos || form.attachments || []).map((ph) => (
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
                          {ph.name}
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

                      <button
                        onClick={() => removePhoto(ph.id)}
                        className="btn"
                        style={{ position: "absolute", top: 4, right: 4, padding: "0 6px" }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </L>

            <div style={{ display: "flex", gap: 6, marginTop: 2, flexWrap: "wrap" }}>
              <button className="btn" onClick={saveToServerDraft} disabled={loading}>
                {form.id ? "Änderungen speichern" : "Eintrag anlegen"}
              </button>
              <button className="btn" onClick={clearForm} disabled={loading}>
                Formular leeren
              </button>
            </div>

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
              <button className="btn" onClick={() => exportXlsx(activeList)} disabled={loading}>
                Export XLSX
              </button>
              <button className="btn" onClick={() => exportPdf(activeList, false)} disabled={loading}>
                Export PDF
              </button>
              <button className="btn" onClick={() => exportPdf(activeList, true)} disabled={loading}>
                PDF Vorschau
              </button>
            </div>

            <button className="btn" style={{ marginTop: 4 }} onClick={submitRowServer} disabled={!form.id || !projectId || loading}>
              Einreichen (Inbox)
            </button>

            <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
              <input
                id="lsImport"
                type="file"
                accept="application/pdf"
                onChange={(e) => importPdfLs(e.target.files)}
                style={{ display: "none" }}
              />
              <label htmlFor="lsImport" className="btn">
                Import PDF
              </label>

              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                Estrae: Datum, Lieferant, Baustelle, Fahrer, Material, Menge, Einheit, Pos.
              </span>
            </div>

            {error && <div style={{ color: "crimson", marginTop: 4 }}>{error}</div>}
            {loading && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>Lade…</div>}
          </div>
        </div>

        {/* RIGHT */}
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 10, alignItems: "stretch" }}>
            {/* PDF preview */}
            <div className="card" style={{ padding: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <strong>PDF Vorschau</strong>
                <span style={{ fontSize: 11, color: "var(--muted)" }}>{pdfUrl ? "" : "Noch kein PDF geladen"}</span>
              </div>

              {pdfUrl ? (
                <iframe
                  src={pdfUrl}
                  style={{
                    width: "100%",
                    height: 230,
                    border: "1px solid var(--line)",
                    borderRadius: 8,
                  }}
                />
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
                  Lieferschein wählen oder erzeugen…
                </div>
              )}
            </div>

            {/* right list */}
            <div className="card" style={{ padding: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <strong>{rightTitle}</strong>
                <span style={{ fontSize: 11, color: "var(--muted)" }}>
                  {rightCount} {tab === "FINAL" ? "Datei(en)" : "Eintrag(e)"}
                </span>
              </div>

              <div style={{ maxHeight: 230, overflowY: "auto", paddingRight: 4 }}>
                {tab === "FINAL" ? (
                  history.length === 0 ? (
                    <div style={{ fontSize: 12, color: "var(--muted)", padding: "4px 2px" }}>
                      Noch keine freigegebenen Lieferscheine gespeichert.
                    </div>
                  ) : (
                    history.map((h) => (
                      <div
                        key={h.filename}
                        style={{
                          padding: "6px 4px",
                          borderBottom: "1px solid var(--line)",
                          display: "flex",
                          gap: 6,
                          alignItems: "flex-start",
                        }}
                      >
                        <div style={{ flex: 1, fontSize: 12 }}>
                          <div style={{ fontWeight: 600 }}>
                            {h.date}{" "}
                            {h.savedAt
                              ? `, ${new Date(h.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                              : ""}
                          </div>
                          <div style={{ color: "var(--muted)", marginTop: 2 }}>{h.rows} Position(en)</div>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <button className="btn" style={{ fontSize: 11, padding: "2px 6px" }} onClick={() => loadSavedLsItem(h)}>
                            Laden
                          </button>
                          {h.pdfUrl && (
                            <a
                              className="btn"
                              style={{ fontSize: 11, padding: "2px 6px", textAlign: "center" }}
                              href={h.pdfUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              PDF
                            </a>
                          )}
                        </div>
                      </div>
                    ))
                  )
                ) : activeList.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--muted)", padding: "4px 2px" }}>Keine Einträge.</div>
                ) : (
                  activeList.map((r, idx) => (
                    <div
                      key={r.id ?? `r-${idx}`}
                      style={{
                        padding: "6px 4px",
                        borderBottom: "1px solid var(--line)",
                        display: "flex",
                        gap: 6,
                        alignItems: "flex-start",
                      }}
                    >
                      <div style={{ flex: 1, fontSize: 12 }}>
                        <div style={{ fontWeight: 600 }}>
                          {(r.date || "").slice(0, 10)} {r.lieferscheinNummer ? `– ${r.lieferscheinNummer}` : ""}
                        </div>
                        <div style={{ color: "var(--muted)", marginTop: 2 }}>
                          {(r.supplier || "-")} {r.material ? `• ${r.material}` : ""}
                        </div>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <button className="btn" style={{ fontSize: 11, padding: "2px 6px" }} onClick={() => selectRow(r)}>
                          Bearbeiten
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Table */}
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
              <div style={{ fontWeight: 600, fontSize: 14 }}>
                {tab === "INBOX" ? "Inbox" : tab === "FREIGEGEBEN" ? "Freigegeben" : "Final (Preview)"}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                {tab === "FINAL"
                  ? finalPreview
                    ? `${finalPreview.rows.length} Position(en)`
                    : "Keine Datei geladen"
                  : `${activeList.length} Eintrag(e)`}
              </div>
            </div>

            {tab === "FINAL" && !finalPreview ? (
              <div style={{ padding: 12, fontSize: 12, color: "var(--muted)" }}>
                Wähle eine Datei in der Historie rechts oben („Laden“), um den Inhalt anzuzeigen.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <Th>Datum</Th>
                      <Th>LS-Nr.</Th>
                      <Th>Lieferant</Th>
                      <Th>Baustelle</Th>
                      <Th>Fahrer</Th>
                      <Th>Material</Th>
                      <Th>Menge</Th>
                      <Th>Einheit</Th>
                      <Th>Kostenstelle</Th>
                      <Th>LV-Pos</Th>
                      <Th>Status</Th>
                      <Th>Text</Th>
                      <Th></Th>
                    </tr>
                  </thead>

                  <tbody>
                    {activeList.length === 0 ? (
                      <tr>
                        <Td colSpan={13} style={{ textAlign: "center" }}>
                          {projectId ? "Keine Einträge" : "Projekt-ID eingeben"}
                        </Td>
                      </tr>
                    ) : (
                      activeList.map((r, i) => (
                        <tr
                          key={r.id ?? `ls-${i}`}
                          style={{
                            background: selKey != null && String(selKey) === String(r.id) ? "rgba(0,0,0,0.04)" : undefined,
                          }}
                        >
                          <Td>{r.date}</Td>
                          <Td>{r.lieferscheinNummer}</Td>
                          <Td>{r.supplier}</Td>
                          <Td>{r.site}</Td>
                          <Td>{r.driver}</Td>
                          <Td>{r.material}</Td>
                          <Td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{num(r.quantity)}</Td>
                          <Td>{r.unit}</Td>
                          <Td>{r.kostenstelle}</Td>
                          <Td>{r.lvItemPos ?? ""}</Td>
                          <Td>{normalizeStatus(r.workflowStatus)}</Td>
                          <Td style={{ maxWidth: 320, whiteSpace: "pre-wrap" }}>{r.comment}</Td>

                          <Td>
                            {tab === "FINAL" ? (
                              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                <button
                                  className="btn"
                                  onClick={() => exportRowPdf(r, selectedProject?.name)}
                                  style={{ fontSize: 11, padding: "2px 6px" }}
                                >
                                  PDF
                                </button>

                                {canEditFinal(r) && (
                                  <button
                                    className="btn"
                                    onClick={() => openAndEditFromFinal(r)}
                                    style={{ fontSize: 11, padding: "2px 6px" }}
                                  >
                                    Öffnen &amp; bearbeiten
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                <button className="btn" onClick={() => selectRow(r)} style={{ fontSize: 11, padding: "2px 6px" }}>
                                  Bearbeiten
                                </button>

                                {tab === "INBOX" && normalizeStatus(r.workflowStatus) === "DRAFT" && (
                                  <button
                                    className="btn"
                                    onClick={() => {
                                      selectRow(r);
                                      setTimeout(() => submitRowServer(), 0);
                                    }}
                                    style={{ fontSize: 11, padding: "2px 6px" }}
                                    disabled={loading}
                                  >
                                    Einreichen
                                  </button>
                                )}

                                {tab === "INBOX" && normalizeStatus(r.workflowStatus) === "EINGEREICHT" && (
                                  <>
                                    <button
                                      className="btn"
                                      onClick={() => approveRowServer(r)}
                                      style={{ fontSize: 11, padding: "2px 6px" }}
                                      disabled={loading}
                                    >
                                      Freigeben
                                    </button>
                                    <button
                                      className="btn"
                                      onClick={() => requestReject(r)}
                                      style={{ fontSize: 11, padding: "2px 6px" }}
                                      disabled={loading}
                                    >
                                      Ablehnen
                                    </button>
                                  </>
                                )}

                                {tab === "INBOX" && normalizeStatus(r.workflowStatus) === "ABGELEHNT" && (
                                  <button
                                    className="btn"
                                    onClick={() => {
                                      selectRow(r);
                                      setTimeout(() => submitRowServer(), 0);
                                    }}
                                    style={{ fontSize: 11, padding: "2px 6px" }}
                                    disabled={loading}
                                  >
                                    Erneut einreichen
                                  </button>
                                )}

                                {tab === "FREIGEGEBEN" && (
                                  <>
                                    <button
                                      className="btn"
                                      onClick={() => selectRow(r)}
                                      style={{ fontSize: 11, padding: "2px 6px" }}
                                      disabled={loading}
                                    >
                                      Öffnen
                                    </button>

                                    <button
                                      className="btn"
                                      onClick={() => commitOneFreigegebenToFinal(r)}
                                      style={{ fontSize: 11, padding: "2px 6px" }}
                                      disabled={loading}
                                    >
                                      Änderungen speichern
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </Td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reject Modal */}
      {rejectOpen && (
        <div
          onClick={() => setRejectOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.45)",
            display: "grid",
            placeItems: "center",
            zIndex: 9999,
            padding: 12,
          }}
        >
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: "min(520px, 98vw)", padding: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Ablehnen – Grund</div>
            <textarea
              value={rejectText}
              onChange={(e) => setRejectText(e.target.value)}
              style={{ width: "100%", height: 110, resize: "vertical" }}
              placeholder="Warum wird der Lieferschein abgelehnt?"
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
              <button className="btn" onClick={() => setRejectOpen(false)} disabled={loading}>
                Abbrechen
              </button>
              <button className="btn" onClick={confirmReject} disabled={loading}>
                Ablehnen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Preview */}
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

function TabBtn(props: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      className="btn"
      onClick={props.onClick}
      style={{
        fontSize: 12,
        padding: "4px 10px",
        border: props.active ? "1px solid var(--text)" : undefined,
        opacity: props.active ? 1 : 0.8,
      }}
    >
      {props.label}
    </button>
  );
}

function L(
  props: React.PropsWithChildren<{
    label: string;
    full?: boolean;
    style?: React.CSSProperties;
  }>
) {
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

function Td(
  props: React.HTMLAttributes<HTMLTableCellElement> & {
    children?: React.ReactNode;
  }
) {
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
