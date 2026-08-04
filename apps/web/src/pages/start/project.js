import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/start/project.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../../lib/apiBase";
import { useProject } from "../../store/useProject";
import { createProject as apiCreateProject, deleteProject, fetchProjects, importProjectZip } from "../../api/projects";
/* ========= API ========= */
function apiUrl(path) {
    const base = String(API_BASE || "").replace(/\/+$/, "");
    const p = path.startsWith("/") ? path : `/${path}`;
    if (!base)
        return p;
    if (base.endsWith("/api") && p.startsWith("/api/")) {
        return `${base}${p.slice(4)}`;
    }
    return `${base}${p}`;
}
/* ========= Constants ========= */
const RECENT_KEY = "rlc_recent_projects";
/* ========= Helper ========= */
function getProjectYear() {
    return new Date().getFullYear();
}
function computeNextProjectCode(projects) {
    const year = getProjectYear();
    const prefix = `BA-${year}-`;
    if (!projects?.length)
        return `${prefix}001`;
    let maxNum = 0;
    for (const p of projects) {
        const code = p.code || "";
        const match = code.match(/^(BA-\d{4}-)(\d+)$/);
        if (!match)
            continue;
        if (match[1] === prefix) {
            const num = Number.parseInt(match[2], 10);
            if (Number.isFinite(num) && num > maxNum)
                maxNum = num;
        }
    }
    return `${prefix}${String(maxNum + 1).padStart(3, "0")}`;
}
function isProjectItem(value) {
    if (!value || typeof value !== "object")
        return false;
    const v = value;
    return (typeof v.id === "string" &&
        typeof v.code === "string" &&
        typeof v.name === "string");
}
function extractCreatedProject(value) {
    if (isProjectItem(value))
        return value;
    if (value && typeof value === "object") {
        const env = value;
        if (isProjectItem(env.project))
            return env.project;
    }
    return undefined;
}
function normalizeText(v) {
    return String(v || "").trim().toLowerCase();
}
function fmtDate(value) {
    if (!value)
        return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime()))
        return "—";
    return d.toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    });
}
function readRecentIds() {
    try {
        const raw = localStorage.getItem(RECENT_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
    }
    catch {
        return [];
    }
}
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
    const [hoveredRowId, setHoveredRowId] = useState(null);
    const [search, setSearch] = useState("");
    const [selectedProjectId, setSelectedProjectId] = useState("");
    const [recentIds, setRecentIds] = useState(() => readRecentIds());
    const [newForm, setNewForm] = useState({
        code: computeNextProjectCode([]),
        name: "Neues Projekt",
        client: "",
        place: ""
    });
    function saveRecent(projectId) {
        try {
            const next = [projectId, ...recentIds.filter((x) => x !== projectId)].slice(0, 6);
            setRecentIds(next);
            localStorage.setItem(RECENT_KEY, JSON.stringify(next));
        }
        catch {
            //
        }
    }
    function setCurrentEverywhere(p) {
        try {
            const g = globalThis;
            g.__RLC_CURRENT_PROJECT = p;
        }
        catch {
            //
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
    }
    function clearCurrentIfMatches(id) {
        try {
            const g = globalThis;
            if (g.__RLC_CURRENT_PROJECT?.id === id) {
                g.__RLC_CURRENT_PROJECT = null;
            }
        }
        catch {
            //
        }
        try {
            if (projectCtx?.currentProject?.id === id) {
                projectCtx?.setCurrentProject?.(null);
            }
            if (projectCtx?.currentProjectId === id) {
                projectCtx?.setCurrentProjectId?.(null);
            }
        }
        catch {
            //
        }
    }
    async function loadList() {
        try {
            setLoading(true);
            setError(null);
            const data = await fetchProjects();
            const list = Array.isArray(data?.projects) ? data.projects : [];
            setProjects(list);
            await projectCtx?.loadProjects?.();
            setNewForm((prev) => ({
                ...prev,
                code: computeNextProjectCode(list)
            }));
        }
        catch (e) {
            console.error(e);
            setError(e?.message || "Fehler beim Laden der Projekte");
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        void loadList();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const filteredProjects = useMemo(() => {
        const q = normalizeText(search);
        if (!q)
            return projects;
        return projects.filter((p) => {
            return (normalizeText(p.code).includes(q) ||
                normalizeText(p.name).includes(q) ||
                normalizeText(p.client).includes(q) ||
                normalizeText(p.place).includes(q));
        });
    }, [projects, search]);
    const recentProjects = useMemo(() => {
        const map = new Map(projects.map((p) => [p.id, p]));
        return recentIds.map((id) => map.get(id)).filter(Boolean);
    }, [projects, recentIds]);
    const selectedProject = useMemo(() => {
        return projects.find((p) => p.id === selectedProjectId) || null;
    }, [projects, selectedProjectId]);
    const stats = useMemo(() => {
        const withClient = projects.filter((p) => normalizeText(p.client)).length;
        const withPlace = projects.filter((p) => normalizeText(p.place)).length;
        return {
            total: projects.length,
            visible: filteredProjects.length,
            recent: recentProjects.length,
            withClient,
            withPlace
        };
    }, [projects, filteredProjects, recentProjects]);
    function handleJsonFileChange(e) {
        setJsonFile(e.target.files?.[0] || null);
    }
    function handleZipFileChange(e) {
        setZipFile(e.target.files?.[0] || null);
    }
    async function handleImportJson() {
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
            const fd = new FormData();
            const blob = new Blob([JSON.stringify(project)], {
                type: "application/json"
            });
            fd.append("file", blob, "project.json");
            const res = await fetch(apiUrl("/api/import/project-json"), {
                method: "POST",
                headers: { Accept: "application/json" },
                body: fd,
                credentials: "include"
            });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json)
                throw new Error("Backend-Fehler beim Import.");
            if (json.ok === false)
                throw new Error(json.error || "Backend-Fehler beim Import.");
            setJsonFile(null);
            await loadList();
            window.alert("Projekt erfolgreich importiert.");
        }
        catch (err) {
            console.error("Import-Fehler:", err);
            const msg = err?.message || "Fehler beim Import (project.json)";
            setError(msg);
            window.alert(`Import fehlgeschlagen: ${msg}`);
        }
    }
    async function handleImportZip() {
        if (!zipFile)
            return;
        try {
            setError(null);
            const fd = new FormData();
            fd.append("file", zipFile);
            await importProjectZip(fd);
            setZipFile(null);
            await loadList();
            window.alert("ZIP erfolgreich importiert.");
        }
        catch (e) {
            console.error(e);
            const msg = e?.message || "Fehler beim Import (ZIP)";
            setError(msg);
            window.alert(`Fehler beim Import (ZIP): ${msg}`);
        }
    }
    function handleNewChange(e) {
        const { name, value } = e.target;
        setNewForm((prev) => ({ ...prev, [name]: value }));
    }
    async function handleCreateProject(e) {
        e.preventDefault();
        setCreateError(null);
        setCreating(true);
        try {
            const payload = {
                code: newForm.code.trim(),
                name: newForm.name.trim(),
                client: newForm.client.trim(),
                place: newForm.place.trim()
            };
            if (!payload.code)
                throw new Error("Projektnummer fehlt.");
            if (!payload.name)
                throw new Error("Projektname fehlt.");
            const res = await apiCreateProject(payload);
            const created = extractCreatedProject(res);
            await loadList();
            if (created?.id) {
                setCurrentEverywhere(created);
                saveRecent(created.id);
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
    }
    function handleOpenProject(p) {
        setCurrentEverywhere(p);
        saveRecent(p.id);
        navigate("/projekt/uebersicht");
    }
    async function handleDeleteProject(p, ev) {
        ev.stopPropagation();
        if (!window.confirm(`Projekt "${p.code}" wirklich löschen?`))
            return;
        try {
            setDeletingId(p.id);
            await deleteProject(p.id);
            clearCurrentIfMatches(p.id);
            const nextRecent = recentIds.filter((x) => x !== p.id);
            setRecentIds(nextRecent);
            try {
                localStorage.setItem(RECENT_KEY, JSON.stringify(nextRecent));
            }
            catch {
                //
            }
            await loadList();
        }
        catch (e) {
            console.error(e);
            window.alert(`Fehler beim Löschen des Projekts: ${e?.message ?? String(e)}`);
        }
        finally {
            setDeletingId(null);
        }
    }
    return (_jsxs("div", { className: rlcClass(null, page), children: [_jsxs("section", { className: rlcClass("rlc-page-hero", heroCard), children: [_jsxs("div", { children: [_jsx("div", { className: rlcClass(null, eyebrow), children: "RLC Projektzentrale" }), _jsx("h1", { className: rlcClass(null, heroTitle), children: "Projekt ausw\u00E4hlen" }), _jsx("p", { className: rlcClass(null, heroText), children: "Bestehendes Projekt \u00F6ffnen, neues Projekt anlegen oder Projektdateien sauber importieren." })] }), _jsxs("div", { className: rlcClass(null, heroActions), children: [_jsx("button", { type: "button", className: rlcClass(null, btnPrimaryHero), onClick: () => void loadList(), children: loading ? "Lädt..." : "Projekte neu laden" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondaryHero), onClick: () => {
                                    const target = document.getElementById("create-project-card");
                                    target?.scrollIntoView({ behavior: "smooth", block: "start" });
                                }, children: "Neues Projekt" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondaryHero), onClick: () => {
                                    const target = document.getElementById("import-project-card");
                                    target?.scrollIntoView({ behavior: "smooth", block: "start" });
                                }, children: "Import" })] }), _jsxs("div", { className: rlcClass(null, heroMeta), children: ["Projekte: ", _jsx("b", { children: stats.total }), " \u00B7 Sichtbar: ", _jsx("b", { children: stats.visible }), " \u00B7 Zuletzt ge\u00F6ffnet: ", _jsx("b", { children: stats.recent })] })] }), error || createError ?
                _jsxs("div", { className: rlcClass(null, errorBox), children: [error ? _jsxs("div", { children: ["Fehler: ", error] }) : null, createError ? _jsx("div", { children: createError }) : null] }) :
                null, _jsxs("section", { className: rlcClass(null, kpiGrid), children: [_jsx(Kpi, { label: "Projekte", value: String(stats.total) }), _jsx(Kpi, { label: "Suchtreffer", value: String(stats.visible) }), _jsx(Kpi, { label: "Zuletzt ge\u00F6ffnet", value: String(stats.recent) }), _jsx(Kpi, { label: "Mit Auftraggeber", value: String(stats.withClient) }), _jsx(Kpi, { label: "Mit Ort", value: String(stats.withPlace) })] }), _jsxs("section", { className: rlcClass(null, layoutGrid), children: [_jsxs("div", { className: rlcClass(null, mainStack), children: [_jsxs("section", { className: rlcClass(null, card), children: [_jsxs("div", { className: rlcClass(null, sectionHead), children: [_jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "Projekt suchen & \u00F6ffnen" }), _jsx("div", { className: rlcClass(null, sectionText), children: "Schnell suchen, zuletzt verwendete Projekte \u00F6ffnen oder aus der Liste w\u00E4hlen." })] }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondary), onClick: () => void loadList(), disabled: loading, children: loading ? "Lädt..." : "Neu laden" })] }), _jsxs("div", { className: rlcClass(null, searchGrid), children: [_jsxs("div", { children: [_jsx(FieldLabel, { children: "Projekt suchen" }), _jsx("input", { type: "text", placeholder: "Nach Projektnummer, Name, Kunde oder Ort suchen...", value: search, onChange: (e) => setSearch(e.target.value), className: rlcClass(null, searchInput) })] }), _jsxs("div", { children: [_jsx(FieldLabel, { children: "Schnellwahl" }), _jsxs("div", { className: rlcClass(null, quickSelectRow), children: [_jsxs("select", { value: selectedProjectId, onChange: (e) => setSelectedProjectId(e.target.value), className: rlcClass(null, input), children: [_jsx("option", { value: "", children: "Projekt ausw\u00E4hlen..." }), filteredProjects.map((p) => _jsxs("option", { value: p.id, children: [p.code, " \u2014 ", p.name] }, p.id))] }), _jsx("button", { type: "button", className: rlcClass(null, btnPrimary), disabled: !selectedProject, onClick: () => selectedProject && handleOpenProject(selectedProject), children: "\u00D6ffnen" })] })] })] })] }), recentProjects.length > 0 ?
                                _jsxs("section", { className: rlcClass(null, card), children: [_jsx("div", { className: rlcClass(null, sectionHead), children: _jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "Zuletzt ge\u00F6ffnet" }), _jsx("div", { className: rlcClass(null, sectionText), children: "Direkter Zugriff auf die letzten Projekte." })] }) }), _jsx("div", { className: rlcClass(null, recentGrid), children: recentProjects.map((p) => _jsxs("button", { type: "button", className: rlcClass(null, recentCard), onClick: () => handleOpenProject(p), children: [_jsxs("div", { children: [_jsx("div", { className: rlcClass(null, projectCode), children: p.code }), _jsx("div", { className: rlcClass(null, projectName), children: p.name }), _jsxs("div", { className: rlcClass(null, projectSub), children: [p.client || "—", " ", p.place ? `· ${p.place}` : ""] })] }), _jsx("span", { className: rlcClass(null, openPill), children: "\u00D6ffnen" })] }, p.id)) })] }) :
                                null, _jsxs("section", { className: rlcClass(null, card), children: [_jsx("div", { className: rlcClass(null, sectionHead), children: _jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "Alle Projekte" }), _jsx("div", { className: rlcClass(null, sectionText), children: "Vollst\u00E4ndige Projektliste mit \u00D6ffnen- und L\u00F6schen-Aktion." })] }) }), _jsxs("div", { className: rlcClass(null, tableWrap), children: [_jsxs("div", { className: rlcClass(null, tableHeader), children: [_jsx("div", { children: "Projekt-Nr." }), _jsx("div", { children: "Name" }), _jsx("div", { children: "Auftraggeber" }), _jsx("div", { children: "Ort / Aktionen" })] }), _jsxs("div", { className: rlcClass(null, scrollList), children: [!filteredProjects.length ?
                                                        _jsx("div", { className: rlcClass(null, emptyCell), children: "Keine Projekte gefunden." }) :
                                                        null, filteredProjects.map((p, idx) => {
                                                        const isHovered = hoveredRowId === p.id;
                                                        return (_jsxs("div", { className: rlcClass(null, {
                                                                ...tableRow,
                                                                background: idx % 2 === 0 ? "#FFFFFF" : "#F8FAFC",
                                                                ...(isHovered ? tableRowHover : {})
                                                            }), onMouseEnter: () => setHoveredRowId(p.id), onMouseLeave: () => setHoveredRowId(null), children: [_jsx("div", { className: rlcClass(null, projectCode), children: p.code }), _jsxs("div", { children: [_jsx("b", { children: p.name }), _jsxs("div", { className: rlcClass(null, tiny), children: ["Erstellt: ", fmtDate(p.createdAt)] })] }), _jsx("div", { children: p.client || "—" }), _jsxs("div", { className: rlcClass(null, rowActions), children: [_jsx("span", { children: p.place || "—" }), _jsxs("div", { className: rlcClass(null, buttonRow), children: [_jsx("button", { type: "button", className: rlcClass(null, btnSecondarySmall), onClick: () => handleOpenProject(p), children: "\u00D6ffnen" }), _jsx("button", { type: "button", className: rlcClass(null, btnDangerSmall), onClick: (ev) => handleDeleteProject(p, ev), disabled: deletingId === p.id, children: deletingId === p.id ? "Lösche..." : "Löschen" })] })] })] }, p.id));
                                                    })] })] })] })] }), _jsxs("aside", { className: rlcClass(null, sideStack), children: [_jsxs("section", { id: "create-project-card", className: rlcClass(null, card), children: [_jsx("div", { className: rlcClass(null, sectionHead), children: _jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "Projekt erstellen" }), _jsx("div", { className: rlcClass(null, sectionText), children: "Neues Projekt direkt mit Projektnummer, Name, Kunde und Ort anlegen." })] }) }), _jsxs("form", { onSubmit: handleCreateProject, className: rlcClass(null, formStack), children: [_jsx(Field, { label: "Projektnummer", children: _jsx("input", { type: "text", name: "code", value: newForm.code, onChange: handleNewChange, className: rlcClass(null, input) }) }), _jsx(Field, { label: "Projektname", children: _jsx("input", { type: "text", name: "name", value: newForm.name, onChange: handleNewChange, className: rlcClass(null, input) }) }), _jsx(Field, { label: "Kunde / Auftraggeber", children: _jsx("input", { type: "text", name: "client", value: newForm.client, onChange: handleNewChange, className: rlcClass(null, input) }) }), _jsx(Field, { label: "Ort", children: _jsx("input", { type: "text", name: "place", value: newForm.place, onChange: handleNewChange, className: rlcClass(null, input) }) }), _jsx("button", { type: "submit", className: rlcClass(null, btnPrimaryFull), disabled: creating, children: creating ? "Wird angelegt..." : "Projekt anlegen" })] })] }), _jsxs("section", { id: "import-project-card", className: rlcClass(null, card), children: [_jsx("div", { className: rlcClass(null, sectionHead), children: _jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "Projekt importieren" }), _jsx("div", { className: rlcClass(null, sectionText), children: "project.json oder vollst\u00E4ndiges Projekt-ZIP einlesen." })] }) }), _jsxs("div", { className: rlcClass(null, importBlock), children: [_jsxs("div", { children: [_jsx("div", { className: rlcClass(null, importTitle), children: "project.json importieren" }), _jsx("div", { className: rlcClass(null, sectionText), children: "Exportierte Projektdatei wieder einlesen." })] }), _jsx("input", { type: "file", accept: ".json,application/json", onChange: handleJsonFileChange, className: rlcClass(null, fileInput) }), _jsx("button", { type: "button", className: rlcClass(null, btnPrimary), onClick: handleImportJson, disabled: !jsonFile, children: "Import JSON" })] }), _jsxs("div", { className: rlcClass(null, importBlock), children: [_jsxs("div", { children: [_jsx("div", { className: rlcClass(null, importTitle), children: "Projekt-ZIP importieren" }), _jsx("div", { className: rlcClass(null, sectionText), children: "Komplettes Projektarchiv inklusive Dateien einlesen." })] }), _jsx("input", { type: "file", accept: ".zip,application/zip", onChange: handleZipFileChange, className: rlcClass(null, fileInput) }), _jsx("button", { type: "button", className: rlcClass(null, btnPrimary), onClick: handleImportZip, disabled: !zipFile, children: "Import ZIP" })] })] })] })] })] }));
};
export default ProjectStartPage;
/* ========= UI ========= */
function Kpi({ label, value }) {
    return (_jsxs("div", { className: rlcClass(null, kpiCard), children: [_jsx("div", { className: rlcClass(null, kpiLabel), children: label }), _jsx("div", { className: rlcClass(null, kpiValue), children: value })] }));
}
function Field({ label, children }) {
    return (_jsxs("label", { className: rlcClass(null, fieldWrap), children: [_jsx("span", { className: rlcClass(null, labelStyle), children: label }), children] }));
}
function FieldLabel({ children }) {
    return _jsx("div", { className: rlcClass(null, labelStyle), children: children });
}
/* ========= Styles ========= */
const page = {
    display: "grid",
    gap: 14,
    padding: "2px 0 16px"
};
const heroCard = {
    background: "linear-gradient(125deg, #0B5BD3 0%, #146EF5 58%, #24B4FF 100%)",
    color: "#FFFFFF",
    borderRadius: 12,
    padding: "20px 22px",
    display: "grid",
    gap: 13,
    boxShadow: "0 8px 24px rgba(20,110,245,0.16)",
    overflow: "hidden"
};
const eyebrow = {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    opacity: 0.78,
    fontWeight: 700
};
const heroTitle = {
    color: "#FFFFFF", margin: "4px 0",
    fontSize: 29,
    lineHeight: 1.1,
    fontWeight: 700
};
const heroText = {
    margin: 0,
    maxWidth: 920,
    opacity: 0.88,
    lineHeight: 1.55,
    fontSize: 15
};
const heroActions = {
    display: "flex",
    gap: 10,
    flexWrap: "wrap"
};
const heroMeta = {
    fontSize: 13,
    opacity: 0.9
};
const errorBox = {
    border: "1px solid #FCA5A5",
    background: "#FEF2F2",
    color: "#B91C1C",
    borderRadius: 14,
    padding: "12px 14px",
    fontSize: 13,
    fontWeight: 700
};
const kpiGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))",
    gap: 8
};
const kpiCard = {
    background: "#FFFFFF",
    border: "0",
    borderBottom: "2px solid #BED6FF",
    borderRadius: 0,
    padding: "12px 10px",
    boxShadow: "none"
};
const kpiLabel = {
    fontSize: 12,
    color: "#64748B",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em"
};
const kpiValue = {
    marginTop: 6,
    fontSize: 21,
    color: "#0F172A",
    fontWeight: 700
};
const layoutGrid = {
    display: "grid",
    gridTemplateColumns: "minmax(0,1.45fr) 420px",
    gap: 14,
    alignItems: "start"
};
const mainStack = {
    display: "grid",
    gap: 14,
    minWidth: 0
};
const sideStack = {
    display: "grid",
    gap: 14,
    minWidth: 0
};
const card = {
    background: "#FFFFFF",
    border: "1px solid #DDE5F0",
    borderRadius: 10,
    padding: 16,
    boxShadow: "none"
};
const sectionHead = {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    flexWrap: "wrap",
    marginBottom: 14
};
const sectionTitle = {
    margin: 0,
    color: "#0F172A",
    fontSize: 18,
    fontWeight: 700
};
const sectionText = {
    marginTop: 4,
    color: "#64748B",
    fontSize: 13,
    lineHeight: 1.45
};
const searchGrid = {
    display: "grid",
    gap: 12
};
const fieldWrap = {
    display: "grid",
    gap: 5
};
const labelStyle = {
    marginBottom: 5,
    color: "#334155",
    fontSize: 12,
    fontWeight: 700
};
const input = {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #D1D5DB",
    borderRadius: 10,
    background: "#FFFFFF",
    color: "#0F172A",
    padding: "10px 12px",
    fontSize: 13,
    outline: "none"
};
const searchInput = {
    ...input,
    padding: "12px 13px",
    fontSize: 14
};
const quickSelectRow = {
    display: "grid",
    gridTemplateColumns: "minmax(0,1fr) auto",
    gap: 8,
    alignItems: "center"
};
const recentGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
    gap: 10
};
const recentCard = {
    border: "0",
    borderBottom: "1px solid #DDE5F0",
    background: "#FFFFFF",
    borderRadius: 0,
    padding: "11px 2px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    textAlign: "left",
    color: "#0F172A",
    cursor: "pointer"
};
const projectCode = {
    color: "#0F172A",
    fontWeight: 700
};
const projectName = {
    marginTop: 2,
    color: "#0F172A",
    fontWeight: 700
};
const projectSub = {
    marginTop: 3,
    color: "#64748B",
    fontSize: 12,
    fontWeight: 600
};
const openPill = {
    border: "1px solid #BED6FF",
    background: "#EAF2FF",
    color: "#0B5BD3",
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: "nowrap"
};
const tableWrap = {
    overflow: "hidden",
    border: "1px solid #DDE5F0",
    borderRadius: 10
};
const tableHeader = {
    display: "grid",
    gridTemplateColumns: "1fr 1.6fr 1.2fr 1.8fr",
    gap: 10,
    padding: "11px 12px",
    background: "#F8FAFC",
    color: "#64748B",
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em"
};
const scrollList = {
    maxHeight: 470,
    overflowY: "auto"
};
const tableRow = {
    display: "grid",
    gridTemplateColumns: "1fr 1.6fr 1.2fr 1.8fr",
    gap: 10,
    alignItems: "center",
    padding: "12px",
    borderTop: "1px solid #E5E7EB",
    color: "#0F172A",
    fontSize: 13,
    transition: "all 120ms ease"
};
const tableRowHover = {
    background: "#F5F8FF",
    boxShadow: "inset 3px 0 0 #146EF5"
};
const tiny = {
    marginTop: 3,
    color: "#64748B",
    fontSize: 11,
    fontWeight: 600
};
const rowActions = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    flexWrap: "wrap"
};
const buttonRow = {
    display: "flex",
    gap: 6,
    flexWrap: "wrap"
};
const emptyCell = {
    padding: 16,
    color: "#64748B",
    fontSize: 13,
    background: "#FFFFFF"
};
const formStack = {
    display: "grid",
    gap: 12
};
const importBlock = {
    borderTop: "1px solid #E5E7EB",
    paddingTop: 14,
    marginTop: 14,
    display: "grid",
    gap: 10
};
const importTitle = {
    color: "#0F172A",
    fontWeight: 700,
    fontSize: 14
};
const fileInput = {
    fontSize: 12,
    color: "#0F172A"
};
const btnBase = {
    border: "1px solid #D1D5DB",
    borderRadius: 8,
    padding: "9px 13px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap"
};
const btnPrimary = {
    ...btnBase,
    border: "1px solid #146EF5",
    background: "#146EF5",
    color: "#FFFFFF"
};
const btnPrimaryFull = {
    ...btnPrimary,
    width: "100%",
    justifyContent: "center"
};
const btnSecondary = {
    ...btnBase,
    background: "#FFFFFF",
    color: "#0F172A"
};
const btnPrimaryHero = {
    ...btnBase,
    border: "1px solid #FFFFFF",
    background: "#FFFFFF",
    color: "#0B5BD3",
    padding: "11px 16px"
};
const btnSecondaryHero = {
    ...btnBase,
    border: "1px solid rgba(255,255,255,0.55)",
    background: "rgba(255,255,255,0.90)",
    color: "#0F172A",
    padding: "11px 16px"
};
const btnSecondarySmall = {
    ...btnSecondary,
    padding: "7px 10px",
    borderRadius: 9,
    fontSize: 12
};
const btnDangerSmall = {
    ...btnSecondarySmall,
    border: "1px solid #FCA5A5",
    background: "#FEF2F2",
    color: "#B91C1C"
};
