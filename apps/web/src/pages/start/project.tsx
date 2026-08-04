import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/start/project.tsx
import React, {
  ChangeEvent,
  FormEvent,
  useEffect,
  useMemo,
  useState } from
"react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../../lib/apiBase";
import { useProject } from "../../store/useProject";
import {
  createProject as apiCreateProject,
  deleteProject,
  fetchProjects,
  importProjectZip } from
"../../api/projects";

/* ========= API ========= */

function apiUrl(path: string): string {
  const base = String(API_BASE || "").replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;

  if (!base) return p;

  if (base.endsWith("/api") && p.startsWith("/api/")) {
    return `${base}${p.slice(4)}`;
  }

  return `${base}${p}`;
}

/* ========= Typen ========= */

type ProjectItem = {
  id: string;
  code: string;
  name: string;
  client?: string | null;
  place?: string | null;
  createdAt?: string;
};

type NewProjectForm = {
  code: string;
  name: string;
  client: string;
  place: string;
};

type ApiProjectEnvelope = {
  ok?: boolean;
  project?: ProjectItem;
  projects?: ProjectItem[];
  error?: string;
};

/* ========= Constants ========= */

const RECENT_KEY = "rlc_recent_projects";

/* ========= Helper ========= */

function getProjectYear(): number {
  return new Date().getFullYear();
}

function computeNextProjectCode(projects: ProjectItem[]): string {
  const year = getProjectYear();
  const prefix = `BA-${year}-`;

  if (!projects?.length) return `${prefix}001`;

  let maxNum = 0;

  for (const p of projects) {
    const code = p.code || "";
    const match = code.match(/^(BA-\d{4}-)(\d+)$/);
    if (!match) continue;

    if (match[1] === prefix) {
      const num = Number.parseInt(match[2], 10);
      if (Number.isFinite(num) && num > maxNum) maxNum = num;
    }
  }

  return `${prefix}${String(maxNum + 1).padStart(3, "0")}`;
}

function isProjectItem(value: unknown): value is ProjectItem {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;

  return (
    typeof v.id === "string" &&
    typeof v.code === "string" &&
    typeof v.name === "string");

}

function extractCreatedProject(value: unknown): ProjectItem | undefined {
  if (isProjectItem(value)) return value;

  if (value && typeof value === "object") {
    const env = value as ApiProjectEnvelope;
    if (isProjectItem(env.project)) return env.project;
  }

  return undefined;
}

function normalizeText(v?: string | null): string {
  return String(v || "").trim().toLowerCase();
}

function fmtDate(value?: string): string {
  if (!value) return "—";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";

  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function readRecentIds(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/* ========= Component ========= */

const ProjectStartPage: React.FC = () => {
  const navigate = useNavigate();
  const projectCtx: any = useProject();

  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [jsonFile, setJsonFile] = useState<File | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [recentIds, setRecentIds] = useState<string[]>(() => readRecentIds());

  const [newForm, setNewForm] = useState<NewProjectForm>({
    code: computeNextProjectCode([]),
    name: "Neues Projekt",
    client: "",
    place: ""
  });

  function saveRecent(projectId: string) {
    try {
      const next = [projectId, ...recentIds.filter((x) => x !== projectId)].slice(0, 6);
      setRecentIds(next);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {

      //
    }}

  function setCurrentEverywhere(p: ProjectItem) {
    try {
      const g = globalThis as any;
      g.__RLC_CURRENT_PROJECT = p;
    } catch {

      //
    }
    try {
      projectCtx?.setCurrentProject?.(p);
      projectCtx?.setCurrentProjectId?.(p.id);
      projectCtx?.selectProject?.(p);
      projectCtx?.selectProjectById?.(p.id);
    } catch (e) {
      console.warn("Project context not set correctly:", e);
    }
  }

  function clearCurrentIfMatches(id: string) {
    try {
      const g = globalThis as any;
      if (g.__RLC_CURRENT_PROJECT?.id === id) {
        g.__RLC_CURRENT_PROJECT = null;
      }
    } catch {

      //
    }
    try {
      if (projectCtx?.currentProject?.id === id) {
        projectCtx?.setCurrentProject?.(null);
      }

      if (projectCtx?.currentProjectId === id) {
        projectCtx?.setCurrentProjectId?.(null);
      }
    } catch {

      //
    }}

  async function loadList() {
    try {
      setLoading(true);
      setError(null);

      const data = await fetchProjects();
      const list: ProjectItem[] = Array.isArray(data?.projects) ? data.projects : [];

      setProjects(list);
      await projectCtx?.loadProjects?.();

      setNewForm((prev) => ({
        ...prev,
        code: computeNextProjectCode(list)
      }));
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Fehler beim Laden der Projekte");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredProjects = useMemo(() => {
    const q = normalizeText(search);
    if (!q) return projects;

    return projects.filter((p) => {
      return (
        normalizeText(p.code).includes(q) ||
        normalizeText(p.name).includes(q) ||
        normalizeText(p.client).includes(q) ||
        normalizeText(p.place).includes(q));

    });
  }, [projects, search]);

  const recentProjects = useMemo(() => {
    const map = new Map(projects.map((p) => [p.id, p]));
    return recentIds.map((id) => map.get(id)).filter(Boolean) as ProjectItem[];
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

  function handleJsonFileChange(e: ChangeEvent<HTMLInputElement>) {
    setJsonFile(e.target.files?.[0] || null);
  }

  function handleZipFileChange(e: ChangeEvent<HTMLInputElement>) {
    setZipFile(e.target.files?.[0] || null);
  }

  async function handleImportJson() {
    if (!jsonFile) return;

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

      if (!res.ok || !json) throw new Error("Backend-Fehler beim Import.");
      if (json.ok === false) throw new Error(json.error || "Backend-Fehler beim Import.");

      setJsonFile(null);
      await loadList();
      window.alert("Projekt erfolgreich importiert.");
    } catch (err: any) {
      console.error("Import-Fehler:", err);
      const msg = err?.message || "Fehler beim Import (project.json)";
      setError(msg);
      window.alert(`Import fehlgeschlagen: ${msg}`);
    }
  }

  async function handleImportZip() {
    if (!zipFile) return;

    try {
      setError(null);

      const fd = new FormData();
      fd.append("file", zipFile);

      await importProjectZip(fd);

      setZipFile(null);
      await loadList();
      window.alert("ZIP erfolgreich importiert.");
    } catch (e: any) {
      console.error(e);
      const msg = e?.message || "Fehler beim Import (ZIP)";
      setError(msg);
      window.alert(`Fehler beim Import (ZIP): ${msg}`);
    }
  }

  function handleNewChange(e: ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setNewForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleCreateProject(e: FormEvent) {
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

      if (!payload.code) throw new Error("Projektnummer fehlt.");
      if (!payload.name) throw new Error("Projektname fehlt.");

      const res = await apiCreateProject(payload);
      const created = extractCreatedProject(res);

      await loadList();

      if (created?.id) {
        setCurrentEverywhere(created);
        saveRecent(created.id);
        navigate("/projekt/uebersicht");
      }
    } catch (e: any) {
      console.error(e);
      setCreateError(e?.message || "Fehler beim Erstellen des Projekts");
    } finally {
      setCreating(false);
    }
  }

  function handleOpenProject(p: ProjectItem) {
    setCurrentEverywhere(p);
    saveRecent(p.id);
    navigate("/projekt/uebersicht");
  }

  async function handleDeleteProject(
  p: ProjectItem,
  ev: React.MouseEvent<HTMLButtonElement>)
  {
    ev.stopPropagation();

    if (!window.confirm(`Projekt "${p.code}" wirklich löschen?`)) return;

    try {
      setDeletingId(p.id);

      await deleteProject(p.id);
      clearCurrentIfMatches(p.id);

      const nextRecent = recentIds.filter((x) => x !== p.id);
      setRecentIds(nextRecent);

      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(nextRecent));
      } catch {

        //
      }
      await loadList();
    } catch (e: any) {
      console.error(e);
      window.alert(`Fehler beim Löschen des Projekts: ${e?.message ?? String(e)}`);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className={rlcClass(null, page)}>
      <section className={rlcClass("rlc-page-hero", heroCard)}>
        <div>
          <div className={rlcClass(null, eyebrow)}>RLC Projektzentrale</div>
          <h1 className={rlcClass(null, heroTitle)}>Projekt auswählen</h1>
          <p className={rlcClass(null, heroText)}>
            Bestehendes Projekt öffnen, neues Projekt anlegen oder Projektdateien
            sauber importieren.
          </p>
        </div>

        <div className={rlcClass(null, heroActions)}>
          <button type="button" className={rlcClass(null, btnPrimaryHero)} onClick={() => void loadList()}>
            {loading ? "Lädt..." : "Projekte neu laden"}
          </button>

          <button
            type="button" className={rlcClass(null,
            btnSecondaryHero)}
            onClick={() => {
              const target = document.getElementById("create-project-card");
              target?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}>
            
            Neues Projekt
          </button>

          <button
            type="button" className={rlcClass(null,
            btnSecondaryHero)}
            onClick={() => {
              const target = document.getElementById("import-project-card");
              target?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}>
            
            Import
          </button>
        </div>

        <div className={rlcClass(null, heroMeta)}>
          Projekte: <b>{stats.total}</b> · Sichtbar: <b>{stats.visible}</b> · Zuletzt
          geöffnet: <b>{stats.recent}</b>
        </div>
      </section>

      {error || createError ?
      <div className={rlcClass(null, errorBox)}>
          {error ? <div>Fehler: {error}</div> : null}
          {createError ? <div>{createError}</div> : null}
        </div> :
      null}

      <section className={rlcClass(null, kpiGrid)}>
        <Kpi label="Projekte" value={String(stats.total)} />
        <Kpi label="Suchtreffer" value={String(stats.visible)} />
        <Kpi label="Zuletzt geöffnet" value={String(stats.recent)} />
        <Kpi label="Mit Auftraggeber" value={String(stats.withClient)} />
        <Kpi label="Mit Ort" value={String(stats.withPlace)} />
      </section>

      <section className={rlcClass(null, layoutGrid)}>
        <div className={rlcClass(null, mainStack)}>
          <section className={rlcClass(null, card)}>
            <div className={rlcClass(null, sectionHead)}>
              <div>
                <h2 className={rlcClass(null, sectionTitle)}>Projekt suchen & öffnen</h2>
                <div className={rlcClass(null, sectionText)}>
                  Schnell suchen, zuletzt verwendete Projekte öffnen oder aus der Liste wählen.
                </div>
              </div>

              <button
                type="button" className={rlcClass(null,
                btnSecondary)}
                onClick={() => void loadList()}
                disabled={loading}>
                
                {loading ? "Lädt..." : "Neu laden"}
              </button>
            </div>

            <div className={rlcClass(null, searchGrid)}>
              <div>
                <FieldLabel>Projekt suchen</FieldLabel>
                <input
                  type="text"
                  placeholder="Nach Projektnummer, Name, Kunde oder Ort suchen..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)} className={rlcClass(null,
                  searchInput)} />
                
              </div>

              <div>
                <FieldLabel>Schnellwahl</FieldLabel>
                <div className={rlcClass(null, quickSelectRow)}>
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)} className={rlcClass(null,
                    input)}>
                    
                    <option value="">Projekt auswählen...</option>
                    {filteredProjects.map((p) =>
                    <option key={p.id} value={p.id}>
                        {p.code} — {p.name}
                      </option>
                    )}
                  </select>

                  <button
                    type="button" className={rlcClass(null,
                    btnPrimary)}
                    disabled={!selectedProject}
                    onClick={() => selectedProject && handleOpenProject(selectedProject)}>
                    
                    Öffnen
                  </button>
                </div>
              </div>
            </div>
          </section>

          {recentProjects.length > 0 ?
          <section className={rlcClass(null, card)}>
              <div className={rlcClass(null, sectionHead)}>
                <div>
                  <h2 className={rlcClass(null, sectionTitle)}>Zuletzt geöffnet</h2>
                  <div className={rlcClass(null, sectionText)}>Direkter Zugriff auf die letzten Projekte.</div>
                </div>
              </div>

              <div className={rlcClass(null, recentGrid)}>
                {recentProjects.map((p) =>
              <button
                key={p.id}
                type="button" className={rlcClass(null,
                recentCard)}
                onClick={() => handleOpenProject(p)}>
                
                    <div>
                      <div className={rlcClass(null, projectCode)}>{p.code}</div>
                      <div className={rlcClass(null, projectName)}>{p.name}</div>
                      <div className={rlcClass(null, projectSub)}>
                        {p.client || "—"} {p.place ? `· ${p.place}` : ""}
                      </div>
                    </div>

                    <span className={rlcClass(null, openPill)}>Öffnen</span>
                  </button>
              )}
              </div>
            </section> :
          null}

          <section className={rlcClass(null, card)}>
            <div className={rlcClass(null, sectionHead)}>
              <div>
                <h2 className={rlcClass(null, sectionTitle)}>Alle Projekte</h2>
                <div className={rlcClass(null, sectionText)}>
                  Vollständige Projektliste mit Öffnen- und Löschen-Aktion.
                </div>
              </div>
            </div>

            <div className={rlcClass(null, tableWrap)}>
              <div className={rlcClass(null, tableHeader)}>
                <div>Projekt-Nr.</div>
                <div>Name</div>
                <div>Auftraggeber</div>
                <div>Ort / Aktionen</div>
              </div>

              <div className={rlcClass(null, scrollList)}>
                {!filteredProjects.length ?
                <div className={rlcClass(null, emptyCell)}>Keine Projekte gefunden.</div> :
                null}

                {filteredProjects.map((p, idx) => {
                  const isHovered = hoveredRowId === p.id;

                  return (
                    <div
                      key={p.id} className={rlcClass(null,
                      {
                        ...tableRow,
                        background: idx % 2 === 0 ? "#FFFFFF" : "#F8FAFC",
                        ...(isHovered ? tableRowHover : {})
                      })}
                      onMouseEnter={() => setHoveredRowId(p.id)}
                      onMouseLeave={() => setHoveredRowId(null)}>
                      
                      <div className={rlcClass(null, projectCode)}>{p.code}</div>

                      <div>
                        <b>{p.name}</b>
                        <div className={rlcClass(null, tiny)}>Erstellt: {fmtDate(p.createdAt)}</div>
                      </div>

                      <div>{p.client || "—"}</div>

                      <div className={rlcClass(null, rowActions)}>
                        <span>{p.place || "—"}</span>

                        <div className={rlcClass(null, buttonRow)}>
                          <button
                            type="button" className={rlcClass(null,
                            btnSecondarySmall)}
                            onClick={() => handleOpenProject(p)}>
                            
                            Öffnen
                          </button>

                          <button
                            type="button" className={rlcClass(null,
                            btnDangerSmall)}
                            onClick={(ev) => handleDeleteProject(p, ev)}
                            disabled={deletingId === p.id}>
                            
                            {deletingId === p.id ? "Lösche..." : "Löschen"}
                          </button>
                        </div>
                      </div>
                    </div>);

                })}
              </div>
            </div>
          </section>
        </div>

        <aside className={rlcClass(null, sideStack)}>
          <section id="create-project-card" className={rlcClass(null, card)}>
            <div className={rlcClass(null, sectionHead)}>
              <div>
                <h2 className={rlcClass(null, sectionTitle)}>Projekt erstellen</h2>
                <div className={rlcClass(null, sectionText)}>
                  Neues Projekt direkt mit Projektnummer, Name, Kunde und Ort anlegen.
                </div>
              </div>
            </div>

            <form onSubmit={handleCreateProject} className={rlcClass(null, formStack)}>
              <Field label="Projektnummer">
                <input
                  type="text"
                  name="code"
                  value={newForm.code}
                  onChange={handleNewChange} className={rlcClass(null,
                  input)} />
                
              </Field>

              <Field label="Projektname">
                <input
                  type="text"
                  name="name"
                  value={newForm.name}
                  onChange={handleNewChange} className={rlcClass(null,
                  input)} />
                
              </Field>

              <Field label="Kunde / Auftraggeber">
                <input
                  type="text"
                  name="client"
                  value={newForm.client}
                  onChange={handleNewChange} className={rlcClass(null,
                  input)} />
                
              </Field>

              <Field label="Ort">
                <input
                  type="text"
                  name="place"
                  value={newForm.place}
                  onChange={handleNewChange} className={rlcClass(null,
                  input)} />
                
              </Field>

              <button type="submit" className={rlcClass(null, btnPrimaryFull)} disabled={creating}>
                {creating ? "Wird angelegt..." : "Projekt anlegen"}
              </button>
            </form>
          </section>

          <section id="import-project-card" className={rlcClass(null, card)}>
            <div className={rlcClass(null, sectionHead)}>
              <div>
                <h2 className={rlcClass(null, sectionTitle)}>Projekt importieren</h2>
                <div className={rlcClass(null, sectionText)}>
                  project.json oder vollständiges Projekt-ZIP einlesen.
                </div>
              </div>
            </div>

            <div className={rlcClass(null, importBlock)}>
              <div>
                <div className={rlcClass(null, importTitle)}>project.json importieren</div>
                <div className={rlcClass(null, sectionText)}>
                  Exportierte Projektdatei wieder einlesen.
                </div>
              </div>

              <input
                type="file"
                accept=".json,application/json"
                onChange={handleJsonFileChange} className={rlcClass(null,
                fileInput)} />
              

              <button
                type="button" className={rlcClass(null,
                btnPrimary)}
                onClick={handleImportJson}
                disabled={!jsonFile}>
                
                Import JSON
              </button>
            </div>

            <div className={rlcClass(null, importBlock)}>
              <div>
                <div className={rlcClass(null, importTitle)}>Projekt-ZIP importieren</div>
                <div className={rlcClass(null, sectionText)}>
                  Komplettes Projektarchiv inklusive Dateien einlesen.
                </div>
              </div>

              <input
                type="file"
                accept=".zip,application/zip"
                onChange={handleZipFileChange} className={rlcClass(null,
                fileInput)} />
              

              <button
                type="button" className={rlcClass(null,
                btnPrimary)}
                onClick={handleImportZip}
                disabled={!zipFile}>
                
                Import ZIP
              </button>
            </div>
          </section>
        </aside>
      </section>
    </div>);

};

export default ProjectStartPage;

/* ========= UI ========= */

function Kpi({ label, value }: {label: string;value: string;}) {
  return (
    <div className={rlcClass(null, kpiCard)}>
      <div className={rlcClass(null, kpiLabel)}>{label}</div>
      <div className={rlcClass(null, kpiValue)}>{value}</div>
    </div>);

}

function Field({
  label,
  children



}: {label: string;children: React.ReactNode;}) {
  return (
    <label className={rlcClass(null, fieldWrap)}>
      <span className={rlcClass(null, labelStyle)}>{label}</span>
      {children}
    </label>);

}

function FieldLabel({ children }: {children: React.ReactNode;}) {
  return <div className={rlcClass(null, labelStyle)}>{children}</div>;
}

/* ========= Styles ========= */

const page: React.CSSProperties = {
  display: "grid",
  gap: 14,
  padding: "2px 0 16px"
};

const heroCard: React.CSSProperties = {
  background: "linear-gradient(125deg, #0B5BD3 0%, #146EF5 58%, #24B4FF 100%)",
  color: "#FFFFFF",
  borderRadius: 12,
  padding: "20px 22px",
  display: "grid",
  gap: 13,
  boxShadow: "0 8px 24px rgba(20,110,245,0.16)",
  overflow: "hidden"
};

const eyebrow: React.CSSProperties = {
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  opacity: 0.78,
  fontWeight: 700
};

const heroTitle: React.CSSProperties = {
  color: "#FFFFFF", margin: "4px 0",
  fontSize: 29,
  lineHeight: 1.1,
  fontWeight: 700
};

const heroText: React.CSSProperties = {
  margin: 0,
  maxWidth: 920,
  opacity: 0.88,
  lineHeight: 1.55,
  fontSize: 15
};

const heroActions: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap"
};

const heroMeta: React.CSSProperties = {
  fontSize: 13,
  opacity: 0.9
};

const errorBox: React.CSSProperties = {
  border: "1px solid #FCA5A5",
  background: "#FEF2F2",
  color: "#B91C1C",
  borderRadius: 14,
  padding: "12px 14px",
  fontSize: 13,
  fontWeight: 700
};

const kpiGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))",
  gap: 8
};

const kpiCard: React.CSSProperties = {
  background: "#FFFFFF",
  border: "0",
  borderBottom: "2px solid #BED6FF",
  borderRadius: 0,
  padding: "12px 10px",
  boxShadow: "none"
};

const kpiLabel: React.CSSProperties = {
  fontSize: 12,
  color: "#64748B",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em"
};

const kpiValue: React.CSSProperties = {
  marginTop: 6,
  fontSize: 21,
  color: "#0F172A",
  fontWeight: 700
};

const layoutGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0,1.45fr) 420px",
  gap: 14,
  alignItems: "start"
};

const mainStack: React.CSSProperties = {
  display: "grid",
  gap: 14,
  minWidth: 0
};

const sideStack: React.CSSProperties = {
  display: "grid",
  gap: 14,
  minWidth: 0
};

const card: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #DDE5F0",
  borderRadius: 10,
  padding: 16,
  boxShadow: "none"
};

const sectionHead: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
  marginBottom: 14
};

const sectionTitle: React.CSSProperties = {
  margin: 0,
  color: "#0F172A",
  fontSize: 18,
  fontWeight: 700
};

const sectionText: React.CSSProperties = {
  marginTop: 4,
  color: "#64748B",
  fontSize: 13,
  lineHeight: 1.45
};

const searchGrid: React.CSSProperties = {
  display: "grid",
  gap: 12
};

const fieldWrap: React.CSSProperties = {
  display: "grid",
  gap: 5
};

const labelStyle: React.CSSProperties = {
  marginBottom: 5,
  color: "#334155",
  fontSize: 12,
  fontWeight: 700
};

const input: React.CSSProperties = {
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

const searchInput: React.CSSProperties = {
  ...input,
  padding: "12px 13px",
  fontSize: 14
};

const quickSelectRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0,1fr) auto",
  gap: 8,
  alignItems: "center"
};

const recentGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
  gap: 10
};

const recentCard: React.CSSProperties = {
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

const projectCode: React.CSSProperties = {
  color: "#0F172A",
  fontWeight: 700
};

const projectName: React.CSSProperties = {
  marginTop: 2,
  color: "#0F172A",
  fontWeight: 700
};

const projectSub: React.CSSProperties = {
  marginTop: 3,
  color: "#64748B",
  fontSize: 12,
  fontWeight: 600
};

const openPill: React.CSSProperties = {
  border: "1px solid #BED6FF",
  background: "#EAF2FF",
  color: "#0B5BD3",
  borderRadius: 999,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 700,
  whiteSpace: "nowrap"
};

const tableWrap: React.CSSProperties = {
  overflow: "hidden",
  border: "1px solid #DDE5F0",
  borderRadius: 10
};

const tableHeader: React.CSSProperties = {
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

const scrollList: React.CSSProperties = {
  maxHeight: 470,
  overflowY: "auto"
};

const tableRow: React.CSSProperties = {
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

const tableRowHover: React.CSSProperties = {
  background: "#F5F8FF",
  boxShadow: "inset 3px 0 0 #146EF5"
};

const tiny: React.CSSProperties = {
  marginTop: 3,
  color: "#64748B",
  fontSize: 11,
  fontWeight: 600
};

const rowActions: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  flexWrap: "wrap"
};

const buttonRow: React.CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap"
};

const emptyCell: React.CSSProperties = {
  padding: 16,
  color: "#64748B",
  fontSize: 13,
  background: "#FFFFFF"
};

const formStack: React.CSSProperties = {
  display: "grid",
  gap: 12
};

const importBlock: React.CSSProperties = {
  borderTop: "1px solid #E5E7EB",
  paddingTop: 14,
  marginTop: 14,
  display: "grid",
  gap: 10
};

const importTitle: React.CSSProperties = {
  color: "#0F172A",
  fontWeight: 700,
  fontSize: 14
};

const fileInput: React.CSSProperties = {
  fontSize: 12,
  color: "#0F172A"
};

const btnBase: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  padding: "9px 13px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap"
};

const btnPrimary: React.CSSProperties = {
  ...btnBase,
  border: "1px solid #146EF5",
  background: "#146EF5",
  color: "#FFFFFF"
};

const btnPrimaryFull: React.CSSProperties = {
  ...btnPrimary,
  width: "100%",
  justifyContent: "center"
};

const btnSecondary: React.CSSProperties = {
  ...btnBase,
  background: "#FFFFFF",
  color: "#0F172A"
};

const btnPrimaryHero: React.CSSProperties = {
  ...btnBase,
  border: "1px solid #FFFFFF",
  background: "#FFFFFF",
  color: "#0B5BD3",
  padding: "11px 16px"
};

const btnSecondaryHero: React.CSSProperties = {
  ...btnBase,
  border: "1px solid rgba(255,255,255,0.55)",
  background: "rgba(255,255,255,0.90)",
  color: "#0F172A",
  padding: "11px 16px"
};

const btnSecondarySmall: React.CSSProperties = {
  ...btnSecondary,
  padding: "7px 10px",
  borderRadius: 9,
  fontSize: 12
};

const btnDangerSmall: React.CSSProperties = {
  ...btnSecondarySmall,
  border: "1px solid #FCA5A5",
  background: "#FEF2F2",
  color: "#B91C1C"
};
