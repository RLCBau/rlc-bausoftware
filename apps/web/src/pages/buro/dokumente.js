import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
import { API_BASE } from "../../lib/apiBase";
// apps/web/src/pages/buro/dokumente.tsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { DocsDB } from "./store.docs";
import { useProject } from "../../store/useProject";
// === API server ===
import { listDocuments as srvList, initDocument as srvInit, getUploadUrl as srvGetUrl, putToStorage as srvPut, detectKind as srvDetectKind, softDeleteDocument as srvSoftDelete, restoreDocument as srvRestore, updateDocument as srvUpdate } from "../../api/files";
const th = {
    textAlign: "left",
    padding: "8px 10px",
    borderBottom: "1px solid var(--line)",
    fontSize: 13,
    whiteSpace: "nowrap"
};
const td = {
    padding: "6px 10px",
    borderBottom: "1px solid var(--line)",
    fontSize: 13,
    verticalAlign: "middle"
};
const lbl = {
    fontSize: 13,
    opacity: 0.8
};
const inp = {
    border: "1px solid var(--line)",
    borderRadius: 6,
    padding: "6px 8px",
    fontSize: 13
};
function apiUrl(path) {
    const p = path.startsWith("/") ? path : `/${path}`;
    return API_BASE ? `${API_BASE}${p}` : p;
}
const CURRENT_DOC_KEY = "rlc.currentDoc";
const CURRENT_PROJECT_ID_KEY = "currentProjectId";
export default function Dokumente() {
    const navigate = useNavigate();
    const { currentProject, selectProject } = useProject();
    const [all, setAll] = React.useState(DocsDB.list());
    const [selId, setSelId] = React.useState(DocsDB.list()[0]?.id ?? null);
    const [q, setQ] = React.useState("");
    const [tagFilter, setTagFilter] = React.useState("");
    const [zoom, setZoom] = React.useState(1);
    const projectIdGlobal = currentProject?.id ?? "";
    const [projectId, setProjectId] = React.useState(() => {
        try {
            return localStorage.getItem(CURRENT_PROJECT_ID_KEY) || projectIdGlobal || "";
        }
        catch {
            return projectIdGlobal || "";
        }
    });
    const [serverDocs, setServerDocs] = React.useState([]);
    const [serverBusy, setServerBusy] = React.useState(false);
    const refresh = React.useCallback(() => {
        const next = DocsDB.list();
        setAll(next);
        setSelId((prev) => {
            if (prev && next.some((d) => d.id === prev))
                return prev;
            return next[0]?.id ?? null;
        });
    }, []);
    React.useEffect(() => {
        if (!projectId && projectIdGlobal) {
            setProjectId(projectIdGlobal);
        }
    }, [projectId, projectIdGlobal]);
    const sel = React.useMemo(() => all.find((d) => d.id === selId) ?? null, [all, selId]);
    const cur = React.useMemo(() => sel?.versions?.[0], [sel]);
    const filtered = React.useMemo(() => {
        const qn = q.trim().toLowerCase();
        const tag = tagFilter.trim().toLowerCase();
        return all.filter((d) => {
            const hay = `${d.title} ${(d.tags ?? []).join(" ")}`.toLowerCase();
            const okQ = !qn || hay.includes(qn);
            const okT = !tag || (d.tags ?? []).some((t) => t.toLowerCase() === tag);
            return okQ && okT;
        });
    }, [all, q, tagFilter]);
    const allTags = React.useMemo(() => Array.from(new Set(all.flatMap((d) => d.tags ?? []))).sort(), [all]);
    const persistCurrentDoc = React.useCallback((doc) => {
        try {
            if (doc) {
                sessionStorage.setItem(CURRENT_DOC_KEY, JSON.stringify(doc));
            }
            else {
                sessionStorage.removeItem(CURRENT_DOC_KEY);
            }
        }
        catch {
            // ignore
        }
    }, []);
    const persistCurrentProjectId = React.useCallback((value) => {
        try {
            if (value)
                localStorage.setItem(CURRENT_PROJECT_ID_KEY, value);
            else
                localStorage.removeItem(CURRENT_PROJECT_ID_KEY);
        }
        catch {
            // ignore
        }
    }, []);
    const addDoc = React.useCallback(() => {
        const d = DocsDB.create();
        refresh();
        setSelId(d.id);
        setZoom(1);
    }, [refresh]);
    const delDoc = React.useCallback(() => {
        if (!sel)
            return;
        if (!confirm("Dokument wirklich löschen?"))
            return;
        DocsDB.remove(sel.id);
        refresh();
        setZoom(1);
    }, [sel, refresh]);
    const update = React.useCallback((patch) => {
        if (!sel)
            return;
        DocsDB.upsert({ ...sel, ...patch });
        refresh();
    }, [sel, refresh]);
    const uploadNewVersion = React.useCallback(async () => {
        if (!sel)
            return;
        pickFile(async (f) => {
            await DocsDB.addVersion(sel.id, f);
            refresh();
            setZoom(1);
        });
    }, [sel, refresh]);
    const onDrop = React.useCallback(async (ev) => {
        ev.preventDefault();
        if (!sel)
            return;
        const f = ev.dataTransfer.files?.[0];
        if (!f)
            return;
        await DocsDB.addVersion(sel.id, f);
        refresh();
        setZoom(1);
    }, [sel, refresh]);
    const download = React.useCallback((v) => {
        const a = document.createElement("a");
        a.href = v.dataURL;
        a.download = v.fileName;
        a.click();
    }, []);
    const copyDataURL = React.useCallback(async (v) => {
        await navigator.clipboard.writeText(v.dataURL);
        alert("Data-URL kopiert.");
    }, []);
    const doExportCSV = React.useCallback(() => {
        downloadBlob(DocsDB.exportCSV(filtered), "dokumente.csv", "text/csv;charset=utf-8");
    }, [filtered]);
    const doImportCSV = React.useCallback(() => {
        pickFile(async (f) => {
            const n = DocsDB.importCSV(await f.text());
            alert(`${n} Dokumente importiert.`);
            refresh();
        });
    }, [refresh]);
    const doExportJSON = React.useCallback(() => {
        downloadBlob(DocsDB.exportJSON(), "dokumente_backup.json", "application/json");
    }, []);
    const doImportJSON = React.useCallback(() => {
        pickFile(async (f) => {
            const n = DocsDB.importJSON(await f.text());
            alert(`Backup importiert: ${n} Elemente.`);
            refresh();
        });
    }, [refresh]);
    const loadFromServer = React.useCallback(async () => {
        const pid = projectId.trim();
        if (!pid) {
            alert("Bitte Project-ID setzen.");
            return;
        }
        setServerBusy(true);
        try {
            const list = await srvList(pid);
            setServerDocs((Array.isArray(list) ? list : []));
            persistCurrentProjectId(pid);
            selectProject(pid);
        }
        catch (e) {
            alert(e?.message || "Server-Dokumente konnten nicht geladen werden.");
        }
        finally {
            setServerBusy(false);
        }
    }, [projectId, persistCurrentProjectId, selectProject]);
    const uploadSelectionToServer = React.useCallback(async () => {
        const pid = projectId.trim();
        if (!sel || !cur) {
            alert("Wähle ein Dokument mit einer Version aus.");
            return;
        }
        if (!pid) {
            alert("Bitte Project-ID setzen.");
            return;
        }
        setServerBusy(true);
        try {
            const blob = dataURLtoBlob(cur.dataURL);
            const file = new File([blob], cur.fileName, {
                type: cur.mime || "application/octet-stream"
            });
            const kind = String(srvDetectKind(file));
            const { documentId } = await srvInit(pid, kind, file.name);
            const { uploadUrl } = await srvGetUrl(documentId, file.name, file.type || "application/octet-stream");
            await srvPut(uploadUrl, file, file.type || "application/octet-stream");
            await loadFromServer();
            persistCurrentDoc({
                id: documentId,
                name: file.name,
                kind
            });
            alert("Upload zum Server abgeschlossen.");
        }
        catch (e) {
            alert(e?.message || "Upload zum Server fehlgeschlagen.");
        }
        finally {
            setServerBusy(false);
        }
    }, [projectId, sel, cur, loadFromServer, persistCurrentDoc]);
    const softDelete = React.useCallback(async (docId) => {
        if (!confirm("Dieses Dokument serverseitig (soft) löschen?"))
            return;
        setServerBusy(true);
        try {
            await srvSoftDelete(docId);
            await loadFromServer();
        }
        catch (e) {
            alert(e?.message || "Löschen fehlgeschlagen.");
        }
        finally {
            setServerBusy(false);
        }
    }, [loadFromServer]);
    const restore = React.useCallback(async (docId) => {
        setServerBusy(true);
        try {
            await srvRestore(docId);
            await loadFromServer();
        }
        catch (e) {
            alert(e?.message || "Wiederherstellen fehlgeschlagen.");
        }
        finally {
            setServerBusy(false);
        }
    }, [loadFromServer]);
    const openInViewer = React.useCallback(async (row) => {
        const pid = projectId.trim();
        if (!pid) {
            alert("Bitte Project-ID setzen.");
            return;
        }
        try {
            persistCurrentDoc({
                id: String(row.id),
                name: String(row.name || ""),
                kind: String(row.kind || "")
            });
            const kind = String(row.kind || "").toUpperCase();
            if (kind === "PDF")
                navigate("/cad/pdf-viewer");
            else if (kind === "DWG" || kind === "DXF")
                navigate("/cad/viewer");
            else
                navigate("/buro/dokumente");
        }
        catch (e) {
            alert(e?.message || "Öffnen fehlgeschlagen.");
        }
    }, [navigate, persistCurrentDoc, projectId]);
    const goToLieferscheine = React.useCallback(() => {
        navigate("/mengenermittlung/lieferscheine");
    }, [navigate]);
    const goToBuchhaltungBelege = React.useCallback(() => {
        navigate("/buchhaltung/reports");
    }, [navigate]);
    const quickFilterLieferschein = React.useCallback(() => {
        setQ("lieferschein");
        setTagFilter("");
    }, []);
    const renderPreview = React.useCallback((v) => {
        if (!v) {
            return _jsx("div", { className: "rlc-migrated-pages-buro-dokumente-tsx-449", children: "Keine Version vorhanden." });
        }
        const isPDF = (v.mime || "").includes("pdf") || /\.pdf$/i.test(v.fileName);
        const isImg = (v.mime || "").startsWith("image/") ||
            /\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(v.fileName);
        const openNew = () => {
            const w = window.open(v.dataURL, "_blank");
            if (!w)
                alert("Popup blockiert.");
        };
        return (_jsxs("div", { className: "rlc-migrated-pages-buro-dokumente-tsx-450", children: [_jsxs("div", { className: "rlc-migrated-pages-buro-dokumente-tsx-451", children: [_jsx("div", { title: v.fileName, className: "rlc-migrated-pages-buro-dokumente-tsx-452", children: v.fileName }), _jsx("div", { className: "rlc-migrated-pages-buro-dokumente-tsx-453" }), _jsx("button", { className: "btn", onClick: () => setZoom((z) => Math.max(0.5, z - 0.1)), children: "-" }), _jsxs("div", { className: "rlc-migrated-pages-buro-dokumente-tsx-454", children: [Math.round(zoom * 100), "%"] }), _jsx("button", { className: "btn", onClick: () => setZoom((z) => Math.min(2, z + 0.1)), children: "+" }), _jsx("button", { className: "btn", onClick: openNew, children: "In neuem Tab \u00F6ffnen" })] }), _jsx("div", { className: "rlc-migrated-pages-buro-dokumente-tsx-455", children: isPDF ?
                        _jsx("iframe", { title: "pdf", src: v.dataURL, className: rlcClass(null, {
                                width: "100%",
                                height: "100%",
                                border: "0",
                                transform: `scale(${zoom})`,
                                transformOrigin: "0 0"
                            }) }) :
                        isImg ?
                            _jsx("div", { className: "rlc-migrated-pages-buro-dokumente-tsx-456", children: _jsx("img", { src: v.dataURL, alt: v.fileName, className: rlcClass(null, {
                                        width: `${zoom * 100}%`,
                                        height: "auto",
                                        display: "block"
                                    }) }) }) :
                            _jsxs("div", { className: "rlc-migrated-pages-buro-dokumente-tsx-457", children: [_jsx("div", { className: "rlc-migrated-pages-buro-dokumente-tsx-458", children: "Vorschau nicht unterst\u00FCtzt." }), _jsxs("div", { className: "rlc-migrated-pages-buro-dokumente-tsx-459", children: ["Typ: ", v.mime || "—"] }), _jsx("button", { className: "btn", onClick: openNew, children: "\u00D6ffnen / Download" })] }) })] }));
    }, [zoom]);
    return (_jsxs("div", { className: "rlc-migrated-pages-buro-dokumente-tsx-460", children: [_jsxs("div", { className: "card rlc-migrated-pages-buro-dokumente-tsx-461", children: [_jsx("button", { className: "btn", onClick: goToLieferscheine, children: "\u2192 Lieferscheine" }), _jsx("button", { className: "btn", onClick: goToBuchhaltungBelege, children: "\u2192 Buchhaltung: Dokumente & Belege" }), _jsx("button", { className: "btn", onClick: quickFilterLieferschein, title: "Filter lokal nach 'Lieferschein'", children: "Filter: Lieferschein" }), _jsx("div", { className: "rlc-migrated-pages-buro-dokumente-tsx-462" }), _jsx("button", { className: "btn", onClick: addDoc, children: "+ Dokument" }), _jsx("button", { className: "btn", onClick: delDoc, disabled: !sel, children: "L\u00F6schen" }), _jsx("div", { className: "rlc-migrated-pages-buro-dokumente-tsx-463" }), _jsx("input", { placeholder: "Suchen\u2026", value: q, onChange: (e) => setQ(e.target.value), className: rlcClass(null, { ...inp, width: 200 }) }), _jsxs("select", { value: tagFilter, onChange: (e) => setTagFilter(e.target.value), className: rlcClass(null, { ...inp, width: 160 }), children: [_jsx("option", { value: "", children: "Alle Tags" }), allTags.map((t) => _jsx("option", { value: t, children: t }, t))] }), _jsx("button", { className: "btn", onClick: uploadNewVersion, disabled: !sel, children: "Neue Version" }), _jsx("button", { className: "btn", onClick: doImportCSV, children: "Import CSV" }), _jsx("button", { className: "btn", onClick: doExportCSV, children: "Export CSV" }), _jsx("button", { className: "btn", onClick: doImportJSON, children: "Import JSON" }), _jsx("button", { className: "btn", onClick: doExportJSON, children: "Export JSON" }), _jsx("div", { className: "rlc-migrated-pages-buro-dokumente-tsx-464" }), _jsx("input", { placeholder: "Project-ID (Server)", value: projectId, onChange: (e) => {
                            const next = e.target.value;
                            setProjectId(next);
                            if (next) {
                                persistCurrentProjectId(next);
                                selectProject(next);
                            }
                        }, className: rlcClass(null, { ...inp, width: 280 }) }), _jsx("button", { className: "btn", onClick: loadFromServer, disabled: !projectId.trim() || serverBusy, children: "Server: Laden" }), _jsx("button", { className: "btn", onClick: uploadSelectionToServer, disabled: !projectId.trim() || !sel || !cur || serverBusy, children: "Auswahl \u2192 Server" })] }), _jsxs("div", { className: "rlc-migrated-pages-buro-dokumente-tsx-465", children: [_jsxs("div", { className: "rlc-migrated-pages-buro-dokumente-tsx-466", children: [_jsx("div", { className: "card rlc-migrated-pages-buro-dokumente-tsx-467", children: _jsxs("table", { className: "rlc-migrated-pages-buro-dokumente-tsx-468", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, th), children: "Titel" }), _jsx("th", { className: rlcClass(null, th), children: "Tags" }), _jsx("th", { className: rlcClass(null, th), children: "Letzte Version" }), _jsx("th", { className: rlcClass(null, th), children: "Gr\u00F6\u00DFe" }), _jsx("th", { className: rlcClass(null, th), children: "Ge\u00E4ndert" })] }) }), _jsx("tbody", { children: filtered.length === 0 ?
                                                _jsx("tr", { children: _jsx("td", { className: rlcClass(null, { ...td, opacity: 0.7 }), colSpan: 5, children: "Keine lokalen Dokumente gefunden." }) }) :
                                                filtered.map((d) => {
                                                    const v = d.versions[0];
                                                    return (_jsxs("tr", { onClick: () => {
                                                            setSelId(d.id);
                                                            setZoom(1);
                                                        }, className: rlcClass(null, {
                                                            cursor: "pointer",
                                                            background: d.id === selId ? "#f1f5ff" : undefined
                                                        }), children: [_jsx("td", { className: rlcClass(null, td), children: d.title }), _jsx("td", { className: rlcClass(null, td), children: (d.tags ?? []).join(", ") }), _jsx("td", { className: rlcClass(null, td), children: v ? v.fileName : _jsx("i", { children: "\u2014" }) }), _jsx("td", { className: rlcClass(null, td), children: v ? `${(v.size / 1024).toFixed(1)} KB` : "—" }), _jsx("td", { className: rlcClass(null, td), children: new Date(d.updatedAt).toLocaleString() })] }, d.id));
                                                }) })] }) }), _jsx("div", { className: "card rlc-migrated-pages-buro-dokumente-tsx-469", onDragOver: (e) => e.preventDefault(), onDrop: onDrop, children: !sel ?
                                    _jsx("div", { className: "rlc-migrated-pages-buro-dokumente-tsx-470", children: "W\u00E4hle links ein Dokument aus oder erstelle ein neues." }) :
                                    _jsxs("div", { className: "rlc-migrated-pages-buro-dokumente-tsx-471", children: [_jsx("label", { className: rlcClass(null, lbl), children: "Titel" }), _jsx("input", { className: rlcClass(null, { ...inp, width: "100%" }), value: sel.title, onChange: (e) => update({ title: e.target.value }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Tags" }), _jsx("input", { className: rlcClass(null, { ...inp, width: "100%" }), placeholder: "kommagetrennt", value: (sel.tags ?? []).join(", "), onChange: (e) => update({
                                                    tags: e.target.value.
                                                        split(",").
                                                        map((s) => s.trim()).
                                                        filter(Boolean)
                                                }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Projekt-ID" }), _jsx("input", { className: rlcClass(null, inp), value: sel.projektId ?? "", onChange: (e) => update({ projektId: e.target.value }) }), _jsx("label", { className: rlcClass(null, { ...lbl, gridColumn: "1 / -1" }), children: "Versionen (Drag&Drop Datei hier)" }), _jsx("div", { className: "rlc-migrated-pages-buro-dokumente-tsx-472", children: !sel.versions.length ?
                                                    _jsx("div", { className: "rlc-migrated-pages-buro-dokumente-tsx-473", children: "Noch keine Version hochgeladen." }) :
                                                    _jsxs("table", { className: "rlc-migrated-pages-buro-dokumente-tsx-474", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, th), children: "Datei" }), _jsx("th", { className: rlcClass(null, th), children: "Typ" }), _jsx("th", { className: rlcClass(null, th), children: "Gr\u00F6\u00DFe" }), _jsx("th", { className: rlcClass(null, th), children: "Hochgeladen" }), _jsx("th", { className: rlcClass(null, th) })] }) }), _jsx("tbody", { children: sel.versions.map((v, i) => _jsxs("tr", { className: rlcClass(null, {
                                                                        background: i === 0 ? "#eef8f0" : undefined
                                                                    }), children: [_jsx("td", { className: rlcClass(null, td), title: v.fileName, children: v.fileName }), _jsx("td", { className: rlcClass(null, td), children: v.mime || "—" }), _jsxs("td", { className: rlcClass(null, td), children: [(v.size / 1024).toFixed(1), " KB"] }), _jsx("td", { className: rlcClass(null, td), children: new Date(v.uploadedAt).toLocaleString() }), _jsxs("td", { className: rlcClass(null, { ...td, whiteSpace: "nowrap" }), children: [_jsx("button", { className: "btn", onClick: () => download(v), children: "Download" }), _jsx("button", { className: "btn", onClick: () => copyDataURL(v), children: "Data-URL kopieren" }), i > 0 &&
                                                                                    _jsx("button", { className: "btn", onClick: () => {
                                                                                            DocsDB.restoreVersion(sel.id, v.id);
                                                                                            refresh();
                                                                                        }, children: "Wiederherstellen" })] })] }, v.id)) })] }) })] }) }), _jsxs("div", { className: "card rlc-migrated-pages-buro-dokumente-tsx-475", children: [_jsxs("div", { className: "rlc-migrated-pages-buro-dokumente-tsx-476", children: [_jsx("div", { className: "rlc-migrated-pages-buro-dokumente-tsx-477", children: "Server-Dokumente" }), _jsx("div", { className: "rlc-migrated-pages-buro-dokumente-tsx-478" }), _jsx("button", { className: "btn", onClick: loadFromServer, disabled: !projectId.trim() || serverBusy, children: "Aktualisieren" })] }), !projectId.trim() ?
                                        _jsx("div", { className: "rlc-migrated-pages-buro-dokumente-tsx-479", children: "Bitte eine Project-ID eingeben, um Server-Dokumente zu sehen." }) :
                                        serverDocs.length === 0 ?
                                            _jsx("div", { className: "rlc-migrated-pages-buro-dokumente-tsx-480", children: serverBusy ? "Lade…" : "Keine Dokumente auf dem Server gefunden." }) :
                                            _jsxs("table", { className: "rlc-migrated-pages-buro-dokumente-tsx-481", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, th), children: "Name / Meta" }), _jsx("th", { className: rlcClass(null, th), children: "Typ" }), _jsx("th", { className: rlcClass(null, th), children: "Versionen" }), _jsx("th", { className: rlcClass(null, th), children: "Ge\u00E4ndert" }), _jsx("th", { className: rlcClass(null, th), children: "Aktionen" })] }) }), _jsx("tbody", { children: serverDocs.map((d) => {
                                                            const versions = Array.isArray(d.versions) ? d.versions : [];
                                                            const last = versions[versions.length - 1] || null;
                                                            const storageUrl = last?.storageId && projectId.trim() ?
                                                                apiUrl(`/files/${encodeURIComponent(projectId.trim())}/storage/${encodeURIComponent(last.storageId)}`) :
                                                                null;
                                                            const deleted = !!d.deletedAt;
                                                            return (_jsxs("tr", { className: rlcClass(null, { opacity: deleted ? 0.55 : 1 }), children: [_jsx("td", { className: rlcClass(null, td), children: _jsx(EditableMeta, { row: d, onSaved: loadFromServer }) }), _jsx("td", { className: rlcClass(null, td), children: String(d.kind || "—") }), _jsx("td", { className: rlcClass(null, td), children: versions.length }), _jsx("td", { className: rlcClass(null, td), children: d.updatedAt ? new Date(d.updatedAt).toLocaleString() : "—" }), _jsxs("td", { className: rlcClass(null, {
                                                                            ...td,
                                                                            whiteSpace: "nowrap",
                                                                            display: "flex",
                                                                            gap: 6
                                                                        }), children: [storageUrl ?
                                                                                _jsx("a", { className: "btn", href: storageUrl, target: "_blank", rel: "noreferrer", children: "\u00D6ffnen (direkt)" }) :
                                                                                _jsx("span", { className: "rlc-migrated-pages-buro-dokumente-tsx-482", children: "\u2014" }), _jsx("button", { className: "btn", onClick: () => openInViewer(d), children: "Im Viewer \u00F6ffnen" }), !deleted ?
                                                                                _jsx("button", { className: "btn", onClick: () => softDelete(d.id), children: "L\u00F6schen" }) :
                                                                                _jsx("button", { className: "btn", onClick: () => restore(d.id), children: "Wiederherstellen" })] })] }, d.id));
                                                        }) })] })] })] }), _jsx("div", { className: "card rlc-migrated-pages-buro-dokumente-tsx-483", children: renderPreview(cur) })] })] }));
}
function EditableMeta({ row, onSaved }) {
    const [name, setName] = React.useState(row.name || "");
    const [tags, setTags] = React.useState((row.meta?.tags ?? []).join(", "));
    const [saving, setSaving] = React.useState(false);
    React.useEffect(() => {
        setName(row.name || "");
        setTags((row.meta?.tags ?? []).join(", "));
    }, [row.id, row.name, row.meta?.tags]);
    const save = React.useCallback(async () => {
        if (saving)
            return;
        setSaving(true);
        try {
            const parsedTags = tags.
                split(",").
                map((s) => s.trim()).
                filter(Boolean);
            await srvUpdate(row.id, { name, tags: parsedTags });
            await onSaved();
        }
        catch (e) {
            alert(e?.message || "Speichern fehlgeschlagen.");
        }
        finally {
            setSaving(false);
        }
    }, [saving, tags, row.id, name, onSaved]);
    return (_jsxs("div", { className: "rlc-migrated-pages-buro-dokumente-tsx-484", children: [_jsx("input", { className: rlcClass(null, inp), value: name, onChange: (e) => setName(e.target.value), placeholder: "Name" }), _jsx("input", { className: rlcClass(null, inp), value: tags, onChange: (e) => setTags(e.target.value), placeholder: "tags, komma, getrennt" }), _jsx("button", { className: "btn", onClick: save, disabled: saving, children: saving ? "Speichert…" : "Speichern" })] }));
}
function pickFile(onPick) {
    const inputEl = document.createElement("input");
    inputEl.type = "file";
    inputEl.onchange = () => {
        const f = inputEl.files?.[0];
        if (f)
            onPick(f);
    };
    inputEl.click();
}
function downloadBlob(text, name, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
}
function dataURLtoBlob(dataURL) {
    const [meta, b64] = dataURL.split(",");
    const mime = /data:([^;]+);base64/.exec(meta)?.[1] || "application/octet-stream";
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++)
        arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
}
