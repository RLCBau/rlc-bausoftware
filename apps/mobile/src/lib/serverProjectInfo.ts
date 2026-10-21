/** Read-only, backend-authoritative project and activated-device role view. */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { request } from "./api";

export type ServerProjectInfo = {
  ok: boolean;
  source: "POSTGRESQL";
  projectId: string;
  projectCode: string;
  bauleiter: string[];
  auftraggeber: string;
  currentRole: string | null;
  currentName: string;
  licenseRole: string | null;
  managedByWeb: true;
};

const inflight = new Map<string, Promise<ServerProjectInfo>>();
const verifiedCache = new Map<string, { at: number; data: ServerProjectInfo }>();

export async function readServerProjectInfo(projectId: string): Promise<ServerProjectInfo> {
  const key = String(projectId).trim();
  const cached = verifiedCache.get(key);
  if (cached && Date.now() - cached.at < 10000) return cached.data;
  const pending = inflight.get(key);
  if (pending) return pending;
  const job = fetchServerProjectInfo(key);
  inflight.set(key, job);
  try {
    const data = await job;
    verifiedCache.set(key, { at: Date.now(), data });
    return data;
  } finally {
    if (inflight.get(key) === job) inflight.delete(key);
  }
}

async function fetchServerProjectInfo(projectId: string): Promise<ServerProjectInfo> {
  const deviceId = String((await AsyncStorage.getItem("rlc_mobile_device_id_v1")) || "").trim();
  const result = await request<ServerProjectInfo>(`/api/projects/${encodeURIComponent(String(projectId).trim())}/mobile-project-info`, {
    method: "GET",
    headers: deviceId ? { "X-RLC-Mobile-Device-Id": deviceId } : {},
  });
  if (!result?.ok || result.source !== "POSTGRESQL" || !result.managedByWeb) {
    throw new Error("PROJECT_INFO_NOT_VERIFIED");
  }
  return result;
}
