import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function loadTasks(projectId: string) {
  try {
    const rows = await prisma.planTask.findMany({
      where: { projectId },
      orderBy: [
        { start: "asc" },
        { name: "asc" }
      ]
    });

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      dauerTage: r.dauerTage,
      start: r.start?.toISOString() || null,
      end: r.end?.toISOString() || null,
      progress: r.progress ?? 0,
      notes: r.notes || "",
      assignee: r.assignee || "",
      milestone: Boolean(r.milestone),
      deps: JSON.parse(r.depsJson || "[]"),
      ressourcen: JSON.parse(r.ressJson || "{}")
    }));
  } catch (e) {
    console.error("loadTasks failed", e);
    return null;
  }
}

export async function saveTasks(
  projectId: string,
  tasks: any[]
) {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.planTask.deleteMany({
        where: { projectId }
      });

      if (!tasks.length) return;

      await tx.planTask.createMany({
        data: tasks.map((t) => ({
          id: String(t.id),
          projectId,
          name: String(t.name || "Neuer Vorgang"),
          dauerTage: Math.max(
            0,
            Number(t.dauerTage || 0)
          ),
          start: t.start
            ? new Date(t.start)
            : null,
          end: t.end
            ? new Date(t.end)
            : null,
          progress: Math.max(
            0,
            Math.min(
              100,
              Number(t.progress || 0)
            )
          ),
          notes:
            String(t.notes || "") || null,
          assignee:
            String(t.assignee || "") || null,
          milestone: Boolean(t.milestone),
          depsJson: JSON.stringify(
            Array.isArray(t.deps)
              ? t.deps
              : []
          ),
          ressJson: JSON.stringify(
            t.ressourcen &&
            typeof t.ressourcen === "object"
              ? t.ressourcen
              : {}
          )
        }))
      });
    });

    return true;
  } catch (e) {
    console.error("saveTasks failed", e);
    return false;
  }
}

export async function loadCapacity(projectId: string) {
  try {
    const rows =
      await prisma.resourceCapacity.findMany({
        where: { projectId }
      });

    const cap: Record<string, number> = {};

    rows.forEach((r) => {
      cap[r.name] = r.capacity;
    });

    return cap;
  } catch {
    return null;
  }
}

export async function saveCapacity(
  projectId: string,
  capacity: Record<string, number>
) {
  try {
    await prisma.resourceCapacity.deleteMany({
      where: { projectId }
    });

    const rows = Object.entries(capacity);

    if (rows.length) {
      await prisma.resourceCapacity.createMany({
        data: rows.map(([name, capacity]) => ({
          projectId,
          name,
          capacity
        }))
      });
    }

    return true;
  } catch {
    return false;
  }
}

export async function saveSnapshot(
  projectId: string,
  start: string,
  ende: string,
  json: any
) {
  try {
    await prisma.planSnapshot.create({
      data: {
        projectId,
        start,
        ende,
        json: JSON.stringify(json)
      }
    });

    return true;
  } catch {
    return false;
  }
}
