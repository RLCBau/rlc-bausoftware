import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiUrl } from "../../lib/apiBase";
import { useProject } from "../../store/useProject";
function authHeaders() {
    const keys = [
        "rlc_token",
        "token",
        "authToken",
        "accessToken",
        "rlc_auth_token",
        "rlc.auth.token",
        "rlc_mobile_token"
    ];
    for (const key of keys) {
        const token = localStorage.getItem(key) || sessionStorage.getItem(key);
        if (token?.trim())
            return { Authorization: `Bearer ${token.trim()}` };
    }
    for (const storage of [localStorage, sessionStorage]) {
        try {
            const raw = storage.getItem("rlc_auth");
            if (!raw)
                continue;
            const parsed = JSON.parse(raw);
            const token = parsed?.token || parsed?.accessToken;
            if (token)
                return { Authorization: `Bearer ${String(token).trim()}` };
        }
        catch {
            // Alte oder ungültige Auth-Daten ignorieren.
        }
    }
    return {};
}
async function parsePayload(response) {
    const text = await response.text();
    if (!text)
        return null;
    try {
        return JSON.parse(text);
    }
    catch {
        return text;
    }
}
async function request(path, init) {
    const response = await fetch(apiUrl(path), {
        credentials: "include",
        ...init,
        headers: {
            Accept: "application/json",
            ...(init?.body && !(init.body instanceof FormData) ?
                { "Content-Type": "application/json" } :
                {}),
            ...authHeaders(),
            ...(init?.headers || {})
        }
    });
    const payload = await parsePayload(response);
    if (!response.ok || payload?.ok === false) {
        const detail = typeof payload === "string" ?
            payload :
            payload?.message || payload?.error || `HTTP ${response.status}`;
        throw new Error(detail);
    }
    return payload;
}
function itemsOf(payload) {
    const candidates = [
        payload,
        payload?.items,
        payload?.rows,
        payload?.documents,
        payload?.data,
        payload?.data?.items
    ];
    for (const candidate of candidates) {
        if (Array.isArray(candidate))
            return candidate;
    }
    return [];
}
function assetUrl(value) {
    const url = String(value || "").trim();
    if (!url)
        return "";
    if (/^(https?:|blob:|data:)/i.test(url))
        return url;
    return apiUrl(url.startsWith("/") ? url : `/${url}`);
}
function fileUrl(file) {
    return assetUrl(file?.publicUrl || file?.url || file?.uri || "");
}
function uniqueFiles(doc) {
    if (!doc)
        return [];
    const all = [
        ...(doc.main ? [doc.main] : []),
        ...(Array.isArray(doc.files) ? doc.files : []),
        ...(Array.isArray(doc.photos) ? doc.photos : []),
        ...(Array.isArray(doc.attachments) ? doc.attachments : [])
    ];
    if (doc.imageUri) {
        all.unshift({
            name: "Hauptfoto",
            uri: doc.imageUri,
            type: "image/jpeg"
        });
    }
    const seen = new Set();
    return all.filter((entry) => {
        const url = fileUrl(entry);
        if (!url || seen.has(url))
            return false;
        seen.add(url);
        return true;
    });
}
function isImage(file) {
    const value = String(file.type || file.name || file.file || fileUrl(file)).toLowerCase();
    return /image\//.test(value) || /\.(png|jpe?g|webp|gif|heic|heif)(\?|$)/.test(value);
}
function emptyEditor() {
    return {
        date: new Date().toISOString().slice(0, 10),
        mitarbeiter: "",
        kostenstelle: "",
        lvItemPos: "",
        regieId: "",
        lieferscheinId: "",
        comment: "",
        bemerkungen: ""
    };
}
function editorFromDocument(doc) {
    if (!doc)
        return emptyEditor();
    return {
        date: String(doc.date || doc.datum || new Date().toISOString()).slice(0, 10),
        mitarbeiter: String(doc.mitarbeiter || doc.worker || ""),
        kostenstelle: String(doc.kostenstelle || doc.costCenter || ""),
        lvItemPos: String(doc.lvItemPos || doc.lvPos || doc.position || ""),
        regieId: String(doc.regieId || doc.regieberichtId || ""),
        lieferscheinId: String(doc.lieferscheinId || doc.lsId || ""),
        comment: String(doc.comment || doc.note || doc.description || ""),
        bemerkungen: String(doc.bemerkungen || doc.notes || "")
    };
}
function storageDocument(projectKey, docId) {
    const key = `rlc:mobile-workflow:${projectKey}:FOTOS:${docId}`;
    for (const storage of [sessionStorage, localStorage]) {
        try {
            const raw = storage.getItem(key);
            if (!raw)
                continue;
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object")
                return parsed;
        }
        catch {
            // Ungültigen Fallback ignorieren.
        }
    }
    return null;
}
function documentTitle(doc) {
    return String(doc.title ||
        doc.comment ||
        doc.note ||
        doc.main?.name ||
        doc.files?.[0]?.name ||
        doc.id ||
        "Foto / Notiz");
}
function documentDate(doc) {
    return String(doc.date || doc.datum || doc.createdAt || "—").slice(0, 10);
}
export default function ProjektakteFotos() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { getSelectedProject } = useProject();
    const selectedProject = getSelectedProject();
    const projectKey = String(searchParams.get("projectId") || "").trim() ||
        String(selectedProject?.code || selectedProject?.id || "").trim();
    const routeDocId = String(searchParams.get("docId") || "").trim();
    const routeStage = String(searchParams.get("stage") || "").trim().toLowerCase();
    const [tab, setTab] = React.useState(routeStage === "inbox" ? "INBOX" : "VERWALTUNG");
    const [inbox, setInbox] = React.useState([]);
    const [archive, setArchive] = React.useState([]);
    const [selectedDoc, setSelectedDoc] = React.useState(null);
    const [editor, setEditor] = React.useState(emptyEditor());
    const [pdfUrl, setPdfUrl] = React.useState("");
    const [loading, setLoading] = React.useState(false);
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState("");
    const fileInputRef = React.useRef(null);
    const selectedFiles = React.useMemo(() => uniqueFiles(selectedDoc), [selectedDoc]);
    const selectedId = String(selectedDoc?.id || selectedDoc?.docId || "").trim();
    const isInboxDocument = Boolean(selectedId && inbox.some((entry) => String(entry.id || entry.docId) === selectedId));
    const load = React.useCallback(async () => {
        if (!projectKey) {
            setInbox([]);
            setArchive([]);
            setSelectedDoc(null);
            return;
        }
        setLoading(true);
        setError("");
        try {
            const encodedProject = encodeURIComponent(projectKey);
            const [inboxPayload, archivePayload] = await Promise.all([
                request(`/api/fotos/inbox/list?projectId=${encodedProject}`),
                request(`/api/fotos/freigegeben/list?projectId=${encodedProject}`)
            ]);
            const nextInbox = itemsOf(inboxPayload).sort((a, b) => documentDate(b).localeCompare(documentDate(a)));
            const nextArchive = itemsOf(archivePayload).sort((a, b) => documentDate(b).localeCompare(documentDate(a)));
            setInbox(nextInbox);
            setArchive(nextArchive);
            let nextSelected = null;
            if (routeDocId && routeStage === "inbox") {
                try {
                    const payload = await request(`/api/fotos/inbox/read?projectId=${encodedProject}&docId=${encodeURIComponent(routeDocId)}`);
                    nextSelected = (payload?.snapshot || payload?.item || payload);
                }
                catch {
                    nextSelected = storageDocument(projectKey, routeDocId);
                }
            }
            if (!nextSelected && routeDocId) {
                nextSelected =
                    nextInbox.find((entry) => String(entry.id || entry.docId) === routeDocId) ||
                        nextArchive.find((entry) => String(entry.id || entry.docId) === routeDocId) ||
                        null;
            }
            if (!nextSelected && selectedId) {
                nextSelected =
                    nextInbox.find((entry) => String(entry.id || entry.docId) === selectedId) ||
                        nextArchive.find((entry) => String(entry.id || entry.docId) === selectedId) ||
                        null;
            }
            if (!nextSelected) {
                nextSelected =
                    routeStage === "inbox" ?
                        nextInbox[0] || null :
                        nextArchive[0] || null;
            }
            setSelectedDoc(nextSelected);
            setEditor(editorFromDocument(nextSelected));
            setPdfUrl(assetUrl(nextSelected?.pdfUrl || ""));
        }
        catch (loadError) {
            setError(loadError?.message || "Projektakte / Fotos konnte nicht geladen werden.");
        }
        finally {
            setLoading(false);
        }
    }, [projectKey, routeDocId, routeStage]);
    React.useEffect(() => {
        void load();
    }, [load]);
    async function openDocument(doc, nextTab) {
        const id = String(doc.id || doc.docId || "").trim();
        if (!id) {
            setError("Dokument-ID fehlt.");
            return;
        }
        setLoading(true);
        setError("");
        try {
            let fullDocument = doc;
            if (nextTab === "INBOX") {
                const payload = await request(`/api/fotos/inbox/read?projectId=${encodeURIComponent(projectKey)}&docId=${encodeURIComponent(id)}`);
                fullDocument = (payload?.snapshot ||
                    payload?.item ||
                    payload);
            }
            setTab(nextTab);
            setSelectedDoc(fullDocument);
            setEditor(editorFromDocument(fullDocument));
            // In Inbox prima mostra direttamente foto/allegati.
            // Il PDF apparirà dopo PDF Vorschau.
            setPdfUrl(nextTab === "INBOX" ?
                "" :
                assetUrl(fullDocument.pdfUrl || ""));
        }
        catch (openError) {
            setError(openError?.message ||
                "Foto-Dokument konnte nicht geöffnet werden.");
        }
        finally {
            setLoading(false);
        }
    }
    function updateEditor(key, value) {
        setEditor((current) => ({ ...current, [key]: value }));
    }
    function editorPayload() {
        return {
            projectId: projectKey,
            projectCode: projectKey,
            docId: selectedId,
            id: selectedId,
            ...editor,
            worker: editor.mitarbeiter,
            note: editor.comment,
            status: selectedDoc?.status || "INBOX",
            workflowStatus: selectedDoc?.workflowStatus || "INBOX",
            main: selectedDoc?.main || null,
            files: Array.isArray(selectedDoc?.files) ? selectedDoc?.files : [],
            photos: Array.isArray(selectedDoc?.photos) ? selectedDoc?.photos : [],
            attachments: Array.isArray(selectedDoc?.attachments) ? selectedDoc?.attachments : [],
            imageUri: selectedDoc?.imageUri
        };
    }
    async function saveDraft(showMessage = true) {
        if (!projectKey)
            throw new Error("Kein Projekt ausgewählt.");
        if (!selectedId)
            throw new Error("Kein Foto-Dokument ausgewählt.");
        if (!isInboxDocument)
            throw new Error("Freigegebene Einträge werden in der Projektakte nicht überschrieben.");
        setSaving(true);
        setError("");
        try {
            const result = await request("/api/fotos/inbox/update", {
                method: "POST",
                body: JSON.stringify(editorPayload())
            });
            const updated = (result?.item || result?.snapshot || result);
            setSelectedDoc(updated);
            setEditor(editorFromDocument(updated));
            if (showMessage)
                setError("Änderungen gespeichert.");
            return updated;
        }
        finally {
            setSaving(false);
        }
    }
    async function approveSelected() {
        if (!selectedId || !isInboxDocument)
            return;
        if (!confirm("Foto-Dokument freigeben und dauerhaft in der Projektakte registrieren?"))
            return;
        setLoading(true);
        setError("");
        try {
            await saveDraft(false);
            const result = await request("/api/fotos/inbox/approve", {
                method: "POST",
                body: JSON.stringify({ projectId: projectKey, docId: selectedId, id: selectedId })
            });
            const official = (result?.item || null);
            setTab("VERWALTUNG");
            setSelectedDoc(official);
            setEditor(editorFromDocument(official));
            setPdfUrl(assetUrl(official?.pdfUrl || ""));
            await load();
        }
        catch (approveError) {
            setError(approveError?.message || "Freigabe fehlgeschlagen.");
        }
        finally {
            setLoading(false);
        }
    }
    async function rejectSelected() {
        if (!selectedId || !isInboxDocument)
            return;
        const reason = prompt("Grund der Ablehnung:", selectedDoc?.rejectionReason || "");
        if (!reason?.trim())
            return;
        setLoading(true);
        setError("");
        try {
            await request("/api/fotos/inbox/reject", {
                method: "POST",
                body: JSON.stringify({ projectId: projectKey, docId: selectedId, id: selectedId, reason: reason.trim() })
            });
            await load();
        }
        catch (rejectError) {
            setError(rejectError?.message || "Ablehnung fehlgeschlagen.");
        }
        finally {
            setLoading(false);
        }
    }
    async function createPdf() {
        if (!projectKey)
            throw new Error("Kein Projekt ausgewählt.");
        if (!selectedDoc)
            throw new Error("Kein Foto-Dokument ausgewählt.");
        setLoading(true);
        setError("");
        try {
            const result = await request("/api/fotos/preview", {
                method: "POST",
                body: JSON.stringify({ ...selectedDoc, ...editorPayload() })
            });
            const nextUrl = assetUrl(result?.pdfUrl || result?.url || "");
            if (!nextUrl)
                throw new Error("PDF-URL fehlt in der Serverantwort.");
            setPdfUrl(nextUrl);
            return nextUrl;
        }
        finally {
            setLoading(false);
        }
    }
    async function exportPdf() {
        try {
            const url = await createPdf();
            const link = document.createElement("a");
            link.href = url;
            link.download = `Fotodokumentation_${editor.date || "Export"}.pdf`;
            link.target = "_blank";
            link.rel = "noreferrer";
            document.body.appendChild(link);
            link.click();
            link.remove();
        }
        catch (pdfError) {
            setError(pdfError?.message || "PDF Export fehlgeschlagen.");
        }
    }
    async function uploadFiles(files) {
        if (!files?.length || !selectedId || !isInboxDocument)
            return;
        setLoading(true);
        setError("");
        try {
            const form = new FormData();
            form.append("projectId", projectKey);
            form.append("projectCode", projectKey);
            form.append("docId", selectedId);
            form.append("id", selectedId);
            Array.from(files).forEach((file) => form.append("files", file));
            const result = await request("/api/fotos/inbox/upload", {
                method: "POST",
                body: form
            });
            const updated = (result?.item || selectedDoc);
            setSelectedDoc(updated);
            setEditor(editorFromDocument(updated));
            await load();
        }
        catch (uploadError) {
            setError(uploadError?.message || "Datei-Upload fehlgeschlagen.");
        }
        finally {
            setLoading(false);
            if (fileInputRef.current)
                fileInputRef.current.value = "";
        }
    }
    const list = tab === "INBOX" ? inbox : archive;
    return (_jsxs("div", { className: rlcClass(null, pageStyle), children: [_jsxs("section", { className: rlcClass("rlc-page-hero", heroStyle), children: [_jsxs("div", { children: [_jsx("div", { className: rlcClass(null, heroBadgeStyle), children: "Verwaltung" }), _jsx("h1", { className: rlcClass(null, heroTitleStyle), children: "Projektakte / Fotos" }), _jsx("p", { className: rlcClass(null, heroSubtitleStyle), children: "Mobile-Pr\u00FCfung, Fotodokumentation und dauerhafte Projektakte in einem Workflow." })] }), _jsx("button", { type: "button", className: rlcClass(null, heroButtonStyle), onClick: () => navigate("/buro"), children: "\u00DCbersicht" })] }), _jsxs("div", { className: rlcClass(null, toolbarStyle), children: [_jsxs("div", { className: "rlc-migrated-pages-buro-projektaktefotos-tsx-389", children: [_jsxs(TabButton, { active: tab === "INBOX", onClick: () => setTab("INBOX"), children: ["Inbox (Eingereicht) \u00B7 ", inbox.length] }), _jsxs(TabButton, { active: tab === "VERWALTUNG", onClick: () => setTab("VERWALTUNG"), children: ["Verwaltung \u00B7 ", archive.length] }), _jsx("button", { type: "button", className: rlcClass(null, secondaryButtonStyle), onClick: () => void load(), disabled: loading, children: "Aktualisieren" })] }), _jsxs("div", { className: "rlc-migrated-pages-buro-projektaktefotos-tsx-390", children: [_jsx("button", { type: "button", className: rlcClass(null, primaryButtonStyle), onClick: () => void approveSelected(), disabled: !isInboxDocument || loading, children: "Freigeben" }), _jsx("button", { type: "button", className: rlcClass(null, dangerButtonStyle), onClick: () => void rejectSelected(), disabled: !isInboxDocument || loading, children: "Ablehnen" }), _jsx("span", { className: rlcClass(null, projectLabelStyle), children: "Projekt-ID" }), _jsx("div", { className: rlcClass(null, projectBoxStyle), children: projectKey || "—" })] })] }), error ?
                _jsx("div", { className: rlcClass(null, { ...messageStyle, color: error === "Änderungen gespeichert." ? "#166534" : "#991b1b" }), children: error }) :
                null, _jsxs("section", { className: rlcClass(null, cardStyle), children: [_jsxs("div", { className: rlcClass(null, cardHeaderStyle), children: [_jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, cardTitleStyle), children: "B\u00FCro-Bearbeitung" }), _jsx("div", { className: rlcClass(null, mutedStyle), children: isInboxDocument ?
                                            "Mobile-Dokument laden, prüfen, bearbeiten und in die Projektakte freigeben." :
                                            "Freigegebene Fotodokumentation aus der Projektakte anzeigen." })] }), _jsxs("div", { className: rlcClass(null, mutedStyle), children: [selectedFiles.length, " Datei(en)"] })] }), _jsxs("div", { className: rlcClass(null, sectionBodyStyle), children: [_jsx(SectionTitle, { children: "ALLGEMEINE INFORMATIONEN" }), _jsxs("div", { className: rlcClass(null, generalGridStyle), children: [_jsx(Field, { label: "Datum", children: _jsx("input", { type: "date", value: editor.date, onChange: (event) => updateEditor("date", event.target.value), disabled: !isInboxDocument, className: rlcClass(null, inputStyle) }) }), _jsx(Field, { label: "Mitarbeiter", children: _jsx("input", { value: editor.mitarbeiter, onChange: (event) => updateEditor("mitarbeiter", event.target.value), disabled: !isInboxDocument, className: rlcClass(null, inputStyle) }) }), _jsx(Field, { label: "Bereich / Kostenstelle", children: _jsx("input", { value: editor.kostenstelle, onChange: (event) => updateEditor("kostenstelle", event.target.value), disabled: !isInboxDocument, className: rlcClass(null, inputStyle) }) })] }), _jsx(SectionTitle, { children: "ZUORDNUNG" }), _jsxs("div", { className: rlcClass(null, linksGridStyle), children: [_jsx(Field, { label: "LV-Position", children: _jsx("input", { value: editor.lvItemPos, onChange: (event) => updateEditor("lvItemPos", event.target.value), disabled: !isInboxDocument, placeholder: "z. B. 001.010", className: rlcClass(null, inputStyle) }) }), _jsx(Field, { label: "Regiebericht", children: _jsx("input", { value: editor.regieId, onChange: (event) => updateEditor("regieId", event.target.value), disabled: !isInboxDocument, placeholder: "Regie-ID / Regie-Nr.", className: rlcClass(null, inputStyle) }) }), _jsx(Field, { label: "Lieferschein", children: _jsx("input", { value: editor.lieferscheinId, onChange: (event) => updateEditor("lieferscheinId", event.target.value), disabled: !isInboxDocument, placeholder: "Lieferschein-ID / LS-Nr.", className: rlcClass(null, inputStyle) }) })] }), _jsx(SectionTitle, { children: "BESCHREIBUNG UND DOKUMENTATION" }), _jsxs("div", { className: rlcClass(null, descriptionGridStyle), children: [_jsx(Field, { label: "Beschreibung", children: _jsx("textarea", { value: editor.comment, onChange: (event) => updateEditor("comment", event.target.value), disabled: !isInboxDocument, rows: 5, className: rlcClass(null, textareaStyle) }) }), _jsx(Field, { label: "Bemerkungen", children: _jsx("textarea", { value: editor.bemerkungen, onChange: (event) => updateEditor("bemerkungen", event.target.value), disabled: !isInboxDocument, rows: 5, className: rlcClass(null, textareaStyle) }) })] }), _jsxs("div", { className: rlcClass(null, actionRowStyle), children: [_jsx("input", { ref: fileInputRef, type: "file", accept: "image/*,application/pdf", multiple: true, hidden: true, onChange: (event) => void uploadFiles(event.target.files) }), _jsx("button", { type: "button", className: rlcClass(null, secondaryButtonStyle), onClick: () => fileInputRef.current?.click(), disabled: !isInboxDocument || loading, children: "Dateien hinzuf\u00FCgen" }), _jsx("button", { type: "button", className: rlcClass(null, secondaryButtonStyle), onClick: () => void saveDraft(), disabled: !isInboxDocument || saving, children: saving ? "Speichert …" : "Entwurf speichern" }), _jsx("button", { type: "button", className: rlcClass(null, secondaryButtonStyle), onClick: () => void createPdf(), disabled: !selectedDoc || loading, children: "PDF Vorschau" }), _jsx("button", { type: "button", className: rlcClass(null, secondaryButtonStyle), onClick: () => void exportPdf(), disabled: !selectedDoc || loading, children: "PDF exportieren" })] })] })] }), _jsxs("div", { className: rlcClass(null, contentGridStyle), children: [_jsxs("section", { className: rlcClass(null, cardStyle), children: [_jsxs("div", { className: rlcClass(null, smallCardHeaderStyle), children: [_jsx("h3", { className: rlcClass(null, smallCardTitleStyle), children: "Dokumentvorschau" }), _jsx("span", { className: rlcClass(null, mutedStyle), children: selectedDoc ? documentTitle(selectedDoc) : "Kein Dokument gewählt" })] }), _jsx("div", { className: rlcClass(null, previewAreaStyle), children: pdfUrl ?
                                    _jsx("iframe", { title: "PDF Vorschau", src: pdfUrl, className: rlcClass(null, iframeStyle) }) :
                                    selectedFiles.length ?
                                        _jsx("div", { className: rlcClass(null, photoGridStyle), children: selectedFiles.map((file, index) => _jsxs("a", { href: fileUrl(file), target: "_blank", rel: "noreferrer", className: rlcClass(null, fileCardStyle), children: [isImage(file) ? _jsx("img", { src: fileUrl(file), alt: file.name || `Foto ${index + 1}`, className: rlcClass(null, photoStyle) }) : _jsx("div", { className: rlcClass(null, pdfFileStyle), children: "PDF" }), _jsx("span", { className: rlcClass(null, fileNameStyle), children: file.name || file.file || `Datei ${index + 1}` })] }, `${fileUrl(file)}-${index}`)) }) :
                                        _jsx("div", { className: rlcClass(null, emptyPreviewStyle), children: "Foto-Dokument ausw\u00E4hlen." }) })] }), _jsxs("section", { className: rlcClass(null, cardStyle), children: [_jsxs("div", { className: rlcClass(null, smallCardHeaderStyle), children: [_jsx("h3", { className: rlcClass(null, smallCardTitleStyle), children: tab === "INBOX" ? "Inbox (Eingereicht)" : "Projektakte" }), _jsxs("span", { className: rlcClass(null, mutedStyle), children: [list.length, " Eintrag(e)"] })] }), _jsxs("div", { className: rlcClass(null, listStyle), children: [list.map((doc) => {
                                        const id = String(doc.id || doc.docId || "");
                                        const active = id === selectedId;
                                        return (_jsxs("div", { className: rlcClass(null, {
                                                ...listItemStyle,
                                                ...(active ? activeListItemStyle : {}),
                                                cursor: "default"
                                            }), children: [_jsxs("button", { type: "button", onClick: () => void openDocument(doc, tab), className: "rlc-migrated-pages-buro-projektaktefotos-tsx-391", children: [_jsxs("div", { className: rlcClass(null, listTitleStyle), children: [documentDate(doc), " \u00B7 ", documentTitle(doc)] }), _jsxs("div", { className: rlcClass(null, mutedStyle), children: [doc.kostenstelle || "Keine Kostenstelle", " \u00B7", " ", uniqueFiles(doc).length, " Datei(en)"] })] }), _jsxs("div", { className: "rlc-migrated-pages-buro-projektaktefotos-tsx-392", children: [_jsx("span", { className: rlcClass(null, statusStyle), children: doc.workflowStatus ||
                                                                doc.status || (tab === "INBOX" ?
                                                                "EINGEREICHT" :
                                                                "FREIGEGEBEN") }), _jsx("button", { type: "button", onClick: () => void openDocument(doc, tab), disabled: loading, className: rlcClass(null, {
                                                                border: "1px solid #cbd5e1",
                                                                background: "#ffffff",
                                                                color: "#0f172a",
                                                                borderRadius: 8,
                                                                padding: "6px 11px",
                                                                fontWeight: 700,
                                                                cursor: loading ? "wait" : "pointer"
                                                            }), children: "\u00D6ffnen" })] })] }, id));
                                    }), !list.length ? _jsx("div", { className: rlcClass(null, emptyListStyle), children: "Keine Eintr\u00E4ge vorhanden." }) : null] })] })] })] }));
}
function Field({ label, children }) {
    return (_jsxs("label", { className: "rlc-migrated-pages-buro-projektaktefotos-tsx-393", children: [_jsx("span", { className: rlcClass(null, fieldLabelStyle), children: label }), children] }));
}
function SectionTitle({ children }) {
    return (_jsxs("div", { className: rlcClass(null, sectionTitleRowStyle), children: [_jsx("span", { className: rlcClass(null, sectionTitleStyle), children: children }), _jsx("span", { className: rlcClass(null, sectionLineStyle) })] }));
}
function TabButton({ active, children, onClick }) {
    return (_jsx("button", { type: "button", onClick: onClick, className: rlcClass(null, { ...tabButtonStyle, ...(active ? activeTabButtonStyle : {}) }), children: children }));
}
const pageStyle = { display: "grid", gap: 14, paddingBottom: 28 };
const heroStyle = { background: "linear-gradient(135deg, #0B5BD3 0%, #0B5BD3 48%, #146EF5 100%)", color: "#fff", borderRadius: 22, padding: "18px 22px", boxShadow: "0 14px 34px rgba(15,23,42,0.16)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" };
const heroBadgeStyle = { display: "inline-flex", padding: "5px 10px", borderRadius: 999, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.24)", fontSize: 12, fontWeight: 700, marginBottom: 8 };
const heroTitleStyle = { margin: 0, fontSize: 28, lineHeight: 1.1, fontWeight: 700, letterSpacing: "-0.04em" };
const heroSubtitleStyle = { margin: "7px 0 0", fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.78)" };
const heroButtonStyle = { border: "1px solid rgba(255,255,255,0.42)", background: "rgba(255,255,255,0.08)", color: "#fff", borderRadius: 12, padding: "9px 12px", fontWeight: 700, cursor: "pointer" };
const toolbarStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 14px", border: "1px solid #dbe4f0", borderRadius: 14, background: "white" };
const tabButtonStyle = { border: "1px solid transparent", background: "transparent", borderRadius: 10, padding: "9px 12px", fontWeight: 700, cursor: "pointer", color: "#0f172a" };
const activeTabButtonStyle = { borderColor: "#dbe4f0", background: "#f8fafc" };
const primaryButtonStyle = { border: "1px solid #0b5bd3", background: "#0b5bd3", color: "white", borderRadius: 10, padding: "10px 14px", fontWeight: 700, cursor: "pointer" };
const secondaryButtonStyle = { border: "1px solid #cbd5e1", background: "white", color: "#0f172a", borderRadius: 10, padding: "9px 12px", fontWeight: 700, cursor: "pointer" };
const dangerButtonStyle = { border: "1px solid #fecaca", background: "#fff7f7", color: "#b42318", borderRadius: 10, padding: "10px 14px", fontWeight: 700, cursor: "pointer" };
const projectLabelStyle = { color: "#64748b", fontSize: 12 };
const projectBoxStyle = { minWidth: 210, border: "1px solid #dbe4f0", borderRadius: 10, padding: "10px 12px", background: "white", fontWeight: 700 };
const messageStyle = { padding: "10px 12px", border: "1px solid #dbe4f0", borderRadius: 10, background: "white", fontWeight: 600 };
const cardStyle = { border: "1px solid #dbe4f0", borderRadius: 16, background: "white", overflow: "hidden" };
const cardHeaderStyle = { display: "flex", justifyContent: "space-between", gap: 12, padding: "16px 18px", borderBottom: "1px solid #e2e8f0" };
const cardTitleStyle = { margin: 0, fontSize: 18, fontWeight: 700 };
const mutedStyle = { color: "#64748b", fontSize: 12 };
const sectionBodyStyle = { display: "grid", gap: 16, padding: 18 };
const sectionTitleRowStyle = { display: "flex", alignItems: "center", gap: 10 };
const sectionTitleStyle = { color: "#082b76", fontSize: 12, fontWeight: 700, letterSpacing: ".02em", whiteSpace: "nowrap" };
const sectionLineStyle = { height: 1, background: "#d7e2f1", flex: 1 };
const fieldLabelStyle = { color: "#475569", fontSize: 12, fontWeight: 700 };
const inputStyle = { width: "100%", minWidth: 0, boxSizing: "border-box", border: "1px solid #d5e0ef", borderRadius: 11, padding: "11px 12px", fontSize: 14, background: "white" };
const textareaStyle = { ...inputStyle, resize: "vertical", fontFamily: "inherit", lineHeight: 1.45 };
const generalGridStyle = { display: "grid", gridTemplateColumns: "minmax(150px,.8fr) minmax(220px,1.2fr) minmax(260px,2fr)", gap: 12 };
const linksGridStyle = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 12 };
const descriptionGridStyle = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 14 };
const actionRowStyle = { display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center" };
const contentGridStyle = { display: "grid", gridTemplateColumns: "minmax(0,1.35fr) minmax(360px,.85fr)", gap: 14 };
const smallCardHeaderStyle = { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", padding: "12px 14px", borderBottom: "1px solid #e2e8f0" };
const smallCardTitleStyle = { margin: 0, fontSize: 15, fontWeight: 700 };
const previewAreaStyle = { minHeight: 360, padding: 12, background: "#f8fafc" };
const iframeStyle = { width: "100%", minHeight: 520, border: "1px solid #dbe4f0", borderRadius: 10, background: "white" };
const photoGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px,1fr))", gap: 12 };
const fileCardStyle = { display: "grid", gap: 7, padding: 9, border: "1px solid #dbe4f0", borderRadius: 11, background: "white", textDecoration: "none", color: "#0f172a", minWidth: 0 };
const photoStyle = { width: "100%", height: 170, objectFit: "cover", borderRadius: 8, background: "#e2e8f0" };
const pdfFileStyle = { height: 170, display: "grid", placeItems: "center", borderRadius: 8, background: "#eef2ff", color: "#0b5bd3", fontSize: 28, fontWeight: 700 };
const fileNameStyle = { fontSize: 11, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const emptyPreviewStyle = { minHeight: 330, display: "grid", placeItems: "center", border: "1px dashed #cbd5e1", borderRadius: 12, color: "#64748b" };
const listStyle = { display: "grid", maxHeight: 520, overflow: "auto" };
const listItemStyle = { width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "13px 14px", border: 0, borderBottom: "1px solid #e2e8f0", background: "white", cursor: "pointer" };
const activeListItemStyle = { background: "#eaf2ff", boxShadow: "inset 3px 0 0 #0b5bd3" };
const listTitleStyle = { fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const statusStyle = { padding: "4px 7px", borderRadius: 999, background: "#eef2ff", color: "#1e40af", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" };
const emptyListStyle = { padding: 18, color: "#64748b" };
