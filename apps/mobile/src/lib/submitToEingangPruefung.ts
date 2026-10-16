import AsyncStorage from "@react-native-async-storage/async-storage";

import { queueAdd } from "./offlineQueue";
import { syncAll } from "./sync";

export type EingangDocType =
  | "REGIE"
  | "LIEFERSCHEIN"
  | "FOTO"
  | "TAGESBERICHT"
  | "BAUTAGEBUCH"
  | "ANGEBOT"
  | "RECHNUNG"
  | "MENGENERMITTLUNG"
  | "ABSCHLAGSRECHNUNG"
  | "KALKULATION";

export type EingangStatus =
  | "DRAFT"
  | "EINGEREICHT"
  | "IN_PRUEFUNG"
  | "FREIGEGEBEN"
  | "ABGELEHNT"
  | "ARCHIVIERT";

function keyFor(type: EingangDocType, projectKey: string) {
  const k = String(projectKey || "unknown").trim();

  switch (type) {
    case "REGIE":
      return `rlc_mobile_inbox_regie:${k}`;
    case "LIEFERSCHEIN":
      return `rlc_mobile_inbox_lieferschein:${k}`;
    case "FOTO":
      return `rlc_mobile_inbox_fotos:${k}`;
    case "TAGESBERICHT":
      return `rlc_mobile_inbox_tagesbericht:${k}`;
    case "BAUTAGEBUCH":
      return `rlc_mobile_inbox_bautagebuch:${k}`;
    case "ANGEBOT":
      return `rlc_mobile_inbox_angebot:${k}`;
    case "RECHNUNG":
      return `rlc_mobile_inbox_rechnung:${k}`;
    case "MENGENERMITTLUNG":
      return `rlc_mobile_inbox_mengen:${k}`;
    case "ABSCHLAGSRECHNUNG":
      return `rlc_mobile_inbox_abschlag:${k}`;
    case "KALKULATION":
      return `rlc_mobile_inbox_kalkulation:${k}`;
    default:
      return `rlc_mobile_inbox_misc:${k}`;
  }
}

async function readArray(key: string): Promise<any[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeArray(key: string, arr: any[]) {
  await AsyncStorage.setItem(key, JSON.stringify(arr || []));
}

function upsertById(list: any[], row: any) {
  const id = String(row?.id || row?.docId || "").trim();
  if (!id) return [row, ...list];

  const idx = list.findIndex((x) => String(x?.id || x?.docId || "") === id);
  if (idx >= 0) {
    const next = [...list];
    next[idx] = { ...next[idx], ...row };
    return next;
  }

  return [row, ...list];
}

export async function submitToEingangPruefung(params: {
  type: EingangDocType;
  projectKey: string;
  projectId?: string;
  projectCode?: string;
  title?: string;
  doc?: any;
  pdfUri?: string | null;
  status?: EingangStatus;
  sourceScreen?: string;
}) {
  const now = Date.now();
  const type = params.type;
  const projectKey = String(params.projectKey || params.projectCode || params.projectId || "unknown").trim();
  const doc = params.doc || {};

  const row = {
    ...doc,
    id: String(doc?.id || doc?.docId || `${type.toLowerCase()}_${now}`),
    docId: String(doc?.docId || doc?.id || `${type.toLowerCase()}_${now}`),
    docType: type,
    type,
    kind: String(type).toLowerCase(),
    projectId: String(params.projectId || doc?.projectId || projectKey),
    projectCode: String(params.projectCode || doc?.projectCode || projectKey),
    title: String(params.title || doc?.title || doc?.angebotTitle || doc?.rechnungNr || type),
    pdfUri: params.pdfUri ?? doc?.pdfUri ?? null,
    workflowStatus: params.status || doc?.workflowStatus || "EINGEREICHT",
    submittedAt: Number(doc?.submittedAt || now),
    createdAt: Number(doc?.createdAt || now),
    updatedAt: now,
    sourceScreen: params.sourceScreen || doc?.sourceScreen || type,
  };

  const modeRaw =
    (await AsyncStorage.getItem("rlc_mobile_mode")) ||
    (await AsyncStorage.getItem("rlc_app_mode_v1")) ||
    "SERVER_SYNC";

  if (modeRaw !== "NUR_APP") {
    const kind = type === "FOTO" ? "PHOTO_NOTE" : type;
    await queueAdd({
      kind: kind as any,
      projectId: projectKey,
      payload: { row },
    } as any);

    // Best effort: senza rete il documento rimane PENDING nella coda.
    try {
      await syncAll({ projectCode: projectKey });
    } catch {}
    return row;
  }

  const primaryKey = keyFor(type, projectKey);
  const allKey = `rlc_mobile_inbox_all:${projectKey}`;

  const primary = await readArray(primaryKey);
  await writeArray(primaryKey, upsertById(primary, row));

  const all = await readArray(allKey);
  await writeArray(allKey, upsertById(all, row));

  return row;
}
