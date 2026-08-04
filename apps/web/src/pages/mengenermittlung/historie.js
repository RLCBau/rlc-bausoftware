import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
import React from "react";
import MengPageHeader from "./MengPageHeader";
import { apiUrl } from "../../lib/apiBase";
import { useProject } from "../../store/useProject";
const rid = () => globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const formatDateTime = (value) => {
    if (!value)
        return "—";
    return new Intl.DateTimeFormat("de-DE", {
        dateStyle: "medium",
        timeStyle: "short"
    }).format(new Date(value));
};
const formatMoney = (value) => new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR"
}).format(Number.isFinite(value) ? value : 0);
const formatNumber = (value) => new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: 3
}).format(Number.isFinite(value) ? value : 0);
function getHistorieAuthHeaders() {
    const keys = [
        "rlc_token",
        "token",
        "authToken",
        "accessToken",
        "rlc.auth.token",
        "rlc_mobile_token",
        "rlc_auth_token",
        "rlc_access_token"
    ];
    for (const key of keys) {
        const token = localStorage.getItem(key) ||
            sessionStorage.getItem(key);
        if (token?.trim()) {
            return { Authorization: `Bearer ${token.trim()}` };
        }
    }
    try {
        const raw = localStorage.getItem("auth") ||
            localStorage.getItem("rlc_auth") ||
            localStorage.getItem("user");
        if (raw) {
            const parsed = JSON.parse(raw);
            const token = parsed?.token ||
                parsed?.accessToken ||
                parsed?.authToken ||
                parsed?.data?.token ||
                parsed?.data?.accessToken;
            if (typeof token === "string" && token.trim()) {
                return { Authorization: `Bearer ${token.trim()}` };
            }
        }
    }
    catch {
        // Keine gespeicherten Auth-Daten.
    }
    return {};
}
async function api(path, init) {
    const response = await fetch(apiUrl(path), {
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            ...getHistorieAuthHeaders(),
            ...(init?.headers || {})
        },
        ...init
    });
    const raw = await response.text();
    const data = raw ? JSON.parse(raw) : {};
    if (!response.ok) {
        throw new Error(data?.error || data?.message || `HTTP ${response.status}`);
    }
    return data;
}
function normalizeRows(input) {
    const source = Array.isArray(input) ?
        input :
        Array.isArray(input?.rows) ?
            input.rows :
            Array.isArray(input?.items) ?
                input.items :
                [];
    return source.map((value, index) => {
        const pos = String(value?.pos ??
            value?.posNr ??
            value?.position ??
            value?.nr ??
            value?.Positionsnummer ??
            "").trim();
        const text = String(value?.text ??
            value?.kurztext ??
            value?.Kurztext ??
            value?.langtext ??
            value?.Text ??
            "").trim();
        const qty = Number(value?.qty ??
            value?.menge ??
            value?.quantity ??
            value?.ist ??
            value?.Ist ??
            value?.soll ??
            value?.Soll ??
            0);
        const ep = Number(value?.ep ??
            value?.unitPrice ??
            value?.unitPriceNet ??
            value?.rlcKiUnitPrice ??
            0);
        const factor = Number(value?.factor ?? 1);
        return {
            id: String(value?.id ?? value?.rowId ?? value?.uuid ?? "").trim() ||
                `${pos || "row"}-${index}`,
            pos,
            text,
            qty: Number.isFinite(qty) ? qty : 0,
            unit: String(value?.unit ?? value?.einheit ?? value?.Einheit ?? value?.uom ?? "").trim(),
            ep: Number.isFinite(ep) ? ep : 0,
            factor: Number.isFinite(factor) && factor !== 0 ? factor : 1
        };
    });
}
function normalizeVersions(input) {
    const source = Array.isArray(input) ?
        input :
        Array.isArray(input?.items) ?
            input.items :
            [];
    return source.
        map((value) => ({
        id: String(value?.id || rid()),
        projectId: String(value?.projectId || ""),
        createdAt: Number(value?.createdAt || Date.now()),
        updatedAt: value?.updatedAt ? Number(value.updatedAt) : undefined,
        sentAt: value?.sentAt ? Number(value.sentAt) : undefined,
        approvedAt: value?.approvedAt ? Number(value.approvedAt) : undefined,
        createdBy: String(value?.createdBy || value?.user || "Bauleitung"),
        user: String(value?.user || value?.createdBy || "Bauleitung"),
        note: value?.note ? String(value.note) : undefined,
        recipient: value?.recipient ? String(value.recipient) : undefined,
        status: normalizeStatus(value?.status, value?.sentAt, value?.approvedAt),
        documentName: value?.documentName ?
            String(value.documentName) :
            undefined,
        pdfUrl: value?.pdfUrl ? String(value.pdfUrl) : undefined,
        data: normalizeRows(value?.data || value?.rows || [])
    })).
        sort((a, b) => b.createdAt - a.createdAt);
}
function normalizeStatus(status, sentAt, approvedAt) {
    const normalized = String(status || "").toUpperCase();
    if (approvedAt || normalized === "FREIGEGEBEN")
        return "FREIGEGEBEN";
    if (sentAt || normalized === "VERSENDET")
        return "VERSENDET";
    if (normalized === "ENTWURF")
        return "ENTWURF";
    return "GESPEICHERT";
}
function versionTotal(version) {
    return version.data.reduce((sum, row) => sum + row.qty * row.ep * row.factor, 0);
}
function currentTotal(rows) {
    return rows.reduce((sum, row) => sum + row.qty * row.ep * row.factor, 0);
}
function statusLabel(status) {
    switch (status) {
        case "ENTWURF":
            return "Entwurf";
        case "VERSENDET":
            return "Versendet";
        case "FREIGEGEBEN":
            return "Freigegeben";
        default:
            return "Gespeichert";
    }
}
function statusStyle(status) {
    if (status === "FREIGEGEBEN") {
        return {
            color: "#166534",
            background: "#dcfce7",
            borderColor: "#bbf7d0"
        };
    }
    if (status === "VERSENDET") {
        return {
            color: "#0b5bd3",
            background: "#dbeafe",
            borderColor: "#bed6ff"
        };
    }
    if (status === "ENTWURF") {
        return {
            color: "#92400e",
            background: "#fef3c7",
            borderColor: "#fde68a"
        };
    }
    return {
        color: "#475569",
        background: "#f1f5f9",
        borderColor: "#e2e8f0"
    };
}
function diff(a, b) {
    const before = new Map(a.map((row) => [row.id, row]));
    const after = new Map(b.map((row) => [row.id, row]));
    const added = [];
    const removed = [];
    const changed = [];
    for (const [id, row] of after) {
        if (!before.has(id))
            added.push(row);
    }
    for (const [id, row] of before) {
        if (!after.has(id))
            removed.push(row);
    }
    for (const [id, oldRow] of before) {
        const newRow = after.get(id);
        if (!newRow)
            continue;
        if (oldRow.qty !== newRow.qty ||
            oldRow.text !== newRow.text ||
            oldRow.unit !== newRow.unit ||
            oldRow.pos !== newRow.pos) {
            changed.push({ before: oldRow, after: newRow });
        }
    }
    return { added, removed, changed };
}
const shell = {
    display: "grid",
    gap: 16
};
const card = {
    border: "1px solid #dce5f2",
    background: "#ffffff",
    borderRadius: 18,
    boxShadow: "0 8px 24px rgba(15,23,42,0.06)",
    padding: 16
};
const summaryGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 12
};
const summaryCard = {
    ...card,
    minHeight: 104
};
const input = {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #d9e2f1",
    borderRadius: 10,
    padding: "9px 10px",
    background: "#ffffff",
    color: "#0f172a"
};
const btn = {
    padding: "9px 12px",
    border: "1px solid #d7e2f0",
    background: "#ffffff",
    borderRadius: 11,
    fontWeight: 700,
    cursor: "pointer"
};
const btnPrimary = {
    ...btn,
    color: "#ffffff",
    background: "#0f4ec9",
    borderColor: "#0f4ec9"
};
export default function AufmassHistorie() {
    const { getSelectedProject } = useProject();
    const project = getSelectedProject();
    const projectId = String(project?.code || project?.id || "").trim();
    const projectLabel = String(project?.code || project?.name || project?.id || "").trim();
    const [versions, setVersions] = React.useState([]);
    const [current, setCurrent] = React.useState([]);
    const [selectedIds, setSelectedIds] = React.useState([]);
    const [openedVersion, setOpenedVersion] = React.useState(null);
    const [comparison, setComparison] = React.useState(null);
    const [note, setNote] = React.useState("");
    const [recipient, setRecipient] = React.useState("");
    const [loading, setLoading] = React.useState(false);
    const [offline, setOffline] = React.useState(false);
    const [message, setMessage] = React.useState(null);
    const loadAll = React.useCallback(async () => {
        if (!projectId) {
            setVersions([]);
            setCurrent([]);
            return;
        }
        setLoading(true);
        setOffline(false);
        try {
            const [historyResult, currentResult] = await Promise.all([
                api(`/api/historie?projectId=${encodeURIComponent(projectId)}`),
                api(`/api/historie/current?projectId=${encodeURIComponent(projectId)}`)
            ]);
            const serverVersions = normalizeVersions(historyResult.items || []);
            const serverCurrent = normalizeRows(currentResult.rows || []);
            setVersions(serverVersions);
            setCurrent(serverCurrent);
        }
        catch (error) {
            console.warn("Aufmaß-Historie: Server nicht erreichbar", error);
            setOffline(true);
            setVersions([]);
            setCurrent([]);
            setMessage({
                title: "Server nicht erreichbar",
                text: error?.message ||
                    "Aufmaß-Historie und aktueller Aufmaßstand konnten nicht vom Server geladen werden.",
                tone: "error"
            });
        }
        finally {
            setLoading(false);
        }
    }, [projectId]);
    React.useEffect(() => {
        void loadAll();
    }, [loadAll]);
    const latestSaved = versions[0];
    const latestSent = versions.
        filter((version) => version.status === "VERSENDET" ||
        version.status === "FREIGEGEBEN" ||
        Boolean(version.sentAt)).
        sort((a, b) => (b.sentAt || b.createdAt) - (a.sentAt || a.createdAt))[0];
    const saveVersion = React.useCallback(async () => {
        if (!projectId) {
            setMessage({
                title: "Kein Projekt gewählt",
                text: "Bitte zuerst ein Projekt auswählen.",
                tone: "error"
            });
            return;
        }
        if (!current.length) {
            setMessage({
                title: "Keine Aufmaßdaten",
                text: "Im aktuellen Projekt wurden keine Aufmaßdaten gefunden.",
                tone: "error"
            });
            return;
        }
        const version = {
            id: rid(),
            projectId,
            createdAt: Date.now(),
            createdBy: "Bauleitung",
            user: "Bauleitung",
            note: note.trim() || undefined,
            recipient: recipient.trim() || undefined,
            status: "GESPEICHERT",
            documentName: `Aufmaß ${versions.length + 1}`,
            data: JSON.parse(JSON.stringify(current))
        };
        try {
            await api("/api/historie", {
                method: "POST",
                body: JSON.stringify(version)
            });
            setVersions((previous) => [version, ...previous]);
            setNote("");
            setRecipient("");
            setOffline(false);
            setMessage({
                title: "Aufmaß gespeichert",
                text: "Der aktuelle Aufmaßstand wurde auf dem Server gespeichert.",
                tone: "success"
            });
        }
        catch (error) {
            setOffline(true);
            setMessage({
                title: "Speichern fehlgeschlagen",
                text: error?.message ||
                    "Der Aufmaßstand konnte nicht auf dem Server gespeichert werden.",
                tone: "error"
            });
        }
    }, [projectId, current, note, recipient, versions.length]);
    const markAsSent = React.useCallback(async (version) => {
        const updated = {
            ...version,
            status: "VERSENDET",
            sentAt: Date.now(),
            updatedAt: Date.now()
        };
        try {
            await api("/api/historie", {
                method: "POST",
                body: JSON.stringify(updated)
            });
            setVersions((previous) => previous.map((item) => item.id === version.id ? updated : item));
            setOffline(false);
            setMessage({
                title: "Als versendet markiert",
                text: "Die Versendung wurde auf dem Server dokumentiert.",
                tone: "success"
            });
        }
        catch (error) {
            setOffline(true);
            setMessage({
                title: "Statusänderung fehlgeschlagen",
                text: error?.message ||
                    "Der Status konnte nicht auf dem Server aktualisiert werden.",
                tone: "error"
            });
        }
    }, []);
    const restoreVersion = React.useCallback(async (version) => {
        try {
            await api("/api/historie/restore", {
                method: "POST",
                body: JSON.stringify(version)
            });
            setCurrent(version.data || []);
            setMessage({
                title: "Aufmaß wiederhergestellt",
                text: "Der ausgewählte Aufmaßstand wurde wiederhergestellt.",
                tone: "success"
            });
        }
        catch (error) {
            setMessage({
                title: "Wiederherstellung fehlgeschlagen",
                text: error?.message || "Der Aufmaßstand konnte nicht wiederhergestellt werden.",
                tone: "error"
            });
        }
    }, []);
    const deleteVersion = React.useCallback(async (version) => {
        if (!projectId)
            return;
        try {
            await api(`/api/historie/${encodeURIComponent(version.id)}?projectId=${encodeURIComponent(projectId)}`, { method: "DELETE" });
            setVersions((previous) => previous.filter((item) => item.id !== version.id));
            setSelectedIds((previous) => previous.filter((id) => id !== version.id));
            setOpenedVersion((currentVersion) => currentVersion?.id === version.id ? null : currentVersion);
            setOffline(false);
        }
        catch (error) {
            setOffline(true);
            setMessage({
                title: "Löschen fehlgeschlagen",
                text: error?.message ||
                    "Die Aufmaß-Version konnte nicht auf dem Server gelöscht werden.",
                tone: "error"
            });
        }
    }, [projectId]);
    function toggleSelection(id) {
        setSelectedIds((previous) => {
            if (previous.includes(id)) {
                return previous.filter((item) => item !== id);
            }
            if (previous.length === 2) {
                return [previous[1], id];
            }
            return [...previous, id];
        });
    }
    function openComparison() {
        if (selectedIds.length !== 2)
            return;
        const left = versions.find((version) => version.id === selectedIds[0]);
        const right = versions.find((version) => version.id === selectedIds[1]);
        if (left && right) {
            setComparison({ left, right });
        }
    }
    return (_jsxs("div", { className: rlcClass(null, shell), children: [_jsx(MengPageHeader, { title: "Aufma\u00DF-Historie", subtitle: "Gespeicherte, versendete und freigegebene Aufma\u00DFst\u00E4nde dokumentieren." }), _jsxs("section", { className: rlcClass(null, summaryGrid), children: [_jsx(SummaryCard, { label: "Letztes Aufma\u00DF", value: latestSaved ? formatDateTime(latestSaved.createdAt) : "Noch keines", detail: latestSaved ?
                            `${latestSaved.data.length} Positionen · ${formatMoney(versionTotal(latestSaved))}` :
                            "Keine Version gespeichert" }), _jsx(SummaryCard, { label: "Letzte Versendung", value: latestSent ?
                            formatDateTime(latestSent.sentAt || latestSent.createdAt) :
                            "Noch nicht versendet", detail: latestSent?.recipient ?
                            `Empfänger: ${latestSent.recipient}` :
                            "Kein Empfänger dokumentiert" }), _jsx(SummaryCard, { label: "Gespeicherte Versionen", value: String(versions.length), detail: `${versions.filter((v) => v.status === "VERSENDET").length} versendet` }), _jsx(SummaryCard, { label: "Aktueller Abrechnungsstand", value: formatMoney(currentTotal(current)), detail: `${current.filter((row) => row.qty !== 0).length} Positionen mit Menge` })] }), _jsxs("section", { className: rlcClass(null, card), children: [_jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-historie-tsx-1405", children: [_jsxs("label", { className: "rlc-migrated-pages-mengenermittlung-historie-tsx-1406", children: ["Notiz zum Aufma\u00DF", _jsx("input", { value: note, onChange: (event) => setNote(event.target.value), placeholder: "z. B. Aufma\u00DFstand Juli 2026", className: rlcClass(null, input) })] }), _jsxs("label", { className: "rlc-migrated-pages-mengenermittlung-historie-tsx-1407", children: ["Empf\u00E4nger (optional)", _jsx("input", { value: recipient, onChange: (event) => setRecipient(event.target.value), placeholder: "z. B. Auftraggeber / Bauleitung", className: rlcClass(null, input) })] }), _jsx("button", { type: "button", className: rlcClass(null, btnPrimary), onClick: saveVersion, disabled: loading || !projectId, children: "Aktuellen Aufma\u00DFstand speichern" })] }), _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-historie-tsx-1408", children: [_jsxs("div", { className: rlcClass(null, {
                                    color: offline ? "#b45309" : "#166534",
                                    fontSize: 12,
                                    fontWeight: 700
                                }), children: ["Projekt: ", projectLabel || "Kein Projekt gewählt", " \u00B7", " ", offline ? "Server nicht erreichbar" : "Server verbunden"] }), _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-historie-tsx-1409", children: [_jsx("button", { type: "button", className: rlcClass(null, btn), onClick: openComparison, disabled: selectedIds.length !== 2, children: "Versionen vergleichen" }), _jsx("button", { type: "button", className: rlcClass(null, btn), onClick: () => void loadAll(), disabled: loading, children: "Neu laden" })] })] })] }), _jsxs("section", { className: rlcClass(null, card), children: [_jsx("h2", { className: "rlc-migrated-pages-mengenermittlung-historie-tsx-1410", children: "Verlauf der Aufma\u00DFst\u00E4nde" }), !versions.length ?
                        _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-historie-tsx-1411", children: "Noch keine Aufma\u00DF-Version gespeichert." }) :
                        _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-historie-tsx-1412", children: _jsxs("table", { className: "rlc-migrated-pages-mengenermittlung-historie-tsx-1413", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx(Th, {}), _jsx(Th, { children: "Datum" }), _jsx(Th, { children: "Bezeichnung" }), _jsx(Th, { children: "Status" }), _jsx(Th, { children: "Positionen" }), _jsx(Th, { style: { textAlign: "right" }, children: "Netto" }), _jsx(Th, { children: "Erstellt von" }), _jsx(Th, { children: "Empf\u00E4nger" }), _jsx(Th, { children: "Aktionen" })] }) }), _jsx("tbody", { children: versions.map((version) => _jsxs("tr", { children: [_jsx(Td, { children: _jsx("input", { type: "checkbox", checked: selectedIds.includes(version.id), onChange: () => toggleSelection(version.id) }) }), _jsx(Td, { children: formatDateTime(version.createdAt) }), _jsxs(Td, { children: [_jsx("strong", { children: version.documentName ||
                                                                `Aufmaß ${versions.indexOf(version) + 1}` }), _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-historie-tsx-1414", children: version.note || "Ohne Notiz" })] }), _jsx(Td, { children: _jsx("span", { className: rlcClass(null, {
                                                            display: "inline-flex",
                                                            padding: "4px 8px",
                                                            borderRadius: 999,
                                                            border: "1px solid",
                                                            fontSize: 12,
                                                            fontWeight: 700,
                                                            ...statusStyle(version.status)
                                                        }), children: statusLabel(version.status) }) }), _jsx(Td, { children: version.data.length }), _jsx(Td, { style: { textAlign: "right" }, children: formatMoney(versionTotal(version)) }), _jsx(Td, { children: version.createdBy || version.user || "Bauleitung" }), _jsx(Td, { children: version.recipient || "—" }), _jsx(Td, { children: _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-historie-tsx-1415", children: [_jsx("button", { type: "button", className: rlcClass(null, btn), onClick: () => setOpenedVersion(version), children: "\u00D6ffnen" }), version.pdfUrl ?
                                                                _jsx("a", { href: version.pdfUrl, target: "_blank", rel: "noreferrer", className: rlcClass(null, { ...btn, textDecoration: "none" }), children: "PDF anzeigen" }) :
                                                                null, version.status !== "VERSENDET" &&
                                                                version.status !== "FREIGEGEBEN" ?
                                                                _jsx("button", { type: "button", className: rlcClass(null, btn), onClick: () => void markAsSent(version), children: "Als versendet markieren" }) :
                                                                null, _jsx("button", { type: "button", className: rlcClass(null, btn), onClick: () => void restoreVersion(version), children: "Wiederherstellen" }), _jsx("button", { type: "button", className: rlcClass(null, { ...btn, color: "#b91c1c" }), onClick: () => void deleteVersion(version), children: "L\u00F6schen" })] }) })] }, version.id)) })] }) })] }), openedVersion ?
                _jsxs("section", { className: rlcClass(null, card), children: [_jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-historie-tsx-1416", children: [_jsxs("div", { children: [_jsx("h2", { className: "rlc-migrated-pages-mengenermittlung-historie-tsx-1417", children: openedVersion.documentName || "Aufmaß-Version" }), _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-historie-tsx-1418", children: [formatDateTime(openedVersion.createdAt), " \u00B7", " ", statusLabel(openedVersion.status)] })] }), _jsx("button", { type: "button", className: rlcClass(null, btn), onClick: () => setOpenedVersion(null), children: "Schlie\u00DFen" })] }), _jsx(VersionTable, { rows: openedVersion.data })] }) :
                null, comparison ?
                _jsxs("section", { className: rlcClass(null, card), children: [_jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-historie-tsx-1419", children: [_jsxs("div", { children: [_jsx("h2", { className: "rlc-migrated-pages-mengenermittlung-historie-tsx-1420", children: "Versionsvergleich" }), _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-historie-tsx-1421", children: [formatDateTime(comparison.left.createdAt), " \u2194", " ", formatDateTime(comparison.right.createdAt)] })] }), _jsx("button", { type: "button", className: rlcClass(null, btn), onClick: () => setComparison(null), children: "Vergleich schlie\u00DFen" })] }), _jsx(DiffView, { a: comparison.left.data, b: comparison.right.data })] }) :
                null, message ?
                _jsx("div", { role: "dialog", "aria-modal": "true", onClick: () => setMessage(null), className: "rlc-migrated-pages-mengenermittlung-historie-tsx-1422", children: _jsxs("div", { onClick: (event) => event.stopPropagation(), className: "rlc-migrated-pages-mengenermittlung-historie-tsx-1423", children: [_jsx("div", { className: "rlc-migrated-pages-mengenermittlung-historie-tsx-1424", children: message.title }), _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-historie-tsx-1425", children: message.text }), _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-historie-tsx-1426", children: _jsx("button", { type: "button", className: rlcClass(null, btnPrimary), onClick: () => setMessage(null), children: "OK" }) })] }) }) :
                null] }));
}
function SummaryCard({ label, value, detail }) {
    return (_jsxs("div", { className: rlcClass(null, summaryCard), children: [_jsx("div", { className: "rlc-migrated-pages-mengenermittlung-historie-tsx-1427", children: label }), _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-historie-tsx-1428", children: value }), _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-historie-tsx-1429", children: detail })] }));
}
function VersionTable({ rows }) {
    return (_jsx("div", { className: "rlc-migrated-pages-mengenermittlung-historie-tsx-1430", children: _jsxs("table", { className: "rlc-migrated-pages-mengenermittlung-historie-tsx-1431", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx(Th, { children: "Pos." }), _jsx(Th, { children: "Text" }), _jsx(Th, { children: "Einheit" }), _jsx(Th, { style: { textAlign: "right" }, children: "Menge" }), _jsx(Th, { style: { textAlign: "right" }, children: "EP netto" }), _jsx(Th, { style: { textAlign: "right" }, children: "Gesamt netto" })] }) }), _jsx("tbody", { children: rows.map((row) => _jsxs("tr", { children: [_jsx(Td, { children: row.pos || "—" }), _jsx(Td, { children: row.text || "—" }), _jsx(Td, { children: row.unit || "—" }), _jsx(Td, { style: { textAlign: "right" }, children: formatNumber(row.qty) }), _jsx(Td, { style: { textAlign: "right" }, children: formatMoney(row.ep) }), _jsx(Td, { style: { textAlign: "right" }, children: formatMoney(row.qty * row.ep * row.factor) })] }, row.id)) })] }) }));
}
function DiffView({ a, b }) {
    const result = diff(a, b);
    return (_jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-historie-tsx-1432", children: [_jsx(DiffCard, { title: `Neu (${result.added.length})`, children: result.added.length ?
                    result.added.map((row) => _jsx(DiffLine, { text: `${row.pos} ${row.text}`, color: "#166534" }, row.id)) :
                    _jsx(Empty, {}) }), _jsx(DiffCard, { title: `Entfernt (${result.removed.length})`, children: result.removed.length ?
                    result.removed.map((row) => _jsx(DiffLine, { text: `${row.pos} ${row.text}`, color: "#b91c1c" }, row.id)) :
                    _jsx(Empty, {}) }), _jsx(DiffCard, { title: `Geändert (${result.changed.length})`, children: result.changed.length ?
                    result.changed.map(({ before, after }) => _jsx(DiffLine, { text: `${after.pos} ${after.text}: ${before.qty} → ${after.qty}`, color: "#92400e" }, after.id)) :
                    _jsx(Empty, {}) })] }));
}
function DiffCard({ title, children }) {
    return (_jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-historie-tsx-1433", children: [_jsx("div", { className: "rlc-migrated-pages-mengenermittlung-historie-tsx-1434", children: title }), children] }));
}
function DiffLine({ text, color }) {
    return (_jsx("div", { className: rlcClass(null, {
            fontSize: 12,
            padding: "5px 7px",
            borderRadius: 7,
            marginBottom: 5,
            background: `${color}14`,
            color
        }), children: text }));
}
function Empty() {
    return _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-historie-tsx-1435", children: "\u2014" });
}
function Th(props) {
    const { children, style, ...rest } = props;
    return (_jsx("th", { ...rest, className: rlcClass(null, {
            padding: "8px",
            borderBottom: "1px solid #dce5f2",
            textAlign: "left",
            color: "#475569",
            fontSize: 12,
            whiteSpace: "nowrap",
            ...style
        }), children: children }));
}
function Td(props) {
    const { children, style, ...rest } = props;
    return (_jsx("td", { ...rest, className: rlcClass(null, {
            padding: "8px",
            borderBottom: "1px solid #edf2f7",
            verticalAlign: "top",
            fontSize: 13,
            ...style
        }), children: children }));
}
