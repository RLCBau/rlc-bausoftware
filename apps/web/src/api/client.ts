export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const base = import.meta.env.VITE_API_URL || "";
  const res = await fetch(base + url, { headers: { "Content-Type": "application/json" }, ...init });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}
