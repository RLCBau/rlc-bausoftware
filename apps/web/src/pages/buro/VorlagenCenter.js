import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React from "react";
import { Building2, Copy, Download, Edit3, FileSpreadsheet, FileText, Files, Save, Search, ShieldCheck, Star, } from "lucide-react";
import { useProject } from "../../store/useProject";
import { compileVorlage, copyVorlage, exportVorlage, fetchVorlageCategories, fetchVorlagen, saveVorlageDocument, toggleVorlageFavorite, updateVorlage, } from "../../api/vorlagen";
import "./vorlagen-center.css";
function DocumentPreview({ content }) {
    return (_jsx("div", { className: "vc-paper", children: content.replace(/\r\n/g, "\n").split("\n").map((line, index) => {
            if (line.startsWith("# ")) {
                return _jsx("h2", { children: line.slice(2) }, index);
            }
            if (line.startsWith("## ")) {
                return _jsx("h3", { children: line.slice(3) }, index);
            }
            if (!line.trim())
                return _jsx("div", { className: "vc-paper-gap" }, index);
            if (line.startsWith("☐")) {
                return _jsxs("div", { className: "vc-checkline", children: ["\u25A1 ", line.slice(1).trim()] }, index);
            }
            return _jsx("p", { children: line }, index);
        }) }));
}
function messageFromError(error) {
    return error instanceof Error ? error.message : "Unbekannter Fehler";
}
export default function VorlagenCenter() {
    const { currentProject } = useProject();
    const [categories, setCategories] = React.useState([]);
    const [totalStandard, setTotalStandard] = React.useState(0);
    const [templates, setTemplates] = React.useState([]);
    const [selectedId, setSelectedId] = React.useState(null);
    const [searchInput, setSearchInput] = React.useState("");
    const [search, setSearch] = React.useState("");
    const [category, setCategory] = React.useState("");
    const [favoritesOnly, setFavoritesOnly] = React.useState(false);
    const [page, setPage] = React.useState(1);
    const [pages, setPages] = React.useState(1);
    const [total, setTotal] = React.useState(0);
    const [loading, setLoading] = React.useState(true);
    const [actionBusy, setActionBusy] = React.useState(false);
    const [error, setError] = React.useState(null);
    const [notice, setNotice] = React.useState(null);
    const [workingTitle, setWorkingTitle] = React.useState("");
    const [workingContent, setWorkingContent] = React.useState("");
    const [values, setValues] = React.useState({});
    const [mode, setMode] = React.useState("preview");
    const selected = React.useMemo(() => templates.find((template) => template.id === selectedId) ?? null, [templates, selectedId]);
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
            setSelectedId((current) => current && response.templates.some((template) => template.id === current)
                ? current
                : response.templates[0]?.id ?? null);
        }
        catch (loadError) {
            setError(messageFromError(loadError));
            setTemplates([]);
            setSelectedId(null);
        }
        finally {
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
    const selectCategory = React.useCallback((key) => {
        setCategory(key);
        setPage(1);
    }, []);
    const handleFavorite = React.useCallback(async () => {
        if (!selected)
            return;
        setActionBusy(true);
        try {
            const response = await toggleVorlageFavorite(selected.id);
            setTemplates((current) => favoritesOnly && !response.favorite
                ? current.filter((template) => template.id !== selected.id)
                : current.map((template) => template.id === selected.id
                    ? { ...template, favorite: response.favorite }
                    : template));
            setNotice(response.favorite ? "Zu Favoriten hinzugefügt." : "Aus Favoriten entfernt.");
        }
        catch (favoriteError) {
            setError(messageFromError(favoriteError));
        }
        finally {
            setActionBusy(false);
        }
    }, [favoritesOnly, selected]);
    const handleCopy = React.useCallback(async () => {
        if (!selected)
            return;
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
        }
        catch (copyError) {
            setError(messageFromError(copyError));
        }
        finally {
            setActionBusy(false);
        }
    }, [loadCategories, selected]);
    const handleUse = React.useCallback(async () => {
        if (!selected)
            return;
        setActionBusy(true);
        setError(null);
        try {
            const response = await compileVorlage(selected.id, currentProject?.id, values);
            setWorkingTitle(response.title);
            setWorkingContent(response.compiledContent);
            setValues(response.values);
            setMode("document");
            setNotice(currentProject
                ? `Projektdaten aus ${currentProject.code} wurden eingesetzt.`
                : "Dokument geöffnet. Fehlende Felder können rechts ergänzt werden.");
        }
        catch (compileError) {
            setError(messageFromError(compileError));
        }
        finally {
            setActionBusy(false);
        }
    }, [currentProject, selected, values]);
    const handleSave = React.useCallback(async () => {
        if (!selected)
            return;
        setActionBusy(true);
        setError(null);
        try {
            if (mode === "template") {
                const response = await updateVorlage(selected.id, {
                    title: workingTitle,
                    content: workingContent,
                });
                setTemplates((current) => current.map((item) => item.id === selected.id
                    ? { ...response.template, favorite: item.favorite }
                    : item));
                setNotice("Firmenvorlage gespeichert.");
            }
            else {
                await saveVorlageDocument({
                    templateId: selected.id,
                    projectId: currentProject?.id,
                    title: workingTitle,
                    content: workingContent,
                    values,
                });
                setNotice("Dokument im Vorlagen-Center gespeichert.");
            }
        }
        catch (saveError) {
            setError(messageFromError(saveError));
        }
        finally {
            setActionBusy(false);
        }
    }, [currentProject, mode, selected, values, workingContent, workingTitle]);
    const handleExport = React.useCallback(async (format) => {
        if (!selected)
            return;
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
        }
        catch (exportError) {
            setError(messageFromError(exportError));
        }
        finally {
            setActionBusy(false);
        }
    }, [currentProject, selected, values, workingContent, workingTitle]);
    const updateValue = React.useCallback((key, value) => {
        setValues((current) => ({ ...current, [key]: value }));
    }, []);
    return (_jsxs("div", { className: "vc-page", children: [_jsxs("header", { className: "vc-header rlc-page-hero rlc-page-hero--split", children: [_jsxs("div", { children: [_jsx("div", { className: "vc-eyebrow rlc-page-hero__eyebrow", children: "B\u00FCro & Verwaltung" }), _jsx("h1", { children: "Vorlagen-Center" }), _jsxs("p", { children: [totalStandard || 342, " gesch\u00FCtzte RLC Standardvorlagen, Firmenkopien und projektbezogene Dokumente."] })] }), _jsxs("div", { className: "vc-header-stats", children: [_jsxs("div", { children: [_jsx("strong", { children: totalStandard || 342 }), _jsx("span", { children: "RLC Vorlagen" })] }), _jsxs("div", { children: [_jsx("strong", { children: categories.length || 19 }), _jsx("span", { children: "Kategorien" })] }), _jsxs("div", { children: [_jsx("strong", { children: total }), _jsx("span", { children: "Treffer" })] })] })] }), _jsxs("div", { className: "vc-toolbar", children: [_jsxs("label", { className: "vc-search", children: [_jsx(Search, { size: 17 }), _jsx("input", { value: searchInput, onChange: (event) => setSearchInput(event.target.value), placeholder: "Vorlagen durchsuchen\u2026" })] }), _jsxs("button", { className: favoritesOnly ? "vc-btn vc-btn-active" : "vc-btn", onClick: () => {
                            setFavoritesOnly((current) => !current);
                            setPage(1);
                        }, children: [_jsx(Star, { size: 16, fill: favoritesOnly ? "currentColor" : "none" }), "Favoriten"] }), _jsxs("div", { className: "vc-project-chip", children: [_jsx(Building2, { size: 16 }), currentProject
                                ? `${currentProject.code} · ${currentProject.name}`
                                : "Kein Projekt gewählt"] })] }), error ? _jsx("div", { className: "vc-alert vc-alert-error", children: error }) : null, notice ? _jsx("div", { className: "vc-alert vc-alert-success", children: notice }) : null, _jsxs("div", { className: "vc-workspace", children: [_jsxs("aside", { className: "vc-categories", children: [_jsxs("button", { className: !category ? "vc-category active" : "vc-category", onClick: () => selectCategory(""), children: [_jsx("span", { children: "Alle Vorlagen" }), _jsx("b", { children: categories.reduce((sum, item) => sum + item.count, 0) })] }), categories.map((item) => (_jsxs("button", { className: category === item.key ? "vc-category active" : "vc-category", onClick: () => selectCategory(item.key), title: item.description, children: [_jsx("span", { children: item.label }), _jsx("b", { children: item.count })] }, item.key)))] }), _jsxs("section", { className: "vc-results", children: [_jsxs("div", { className: "vc-section-head", children: [_jsxs("div", { children: [_jsx("strong", { children: category ? categories.find((item) => item.key === category)?.label : "Alle Vorlagen" }), _jsxs("span", { children: [total, " Ergebnisse"] })] }), _jsxs("span", { children: ["Seite ", page, " / ", pages] })] }), _jsxs("div", { className: "vc-template-list", children: [loading ? _jsx("div", { className: "vc-empty", children: "RLC l\u00E4dt Vorlagen\u2026" }) : null, !loading && !templates.length ? (_jsx("div", { className: "vc-empty", children: "Keine passende Vorlage gefunden." })) : null, !loading && templates.map((template) => (_jsxs("button", { className: selectedId === template.id ? "vc-template active" : "vc-template", onClick: () => setSelectedId(template.id), children: [_jsx("div", { className: "vc-template-icon", children: _jsx(FileText, { size: 18 }) }), _jsxs("div", { className: "vc-template-copy", children: [_jsx("strong", { children: template.title }), _jsx("span", { children: template.categoryLabel }), _jsx("small", { children: template.description })] }), _jsxs("div", { className: "vc-template-badges", children: [template.favorite ? _jsx(Star, { size: 15, fill: "currentColor" }) : null, template.isStandard ? _jsx(ShieldCheck, { size: 16 }) : _jsx(Building2, { size: 16 })] })] }, template.id)))] }), _jsxs("div", { className: "vc-pagination", children: [_jsx("button", { className: "vc-btn", disabled: page <= 1, onClick: () => setPage((value) => value - 1), children: "Zur\u00FCck" }), _jsx("button", { className: "vc-btn", disabled: page >= pages, onClick: () => setPage((value) => value + 1), children: "Weiter" })] })] }), _jsx("section", { className: "vc-detail", children: !selected ? (_jsxs("div", { className: "vc-empty vc-detail-empty", children: [_jsx(Files, { size: 36 }), _jsx("strong", { children: "Vorlage ausw\u00E4hlen" }), _jsx("span", { children: "Details, Vorschau und Export erscheinen hier." })] })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "vc-detail-head", children: [_jsxs("div", { children: [_jsxs("div", { className: "vc-badge-row", children: [_jsx("span", { className: "vc-badge", children: selected.categoryLabel }), selected.isStandard ? (_jsxs("span", { className: "vc-badge protected", children: [_jsx(ShieldCheck, { size: 13 }), " RLC Standard \u00B7 gesch\u00FCtzt"] })) : (_jsxs("span", { className: "vc-badge company", children: [_jsx(Building2, { size: 13 }), " Firmenvorlage \u00B7 Version ", selected.version] }))] }), mode === "template" || mode === "document" ? (_jsx("input", { className: "vc-title-input", value: workingTitle, onChange: (event) => setWorkingTitle(event.target.value) })) : (_jsx("h2", { children: selected.title })), _jsx("p", { children: selected.description })] }), _jsx("button", { className: "vc-icon-btn", title: "Favorit", onClick: () => void handleFavorite(), disabled: actionBusy, children: _jsx(Star, { size: 18, fill: selected.favorite ? "currentColor" : "none" }) })] }), _jsxs("div", { className: "vc-actions", children: [_jsxs("button", { className: "vc-btn vc-btn-primary", onClick: () => void handleUse(), disabled: actionBusy, children: [_jsx(Edit3, { size: 16 }), " Vorlage verwenden"] }), _jsxs("button", { className: "vc-btn", onClick: () => void handleCopy(), disabled: actionBusy, children: [_jsx(Copy, { size: 16 }), " Firmenkopie"] }), !selected.isStandard && mode !== "template" ? (_jsxs("button", { className: "vc-btn", onClick: () => setMode("template"), disabled: actionBusy, children: [_jsx(Edit3, { size: 16 }), " Bearbeiten"] })) : null, mode !== "preview" ? (_jsxs("button", { className: "vc-btn", onClick: () => void handleSave(), disabled: actionBusy, children: [_jsx(Save, { size: 16 }), " Speichern"] })) : null] }), mode === "document" ? (_jsxs("div", { className: "vc-fields", children: [_jsx("div", { className: "vc-fields-title", children: "Automatische Felder" }), _jsx("div", { className: "vc-fields-grid", children: selected.variables.map((variable) => (_jsxs("label", { children: [_jsx("span", { children: variable }), _jsx("input", { value: values[variable] ?? "", onChange: (event) => updateValue(variable, event.target.value), placeholder: `{{${variable}}}` })] }, variable))) }), _jsx("button", { className: "vc-btn", onClick: () => void handleUse(), disabled: actionBusy, children: "Felder erneut einsetzen" })] })) : null, _jsxs("div", { className: "vc-editor-head", children: [_jsx("strong", { children: mode === "preview" ? "Vorschau" : mode === "template" ? "Firmenvorlage bearbeiten" : "Dokument bearbeiten" }), _jsxs("span", { children: [workingContent.length.toLocaleString("de-DE"), " Zeichen"] })] }), mode === "preview" ? (_jsx(DocumentPreview, { content: workingContent })) : (_jsx("textarea", { className: "vc-editor", value: workingContent, onChange: (event) => setWorkingContent(event.target.value), spellCheck: true })), _jsxs("div", { className: "vc-export", children: [_jsxs("div", { children: [_jsx("strong", { children: "Export" }), _jsx("span", { children: "Mit Firmenkopf und Projektdaten" })] }), _jsxs("button", { className: "vc-btn", onClick: () => void handleExport("pdf"), disabled: actionBusy, children: [_jsx(Download, { size: 16 }), " PDF"] }), _jsxs("button", { className: "vc-btn", onClick: () => void handleExport("docx"), disabled: actionBusy, children: [_jsx(FileText, { size: 16 }), " DOCX"] }), _jsxs("button", { className: "vc-btn", onClick: () => void handleExport("xlsx"), disabled: actionBusy, children: [_jsx(FileSpreadsheet, { size: 16 }), " XLSX"] })] })] })) })] })] }));
}
