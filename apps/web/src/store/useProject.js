import { jsx as _jsx } from "react/jsx-runtime";
// apps/web/src/store/useProject.tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState, } from "react";
import { fetchProjects, importProjectJson, importProjectZip, createProject as apiCreateProject, deleteProject as apiDeleteProject, } from "../api/projects";
const STORAGE_KEY = "rlc.currentProjectId";
const ProjectCtx = createContext(null);
function loadInitialSelectedId() {
    if (typeof window === "undefined")
        return null;
    try {
        const v = window.localStorage.getItem(STORAGE_KEY);
        return v || null;
    }
    catch {
        return null;
    }
}
function setStoredSelectedId(id) {
    if (typeof window === "undefined")
        return;
    try {
        if (id) {
            window.localStorage.setItem(STORAGE_KEY, id);
        }
        else {
            window.localStorage.removeItem(STORAGE_KEY);
        }
    }
    catch {
        // ignore
    }
}
function setGlobalCurrentProject(project) {
    try {
        const g = globalThis;
        g.__RLC_CURRENT_PROJECT = project;
    }
    catch {
        // ignore
    }
}
function syncCurrentProjectStorage(project) {
    if (typeof window === "undefined")
        return;
    try {
        if (!project) {
            window.localStorage.removeItem("rlc_current_project_key_v1");
            window.localStorage.removeItem("rlc_current_project");
            window.localStorage.removeItem("rlc_current_project_code");
            return;
        }
        const code = String(project.code || "").trim().toUpperCase();
        if (code) {
            window.localStorage.setItem("rlc_current_project_key_v1", code);
            window.localStorage.setItem("rlc_current_project", JSON.stringify(project));
            window.localStorage.setItem("rlc_current_project_code", code);
        }
    }
    catch {
        // ignore
    }
}
function normalizeProject(input) {
    if (!input || !input.id)
        return null;
    return {
        id: String(input.id),
        code: String(input.code ?? ""),
        name: String(input.name ?? ""),
        client: input.client ? String(input.client) : undefined,
        place: input.place ? String(input.place) : undefined,
    };
}
function normalizeProjects(input) {
    const arr = Array.isArray(input?.projects)
        ? input.projects
        : Array.isArray(input)
            ? input
            : [];
    return arr
        .map(normalizeProject)
        .filter(Boolean);
}
export const ProjectProvider = ({ children, }) => {
    const [projects, setProjects] = useState([]);
    const [selectedProjectId, setSelectedProjectId] = useState(loadInitialSelectedId);
    const [currentProjectOverride, setCurrentProjectOverride] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const setSelected = useCallback((id) => {
        setSelectedProjectId(id);
        setStoredSelectedId(id);
    }, []);
    const currentProject = useMemo(() => {
        if (currentProjectOverride) {
            if (!selectedProjectId || currentProjectOverride.id === selectedProjectId) {
                return currentProjectOverride;
            }
        }
        if (!selectedProjectId)
            return null;
        return projects.find((p) => p.id === selectedProjectId) ?? null;
    }, [currentProjectOverride, projects, selectedProjectId]);
    useEffect(() => {
        setGlobalCurrentProject(currentProject);
        syncCurrentProjectStorage(currentProject);
    }, [currentProject]);
    const loadProjects = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await fetchProjects();
            const list = normalizeProjects(data);
            setProjects(list);
            const currentSelectedId = selectedProjectId;
            const currentOverrideId = currentProjectOverride?.id ?? null;
            let nextSelectedId = null;
            if (currentSelectedId && list.some((p) => p.id === currentSelectedId)) {
                nextSelectedId = currentSelectedId;
            }
            else if (currentOverrideId &&
                list.some((p) => p.id === currentOverrideId)) {
                nextSelectedId = currentOverrideId;
            }
            else if (list.length > 0) {
                nextSelectedId = list[0].id;
            }
            setSelected(nextSelectedId);
            if (!nextSelectedId) {
                setCurrentProjectOverride(null);
                setGlobalCurrentProject(null);
                syncCurrentProjectStorage(null);
                return;
            }
            const found = list.find((p) => p.id === nextSelectedId) ?? null;
            setCurrentProjectOverride(found);
            setGlobalCurrentProject(found);
            syncCurrentProjectStorage(found);
        }
        catch (e) {
            console.error(e);
            setError(e?.message || "Fehler beim Laden der Projekte");
        }
        finally {
            setLoading(false);
        }
    }, [currentProjectOverride?.id, selectedProjectId, setSelected]);
    const reloadProjects = loadProjects;
    useEffect(() => {
        void loadProjects();
    }, [loadProjects]);
    const setCurrentProject = useCallback((project) => {
        const normalized = normalizeProject(project);
        setCurrentProjectOverride(normalized);
        setSelected(normalized?.id ?? null);
        setGlobalCurrentProject(normalized);
        syncCurrentProjectStorage(normalized);
    }, [setSelected]);
    const setCurrentProjectId = useCallback((id) => {
        setSelected(id);
        if (!id) {
            setCurrentProjectOverride(null);
            setGlobalCurrentProject(null);
            syncCurrentProjectStorage(null);
            return;
        }
        const found = projects.find((p) => p.id === id) ?? null;
        setCurrentProjectOverride(found);
        setGlobalCurrentProject(found);
        syncCurrentProjectStorage(found);
    }, [projects, setSelected]);
    const selectProjectById = useCallback((id) => {
        setCurrentProjectId(id);
    }, [setCurrentProjectId]);
    const selectProject = useCallback((input) => {
        if (!input) {
            setCurrentProject(null);
            return;
        }
        if (typeof input === "string") {
            setCurrentProjectId(input);
            return;
        }
        setCurrentProject(input);
    }, [setCurrentProject, setCurrentProjectId]);
    const getSelectedProject = useCallback(() => {
        return currentProject;
    }, [currentProject]);
    const importJsonFile = useCallback(async (file) => {
        const fd = new FormData();
        fd.append("file", file);
        const res = await importProjectJson(fd);
        const proj = normalizeProject(res?.project);
        await loadProjects();
        if (proj?.id) {
            setCurrentProject(proj);
        }
    }, [loadProjects, setCurrentProject]);
    const importZipFile = useCallback(async (file) => {
        const fd = new FormData();
        fd.append("file", file);
        const res = await importProjectZip(fd);
        const proj = normalizeProject(res?.project);
        await loadProjects();
        if (proj?.id) {
            setCurrentProject(proj);
        }
    }, [loadProjects, setCurrentProject]);
    const createProject = useCallback(async (data) => {
        const result = await apiCreateProject({
            code: data.code,
            name: data.name,
            client: data.client,
            place: data.place,
        });
        const project = normalizeProject(result?.project ?? result);
        await loadProjects();
        if (project?.id) {
            setCurrentProject(project);
        }
        return project;
    }, [loadProjects, setCurrentProject]);
    const deleteProject = useCallback(async (id) => {
        await apiDeleteProject(id);
        const wasSelected = selectedProjectId === id;
        await loadProjects();
        if (!wasSelected)
            return;
        const remaining = projects.filter((p) => p.id !== id);
        const next = remaining[0] ?? null;
        if (next) {
            setCurrentProject(next);
        }
        else {
            setCurrentProject(null);
        }
    }, [loadProjects, projects, selectedProjectId, setCurrentProject]);
    const value = {
        projects,
        loading,
        error,
        selectedProjectId,
        currentProject,
        loadProjects,
        reloadProjects,
        selectProject,
        selectProjectById,
        setCurrentProject,
        setCurrentProjectId,
        getSelectedProject,
        importJsonFile,
        importZipFile,
        createProject,
        deleteProject,
    };
    return _jsx(ProjectCtx.Provider, { value: value, children: children });
};
export function useProject() {
    const ctx = useContext(ProjectCtx);
    if (!ctx) {
        throw new Error("useProject must be used innerhalb von <ProjectProvider>");
    }
    return ctx;
}
export default useProject;
