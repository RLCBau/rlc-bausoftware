// apps/web/src/api/projects.ts

export type ProjectPayload = {
  code: string;
  name: string;
  client?: string;
  place?: string;
};

// ==================== Projekte laden ====================
export async function fetchProjects() {
  const res = await fetch("/api/projects", {
    method: "GET",
  });

  const data = await res.json().catch(() => null);

  if (!res.ok || !data) {
    throw new Error("Fehler beim Laden der Projekte");
  }

  if (data.ok === false) {
    throw new Error(data.error || "Fehler beim Laden der Projekte");
  }

  return data; // { ok: true, projects: [...] }
}

// ==================== project.json importieren ====================
// -> passt zu apps/server/src/routes/import.ts  (POST /api/import/project-json)
export async function importProjectJson(formData: FormData) {
  const res = await fetch("/api/import/project-json", {
    method: "POST",
    body: formData,
  });

  const data = await res.json().catch(() => null);

  if (!res.ok || !data) {
    throw new Error("Fehler beim Import (project.json)");
  }

  if (data.ok === false) {
    throw new Error(data.error || "Fehler beim Import (project.json)");
  }

  return data;
}

// ==================== ZIP-Projekt importieren ====================
export async function importProjectZip(formData: FormData) {
  const res = await fetch("/api/import/project-zip", {
    method: "POST",
    body: formData,
  });

  const data = await res.json().catch(() => null);

  if (!res.ok || !data) {
    throw new Error("Fehler beim Import (ZIP)");
  }

  if (data.ok === false) {
    throw new Error(data.error || "Fehler beim Import (ZIP)");
  }

  return data;
}

// ==================== Neues Projekt anlegen ====================
export async function createProject(payload: ProjectPayload) {
  const res = await fetch("/api/projects", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok || !data) {
    throw new Error("Fehler beim Erstellen des Projekts");
  }

  if (data.ok === false) {
    throw new Error(data.error || "Fehler beim Erstellen des Projekts");
  }

  return data; // { ok: true, project: {...} }
}

// ==================== Projekt löschen ====================
export async function deleteProject(projectId: string) {
  const res = await fetch(`/api/projects/${projectId}`, {
    method: "DELETE",
  });

  const data = await res.json().catch(() => null);

  if (!res.ok || !data) {
    throw new Error("Fehler beim Löschen des Projekts");
  }

  if (data.ok === false) {
    throw new Error(data.error || "Fehler beim Löschen des Projekts");
  }

  return data;
}
