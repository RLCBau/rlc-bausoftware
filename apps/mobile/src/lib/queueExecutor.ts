// apps/mobile/src/lib/queueExecutor.ts
import type { QueueItem } from "./offlineQueue";
import { api } from "./api";

/**
 * Executor unico per queueProcessPending / queueFlush
 * IMPORTANTE:
 * - usa payload.row quando presente (è il record completo)
 * - altrimenti usa payload come “row”
 */
export async function rlcQueueExecutor(item: QueueItem) {
  const row = (item as any)?.payload?.row ?? (item as any)?.payload ?? {};

  switch (item.kind) {
    case "REGIE":
      return api.pushRegieToServer(item.projectId, row);

    case "LIEFERSCHEIN":
      return api.pushLieferscheinToServer(item.projectId, row);

    case "PHOTO_NOTE":
    case "FOTOS_NOTIZEN":
      return api.pushPhotosToServer(item.projectId, row);

    default:
      throw new Error(`Unknown queue kind: ${(item as any).kind}`);
  }
}
