// apps/mobile/src/lib/docSubmit.ts
import { Alert } from "react-native";
import {
  queueAdd,
  queueProcessPending,
  type QueueItem,
} from "./offlineQueue";

/**
 * Tipo documento (coerente con la tua queue)
 * Adatta i nomi se nel tuo offlineQueue usi stringhe diverse.
 */
export type DocType = "REGIE" | "LIEFERSCHEIN" | "PHOTOS";

export type SubmitResult = {
  ok: boolean;
  queued?: boolean;
  processed?: boolean;
  message?: string;
  error?: string;
};

/**
 * submitDraftUnified
 * - garantisce: prima esiste un draft offline, poi queue, poi tenta sync
 * - NON richiede riaprire nulla
 */
export async function submitDraftUnified(opts: {
  docType: DocType;

  // Chiave cartella progetto (FS-key) e metadati (per email/pdf/nomefile)
  projectFsKey: string; // BA-... o local-...
  projectTitle?: string;

  // Payload completo del documento (row/draft) come già salvi offline
  row: any;

  // Funzione di salvataggio offline del draft (DEVE restituire la row aggiornata)
  // In Regie oggi è quello che fai con "Speichern (offline)".
  ensureSavedOffline: () => Promise<any>;

  // opzionale: se vuoi auto-alert
  silent?: boolean;
}): Promise<SubmitResult> {
  try {
    // 1) assicura draft salvato offline
    const savedRow = await opts.ensureSavedOffline();

    // 2) metti in queue (tipo coerente con la tua implementazione queue)
    //    Se la tua queue vuole campi diversi, li adattiamo qui una volta sola.
    const item: QueueItem = {
      id: `q_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      type: opts.docType, // <- se la tua queue usa "REGIE" ecc. ok
      createdAt: new Date().toISOString(),
      status: "PENDING",
      payload: {
        projectFsKey: opts.projectFsKey,
        projectTitle: opts.projectTitle,
        row: savedRow,
      },
    } as any;

    await queueAdd(item);

    // 3) tenta sync subito (se offline resta pending)
    await queueProcessPending();

    if (!opts.silent) {
      Alert.alert("Eingereicht", "In Inbox/Queue übernommen.");
    }

    return { ok: true, queued: true, processed: true, message: "Queued + processed" };
  } catch (e: any) {
    const msg = String(e?.message || e || "Unknown error");
    if (!opts.silent) Alert.alert("Fehler beim Einreichen", msg);
    return { ok: false, error: msg };
  }
}
