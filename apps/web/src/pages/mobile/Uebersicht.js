import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
import React from "react";
import { Link } from "react-router-dom";
import { apiUrl } from "../../lib/apiBase";
import { useProject } from "../../store/useProject";
const EMPTY_COUNTS = {
    inbox: 0,
    approved: 0,
    final: 0,
    available: false,
    availableStages: 0,
    expectedStages: 3
};
const AREAS = [
    {
        key: "regieberichte",
        title: "Regieberichte",
        description: "Eingereichte Regieberichte prüfen, freigeben, ablehnen und registrieren.",
        to: "/mobile/pruefung/REGIE",
        group: "Prüfung",
        reportType: "REGIE",
        requiredStages: ["inbox", "approved", "final"],
        endpoints: {
            inbox: ["/api/regie/inbox/list?projectId={project}"],
            approved: ["/api/regie/freigegeben/list?projectId={project}"],
            final: ["/api/regie/list?projectId={project}"]
        }
    },
    {
        key: "lieferscheine",
        title: "Lieferscheine",
        description: "Lieferscheine aus der Mobile-App kontrollieren, freigeben und final ablegen.",
        to: "/mobile/pruefung/LIEFERSCHEIN",
        group: "Prüfung",
        requiredStages: ["inbox", "final"],
        endpoints: {
            inbox: ["/api/ls/inbox/list?projectId={project}"],
            approved: ["/api/ls/freigegeben/list?projectId={project}"],
            final: ["/api/ls/list?projectId={project}"]
        }
    },
    {
        key: "fotos",
        title: "Fotos / Notizen",
        description: "Baustellenfotos und Notizen prüfen und der Projektakte oder dem Aufmaß zuordnen.",
        to: "/mobile/pruefung/FOTOS",
        group: "Prüfung",
        expectedStages: 2,
        requiredStages: ["inbox", "final"],
        endpoints: {
            inbox: [
                "/api/fotos/inbox/list?projectId={project}",
                "/api/photos/inbox/list?projectId={project}"
            ],
            final: [
                "/api/fotos/projects/{project}/fotos/notes",
                "/api/photos/projects/{project}/fotos/notes"
            ]
        }
    },
    {
        key: "tagesberichte",
        title: "Tagesberichte",
        description: "Mobile Tagesberichte im offiziellen Berichtsworkflow bearbeiten.",
        to: "/mobile/pruefung/TAGESBERICHT",
        group: "Bauausführung",
        reportType: "TAGESBERICHT",
        requiredStages: ["inbox", "final"],
        endpoints: {
            inbox: [
                "/api/tagesbericht/inbox/list?projectId={project}",
                "/api/regie/inbox/list?projectId={project}"
            ],
            approved: ["/api/regie/freigegeben/list?projectId={project}"],
            final: ["/api/regie/list?projectId={project}"]
        }
    },
    {
        key: "bautagebuch",
        title: "Bautagebuch",
        description: "Bautagebuch-Einträge prüfen, ergänzen und dauerhaft registrieren.",
        to: "/mobile/pruefung/BAUTAGEBUCH",
        group: "Bauausführung",
        reportType: "BAUTAGEBUCH",
        requiredStages: ["inbox", "final"],
        endpoints: {
            inbox: ["/api/regie/inbox/list?projectId={project}"],
            approved: ["/api/regie/freigegeben/list?projectId={project}"],
            final: ["/api/regie/list?projectId={project}"]
        }
    },
    {
        key: "mengenermittlung",
        title: "Mengenermittlung",
        description: "Erfasste Mengen prüfen und in den Aufmaß-Editor übernehmen.",
        to: "/mobile/pruefung/MENGENERMITTLUNG",
        group: "Bauausführung",
        requiredStages: ["inbox", "final"],
        endpoints: {
            inbox: ["/api/inbox/{project}/MENGENERMITTLUNG"],
            approved: ["/api/inbox/{project}/MENGENERMITTLUNG/approved"],
            final: ["/api/inbox/{project}/MENGENERMITTLUNG/final"]
        }
    },
    {
        key: "arbeitszeiten",
        title: "Arbeitszeiten",
        description: "Arbeitszeiten des Personals nach Mitarbeiter prüfen, freigeben und dauerhaft registrieren.",
        to: "/mobile/pruefung/ARBEITSZEIT",
        group: "Bauausführung",
        requiredStages: ["inbox", "approved", "final"],
        endpoints: {
            inbox: ["/api/inbox/{project}/ARBEITSZEIT"],
            approved: ["/api/inbox/{project}/ARBEITSZEIT/approved"],
            final: ["/api/inbox/{project}/ARBEITSZEIT/final"]
        }
    }, {
        key: "kalkulation",
        title: "Kalkulation",
        description: "Mobile Kalkulationsstände im zentralen Kalkulationsmodul weiterbearbeiten.",
        to: "/kalkulation/mit-ki",
        group: "Kaufmännisch",
        workflow: false,
        requiredStages: ["final"],
        endpoints: {
            final: [
                "/api/kalkulation/{project}/ki",
                "/api/kalkulation/ki-handoff/{project}"
            ]
        }
    },
    {
        key: "angebote",
        title: "Angebote",
        description: "Angebote prüfen und in der Angebotsverwaltung öffnen.",
        to: "/mobile/pruefung/ANGEBOT",
        group: "Kaufmännisch",
        requiredStages: ["inbox", "final"],
        endpoints: {
            inbox: ["/api/inbox/{project}/ANGEBOT"],
            approved: ["/api/inbox/{project}/ANGEBOT/approved"],
            final: ["/api/inbox/{project}/ANGEBOT/final"]
        }
    },
    {
        key: "abschlagsrechnungen",
        title: "Abschlagsrechnungen",
        description: "Mobile Abschlagsrechnungen kontrollieren und in der Buchhaltung weiterführen.",
        to: "/mobile/pruefung/ABSCHLAGSRECHNUNG",
        group: "Kaufmännisch",
        requiredStages: ["inbox", "final"],
        endpoints: {
            inbox: ["/api/inbox/{project}/ABSCHLAGSRECHNUNG"],
            approved: ["/api/inbox/{project}/ABSCHLAGSRECHNUNG/approved"],
            final: ["/api/inbox/{project}/ABSCHLAGSRECHNUNG/final"]
        }
    },
    {
        key: "rechnungen",
        title: "Rechnungen",
        description: "Rechnungen prüfen und im Buchhaltungsmodul bearbeiten.",
        to: "/mobile/pruefung/RECHNUNG",
        group: "Kaufmännisch",
        requiredStages: ["inbox", "final"],
        endpoints: {
            inbox: ["/api/inbox/{project}/RECHNUNG"],
            approved: ["/api/inbox/{project}/RECHNUNG/approved"],
            final: ["/api/inbox/{project}/RECHNUNG/final"]
        }
    },
    {
        key: "outlier",
        title: "Outlier Reports",
        description: "Auffällige Preise und Mengen im Analysebereich kontrollieren.",
        to: "/kalkulation/versionsvergleich",
        group: "KI",
        workflow: false,
        requiredStages: ["final"],
        endpoints: {
            final: ["/api/global-knowledge/outliers"]
        }
    }
];
const groupOrder = [
    "Prüfung",
    "Bauausführung",
    "Kaufmännisch",
    "KI"
];
function authHeaders() {
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
        const token = localStorage.getItem(key) || sessionStorage.getItem(key);
        if (token?.trim())
            return { Authorization: `Bearer ${token.trim()}` };
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
        // Kein verwertbares Auth-Objekt vorhanden.
    }
    return {};
}
function resolvePath(path, projectKey) {
    return path.split("{project}").join(encodeURIComponent(projectKey));
}
function extractItems(payload) {
    if (Array.isArray(payload))
        return payload;
    if (!payload || typeof payload !== "object")
        return [];
    const candidates = [
        payload.items,
        payload.rows,
        payload.reports,
        payload.documents,
        payload.results,
        payload.entries,
        payload.files,
        payload.list,
        payload.data,
        payload.data?.items,
        payload.data?.rows,
        payload.data?.reports,
        payload.data?.documents,
        payload.data?.results,
        payload.data?.entries,
        payload.data?.files,
        payload.data?.list
    ];
    for (const candidate of candidates) {
        if (Array.isArray(candidate))
            return candidate;
    }
    return [];
}
function countPayload(payload) {
    if (typeof payload?.count === "number")
        return payload.count;
    if (typeof payload?.total === "number")
        return payload.total;
    if (typeof payload?.totalCount === "number")
        return payload.totalCount;
    const items = extractItems(payload);
    if (items.length)
        return items.length;
    if (payload?.exists === true)
        return 1;
    if (payload?.ok === true && payload?.data && typeof payload.data === "object")
        return 1;
    return 0;
}
function countAreaPayload(area, payload) {
    if (!area.reportType)
        return countPayload(payload);
    const expected = area.reportType;
    return extractItems(payload).filter((item) => {
        const actual = String(item?.reportType || "REGIE").trim().toUpperCase();
        return actual === expected;
    }).length;
}
async function fetchFirstAvailable(paths, projectKey) {
    let lastError = "Keine passende Server-Route gefunden.";
    for (const candidate of paths) {
        const path = resolvePath(candidate, projectKey);
        try {
            const response = await fetch(apiUrl(path), {
                credentials: "include",
                headers: {
                    Accept: "application/json",
                    ...authHeaders()
                }
            });
            const raw = await response.text();
            let payload = {};
            try {
                payload = raw ? JSON.parse(raw) : {};
            }
            catch {
                payload = {};
            }
            if (response.ok)
                return payload;
            if (response.status !== 404) {
                lastError = payload?.error || payload?.message || `HTTP ${response.status}`;
            }
        }
        catch (error) {
            lastError = error?.message || "Server nicht erreichbar.";
        }
    }
    throw new Error(lastError);
}
function filterLieferscheinInbox(payload) {
    return extractItems(payload).filter((item) => {
        const status = String(item?.workflowStatus || item?.status || "").toUpperCase();
        return !status || status === "DRAFT" || status === "EINGEREICHT" || status === "ABGELEHNT";
    }).length;
}
function filterLieferscheinApproved(payload) {
    return extractItems(payload).filter((item) => {
        const status = String(item?.workflowStatus || item?.status || "").toUpperCase();
        return status.includes("FREIG") || status.includes("APPROV");
    }).length;
}
async function loadAreaCounts(area, projectKey) {
    const readStage = async (stage) => {
        const paths = area.endpoints[stage] || [];
        if (!paths.length)
            return { count: 0, available: false };
        const payload = await fetchFirstAvailable(paths, projectKey);
        if (area.key === "lieferscheine" && stage === "inbox") {
            return { count: filterLieferscheinInbox(payload), available: true };
        }
        if (area.key === "lieferscheine" && stage === "approved") {
            const directCount = countPayload(payload);
            const filteredCount = filterLieferscheinApproved(payload);
            return {
                count: filteredCount || directCount,
                available: true
            };
        }
        return { count: countAreaPayload(area, payload), available: true };
    };
    const results = await Promise.allSettled([
        readStage("inbox"),
        readStage("approved"),
        readStage("final")
    ]);
    const [inboxResult, approvedResult, finalResult] = results;
    const inbox = inboxResult.status === "fulfilled" ? inboxResult.value : { count: 0, available: false };
    const approved = approvedResult.status === "fulfilled" ? approvedResult.value : { count: 0, available: false };
    const final = finalResult.status === "fulfilled" ? finalResult.value : { count: 0, available: false };
    const stageMap = { inbox, approved, final };
    const requiredStages = area.requiredStages ?? (area.workflow === false ? ["final"] : ["inbox", "approved", "final"]);
    const availableRequiredStages = requiredStages.filter((stage) => stageMap[stage].available).length;
    const available = availableRequiredStages > 0;
    const errors = results.
        filter((result) => result.status === "rejected").
        map((result) => result.reason?.message).
        filter(Boolean);
    return {
        inbox: inbox.count,
        approved: approved.count,
        final: final.count,
        available,
        availableStages: availableRequiredStages,
        expectedStages: area.expectedStages ?? requiredStages.length,
        error: !available && errors.length ? errors[0] : undefined
    };
}
export default function MobileUebersicht() {
    const { getSelectedProject } = useProject();
    const project = getSelectedProject();
    const projectKey = String(project?.code || project?.id || "").trim();
    const projectLabel = String(project?.code || project?.name || project?.id || "Kein Projekt gewählt");
    const [counts, setCounts] = React.useState({});
    const [loading, setLoading] = React.useState(false);
    const [lastUpdated, setLastUpdated] = React.useState(null);
    const loadCounts = React.useCallback(async () => {
        if (!projectKey) {
            setCounts({});
            setLastUpdated(null);
            return;
        }
        setLoading(true);
        try {
            const entries = await Promise.all(AREAS.map(async (area) => {
                try {
                    return [area.key, await loadAreaCounts(area, projectKey)];
                }
                catch (error) {
                    return [
                        area.key,
                        {
                            ...EMPTY_COUNTS,
                            error: error?.message || "Daten konnten nicht geladen werden."
                        }
                    ];
                }
            }));
            setCounts(Object.fromEntries(entries));
            setLastUpdated(Date.now());
        }
        finally {
            setLoading(false);
        }
    }, [projectKey]);
    React.useEffect(() => {
        void loadCounts();
    }, [loadCounts]);
    const totals = React.useMemo(() => {
        return AREAS.reduce((sum, area) => {
            const current = counts[area.key] || EMPTY_COUNTS;
            sum.inbox += current.inbox;
            sum.approved += current.approved;
            sum.final += current.final;
            return sum;
        }, { inbox: 0, approved: 0, final: 0 });
    }, [counts]);
    return (_jsxs("div", { className: "rlc-migrated-pages-mobile-uebersicht-tsx-1520", children: [_jsxs("section", { className: rlcClass("rlc-page-hero", heroStyle), children: [_jsx("div", { className: rlcClass(null, heroBadgeStyle), children: "Mobile-Zentrale" }), _jsx("h1", { className: "rlc-migrated-pages-mobile-uebersicht-tsx-1521", children: "Mobile Inbox & Freigaben" }), _jsx("div", { className: "rlc-migrated-pages-mobile-uebersicht-tsx-1522", children: "Dokumente aus der Mobile-App zentral pr\u00FCfen. Nach der Freigabe werden sie im zust\u00E4ndigen Fachmodul weiterbearbeitet und final archiviert." }), _jsxs("div", { className: "rlc-migrated-pages-mobile-uebersicht-tsx-1523", children: [_jsxs("div", { className: "rlc-migrated-pages-mobile-uebersicht-tsx-1524", children: ["Projekt: ", projectLabel] }), _jsx("button", { type: "button", onClick: () => void loadCounts(), disabled: !projectKey || loading, className: rlcClass(null, refreshButtonStyle), children: loading ? "Server wird geprüft…" : "Aktualisieren" })] })] }), _jsxs("section", { className: rlcClass(null, summaryGridStyle), children: [_jsx(StatusCard, { label: "1. Eingang", value: String(totals.inbox), detail: "Vom Baustellenteam eingereicht" }), _jsx(StatusCard, { label: "2. Freigegeben", value: String(totals.approved), detail: "Durch Bauleitung oder B\u00FCro gepr\u00FCft" }), _jsx(StatusCard, { label: "3. Final", value: String(totals.final), detail: "Registriert oder fachlich archiviert" })] }), lastUpdated ?
                _jsxs("div", { className: "rlc-migrated-pages-mobile-uebersicht-tsx-1525", children: ["Letzte Serverabfrage: ", new Date(lastUpdated).toLocaleString("de-DE")] }) :
                null, groupOrder.map((group) => {
                const items = AREAS.filter((item) => item.group === group);
                return (_jsxs("section", { children: [_jsx("h2", { className: "rlc-migrated-pages-mobile-uebersicht-tsx-1526", children: group }), _jsx("div", { className: rlcClass(null, areaGridStyle), children: items.map((item) => _jsx(AreaCard, { area: item, counts: counts[item.key] || EMPTY_COUNTS }, item.key)) })] }, group));
            })] }));
}
function AreaCard({ area, counts }) {
    const fullyConnected = counts.availableStages >= counts.expectedStages;
    return (_jsxs(Link, { to: area.to, style: areaCardStyle, children: [_jsxs("div", { className: "rlc-migrated-pages-mobile-uebersicht-tsx-1527", children: [_jsx("div", { className: "rlc-migrated-pages-mobile-uebersicht-tsx-1528", children: area.title }), _jsx("span", { className: rlcClass(null, fullyConnected ? onlineBadgeStyle : pendingBadgeStyle), children: fullyConnected ? area.workflow === false ? "Direktmodul" : "Server" : counts.available ? "Teilweise" : "Route offen" })] }), _jsx("div", { className: "rlc-migrated-pages-mobile-uebersicht-tsx-1529", children: area.description }), _jsxs("div", { className: rlcClass(null, countsGridStyle), children: [_jsx(CountCell, { label: "Inbox", value: counts.inbox }), _jsx(CountCell, { label: "Freigegeben", value: counts.approved }), _jsx(CountCell, { label: "Final", value: counts.final })] }), !counts.available && counts.error ?
                _jsx("div", { className: "rlc-migrated-pages-mobile-uebersicht-tsx-1530", children: "Noch keine passende Server-Route erreichbar." }) :
                null, _jsxs("div", { className: "rlc-migrated-pages-mobile-uebersicht-tsx-1531", children: [area.workflow === false ? "Fachmodul öffnen" : "Eingangsprüfung öffnen", " \u2192"] })] }));
}
function CountCell({ label, value }) {
    return (_jsxs("div", { className: "rlc-migrated-pages-mobile-uebersicht-tsx-1532", children: [_jsx("div", { className: "rlc-migrated-pages-mobile-uebersicht-tsx-1533", children: label }), _jsx("div", { className: "rlc-migrated-pages-mobile-uebersicht-tsx-1534", children: value })] }));
}
function StatusCard({ label, value, detail }) {
    return (_jsxs("div", { className: rlcClass(null, statusCardStyle), children: [_jsx("div", { className: "rlc-migrated-pages-mobile-uebersicht-tsx-1535", children: label }), _jsx("div", { className: "rlc-migrated-pages-mobile-uebersicht-tsx-1536", children: value }), _jsx("div", { className: "rlc-migrated-pages-mobile-uebersicht-tsx-1537", children: detail })] }));
}
const heroStyle = {
    borderRadius: 22,
    padding: "24px 26px",
    color: "#ffffff",
    background: "linear-gradient(135deg, #0f2f8f 0%, #1554d8 62%, #146ef5 100%)",
    boxShadow: "0 18px 45px rgba(37,99,235,0.18)"
};
const heroBadgeStyle = {
    display: "inline-flex",
    padding: "5px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.25)",
    background: "rgba(255,255,255,0.10)",
    fontSize: 12,
    fontWeight: 700
};
const refreshButtonStyle = {
    border: "1px solid rgba(255,255,255,0.35)",
    background: "rgba(255,255,255,0.14)",
    color: "#ffffff",
    borderRadius: 11,
    padding: "8px 12px",
    fontWeight: 700,
    cursor: "pointer"
};
const summaryGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 12
};
const areaGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 12
};
const areaCardStyle = {
    display: "grid",
    gap: 10,
    minHeight: 215,
    padding: 16,
    border: "1px solid #dce5f2",
    borderRadius: 16,
    background: "#ffffff",
    color: "#0f172a",
    textDecoration: "none",
    boxShadow: "0 8px 24px rgba(15,23,42,0.05)"
};
const countsGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 6
};
const statusCardStyle = {
    border: "1px solid #dce5f2",
    borderRadius: 16,
    padding: 15,
    background: "#ffffff",
    boxShadow: "0 8px 24px rgba(15,23,42,0.05)"
};
const onlineBadgeStyle = {
    display: "inline-flex",
    padding: "3px 7px",
    borderRadius: 999,
    background: "#dcfce7",
    color: "#166534",
    border: "1px solid #bbf7d0",
    fontSize: 10,
    fontWeight: 700,
    whiteSpace: "nowrap"
};
const pendingBadgeStyle = {
    display: "inline-flex",
    padding: "3px 7px",
    borderRadius: 999,
    background: "#fef3c7",
    color: "#92400e",
    border: "1px solid #fde68a",
    fontSize: 10,
    fontWeight: 700,
    whiteSpace: "nowrap"
};
