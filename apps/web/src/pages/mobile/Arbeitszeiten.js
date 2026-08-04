import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React from "react";
import { Link, useLocation } from "react-router-dom";
import { apiUrl } from "../../lib/apiBase";
import { useProject } from "../../store/useProject";
import { groupByMobileEmployee, resolveMobileEmployee } from "./mobileEmployee";
const EMPTY_STAGE_ROWS = { inbox: [], approved: [], final: [] };
function authHeaders() {
    for (const key of [
        "rlc_token",
        "token",
        "authToken",
        "accessToken",
        "rlc_auth_token",
        "rlc_mobile_token",
    ]) {
        const token = localStorage.getItem(key) || sessionStorage.getItem(key);
        if (token?.trim())
            return { Authorization: `Bearer ${token.trim()}` };
    }
    return {};
}
async function get(path) {
    const response = await fetch(apiUrl(path), {
        credentials: "include",
        headers: { Accept: "application/json", ...authHeaders() },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || payload?.error || `HTTP ${response.status}`);
    }
    return payload;
}
function itemsOf(payload) {
    const candidates = [
        payload,
        payload?.items,
        payload?.rows,
        payload?.documents,
        payload?.reports,
        payload?.data,
        payload?.data?.items,
        payload?.data?.rows,
        payload?.data?.documents,
    ];
    for (const candidate of candidates) {
        if (Array.isArray(candidate))
            return candidate;
    }
    return [];
}
function normalizeRow(raw, stage) {
    const source = raw?.document || raw?.item || raw?.data || raw || {};
    const identity = resolveMobileEmployee(source);
    return {
        ...source,
        id: String(source?.id || source?.docId || raw?.id || raw?.docId || ""),
        docId: String(source?.docId || source?.id || raw?.docId || raw?.id || ""),
        employee: String(source?.employee ||
            source?.employeeName ||
            identity.employeeName ||
            identity.label ||
            ""),
        employeeName: String(source?.employeeName || identity.employeeName || ""),
        date: String(source?.date || source?.datum || "").slice(0, 10),
        start: String(source?.start || source?.arbeitsbeginn || ""),
        end: String(source?.end || source?.arbeitsende || ""),
        breakMinutes: Number(source?.breakMinutes ?? source?.pauseMinutes ?? 0),
        hours: Number(source?.hours ?? source?.netHours ?? source?.nettoHours ?? 0),
        activity: String(source?.activity || source?.taetigkeit || ""),
        machines: String(source?.machines || source?.maschinen || ""),
        materials: String(source?.materials || source?.material || ""),
        note: String(source?.note || source?.bemerkung || source?.bemerkungen || ""),
        events: Array.isArray(source?.events)
            ? source.events
            : Array.isArray(source?.timeEvents)
                ? source.timeEvents
                : [],
        __stage: stage,
    };
}
function eventTypeLabel(type) {
    const value = String(type || "").toUpperCase();
    if (value === "START")
        return "Arbeitsbeginn";
    if (value === "PAUSE_START")
        return "Pause begonnen";
    if (value === "PAUSE_END")
        return "Arbeit fortgesetzt";
    if (value === "END")
        return "Arbeitsende";
    return type || "Zeitereignis";
}
function eventTimestamp(event) {
    if (event.time)
        return event.time;
    if (event.timestamp) {
        return new Date(event.timestamp).toLocaleString("de-DE", {
            dateStyle: "short",
            timeStyle: "short",
        });
    }
    return "—";
}
function eventGps(event) {
    const latitude = Number(event?.gps?.latitude ?? event?.latitude);
    const longitude = Number(event?.gps?.longitude ?? event?.longitude);
    const accuracy = event?.gps?.accuracy ?? event?.accuracy ?? null;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude))
        return null;
    return { latitude, longitude, accuracy };
}
function stageLabel(stage) {
    if (stage === "inbox")
        return "Eingang";
    if (stage === "approved")
        return "Freigegeben";
    return "Final";
}
function formatHours(value) {
    return Number(value || 0).toFixed(2).replace(".", ",");
}
function dateTime(value) {
    const numeric = Number(value || 0);
    if (!numeric)
        return "—";
    return new Date(numeric).toLocaleString("de-DE");
}
export default function Arbeitszeiten() {
    const { getSelectedProject } = useProject();
    const selectedProject = getSelectedProject();
    const location = useLocation();
    const search = React.useMemo(() => new URLSearchParams(location.search), [location.search]);
    const projectFromUrl = String(search.get("projectId") || "").trim();
    const projectKey = String(projectFromUrl || selectedProject?.code || selectedProject?.id || "").trim();
    const requestedDocId = String(search.get("docId") || "").trim();
    const requestedStage = String(search.get("stage") || "approved").toLowerCase();
    const [stageRows, setStageRows] = React.useState(EMPTY_STAGE_ROWS);
    const [selected, setSelected] = React.useState(null);
    const [employeeFilter, setEmployeeFilter] = React.useState("");
    const [dateFilter, setDateFilter] = React.useState("");
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState("");
    const load = React.useCallback(async () => {
        if (!projectKey)
            return;
        setLoading(true);
        setError("");
        try {
            const base = `/api/inbox/${encodeURIComponent(projectKey)}/ARBEITSZEIT`;
            const results = await Promise.allSettled([
                get(base),
                get(`${base}/approved`),
                get(`${base}/final`),
            ]);
            const next = {
                inbox: results[0].status === "fulfilled"
                    ? itemsOf(results[0].value).map((row) => normalizeRow(row, "inbox"))
                    : [],
                approved: results[1].status === "fulfilled"
                    ? itemsOf(results[1].value).map((row) => normalizeRow(row, "approved"))
                    : [],
                final: results[2].status === "fulfilled"
                    ? itemsOf(results[2].value).map((row) => normalizeRow(row, "final"))
                    : [],
            };
            setStageRows(next);
            if (requestedDocId) {
                const preferred = requestedStage === "inbox"
                    ? next.inbox
                    : requestedStage === "final"
                        ? next.final
                        : next.approved;
                const found = preferred.find((row) => row.id === requestedDocId || row.docId === requestedDocId) ||
                    [...next.inbox, ...next.approved, ...next.final].find((row) => row.id === requestedDocId || row.docId === requestedDocId);
                setSelected(found || null);
            }
        }
        catch (loadError) {
            setError(loadError?.message || "Arbeitszeiten konnten nicht geladen werden.");
        }
        finally {
            setLoading(false);
        }
    }, [projectKey, requestedDocId, requestedStage]);
    React.useEffect(() => {
        void load();
    }, [load]);
    const allRows = React.useMemo(() => [...stageRows.approved, ...stageRows.final, ...stageRows.inbox], [stageRows]);
    const filteredRows = React.useMemo(() => {
        return allRows.filter((row) => {
            const identity = resolveMobileEmployee(row);
            const matchesEmployee = !employeeFilter ||
                identity.label.toLocaleLowerCase("de-DE").includes(employeeFilter.toLocaleLowerCase("de-DE"));
            const matchesDate = !dateFilter || row.date === dateFilter;
            return matchesEmployee && matchesDate;
        });
    }, [allRows, dateFilter, employeeFilter]);
    const employeeGroups = React.useMemo(() => groupByMobileEmployee(filteredRows), [filteredRows]);
    const totalHours = filteredRows.reduce((sum, row) => sum + Number(row.hours || 0), 0);
    const employeeCount = new Set(filteredRows.map((row) => resolveMobileEmployee(row).key)).size;
    return (_jsxs("div", { style: { display: "grid", gap: 18, paddingBottom: 32 }, children: [_jsxs("div", { style: hero, children: [_jsxs("div", { children: [_jsx("div", { style: eyebrow, children: "PERSONAL \u00B7 FACHMODUL" }), _jsx("h1", { style: { margin: "5px 0" }, children: "Arbeitszeiten" }), _jsxs("div", { style: muted, children: ["Tagesnachweise, GPS-Zeitbuchungen und Mitarbeiter\u00FCbersicht \u00B7 Projekt", " ", projectKey || "—"] })] }), _jsxs("div", { style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }, children: [_jsx("button", { style: button, onClick: () => void load(), children: loading ? "Lädt …" : "Aktualisieren" }), _jsx(Link, { to: "/mobile/pruefung/ARBEITSZEIT", style: { ...button, background: "#1d4ed8", color: "white", textDecoration: "none" }, children: "Eingangspr\u00FCfung \u2192" })] })] }), _jsxs("div", { style: stats, children: [_jsx(Stat, { label: "Nachweise", value: String(filteredRows.length) }), _jsx(Stat, { label: "Gesamtstunden", value: `${formatHours(totalHours)} h` }), _jsx(Stat, { label: "Mitarbeiter", value: String(employeeCount) })] }), _jsxs("div", { style: filterBar, children: [_jsxs("label", { style: filterLabel, children: ["Mitarbeiter", _jsx("input", { style: input, value: employeeFilter, onChange: (event) => setEmployeeFilter(event.target.value), placeholder: "Name suchen" })] }), _jsxs("label", { style: filterLabel, children: ["Datum", _jsx("input", { style: input, type: "date", value: dateFilter, onChange: (event) => setDateFilter(event.target.value) })] }), _jsx("button", { style: button, onClick: () => {
                            setEmployeeFilter("");
                            setDateFilter("");
                        }, children: "Filter l\u00F6schen" })] }), error ? _jsx("div", { style: err, children: error }) : null, selected ? (_jsx(DetailPanel, { row: selected, onClose: () => setSelected(null) })) : null, _jsxs("div", { style: { display: "grid", gap: 16 }, children: [employeeGroups.map((group) => {
                        const hours = group.rows.reduce((sum, row) => sum + Number(row.hours || 0), 0);
                        return (_jsxs("section", { style: employeeCard, children: [_jsx("div", { style: employeeHeader, children: _jsxs("div", { children: [_jsx("div", { style: { fontSize: 17, fontWeight: 900, color: "#0f172a" }, children: group.identity.label }), _jsxs("div", { style: muted, children: [group.rows.length, " Nachweis(e) \u00B7 ", formatHours(hours), " h"] })] }) }), _jsx("div", { style: tableWrap, children: _jsxs("table", { style: table, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx(Th, { children: "Datum" }), _jsx(Th, { children: "Zeit" }), _jsx(Th, { children: "Pause" }), _jsx(Th, { children: "Netto" }), _jsx(Th, { children: "T\u00E4tigkeit" }), _jsx(Th, { children: "GPS" }), _jsx(Th, { children: "Status" }), _jsx(Th, { children: "Aktion" })] }) }), _jsx("tbody", { children: group.rows.map((row) => {
                                                    const events = Array.isArray(row.events) ? row.events : [];
                                                    const gpsCount = events.filter((event) => eventGps(event)).length;
                                                    return (_jsxs("tr", { children: [_jsx(Td, { children: row.date || "—" }), _jsxs(Td, { children: [row.start || "—", "\u2013", row.end || "—"] }), _jsxs(Td, { children: [Number(row.breakMinutes || 0), " Min."] }), _jsxs(Td, { strong: true, children: [formatHours(row.hours), " h"] }), _jsx(Td, { children: row.activity || "—" }), _jsxs(Td, { children: [gpsCount, " / ", events.length] }), _jsx(Td, { children: _jsx("span", { style: badge, children: stageLabel(row.__stage) }) }), _jsx(Td, { children: _jsx("button", { style: smallButton, onClick: () => setSelected(row), children: "Details" }) })] }, `${row.__stage}:${row.id}`));
                                                }) })] }) })] }, group.identity.key));
                    }), !employeeGroups.length ? (_jsx("div", { style: empty, children: "Noch keine Arbeitszeiten f\u00FCr die aktuelle Auswahl vorhanden." })) : null] })] }));
}
function DetailPanel({ row, onClose }) {
    const identity = resolveMobileEmployee(row);
    const events = Array.isArray(row.events) ? row.events : [];
    return (_jsxs("section", { style: detailPanel, children: [_jsxs("div", { style: detailHeader, children: [_jsxs("div", { children: [_jsx("div", { style: eyebrow, children: "ARBEITSZEITNACHWEIS" }), _jsxs("h2", { style: { margin: "4px 0 0" }, children: [identity.label, " \u00B7 ", row.date || "—"] })] }), _jsx("button", { style: button, onClick: onClose, children: "Schlie\u00DFen" })] }), _jsxs("div", { style: detailGrid, children: [_jsx(Detail, { label: "Mitarbeiter", value: identity.label }), _jsx(Detail, { label: "Datum", value: row.date || "—" }), _jsx(Detail, { label: "Arbeitsbeginn", value: row.start || "—" }), _jsx(Detail, { label: "Arbeitsende", value: row.end || "—" }), _jsx(Detail, { label: "Pause", value: `${Number(row.breakMinutes || 0)} Min.` }), _jsx(Detail, { label: "Nettoarbeitszeit", value: `${formatHours(row.hours)} h` }), _jsx(Detail, { label: "T\u00E4tigkeit", value: row.activity || "—" }), _jsx(Detail, { label: "Maschinen", value: row.machines || "—" }), _jsx(Detail, { label: "Material", value: row.materials || "—" }), _jsx(Detail, { label: "Bemerkung", value: row.note || "—" }), _jsx(Detail, { label: "Status", value: row.workflowStatus || stageLabel(row.__stage) }), _jsx(Detail, { label: "Eingereicht", value: dateTime(row.submittedAt || row.createdAt) })] }), _jsxs("div", { style: { marginTop: 18 }, children: [_jsx("h3", { style: { margin: "0 0 10px" }, children: "GPS-Zeitbuchungen" }), _jsxs("div", { style: { display: "grid", gap: 9 }, children: [events.map((event, index) => {
                                const gps = eventGps(event);
                                return (_jsxs("div", { style: gpsCard, children: [_jsxs("div", { children: [_jsxs("div", { style: { fontWeight: 900, color: "#0f172a" }, children: [index + 1, ". ", eventTypeLabel(event.type)] }), _jsx("div", { style: muted, children: eventTimestamp(event) })] }), _jsx("div", { children: gps ? (_jsxs(_Fragment, { children: [_jsxs("div", { style: { fontWeight: 800 }, children: [gps.latitude.toFixed(6), ", ", gps.longitude.toFixed(6)] }), _jsxs("div", { style: muted, children: ["Genauigkeit: ", gps.accuracy != null ? `±${Math.round(Number(gps.accuracy))} m` : "—"] })] })) : (_jsx("div", { style: muted, children: "Keine GPS-Position gespeichert." })) }), gps ? (_jsx("a", { style: mapLink, href: `https://www.google.com/maps?q=${gps.latitude},${gps.longitude}`, target: "_blank", rel: "noreferrer", children: "Position \u00F6ffnen" })) : null] }, event.id || `${event.type}-${index}`));
                            }), !events.length ? _jsx("div", { style: empty, children: "Keine GPS-Zeitbuchungen vorhanden." }) : null] })] })] }));
}
function Stat({ label, value }) {
    return (_jsxs("div", { style: stat, children: [_jsx("div", { style: muted, children: label }), _jsx("div", { style: { fontSize: 24, fontWeight: 900, color: "#0f172a" }, children: value })] }));
}
function Detail({ label, value }) {
    return (_jsxs("div", { style: detailCell, children: [_jsx("div", { style: detailLabel, children: label }), _jsx("div", { style: detailValue, children: value })] }));
}
function Th({ children }) {
    return _jsx("th", { style: th, children: children });
}
function Td({ children, strong, }) {
    return _jsx("td", { style: { ...td, fontWeight: strong ? 800 : 500 }, children: children });
}
const hero = {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
};
const eyebrow = {
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 1,
    color: "#2563eb",
};
const muted = { fontSize: 12, color: "#64748b" };
const button = {
    border: "1px solid #cbd5e1",
    borderRadius: 9,
    background: "white",
    padding: "9px 12px",
    fontWeight: 800,
    color: "#0f172a",
    cursor: "pointer",
};
const smallButton = {
    ...button,
    padding: "6px 9px",
    fontSize: 12,
};
const stats = {
    display: "grid",
    gridTemplateColumns: "repeat(3,minmax(160px,1fr))",
    gap: 10,
};
const stat = {
    background: "white",
    border: "1px solid #dbe4f0",
    borderRadius: 14,
    padding: 16,
};
const filterBar = {
    display: "flex",
    gap: 12,
    alignItems: "end",
    flexWrap: "wrap",
    padding: 14,
    background: "#ffffff",
    border: "1px solid #dbe4f0",
    borderRadius: 14,
};
const filterLabel = {
    display: "grid",
    gap: 5,
    fontSize: 12,
    fontWeight: 800,
    color: "#334155",
};
const input = {
    minWidth: 220,
    border: "1px solid #cbd5e1",
    borderRadius: 9,
    padding: "9px 10px",
    font: "inherit",
};
const err = {
    padding: 12,
    border: "1px solid #fecaca",
    background: "#fef2f2",
    color: "#991b1b",
    borderRadius: 10,
};
const employeeCard = {
    display: "grid",
    gap: 10,
    background: "#ffffff",
    border: "1px solid #dbe4f0",
    borderRadius: 14,
    overflow: "hidden",
};
const employeeHeader = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "14px 16px 0",
};
const tableWrap = {
    overflowX: "auto",
    background: "white",
};
const table = {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 1100,
};
const th = {
    padding: "12px 14px",
    textAlign: "left",
    fontSize: 11,
    color: "#475569",
    background: "#f8fafc",
    borderBottom: "1px solid #dbe4f0",
};
const td = {
    padding: "12px 14px",
    fontSize: 13,
    color: "#334155",
    borderBottom: "1px solid #eef2f7",
    verticalAlign: "top",
};
const badge = {
    display: "inline-block",
    padding: "4px 8px",
    borderRadius: 999,
    background: "#dcfce7",
    color: "#166534",
    fontWeight: 900,
    fontSize: 10,
};
const empty = {
    padding: 24,
    textAlign: "center",
    color: "#64748b",
    background: "#ffffff",
    border: "1px dashed #cbd5e1",
    borderRadius: 12,
};
const detailPanel = {
    background: "#ffffff",
    border: "1px solid #bfdbfe",
    borderRadius: 16,
    padding: 18,
    boxShadow: "0 14px 35px rgba(15,23,42,0.08)",
};
const detailHeader = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
};
const detailGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
    gap: 10,
    marginTop: 16,
};
const detailCell = {
    border: "1px solid #dbe4f0",
    borderRadius: 11,
    padding: 12,
    background: "#f8fafc",
};
const detailLabel = {
    fontSize: 11,
    color: "#64748b",
    fontWeight: 800,
    marginBottom: 5,
};
const detailValue = {
    color: "#0f172a",
    fontWeight: 700,
    whiteSpace: "pre-wrap",
};
const gpsCard = {
    display: "grid",
    gridTemplateColumns: "minmax(180px,1fr) minmax(240px,1fr) auto",
    gap: 14,
    alignItems: "center",
    border: "1px solid #dbe4f0",
    borderRadius: 11,
    padding: 12,
    background: "#f8fafc",
};
const mapLink = {
    ...button,
    textDecoration: "none",
    textAlign: "center",
    background: "#1d4ed8",
    color: "#ffffff",
};
