import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// Tabelle minime attese:
// PlanTask(id, projectId, name, dauerTage, depsJson, ressJson)
// ResourceCapacity(id, projectId, name, capacity)
// PlanSnapshot(id, projectId, start, ende, json)

export async function loadTasks(projectId: string) {
  try {
    const rows = await prisma.planTask.findMany({ where: { projectId } });
    return rows.map(r => ({
      id: r.id, name: r.name, dauerTage: r.dauerTage,
      deps: JSON.parse(r.depsJson||"[]"),
      ressourcen: JSON.parse(r.ressJson||"{}")
    }));
  } catch { return null; }
}
export async function saveTasks(projectId: string, tasks: any[]) {
  try {
    await prisma.planTask.deleteMany({ where: { projectId } });
    await prisma.planTask.createMany({
      data: tasks.map(t => ({
        id: t.id, projectId, name: t.name, dauerTage: t.dauerTage,
        depsJson: JSON.stringify(t.deps||[]),
        ressJson: JSON.stringify(t.ressourcen||{})
      }))
    });
    return true;
  } catch { return false; }
}
export async function loadCapacity(projectId: string) {
  try {
    const rows = await prisma.resourceCapacity.findMany({ where: { projectId } });
    const cap: Record<string, number> = {};
    rows.forEach(r => { cap[r.name] = r.capacity; });
    return cap;
  } catch { return null; }
}
export async function saveCapacity(projectId: string, capacity: Record<string, number>) {
  try {
    await prisma.resourceCapacity.deleteMany({ where: { projectId } });
    await prisma.resourceCapacity.createMany({
      data: Object.entries(capacity).map(([name, capacity]) => ({ projectId, name, capacity }))
    });
    return true;
  } catch { return false; }
}
export async function saveSnapshot(projectId: string, start: string, ende: string, json: any) {
  try {
    await prisma.planSnapshot.create({ data: { projectId, start, ende, json: JSON.stringify(json) } });
    return true;
  } catch { return false; }
}
