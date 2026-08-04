import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/mengenermittlung/Lieferscheine.tsx
import React from "react";
import * as XLSX from "xlsx";
import { useProject } from "../../store/useProject";
import { useNavigate } from "react-router-dom";
import MengPageHeader from "./MengPageHeader";
/* ===== Utils ===== */
const rid = () => 
// @ts-ignore
crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
const STATE_STORAGE_KEY = "rlc-lieferscheine-state-v3";
const API_ORIGIN = import.meta?.env?.VITE_BACKEND_URL ||
    import.meta?.env?.VITE_API_ORIGIN ||
    "https://api.rlcbausoftware.com";
const API_BASE = `${String(API_ORIGIN).replace(/\/$/, "")}/api`;
const PROJECTS_BASE = `${String(API_ORIGIN).replace(/\/$/, "")}/projects`;
function authHeaders() {
    const keys = [
        "rlc_token",
        "token",
        "authToken",
        "accessToken",
        "rlc_auth_token",
        "rlc.auth.token",
        "rlc_mobile_token"
    ];
    for (const key of keys) {
        const token = localStorage.getItem(key) || sessionStorage.getItem(key);
        if (token?.trim())
            return { Authorization: `Bearer ${token.trim()}` };
    }
    for (const storage of [localStorage, sessionStorage]) {
        try {
            const raw = storage.getItem("rlc_auth");
            if (!raw)
                continue;
            const parsed = JSON.parse(raw);
            const token = parsed?.token || parsed?.accessToken;
            if (token)
                return { Authorization: `Bearer ${String(token).trim()}` };
        }
        catch {
            // Alte ungültige Auth-Daten ignorieren.
        }
    }
    return {};
}
function apiUrl(pathOrUrl) {
    if (/^https?:\/\//i.test(pathOrUrl))
        return pathOrUrl;
    const normalized = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
    return `${API_BASE}${normalized}`;
}
function publicUrl(pathOrUrl) {
    if (/^(https?:\/\/|blob:|data:|file:)/i.test(pathOrUrl))
        return pathOrUrl;
    const normalized = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
    return `${String(API_ORIGIN).replace(/\/$/, "")}${normalized}`;
}
async function readApiPayload(res) {
    const text = await res.text().catch(() => "");
    if (!text)
        return null;
    try {
        return JSON.parse(text);
    }
    catch {
        return text;
    }
}
async function api(path, init) {
    const res = await fetch(apiUrl(path), {
        credentials: "include",
        ...init,
        headers: {
            Accept: "application/json",
            ...(init?.body ? { "Content-Type": "application/json" } : {}),
            ...authHeaders(),
            ...(init?.headers || {})
        }
    });
    const payload = await readApiPayload(res);
    if (!res.ok || payload?.ok === false) {
        const detail = typeof payload === "string" ?
            payload :
            payload?.message || payload?.error || `HTTP ${res.status}`;
        throw new Error(detail);
    }
    return payload;
}
async function apiForm(path, fd) {
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
        const detail = typeof payload === "string" ?
            payload :
            payload?.message || payload?.error || `HTTP ${res.status}`;
        throw new Error(detail);
    }
    return payload;
}
function today() {
    return new Date().toISOString().slice(0, 10);
}
function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ?
        n.toLocaleString(undefined, { maximumFractionDigits: 2 }) :
        "";
}
function msg(e) {
    return typeof e === "string" ? e : e?.message ?? "Fehler";
}
const isImg = (t) => !!t && t.startsWith("image/");
const isPdf = (t) => t === "application/pdf";
function guessType(name) {
    const ext = name.split(".").pop()?.toLowerCase();
    if (!ext)
        return "application/octet-stream";
    if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "heic", "heif"].includes(ext))
        return `image/${ext === "jpg" ? "jpeg" : ext}`;
    if (ext === "pdf")
        return "application/pdf";
    return "application/octet-stream";
}
/** URL → dataURL (JPEG), se possibile */
async function urlToDataURL(url, preferType = "image/jpeg") {
    try {
        const res = await fetch(url);
        const blob = await res.blob();
        try {
            const bitmap = await createImageBitmap(blob);
            const canvas = document.createElement("canvas");
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(bitmap, 0, 0);
            return canvas.toDataURL(preferType);
        }
        catch {
            if (blob.type.startsWith("image/")) {
                const reader = new FileReader();
                return await new Promise((resolve) => {
                    reader.onload = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                });
            }
            return null;
        }
    }
    catch {
        return null;
    }
}
/* ===== PDF Reader compatibile Vite ===== */
async function readPdfText(file) {
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    const array = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjsLib.getDocument({ data: array }).promise;
    let text = "";
    for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const content = await page.getTextContent();
        const items = content.items.map((it) => it.str);
        text += items.join(" ") + "\n";
    }
    return text.replace(/\s+/g, " ").trim();
}
/* ===== Parser semplice Lieferschein dal testo ===== */
function parseLsFromText(txt, defaults) {
    const date = (txt.match(/Datum[:\s]*([0-9]{2}\.[0-9]{2}\.[0-9]{4}|[0-9]{4}-[0-9]{2}-[0-9]{2})/i)?.[1] ?? today()).
        replace(/(\d{2})\.(\d{2})\.(\d{4})/, "$3-$2-$1");
    const supplier = txt.match(/(Lieferant|Firma)[:\s]*([^\n]+)/i)?.[2]?.trim() ?? "";
    const site = txt.match(/(Baustelle|Projekt)[:\s]*([^\n]+)/i)?.[2]?.trim() ?? "";
    const driver = txt.match(/(Fahrer|Driver)[:\s]*([^\n]+)/i)?.[2]?.trim() ?? "";
    const material = txt.match(/Material[:\s]*([^\n]+)/i)?.[1]?.trim();
    const qty = Number((txt.match(/(Menge|Quantity)[:\s]*([0-9]+(?:[.,][0-9]+)?)/i)?.[2] ?? "0").replace(",", "."));
    const unit = txt.match(/(Einheit|Unit)[:\s]*([A-Za-zÄÖÜäöüß]+)/i)?.[2]?.trim() ?? "";
    const comment = txt.match(/(Bemerkung|Hinweis|Notiz)[:\s]*([^\n]+)/i)?.[2]?.trim() ?? "";
    const lvPos = txt.match(/(LV[\s-]*Pos|Pos\.?)[:\s]*([A-Za-z0-9.\-]+)/i)?.[2]?.trim() ??
        null;
    const lsNr = txt.match(/(Lieferschein[-\s]*Nr\.?|Nr\.)[:\s]*([A-Za-z0-9\-\/]+)/i)?.[2]?.trim() ??
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
        }
    ];
}
function normalizeStatus(s) {
    const raw = String(s ?? "").trim();
    if (!raw)
        return "DRAFT";
    const u = raw.toUpperCase();
    if (u === "FREIGEGEBEN" || u.includes("FREIG") || u.includes("APPROV"))
        return "FREIGEGEBEN";
    if (u === "EINGEREICHT" || u.includes("EINGEREICH") || u.includes("SUBMIT") || u.includes("REVIEW"))
        return "EINGEREICHT";
    if (u === "ABGELEHNT" || u.includes("ABLEHN") || u.includes("REJECT"))
        return "ABGELEHNT";
    if (u === "DRAFT" || u === "ENTWURF" || u.includes("DRAFT") || u.includes("ENTWURF"))
        return "DRAFT";
    return "DRAFT";
}
function normalizeServerRow(r, projectId) {
    const candidates = [
        r?.photos,
        r?.attachments,
        r?.files,
        r?.uploadRes?.files,
        r?.document?.photos,
        r?.document?.attachments
    ];
    const source = candidates.find((list) => Array.isArray(list) && list.length > 0) || [];
    const mapped = (list) => list
        .map((ph) => ({
        id: String(ph?.id || ph?.fileId || rid()),
        name: String(ph?.name ||
            ph?.originalname ||
            ph?.filename ||
            ph?.fileId ||
            "Datei"),
        type: String(ph?.type ||
            ph?.mimetype ||
            guessType(String(ph?.name ||
                ph?.originalname ||
                ph?.filename ||
                ph?.fileId ||
                "file"))),
        url: String(ph?.url ||
            ph?.publicUrl ||
            ph?.path ||
            "")
    }))
        .filter((ph) => !!ph.url);
    const photos = mapped(source);
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
export default function Lieferscheine() {
    const { getSelectedProject } = useProject();
    const selectedProject = getSelectedProject();
    const navigate = useNavigate();
    // IMPORTANT: use FS-key if available (BA-....)
    const [projectId, setProjectId] = React.useState(selectedProject?.code || selectedProject?.id || "");
    // ✅ Routes laut App.tsx
    const PATH_BUERO = "/buro/projekte";
    const PATH_BUCHHALTUNG = "/buchhaltung/kostenuebersicht";
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState(null);
    const [pdfUrl, setPdfUrl] = React.useState(null);
    const [previewUrl, setPreviewUrl] = React.useState(null);
    // server-driven lists
    const [inboxRows, setInboxRows] = React.useState([]);
    const [freigegebenRows, setFreigegebenRows] = React.useState([]);
    const [history, setHistory] = React.useState([]);
    // selection/edit form
    const [tab, setTab] = React.useState("INBOX");
    const [selKey, setSelKey] = React.useState(null);
    const [form, setForm] = React.useState({
        projectId: projectId || "",
        date: today(),
        photos: [],
        workflowStatus: "DRAFT"
    });
    // reject modal
    const [rejectOpen, setRejectOpen] = React.useState(false);
    const [rejectText, setRejectText] = React.useState("");
    // upload staging (browser)
    const [pendingUploadFiles, setPendingUploadFiles] = React.useState(null);
    // FINAL preview (single loaded history file)
    const [finalPreview, setFinalPreview] = React.useState(null);
    // keep form.projectId coherent
    React.useEffect(() => {
        setForm((p) => ({ ...p, projectId }));
    }, [projectId]);
    /* ===== persist small UI state only ===== */
    React.useEffect(() => {
        try {
            const raw = localStorage.getItem(STATE_STORAGE_KEY);
            if (!raw)
                return;
            const parsed = JSON.parse(raw);
            if (parsed.projectId)
                setProjectId(parsed.projectId);
            if (parsed.tab)
                setTab(parsed.tab);
        }
        catch {
            /* ignore */ }
    }, []);
    React.useEffect(() => {
        try {
            localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify({ projectId, tab }));
        }
        catch {
            /* ignore */ }
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
        const res = await api(`/ls/inbox/list?projectId=${encodeURIComponent(projectId)}`);
        const items = Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [];
        const normalized = items.
            map((r) => normalizeServerRow(r, projectId)).
            filter((r) => !!r.id);
        const inbox = normalized.filter((r) => {
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
            const res = await api(`/ls/freigegeben/list?projectId=${encodeURIComponent(projectId)}`);
            const items = Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [];
            const normalized = items.
                map((r) => normalizeServerRow(r, projectId)).
                filter((r) => !!r.id).
                map((r) => ({ ...r, workflowStatus: "FREIGEGEBEN" }));
            normalized.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
            setFreigegebenRows(normalized);
            return;
        }
        catch (e) {
            // fallthrough to fallback
        } // 2) Fallback: if server keeps approved items inside inbox/list
        try {
            const res = await api(`/ls/inbox/list?projectId=${encodeURIComponent(projectId)}`);
            const items = Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [];
            const normalized = items.
                map((r) => normalizeServerRow(r, projectId)).
                filter((r) => !!r.id);
            const freig = normalized.filter((r) => normalizeStatus(r.workflowStatus) === "FREIGEGEBEN");
            freig.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
            setFreigegebenRows(freig);
        }
        catch {
            setFreigegebenRows([]);
        }
    }, [projectId]);
    const loadHistory = React.useCallback(async () => {
        if (!projectId) {
            setHistory([]);
            return;
        }
        try {
            const res = await api(`/ls/list?projectId=${encodeURIComponent(projectId)}`);
            setHistory(res?.items || []);
        }
        catch {
            setHistory([]);
        }
    }, [projectId]);
    const loadAll = React.useCallback(async () => {
        await Promise.allSettled([loadInbox(), loadFreigegeben(), loadHistory()]);
    }, [loadInbox, loadFreigegeben, loadHistory]);
    React.useEffect(() => {
        loadAll();
    }, [loadAll]);
    const deepLinkOpenedRef = React.useRef("");
    React.useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const docId = String(params.get("docId") || "").trim();
        const stageParam = String(params.get("stage") || "inbox").toLowerCase();
        if (!docId || !projectId)
            return;
        const desiredTab = stageParam === "freigegeben" || stageParam === "approved"
            ? "FREIGEGEBEN"
            : "INBOX";
        const sourceRows = desiredTab === "FREIGEGEBEN" ? freigegebenRows : inboxRows;
        const row = sourceRows.find((item) => String(item.id || "") === docId);
        const key = `${projectId}:${desiredTab}:${docId}`;
        if (!row || deepLinkOpenedRef.current === key)
            return;
        deepLinkOpenedRef.current = key;
        setTab(desiredTab);
        void selectRow(row, desiredTab);
    }, [projectId, inboxRows, freigegebenRows]);
    function setField(k, v) {
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
    async function selectRow(r, stageOverride) {
        const docId = String(r.id || "");
        if (docId && projectId) {
            try {
                const effectiveTab = stageOverride || tab;
                const endpoint = effectiveTab === "FREIGEGEBEN"
                    ? `/ls/freigegeben/read?projectId=${encodeURIComponent(projectId)}&docId=${encodeURIComponent(docId)}`
                    : `/ls/inbox/read?projectId=${encodeURIComponent(projectId)}&docId=${encodeURIComponent(docId)}`;
                const response = await api(endpoint);
                const complete = response?.item ||
                    response?.document ||
                    response?.snapshot ||
                    response?.data ||
                    response;
                if (complete && typeof complete === "object") {
                    r = normalizeServerRow(complete, projectId);
                }
            }
            catch (error) {
                console.warn("[Lieferschein] Vollständiges Dokument konnte nicht geladen werden", error);
            }
        }
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
            photos: (r.photos || r.attachments || []),
            attachments: (r.photos || r.attachments || []),
            workflowStatus: normalizeStatus(r.workflowStatus),
            submittedAt: r.submittedAt ?? null,
            approvedAt: r.approvedAt ?? null,
            rejectedAt: r.rejectedAt ?? null,
            rejectReason: r.rejectReason ?? null
        });
        setPendingUploadFiles(null);
    }
    /* ===== API: server workflow ===== */
    async function submitInboxCreate(base) {
        const payload = {
            ...base,
            projectId,
            projectCode: projectId,
            workflowStatus: normalizeStatus(base.workflowStatus),
            date: String(base.date || today()).slice(0, 10)
        };
        const res = await api(`/ls`, { method: "POST", body: JSON.stringify(payload) });
        const docId = String(res?.docId || res?.id || "").trim();
        if (!docId)
            throw new Error("Server-Submit fehlgeschlagen: docId fehlt.");
        return { docId };
    }
    async function updateInboxMeta(docId, nextMeta, files) {
        const fd = new FormData();
        fd.append("projectId", projectId);
        fd.append("docId", docId);
        fd.append("meta", JSON.stringify(nextMeta || {}));
        if (files && files.length)
            Array.from(files).forEach((f) => fd.append("files", f));
        return apiForm(`/ls/inbox/upload`, fd);
    }
    async function submitRowServer() {
        if (!projectId)
            return alert("Bitte Projekt-ID eingeben.");
        if (!form.id)
            return alert("Bitte zuerst speichern/anlegen, damit eine ID vorhanden ist.");
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
                workflowStatus: "EINGEREICHT",
                submittedAt: form.submittedAt || now,
                photos: undefined,
                attachments: undefined
            };
            await updateInboxMeta(docId, nextMeta, null);
            await loadAll();
            setTab("INBOX");
        }
        catch (e) {
            setError(msg(e));
        }
        finally {
            setLoading(false);
        }
    }
    async function approveRowServer(r) {
        const docId = String(r.id || "");
        if (!docId)
            return;
        try {
            setError(null);
            setLoading(true);
            await api(`/ls/inbox/approve`, {
                method: "POST",
                body: JSON.stringify({ projectId, docId })
            });
            await loadAll();
            clearForm();
            setTab("INBOX");
        }
        catch (e) {
            setError(msg(e));
        }
        finally {
            setLoading(false);
        }
    }
    function requestReject(r) {
        setRejectText(r.rejectReason || "");
        setRejectOpen(true);
        selectRow(r);
    }
    async function confirmReject() {
        const docId = String(form.id || "");
        if (!docId)
            return setRejectOpen(false);
        const reason = (rejectText || "").trim();
        try {
            setError(null);
            setLoading(true);
            await api(`/ls/inbox/reject`, {
                method: "POST",
                body: JSON.stringify({ projectId, docId, reason })
            });
            await loadAll();
            setRejectOpen(false);
            setTab("INBOX");
        }
        catch (e) {
            setError(msg(e));
        }
        finally {
            setLoading(false);
        }
    }
    async function saveToServerDraft() {
        if (!projectId)
            return alert("Bitte Projekt-ID eingeben.");
        try {
            setError(null);
            setLoading(true);
            const base = {
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
                await updateInboxMeta(docId, meta, pendingUploadFiles && pendingUploadFiles.length ? pendingUploadFiles : null);
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
        }
        catch (e) {
            setError(msg(e));
        }
        finally {
            setLoading(false);
        }
    }
    /* ===== Freigegeben -> Final (Historie) =====
       Expect server endpoint: POST /api/ls/save
       Suggested payload: { projectId }
       Optionally: { projectId, rows } if your server needs it
    */
    async function saveFreigegebenToFinal() {
        if (!projectId)
            return alert("Bitte Projekt-ID eingeben.");
        try {
            setError(null);
            setLoading(true);
            // try with rows (more robust)
            await api(`/ls/save`, {
                method: "POST",
                body: JSON.stringify({
                    projectId,
                    rows: freigegebenRows
                })
            });
            await loadHistory();
            alert("Freigegeben gespeichert (Final/Historie aktualisiert).");
        }
        catch (e1) {
            // fallback without rows if server expects only projectId
            try {
                await api(`/ls/save`, {
                    method: "POST",
                    body: JSON.stringify({ projectId })
                });
                await loadHistory();
                alert("Freigegeben gespeichert (Final/Historie aktualisiert).");
            }
            catch (e2) {
                setError(msg(e2));
            }
        }
        finally {
            setLoading(false);
        }
    }
    /* ===== Commit ONE Freigegeben -> Final (move single doc) ===== */
    async function commitOneFreigegebenToFinal(row) {
        if (!projectId)
            return alert("Bitte Projekt-ID eingeben.");
        const docId = String(row.id || form.id || "");
        if (!docId)
            return alert("docId fehlt.");
        try {
            setError(null);
            setLoading(true);
            // 1) Save meta (use FORM as "latest edits" if currently editing same doc)
            const meta = {
                ...form,
                id: docId,
                projectId,
                projectCode: projectId,
                workflowStatus: "FREIGEGEBEN",
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
            }
            catch {
                // fallback: save with rows (server might only implement /ls/save)
                await api(`/ls/save`, {
                    method: "POST",
                    body: JSON.stringify({ projectId, rows: [normalizeServerRow(meta, projectId)] })
                });
            }
            // 3) Reload lists + history
            await loadAll();
            // 4) Go to Final
            setTab("FINAL");
            alert("Gespeichert und nach Final verschoben.");
        }
        catch (e) {
            setError(msg(e));
        }
        finally {
            setLoading(false);
        }
    }
    async function loadSavedLsItem(item) {
        if (!projectId)
            return alert("Bitte zuerst eine Projekt-ID eingeben.");
        try {
            setLoading(true);
            setError(null);
            const res = await fetch(`${PROJECTS_BASE}/${encodeURIComponent(projectId)}/lieferscheine/${encodeURIComponent(item.filename)}`);
            if (!res.ok)
                throw new Error(await res.text());
            const data = await res.json();
            let loadedRows = [];
            if (Array.isArray(data.rows))
                loadedRows = data.rows;
            else if (data.items && Array.isArray(data.items.lieferscheine))
                loadedRows = data.items.lieferscheine;
            if (!loadedRows.length) {
                const obj = data;
                const arrays = Object.values(obj).filter((v) => Array.isArray(v));
                const candidate = arrays.find((arr) => arr.length && typeof arr[0] === "object");
                if (candidate)
                    loadedRows = candidate;
            }
            if (!loadedRows.length)
                return alert("Kein gespeicherter Lieferschein in dieser Datei gefunden.");
            const d = data.date?.slice(0, 10) || item.date?.slice(0, 10) || today();
            const list = loadedRows.
                map((r) => normalizeServerRow(r, projectId)).
                map((r) => ({
                ...r,
                projectId,
                date: (r.date || d).slice(0, 10),
                workflowStatus: "FREIGEGEBEN"
            }));
            setPdfUrl(data.pdfUrl ?? item.pdfUrl ?? null);
            setFinalPreview({ date: d, rows: list, filename: item.filename });
            setTab("FINAL");
        }
        catch (e) {
            setError(msg(e));
        }
        finally {
            setLoading(false);
        }
    }
    function linkToAufmassLocal(args) {
        if (!args.lvPos)
            return;
        const key = "aufmass-links";
        const map = JSON.parse(localStorage.getItem(key) || "{}");
        const k = `${args.projectId}:${args.lvPos}`;
        map[k] = map[k] || { regieIds: [], lsIds: [] };
        if (!map[k].lsIds.includes(args.lsId))
            map[k].lsIds.push(args.lsId);
        localStorage.setItem(key, JSON.stringify(map));
    }
    function transferToAufmassEditor() {
        const source = tab === "INBOX" ? inboxRows : tab === "FREIGEGEBEN" ? freigegebenRows : finalPreview?.rows || [];
        if (!projectId || !source.length)
            return alert("Projekt und mindestens eine Zeile erforderlich.");
        let count = 0;
        for (const r of source) {
            if (r.lvItemPos) {
                const lsId = String(r.id || rid());
                linkToAufmassLocal({ projectId, lvPos: r.lvItemPos, lsId });
                count++;
            }
        }
        if (!count)
            return alert("Keine LV-Positionen vorhanden, die ins Aufmaß übernommen werden können.");
        alert(`${count} Position(en) für das Aufmaß vorbereitet. Im Aufmaßeditor können sie übernommen werden.`);
    }
    async function importPdfLs(files) {
        if (!files || !files[0])
            return;
        if (!projectId)
            return alert("Bitte Projekt-ID eingeben.");
        try {
            setError(null);
            setLoading(true);
            const file = files[0];
            const text = await readPdfText(file);
            const parsed = parseLsFromText(text, { projectId });
            if (!parsed.length)
                return alert("Kein Text/Daten im PDF erkannt.");
            for (const pr of parsed) {
                const base = {
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
                await apiForm(`/ls/inbox/upload`, fd);
                if (base.lvItemPos)
                    linkToAufmassLocal({ projectId, lvPos: base.lvItemPos, lsId: docId });
            }
            await loadAll();
            setTab("INBOX");
        }
        catch (e) {
            setError(msg(e));
        }
        finally {
            setLoading(false);
        }
    }
    function exportXlsx(list) {
        if (!list.length)
            return alert("Keine Einträge zum Exportieren.");
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
    async function requestServerPdf(list, preview) {
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
        const result = await api(`/ls/preview`, {
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
    async function exportPdf(list, preview = false) {
        try {
            setError(null);
            setLoading(true);
            if (pendingUploadFiles?.length)
                await saveToServerDraft();
            await requestServerPdf(list.length ? list : [form], preview);
        }
        catch (e) {
            setError(msg(e));
            alert(`PDF konnte nicht erstellt werden: ${msg(e)}`);
        }
        finally {
            setLoading(false);
        }
    }
    async function exportRowPdf(row, _projectName) {
        await requestServerPdf([row], false);
    }
    function addPhotos(files) {
        if (!files)
            return;
        setPendingUploadFiles(files);
        const arr = Array.from(files).map((f) => ({
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
    function removePhoto(id) {
        setForm((p) => ({
            ...p,
            photos: (p.photos || []).filter((ph) => ph.id !== id),
            attachments: (p.attachments || []).filter((ph) => ph.id !== id)
        }));
    }
    const selectedInbox = inboxRows.find((item) => String(item.id || "") === String(form.id || ""));
    const selectedStatus = normalizeStatus(selectedInbox?.workflowStatus || form.workflowStatus);
    const canApprove = Boolean(form.id && selectedStatus === "EINGEREICHT");
    async function approveCurrent() {
        if (!form.id)
            return alert("Bitte zuerst einen Inbox-Lieferschein öffnen.");
        try {
            setLoading(true);
            setError(null);
            await saveToServerDraft();
            await approveRowServer({ ...form, id: form.id, workflowStatus: "EINGEREICHT" });
        }
        catch (e) {
            setError(msg(e));
        }
        finally {
            setLoading(false);
        }
    }
    function rejectCurrent() {
        if (!form.id)
            return alert("Bitte zuerst einen Inbox-Lieferschein öffnen.");
        requestReject({ ...form, id: form.id });
    }
    return (_jsxs("div", { className: "page rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1436", children: [_jsx("style", { children: `
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
      ` }), _jsx(MengPageHeader, { title: "Lieferscheine", subtitle: "Mobile \u2192 Inbox \u2192 Pr\u00FCfung \u2192 Freigeben \u2192 Verwaltung" }), _jsxs("div", { className: "card rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1439", children: [_jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1440", children: [_jsxs("strong", { children: ["Inbox (Eingereicht) \u2022 ", inboxRows.length] }), _jsx("button", { className: "btn", onClick: () => navigate(PATH_BUERO), disabled: !projectId, children: "Verwaltung" }), _jsx("button", { className: "btn", onClick: loadAll, disabled: loading || !projectId, children: "Aktualisieren" })] }), _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1441", children: [_jsx("button", { onClick: approveCurrent, disabled: !canApprove || loading, className: rlcClass("btn", {
                                    background: canApprove ? "#1546B8" : undefined,
                                    color: canApprove ? "#fff" : undefined
                                }), children: "Freigeben" }), _jsx("button", { className: "btn rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1442", onClick: rejectCurrent, disabled: !canApprove || loading, children: "Ablehnen" }), _jsxs("label", { className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1443", children: [_jsx("span", { className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1444", children: "Projekt-ID" }), _jsx("input", { value: projectId, onChange: (e) => setProjectId(e.target.value), className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1445" })] })] })] }), _jsxs("div", { className: "card rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1446", children: [_jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1447", children: [_jsxs("div", { children: [_jsx("h3", { className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1448", children: "B\u00FCro-Bearbeitung" }), _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1449", children: "Mobile-Dokument laden \u2013 pr\u00FCfen, bearbeiten und direkt in Verwaltung freigeben." })] }), _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1450", children: form.material || form.comment ? "1 Position(en)" : "0 Position(en)" })] }), _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1451", children: [_jsx(FormSection, { title: "ALLGEMEINE INFORMATIONEN", children: _jsxs("div", { className: "ls-form-grid ls-general-grid", children: [_jsx(Field, { label: "Datum", children: _jsx("input", { type: "date", value: form.date || "", onChange: (e) => setField("date", e.target.value) }) }), _jsx(Field, { label: "LS-Nr.", children: _jsx("input", { value: form.lieferscheinNummer || "", onChange: (e) => setField("lieferscheinNummer", e.target.value), placeholder: "z. B. LS-001" }) }), _jsx(Field, { label: "Lieferant / Anschrift", children: _jsx("input", { value: form.supplier || "", onChange: (e) => setField("supplier", e.target.value) }) }), _jsx(Field, { label: "Kostenstelle", children: _jsx("input", { value: form.kostenstelle || "", onChange: (e) => setField("kostenstelle", e.target.value) }) })] }) }), _jsx(FormSection, { title: "LIEFERUNG UND ZUORDNUNG", children: _jsxs("div", { className: "ls-form-grid ls-delivery-grid", children: [_jsx(Field, { label: "Baustelle / Lieferort", children: _jsx("input", { value: form.site || "", onChange: (e) => setField("site", e.target.value) }) }), _jsx(Field, { label: "Fahrer / Fahrzeug", children: _jsx("input", { value: form.driver || "", onChange: (e) => setField("driver", e.target.value) }) }), _jsx(Field, { label: "Material / Leistung", children: _jsx("input", { value: form.material || "", onChange: (e) => setField("material", e.target.value) }) }), _jsx(Field, { label: "Menge", children: _jsx("input", { type: "number", step: "any", value: form.quantity ?? 0, onChange: (e) => setField("quantity", Number(e.target.value || 0)) }) }), _jsx(Field, { label: "Einheit", children: _jsx("input", { value: form.unit || "", onChange: (e) => setField("unit", e.target.value) }) }), _jsx(Field, { label: "LV-Position", children: _jsx("input", { value: form.lvItemPos || "", onChange: (e) => setField("lvItemPos", e.target.value) }) })] }) }), _jsxs(FormSection, { title: "BESCHREIBUNG UND DOKUMENTATION", children: [_jsxs("div", { className: "ls-description-grid", children: [_jsx(Field, { label: "Beschreibung", children: _jsx("textarea", { value: form.comment || "", onChange: (e) => setField("comment", e.target.value), placeholder: "Material, Lieferung und Besonderheiten", className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1452" }) }), _jsx(Field, { label: "Bemerkungen", children: _jsx("textarea", { value: form.bemerkungen || "", onChange: (e) => setField("bemerkungen", e.target.value), className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1453" }) })] }), _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1454", children: _jsx(Field, { label: "Foto / Anhang", children: _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1455", children: [_jsx("input", { id: "lsPhotosUnified", type: "file", multiple: true, accept: "image/*,application/pdf", onChange: (e) => addPhotos(e.target.files), className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1456" }), _jsx("label", { htmlFor: "lsPhotosUnified", className: "btn", children: "Dateien w\u00E4hlen" }), (form.photos || []).map((photo) => _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1457", children: [isImg(photo.type) ?
                                                                _jsx("img", { src: publicUrl(photo.url), alt: photo.name, onClick: () => setPreviewUrl(publicUrl(photo.url)), className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1458" }) :
                                                                _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1459", children: "PDF" }), _jsx("button", { type: "button", onClick: () => removePhoto(photo.id), className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1460", children: "\u00D7" })] }, photo.id))] }) }) })] }), _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1461", children: [_jsx("button", { className: "btn", onClick: saveToServerDraft, disabled: loading || !projectId, children: "Entwurf speichern" }), _jsx("button", { className: "btn", onClick: submitRowServer, disabled: loading || !form.id || !projectId, children: "Einreichen" }), _jsx("button", { className: "btn", onClick: clearForm, disabled: loading, children: "Formular leeren" }), _jsx("button", { className: "btn", onClick: () => exportXlsx(inboxRows), disabled: !inboxRows.length || loading, children: "Export XLSX" }), _jsx("button", { className: "btn", onClick: () => exportPdf([form], true), disabled: !projectId || loading, children: "PDF Vorschau" }), _jsx("button", { className: "btn", onClick: () => exportPdf([form], false), disabled: !projectId || loading, children: "PDF exportieren" }), _jsx("input", { id: "lsImportUnified", type: "file", accept: "application/pdf", onChange: (e) => importPdfLs(e.target.files), className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1462" }), _jsx("label", { htmlFor: "lsImportUnified", className: "btn", children: "Import PDF" })] }), error && _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1463", children: error }), loading && _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1464", children: "RLC arbeitet\u2026" })] })] }), _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1465", children: [_jsxs("div", { className: "card rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1466", children: [_jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1467", children: [_jsx("strong", { children: "PDF Vorschau" }), _jsx("span", { className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1468", children: pdfUrl ? "RLC PDF Core" : "Noch kein PDF geladen" })] }), pdfUrl ?
                                _jsx("iframe", { src: pdfUrl, title: "Lieferschein PDF Vorschau", className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1469" }) :
                                _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1470", children: "Lieferschein w\u00E4hlen oder PDF Vorschau erzeugen\u2026" })] }), _jsxs("div", { className: "card rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1471", children: [_jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1472", children: [_jsx("strong", { children: "Inbox (Eingereicht)" }), _jsxs("span", { className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1473", children: [inboxRows.length, " Eintrag(e)"] })] }), _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1474", children: inboxRows.length === 0 ?
                                    _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1475", children: "Keine Lieferscheine in der Inbox." }) :
                                    inboxRows.map((row) => _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1476", children: [_jsxs("div", { children: [_jsxs("strong", { children: [row.date || "—", " \u00B7 ", row.lieferscheinNummer || "ohne LS-Nr."] }), _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1477", children: [row.supplier || "—", " \u00B7 ", row.material || "—", " \u00B7 ", normalizeStatus(row.workflowStatus)] })] }), _jsx("button", { className: "btn", onClick: () => selectRow(row), children: "\u00D6ffnen" })] }, row.id)) })] })] }), _jsxs("div", { className: "card rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1478", children: [_jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1479", children: [_jsx("strong", { children: "Verwaltung \u00B7 freigegebene Lieferscheine" }), _jsxs("span", { className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1480", children: [history.length, " Dokument(e)"] })] }), _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1481", children: _jsxs("table", { className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1482", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx(Th, { children: "Datum" }), _jsx(Th, { children: "Dokument" }), _jsx(Th, { children: "Positionen" }), _jsx(Th, { children: "Gespeichert" }), _jsx(Th, { children: "Aktion" })] }) }), _jsx("tbody", { children: history.length === 0 ?
                                        _jsx("tr", { children: _jsx(Td, { colSpan: 5, style: { textAlign: "center" }, children: "Noch keine freigegebenen Lieferscheine." }) }) :
                                        history.map((item) => _jsxs("tr", { children: [_jsx(Td, { children: item.date }), _jsx(Td, { children: item.filename }), _jsx(Td, { children: item.rows }), _jsx(Td, { children: item.savedAt ? new Date(item.savedAt).toLocaleString("de-DE") : "—" }), _jsx(Td, { children: _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1483", children: [_jsx("button", { className: "btn", onClick: () => loadSavedLsItem(item), children: "Laden" }), item.pdfUrl &&
                                                                _jsx("a", { className: "btn", href: publicUrl(item.pdfUrl), target: "_blank", rel: "noreferrer", children: "PDF" })] }) })] }, item.filename)) })] }) })] }), rejectOpen &&
                _jsx("div", { onClick: () => setRejectOpen(false), className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1484", children: _jsxs("div", { onClick: (e) => e.stopPropagation(), className: "card rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1485", children: [_jsx("strong", { children: "Ablehnen \u2013 Grund" }), _jsx("textarea", { value: rejectText, onChange: (e) => setRejectText(e.target.value), className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1486" }), _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1487", children: [_jsx("button", { className: "btn", onClick: () => setRejectOpen(false), children: "Abbrechen" }), _jsx("button", { className: "btn", onClick: confirmReject, children: "Ablehnen" })] })] }) }), previewUrl &&
                _jsx("div", { onClick: () => setPreviewUrl(null), className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1488", children: _jsx("img", { src: previewUrl, alt: "Vorschau", className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1489" }) })] }));
}
/* ===== UI helpers ===== */
function FormSection(props) {
    return (_jsxs("section", { children: [_jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1490", children: [_jsx("strong", { className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1491", children: props.title }), _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1492" })] }), props.children] }));
}
function Field(props) {
    const controls = React.Children.map(props.children, (child) => {
        if (!React.isValidElement(child))
            return child;
        const element = child;
        return React.cloneElement(element, {
            style: {
                width: "100%",
                minWidth: 0,
                boxSizing: "border-box",
                ...(element.props.style || {})
            }
        });
    });
    return (_jsxs("label", { className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1493", children: [_jsx("span", { className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1494", children: props.label }), controls] }));
}
function TabBtn(props) {
    return (_jsx("button", { onClick: props.onClick, className: rlcClass("btn", {
            fontSize: 12,
            padding: "4px 10px",
            border: props.active ? "1px solid var(--text)" : undefined,
            opacity: props.active ? 1 : 0.8
        }), children: props.label }));
}
function L(props) {
    return (_jsxs("label", { className: rlcClass(null, {
            display: "grid",
            gridTemplateColumns: props.full ? "1fr" : "110px 1fr",
            gap: 4,
            alignItems: "center",
            ...props.style
        }), children: [_jsx("span", { className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1495", children: props.label }), _jsx("div", { children: props.children })] }));
}
function Th({ children }) {
    return (_jsx("th", { className: "rlc-migrated-pages-mengenermittlung-lieferscheine-tsx-1496", children: children }));
}
function Td(props) {
    const { children, style, ...rest } = props;
    return (_jsx("td", { ...rest, className: rlcClass(null, {
            padding: "6px 8px",
            borderBottom: "1px solid var(--line)",
            verticalAlign: "top",
            fontSize: 12,
            ...style
        }), children: children }));
}
