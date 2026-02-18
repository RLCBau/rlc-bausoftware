// apps/web/src/api/regie.ts
const API_BASE =
  (import.meta as any).env?.VITE_API_URL?.replace(/\/$/, "") || "http://localhost:4000";

export type RegieItem = {
  id: string;
  projectId: string;
  date: string;          // ISO
  worker?: string;
  hours?: number | null;
  machine?: string;
  material?: string;
  quantity?: number | null;
  unit?: string;
  comment?: string;
  lvItemId?: string | null;
  createdAt?: string;
};

export async function listRegie(projectId?: string): Promise<RegieItem[]> {
  const url = projectId ? `${API_BASE}/api/regie?projectId=${encodeURIComponent(projectId)}` 
                        : `${API_BASE}/api/regie`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`LIST failed: ${r.status}`);
  return r.json();
}

export async function createRegie(input: Omit<RegieItem, "id" | "createdAt">): Promise<RegieItem> {
  const r = await fetch(`${API_BASE}/api/regie`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok) throw new Error(`CREATE failed: ${r.status}`);
  return r.json();
}

export async function deleteRegie(id: string): Promise<void> {
  const r = await fetch(`${API_BASE}/api/regie/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!r.ok) throw new Error(`DELETE failed: ${r.status}`);
}
