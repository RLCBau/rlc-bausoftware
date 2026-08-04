import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
import React from "react";
import { Link, useSearchParams } from "react-router-dom";
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
    const report = Array.isArray(wrapper.rows) && wrapper.rows.length ?
        wrapper.rows[0] :
        wrapper;
    const sourceDocId = String(wrapper.id ||
        wrapper.docId ||
        report.sourceDocId ||
        report.id ||
        "").trim();
    return {
        ...wrapper,
        ...report,
        id: String(report.id || sourceDocId).trim(),
        sourceDocId,
        projectId: String(report.projectId || wrapper.projectId || projectKey).trim(),
        projectCode: String(report.projectCode ||
            wrapper.projectCode ||
            projectKey).trim(),
        date: String(report.date ||
            report.datum ||
            wrapper.date ||
            wrapper.datum ||
            "").slice(0, 10),
        weather: report.weather ||
            report.wetter ||
            wrapper.weather ||
            wrapper.wetter ||
            "",
        temperature: report.temperature ||
            report.temperatur ||
            wrapper.temperature ||
            wrapper.temperatur ||
            "",
        workers: report.workers ||
            report.mitarbeiter ||
            wrapper.workers ||
            wrapper.mitarbeiter ||
            "",
        machines: report.machines ||
            report.maschinen ||
            wrapper.machines ||
            wrapper.maschinen ||
            "",
        materials: report.materials ||
            report.materialien ||
            report.material ||
            wrapper.materials ||
            wrapper.materialien ||
            wrapper.material ||
            "",
        workDone: report.workDone ||
            report.arbeiten ||
            report.taetigkeit ||
            report.comment ||
            wrapper.workDone ||
            wrapper.arbeiten ||
            wrapper.comment ||
            "",
        issues: report.issues ||
            report.vorkommnisse ||
            wrapper.issues ||
            wrapper.vorkommnisse ||
            "",
        notes: report.notes ||
            report.notizen ||
            wrapper.notes ||
            wrapper.notizen ||
            wrapper.note ||
            "",
        attachments: Array.isArray(report.attachments) ?
            report.attachments :
            Array.isArray(wrapper.attachments) ?
                wrapper.attachments :
                [],
        lines: Array.isArray(report.lines) ?
            report.lines :
            Array.isArray(report.rows) &&
                report.rows.every((line) => String(line?.reportType || "").toUpperCase() !==
                    "TAGESBERICHT") ?
                report.rows :
                [],
        reportType: "TAGESBERICHT",
        workflowStatus: report.workflowStatus ||
            wrapper.workflowStatus ||
            wrapper.status ||
            "",
        inBautagebuch: Boolean(report.inBautagebuch || wrapper.inBautagebuch)
    };
}
function hoursOf(item) {
    return (Array.isArray(item.lines) ? item.lines : []).reduce((sum, line) => sum + Number(line.stunden || line.hours || 0), 0);
}
function groupByDate(items) {
    const groups = new Map();
    for (const item of items) {
        const date = String(item.date || item.datum || "Ohne Datum").slice(0, 10);
        const current = groups.get(date) || [];
        current.push(item);
        groups.set(date, current);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => b.localeCompare(a));
}
export default function Bautagebuch() {
    const { getSelectedProject } = useProject();
    const project = getSelectedProject();
    const projectKey = String(project?.code || project?.id || "").trim();
    const [params] = useSearchParams();
    const routeDocId = String(params.get("docId") || "").trim();
    const [items, setItems] = React.useState([]);
    const [openDates, setOpenDates] = React.useState(new Set());
    const [month, setMonth] = React.useState(new Date().toISOString().slice(0, 7));
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState("");
    const [bookPdfUrl, setBookPdfUrl] = React.useState("");
    const [bookPdfLoading, setBookPdfLoading] = React.useState(false);
    const load = React.useCallback(async () => {
        if (!projectKey)
            return;
        setLoading(true);
        setError("");
        try {
            const responses = await Promise.all([
                request(`/api/regie/inbox/list?projectId=${encodeURIComponent(projectKey)}`),
                request(`/api/regie/freigegeben/list?projectId=${encodeURIComponent(projectKey)}`),
                request(`/api/regie/final/list?projectId=${encodeURIComponent(projectKey)}`),
                request(`/api/tagesbericht/inbox/list?projectId=${encodeURIComponent(projectKey)}`)
            ]);
            const all = responses.
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
            const unique = Array.from(new Map(all.map((item) => [
                item.sourceDocId || item.id,
                item
            ])).values()).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
            setItems(unique);
            if (routeDocId) {
                const target = unique.find((item) => item.id === routeDocId ||
                    item.sourceDocId === routeDocId) || null;
                const targetDate = String(target?.date || "").slice(0, 10);
                if (targetDate) {
                    setMonth(targetDate.slice(0, 7));
                    setOpenDates((current) => {
                        const next = new Set(current);
                        next.add(targetDate);
                        return next;
                    });
                }
            }
        }
        catch (e) {
            setError(e?.message ||
                "Bautagebuch konnte nicht geladen werden.");
        }
        finally {
            setLoading(false);
        }
    }, [projectKey, routeDocId]);
    React.useEffect(() => {
        void load();
    }, [load]);
    const filtered = items.filter((item) => !month ||
        String(item.date || item.datum || "").startsWith(month));
    const totalHours = filtered.reduce((sum, item) => sum + hoursOf(item), 0);
    const grouped = groupByDate(filtered);
    async function createBookPdf() {
        if (!projectKey) {
            throw new Error("Kein Projekt ausgewählt.");
        }
        if (!filtered.length) {
            throw new Error("Im gewählten Zeitraum sind keine Tagesberichte vorhanden.");
        }
        setBookPdfLoading(true);
        setError("");
        try {
            const result = await request("/api/tagesbericht/bautagebuch/preview", {
                method: "POST",
                body: JSON.stringify({
                    projectId: projectKey,
                    projectCode: projectKey,
                    projectName: String(project?.name || projectKey),
                    month,
                    reports: filtered.map((report) => ({
                        ...report,
                        projectId: projectKey,
                        projectCode: projectKey,
                        reportType: "TAGESBERICHT",
                        attachments: report.attachments || [],
                        lines: report.lines || []
                    }))
                })
            });
            const nextUrl = assetUrl(result?.pdfUrl || result?.url || "");
            if (!nextUrl) {
                throw new Error("PDF-URL fehlt in der Serverantwort.");
            }
            setBookPdfUrl(nextUrl);
            return nextUrl;
        }
        catch (e) {
            setError(e?.message ||
                "Bautagebuch-PDF Vorschau fehlgeschlagen.");
            throw e;
        }
        finally {
            setBookPdfLoading(false);
        }
    }
    async function exportBookPdf() {
        try {
            const url = await createBookPdf();
            const link = document.createElement("a");
            link.href = url;
            link.download = `Bautagebuch_${projectKey}_${month || "Gesamt"}.pdf`;
            link.target = "_blank";
            link.rel = "noreferrer";
            document.body.appendChild(link);
            link.click();
            link.remove();
        }
        catch {
            // Fehler wird in createBookPdf angezeigt.
        }
    }
    function toggleDate(date) {
        setOpenDates((current) => {
            const next = new Set(current);
            if (next.has(date))
                next.delete(date);
            else
                next.add(date);
            return next;
        });
    }
    function reportLink(item, mode) {
        const docId = String(item.sourceDocId || item.id || "").trim();
        const query = new URLSearchParams({
            projectId: projectKey,
            docId,
            source: "bautagebuch",
            mode
        });
        return `/buro/tagesberichte?${query.toString()}`;
    }
    return (_jsxs("div", { className: "rlc-migrated-pages-buro-bautagebuch-tsx-317", children: [_jsx(ModuleHero, { title: "Bautagebuch", subtitle: "Tagesberichte chronologisch b\u00FCndeln und immer im zentralen Tagesbericht-Modul \u00F6ffnen." }), _jsx("div", { className: "rlc-migrated-pages-buro-bautagebuch-tsx-318", children: _jsxs("div", { className: "rlc-migrated-pages-buro-bautagebuch-tsx-321", children: [_jsx("button", { className: "btn", onClick: () => void createBookPdf(), disabled: bookPdfLoading || !filtered.length, children: "PDF Vorschau Bautagebuch" }), _jsx("button", { className: "btn", onClick: () => void exportBookPdf(), disabled: bookPdfLoading || !filtered.length, children: "PDF Bautagebuch exportieren" }), _jsx(Link, { className: "btn", to: `/buro/tagesberichte?projectId=${encodeURIComponent(projectKey)}`, children: "Tagesberichte \u00F6ffnen" }), _jsx("button", { className: "btn", onClick: () => void load(), disabled: loading, children: "Aktualisieren" })] }) }), error ?
                _jsx("div", { className: "rlc-migrated-pages-buro-bautagebuch-tsx-322", children: error }) :
                null, _jsxs("div", { className: "rlc-migrated-pages-buro-bautagebuch-tsx-323", children: [_jsx(Stat, { label: "Tagesberichte", value: filtered.length }), _jsx(Stat, { label: "Gesamtstunden", value: totalHours.toLocaleString("de-DE") }), _jsx(Stat, { label: "Vorkommnisse", value: filtered.filter((item) => String(item.issues || "").trim()).length }), _jsx(Stat, { label: "Maschinen im Einsatz", value: filtered.filter((item) => String(item.machines || "").trim() ||
                            (item.lines || []).some((line) => String(line.maschine || line.machine || "").trim())).length })] }), _jsxs("label", { className: "rlc-migrated-pages-buro-bautagebuch-tsx-324", children: ["Monat", _jsx("input", { value: month, onChange: (e) => {
                            setMonth(e.target.value);
                            setBookPdfUrl("");
                        }, placeholder: "YYYY-MM" })] }), _jsx(BookPdfPreviewPanel, { url: bookPdfUrl, loading: bookPdfLoading, reportCount: filtered.length, period: month || "Gesamter Zeitraum" }), _jsxs("div", { className: "rlc-migrated-pages-buro-bautagebuch-tsx-325", children: [grouped.map(([date, reports]) => {
                        const isOpen = openDates.has(date);
                        return (_jsxs("section", { className: "rlc-migrated-pages-buro-bautagebuch-tsx-326", children: [_jsxs("button", { type: "button", onClick: () => toggleDate(date), className: "rlc-migrated-pages-buro-bautagebuch-tsx-327", children: [_jsxs("div", { children: [_jsx("div", { className: "rlc-migrated-pages-buro-bautagebuch-tsx-328", children: date }), _jsxs("div", { className: "rlc-migrated-pages-buro-bautagebuch-tsx-329", children: [reports.length, " Tagesbericht(e) \u00B7", " ", reports.
                                                            reduce((sum, report) => sum + hoursOf(report), 0).
                                                            toLocaleString("de-DE"), " ", "Std."] })] }), _jsx("span", { className: "rlc-migrated-pages-buro-bautagebuch-tsx-330", children: isOpen ? "▼" : "▶" })] }), isOpen ?
                                    _jsx("div", { className: "rlc-migrated-pages-buro-bautagebuch-tsx-331", children: reports.map((item, index) => _jsxs("article", { className: "rlc-migrated-pages-buro-bautagebuch-tsx-332", children: [_jsxs("div", { className: "rlc-migrated-pages-buro-bautagebuch-tsx-333", children: [_jsxs("div", { className: "rlc-migrated-pages-buro-bautagebuch-tsx-334", children: [_jsxs("strong", { children: ["Tagesbericht ", index + 1] }), item.inBautagebuch ?
                                                                    _jsx("span", { className: "rlc-migrated-pages-buro-bautagebuch-tsx-335", children: "\u00DCBERNOMMEN" }) :
                                                                    null] }), _jsx("div", { className: "rlc-migrated-pages-buro-bautagebuch-tsx-336", children: item.workDone ||
                                                                item.title ||
                                                                item.comment ||
                                                                "Tagesbericht" }), _jsxs("div", { className: "rlc-migrated-pages-buro-bautagebuch-tsx-337", children: [_jsx(CompactDetail, { label: "Wetter", value: item.weather }), _jsx(CompactDetail, { label: "Mitarbeiter", value: item.workers }), _jsx(CompactDetail, { label: "Stunden", value: hoursOf(item).toLocaleString("de-DE") }), _jsx(CompactDetail, { label: "Maschinen", value: item.machines }), _jsx(CompactDetail, { label: "Materialien", value: item.materials }), _jsx(CompactDetail, { label: "Fotos / Anh\u00E4nge", value: Array.isArray(item.attachments) ?
                                                                        item.attachments.length :
                                                                        0 })] }), item.notes ?
                                                            _jsx(CompactDetail, { label: "Notizen", value: item.notes }) :
                                                            null] }), _jsxs("div", { className: "rlc-migrated-pages-buro-bautagebuch-tsx-338", children: [_jsx(Link, { className: "btn", to: reportLink(item, "view"), children: "\u00D6ffnen" }), _jsx(Link, { className: "btn", to: reportLink(item, "edit"), children: "Bearbeiten" })] })] }, item.sourceDocId || item.id)) }) :
                                    null] }, date));
                    }), !grouped.length ?
                        _jsx("div", { className: "rlc-migrated-pages-buro-bautagebuch-tsx-339", children: "Keine Tagesberichte im gew\u00E4hlten Monat." }) :
                        null] })] }));
}
function BookPdfPreviewPanel({ url, loading, reportCount, period }) {
    if (!url && !loading)
        return null;
    return (_jsxs("section", { className: "rlc-migrated-pages-buro-bautagebuch-tsx-340", children: [_jsxs("div", { className: rlcClass(null, {
                    padding: "14px 16px",
                    borderBottom: url ?
                        "1px solid #e2e8f0" :
                        0
                }), children: [_jsx("div", { className: "rlc-migrated-pages-buro-bautagebuch-tsx-341", children: "PDF Bautagebuch" }), _jsxs("div", { className: "rlc-migrated-pages-buro-bautagebuch-tsx-342", children: ["Gesamtes Bautagebuch \u00B7 Zeitraum ", period, " \u00B7", " ", reportCount, " Tagesbericht(e)"] })] }), loading ?
                _jsx("div", { className: "rlc-migrated-pages-buro-bautagebuch-tsx-343", children: "Bautagebuch-PDF wird erstellt \u2026" }) :
                null, url ?
                _jsx("iframe", { title: "Bautagebuch Gesamt-PDF Vorschau", src: url, className: "rlc-migrated-pages-buro-bautagebuch-tsx-344" }) :
                null] }));
}
function ModuleHero({ title, subtitle }) {
    return (_jsxs("section", { className: "rlc-page-hero", children: [_jsx("div", { className: "rlc-page-hero__eyebrow", children: "Verwaltung \u00B7 Bauausf\u00FChrung" }), _jsx("h1", { className: "rlc-migrated-pages-buro-bautagebuch-tsx-347", children: title }), _jsx("p", { children: subtitle })] }));
}
function CompactDetail({ label, value }) {
    return (_jsxs("div", { className: "rlc-migrated-pages-buro-bautagebuch-tsx-349", children: [_jsx("div", { className: "rlc-migrated-pages-buro-bautagebuch-tsx-350", children: label }), _jsx("div", { className: "rlc-migrated-pages-buro-bautagebuch-tsx-351", children: value == null || value === "" ?
                    "—" :
                    String(value) })] }));
}
function Stat({ label, value }) {
    return (_jsxs("div", { className: "rlc-migrated-pages-buro-bautagebuch-tsx-352", children: [_jsx("div", { className: "rlc-migrated-pages-buro-bautagebuch-tsx-353", children: value }), _jsx("div", { className: "rlc-migrated-pages-buro-bautagebuch-tsx-354", children: label })] }));
}
