export function getCurrentProjectId(): number {
  const q = new URLSearchParams(window.location.search).get("projectId");
  if (q && !isNaN(Number(q))) return Number(q);
  const ls = localStorage.getItem("rlc.currentProjectId");
  return ls ? Number(ls) : 0;
}
export function setCurrentProjectId(id: number) {
  localStorage.setItem("rlc.currentProjectId", String(id));
}
export function withProject(path: string): string {
  const id = getCurrentProjectId();
  return id ? `${path}?projectId=${id}` : path;
}
