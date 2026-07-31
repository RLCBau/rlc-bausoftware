import React from "react";
import {
  Building2,
  Copy,
  Download,
  Edit3,
  FileSpreadsheet,
  FileText,
  Files,
  Save,
  Search,
  ShieldCheck,
  Star,
} from "lucide-react";
import { useProject } from "../../store/useProject";
import {
  compileVorlage,
  copyVorlage,
  exportVorlage,
  fetchVorlageCategories,
  fetchVorlagen,
  saveVorlageDocument,
  toggleVorlageFavorite,
  updateVorlage,
  type VorlageCategory,
  type VorlageTemplate,
} from "../../api/vorlagen";
import "./vorlagen-center.css";

type ExportFormat = "pdf" | "docx" | "xlsx";

function DocumentPreview({ content }: { content: string }) {
  return (
    <div className="vc-paper">
      {content.replace(/\r\n/g, "\n").split("\n").map((line, index) => {
        if (line.startsWith("# ")) {
          return <h2 key={index}>{line.slice(2)}</h2>;
        }
        if (line.startsWith("## ")) {
          return <h3 key={index}>{line.slice(3)}</h3>;
        }
        if (!line.trim()) return <div className="vc-paper-gap" key={index} />;
        if (line.startsWith("☐")) {
          return <div className="vc-checkline" key={index}>□ {line.slice(1).trim()}</div>;
        }
        return <p key={index}>{line}</p>;
      })}
    </div>
  );
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : "Unbekannter Fehler";
}

export default function VorlagenCenter() {
  const { currentProject } = useProject();
  const [categories, setCategories] = React.useState<VorlageCategory[]>([]);
  const [totalStandard, setTotalStandard] = React.useState(0);
  const [templates, setTemplates] = React.useState<VorlageTemplate[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [favoritesOnly, setFavoritesOnly] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [pages, setPages] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [actionBusy, setActionBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [workingTitle, setWorkingTitle] = React.useState("");
  const [workingContent, setWorkingContent] = React.useState("");
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [mode, setMode] = React.useState<"preview" | "document" | "template">("preview");

  const selected = React.useMemo(
    () => templates.find((template) => template.id === selectedId) ?? null,
    [templates, selectedId]
  );

  const loadCategories = React.useCallback(async () => {
    const response = await fetchVorlageCategories();
    setCategories(response.categories);
    setTotalStandard(response.totalStandard);
  }, []);

  const loadTemplates = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchVorlagen({
        search,
        category,
        favorites: favoritesOnly,
        page,
        pageSize: 48,
      });
      setTemplates(response.templates);
      setTotal(response.total);
      setPages(response.pages);
      setSelectedId((current) =>
        current && response.templates.some((template) => template.id === current)
          ? current
          : response.templates[0]?.id ?? null
      );
    } catch (loadError) {
      setError(messageFromError(loadError));
      setTemplates([]);
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  }, [category, favoritesOnly, page, search]);

  React.useEffect(() => {
    const timeout = window.setTimeout(() => {
      setPage(1);
      setSearch(searchInput.trim());
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  React.useEffect(() => {
    void Promise.all([loadCategories(), loadTemplates()]).catch((loadError) => {
      setError(messageFromError(loadError));
      setLoading(false);
    });
  }, [loadCategories, loadTemplates]);

  React.useEffect(() => {
    if (!selected) {
      setWorkingTitle("");
      setWorkingContent("");
      setValues({});
      setMode("preview");
      return;
    }
    setWorkingTitle(selected.title);
    setWorkingContent(selected.content);
    setValues({});
    setMode("preview");
    setNotice(null);
  }, [selected]);

  const selectCategory = React.useCallback((key: string) => {
    setCategory(key);
    setPage(1);
  }, []);

  const handleFavorite = React.useCallback(async () => {
    if (!selected) return;
    setActionBusy(true);
    try {
      const response = await toggleVorlageFavorite(selected.id);
      setTemplates((current) =>
        favoritesOnly && !response.favorite
          ? current.filter((template) => template.id !== selected.id)
          : current.map((template) =>
              template.id === selected.id
                ? { ...template, favorite: response.favorite }
                : template
            )
      );
      setNotice(response.favorite ? "Zu Favoriten hinzugefügt." : "Aus Favoriten entfernt.");
    } catch (favoriteError) {
      setError(messageFromError(favoriteError));
    } finally {
      setActionBusy(false);
    }
  }, [favoritesOnly, selected]);

  const handleCopy = React.useCallback(async () => {
    if (!selected) return;
    setActionBusy(true);
    setError(null);
    try {
      const response = await copyVorlage(selected.id);
      const copied = { ...response.template, favorite: false };
      setTemplates((current) => [copied, ...current.filter((item) => item.id !== copied.id)]);
      setSelectedId(copied.id);
      setWorkingTitle(copied.title);
      setWorkingContent(copied.content);
      setMode("template");
      setNotice("Firmenkopie erstellt. Sie kann jetzt bearbeitet werden.");
      await loadCategories();
    } catch (copyError) {
      setError(messageFromError(copyError));
    } finally {
      setActionBusy(false);
    }
  }, [loadCategories, selected]);

  const handleUse = React.useCallback(async () => {
    if (!selected) return;
    setActionBusy(true);
    setError(null);
    try {
      const response = await compileVorlage(selected.id, currentProject?.id, values);
      setWorkingTitle(response.title);
      setWorkingContent(response.compiledContent);
      setValues(response.values);
      setMode("document");
      setNotice(
        currentProject
          ? `Projektdaten aus ${currentProject.code} wurden eingesetzt.`
          : "Dokument geöffnet. Fehlende Felder können rechts ergänzt werden."
      );
    } catch (compileError) {
      setError(messageFromError(compileError));
    } finally {
      setActionBusy(false);
    }
  }, [currentProject, selected, values]);

  const handleSave = React.useCallback(async () => {
    if (!selected) return;
    setActionBusy(true);
    setError(null);
    try {
      if (mode === "template") {
        const response = await updateVorlage(selected.id, {
          title: workingTitle,
          content: workingContent,
        });
        setTemplates((current) =>
          current.map((item) =>
            item.id === selected.id
              ? { ...response.template, favorite: item.favorite }
              : item
          )
        );
        setNotice("Firmenvorlage gespeichert.");
      } else {
        await saveVorlageDocument({
          templateId: selected.id,
          projectId: currentProject?.id,
          title: workingTitle,
          content: workingContent,
          values,
        });
        setNotice("Dokument im Vorlagen-Center gespeichert.");
      }
    } catch (saveError) {
      setError(messageFromError(saveError));
    } finally {
      setActionBusy(false);
    }
  }, [currentProject, mode, selected, values, workingContent, workingTitle]);

  const handleExport = React.useCallback(
    async (format: ExportFormat) => {
      if (!selected) return;
      setActionBusy(true);
      setError(null);
      try {
        await exportVorlage(selected.id, {
          format,
          projectId: currentProject?.id,
          title: workingTitle || selected.title,
          content: workingContent || selected.content,
          values,
        });
        setNotice(`${format.toUpperCase()} wurde erstellt und heruntergeladen.`);
      } catch (exportError) {
        setError(messageFromError(exportError));
      } finally {
        setActionBusy(false);
      }
    },
    [currentProject, selected, values, workingContent, workingTitle]
  );

  const updateValue = React.useCallback((key: string, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
  }, []);

  return (
    <div className="vc-page">
      <header className="vc-header rlc-page-hero rlc-page-hero--split">
        <div>
          <div className="vc-eyebrow rlc-page-hero__eyebrow">Büro & Verwaltung</div>
          <h1>Vorlagen-Center</h1>
          <p>
            {totalStandard || 342} geschützte RLC Standardvorlagen, Firmenkopien
            und projektbezogene Dokumente.
          </p>
        </div>
        <div className="vc-header-stats">
          <div><strong>{totalStandard || 342}</strong><span>RLC Vorlagen</span></div>
          <div><strong>{categories.length || 19}</strong><span>Kategorien</span></div>
          <div><strong>{total}</strong><span>Treffer</span></div>
        </div>
      </header>

      <div className="vc-toolbar">
        <label className="vc-search">
          <Search size={17} />
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Vorlagen durchsuchen…"
          />
        </label>
        <button
          className={favoritesOnly ? "vc-btn vc-btn-active" : "vc-btn"}
          onClick={() => {
            setFavoritesOnly((current) => !current);
            setPage(1);
          }}
        >
          <Star size={16} fill={favoritesOnly ? "currentColor" : "none"} />
          Favoriten
        </button>
        <div className="vc-project-chip">
          <Building2 size={16} />
          {currentProject
            ? `${currentProject.code} · ${currentProject.name}`
            : "Kein Projekt gewählt"}
        </div>
      </div>

      {error ? <div className="vc-alert vc-alert-error">{error}</div> : null}
      {notice ? <div className="vc-alert vc-alert-success">{notice}</div> : null}

      <div className="vc-workspace">
        <aside className="vc-categories">
          <button
            className={!category ? "vc-category active" : "vc-category"}
            onClick={() => selectCategory("")}
          >
            <span>Alle Vorlagen</span>
            <b>{categories.reduce((sum, item) => sum + item.count, 0)}</b>
          </button>
          {categories.map((item) => (
            <button
              key={item.key}
              className={category === item.key ? "vc-category active" : "vc-category"}
              onClick={() => selectCategory(item.key)}
              title={item.description}
            >
              <span>{item.label}</span>
              <b>{item.count}</b>
            </button>
          ))}
        </aside>

        <section className="vc-results">
          <div className="vc-section-head">
            <div>
              <strong>{category ? categories.find((item) => item.key === category)?.label : "Alle Vorlagen"}</strong>
              <span>{total} Ergebnisse</span>
            </div>
            <span>Seite {page} / {pages}</span>
          </div>

          <div className="vc-template-list">
            {loading ? <div className="vc-empty">RLC lädt Vorlagen…</div> : null}
            {!loading && !templates.length ? (
              <div className="vc-empty">Keine passende Vorlage gefunden.</div>
            ) : null}
            {!loading && templates.map((template) => (
              <button
                key={template.id}
                className={selectedId === template.id ? "vc-template active" : "vc-template"}
                onClick={() => setSelectedId(template.id)}
              >
                <div className="vc-template-icon"><FileText size={18} /></div>
                <div className="vc-template-copy">
                  <strong>{template.title}</strong>
                  <span>{template.categoryLabel}</span>
                  <small>{template.description}</small>
                </div>
                <div className="vc-template-badges">
                  {template.favorite ? <Star size={15} fill="currentColor" /> : null}
                  {template.isStandard ? <ShieldCheck size={16} /> : <Building2 size={16} />}
                </div>
              </button>
            ))}
          </div>

          <div className="vc-pagination">
            <button className="vc-btn" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
              Zurück
            </button>
            <button className="vc-btn" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>
              Weiter
            </button>
          </div>
        </section>

        <section className="vc-detail">
          {!selected ? (
            <div className="vc-empty vc-detail-empty">
              <Files size={36} />
              <strong>Vorlage auswählen</strong>
              <span>Details, Vorschau und Export erscheinen hier.</span>
            </div>
          ) : (
            <>
              <div className="vc-detail-head">
                <div>
                  <div className="vc-badge-row">
                    <span className="vc-badge">{selected.categoryLabel}</span>
                    {selected.isStandard ? (
                      <span className="vc-badge protected"><ShieldCheck size={13} /> RLC Standard · geschützt</span>
                    ) : (
                      <span className="vc-badge company"><Building2 size={13} /> Firmenvorlage · Version {selected.version}</span>
                    )}
                  </div>
                  {mode === "template" || mode === "document" ? (
                    <input
                      className="vc-title-input"
                      value={workingTitle}
                      onChange={(event) => setWorkingTitle(event.target.value)}
                    />
                  ) : (
                    <h2>{selected.title}</h2>
                  )}
                  <p>{selected.description}</p>
                </div>
                <button className="vc-icon-btn" title="Favorit" onClick={() => void handleFavorite()} disabled={actionBusy}>
                  <Star size={18} fill={selected.favorite ? "currentColor" : "none"} />
                </button>
              </div>

              <div className="vc-actions">
                <button className="vc-btn vc-btn-primary" onClick={() => void handleUse()} disabled={actionBusy}>
                  <Edit3 size={16} /> Vorlage verwenden
                </button>
                <button className="vc-btn" onClick={() => void handleCopy()} disabled={actionBusy}>
                  <Copy size={16} /> Firmenkopie
                </button>
                {!selected.isStandard && mode !== "template" ? (
                  <button className="vc-btn" onClick={() => setMode("template")} disabled={actionBusy}>
                    <Edit3 size={16} /> Bearbeiten
                  </button>
                ) : null}
                {mode !== "preview" ? (
                  <button className="vc-btn" onClick={() => void handleSave()} disabled={actionBusy}>
                    <Save size={16} /> Speichern
                  </button>
                ) : null}
              </div>

              {mode === "document" ? (
                <div className="vc-fields">
                  <div className="vc-fields-title">Automatische Felder</div>
                  <div className="vc-fields-grid">
                    {selected.variables.map((variable) => (
                      <label key={variable}>
                        <span>{variable}</span>
                        <input
                          value={values[variable] ?? ""}
                          onChange={(event) => updateValue(variable, event.target.value)}
                          placeholder={`{{${variable}}}`}
                        />
                      </label>
                    ))}
                  </div>
                  <button
                    className="vc-btn"
                    onClick={() => void handleUse()}
                    disabled={actionBusy}
                  >
                    Felder erneut einsetzen
                  </button>
                </div>
              ) : null}

              <div className="vc-editor-head">
                <strong>{mode === "preview" ? "Vorschau" : mode === "template" ? "Firmenvorlage bearbeiten" : "Dokument bearbeiten"}</strong>
                <span>{workingContent.length.toLocaleString("de-DE")} Zeichen</span>
              </div>

              {mode === "preview" ? (
                <DocumentPreview content={workingContent} />
              ) : (
                <textarea
                  className="vc-editor"
                  value={workingContent}
                  onChange={(event) => setWorkingContent(event.target.value)}
                  spellCheck
                />
              )}

              <div className="vc-export">
                <div>
                  <strong>Export</strong>
                  <span>Mit Firmenkopf und Projektdaten</span>
                </div>
                <button className="vc-btn" onClick={() => void handleExport("pdf")} disabled={actionBusy}>
                  <Download size={16} /> PDF
                </button>
                <button className="vc-btn" onClick={() => void handleExport("docx")} disabled={actionBusy}>
                  <FileText size={16} /> DOCX
                </button>
                <button className="vc-btn" onClick={() => void handleExport("xlsx")} disabled={actionBusy}>
                  <FileSpreadsheet size={16} /> XLSX
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
