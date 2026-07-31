// apps/mobile/src/lib/sync.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./api";
import { queueList, queueUpdate, QueueItem, DateiMeta } from "./offlineQueue";

/**
 * ✅ POLICY:
 * - Il server FS vuole projectKey = project.code (es. BA-2025-DEMO)
 * - La queue può contenere UUID o code
 * - syncAll deve poter sincronizzare SOLO il progetto corrente
 *
 * ⚠️ BUG FIX CRITICO:
 * - Non bisogna usare opts.projectCode per mappare ogni item,
 *   altrimenti tutti gli item risultano dello stesso progetto.
 *
 * ✅ PHOTO_NOTE FIX (CRITICO):
 * - Foto/Notizen devono andare in: projects/<BA>/inbox/fotos/<docId>/...
 * - Endpoint corretto server: POST /api/fotos/inbox/upload
 * - multipart fields:
 *   - main (1)   -> doc root
 *   - files (N)  -> doc/files
 *
 * ✅ MODE SEPARATION:
 * - SERVER_SYNC sends documents only to the server-side Eingang / Prüfung.
 * - NUR_APP uses the offline Inbox via AsyncStorage.
 * - sync.ts must never mirror SERVER_SYNC documents into the offline Inbox.
 */

let _projectMap: Map<string, string> | null = null;

async function loadProjectMap(): Promise<Map<string, string>> {
  if (_projectMap) return _projectMap;

  const map = new Map<string, string>();
  try {
    const projects = await api.projects();
    for (const p of projects) {
      const id = String((p as any).id || "").trim();
      const code = String((p as any).code || "").trim();

      if (id && code) map.set(id, code);
      if (code) map.set(code, code);
    }
  } catch {
    // best effort
  }

  _projectMap = map;
  return map;
}

type SyncOptions = {
  /** projectId può essere UUID oppure già code */
  projectId?: string;
  /** se disponibile, vince per definire il progetto target */
  projectCode?: string;
};

function looksLikeProjectCode(s: string) {
  // tu usi BA-2025-... / BA-2025_...
  return /^BA-\d{4}[-_]/i.test(s);
}

/** ✅ Key per ITEM: mai forzare con opts.projectCode */
async function projectKeyForItem(rawProjectId: string): Promise<string> {
  const pid = String(rawProjectId || "").trim();
  if (!pid) return pid;

  if (looksLikeProjectCode(pid)) return pid;

  const map = await loadProjectMap();
  return map.get(pid) || pid; // fallback = pid
}

/** ✅ Key per TARGET: qui sì che projectCode vince */
async function projectKeyForTarget(opts?: SyncOptions): Promise<string> {
  const forced = String(opts?.projectCode || "").trim();
  if (forced) return forced;

  const pid = String(opts?.projectId || "").trim();
  if (!pid) return "";

  if (looksLikeProjectCode(pid)) return pid;

  const map = await loadProjectMap();
  return map.get(pid) || pid;
}

/**
 * ✅ syncAll può sincronizzare:
 * - tutto (se opts non dato)
 * - SOLO un progetto (se opts.projectId o opts.projectCode dato)
 */
export async function syncAll(
  opts?: SyncOptions
): Promise<{ ok: number; fail: number }> {
  const list = await queueList();
  let ok = 0,
    fail = 0;

  // preload map (best effort)
  await loadProjectMap();

  const targetPk = await projectKeyForTarget(opts);

  for (const item of list) {
    if (item.status === "DONE") continue;

    // ✅ filtro per progetto (se richiesto)
    if (targetPk) {
      const itemPk = await projectKeyForItem(item.projectId);
      if (itemPk !== targetPk) continue;
    }

    try {
      await syncOne(item);
      await queueUpdate(item.id, { status: "DONE", error: undefined });
      ok++;
    } catch (e: any) {
      await queueUpdate(item.id, {
        status: "ERROR",
        error: e?.message || "sync failed",
      });
      fail++;
    }
  }
  return { ok, fail };
}

function normalizeLsUploadItems(
  up: any
): Array<{ name: string; type: string; publicUrl: string }> {
  const items = Array.isArray(up?.items) ? up.items : [];
  return items
    .map((x: any) => ({
      name: String(x?.name || "upload"),
      type: String(x?.type || "application/octet-stream"),
      publicUrl: String(x?.publicUrl || ""),
    }))
    .filter((x: any) => !!x.publicUrl);
}

/** =========================
 * PHOTO_NOTE: helpers
 * ========================= */

function inferImageMetaFromUri(uri: string) {
  const u = String(uri || "").toLowerCase();
  if (u.endsWith(".heic") || u.includes("heic"))
    return { ext: "heic", mime: "image/heic" };
  if (u.endsWith(".heif") || u.includes("heif"))
    return { ext: "heif", mime: "image/heif" };
  if (u.endsWith(".png")) return { ext: "png", mime: "image/png" };
  if (u.endsWith(".webp")) return { ext: "webp", mime: "image/webp" };
  return { ext: "jpg", mime: "image/jpeg" };
}

function uid(prefix = "ph") {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
}

/** token + base url like in screens (hard, no guessing) */
async function serverRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = await AsyncStorage.getItem("auth_token");
  const headers: Record<string, any> = { ...(init.headers as any) };

  // JSON only (NOT for FormData)
  if (!headers["Content-Type"] && !(init.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  if (token) headers.Authorization = `Bearer ${token}`;

  let base = "";
  try {
    base = String(
      (api as any)?.getApiUrl
        ? await (api as any).getApiUrl()
        : (api as any)?.apiUrl || ""
    ).replace(/\/$/, "");
  } catch {
    base = String((api as any)?.apiUrl || "").replace(/\/$/, "");
  }

  const res = await fetch(`${base}${path}`, { ...init, headers });
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
  return (text ? JSON.parse(text) : null) as T;
}

/** ✅ FINAL: upload Foto/Notiz in Server INBOX */
async function uploadPhotoNoteInbox(pk: string, p: any) {
  if (!looksLikeProjectCode(pk))
    throw new Error("PHOTO_NOTE: projectKey is not BA-...");

  const docId = String(p?.docId || p?.id || "").trim() || uid("ph");
  const date =
    String(p?.date || "").slice(0, 10) ||
    new Date().toISOString().slice(0, 10);

  const filesArr: DateiMeta[] = Array.isArray(p?.files)
    ? p.files
    : Array.isArray(p?.attachments)
    ? p.attachments
    : [];

  // pick main: prefer imageUri, else first attachment
  const mainUri =
    String(p?.imageUri || "").trim() ||
    String(filesArr?.[0]?.uri || "").trim();
  const remaining =
    mainUri && !String(p?.imageUri || "").trim() ? filesArr.slice(1) : filesArr;

  const fd = new FormData();
  fd.append("projectId", pk);
  fd.append("docId", docId);
  fd.append("date", date);
  fd.append("workflowStatus", String(p?.workflowStatus || "EINGEREICHT"));
  fd.append("comment", String(p?.comment ?? p?.note ?? ""));
  fd.append("bemerkungen", String(p?.bemerkungen ?? ""));
  fd.append("kostenstelle", String(p?.kostenstelle ?? ""));
  fd.append("lvItemPos", p?.lvItemPos ?? "");

  if (p?.extras) fd.append("extras", JSON.stringify(p.extras));
  if (p?.boxes) fd.append("boxes", JSON.stringify(p.boxes));

  // ✅ main as field "main"
  if (mainUri) {
    const meta = inferImageMetaFromUri(mainUri);
    fd.append(
      "main",
      { uri: mainUri, name: `main_${docId}.${meta.ext}`, type: meta.mime } as any
    );
  }

  // ✅ attachments as field "files"
  for (const f of remaining) {
    const uri = String(f?.uri || "").trim();
    if (!uri) continue;

    const meta = inferImageMetaFromUri(uri);
    const name = String(f?.name || `file_${docId}.${meta.ext}`).trim();
    const type = String(f?.type || meta.mime).trim();

    fd.append("files", { uri, name, type } as any);
  }

  // ✅ endpoint CORRETTO del tuo server (routes/fotos.ts)
  return serverRequest("/api/fotos/inbox/upload", {
    method: "POST",
    body: fd as any,
  });
}

async function syncOne(item: QueueItem) {
  // ✅ pk basato sull'item stesso (mai forzato)
  const pk = await projectKeyForItem(item.projectId);

  // =========================
  // REGIE
  // =========================
  if (item.kind === "REGIE") {
    const payload = {
      ...(item.payload || {}),
      projectId: pk, // server FS-key
    };
    return (api as any).pushRegieToServer(pk, payload);
  }

  // Tagesbericht e Bautagebuch condividono il workflow Regie sul server.
  if (item.kind === "TAGESBERICHT" || item.kind === "BAUTAGEBUCH") {
    const p: any = item.payload || {};
    const row = p?.row ?? p;
    return serverRequest("/api/regie", {
      method: "POST",
      body: JSON.stringify({
        ...row,
        projectId: pk,
        projectCode: pk,
        date: String(row?.date || new Date().toISOString().slice(0, 10)),
        reportType: item.kind,
        workflowStatus: "EINGEREICHT",
      }),
    });
  }

  // =========================
  // LIEFERSCHEIN (Upload + Commit)
  // =========================
  if (item.kind === "LIEFERSCHEIN") {
    const p: any = item.payload || {};

    const uploads: Array<{ name: string; type: string; publicUrl: string }> = [];
    const files: DateiMeta[] = Array.isArray(p.files) ? p.files : [];

    // a) Multi-files (preferito): UNA chiamata a /api/ls/upload
    if (files.length > 0) {
      const batch = files
        .map((f) => ({
          uri: f?.uri,
          name: f?.name,
          type: f?.type,
        }))
        .filter((f) => !!f.uri) as Array<{ uri: string; name?: string; type?: string }>;

      if (batch.length) {
        // deve esistere in api.ts:
        // uploadLieferscheinFiles(projectKey, batch, note?)
        const up = await (api as any).uploadLieferscheinFiles(
          pk,
          batch,
          p.note || p.comment
        );
        uploads.push(...normalizeLsUploadItems(up));
      }
    } else {
      // b) fallback vecchio: singolo imageUri
      const img = p.imageUri as string | undefined;
      if (img) {
        const up = await (api as any).uploadLieferscheinFiles(pk, [
  {
  uri: typeof img === "string" ? img : String((img as any)?.uri || ""),
  name:
    typeof img === "string"
      ? img.split("/").pop() || "file"
      : String((img as any)?.name || "file"),
  type:
    typeof img === "string"
      ? "application/octet-stream"
      : String((img as any)?.type || "application/octet-stream"),
},
]);
        uploads.push(...normalizeLsUploadItems(up));
      }
    }

    const rowFromPayload = {
      projectId: pk,
      date: p.date,
      lieferscheinNummer: p.lieferscheinNummer,
      supplier: p.supplier,
      site: p.site,
      driver: p.driver,
      material: p.material,
      quantity: p.quantity,
      unit: p.unit,
      kostenstelle: p.kostenstelle,
      lvItemPos: p.lvItemPos ?? null,
      comment: p.comment ?? p.note ?? "",
      bemerkungen: p.bemerkungen ?? "",
      photos: uploads.map((u) => ({
        name: u.name,
        type: u.type,
        uri: u.publicUrl,
      })),
    };

    const existingRows =
      (Array.isArray(p.rows) && p.rows) ||
      (Array.isArray(p?.items?.lieferscheine) && p.items.lieferscheine) ||
      null;

    const rowsRaw =
      existingRows && existingRows.length ? existingRows : [rowFromPayload];
    const rows = rowsRaw.map((r: any) => ({ ...r, projectId: pk }));

    const commitPayload = {
      date: p.date || rowFromPayload.date,
      note: p.note || p.comment || "",
      bemerkungen: p.bemerkungen || "",
      lieferscheinNummer: p.lieferscheinNummer,

      rows,
      items: p.items || { aufmass: [], lieferscheine: rows },

      attachments: uploads.map((u) => ({
        name: u.name,
        type: u.type,
        publicUrl: u.publicUrl,
      })),

      ...p,

      upload: uploads,

      projectId: pk,
    };

    return (api as any).commitLieferscheinLegacy(pk, commitPayload);
  }

  // =========================
  // PHOTO_NOTE / FOTOS_NOTIZEN  ✅ SERVER INBOX ONLY
  // =========================
  if (item.kind === "PHOTO_NOTE" || item.kind === "FOTOS_NOTIZEN") {
    const p: any = item.payload || {};
    const r = p?.row ?? p;

    const payload = {
      docId: p?.docId || r?.id || p?.id,
      id: p?.id || r?.id,
      date: r?.date,
      workflowStatus: r?.workflowStatus || p?.workflowStatus || "EINGEREICHT",
      comment: r?.comment ?? r?.note ?? p?.comment ?? p?.note ?? "",
      bemerkungen: r?.bemerkungen ?? p?.bemerkungen ?? "",
      note: r?.note ?? p?.note ?? "",
      kostenstelle: r?.kostenstelle ?? p?.kostenstelle ?? "",
      lvItemPos: r?.lvItemPos ?? p?.lvItemPos ?? null,
      imageUri: r?.imageUri ?? p?.imageUri ?? null,
      files: Array.isArray(r?.files)
        ? r.files
        : Array.isArray(p?.files)
        ? p.files
        : [],
      attachments: Array.isArray(r?.attachments)
        ? r.attachments
        : Array.isArray(p?.attachments)
        ? p.attachments
        : [],
      extras: r?.extras ?? p?.extras,
      boxes: r?.boxes ?? p?.boxes,
    };

    // SERVER_SYNC: upload only to the server-side Eingang / Prüfung.
    // The offline Inbox is reserved exclusively for NUR_APP mode.
    return uploadPhotoNoteInbox(pk, payload);
  }

  if (
    item.kind === "ANGEBOT" ||
    item.kind === "MENGENERMITTLUNG" ||
    item.kind === "ABSCHLAGSRECHNUNG" ||
    item.kind === "RECHNUNG" ||
    item.kind === "KALKULATION" ||
    item.kind === "OUTLIER_REPORT"
  ) {
    const p: any = item.payload || {};
    const row = p?.row ?? p;
    return serverRequest(
      `/api/inbox/${encodeURIComponent(pk)}/${encodeURIComponent(item.kind)}/submit`,
      {
        method: "POST",
        body: JSON.stringify({ ...row, projectId: pk, projectCode: pk }),
      }
    );
  }

  throw new Error("Unknown queue item");
}
