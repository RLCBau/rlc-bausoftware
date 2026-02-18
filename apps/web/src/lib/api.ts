const API = (path: string) => `http://localhost:4000${path}`;

export type ApiResult<T> = { ok?: boolean } & T;

export async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(API(path), { credentials: "include" });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function apiPost<T>(path: string, body: any): Promise<T> {
  const r = await fetch(API(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function apiPut<T>(path: string, body: any): Promise<T> {
  const r = await fetch(API(path), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

