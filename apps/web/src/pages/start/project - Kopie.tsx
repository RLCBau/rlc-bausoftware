// apps/web/src/pages/start/project.tsx
import React, {
  useEffect,
  useState,
  ChangeEvent,
  FormEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import { useProject } from "../../store/useProject";
import {
  fetchProjects,
  importProjectZip,
  createProject as apiCreateProject,
  deleteProject,
} from "../../api/projects";

/* ========= API-Base ========= */
const API =
  (import.meta as any)?.env?.VITE_API_URL || "http://localhost:4000";

/* ========= Tipi ========= */

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

/* ========= Stili (come prima) ========= */

const pageContainer: React.CSSProperties = {
  maxWidth: 1180,
  margin: "0 auto",
  padding: "1.5rem 1.75rem 2rem",
};

const sectionTitle: React.CSSProperties = {
  fontSize: "1.5rem",
  fontWeight: 600,
  marginBottom: "0.25rem",
  color: "#111827",
};

const sectionSubtitle: React.CSSProperties = {
  fontSize: "0.875rem",
  color: "#6B7280",
  marginBottom: "1.5rem",
};

const layoutGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2.3fr)",
  gap: "1.75rem",
};

const card: React.CSSProperties = {
  background: "#FFFFFF",
  borderRadius: 12,
  border: "1px solid #E5E7EB",
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
  padding: "1.5rem 1.75rem 1.75rem",
};

const cardTitleRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: "0.75rem",
};

const cardTitle: React.CSSProperties = {
  fontSize: "1rem",
  fontWeight: 600,
  color: "#111827",
};

const cardHint: React.CSSProperties = {
  fontSize: "0.8rem",
  color: "#9CA3AF",
};

const cardBody: React.CSSProperties = {
  fontSize: "0.875rem",
  color: "#111827",
};

const btnBase: React.CSSProperties = {
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

const btnPrimary: React.CSSProperties = {
  ...btnBase,
  background: "#2563EB",
  borderColor: "#1D4ED8",
  color: "#FFFFFF",
  fontWeight: 500,
};

const btnGhost: React.CSSProperties = {
  ...btnBase,
  background: "#FFFFFF",
};

const btnDangerOutline: React.CSSProperties = {
  ...btnBase,
  borderColor: "#FCA5A5",
  color: "#B91C1C",
  background: "#FEF2F2",
};

const tableWrapper: React.CSSProperties = {
  borderRadius: 10,
  border: "1px solid #E5E7EB",
  overflow: "hidden",
  background: "#F9FAFB",
};

const tableHeader: React.CSSProperties = {
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

const tableRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "0.9fr 1.8fr 1.3fr 1.7fr",
  gap: "0.5rem",
  padding: "0.5rem 0.9rem",
  fontSize: "0.85rem",
  alignItems: "center",
  borderTop: "1px solid #E5E7EB",
  cursor: "pointer",
};

const tableRowAlt: React.CSSProperties = {
  ...tableRow,
  background: "#F9FAFB",
};

const tableRowHover: React.CSSProperties = {
  boxShadow: "inset 0 0 0 1px #2563EB",
  background: "#EFF6FF",
};

const mutedText: React.CSSProperties = {
  fontSize: "0.8rem",
  color: "#9CA3AF",
  marginTop: "0.5rem",
};

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

  const [newForm, setNewForm] = useState<NewProjectForm>({
    code: "BA-2025-001",
    name: "Neues Projekt",
    client: "",
    place: "",
  });

  /** imposta il progetto selezionato ovunque (context + globale) */
  const setCurrentEverywhere = (p: ProjectItem) => {
    try {
      const g = globalThis as any;
      g.__RLC_CURRENT_PROJECT = p; // fallback globale
    } catch {
      // niente
    }

    try {
      projectCtx?.setCurrentProject?.(p);
      projectCtx?.setCurrentProjectId?.(p.id);
      projectCtx?.selectProject?.(p);
      projectCtx?.selectProjectById?.(p.id);
    } catch (e) {
      console.warn("Project context not set correctly:", e);
    }
  };

  const clearCurrentIfMatches = (id: string) => {
    try {
      const g = globalThis as any;
      if (g.__RLC_CURRENT_PROJECT && g.__RLC_CURRENT_PROJECT.id === id) {
        g.__RLC_CURRENT_PROJECT = null;
      }
    } catch {
      // ignore
    }
    try {
      if (projectCtx?.currentProject?.id === id) {
        projectCtx.setCurrentProject?.(null);
      }
      if (projectCtx?.currentProjectId === id) {
        projectCtx.setCurrentProjectId?.(null);
      }
    } catch {
      // ignore
    }
  };

  /* ------- Carica lista progetti ------- */

  const loadList = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchProjects();
      setProjects(data.projects ?? []);
      await projectCtx?.loadProjects?.();
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Fehler beim Laden der Projekte");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadList();
  }, []);

  /* ------- Handlers import ------- */

  const handleJsonFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setJsonFile(f);
  };

  const handleZipFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setZipFile(f);
  };

  const handleImportJson = async () => {
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

      const res = await fetch(`${API}/api/import/project-json`, {
        method: "POST",
        headers: { "Accept": "application/json" },
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
    } catch (err: any) {
      console.error("Import-Fehler:", err);
      setError(err?.message || "Fehler beim Import (project.json)");
      alert("Import fehlgeschlagen: " + (err?.message ?? String(err)));
    }
  };

  const handleImportZip = async () => {
    if (!zipFile) return;
    const fd = new FormData();
    fd.append("file", zipFile);
    try {
      setError(null);
      await importProjectZip(fd);
      setZipFile(null);
      await loadList();
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Fehler beim Import (ZIP)");
      alert("Fehler beim Import (ZIP): " + (e?.message ?? String(e)));
    }
  };

  /* ------- Handlers nuovo progetto ------- */

  const handleNewChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setNewForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreateProject = async (e: FormEvent) => {
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
      const created: ProjectItem | undefined = res?.project ?? res;

      await loadList();

      if (created?.id) {
        setCurrentEverywhere(created);
        navigate("/projekt/uebersicht");
      }
    } catch (e: any) {
      console.error(e);
      setCreateError(e?.message || "Fehler beim Erstellen des Projekts");
    } finally {
      setCreating(false);
    }
  };

  /* ------- Seleziona progetto esistente ------- */

  const handleOpenProject = (p: ProjectItem) => {
    setCurrentEverywhere(p);
    navigate("/projekt/uebersicht");
  };

  /* ------- Löschen ------- */

  const handleDeleteProject = async (p: ProjectItem, ev: React.MouseEvent) => {
    ev.stopPropagation(); // evita che il click selezioni il progetto
    if (!window.confirm(`Projekt "${p.code}" wirklich löschen?`)) return;
    try {
      setDeletingId(p.id);
      await deleteProject(p.id);
      clearCurrentIfMatches(p.id);
      await loadList();
    } catch (e: any) {
      console.error(e);
      alert(
        "Fehler beim Löschen des Projekts: " +
          (e?.message ?? String(e))
      );
    } finally {
      setDeletingId(null);
    }
  };

  /* ========= Render ========= */

  return (
    <div style={pageContainer}>
      <h1 style={sectionTitle}>Projekt auswählen</h1>
      <p style={sectionSubtitle}>
        Bestehendes Projekt öffnen oder ein neues Projekt anlegen / importieren.
      </p>

      {(error || createError) && (
        <div
          style={{
            marginBottom: "1rem",
            padding: "0.75rem 1rem",
            borderRadius: 8,
            border: "1px solid #FCA5A5",
            background: "#FEF2F2",
            color: "#B91C1C",
            fontSize: "0.85rem",
          }}
        >
          {error && <div>Fehler: {error}</div>}
          {createError && <div>{createError}</div>}
        </div>
      )}

      <div style={layoutGrid}>
        {/* --------- Colonna sinistra: lista + import --------- */}
        <section style={card}>
          <div style={cardTitleRow}>
            <div>
              <div style={cardTitle}>Projekt auswählen</div>
              <div style={cardHint}>
                Wählen Sie ein bestehendes Projekt oder importieren Sie eine
                Projektdatei.
              </div>
            </div>
            <button
              type="button"
              style={btnGhost}
              onClick={() => loadList()}
              disabled={loading}
            >
              Neu laden
            </button>
          </div>

          <div style={cardBody}>
            <div style={{ marginBottom: "0.9rem", fontWeight: 500 }}>
              Projekte
            </div>

            <div style={tableWrapper}>
              <div style={tableHeader}>
                <div>Projekt-Nr.</div>
                <div>Name</div>
                <div>Auftraggeber</div>
                <div>Ort / Aktionen</div>
              </div>
              {projects.length === 0 && (
                <div
                  style={{
                    padding: "0.75rem 0.9rem",
                    fontSize: "0.85rem",
                    color: "#9CA3AF",
                  }}
                >
                  Keine Projekte gefunden.
                </div>
              )}
              {projects.map((p, idx) => {
                const rowStyle = idx % 2 === 0 ? tableRow : tableRowAlt;
                return (
                  <div
                    key={p.id}
                    style={rowStyle}
                    onClick={() => handleOpenProject(p)}
                    onMouseEnter={(ev) => {
                      (ev.currentTarget as HTMLDivElement).style.boxShadow =
                        String(tableRowHover.boxShadow);
                      (ev.currentTarget as HTMLDivElement).style.background =
                        String(tableRowHover.background);
                    }}
                    onMouseLeave={(ev) => {
                      (ev.currentTarget as HTMLDivElement).style.boxShadow =
                        "none";
                      (ev.currentTarget as HTMLDivElement).style.background =
                        rowStyle.background ?? "transparent";
                    }}
                  >
                    <div>{p.code}</div>
                    <div>{p.name}</div>
                    <div>{p.client || "–"}</div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "0.5rem",
                      }}
                    >
                      <span>{p.place || "–"}</span>
                      <button
                        type="button"
                        style={btnDangerOutline}
                        onClick={(ev) => handleDeleteProject(p, ev)}
                        disabled={deletingId === p.id}
                      >
                        {deletingId === p.id
                          ? "Lösche…"
                          : "Projekt löschen"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <p style={mutedText}>
              Tipp: Projekt auswählen, um zur Projekt-Übersicht zu wechseln.
            </p>

            {/* Import-Blöcke */}
            <div
              style={{
                marginTop: "1.25rem",
                borderTop: "1px solid #E5E7EB",
                paddingTop: "1rem",
                display: "grid",
                gap: "0.85rem",
              }}
            >
              <div>
                <div style={{ fontWeight: 500, marginBottom: "0.25rem" }}>
                  project.json importieren
                </div>
                <div style={{ fontSize: "0.8rem", color: "#6B7280" }}>
                  Exportierte Projektdatei (project.json) wieder einlesen.
                </div>
                <div
                  style={{
                    marginTop: "0.5rem",
                    display: "flex",
                    gap: "0.5rem",
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={handleJsonFileChange}
                    style={{ fontSize: "0.8rem" }}
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
              </div>

              <div>
                <div style={{ fontWeight: 500, marginBottom: "0.25rem" }}>
                  Projekt-ZIP importieren
                </div>
                <div style={{ fontSize: "0.8rem", color: "#6B7280" }}>
                  Komplettes Projektarchiv (inkl. Dateien) als ZIP einlesen.
                </div>
                <div
                  style={{
                    marginTop: "0.5rem",
                    display: "flex",
                    gap: "0.5rem",
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <input
                    type="file"
                    accept=".zip,application/zip"
                    onChange={handleZipFileChange}
                    style={{ fontSize: "0.8rem" }}
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
              </div>
            </div>
          </div>
        </section>

        {/* --------- Colonna destra: nuovo progetto --------- */}
        <section style={card}>
          <div style={cardTitleRow}>
            <div>
              <div style={cardTitle}>Projekt erstellen</div>
              <div style={cardHint}>
                Legen Sie ein neues Projekt mit Nummer, Namen und Ort an.
              </div>
            </div>
          </div>

          <form onSubmit={handleCreateProject} style={cardBody}>
            <div style={{ display: "grid", gap: "0.6rem" }}>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8rem",
                    fontWeight: 500,
                    marginBottom: "0.15rem",
                  }}
                >
                  Projektnummer
                </label>
                <input
                  type="text"
                  name="code"
                  value={newForm.code}
                  onChange={handleNewChange}
                  style={{
                    width: "100%",
                    fontSize: "0.85rem",
                    borderRadius: 8,
                    border: "1px solid #D1D5DB",
                    padding: "0.45rem 0.6rem",
                  }}
                />
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8rem",
                    fontWeight: 500,
                    marginBottom: "0.15rem",
                  }}
                >
                  Projektname
                </label>
                <input
                  type="text"
                  name="name"
                  value={newForm.name}
                  onChange={handleNewChange}
                  style={{
                    width: "100%",
                    fontSize: "0.85rem",
                    borderRadius: 8,
                    border: "1px solid #D1D5DB",
                    padding: "0.45rem 0.6rem",
                  }}
                />
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8rem",
                    fontWeight: 500,
                    marginBottom: "0.15rem",
                  }}
                >
                  Kunde / Auftraggeber
                </label>
                <input
                  type="text"
                  name="client"
                  value={newForm.client}
                  onChange={handleNewChange}
                  style={{
                    width: "100%",
                    fontSize: "0.85rem",
                    borderRadius: 8,
                    border: "1px solid #D1D5DB",
                    padding: "0.45rem 0.6rem",
                  }}
                />
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8rem",
                    fontWeight: 500,
                    marginBottom: "0.15rem",
                  }}
                >
                  Ort
                </label>
                <input
                  type="text"
                  name="place"
                  value={newForm.place}
                  onChange={handleNewChange}
                  style={{
                    width: "100%",
                    fontSize: "0.85rem",
                    borderRadius: 8,
                    border: "1px solid #D1D5DB",
                    padding: "0.45rem 0.6rem",
                  }}
                />
              </div>
            </div>

            <div
              style={{
                marginTop: "1rem",
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <button type="submit" style={btnPrimary} disabled={creating}>
                {creating ? "Wird angelegt..." : "Projekt anlegen"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
};

export default ProjectStartPage;
