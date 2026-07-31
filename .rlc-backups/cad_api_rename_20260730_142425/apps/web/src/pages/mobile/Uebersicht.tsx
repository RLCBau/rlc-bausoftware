import React from "react";
import { Link } from "react-router-dom";
import { apiUrl } from "../../lib/apiBase";
import { useProject } from "../../store/useProject";

type StageCounts = {
  inbox: number;
  approved: number;
  final: number;
  available: boolean;
  availableStages: number;
  expectedStages: number;
  error?: string;
};

type MobileArea = {
  key: string;
  title: string;
  description: string;
  to: string;
  group: "Prüfung" | "Bauausführung" | "Kaufmännisch" | "KI";
  reportType?: "REGIE" | "TAGESBERICHT" | "BAUTAGEBUCH";
  workflow?: boolean;
  endpoints: {
    inbox?: string[];
    approved?: string[];
    final?: string[];
  };
};

const EMPTY_COUNTS: StageCounts = {
  inbox: 0,
  approved: 0,
  final: 0,
  available: false,
  availableStages: 0,
  expectedStages: 3,
};

const AREAS: MobileArea[] = [
  {
    key: "regieberichte",
    title: "Regieberichte",
    description: "Eingereichte Regieberichte prüfen, freigeben, ablehnen und registrieren.",
    to: "/buro/regieberichte",
    group: "Prüfung",
    reportType: "REGIE",
    endpoints: {
      inbox: ["/api/regie/inbox/list?projectId={project}"],
      approved: ["/api/regie/freigegeben/list?projectId={project}"],
      final: ["/api/regie/list?projectId={project}"],
    },
  },
  {
    key: "lieferscheine",
    title: "Lieferscheine",
    description: "Lieferscheine aus der Mobile-App kontrollieren, freigeben und final ablegen.",
    to: "/buro/lieferscheine",
    group: "Prüfung",
    endpoints: {
      inbox: ["/api/ls/inbox/list?projectId={project}"],
      approved: ["/api/ls/freigegeben/list?projectId={project}"],
      final: ["/api/ls/list?projectId={project}"],
    },
  },
  {
    key: "fotos",
    title: "Fotos / Notizen",
    description: "Baustellenfotos und Notizen prüfen und der Projektakte oder dem Aufmaß zuordnen.",
    to: "/buro/fotos",
    group: "Prüfung",
    endpoints: {
      inbox: [
        "/api/fotos/inbox/list?projectId={project}",
        "/api/photos/inbox/list?projectId={project}",
      ],
      final: [
        "/api/fotos/projects/{project}/fotos",
        "/api/photos/projects/{project}/fotos",
      ],
    },
  },
  {
    key: "tagesberichte",
    title: "Tagesberichte",
    description: "Mobile Tagesberichte im offiziellen Berichtsworkflow bearbeiten.",
    to: "/buro/tagesberichte",
    group: "Bauausführung",
    reportType: "TAGESBERICHT",
    endpoints: {
      inbox: [
        "/api/tagesbericht/inbox/list?projectId={project}",
        "/api/regie/inbox/list?projectId={project}",
      ],
      approved: ["/api/regie/freigegeben/list?projectId={project}"],
      final: ["/api/regie/list?projectId={project}"],
    },
  },
  {
    key: "bautagebuch",
    title: "Bautagebuch",
    description: "Bautagebuch-Einträge prüfen, ergänzen und dauerhaft registrieren.",
    to: "/buro/bautagebuch",
    group: "Bauausführung",
    reportType: "BAUTAGEBUCH",
    endpoints: {
      inbox: ["/api/regie/inbox/list?projectId={project}"],
      approved: ["/api/regie/freigegeben/list?projectId={project}"],
      final: ["/api/regie/list?projectId={project}"],
    },
  },
  {
    key: "mengenermittlung",
    title: "Mengenermittlung",
    description: "Erfasste Mengen prüfen und in den Aufmaß-Editor übernehmen.",
    to: "/mobile/pruefung/MENGENERMITTLUNG",
    group: "Bauausführung",
    endpoints: {
      inbox: ["/api/inbox/{project}/MENGENERMITTLUNG"],
      approved: ["/api/inbox/{project}/MENGENERMITTLUNG/approved"],
      final: ["/api/inbox/{project}/MENGENERMITTLUNG/final"],
    },
  },
  {
    key: "kalkulation",
    title: "Kalkulation",
    description: "Mobile Kalkulationsstände im zentralen Kalkulationsmodul weiterbearbeiten.",
    to: "/kalkulation/mit-ki",
    group: "Kaufmännisch",
    workflow: false,
    endpoints: {
      final: [
        "/api/kalkulation/{project}/ki",
        "/api/kalkulation/ki-handoff/{project}",
      ],
    },
  },
  {
    key: "angebote",
    title: "Angebote",
    description: "Angebote prüfen und in der Angebotsverwaltung öffnen.",
    to: "/mobile/pruefung/ANGEBOT",
    group: "Kaufmännisch",
    endpoints: {
      inbox: ["/api/inbox/{project}/ANGEBOT"],
      approved: ["/api/inbox/{project}/ANGEBOT/approved"],
      final: ["/api/inbox/{project}/ANGEBOT/final"],
    },
  },
  {
    key: "abschlagsrechnungen",
    title: "Abschlagsrechnungen",
    description: "Mobile Abschlagsrechnungen kontrollieren und in der Buchhaltung weiterführen.",
    to: "/mobile/pruefung/ABSCHLAGSRECHNUNG",
    group: "Kaufmännisch",
    endpoints: {
      inbox: ["/api/inbox/{project}/ABSCHLAGSRECHNUNG"],
      approved: ["/api/inbox/{project}/ABSCHLAGSRECHNUNG/approved"],
      final: ["/api/inbox/{project}/ABSCHLAGSRECHNUNG/final"],
    },
  },
  {
    key: "rechnungen",
    title: "Rechnungen",
    description: "Rechnungen prüfen und im Buchhaltungsmodul bearbeiten.",
    to: "/mobile/pruefung/RECHNUNG",
    group: "Kaufmännisch",
    endpoints: {
      inbox: ["/api/inbox/{project}/RECHNUNG"],
      approved: ["/api/inbox/{project}/RECHNUNG/approved"],
      final: ["/api/inbox/{project}/RECHNUNG/final"],
    },
  },
  {
    key: "outlier",
    title: "Outlier Reports",
    description: "Auffällige Preise und Mengen im Analysebereich kontrollieren.",
    to: "/kalkulation/versionsvergleich",
    group: "KI",
    workflow: false,
    endpoints: {
      final: ["/api/global-knowledge/outliers"],
    },
  },
];

const groupOrder: MobileArea["group"][] = [
  "Prüfung",
  "Bauausführung",
  "Kaufmännisch",
  "KI",
];

function authHeaders(): Record<string, string> {
  const keys = [
    "rlc_token",
    "token",
    "authToken",
    "accessToken",
    "rlc.auth.token",
    "rlc_mobile_token",
    "rlc_auth_token",
    "rlc_access_token",
  ];

  for (const key of keys) {
    const token = localStorage.getItem(key) || sessionStorage.getItem(key);
    if (token?.trim()) return { Authorization: `Bearer ${token.trim()}` };
  }

  try {
    const raw =
      localStorage.getItem("auth") ||
      localStorage.getItem("rlc_auth") ||
      localStorage.getItem("user");
    if (raw) {
      const parsed = JSON.parse(raw);
      const token =
        parsed?.token ||
        parsed?.accessToken ||
        parsed?.authToken ||
        parsed?.data?.token ||
        parsed?.data?.accessToken;
      if (typeof token === "string" && token.trim()) {
        return { Authorization: `Bearer ${token.trim()}` };
      }
    }
  } catch {
    // Kein verwertbares Auth-Objekt vorhanden.
  }

  return {};
}

function resolvePath(path: string, projectKey: string) {
  return path.split("{project}").join(encodeURIComponent(projectKey));
}

function extractItems(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

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
    payload.data?.list,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  return [];
}

function countPayload(payload: any): number {
  if (typeof payload?.count === "number") return payload.count;
  if (typeof payload?.total === "number") return payload.total;
  if (typeof payload?.totalCount === "number") return payload.totalCount;
  const items = extractItems(payload);
  if (items.length) return items.length;
  if (payload?.exists === true) return 1;
  if (payload?.ok === true && payload?.data && typeof payload.data === "object") return 1;
  return 0;
}

function countAreaPayload(area: MobileArea, payload: any): number {
  if (!area.reportType) return countPayload(payload);

  const expected = area.reportType;
  return extractItems(payload).filter((item: any) => {
    const actual = String(item?.reportType || "REGIE").trim().toUpperCase();
    return actual === expected;
  }).length;
}

async function fetchFirstAvailable(paths: string[], projectKey: string) {
  let lastError = "Keine passende Server-Route gefunden.";

  for (const candidate of paths) {
    const path = resolvePath(candidate, projectKey);

    try {
      const response = await fetch(apiUrl(path), {
        credentials: "include",
        headers: {
          Accept: "application/json",
          ...authHeaders(),
        },
      });

      const raw = await response.text();
      let payload: any = {};

      try {
        payload = raw ? JSON.parse(raw) : {};
      } catch {
        payload = {};
      }

      if (response.ok) return payload;

      if (response.status !== 404) {
        lastError = payload?.error || payload?.message || `HTTP ${response.status}`;
      }
    } catch (error: any) {
      lastError = error?.message || "Server nicht erreichbar.";
    }
  }

  throw new Error(lastError);
}

function filterLieferscheinInbox(payload: any) {
  return extractItems(payload).filter((item: any) => {
    const status = String(item?.workflowStatus || item?.status || "").toUpperCase();
    return !status || status === "DRAFT" || status === "EINGEREICHT" || status === "ABGELEHNT";
  }).length;
}

function filterLieferscheinApproved(payload: any) {
  return extractItems(payload).filter((item: any) => {
    const status = String(item?.workflowStatus || item?.status || "").toUpperCase();
    return status.includes("FREIG") || status.includes("APPROV");
  }).length;
}

async function loadAreaCounts(area: MobileArea, projectKey: string): Promise<StageCounts> {
  const readStage = async (stage: keyof MobileArea["endpoints"]) => {
    const paths = area.endpoints[stage] || [];
    if (!paths.length) return { count: 0, available: false };

    const payload = await fetchFirstAvailable(paths, projectKey);

    if (area.key === "lieferscheine" && stage === "inbox") {
      return { count: filterLieferscheinInbox(payload), available: true };
    }

    if (area.key === "lieferscheine" && stage === "approved") {
      const directCount = countPayload(payload);
      const filteredCount = filterLieferscheinApproved(payload);
      return {
        count: filteredCount || directCount,
        available: true,
      };
    }

    return { count: countAreaPayload(area, payload), available: true };
  };

  const results = await Promise.allSettled([
    readStage("inbox"),
    readStage("approved"),
    readStage("final"),
  ]);

  const [inboxResult, approvedResult, finalResult] = results;

  const inbox = inboxResult.status === "fulfilled" ? inboxResult.value : { count: 0, available: false };
  const approved =
    approvedResult.status === "fulfilled" ? approvedResult.value : { count: 0, available: false };
  const final = finalResult.status === "fulfilled" ? finalResult.value : { count: 0, available: false };

  const available = inbox.available || approved.available || final.available;
  const errors = results
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) => result.reason?.message)
    .filter(Boolean);

  return {
    inbox: inbox.count,
    approved: approved.count,
    final: final.count,
    available,
    availableStages: [inbox, approved, final].filter((stage) => stage.available).length,
    expectedStages: area.workflow === false ? 1 : 3,
    error: !available && errors.length ? errors[0] : undefined,
  };
}

export default function MobileUebersicht() {
  const { getSelectedProject } = useProject();
  const project = getSelectedProject();

  const projectKey = String(project?.code || project?.id || "").trim();
  const projectLabel = String(
    project?.code || project?.name || project?.id || "Kein Projekt gewählt"
  );

  const [counts, setCounts] = React.useState<Record<string, StageCounts>>({});
  const [loading, setLoading] = React.useState(false);
  const [lastUpdated, setLastUpdated] = React.useState<number | null>(null);

  const loadCounts = React.useCallback(async () => {
    if (!projectKey) {
      setCounts({});
      setLastUpdated(null);
      return;
    }

    setLoading(true);

    try {
      const entries = await Promise.all(
        AREAS.map(async (area) => {
          try {
            return [area.key, await loadAreaCounts(area, projectKey)] as const;
          } catch (error: any) {
            return [
              area.key,
              {
                ...EMPTY_COUNTS,
                error: error?.message || "Daten konnten nicht geladen werden.",
              },
            ] as const;
          }
        })
      );

      setCounts(Object.fromEntries(entries));
      setLastUpdated(Date.now());
    } finally {
      setLoading(false);
    }
  }, [projectKey]);

  React.useEffect(() => {
    void loadCounts();
  }, [loadCounts]);

  const totals = React.useMemo(() => {
    return AREAS.reduce(
      (sum, area) => {
        const current = counts[area.key] || EMPTY_COUNTS;
        sum.inbox += current.inbox;
        sum.approved += current.approved;
        sum.final += current.final;
        return sum;
      },
      { inbox: 0, approved: 0, final: 0 }
    );
  }, [counts]);

  return (
    <div style={{ display: "grid", gap: 18, padding: "4px 0 28px" }}>
      <section style={heroStyle}>
        <div style={heroBadgeStyle}>Mobile-Zentrale</div>

        <h1 style={{ margin: "12px 0 6px", fontSize: 30 }}>
          Mobile Inbox &amp; Freigaben
        </h1>

        <div style={{ maxWidth: 900, lineHeight: 1.55, opacity: 0.94 }}>
          Dokumente aus der Mobile-App zentral prüfen. Nach der Freigabe werden sie im zuständigen
          Fachmodul weiterbearbeitet und final archiviert.
        </div>

        <div
          style={{
            marginTop: 15,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 800 }}>Projekt: {projectLabel}</div>

          <button
            type="button"
            onClick={() => void loadCounts()}
            disabled={!projectKey || loading}
            style={refreshButtonStyle}
          >
            {loading ? "Server wird geprüft…" : "Aktualisieren"}
          </button>
        </div>
      </section>

      <section style={summaryGridStyle}>
        <StatusCard label="1. Eingang" value={String(totals.inbox)} detail="Vom Baustellenteam eingereicht" />
        <StatusCard
          label="2. Freigegeben"
          value={String(totals.approved)}
          detail="Durch Bauleitung oder Büro geprüft"
        />
        <StatusCard label="3. Final" value={String(totals.final)} detail="Registriert oder fachlich archiviert" />
      </section>

      {lastUpdated ? (
        <div style={{ color: "#64748b", fontSize: 12 }}>
          Letzte Serverabfrage: {new Date(lastUpdated).toLocaleString("de-DE")}
        </div>
      ) : null}

      {groupOrder.map((group) => {
        const items = AREAS.filter((item) => item.group === group);

        return (
          <section key={group}>
            <h2 style={{ margin: "0 0 10px", fontSize: 18 }}>{group}</h2>

            <div style={areaGridStyle}>
              {items.map((item) => (
                <AreaCard key={item.key} area={item} counts={counts[item.key] || EMPTY_COUNTS} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function AreaCard({ area, counts }: { area: MobileArea; counts: StageCounts }) {
  const fullyConnected = counts.availableStages >= counts.expectedStages;
  return (
    <Link to={area.to} style={areaCardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div style={{ fontSize: 17, fontWeight: 950 }}>{area.title}</div>
        <span style={fullyConnected ? onlineBadgeStyle : pendingBadgeStyle}>
          {fullyConnected ? (area.workflow === false ? "Direktmodul" : "Server") : counts.available ? "Teilweise" : "Route offen"}
        </span>
      </div>

      <div style={{ color: "#64748b", fontSize: 13, lineHeight: 1.5 }}>{area.description}</div>

      <div style={countsGridStyle}>
        <CountCell label="Inbox" value={counts.inbox} />
        <CountCell label="Freigegeben" value={counts.approved} />
        <CountCell label="Final" value={counts.final} />
      </div>

      {!counts.available && counts.error ? (
        <div style={{ fontSize: 11, color: "#92400e", lineHeight: 1.35 }}>
          Noch keine passende Server-Route erreichbar.
        </div>
      ) : null}

      <div style={{ marginTop: "auto", color: "#1d4ed8", fontSize: 12, fontWeight: 900 }}>
        {area.workflow === false ? "Fachmodul öffnen" : "Eingangsprüfung öffnen"} →
      </div>
    </Link>
  );
}

function CountCell({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "7px 8px", background: "#f8fafc" }}>
      <div style={{ color: "#64748b", fontSize: 10, fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 2, fontSize: 17, fontWeight: 950 }}>{value}</div>
    </div>
  );
}

function StatusCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div style={statusCardStyle}>
      <div style={{ color: "#64748b", fontSize: 12, fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 7, fontSize: 24, fontWeight: 950 }}>{value}</div>
      <div style={{ marginTop: 4, color: "#64748b", fontSize: 12 }}>{detail}</div>
    </div>
  );
}

const heroStyle: React.CSSProperties = {
  borderRadius: 22,
  padding: "24px 26px",
  color: "#ffffff",
  background: "linear-gradient(135deg, #0f2f8f 0%, #1554d8 62%, #2563eb 100%)",
  boxShadow: "0 18px 45px rgba(37,99,235,0.18)",
};

const heroBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  padding: "5px 10px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.25)",
  background: "rgba(255,255,255,0.10)",
  fontSize: 12,
  fontWeight: 900,
};

const refreshButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.35)",
  background: "rgba(255,255,255,0.14)",
  color: "#ffffff",
  borderRadius: 11,
  padding: "8px 12px",
  fontWeight: 900,
  cursor: "pointer",
};

const summaryGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 12,
};

const areaGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 12,
};

const areaCardStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
  minHeight: 215,
  padding: 16,
  border: "1px solid #dce5f2",
  borderRadius: 16,
  background: "#ffffff",
  color: "#0f172a",
  textDecoration: "none",
  boxShadow: "0 8px 24px rgba(15,23,42,0.05)",
};

const countsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 6,
};

const statusCardStyle: React.CSSProperties = {
  border: "1px solid #dce5f2",
  borderRadius: 16,
  padding: 15,
  background: "#ffffff",
  boxShadow: "0 8px 24px rgba(15,23,42,0.05)",
};

const onlineBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  padding: "3px 7px",
  borderRadius: 999,
  background: "#dcfce7",
  color: "#166534",
  border: "1px solid #bbf7d0",
  fontSize: 10,
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const pendingBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  padding: "3px 7px",
  borderRadius: 999,
  background: "#fef3c7",
  color: "#92400e",
  border: "1px solid #fde68a",
  fontSize: 10,
  fontWeight: 900,
  whiteSpace: "nowrap",
};
