// apps/web/src/pages/start/project.tsx
import React, {
  ChangeEvent,
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../../lib/apiBase";
import { useProject } from "../../store/useProject";
import {
  createProject as apiCreateProject,
  deleteProject,
  fetchProjects,
  importProjectZip,
} from "../../api/projects";

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
    typeof v.name === "string"
  );
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
    year: "numeric",
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
    place: "",
  });

  function saveRecent(projectId: string) {
    try {
      const next = [projectId, ...recentIds.filter((x) => x !== projectId)].slice(0, 6);
      setRecentIds(next);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      //
    }
  }

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
    }
  }

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
        code: computeNextProjectCode(list),
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
        normalizeText(p.place).includes(q)
      );
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
      withPlace,
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
        type: "application/json",
      });

      fd.append("file", blob, "project.json");

      const res = await fetch(apiUrl("/api/import/project-json"), {
        method: "POST",
        headers: { Accept: "application/json" },
        body: fd,
        credentials: "include",
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
        place: newForm.place.trim(),
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
    ev: React.MouseEvent<HTMLButtonElement>
  ) {
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
    <div style={page}>
      <section style={heroCard}>
        <div>
          <div style={eyebrow}>RLC Projektzentrale</div>
          <h1 style={heroTitle}>Projekt auswählen</h1>
          <p style={heroText}>
            Bestehendes Projekt öffnen, neues Projekt anlegen oder Projektdateien
            sauber importieren.
          </p>
        </div>

        <div style={heroActions}>
          <button type="button" style={btnPrimaryHero} onClick={() => void loadList()}>
            {loading ? "Lädt..." : "Projekte neu laden"}
          </button>

          <button
            type="button"
            style={btnSecondaryHero}
            onClick={() => {
              const target = document.getElementById("create-project-card");
              target?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            Neues Projekt
          </button>

          <button
            type="button"
            style={btnSecondaryHero}
            onClick={() => {
              const target = document.getElementById("import-project-card");
              target?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            Import
          </button>
        </div>

        <div style={heroMeta}>
          Projekte: <b>{stats.total}</b> · Sichtbar: <b>{stats.visible}</b> · Zuletzt
          geöffnet: <b>{stats.recent}</b>
        </div>
      </section>

      {(error || createError) ? (
        <div style={errorBox}>
          {error ? <div>Fehler: {error}</div> : null}
          {createError ? <div>{createError}</div> : null}
        </div>
      ) : null}

      <section style={kpiGrid}>
        <Kpi label="Projekte" value={String(stats.total)} />
        <Kpi label="Suchtreffer" value={String(stats.visible)} />
        <Kpi label="Zuletzt geöffnet" value={String(stats.recent)} />
        <Kpi label="Mit Auftraggeber" value={String(stats.withClient)} />
        <Kpi label="Mit Ort" value={String(stats.withPlace)} />
      </section>

      <section style={layoutGrid}>
        <div style={mainStack}>
          <section style={card}>
            <div style={sectionHead}>
              <div>
                <h2 style={sectionTitle}>Projekt suchen & öffnen</h2>
                <div style={sectionText}>
                  Schnell suchen, zuletzt verwendete Projekte öffnen oder aus der Liste wählen.
                </div>
              </div>

              <button
                type="button"
                style={btnSecondary}
                onClick={() => void loadList()}
                disabled={loading}
              >
                {loading ? "Lädt..." : "Neu laden"}
              </button>
            </div>

            <div style={searchGrid}>
              <div>
                <FieldLabel>Projekt suchen</FieldLabel>
                <input
                  type="text"
                  placeholder="Nach Projektnummer, Name, Kunde oder Ort suchen..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={searchInput}
                />
              </div>

              <div>
                <FieldLabel>Schnellwahl</FieldLabel>
                <div style={quickSelectRow}>
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    style={input}
                  >
                    <option value="">Projekt auswählen...</option>
                    {filteredProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} — {p.name}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    style={btnPrimary}
                    disabled={!selectedProject}
                    onClick={() => selectedProject && handleOpenProject(selectedProject)}
                  >
                    Öffnen
                  </button>
                </div>
              </div>
            </div>
          </section>

          {recentProjects.length > 0 ? (
            <section style={card}>
              <div style={sectionHead}>
                <div>
                  <h2 style={sectionTitle}>Zuletzt geöffnet</h2>
                  <div style={sectionText}>Direkter Zugriff auf die letzten Projekte.</div>
                </div>
              </div>

              <div style={recentGrid}>
                {recentProjects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    style={recentCard}
                    onClick={() => handleOpenProject(p)}
                  >
                    <div>
                      <div style={projectCode}>{p.code}</div>
                      <div style={projectName}>{p.name}</div>
                      <div style={projectSub}>
                        {p.client || "—"} {p.place ? `· ${p.place}` : ""}
                      </div>
                    </div>

                    <span style={openPill}>Öffnen</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section style={card}>
            <div style={sectionHead}>
              <div>
                <h2 style={sectionTitle}>Alle Projekte</h2>
                <div style={sectionText}>
                  Vollständige Projektliste mit Öffnen- und Löschen-Aktion.
                </div>
              </div>
            </div>

            <div style={tableWrap}>
              <div style={tableHeader}>
                <div>Projekt-Nr.</div>
                <div>Name</div>
                <div>Auftraggeber</div>
                <div>Ort / Aktionen</div>
              </div>

              <div style={scrollList}>
                {!filteredProjects.length ? (
                  <div style={emptyCell}>Keine Projekte gefunden.</div>
                ) : null}

                {filteredProjects.map((p, idx) => {
                  const isHovered = hoveredRowId === p.id;

                  return (
                    <div
                      key={p.id}
                      style={{
                        ...tableRow,
                        background: idx % 2 === 0 ? "#FFFFFF" : "#F8FAFC",
                        ...(isHovered ? tableRowHover : {}),
                      }}
                      onMouseEnter={() => setHoveredRowId(p.id)}
                      onMouseLeave={() => setHoveredRowId(null)}
                    >
                      <div style={projectCode}>{p.code}</div>

                      <div>
                        <b>{p.name}</b>
                        <div style={tiny}>Erstellt: {fmtDate(p.createdAt)}</div>
                      </div>

                      <div>{p.client || "—"}</div>

                      <div style={rowActions}>
                        <span>{p.place || "—"}</span>

                        <div style={buttonRow}>
                          <button
                            type="button"
                            style={btnSecondarySmall}
                            onClick={() => handleOpenProject(p)}
                          >
                            Öffnen
                          </button>

                          <button
                            type="button"
                            style={btnDangerSmall}
                            onClick={(ev) => handleDeleteProject(p, ev)}
                            disabled={deletingId === p.id}
                          >
                            {deletingId === p.id ? "Lösche..." : "Löschen"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </div>

        <aside style={sideStack}>
          <section id="create-project-card" style={card}>
            <div style={sectionHead}>
              <div>
                <h2 style={sectionTitle}>Projekt erstellen</h2>
                <div style={sectionText}>
                  Neues Projekt direkt mit Projektnummer, Name, Kunde und Ort anlegen.
                </div>
              </div>
            </div>

            <form onSubmit={handleCreateProject} style={formStack}>
              <Field label="Projektnummer">
                <input
                  type="text"
                  name="code"
                  value={newForm.code}
                  onChange={handleNewChange}
                  style={input}
                />
              </Field>

              <Field label="Projektname">
                <input
                  type="text"
                  name="name"
                  value={newForm.name}
                  onChange={handleNewChange}
                  style={input}
                />
              </Field>

              <Field label="Kunde / Auftraggeber">
                <input
                  type="text"
                  name="client"
                  value={newForm.client}
                  onChange={handleNewChange}
                  style={input}
                />
              </Field>

              <Field label="Ort">
                <input
                  type="text"
                  name="place"
                  value={newForm.place}
                  onChange={handleNewChange}
                  style={input}
                />
              </Field>

              <button type="submit" style={btnPrimaryFull} disabled={creating}>
                {creating ? "Wird angelegt..." : "Projekt anlegen"}
              </button>
            </form>
          </section>

          <section id="import-project-card" style={card}>
            <div style={sectionHead}>
              <div>
                <h2 style={sectionTitle}>Projekt importieren</h2>
                <div style={sectionText}>
                  project.json oder vollständiges Projekt-ZIP einlesen.
                </div>
              </div>
            </div>

            <div style={importBlock}>
              <div>
                <div style={importTitle}>project.json importieren</div>
                <div style={sectionText}>
                  Exportierte Projektdatei wieder einlesen.
                </div>
              </div>

              <input
                type="file"
                accept=".json,application/json"
                onChange={handleJsonFileChange}
                style={fileInput}
              />

              <button
                type="button"
                style={btnPrimary}
                onClick={handleImportJson}
                disabled={!jsonFile}
              >
                Import JSON
              </button>
            </div>

            <div style={importBlock}>
              <div>
                <div style={importTitle}>Projekt-ZIP importieren</div>
                <div style={sectionText}>
                  Komplettes Projektarchiv inklusive Dateien einlesen.
                </div>
              </div>

              <input
                type="file"
                accept=".zip,application/zip"
                onChange={handleZipFileChange}
                style={fileInput}
              />

              <button
                type="button"
                style={btnPrimary}
                onClick={handleImportZip}
                disabled={!zipFile}
              >
                Import ZIP
              </button>
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
};

export default ProjectStartPage;

/* ========= UI ========= */

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div style={kpiCard}>
      <div style={kpiLabel}>{label}</div>
      <div style={kpiValue}>{value}</div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={fieldWrap}>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div style={labelStyle}>{children}</div>;
}

/* ========= Styles ========= */

const page: React.CSSProperties = {
  display: "grid",
  gap: 16,
  padding: 16,
};

const heroCard: React.CSSProperties = {
  background: "linear-gradient(135deg,#0F172A,#1E3A8A)",
  color: "#FFFFFF",
  borderRadius: 18,
  padding: 26,
  display: "grid",
  gap: 16,
  boxShadow: "0 16px 40px rgba(15,23,42,0.18)",
  overflow: "hidden",
};

const eyebrow: React.CSSProperties = {
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  opacity: 0.78,
  fontWeight: 900,
};

const heroTitle: React.CSSProperties = {
  margin: "4px 0",
  fontSize: 34,
  lineHeight: 1.1,
  fontWeight: 950,
};

const heroText: React.CSSProperties = {
  margin: 0,
  maxWidth: 920,
  opacity: 0.88,
  lineHeight: 1.55,
  fontSize: 15,
};

const heroActions: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const heroMeta: React.CSSProperties = {
  fontSize: 13,
  opacity: 0.9,
};

const errorBox: React.CSSProperties = {
  border: "1px solid #FCA5A5",
  background: "#FEF2F2",
  color: "#B91C1C",
  borderRadius: 14,
  padding: "12px 14px",
  fontSize: 13,
  fontWeight: 800,
};

const kpiGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))",
  gap: 12,
};

const kpiCard: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
};

const kpiLabel: React.CSSProperties = {
  fontSize: 12,
  color: "#64748B",
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const kpiValue: React.CSSProperties = {
  marginTop: 6,
  fontSize: 24,
  color: "#0F172A",
  fontWeight: 950,
};

const layoutGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0,1.45fr) 420px",
  gap: 16,
  alignItems: "start",
};

const mainStack: React.CSSProperties = {
  display: "grid",
  gap: 16,
  minWidth: 0,
};

const sideStack: React.CSSProperties = {
  display: "grid",
  gap: 16,
  minWidth: 0,
};

const card: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 16,
  padding: 18,
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
};

const sectionHead: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
  marginBottom: 14,
};

const sectionTitle: React.CSSProperties = {
  margin: 0,
  color: "#0F172A",
  fontSize: 18,
  fontWeight: 950,
};

const sectionText: React.CSSProperties = {
  marginTop: 4,
  color: "#64748B",
  fontSize: 13,
  lineHeight: 1.45,
};

const searchGrid: React.CSSProperties = {
  display: "grid",
  gap: 12,
};

const fieldWrap: React.CSSProperties = {
  display: "grid",
  gap: 5,
};

const labelStyle: React.CSSProperties = {
  marginBottom: 5,
  color: "#334155",
  fontSize: 12,
  fontWeight: 900,
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
  outline: "none",
};

const searchInput: React.CSSProperties = {
  ...input,
  padding: "12px 13px",
  fontSize: 14,
};

const quickSelectRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0,1fr) auto",
  gap: 8,
  alignItems: "center",
};

const recentGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
  gap: 10,
};

const recentCard: React.CSSProperties = {
  border: "1px solid #E5E7EB",
  background: "#F8FAFC",
  borderRadius: 14,
  padding: 13,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  textAlign: "left",
  color: "#0F172A",
  cursor: "pointer",
};

const projectCode: React.CSSProperties = {
  color: "#0F172A",
  fontWeight: 950,
};

const projectName: React.CSSProperties = {
  marginTop: 2,
  color: "#0F172A",
  fontWeight: 800,
};

const projectSub: React.CSSProperties = {
  marginTop: 3,
  color: "#64748B",
  fontSize: 12,
  fontWeight: 600,
};

const openPill: React.CSSProperties = {
  border: "1px solid #BFDBFE",
  background: "#EFF6FF",
  color: "#1D4ED8",
  borderRadius: 999,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const tableWrap: React.CSSProperties = {
  overflow: "hidden",
  border: "1px solid #E5E7EB",
  borderRadius: 14,
};

const tableHeader: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1.6fr 1.2fr 1.8fr",
  gap: 10,
  padding: "11px 12px",
  background: "#F8FAFC",
  color: "#64748B",
  fontSize: 12,
  fontWeight: 950,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const scrollList: React.CSSProperties = {
  maxHeight: 470,
  overflowY: "auto",
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
  transition: "all 120ms ease",
};

const tableRowHover: React.CSSProperties = {
  background: "#EFF6FF",
  boxShadow: "inset 0 0 0 1px #BFDBFE",
};

const tiny: React.CSSProperties = {
  marginTop: 3,
  color: "#64748B",
  fontSize: 11,
  fontWeight: 600,
};

const rowActions: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  flexWrap: "wrap",
};

const buttonRow: React.CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
};

const emptyCell: React.CSSProperties = {
  padding: 16,
  color: "#64748B",
  fontSize: 13,
  background: "#FFFFFF",
};

const formStack: React.CSSProperties = {
  display: "grid",
  gap: 12,
};

const importBlock: React.CSSProperties = {
  borderTop: "1px solid #E5E7EB",
  paddingTop: 14,
  marginTop: 14,
  display: "grid",
  gap: 10,
};

const importTitle: React.CSSProperties = {
  color: "#0F172A",
  fontWeight: 950,
  fontSize: 14,
};

const fileInput: React.CSSProperties = {
  fontSize: 12,
  color: "#0F172A",
};

const btnBase: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: 11,
  padding: "10px 14px",
  fontSize: 13,
  fontWeight: 900,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const btnPrimary: React.CSSProperties = {
  ...btnBase,
  border: "1px solid #2563EB",
  background: "#2563EB",
  color: "#FFFFFF",
};

const btnPrimaryFull: React.CSSProperties = {
  ...btnPrimary,
  width: "100%",
  justifyContent: "center",
};

const btnSecondary: React.CSSProperties = {
  ...btnBase,
  background: "#FFFFFF",
  color: "#0F172A",
};

const btnPrimaryHero: React.CSSProperties = {
  ...btnBase,
  border: "1px solid #2563EB",
  background: "#2563EB",
  color: "#FFFFFF",
  padding: "11px 16px",
};

const btnSecondaryHero: React.CSSProperties = {
  ...btnBase,
  border: "1px solid rgba(255,255,255,0.55)",
  background: "rgba(255,255,255,0.90)",
  color: "#0F172A",
  padding: "11px 16px",
};

const btnSecondarySmall: React.CSSProperties = {
  ...btnSecondary,
  padding: "7px 10px",
  borderRadius: 9,
  fontSize: 12,
};

const btnDangerSmall: React.CSSProperties = {
  ...btnSecondarySmall,
  border: "1px solid #FCA5A5",
  background: "#FEF2F2",
  color: "#B91C1C",
};