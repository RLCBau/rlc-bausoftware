// apps/mobile/src/lib/docSubmit.ts
import { Alert } from "react-native";
import { queueAdd } from "./offlineQueue";

/**
 * Tipo documento (coerente con la tua queue)
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
 * - garantisce: prima esiste un draft offline, poi queue
 * - il processing reale avviene tramite Inbox/Sync (executor separato)
 */
export async function submitDraftUnified(opts: {
  docType: DocType;

  // Chiave cartella progetto (FS-key) e metadati
  projectFsKey: string; // BA-... o local-...
  projectTitle?: string;

  // Payload completo del documento (row/draft) come già salvi offline
  row: any;

  // Funzione di salvataggio offline del draft
  ensureSavedOffline: () => Promise<any>;

  // opzionale: se vuoi auto-alert
  silent?: boolean;
}): Promise<SubmitResult> {
  try {
    // 1) assicura draft salvato offline
    const savedRow = await opts.ensureSavedOffline();

    // 2) queue payload corretto per tipo documento
    if (opts.docType === "REGIE") {
      await queueAdd({
        kind: "REGIE",
        projectId: opts.projectFsKey,
        payload: {
          date: String(savedRow?.date || ""),
          text: String(
            savedRow?.text ||
              savedRow?.leistung ||
              savedRow?.bemerkungen ||
              savedRow?.note ||
              ""
          ),
          hours:
            savedRow?.hours == null || savedRow?.hours === ""
              ? undefined
              : Number(savedRow.hours),
          note: String(savedRow?.note || savedRow?.bemerkungen || ""),
          row: savedRow,
        },
      });
    } else if (opts.docType === "LIEFERSCHEIN") {
      await queueAdd({
        kind: "LIEFERSCHEIN",
        projectId: opts.projectFsKey,
        payload: {
          date: String(savedRow?.date || ""),
          lieferscheinNummer: String(
            savedRow?.lieferscheinNummer || savedRow?.lieferscheinNr || ""
          ),
          supplier: String(savedRow?.lieferant || savedRow?.supplier || ""),
          site: String(savedRow?.baustelle || savedRow?.site || ""),
          driver: String(savedRow?.fahrer || savedRow?.driver || ""),
          material: String(savedRow?.material || ""),
          quantity:
            savedRow?.quantity == null || savedRow?.quantity === ""
              ? undefined
              : Number(savedRow.quantity),
          unit: String(savedRow?.unit || savedRow?.einheit || ""),
          kostenstelle: String(savedRow?.kostenstelle || ""),
          lvItemPos:
            savedRow?.lvItemPos == null || savedRow?.lvItemPos === ""
              ? null
              : String(savedRow.lvItemPos),
          comment: String(
            savedRow?.comment || savedRow?.bemerkungen || savedRow?.note || ""
          ),
          bemerkungen: String(savedRow?.bemerkungen || ""),
          files: Array.isArray(savedRow?.attachments)
            ? savedRow.attachments
            : Array.isArray(savedRow?.files)
            ? savedRow.files
            : [],
          row: savedRow,
        },
      });
    } else {
      await queueAdd({
        kind: "FOTOS_NOTIZEN",
        projectId: opts.projectFsKey,
        payload: {
          createdAt: String(savedRow?.createdAt || new Date().toISOString()),
          note: String(savedRow?.note || savedRow?.bemerkungen || savedRow?.text || ""),
          imageUri: savedRow?.imageUri || null,
          imageMeta: savedRow?.imageMeta || null,
          extras: Array.isArray(savedRow?.extras) ? savedRow.extras : [],
          boxes: Array.isArray(savedRow?.boxes) ? savedRow.boxes : [],
          docId: savedRow?.docId ? String(savedRow.docId) : undefined,
          date: savedRow?.date ? String(savedRow.date) : undefined,
          kostenstelle: savedRow?.kostenstelle
            ? String(savedRow.kostenstelle)
            : undefined,
          lvItemPos:
            savedRow?.lvItemPos == null || savedRow?.lvItemPos === ""
              ? null
              : String(savedRow.lvItemPos),
          comment: savedRow?.comment ? String(savedRow.comment) : undefined,
          bemerkungen: savedRow?.bemerkungen
            ? String(savedRow.bemerkungen)
            : undefined,
          files: Array.isArray(savedRow?.files)
            ? savedRow.files
            : Array.isArray(savedRow?.attachments)
            ? savedRow.attachments
            : [],
        },
      });
    }

    if (!opts.silent) {
      Alert.alert("Eingereicht", "In Inbox/Queue übernommen.");
    }

    return {
      ok: true,
      queued: true,
      processed: false,
      message: "Queued",
    };
  } catch (e: any) {
    const msg = String(e?.message || e || "Unknown error");
    if (!opts.silent) Alert.alert("Fehler beim Einreichen", msg);
    return { ok: false, error: msg };
  }
}

