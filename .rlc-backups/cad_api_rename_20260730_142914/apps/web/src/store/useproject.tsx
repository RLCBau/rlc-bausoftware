// apps/web/src/store/useProject.tsx
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import {
  fetchProjects,
  importProjectJson,
  importProjectZip,
  createProject as apiCreateProject,
  deleteProject as apiDeleteProject,
} from "../api/projects";

export type ProjectSummary = {
  id: string;
  code: string;
  name: string;
  client?: string;
  place?: string;
};

type ProjectContextValue = {
  projects: ProjectSummary[];
  loading: boolean;
  error: string | null;
  selectedProjectId: string | null;

  /** Projekt, das aktuell ausgewählt ist (oder null) */
  currentProject: ProjectSummary | null;

  loadProjects: () => Promise<void>;
  reloadProjects: () => Promise<void>;
  selectProject: (id: string | null) => void;
  getSelectedProject: () => ProjectSummary | null;

  importJsonFile: (file: File) => Promise<void>;
  importZipFile: (file: File) => Promise<void>;
  createProject: (data: {
    code: string;
    name: string;
    client?: string;
    place?: string;
  }) => Promise<ProjectSummary | null>;
  deleteProject: (id: string) => Promise<void>;
};

const STORAGE_KEY = "rlc.currentProjectId";
const ProjectCtx = createContext<ProjectContextValue | null>(null);

function loadInitialSelectedId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v || null;
  } catch {
    return null;
  }
}

export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProjectId, setSelectedProjectId] =
    useState<string | null>(loadInitialSelectedId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- helper per salvare anche in localStorage ----
  const setSelected = useCallback((id: string | null) => {
    setSelectedProjectId(id);
    if (typeof window !== "undefined") {
      try {
        if (id) {
          window.localStorage.setItem(STORAGE_KEY, id);
        } else {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      } catch {
        // ignore
      }
    }
  }, []);

  // ---- Projekte laden ----
  const loadProjects = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await fetchProjects();
      const list: ProjectSummary[] = (data.projects ?? data) as any;

      setProjects(list);

      // aktuelle Auswahl stabil halten oder sinnvolle Default-Auswahl
      setSelectedProjectId((prev) => {
        if (prev && list.some((p) => p.id === prev)) {
          // bisherige Auswahl existiert noch
          return prev;
        }
        if (list.length === 0) return null;
        return list[0].id;
      });
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Fehler beim Laden der Projekte");
    } finally {
      setLoading(false);
    }
  }, []);

  const reloadProjects = loadProjects;

  // beim Start einmal Projekte laden
  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const selectProject = (id: string | null) => {
    setSelected(id);
  };

  const getSelectedProject = useCallback((): ProjectSummary | null => {
    if (!selectedProjectId) return null;
    return projects.find((p) => p.id === selectedProjectId) ?? null;
  }, [projects, selectedProjectId]);

  // ---- Import JSON (project.json) ----
  const importJsonFile = useCallback(
    async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await importProjectJson(fd); // { ok, project }
      const proj: ProjectSummary | undefined = res?.project;
      await loadProjects();
      if (proj?.id) {
        setSelected(proj.id);
      }
    },
    [loadProjects, setSelected]
  );

  // ---- Import ZIP ----
  const importZipFile = useCallback(
    async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await importProjectZip(fd); // { ok, project }
      const proj: ProjectSummary | undefined = res?.project;
      await loadProjects();
      if (proj?.id) {
        setSelected(proj.id);
      }
    },
    [loadProjects, setSelected]
  );

  // ---- Neues Projekt anlegen ----
  const createProject = useCallback(
    async (data: {
      code: string;
      name: string;
      client?: string;
      place?: string;
    }) => {
      const result = await apiCreateProject({
        code: data.code,
        name: data.name,
        client: data.client,
        place: data.place,
      });

      const project = (result.project ?? result) as ProjectSummary | null;
      await loadProjects();

      if (project?.id) {
        setSelected(project.id);
      }
      return project;
    },
    [loadProjects, setSelected]
  );

  // ---- Projekt löschen ----
  const deleteProject = useCallback(
    async (id: string) => {
      await apiDeleteProject(id);
      await loadProjects();
      // falls das gelöschte Projekt selektiert war, Auswahl korrigiert
      setSelectedProjectId((prev) => {
        if (prev === id) return null;
        return prev;
      });
    },
    [loadProjects]
  );

  // ✅ hier leiten wir das aktuell ausgewählte Projekt ab
  const currentProject = getSelectedProject();

  const value: ProjectContextValue = {
    projects,
    loading,
    error,
    selectedProjectId,
    currentProject,          // ⬅️ neu
    loadProjects,
    reloadProjects,
    selectProject,
    getSelectedProject,
    importJsonFile,
    importZipFile,
    createProject,
    deleteProject,
  };

  return <ProjectCtx.Provider value={value}>{children}</ProjectCtx.Provider>;
};

export function useProject() {
  const ctx = useContext(ProjectCtx);
  if (!ctx) {
    throw new Error("useProject must be used innerhalb von <ProjectProvider>");
  }
  return ctx;
}

export default useProject;
