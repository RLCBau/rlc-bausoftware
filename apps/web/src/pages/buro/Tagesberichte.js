import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
import React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiUrl } from "../../lib/apiBase";
import { useProject } from "../../store/useProject";
function authHeaders() {
    for (const key of [
        "rlc_token",
        "token",
        "authToken",
        "accessToken",
        "rlc_auth_token"
    ]) {
        const token = localStorage.getItem(key) || sessionStorage.getItem(key);
        if (token?.trim()) {
            return { Authorization: `Bearer ${token.trim()}` };
        }
    }
    return {};
}
async function request(path, init) {
    const response = await fetch(apiUrl(path), {
        credentials: "include",
        ...init,
        headers: {
            Accept: "application/json",
            ...(init?.body ? { "Content-Type": "application/json" } : {}),
            ...authHeaders(),
            ...(init?.headers || {})
        }
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || payload?.error || `HTTP ${response.status}`);
    }
    return payload;
}
function assetUrl(value) {
    const url = String(value || "").trim();
    if (!url)
        return "";
    if (/^(https?:|blob:|data:)/i.test(url))
        return url;
    return apiUrl(url.startsWith("/") ? url : `/${url}`);
}
function itemsOf(payload) {
    for (const value of [
        payload,
        payload?.items,
        payload?.reports,
        payload?.data,
        payload?.data?.items
    ]) {
        if (Array.isArray(value))
            return value;
    }
    return [];
}
function normalizeReport(raw, projectKey) {
    const wrapper = raw || {};
    const firstRow = Array.isArray(wrapper.rows) && wrapper.rows.length ?
        wrapper.rows[0] :
        Array.isArray(wrapper.lines) &&
            wrapper.lines.length === 1 &&
            String(wrapper.lines[0]?.reportType || "").toUpperCase() ===
                "TAGESBERICHT" ?
            wrapper.lines[0] :
            wrapper;
    const report = firstRow || {};
    const sourceDocId = String(wrapper.id ||
        wrapper.docId ||
        wrapper.documentId ||
        report.sourceDocId ||
        report.id ||
        "").trim();
    const id = String(report.id || sourceDocId || crypto.randomUUID()).trim();
    return {
        ...wrapper,
        ...report,
        id,
        sourceDocId,
        projectId: String(report.projectId || wrapper.projectId || projectKey).trim(),
        projectCode: String(report.projectCode ||
            wrapper.projectCode ||
            report.projectId ||
            wrapper.projectId ||
            projectKey).trim(),
        date: String(report.date ||
            report.datum ||
            wrapper.date ||
            wrapper.datum ||
            new Date().toISOString().slice(0, 10)).slice(0, 10),
        weather: String(report.weather ||
            report.wetter ||
            wrapper.weather ||
            wrapper.wetter ||
            ""),
        temperature: String(report.temperature ||
            report.temperatur ||
            wrapper.temperature ||
            wrapper.temperatur ||
            ""),
        workers: String(report.workers ||
            report.mitarbeiter ||
            wrapper.workers ||
            wrapper.mitarbeiter ||
            ""),
        machines: String(report.machines ||
            report.maschinen ||
            wrapper.machines ||
            wrapper.maschinen ||
            ""),
        materials: String(report.materials ||
            report.materialien ||
            report.material ||
            wrapper.materials ||
            wrapper.materialien ||
            wrapper.material ||
            ""),
        workDone: String(report.workDone ||
            report.arbeiten ||
            report.taetigkeit ||
            report.comment ||
            wrapper.workDone ||
            wrapper.arbeiten ||
            wrapper.comment ||
            ""),
        issues: String(report.issues ||
            report.vorkommnisse ||
            wrapper.issues ||
            wrapper.vorkommnisse ||
            ""),
        notes: String(report.notes ||
            report.notizen ||
            wrapper.notes ||
            wrapper.notizen ||
            wrapper.note ||
            ""),
        attachments: Array.isArray(report.attachments) ?
            report.attachments :
            Array.isArray(wrapper.attachments) ?
                wrapper.attachments :
                [],
        pdfUrl: String(report.pdfUrl || wrapper.pdfUrl || ""),
        lines: Array.isArray(report.lines) ?
            report.lines :
            Array.isArray(report.rows) &&
                report.rows.every((line) => String(line?.reportType || "").toUpperCase() !==
                    "TAGESBERICHT") ?
                report.rows :
                [],
        reportType: "TAGESBERICHT",
        workflowStatus: String(report.workflowStatus ||
            wrapper.workflowStatus ||
            wrapper.status ||
            "DRAFT"),
        inBautagebuch: Boolean(report.inBautagebuch || wrapper.inBautagebuch),
        bautagebuchTransferredAt: Number(report.bautagebuchTransferredAt ||
            wrapper.bautagebuchTransferredAt ||
            0) || undefined,
        createdAt: Number(report.createdAt || wrapper.createdAt || Date.now()),
        updatedAt: Number(report.updatedAt || wrapper.updatedAt || Date.now())
    };
}
function emptyReport(projectKey) {
    return {
        id: crypto.randomUUID(),
        sourceDocId: "",
        projectId: projectKey,
        projectCode: projectKey,
        date: new Date().toISOString().slice(0, 10),
        weather: "",
        temperature: "",
        workers: "",
        machines: "",
        materials: "",
        workDone: "",
        issues: "",
        notes: "",
        attachments: [],
        lines: [],
        reportType: "TAGESBERICHT",
        workflowStatus: "DRAFT",
        inBautagebuch: false,
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
}
function reportHours(report) {
    return (report.lines || []).reduce((sum, line) => sum + Number(line.stunden || 0), 0);
}
export default function Tagesberichte() {
    const navigate = useNavigate();
    const { getSelectedProject } = useProject();
    const project = getSelectedProject();
    const projectKey = String(project?.code || project?.id || "").trim();
    const [params] = useSearchParams();
    const routeDocId = String(params.get("docId") || "").trim();
    const [items, setItems] = React.useState([]);
    const [selected, setSelected] = React.useState(null);
    const [savedSummary, setSavedSummary] = React.useState(null);
    const [month, setMonth] = React.useState(new Date().toISOString().slice(0, 7));
    const [search, setSearch] = React.useState("");
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState("");
    const [pdfUrl, setPdfUrl] = React.useState("");
    const [pdfLoading, setPdfLoading] = React.useState(false);
    const load = React.useCallback(async () => {
        if (!projectKey)
            return;
        setLoading(true);
        setError("");
        try {
            const responses = await Promise.all([
                request(`/api/regie/inbox/list?projectId=${encodeURIComponent(projectKey)}`).catch(() => ({ items: [] })),
                request(`/api/regie/freigegeben/list?projectId=${encodeURIComponent(projectKey)}`).catch(() => ({ items: [] })),
                request(`/api/regie/final/list?projectId=${encodeURIComponent(projectKey)}`).catch(() => ({ items: [] })),
                request(`/api/tagesbericht/inbox/list?projectId=${encodeURIComponent(projectKey)}`).catch(() => ({ items: [] }))
            ]);
            const normalized = responses.
                flatMap(itemsOf).
                filter((item) => {
                const first = Array.isArray(item?.rows) && item.rows.length ?
                    item.rows[0] :
                    item;
                return (String(first?.reportType ||
                    item?.reportType ||
                    first?.type ||
                    item?.type ||
                    "").toUpperCase() === "TAGESBERICHT");
            }).
                map((item) => normalizeReport(item, projectKey));
            const unique = Array.from(new Map(normalized.map((item) => [
                item.sourceDocId || item.id,
                item
            ])).values()).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
            setItems(unique);
            if (routeDocId) {
                const key = `rlc:mobile-workflow:${projectKey}:TAGESBERICHT:${routeDocId}`;
                const raw = sessionStorage.getItem(key);
                if (raw) {
                    setSelected(normalizeReport(JSON.parse(raw), projectKey));
                }
                else {
                    setSelected(unique.find((item) => item.id === routeDocId ||
                        item.sourceDocId === routeDocId) || null);
                }
            }
            else {
                setSelected((current) => {
                    if (!current)
                        return current;
                    return (unique.find((item) => item.id === current.id ||
                        item.sourceDocId === current.sourceDocId) || current);
                });
            }
        }
        catch (e) {
            setError(e?.message || "Tagesberichte konnten nicht geladen werden.");
        }
        finally {
            setLoading(false);
        }
    }, [projectKey, routeDocId]);
    React.useEffect(() => {
        void load();
    }, [load]);
    React.useEffect(() => {
        setPdfUrl(assetUrl(selected?.pdfUrl || ""));
    }, [selected?.id, selected?.pdfUrl]);
    const filtered = React.useMemo(() => {
        const q = search.trim().toLowerCase();
        return items.filter((item) => {
            if (month && !String(item.date || "").startsWith(month)) {
                return false;
            }
            if (!q)
                return true;
            return [
                item.date,
                item.weather,
                item.temperature,
                item.workers,
                item.machines,
                item.materials,
                item.workDone,
                item.issues,
                item.notes,
                ...(item.lines || []).flatMap((line) => [
                    line.mitarbeiter,
                    line.maschine,
                    line.ort,
                    line.taetigkeit,
                    line.notiz
                ])
            ].
                join(" ").
                toLowerCase().
                includes(q);
        });
    }, [items, month, search]);
    function update(key, value) {
        setSelected((current) => current ?
            { ...current, [key]: value, updatedAt: Date.now() } :
            current);
    }
    function addLine() {
        setSelected((current) => current ?
            {
                ...current,
                lines: [
                    ...(current.lines || []),
                    {
                        id: crypto.randomUUID(),
                        von: "",
                        bis: "",
                        pauseMin: 0,
                        stunden: 0,
                        mitarbeiter: "",
                        maschine: "",
                        ort: "",
                        taetigkeit: "",
                        notiz: ""
                    }
                ]
            } :
            current);
    }
    function updateLine(id, key, value) {
        setSelected((current) => current ?
            {
                ...current,
                lines: (current.lines || []).map((line) => line.id === id ? { ...line, [key]: value } : line),
                updatedAt: Date.now()
            } :
            current);
    }
    async function save(options) {
        if (!selected || !projectKey)
            return null;
        setLoading(true);
        setError("");
        const transfer = Boolean(options?.transferToBautagebuch);
        const now = Date.now();
        const nextReport = {
            ...selected,
            projectId: projectKey,
            projectCode: projectKey,
            reportType: "TAGESBERICHT",
            inBautagebuch: transfer || selected.inBautagebuch,
            bautagebuchTransferredAt: transfer ?
                now :
                selected.bautagebuchTransferredAt,
            updatedAt: now
        };
        try {
            const snapshot = {
                id: nextReport.sourceDocId || nextReport.id,
                docId: nextReport.sourceDocId || nextReport.id,
                projectId: projectKey,
                projectCode: projectKey,
                date: nextReport.date,
                note: nextReport.notes || "",
                reportType: "TAGESBERICHT",
                workflowStatus: nextReport.workflowStatus || "DRAFT",
                inBautagebuch: nextReport.inBautagebuch,
                bautagebuchTransferredAt: nextReport.bautagebuchTransferredAt,
                rows: [nextReport]
            };
            const payload = await request("/api/ki/regie/commit/regiebericht", {
                method: "POST",
                body: JSON.stringify(snapshot)
            });
            const returned = payload?.snapshot ||
                payload?.item ||
                payload?.report ||
                payload?.data ||
                nextReport;
            const saved = normalizeReport(returned, projectKey);
            const finalSaved = {
                ...nextReport,
                ...saved,
                id: saved.id || nextReport.id,
                sourceDocId: saved.sourceDocId ||
                    nextReport.sourceDocId ||
                    nextReport.id,
                inBautagebuch: transfer ||
                    saved.inBautagebuch ||
                    nextReport.inBautagebuch,
                bautagebuchTransferredAt: transfer ?
                    now :
                    saved.bautagebuchTransferredAt ||
                        nextReport.bautagebuchTransferredAt
            };
            setSelected(finalSaved);
            setSavedSummary(finalSaved);
            setItems((current) => {
                const identity = finalSaved.sourceDocId || finalSaved.id;
                const withoutCurrent = current.filter((item) => (item.sourceDocId || item.id) !== identity &&
                    item.id !== finalSaved.id);
                return [finalSaved, ...withoutCurrent].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
            });
            if (transfer) {
                navigate(`/buro/bautagebuch?docId=${encodeURIComponent(finalSaved.sourceDocId || finalSaved.id)}&source=tagesbericht`);
            }
            return finalSaved;
        }
        catch (e) {
            setError(e?.message || "Speichern fehlgeschlagen.");
            return null;
        }
        finally {
            setLoading(false);
        }
    }
    function pdfPayload(report) {
        return {
            ...report,
            projectId: projectKey,
            projectCode: projectKey,
            reportType: "TAGESBERICHT",
            attachments: report.attachments || [],
            lines: report.lines || []
        };
    }
    async function createPdf() {
        if (!selected || !projectKey) {
            throw new Error("Kein Tagesbericht ausgewählt.");
        }
        setPdfLoading(true);
        setError("");
        try {
            const result = await request("/api/tagesbericht/preview", {
                method: "POST",
                body: JSON.stringify(pdfPayload(selected))
            });
            const nextUrl = assetUrl(result?.pdfUrl || result?.url || "");
            if (!nextUrl) {
                throw new Error("PDF-URL fehlt in der Serverantwort.");
            }
            setPdfUrl(nextUrl);
            return nextUrl;
        }
        catch (e) {
            setError(e?.message || "PDF Vorschau fehlgeschlagen.");
            throw e;
        }
        finally {
            setPdfLoading(false);
        }
    }
    async function exportPdf() {
        try {
            const url = await createPdf();
            const link = document.createElement("a");
            link.href = url;
            link.download = `Tagesbericht_${selected?.date || "Export"}.pdf`;
            link.target = "_blank";
            link.rel = "noreferrer";
            document.body.appendChild(link);
            link.click();
            link.remove();
        }
        catch {
            // Fehler wird in createPdf angezeigt.
        }
    }
    async function approve() {
        if (!selected)
            return;
        await request("/api/regie/inbox/approve", {
            method: "POST",
            body: JSON.stringify({
                projectId: projectKey,
                docId: selected.sourceDocId || selected.id,
                reportType: "TAGESBERICHT"
            })
        });
        window.location.assign("/mobile/pruefung/TAGESBERICHT");
    }
    const totalHours = filtered.reduce((sum, item) => sum + reportHours(item), 0);
    return (_jsxs("div", { className: "rlc-migrated-pages-buro-tagesberichte-tsx-394", children: [_jsx(ModuleHero, { title: "Tagesberichte", subtitle: "Mobile-Pr\u00FCfung, Bearbeitung und \u00DCbergabe in das Bautagebuch in einem durchg\u00E4ngigen Workflow." }), _jsx("div", { className: "rlc-migrated-pages-buro-tagesberichte-tsx-395", children: _jsxs("div", { className: "rlc-migrated-pages-buro-tagesberichte-tsx-398", children: [_jsx("button", { className: "btn", onClick: () => {
                                setSelected(emptyReport(projectKey));
                                setSavedSummary(null);
                                setPdfUrl("");
                            }, children: "+ Neuer Tagesbericht" }), _jsx(Link, { className: "btn", to: "/buro/bautagebuch", children: "Bautagebuch \u00F6ffnen" }), _jsx("button", { className: "btn", onClick: () => void load(), disabled: loading, children: "Aktualisieren" })] }) }), error ?
                _jsx("div", { className: "rlc-migrated-pages-buro-tagesberichte-tsx-399", children: error }) :
                null, _jsxs("div", { className: "rlc-migrated-pages-buro-tagesberichte-tsx-400", children: [_jsx(Stat, { label: "Eintr\u00E4ge", value: filtered.length }), _jsx(Stat, { label: "Gesamtstunden", value: totalHours.toLocaleString("de-DE") }), _jsx(Stat, { label: "Vorkommnisse", value: filtered.filter((item) => item.issues?.trim()).length })] }), _jsxs("div", { className: "rlc-migrated-pages-buro-tagesberichte-tsx-401", children: [_jsx(FilterField, { label: "Monat", children: _jsx("input", { value: month, onChange: (e) => setMonth(e.target.value), placeholder: "YYYY-MM" }) }), _jsx(FilterField, { label: "Suche", children: _jsx("input", { value: search, onChange: (e) => setSearch(e.target.value), placeholder: "Wetter, T\u00E4tigkeit, Mitarbeiter \u2026" }) })] }), _jsxs("div", { className: rlcClass(null, {
                    display: "grid",
                    gridTemplateColumns: selected ?
                        "360px minmax(0,1fr)" :
                        "1fr",
                    gap: 14,
                    alignItems: "start"
                }), children: [_jsxs("div", { className: "rlc-migrated-pages-buro-tagesberichte-tsx-402", children: [filtered.map((item) => _jsxs("button", { type: "button", onClick: () => {
                                    setSelected(item);
                                    setSavedSummary(null);
                                    setPdfUrl(assetUrl(item.pdfUrl || ""));
                                }, className: rlcClass(null, {
                                    textAlign: "left",
                                    padding: 14,
                                    border: "1px solid #dbe4f0",
                                    borderRadius: 14,
                                    background: selected?.id === item.id ?
                                        "#eaf2ff" :
                                        "#fff",
                                    cursor: "pointer"
                                }), children: [_jsx("strong", { children: item.date }), _jsx("div", { className: "rlc-migrated-pages-buro-tagesberichte-tsx-403", children: item.workDone ||
                                            item.notes ||
                                            "Kein Beschreibungstext" }), _jsxs("div", { className: "rlc-migrated-pages-buro-tagesberichte-tsx-404", children: ["Wetter: ", item.weather || "—", " \u00B7 Zeilen:", " ", (item.lines || []).length, " \u00B7 Stunden:", " ", reportHours(item).toLocaleString("de-DE")] })] }, item.sourceDocId || item.id)), !filtered.length ?
                                _jsx("div", { className: "rlc-migrated-pages-buro-tagesberichte-tsx-405", children: "Keine Tagesberichte gefunden." }) :
                                null] }), selected ?
                        _jsxs("div", { className: "rlc-migrated-pages-buro-tagesberichte-tsx-406", children: [_jsx("h2", { className: "rlc-migrated-pages-buro-tagesberichte-tsx-407", children: "Tagesbericht bearbeiten" }), _jsxs("div", { className: rlcClass(null, formGrid), children: [_jsx(Field, { label: "Datum", children: _jsx("input", { type: "date", value: selected.date, onChange: (e) => update("date", e.target.value) }) }), _jsx(Field, { label: "Wetter", children: _jsx("input", { value: selected.weather || "", onChange: (e) => update("weather", e.target.value) }) }), _jsx(Field, { label: "Temperatur", children: _jsx("input", { value: selected.temperature || "", onChange: (e) => update("temperature", e.target.value) }) }), _jsx(Field, { label: "Mitarbeiter", children: _jsx("input", { value: selected.workers || "", onChange: (e) => update("workers", e.target.value) }) }), _jsx(Field, { label: "Maschinen", children: _jsx("input", { value: selected.machines || "", onChange: (e) => update("machines", e.target.value) }) }), _jsx(Field, { label: "Materialien", children: _jsx("input", { value: selected.materials || "", onChange: (e) => update("materials", e.target.value) }) }), _jsx(Field, { label: "Ausgef\u00FChrte Arbeiten", full: true, children: _jsx("textarea", { value: selected.workDone || "", onChange: (e) => update("workDone", e.target.value) }) }), _jsx(Field, { label: "Vorkommnisse / Behinderungen", full: true, children: _jsx("textarea", { value: selected.issues || "", onChange: (e) => update("issues", e.target.value) }) }), _jsx(Field, { label: "Notizen", full: true, children: _jsx("textarea", { value: selected.notes || "", onChange: (e) => update("notes", e.target.value) }) })] }), _jsxs("div", { className: "rlc-migrated-pages-buro-tagesberichte-tsx-408", children: [_jsx("h3", { className: "rlc-migrated-pages-buro-tagesberichte-tsx-409", children: "Tageszeilen" }), _jsx("button", { className: "btn", onClick: addLine, children: "+ Zeile" })] }), _jsx("div", { className: "rlc-migrated-pages-buro-tagesberichte-tsx-410", children: (selected.lines || []).map((line) => _jsxs("div", { className: "rlc-migrated-pages-buro-tagesberichte-tsx-411", children: [_jsx("input", { placeholder: "Von", value: line.von || "", onChange: (e) => updateLine(line.id, "von", e.target.value) }), _jsx("input", { placeholder: "Bis", value: line.bis || "", onChange: (e) => updateLine(line.id, "bis", e.target.value) }), _jsx("input", { type: "number", placeholder: "Std.", value: line.stunden || 0, onChange: (e) => updateLine(line.id, "stunden", Number(e.target.value)) }), _jsx("input", { placeholder: "Ort", value: line.ort || "", onChange: (e) => updateLine(line.id, "ort", e.target.value) }), _jsx("input", { placeholder: "Mitarbeiter", value: line.mitarbeiter || "", onChange: (e) => updateLine(line.id, "mitarbeiter", e.target.value) }), _jsx("input", { placeholder: "Maschine", value: line.maschine || "", onChange: (e) => updateLine(line.id, "maschine", e.target.value) }), _jsx("input", { placeholder: "T\u00E4tigkeit", value: line.taetigkeit || "", onChange: (e) => updateLine(line.id, "taetigkeit", e.target.value) })] }, line.id)) }), _jsxs("div", { className: "rlc-migrated-pages-buro-tagesberichte-tsx-412", children: [_jsx("button", { className: "btn", onClick: () => void createPdf(), disabled: loading || pdfLoading, children: "PDF Vorschau" }), _jsx("button", { className: "btn", onClick: () => void exportPdf(), disabled: loading || pdfLoading, children: "PDF exportieren" }), _jsx("button", { className: "btn", onClick: () => {
                                                setSelected(null);
                                                setPdfUrl("");
                                            }, children: "Schlie\u00DFen" }), _jsx("button", { className: "btn", onClick: () => void save(), disabled: loading, children: "Entwurf speichern" }), _jsx("button", { className: "btn rlc-migrated-pages-buro-tagesberichte-tsx-413", onClick: () => void save({
                                                transferToBautagebuch: true
                                            }), disabled: loading, children: "In Bautagebuch \u00FCbernehmen" }), params.get("source") === "mobile" ?
                                            _jsx("button", { className: "btn rlc-migrated-pages-buro-tagesberichte-tsx-414", onClick: () => void approve(), disabled: loading, children: "Gepr\u00FCft und freigeben" }) :
                                            null] }), savedSummary ?
                                    _jsx(SavedSummary, { report: savedSummary }) :
                                    null] }) :
                        null] }), selected ?
                _jsx(PdfPreviewPanel, { url: pdfUrl, loading: pdfLoading, onCreate: () => void createPdf() }) :
                null] }));
}
function FilterField({ label, children }) {
    return (_jsxs("label", { className: "rlc-migrated-pages-buro-tagesberichte-tsx-415", children: [_jsx("span", { children: label }), _jsx("div", { className: "rlc-migrated-pages-buro-tagesberichte-tsx-416", children: React.Children.map(children, (child) => React.isValidElement(child) ?
                    React.cloneElement(child, {
                        style: {
                            width: "100%",
                            minWidth: 0,
                            boxSizing: "border-box",
                            ...(child.props.style || {})
                        }
                    }) :
                    child) })] }));
}
function PdfPreviewPanel({ url, loading, onCreate }) {
    return (_jsxs("section", { className: "rlc-migrated-pages-buro-tagesberichte-tsx-417", children: [_jsxs("div", { className: "rlc-migrated-pages-buro-tagesberichte-tsx-418", children: [_jsxs("div", { children: [_jsx("div", { className: "rlc-migrated-pages-buro-tagesberichte-tsx-419", children: "PDF Vorschau" }), _jsx("div", { className: "rlc-migrated-pages-buro-tagesberichte-tsx-420", children: "Einheitlicher RLC PDF Core mit Firmenlogo und Firmendaten." })] }), !url ?
                        _jsx("button", { className: "btn", onClick: onCreate, disabled: loading, children: loading ? "PDF wird erstellt …" : "PDF Vorschau erstellen" }) :
                        null] }), url ?
                _jsx("iframe", { title: "Tagesbericht PDF Vorschau", src: url, className: "rlc-migrated-pages-buro-tagesberichte-tsx-421" }) :
                _jsx("div", { className: "rlc-migrated-pages-buro-tagesberichte-tsx-422", children: "Noch keine PDF Vorschau erstellt." })] }));
}
function ModuleHero({ title, subtitle }) {
    return (_jsxs("section", { className: "rlc-page-hero", children: [_jsx("div", { className: "rlc-page-hero__eyebrow", children: "Verwaltung \u00B7 Bauausf\u00FChrung" }), _jsx("h1", { className: "rlc-migrated-pages-buro-tagesberichte-tsx-425", children: title }), _jsx("p", { children: subtitle })] }));
}
function SavedSummary({ report }) {
    return (_jsxs("section", { className: "rlc-migrated-pages-buro-tagesberichte-tsx-427", children: [_jsxs("div", { className: "rlc-migrated-pages-buro-tagesberichte-tsx-428", children: [_jsxs("div", { children: [_jsx("div", { className: "rlc-migrated-pages-buro-tagesberichte-tsx-429", children: "Gespeicherte Zusammenfassung" }), _jsxs("h3", { className: "rlc-migrated-pages-buro-tagesberichte-tsx-430", children: ["Tagesbericht ", report.date] })] }), report.inBautagebuch ?
                        _jsx("span", { className: "rlc-migrated-pages-buro-tagesberichte-tsx-431", children: "Im Bautagebuch" }) :
                        null] }), _jsxs("div", { className: "rlc-migrated-pages-buro-tagesberichte-tsx-432", children: [_jsx(SummaryValue, { label: "Wetter", value: report.weather }), _jsx(SummaryValue, { label: "Temperatur", value: report.temperature }), _jsx(SummaryValue, { label: "Mitarbeiter", value: report.workers }), _jsx(SummaryValue, { label: "Stunden", value: reportHours(report).toLocaleString("de-DE") }), _jsx(SummaryValue, { label: "Maschinen", value: report.machines }), _jsx(SummaryValue, { label: "Materialien", value: report.materials }), _jsx(SummaryValue, { label: "Tageszeilen", value: (report.lines || []).length }), _jsx(SummaryValue, { label: "Anh\u00E4nge", value: (report.attachments || []).length })] }), _jsx(SummaryValue, { label: "Ausgef\u00FChrte Arbeiten", value: report.workDone }), _jsx(SummaryValue, { label: "Vorkommnisse", value: report.issues }), _jsx(SummaryValue, { label: "Notizen", value: report.notes })] }));
}
function SummaryValue({ label, value }) {
    return (_jsxs("div", { className: "rlc-migrated-pages-buro-tagesberichte-tsx-433", children: [_jsx("div", { className: "rlc-migrated-pages-buro-tagesberichte-tsx-434", children: label }), _jsx("div", { className: "rlc-migrated-pages-buro-tagesberichte-tsx-435", children: value == null || value === "" ? "—" : value })] }));
}
const formGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(2,minmax(0,1fr))",
    gap: 10
};
function Field({ label, full, children }) {
    return (_jsxs("label", { className: rlcClass(null, {
            display: "grid",
            gap: 5,
            gridColumn: full ? "1 / -1" : undefined,
            color: "#475569",
            fontSize: 12,
            fontWeight: 700,
            minWidth: 0
        }), children: [label, children] }));
}
function Stat({ label, value }) {
    return (_jsxs("div", { className: "rlc-migrated-pages-buro-tagesberichte-tsx-436", children: [_jsx("div", { className: "rlc-migrated-pages-buro-tagesberichte-tsx-437", children: value }), _jsx("div", { className: "rlc-migrated-pages-buro-tagesberichte-tsx-438", children: label })] }));
}
