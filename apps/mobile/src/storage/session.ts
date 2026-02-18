import { getJson, setJson } from "../lib/storage";

export type SessionRole =
  | "BAULEITER"
  | "ABRECHNUNG"
  | "BUERO"
  | "POLIER"
  | "VERMESSUNG"
  | "FAHRER"
  | "MITARBEITER";

export type Session = {
  projectId: string;
  role: SessionRole;
  name: string;
  ts: number;
};

function key(projectId: string) {
  return `rlc.session.${projectId}`;
}

export async function getSession(projectId: string): Promise<Session | null> {
  return await getJson<Session | null>(key(projectId), null);
}

export async function setSession(projectId: string, s: Omit<Session, "ts">) {
  const full: Session = { ...s, projectId, ts: Date.now() };
  await setJson(key(projectId), full);
  return full;
}

export async function clearSession(projectId: string) {
  await setJson(key(projectId), null);
}
