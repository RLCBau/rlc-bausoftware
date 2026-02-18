// apps/mobile/src/lib/submitUnified.ts
import { Alert } from "react-native";
import { queueAdd, queueProcessPending, type QueueItem } from "./offlineQueue";

export async function submitDraftUnified(opts: {
  docType: "REGIE" | "LIEFERSCHEIN" | "FOTOS_NOTIZEN" | "PHOTOS" | "PHOTO_NOTE";
  projectFsKey: string; // BA-...
  projectTitle?: string;
  row: any;
  ensureSavedOffline: () => Promise<any>;
  silent?: boolean;
}) {
  const pk = String(opts.projectFsKey || "").trim();

  // 1) assicurati che esista un draft offline (ritorna LocalRow)
  const savedRow = await opts.ensureSavedOffline();

  // 2) metti in queue nel formato che usa già la tua offlineQueue (kind + payload)
  await queueAdd({
    projectId: pk,
    kind: opts.docType === "PHOTOS" ? "PHOTO_NOTE" : opts.docType, // normalizza se serve
    payload: {
      projectId: pk,
      projectCode: pk,
      // mettiamo dentro la row già salvata offline
      row: savedRow,
    },
  } as any);

  // 3) prova a processare subito (best-effort) — stessa infra degli altri screen
  try {
    await queueProcessPending(
      async (item: QueueItem) => {
        // qui NON facciamo upload diretto: la tua screen già gestisce upload/submitOne
        // quindi lasciamo che il tuo executor di screen faccia il lavoro vero.
        // Questo submitUnified serve solo a garantire: saved offline + queued.
        return;
      },
      { maxTries: 1, stopOnError: false }
    );
  } catch {
    // offline: ok
  }

  if (!opts.silent) Alert.alert("Einreichen", "In Inbox/Queue übernommen.");
  return { ok: true };
}
