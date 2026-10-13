// apps/mobile/src/lib/offlineQueue.ts
import { getJson, setJson, uid } from "./storage";
import { getAuthMode, getAuthState } from "./auth";

/** ===== Web-Align Types (aus ManuellFoto.tsx) ===== */
export type DetectBox = {
  id: string;
  label: string;
  score: number;
  qty?: number;
  unit?: string;
  box?: [number, number, number, number];
};

export type ExtraRow = {
  id: string;
  typ: "KI" | "Manuell";
  lvPos?: string;
  beschreibung: string;
  einheit: string;
  menge: number;
};

export type DateiMeta = {
  id?: string;
  name?: string;
  uri?: string;
  type?: string;
};

/**
 * ✅ FS-Key policy (Mobile offline):
 * - Queue speichert projectId come FS-key (project.code), es. "BA-2025-DEMO"
 * - Mai UUID (DB) in queue
 */
function normalizeProjectKey(input: string): string {
  const v = String(input || "").trim();
  if (!v) return "UNKNOWN";

  if (/^BA-\d{4}[-_]/i.test(v)) return v;

  // UUID -> NON lo vogliamo in queue
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      v
    )
  ) {
    return "UNKNOWN";
  }

  return v;
}

/** ============================================================
 * Queue Item Types
 * ============================================================ */
export type QueueStatus = "PENDING" | "DONE" | "ERROR";

export type QueueItemBase = {
  id: string;
  ts: number;

  /** ✅ sempre FS-key (project.code) */
  projectId: string;

  status: QueueStatus;
  error?: string;

  /** retry */
  tries: number;
  lastTryAt?: number | null;
  nextTryAt?: number | null;

  /** dedupe */
  dedupeKey?: string;

  /** opzionale: risultato server, per debug */
  result?: any;
};

export type TagesberichtLineQueue = {
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

export type QueueItem =
  | (QueueItemBase & {
      kind: "REGIE";
      payload: {
        // compat
        date: string;
        text: string;
        hours?: number;
        note?: string;

        // esteso (se vuoi passare tutto il row)
        row?: any;
      };
    })
  | (QueueItemBase & {
      kind: "LIEFERSCHEIN";
      payload: {
        /** compat vecchio */
        note?: string;
        imageUri?: string;

        /** fields coerenti con screen */
        date?: string;
        zeitVon?: string;
        zeitBis?: string;

        lieferscheinNummer?: string;
        supplier?: string;
        site?: string;
        driver?: string;
        material?: string;
        quantity?: number;
        unit?: string;

        kostenstelle?: string;
        lvItemPos?: string | null;

        comment?: string;
        bemerkungen?: string;

        files?: DateiMeta[];

        // esteso (se vuoi passare tutto il row)
        row?: any;
      };
    })
  | (QueueItemBase & {
      kind: "PHOTO_NOTE" | "FOTOS_NOTIZEN";
      payload: {
        createdAt?: string;
        note?: string;
        imageUri?: string | null;
        imageMeta?: DateiMeta | null;
        extras?: ExtraRow[];
        boxes?: DetectBox[];
        // extra fields (compat per PhotosNotes)
        docId?: string;
        date?: string;
        kostenstelle?: string;
        lvItemPos?: string | null;
        comment?: string;
        bemerkungen?: string;
        files?: DateiMeta[];
      };
    })
  | (QueueItemBase & {
      kind: "TAGESBERICHT";
      payload: {
        date: string;
        weather?: string;
        temperature?: string;
        issues?: string;
        notes?: string;
        lines?: TagesberichtLineQueue[];

        // summary compat
        text?: string;
        note?: string;

        // esteso
        row?: any;
      };
    });

// Legacy data remains stored under rlc.queue.v2 for controlled recovery.

// Server queues belong to a specific authenticated identity. Legacy data is
// retained in-place for manual recovery, never silently adopted by a new user.
async function queueKey(): Promise<string> {
  const mode = await getAuthMode();
  if (mode === "NUR_APP") {
    const localState = await getAuthState("NUR_APP");
    const localIdentity = String(localState?.email || "").trim().toLowerCase();
    if (!localIdentity) throw new Error("QUEUE_LOCAL_IDENTITY_REQUIRED");
    // Never expose an older global queue to a newly signed-in local user.
    return `rlc.queue.v3:NUR_APP:${encodeURIComponent(localIdentity)}`;
  }
  const state = await getAuthState("SERVER_SYNC");
  const identity = String(state?.userId || state?.email || "").trim().toLowerCase();
  if (!identity) throw new Error("QUEUE_AUTH_REQUIRED");
  const company = String(state?.companyId || "").trim().toLowerCase();
  if (!company) throw new Error("QUEUE_COMPANY_REQUIRED");
  return `rlc.queue.v3:SERVER_SYNC:${encodeURIComponent(company)}:${encodeURIComponent(identity)}`;
}
async function lockKey(): Promise<string> {
  return `${await queueKey()}.lock`;
}

/** ============================================================
 * Small helpers
 * ============================================================ */

function isPlainObject(x: any): x is Record<string, any> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function stableStringify(obj: any): string {
  if (obj == null) return "null";
  if (typeof obj !== "object") return JSON.stringify(obj);

  if (Array.isArray(obj)) {
    return `[${obj.map(stableStringify).join(",")}]`;
  }

  const o = obj as Record<string, any>;
  const keys = Object.keys(o).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(",")}}`;
}

function hashString(s: string): string {
  // semplice hash (non crypto) sufficiente per dedupeKey
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function computeDedupeKey(item: {
  kind: QueueItem["kind"];
  projectId: string;
  payload: any;
}): string {
  // Evita campi volatili (es. createdAt locale) se presenti
  const payload = isPlainObject(item.payload) ? { ...item.payload } : item.payload;

  if (isPlainObject(payload)) {
    delete (payload as any).createdAt;
    delete (payload as any).ts;
    delete (payload as any).id;

    // row completo: troppo variabile -> lascia, ma almeno non includere syncStatus/error
    if (isPlainObject((payload as any).row)) {
      const r = { ...(payload as any).row };
      delete (r as any).syncStatus;
      delete (r as any).syncError;
      delete (r as any).server;
      delete (r as any).result;
      (payload as any).row = r;
    }
  }

  const base = `${item.kind}|${item.projectId}|${stableStringify(payload)}`;
  return `${item.kind}_${hashString(base)}`;
}

function nowMs() {
  return Date.now();
}

function computeNextTryAt(tries: number) {
  // exp backoff: 2^tries seconds, clamp 5s..5min, jitter 0-30%
  const base = Math.min(300000, Math.max(5000, Math.pow(2, tries) * 1000));
  const jitter = base * (Math.random() * 0.3);
  return nowMs() + Math.round(base + jitter);
}

function isOfflineLikeMessage(msgLower: string) {
  return (
    msgLower === "offline" ||
    msgLower === "timeout" ||
    msgLower.includes("network request failed") ||
    msgLower.includes("failed to fetch") ||
    msgLower.includes("networkerror") ||
    msgLower.includes("socket") ||
    msgLower.includes("ecconn")
  );
}

async function clearLock() {
  try {
    await setJson(await lockKey(), null as any);
  } catch {
    // ignore
  }
}

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const lock = await getJson<{ at: number; id: string } | null>(await lockKey(), null);
  const t = nowMs();

  // lock stale dopo 60s
  if (lock && t - lock.at < 60000) {
    throw new Error("QUEUE_LOCKED");
  }

  const lockId = uid("qlock");
  await setJson(await lockKey(), { at: t, id: lockId });

  try {
    return await fn();
  } finally {
    const cur = await getJson<{ at: number; id: string } | null>(await lockKey(), null);
    if (cur?.id === lockId) {
      await clearLock();
    }
  }
}

/** ============================================================
 * Public API
 * ============================================================ */

export async function queueLegacyRecoveryPreview(): Promise<{ total: number; projects: string[] }> {
  // Metadata only: legacy payloads may contain personal or financial information.
  const rows = await getJson<QueueItem[]>("rlc.queue.v2", []);
  if (!Array.isArray(rows)) return { total: 0, projects: [] };
  return {
    total: rows.length,
    projects: [...new Set(rows.map(x => String(x?.projectId || "").trim()).filter(Boolean))],
  };
}

/**
 * Explicit recovery: caller must show the project list, verify the owner and
 * receive confirmation from the signed-in user. Never delete the legacy copy.
 * Refuse recovery if any legacy project is outside the active company.
 */
export async function queueRecoverLegacy(
  confirmedProjectIds: string[],
  serverAuthorizedProjectIds: string[]
): Promise<{ imported: number; retained: number }> {
  if ((await getAuthMode()) !== "SERVER_SYNC") throw new Error("RECOVERY_SERVER_LOGIN_REQUIRED");
  const state = await getAuthState("SERVER_SYNC");
  if (!state?.companyId || !(state.userId || state.email)) throw new Error("RECOVERY_IDENTITY_REQUIRED");
  const rows = await getJson<QueueItem[]>("rlc.queue.v2", []);
  if (!Array.isArray(rows) || !rows.length) return { imported: 0, retained: 0 };
  const approved = new Set(confirmedProjectIds.map(x => String(x).trim()));
  const authorized = new Set(serverAuthorizedProjectIds.map(x => String(x).trim()));
  if (!rows.every(x => approved.has(String(x?.projectId || "").trim()) && authorized.has(String(x?.projectId || "").trim()))) {
    throw new Error("RECOVERY_PROJECT_OWNERSHIP_NOT_CONFIRMED");
  }
  const key = await queueKey();
  const existing = await getJson<QueueItem[]>(key, []);
  const target = Array.isArray(existing) ? existing : [];
  const seen = new Set(target.map(x => String(x.id)));
  const toImport = rows.filter(x => x?.id && !seen.has(String(x.id)));
  await setJson(key, [...target, ...toImport]);
  return { imported: toImport.length, retained: rows.length };
}


export async function queueList(): Promise<QueueItem[]> {
  const list = await getJson<QueueItem[]>(await queueKey(), []);
  return Array.isArray(list) ? list : [];
}

export async function queueStats(projectId?: string): Promise<{
  total: number;
  pending: number;
  error: number;
  done: number;
  nextDueAt?: number | null;
}> {
  const list = await queueList();
  const key = projectId ? normalizeProjectKey(projectId) : null;
  const filtered = key ? list.filter((x) => x.projectId === key) : list;

  let pending = 0;
  let error = 0;
  let done = 0;
  let nextDueAt: number | null = null;

  for (const x of filtered) {
    if (x.status === "PENDING") pending++;
    else if (x.status === "ERROR") error++;
    else if (x.status === "DONE") done++;

    if (x.status === "PENDING" || x.status === "ERROR") {
      const due = x.nextTryAt ?? null;
      if (due != null) {
        nextDueAt = nextDueAt == null ? due : Math.min(nextDueAt, due);
      }
    }
  }

  return { total: filtered.length, pending, error, done, nextDueAt };
}

/**
 * ✅ queueAdd:
 * - normalizza projectId (FS-key)
 * - crea dedupeKey
 * - se item uguale già PENDING/ERROR => non duplica
 */
export async function queueAdd(
  item: Omit<
    QueueItem,
    | "id"
    | "ts"
    | "status"
    | "tries"
    | "lastTryAt"
    | "nextTryAt"
    | "dedupeKey"
    | "error"
    | "result"
  >
): Promise<QueueItem> {
  const list = await queueList();
  const projectId = normalizeProjectKey((item as any)?.projectId);

  const dedupeKey = computeDedupeKey({
    kind: (item as any).kind,
    projectId,
    payload: (item as any).payload,
  });

  const existing = list.find(
    (x) =>
      x.dedupeKey === dedupeKey &&
      x.projectId === projectId &&
      (x.status === "PENDING" || x.status === "ERROR")
  );
  if (existing) return existing;

  const full: QueueItem = {
    ...(item as any),
    id: uid("q"),
    ts: nowMs(),
    projectId,
    status: "PENDING",
    tries: 0,
    lastTryAt: null,
    nextTryAt: null,
    dedupeKey,
    error: undefined,
    result: undefined,
  };

  list.unshift(full);
  await setJson(await queueKey(), list);
  return full;
}

export async function queueUpdate(id: string, patch: Partial<QueueItem>) {
  const list = await queueList();
  const next = list.map((x) => (x.id === id ? ({ ...x, ...patch } as any) : x));
  await setJson(await queueKey(), next);
}

export async function queueRemove(id: string) {
  const list = await queueList();
  await setJson(await queueKey(), list.filter((x) => x.id !== id));
}

export async function queueClearAll() {
  await setJson(await queueKey(), []);
  await clearLock();
}

export async function queueByProject(projectId: string) {
  const list = await queueList();
  const key = normalizeProjectKey(projectId);
  return list.filter((x) => x.projectId === key);
}

export async function queuePending(projectId?: string) {
  const list = await queueList();
  if (!projectId) return list.filter((x) => x.status === "PENDING");
  const key = normalizeProjectKey(projectId);
  return list.filter((x) => x.projectId === key && x.status === "PENDING");
}

export async function queueRetry(id: string) {
  await queueUpdate(id, {
    status: "PENDING",
    error: undefined,
    nextTryAt: null,
  });
}

export async function queueRetryAll(projectId?: string) {
  const list = await queueList();
  const key = projectId ? normalizeProjectKey(projectId) : null;
  const next = list.map((x) => {
    if (x.status !== "ERROR") return x;
    if (key && x.projectId !== key) return x;
    return { ...x, status: "PENDING", error: undefined, nextTryAt: null } as any;
  });
  await setJson(await queueKey(), next);
}

export async function queueCleanupDone() {
  const list = await queueList();
  const next = list.filter((x) => x.status !== "DONE");
  await setJson(await queueKey(), next);
}

/**
 * ✅ Migrazione best-effort:
 * - normalizza projectId
 * - imposta tries/nextTryAt se mancanti
 * - dedupeKey se mancante
 */
export async function queueNormalizeExisting(): Promise<{ changed: number }> {
  const list = await queueList();
  let changed = 0;

  const next = list.map((x) => {
    let y: any = { ...x };

    const norm = normalizeProjectKey(y.projectId);
    if (norm !== y.projectId) {
      y.projectId = norm;
      changed++;
    }

    if (typeof y.tries !== "number") {
      y.tries = 0;
      changed++;
    }
    if (typeof y.lastTryAt === "undefined") {
      y.lastTryAt = null;
      changed++;
    }
    if (typeof y.nextTryAt === "undefined") {
      y.nextTryAt = null;
      changed++;
    }
    if (!y.dedupeKey) {
      y.dedupeKey = computeDedupeKey({
        kind: y.kind,
        projectId: y.projectId,
        payload: y.payload,
      });
      changed++;
    }

    return y as QueueItem;
  });

  if (changed > 0) await setJson(await queueKey(), next);
  return { changed };
}

/** ============================================================
 * Processor
 * ============================================================ */

export type QueueExecutor = (item: QueueItem) => Promise<any>;

export type QueueFlushOptions = {
  /** max items per flush */
  maxItems?: number;

  /** se true: si ferma al primo errore */
  stopOnError?: boolean;

  /** limiti retry */
  maxTries?: number;

  /** processa anche ERROR se nextTryAt scaduto */
  includeErrors?: boolean;

  /** se true: ordina FIFO (oldest first). default true */
  fifo?: boolean;
};

/**
 * ✅ queueFlush:
 * - prende PENDING (e opzionalmente ERROR) pronti
 * - esegue executor(item)
 * - DONE se ok
 * - OFFLINE/TIMEOUT: resta PENDING, non incrementa tries, interrompe il flush
 * - altri errori: ERROR con backoff (tries++)
 */
export async function queueFlush(
  executor: QueueExecutor,
  options?: QueueFlushOptions
): Promise<{ processed: number; done: number; errored: number; skipped: number }> {
  const maxItems = options?.maxItems ?? 20;
  const stopOnError = options?.stopOnError ?? false;
  const maxTries = options?.maxTries ?? 8;
  const includeErrors = options?.includeErrors ?? true;
  const fifo = options?.fifo ?? true;

  return withLock(async () => {
    await queueNormalizeExisting();

    const list = await queueList();
    const t = nowMs();

    let processed = 0;
    let done = 0;
    let errored = 0;
    let skipped = 0;

    // FIFO logico: più vecchi prima
    const ordered = fifo ? [...list].sort((a, b) => a.ts - b.ts) : [...list];

    for (const item of ordered) {
      if (processed >= maxItems) break;

      const isPending = item.status === "PENDING";
      const isError = item.status === "ERROR";

      if (!isPending && !(includeErrors && isError)) {
        skipped++;
        continue;
      }

      if (item.tries >= maxTries) {
        if (item.status !== "ERROR") {
          await queueUpdate(item.id, {
            status: "ERROR",
            error: `maxTries reached (${maxTries})`,
            nextTryAt: null,
          });
        }
        skipped++;
        continue;
      }

      if (item.nextTryAt && item.nextTryAt > t) {
        skipped++;
        continue;
      }

      processed++;

      const triesNow = (item.tries || 0) + 1;

      try {
        // set "in progress" attempt (for debugging)
        await queueUpdate(item.id, {
          lastTryAt: t,
          tries: triesNow, // tentativo in corso
          status: "PENDING",
          error: undefined,
        });

        const res = await executor(item);

        await queueUpdate(item.id, {
          status: "DONE",
          error: undefined,
          nextTryAt: null,
          result: res ?? null,
        });

        done++;
      } catch (e: any) {
        const rawMsg = String(e?.message || "sync error");
        const msg = rawMsg.toLowerCase();

        // ✅ OFFLINE/TIMEOUT -> NON è errore del dato: resta PENDING, non incrementare tries
        if (isOfflineLikeMessage(msg)) {
          await queueUpdate(item.id, {
            status: "PENDING",
            error: undefined,
            lastTryAt: t,
            tries: item.tries || 0, // rollback tries
            nextTryAt: null,
          });

          // Se non c'è rete, ha poco senso continuare con altri
          skipped++;
          break;
        }

        // ❗ errori reali (server/validation ecc.) -> ERROR con backoff
        const nextTryAt = computeNextTryAt(triesNow);

        await queueUpdate(item.id, {
          status: "ERROR",
          error: rawMsg,
          lastTryAt: t,
          tries: triesNow,
          nextTryAt,
        });

        errored++;

        if (stopOnError) break;
      }
    }

    return { processed, done, errored, skipped };
  });
}

/**
 * ✅ Helper: flush per progetto (utile in UI “Sync Projekt”)
 */
export async function queueFlushProject(
  projectId: string,
  executor: QueueExecutor,
  options?: Omit<QueueFlushOptions, "fifo"> & { fifo?: boolean }
) {
  const key = normalizeProjectKey(projectId);
  return queueFlush(async (item) => {
    if (item.projectId !== key) return null;
    return executor(item);
  }, options);
}

/**
 * ✅ Helper: check lock (per evitare doppio tap)
 */
export async function queueIsLocked(): Promise<boolean> {
  const lock = await getJson<{ at: number; id: string } | null>(await lockKey(), null);
  if (!lock) return false;
  return nowMs() - lock.at < 60000;
}

/**
 * ✅ COMPAT EXPORT (vecchio nome usato dagli screen)
 * queueProcessPending(executor, options) == queueFlush(executor, options)
 */
export async function queueProcessPending(
  executor: QueueExecutor,
  options?: QueueFlushOptions
) {
  return queueFlush(executor, options);
}

