import { api } from "./api";
import { getAuthMode, getServerToken } from "./auth";
import { queueList } from "./offlineQueue";
import { syncAll } from "./sync";

/** Triggered only while the native app is in the foreground. */
export async function resumePendingServerSync(): Promise<boolean> {
  if (await getAuthMode() !== "SERVER_SYNC") return false;
  if (!(await getServerToken())) return false;
  const now = Date.now();
  const due = (await queueList()).some(item =>
    item.status !== "DONE" && (item.tries || 0) < 8 &&
    (!item.nextTryAt || item.nextTryAt <= now)
  );
  if (!due) return false;
  const health = await api.health();
  if (health?.ok !== true) return false;
  await syncAll();
  return true;
}
