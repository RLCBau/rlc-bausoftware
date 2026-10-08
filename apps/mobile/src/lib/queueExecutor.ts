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
  // A queued document must not be transmitted after an account/company switch.
  // Recheck server-side project visibility for this execution path too.
  const projectId = String(item.projectId || "").trim();
  if (!projectId) throw new Error("QUEUE_PROJECT_REQUIRED");
  const accessibleProjects = await api.projects();
  const authorized = accessibleProjects.some((project: any) =>
    String(project?.id || "").trim() === projectId ||
    String(project?.code || "").trim() === projectId
  );
  if (!authorized) throw new Error("QUEUE_PROJECT_NOT_AUTHORIZED");
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

