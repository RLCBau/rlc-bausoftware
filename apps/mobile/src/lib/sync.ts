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
 * ✅ NEW FIX (MOBILE UI):
 * - Dopo sync PHOTO_NOTE, scrive anche nelle 2 AsyncStorage Inbox keys:
 *   rlc_mobile_inbox_photos:${BA} e rlc_mobile_inbox_fotos:${BA}
 *   così InboxScreen/Eingangsprüfung vede subito le righe.
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

function nowIso() {
  return new Date().toISOString();
}

async function loadArray(key: string): Promise<any[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveArray(key: string, arr: any[]) {
  await AsyncStorage.setItem(key, JSON.stringify(arr || []));
}

function upsertRow(list: any[], row: any) {
  const next = Array.isArray(list) ? [...list] : [];
  const idx = next.findIndex(
    (x) => String(x?.id || "") === String(row?.id || "")
  );
  const merged = { ...row, updatedAt: nowIso() };
  if (idx >= 0) next[idx] = { ...next[idx], ...merged };
  else next.unshift(merged);
  return next;
}

/** Inbox keys for Fotos (keep BOTH) */
function inboxFotosKey(projectKey: string) {
  return `rlc_mobile_inbox_fotos:${projectKey}`;
}
function inboxPhotosKey(projectKey: string) {
  return `rlc_mobile_inbox_photos:${projectKey}`;
}

/** Write Photos rows to Offline-Inbox keys so InboxScreen can display immediately */
async function writePhotosToOfflineInbox(projectKey: string, row: any) {
  const k1 = inboxPhotosKey(projectKey);
  const k2 = inboxFotosKey(projectKey);

  const arr1 = await loadArray(k1);
  await saveArray(k1, upsertRow(arr1, row));

  const arr2 = await loadArray(k2);
  await saveArray(k2, upsertRow(arr2, row));
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
    return api.postRegie(pk, payload);
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
        const up = await api.uploadLieferschein(pk, img, p.note || p.comment);
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

    return api.commitLieferschein(pk, commitPayload);
  }

  // =========================
  // PHOTO_NOTE / FOTOS_NOTIZEN  ✅ FIX: INBOX MULTIPART + LOCAL INBOX WRITE
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

    // 1) Upload server inbox
    const res = await uploadPhotoNoteInbox(pk, payload);

    // 2) ✅ After server success: ensure local Inbox keys contain the row
    //    so EingangPrüfung/InboxScreen shows it immediately and consistently
    await writePhotosToOfflineInbox(pk, {
      id: String(payload?.docId || payload?.id || uid("ph")),
      kind: "fotos",
      workflowStatus: "EINGEREICHT",
      projectCode: pk,
      projectId: pk,
      date: String(payload?.date || "").slice(0, 10),
      kostenstelle: String(payload?.kostenstelle || ""),
      lvItemPos: payload?.lvItemPos ?? null,
      comment: String(payload?.comment || ""),
      bemerkungen: String(payload?.bemerkungen || ""),
      note: String(payload?.note || payload?.comment || ""),
      imageUri: payload?.imageUri || null,
      files: Array.isArray(payload?.files) ? payload.files : [],
      attachments: Array.isArray(payload?.attachments) ? payload.attachments : [],
      extras: payload?.extras,
      boxes: payload?.boxes,
      syncedAt: nowIso(),
    });

    return res;
  }

  throw new Error("Unknown queue item");
}
