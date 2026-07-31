import { jsx as _jsx } from "react/jsx-runtime";
// apps/web/src/store/useProject.tsx
import React, { createContext, useCallback, useContext, useEffect, useState, } from "react";
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
export const ProjectProvider = ({ children, }) => {
    const [projects, setProjects] = useState([]);
    const [selectedProjectId, setSelectedProjectId] = useState(loadInitialSelectedId);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    // ---- helper per salvare anche in localStorage ----
    const setSelected = useCallback((id) => {
        setSelectedProjectId(id);
        if (typeof window !== "undefined") {
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
    }, []);
    // ---- Projekte laden ----
    const loadProjects = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await fetchProjects();
            const list = (data.projects ?? data);
            setProjects(list);
            // aktuelle Auswahl stabil halten oder sinnvolle Default-Auswahl
            setSelectedProjectId((prev) => {
                if (prev && list.some((p) => p.id === prev)) {
                    // bisherige Auswahl existiert noch
                    return prev;
                }
                if (list.length === 0)
                    return null;
                return list[0].id;
            });
        }
        catch (e) {
            console.error(e);
            setError(e?.message || "Fehler beim Laden der Projekte");
        }
        finally {
            setLoading(false);
        }
    }, []);
    const reloadProjects = loadProjects;
    // beim Start einmal Projekte laden
    useEffect(() => {
        void loadProjects();
    }, [loadProjects]);
    const selectProject = (id) => {
        setSelected(id);
    };
    const getSelectedProject = useCallback(() => {
        if (!selectedProjectId)
            return null;
        return projects.find((p) => p.id === selectedProjectId) ?? null;
    }, [projects, selectedProjectId]);
    // ---- Import JSON (project.json) ----
    const importJsonFile = useCallback(async (file) => {
        const fd = new FormData();
        fd.append("file", file);
        const res = await importProjectJson(fd); // { ok, project }
        const proj = res?.project;
        await loadProjects();
        if (proj?.id) {
            setSelected(proj.id);
        }
    }, [loadProjects, setSelected]);
    // ---- Import ZIP ----
    const importZipFile = useCallback(async (file) => {
        const fd = new FormData();
        fd.append("file", file);
        const res = await importProjectZip(fd); // { ok, project }
        const proj = res?.project;
        await loadProjects();
        if (proj?.id) {
            setSelected(proj.id);
        }
    }, [loadProjects, setSelected]);
    // ---- Neues Projekt anlegen ----
    const createProject = useCallback(async (data) => {
        const result = await apiCreateProject({
            code: data.code,
            name: data.name,
            client: data.client,
            place: data.place,
        });
        const project = (result.project ?? result);
        await loadProjects();
        if (project?.id) {
            setSelected(project.id);
        }
        return project;
    }, [loadProjects, setSelected]);
    // ---- Projekt löschen ----
    const deleteProject = useCallback(async (id) => {
        await apiDeleteProject(id);
        await loadProjects();
        // falls das gelöschte Projekt selektiert war, Auswahl korrigiert
        setSelectedProjectId((prev) => {
            if (prev === id)
                return null;
            return prev;
        });
    }, [loadProjects]);
    const value = {
        projects,
        loading,
        error,
        selectedProjectId,
        loadProjects,
        reloadProjects,
        selectProject,
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
