import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// apps/web/src/pages/start/project.tsx
import React, { useEffect, useState, } from "react";
import { useNavigate } from "react-router-dom";
import { useProject } from "../../store/useProject";
import { fetchProjects, importProjectZip, createProject as apiCreateProject, deleteProject, } from "../../api/projects";
/* ========= API-Base ========= */
const API = import.meta?.env?.VITE_API_URL || "https://api.rlcbausoftware.com";
/* ========= Helper: nächste Projektnummer berechnen ========= */
/**
 * Ermittelt aus der vorhandenen Projektliste die nächste freie
 * Projektnummer im Schema "BA-2025-XYZ".
 *
 * Beispiele:
 *  - vorhandene Codes: BA-2025-001, BA-2025-002  ->  BA-2025-003
 *  - keine passenden Codes                        ->  BA-2025-001
 */
function computeNextProjectCode(projects) {
    const DEFAULT_PREFIX = "BA-2025-";
    if (!projects || projects.length === 0) {
        return `${DEFAULT_PREFIX}001`;
    }
    let maxNum = 0;
    for (const p of projects) {
        const code = p.code || "";
        // Nur Codes berücksichtigen, die wie "BA-2025-123" aussehen
        const match = code.match(/^(.*-)(\d+)$/);
        if (!match)
            continue;
        const prefix = match[1];
        const numStr = match[2];
        if (prefix === DEFAULT_PREFIX) {
            const num = parseInt(numStr, 10);
            if (!Number.isNaN(num) && num > maxNum) {
                maxNum = num;
            }
        }
    }
    const next = maxNum + 1;
    const nextStr = String(next).padStart(3, "0");
    return `${DEFAULT_PREFIX}${nextStr}`;
}
/* ========= Stili (come prima) ========= */
const pageContainer = {
    maxWidth: 1180,
    margin: "0 auto",
    padding: "1.5rem 1.75rem 2rem",
};
const sectionTitle = {
    fontSize: "1.5rem",
    fontWeight: 600,
    marginBottom: "0.25rem",
    color: "#111827",
};
const sectionSubtitle = {
    fontSize: "0.875rem",
    color: "#6B7280",
    marginBottom: "1.5rem",
};
const layoutGrid = {
    display: "grid",
    gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2.3fr)",
    gap: "1.75rem",
};
const card = {
    background: "#FFFFFF",
    borderRadius: 12,
    border: "1px solid #E5E7EB",
    boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
    padding: "1.5rem 1.75rem 1.75rem",
};
const cardTitleRow = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "0.75rem",
};
const cardTitle = {
    fontSize: "1rem",
    fontWeight: 600,
    color: "#111827",
};
const cardHint = {
    fontSize: "0.8rem",
    color: "#9CA3AF",
};
const cardBody = {
    fontSize: "0.875rem",
    color: "#111827",
};
const btnBase = {
    fontSize: "0.8rem",
    borderRadius: 999,
    padding: "0.4rem 0.95rem",
    border: "1px solid #D1D5DB",
    background: "#F9FAFB",
    color: "#374151",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.35rem",
    whiteSpace: "nowrap",
};
const btnPrimary = {
    ...btnBase,
    background: "#2563EB",
    borderColor: "#1D4ED8",
    color: "#FFFFFF",
    fontWeight: 500,
};
const btnGhost = {
    ...btnBase,
    background: "#FFFFFF",
};
const btnDangerOutline = {
    ...btnBase,
    borderColor: "#FCA5A5",
    color: "#B91C1C",
    background: "#FEF2F2",
};
const tableWrapper = {
    borderRadius: 10,
    border: "1px solid #E5E7EB",
    overflow: "hidden",
    background: "#F9FAFB",
};
const tableHeader = {
    display: "grid",
    gridTemplateColumns: "0.9fr 1.8fr 1.3fr 1.7fr", // ultima colonna: Ort + Aktion
    gap: "0.5rem",
    padding: "0.55rem 0.9rem",
    fontSize: "0.75rem",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "#9CA3AF",
    background: "#F3F4F6",
};
const tableRow = {
    display: "grid",
    gridTemplateColumns: "0.9fr 1.8fr 1.3fr 1.7fr",
    gap: "0.5rem",
    padding: "0.5rem 0.9rem",
    fontSize: "0.85rem",
    alignItems: "center",
    borderTop: "1px solid #E5E7EB",
    cursor: "pointer",
};
const tableRowAlt = {
    ...tableRow,
    background: "#F9FAFB",
};
const tableRowHover = {
    boxShadow: "inset 0 0 0 1px #2563EB",
    background: "#EFF6FF",
};
const mutedText = {
    fontSize: "0.8rem",
    color: "#9CA3AF",
    marginTop: "0.5rem",
};
/* ========= Component ========= */
const ProjectStartPage = () => {
    const navigate = useNavigate();
    const projectCtx = useProject();
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [jsonFile, setJsonFile] = useState(null);
    const [zipFile, setZipFile] = useState(null);
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [newForm, setNewForm] = useState({
        code: "BA-2025-001",
        name: "Neues Projekt",
        client: "",
        place: "",
    });
    /** imposta il progetto selezionato ovunque (context + globale) */
    const setCurrentEverywhere = (p) => {
        try {
            const g = globalThis;
            g.__RLC_CURRENT_PROJECT = p; // fallback globale
        }
        catch {
            // niente
        }
        try {
            projectCtx?.setCurrentProject?.(p);
            projectCtx?.setCurrentProjectId?.(p.id);
            projectCtx?.selectProject?.(p);
            projectCtx?.selectProjectById?.(p.id);
        }
        catch (e) {
            console.warn("Project context not set correctly:", e);
        }
    };
    const clearCurrentIfMatches = (id) => {
        try {
            const g = globalThis;
            if (g.__RLC_CURRENT_PROJECT && g.__RLC_CURRENT_PROJECT.id === id) {
                g.__RLC_CURRENT_PROJECT = null;
            }
        }
        catch {
            // ignore
        }
        try {
            if (projectCtx?.currentProject?.id === id) {
                projectCtx.setCurrentProject?.(null);
            }
            if (projectCtx?.currentProjectId === id) {
                projectCtx.setCurrentProjectId?.(null);
            }
        }
        catch {
            // ignore
        }
    };
    /* ------- Carica lista progetti ------- */
    const loadList = async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await fetchProjects();
            const list = data.projects ?? [];
            setProjects(list);
            await projectCtx?.loadProjects?.();
            // 🔹 dopo aver die Projekte geladen, automatische nächste Projektnummer vorschlagen
            const nextCode = computeNextProjectCode(list);
            setNewForm((prev) => ({
                ...prev,
                code: nextCode,
            }));
        }
        catch (e) {
            console.error(e);
            setError(e?.message || "Fehler beim Laden der Projekte");
        }
        finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        void loadList();
    }, []);
    /* ------- Handlers import ------- */
    const handleJsonFileChange = (e) => {
        const f = e.target.files?.[0] || null;
        setJsonFile(f);
    };
    const handleZipFileChange = (e) => {
        const f = e.target.files?.[0] || null;
        setZipFile(f);
    };
    const handleImportJson = async () => {
        if (!jsonFile)
            return;
        try {
            setError(null);
            let text = await jsonFile.text();
            if (text.charCodeAt(0) === 0xfeff) {
                text = text.slice(1);
            }
            const firstBrace = text.indexOf("{");
            const lastBrace = text.lastIndexOf("}");
            if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
                throw new Error("Datei enthält kein gültiges JSON-Objekt.");
            }
            text = text.slice(firstBrace, lastBrace + 1);
            const parsed = JSON.parse(text);
            const project = parsed.project ?? parsed;
            const res = await fetch(`${API}/api/import/project-json`, {
                method: "POST",
                headers: { Accept: "application/json" },
                body: (() => {
                    const fd = new FormData();
                    const blob = new Blob([JSON.stringify(project)], {
                        type: "application/json",
                    });
                    fd.append("file", blob, "project.json");
                    return fd;
                })(),
            });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json) {
                throw new Error("Backend-Fehler beim Import.");
            }
            if (json.ok === false) {
                throw new Error(json.error || "Backend-Fehler beim Import.");
            }
            console.log("JSON import result:", json);
            alert("Projekt erfolgreich importiert.");
            setJsonFile(null);
            await loadList();
        }
        catch (err) {
            console.error("Import-Fehler:", err);
            setError(err?.message || "Fehler beim Import (project.json)");
            alert("Import fehlgeschlagen: " + (err?.message ?? String(err)));
        }
    };
    const handleImportZip = async () => {
        if (!zipFile)
            return;
        const fd = new FormData();
        fd.append("file", zipFile);
        try {
            setError(null);
            await importProjectZip(fd);
            setZipFile(null);
            await loadList();
        }
        catch (e) {
            console.error(e);
            setError(e?.message || "Fehler beim Import (ZIP)");
            alert("Fehler beim Import (ZIP): " + (e?.message ?? String(e)));
        }
    };
    /* ------- Handlers nuovo progetto ------- */
    const handleNewChange = (e) => {
        const { name, value } = e.target;
        setNewForm((prev) => ({ ...prev, [name]: value }));
    };
    const handleCreateProject = async (e) => {
        e.preventDefault();
        setCreateError(null);
        setCreating(true);
        try {
            const payload = {
                code: newForm.code.trim(),
                name: newForm.name.trim(),
                client: newForm.client.trim(),
                place: newForm.place.trim(),
            };
            const res = await apiCreateProject(payload);
            const created = res?.project ?? res;
            await loadList();
            if (created?.id) {
                setCurrentEverywhere(created);
                navigate("/projekt/uebersicht");
            }
        }
        catch (e) {
            console.error(e);
            setCreateError(e?.message || "Fehler beim Erstellen des Projekts");
        }
        finally {
            setCreating(false);
        }
    };
    /* ------- Seleziona progetto esistente ------- */
    const handleOpenProject = (p) => {
        setCurrentEverywhere(p);
        navigate("/projekt/uebersicht");
    };
    /* ------- Löschen ------- */
    const handleDeleteProject = async (p, ev) => {
        ev.stopPropagation(); // evita che il click selezioni il progetto
        if (!window.confirm(`Projekt "${p.code}" wirklich löschen?`))
            return;
        try {
            setDeletingId(p.id);
            await deleteProject(p.id);
            clearCurrentIfMatches(p.id);
            await loadList();
        }
        catch (e) {
            console.error(e);
            alert("Fehler beim Löschen des Projekts: " +
                (e?.message ?? String(e)));
        }
        finally {
            setDeletingId(null);
        }
    };
    /* ========= Render ========= */
    return (_jsxs("div", { style: pageContainer, children: [_jsx("h1", { style: sectionTitle, children: "Projekt ausw\u00E4hlen" }), _jsx("p", { style: sectionSubtitle, children: "Bestehendes Projekt \u00F6ffnen oder ein neues Projekt anlegen / importieren." }), (error || createError) && (_jsxs("div", { style: {
                    marginBottom: "1rem",
                    padding: "0.75rem 1rem",
                    borderRadius: 8,
                    border: "1px solid #FCA5A5",
                    background: "#FEF2F2",
                    color: "#B91C1C",
                    fontSize: "0.85rem",
                }, children: [error && _jsxs("div", { children: ["Fehler: ", error] }), createError && _jsx("div", { children: createError })] })), _jsxs("div", { style: layoutGrid, children: [_jsxs("section", { style: card, children: [_jsxs("div", { style: cardTitleRow, children: [_jsxs("div", { children: [_jsx("div", { style: cardTitle, children: "Projekt ausw\u00E4hlen" }), _jsx("div", { style: cardHint, children: "W\u00E4hlen Sie ein bestehendes Projekt oder importieren Sie eine Projektdatei." })] }), _jsx("button", { type: "button", style: btnGhost, onClick: () => loadList(), disabled: loading, children: "Neu laden" })] }), _jsxs("div", { style: cardBody, children: [_jsx("div", { style: { marginBottom: "0.9rem", fontWeight: 500 }, children: "Projekte" }), _jsxs("div", { style: tableWrapper, children: [_jsxs("div", { style: tableHeader, children: [_jsx("div", { children: "Projekt-Nr." }), _jsx("div", { children: "Name" }), _jsx("div", { children: "Auftraggeber" }), _jsx("div", { children: "Ort / Aktionen" })] }), projects.length === 0 && (_jsx("div", { style: {
                                                    padding: "0.75rem 0.9rem",
                                                    fontSize: "0.85rem",
                                                    color: "#9CA3AF",
                                                }, children: "Keine Projekte gefunden." })), projects.map((p, idx) => {
                                                const rowStyle = idx % 2 === 0 ? tableRow : tableRowAlt;
                                                return (_jsxs("div", { style: rowStyle, onClick: () => handleOpenProject(p), onMouseEnter: (ev) => {
                                                        ev.currentTarget.style.boxShadow =
                                                            String(tableRowHover.boxShadow);
                                                        ev.currentTarget.style.background =
                                                            String(tableRowHover.background);
                                                    }, onMouseLeave: (ev) => {
                                                        ev.currentTarget.style.boxShadow =
                                                            "none";
                                                        ev.currentTarget.style.background =
                                                            rowStyle.background ?? "transparent";
                                                    }, children: [_jsx("div", { children: p.code }), _jsx("div", { children: p.name }), _jsx("div", { children: p.client || "–" }), _jsxs("div", { style: {
                                                                display: "flex",
                                                                alignItems: "center",
                                                                justifyContent: "space-between",
                                                                gap: "0.5rem",
                                                            }, children: [_jsx("span", { children: p.place || "–" }), _jsx("button", { type: "button", style: btnDangerOutline, onClick: (ev) => handleDeleteProject(p, ev), disabled: deletingId === p.id, children: deletingId === p.id
                                                                        ? "Lösche…"
                                                                        : "Projekt löschen" })] })] }, p.id));
                                            })] }), _jsx("p", { style: mutedText, children: "Tipp: Projekt ausw\u00E4hlen, um zur Projekt-\u00DCbersicht zu wechseln." }), _jsxs("div", { style: {
                                            marginTop: "1.25rem",
                                            borderTop: "1px solid #E5E7EB",
                                            paddingTop: "1rem",
                                            display: "grid",
                                            gap: "0.85rem",
                                        }, children: [_jsxs("div", { children: [_jsx("div", { style: { fontWeight: 500, marginBottom: "0.25rem" }, children: "project.json importieren" }), _jsx("div", { style: { fontSize: "0.8rem", color: "#6B7280" }, children: "Exportierte Projektdatei (project.json) wieder einlesen." }), _jsxs("div", { style: {
                                                            marginTop: "0.5rem",
                                                            display: "flex",
                                                            gap: "0.5rem",
                                                            alignItems: "center",
                                                            flexWrap: "wrap",
                                                        }, children: [_jsx("input", { type: "file", accept: ".json,application/json", onChange: handleJsonFileChange, style: { fontSize: "0.8rem" } }), _jsx("button", { type: "button", style: btnPrimary, onClick: handleImportJson, disabled: !jsonFile, children: "Import JSON" })] })] }), _jsxs("div", { children: [_jsx("div", { style: { fontWeight: 500, marginBottom: "0.25rem" }, children: "Projekt-ZIP importieren" }), _jsx("div", { style: { fontSize: "0.8rem", color: "#6B7280" }, children: "Komplettes Projektarchiv (inkl. Dateien) als ZIP einlesen." }), _jsxs("div", { style: {
                                                            marginTop: "0.5rem",
                                                            display: "flex",
                                                            gap: "0.5rem",
                                                            alignItems: "center",
                                                            flexWrap: "wrap",
                                                        }, children: [_jsx("input", { type: "file", accept: ".zip,application/zip", onChange: handleZipFileChange, style: { fontSize: "0.8rem" } }), _jsx("button", { type: "button", style: btnPrimary, onClick: handleImportZip, disabled: !zipFile, children: "Import ZIP" })] })] })] })] })] }), _jsxs("section", { style: card, children: [_jsx("div", { style: cardTitleRow, children: _jsxs("div", { children: [_jsx("div", { style: cardTitle, children: "Projekt erstellen" }), _jsx("div", { style: cardHint, children: "Legen Sie ein neues Projekt mit Nummer, Namen und Ort an." })] }) }), _jsxs("form", { onSubmit: handleCreateProject, style: cardBody, children: [_jsxs("div", { style: { display: "grid", gap: "0.6rem" }, children: [_jsxs("div", { children: [_jsx("label", { style: {
                                                            display: "block",
                                                            fontSize: "0.8rem",
                                                            fontWeight: 500,
                                                            marginBottom: "0.15rem",
                                                        }, children: "Projektnummer" }), _jsx("input", { type: "text", name: "code", value: newForm.code, onChange: handleNewChange, style: {
                                                            width: "100%",
                                                            fontSize: "0.85rem",
                                                            borderRadius: 8,
                                                            border: "1px solid #D1D5DB",
                                                            padding: "0.45rem 0.6rem",
                                                        } })] }), _jsxs("div", { children: [_jsx("label", { style: {
                                                            display: "block",
                                                            fontSize: "0.8rem",
                                                            fontWeight: 500,
                                                            marginBottom: "0.15rem",
                                                        }, children: "Projektname" }), _jsx("input", { type: "text", name: "name", value: newForm.name, onChange: handleNewChange, style: {
                                                            width: "100%",
                                                            fontSize: "0.85rem",
                                                            borderRadius: 8,
                                                            border: "1px solid #D1D5DB",
                                                            padding: "0.45rem 0.6rem",
                                                        } })] }), _jsxs("div", { children: [_jsx("label", { style: {
                                                            display: "block",
                                                            fontSize: "0.8rem",
                                                            fontWeight: 500,
                                                            marginBottom: "0.15rem",
                                                        }, children: "Kunde / Auftraggeber" }), _jsx("input", { type: "text", name: "client", value: newForm.client, onChange: handleNewChange, style: {
                                                            width: "100%",
                                                            fontSize: "0.85rem",
                                                            borderRadius: 8,
                                                            border: "1px solid #D1D5DB",
                                                            padding: "0.45rem 0.6rem",
                                                        } })] }), _jsxs("div", { children: [_jsx("label", { style: {
                                                            display: "block",
                                                            fontSize: "0.8rem",
                                                            fontWeight: 500,
                                                            marginBottom: "0.15rem",
                                                        }, children: "Ort" }), _jsx("input", { type: "text", name: "place", value: newForm.place, onChange: handleNewChange, style: {
                                                            width: "100%",
                                                            fontSize: "0.85rem",
                                                            borderRadius: 8,
                                                            border: "1px solid #D1D5DB",
                                                            padding: "0.45rem 0.6rem",
                                                        } })] })] }), _jsx("div", { style: {
                                            marginTop: "1rem",
                                            display: "flex",
                                            justifyContent: "flex-end",
                                        }, children: _jsx("button", { type: "submit", style: btnPrimary, disabled: creating, children: creating ? "Wird angelegt..." : "Projekt anlegen" }) })] })] })] })] }));
};
export default ProjectStartPage;
