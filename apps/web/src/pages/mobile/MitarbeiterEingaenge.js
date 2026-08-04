import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { Link } from "react-router-dom";
import { apiUrl } from "../../lib/apiBase";
import { useProject } from "../../store/useProject";
import { groupByMobileEmployee, resolveMobileEmployee } from "./mobileEmployee";
const SOURCES = [
    { key: "ARBEITSZEIT", title: "Arbeitszeiten", to: "/mobile/pruefung/ARBEITSZEIT", endpoints: ["/api/inbox/{project}/ARBEITSZEIT"] },
    { key: "REGIE", title: "Regieberichte", to: "/buro/regieberichte", endpoints: ["/api/regie/inbox/list?projectId={project}"] },
    { key: "LIEFERSCHEIN", title: "Lieferscheine", to: "/buro/lieferscheine", endpoints: ["/api/ls/inbox/list?projectId={project}"] },
    { key: "FOTOS", title: "Fotos / Notizen", to: "/buro/fotos", endpoints: ["/api/fotos/inbox/list?projectId={project}", "/api/photos/inbox/list?projectId={project}"] },
    { key: "TAGESBERICHT", title: "Tagesberichte", to: "/buro/tagesberichte", endpoints: ["/api/tagesbericht/inbox/list?projectId={project}", "/api/regie/inbox/list?projectId={project}"] },
    { key: "BAUTAGEBUCH", title: "Bautagebuch", to: "/buro/bautagebuch", endpoints: ["/api/regie/inbox/list?projectId={project}"] },
    { key: "MENGENERMITTLUNG", title: "Mengenermittlung", to: "/mobile/pruefung/MENGENERMITTLUNG", endpoints: ["/api/inbox/{project}/MENGENERMITTLUNG"] },
];
function authHeaders() {
    for (const key of ["rlc_token", "token", "authToken", "accessToken", "rlc_auth_token"]) {
        const token = localStorage.getItem(key) || sessionStorage.getItem(key);
        if (token?.trim())
            return { Authorization: `Bearer ${token.trim()}` };
    }
    return {};
}
function extractRows(payload) {
    if (Array.isArray(payload))
        return payload;
    for (const key of ["items", "rows", "documents", "data", "results"]) {
        if (Array.isArray(payload?.[key]))
            return payload[key];
    }
    return [];
}
async function loadFirst(projectKey, endpoints) {
    for (const endpoint of endpoints) {
        try {
            const response = await fetch(apiUrl(endpoint.split("{project}").join(encodeURIComponent(projectKey))), {
                credentials: "include",
                headers: { Accept: "application/json", ...authHeaders() },
            });
            if (!response.ok)
                continue;
            const payload = await response.json().catch(() => null);
            const rows = extractRows(payload);
            if (rows.length || payload?.ok !== false)
                return rows;
        }
        catch {
            // nächste kompatible Route versuchen
        }
    }
    return [];
}
export default function MitarbeiterEingaenge() {
    const { getSelectedProject } = useProject();
    const project = getSelectedProject();
    const projectKey = String(project?.code || project?.id || "").trim();
    const [rows, setRows] = React.useState([]);
    const [loading, setLoading] = React.useState(false);
    const [query, setQuery] = React.useState("");
    const [error, setError] = React.useState("");
    const load = React.useCallback(async () => {
        if (!projectKey)
            return setRows([]);
        setLoading(true);
        setError("");
        try {
            const result = await Promise.all(SOURCES.map(async (source) => (await loadFirst(projectKey, source.endpoints)).map((doc) => ({ ...doc, __source: source }))));
            setRows(result.flat());
        }
        catch (err) {
            setError(err?.message || "Eingänge konnten nicht geladen werden.");
        }
        finally {
            setLoading(false);
        }
    }, [projectKey]);
    React.useEffect(() => { void load(); }, [load]);
    const filtered = React.useMemo(() => {
        const needle = query.trim().toLocaleLowerCase("de-DE");
        if (!needle)
            return rows;
        return rows.filter((row) => {
            const employee = resolveMobileEmployee(row);
            return `${employee.label} ${employee.employeeId} ${row?.title || ""} ${row?.id || ""}`
                .toLocaleLowerCase("de-DE")
                .includes(needle);
        });
    }, [rows, query]);
    const groups = React.useMemo(() => groupByMobileEmployee(filtered), [filtered]);
    return (_jsxs("div", { style: { display: "grid", gap: 16, paddingBottom: 28 }, children: [_jsxs("section", { style: { borderRadius: 20, padding: 22, color: "white", background: "linear-gradient(135deg,#0f2f8f,#2563eb)" }, children: [_jsx("div", { style: { fontSize: 12, fontWeight: 900, opacity: .9 }, children: "Mobile-Zentrale" }), _jsx("h1", { style: { margin: "8px 0 6px" }, children: "Eing\u00E4nge nach Mitarbeiter" }), _jsx("div", { style: { opacity: .92 }, children: "Alle Mobile-Eing\u00E4nge des Projekts werden anhand Mitarbeiter-ID bzw. Login eindeutig gruppiert." })] }), _jsxs("div", { style: { display: "flex", gap: 10, flexWrap: "wrap" }, children: [_jsx("input", { value: query, onChange: (e) => setQuery(e.target.value), placeholder: "Mitarbeiter, Personalnummer oder Dokument suchen\u2026", style: { flex: "1 1 320px", border: "1px solid #cbd5e1", borderRadius: 11, padding: "10px 12px" } }), _jsx("button", { onClick: () => void load(), disabled: loading || !projectKey, style: { border: "1px solid #cbd5e1", borderRadius: 11, padding: "10px 14px", background: "white", fontWeight: 900 }, children: loading ? "Lädt…" : "Aktualisieren" })] }), error ? _jsx("div", { style: { padding: 12, border: "1px solid #fecaca", borderRadius: 10, background: "#fef2f2", color: "#991b1b" }, children: error }) : null, groups.map(({ identity, rows: employeeRows }) => {
                const counts = new Map();
                employeeRows.forEach((row) => counts.set(row.__source.key, (counts.get(row.__source.key) || 0) + 1));
                return (_jsxs("section", { style: { border: "1px solid #dbe4f0", borderRadius: 16, background: "white", overflow: "hidden" }, children: [_jsxs("header", { style: { display: "flex", justifyContent: "space-between", gap: 12, padding: 16, background: "#f8fafc", borderBottom: "1px solid #e2e8f0", flexWrap: "wrap" }, children: [_jsxs("div", { children: [_jsx("div", { style: { fontSize: 17, fontWeight: 950 }, children: identity.label }), _jsx("div", { style: { color: "#64748b", fontSize: 12 }, children: identity.employeeId ? `Mitarbeiter-ID: ${identity.employeeId}` : identity.userId ? `Benutzer-ID: ${identity.userId}` : "Zuordnung über Namen" })] }), _jsxs("div", { style: { fontWeight: 950 }, children: [employeeRows.length, " Eing\u00E4nge"] })] }), _jsx("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 10, padding: 14 }, children: SOURCES.filter((source) => (counts.get(source.key) || 0) > 0).map((source) => (_jsxs(Link, { to: source.to, style: { textDecoration: "none", color: "inherit", border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 }, children: [_jsx("div", { style: { color: "#64748b", fontSize: 12, fontWeight: 800 }, children: source.title }), _jsx("div", { style: { marginTop: 4, fontSize: 22, fontWeight: 950 }, children: counts.get(source.key) })] }, source.key))) })] }, identity.key));
            }), !loading && !groups.length ? _jsx("div", { style: { padding: 18, border: "1px dashed #cbd5e1", borderRadius: 12, color: "#64748b" }, children: "Keine passenden Mobile-Eing\u00E4nge gefunden." }) : null] }));
}
