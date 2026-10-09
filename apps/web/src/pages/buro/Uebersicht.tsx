import React from "react";
import { Link } from "react-router-dom";
import { apiUrl } from "../../lib/apiBase";
import { useProject } from "../../store/useProject";

type Counter = {
  value: number;
  available: boolean;
};

type OverviewData = {
  regie: Counter;
  lieferscheine: Counter;
  fotos: Counter;
  tagesberichte: Counter;
  bautagebuch: Counter;
  documents: Counter;
  members: Counter;
};

const EMPTY: Counter = { value: 0, available: false };

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
    const token =
      localStorage.getItem(key) || sessionStorage.getItem(key);

    if (token?.trim()) {
      return { Authorization: `Bearer ${token.trim()}` };
    }
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
    // Kein verwertbares Auth-Objekt.
  }

  return {};
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
    payload.members,
    payload.data,
    payload.data?.items,
    payload.data?.rows,
    payload.data?.reports,
    payload.data?.documents,
    payload.data?.files,
    payload.data?.members,
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
  return extractItems(payload).length;
}

async function request(path: string): Promise<any> {
  const response = await fetch(apiUrl(path), {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...authHeaders(),
    },
  });

  const text = await response.text();

  let payload: any = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(
      payload?.error ||
        payload?.message ||
        `HTTP ${response.status}`
    );
  }

  return payload;
}

async function readCount(path: string): Promise<Counter> {
  try {
    const payload = await request(path);
    return {
      value: countPayload(payload),
      available: true,
    };
  } catch {
    return EMPTY;
  }
}

async function readReportCount(
  path: string,
  reportType: "REGIE" | "TAGESBERICHT" | "BAUTAGEBUCH"
): Promise<Counter> {
  try {
    const payload = await request(path);

    const rows = extractItems(payload).filter((item: any) => {
      const first =
        Array.isArray(item?.rows) && item.rows.length
          ? item.rows[0]
          : item;

      const actual = String(
        item?.reportType ||
        first?.reportType ||
        item?.type ||
        first?.type ||
        "REGIE"
      )
        .trim()
        .toUpperCase();

      return actual === reportType;
    });

    return {
      value: rows.length,
      available: true,
    };
  } catch {
    return EMPTY;
  }
}

const card: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #dfe7f2",
  borderRadius: 16,
  boxShadow: "0 7px 24px rgba(15, 40, 90, .045)",
};

const moduleLink: React.CSSProperties = {
  ...card,
  display: "block",
  padding: 18,
  color: "#102a43",
  textDecoration: "none",
  minWidth: 0,
  transition: "transform .15s ease, box-shadow .15s ease",
};

const actionLink: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 38,
  padding: "0 14px",
  borderRadius: 10,
  border: "1px solid #cbd8e8",
  background: "#fff",
  color: "#164a84",
  textDecoration: "none",
  fontSize: 13,
  fontWeight: 800,
};

function KpiCard({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  detail: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        ...card,
        padding: "17px 18px",
        borderColor: accent ? "#b8d5ff" : "#dfe7f2",
      }}
    >
      <div
        style={{
          color: "#64748b",
          fontSize: 12,
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: ".04em",
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 7,
          color: accent ? "#0759d9" : "#0f2945",
          fontSize: 30,
          lineHeight: 1,
          fontWeight: 900,
        }}
      >
        {value}
      </div>

      <div
        style={{
          marginTop: 8,
          color: "#718096",
          fontSize: 12,
        }}
      >
        {detail}
      </div>
    </div>
  );
}

export default function BueroUebersicht() {
  const { getSelectedProject } = useProject();
  const project = getSelectedProject();

  const projectKey = String(
    project?.code || project?.id || ""
  ).trim();

  const [loading, setLoading] = React.useState(false);
  const [updatedAt, setUpdatedAt] = React.useState<Date | null>(null);

  const [data, setData] = React.useState<OverviewData>({
    regie: EMPTY,
    lieferscheine: EMPTY,
    fotos: EMPTY,
    tagesberichte: EMPTY,
    bautagebuch: EMPTY,
    documents: EMPTY,
    members: EMPTY,
  });

  const load = React.useCallback(async () => {
    if (!projectKey) {
      setData({
        regie: EMPTY,
        lieferscheine: EMPTY,
        fotos: EMPTY,
        tagesberichte: EMPTY,
        bautagebuch: EMPTY,
        documents: EMPTY,
        members: EMPTY,
      });
      return;
    }

    setLoading(true);

    const encoded = encodeURIComponent(projectKey);

    const [
      regie,
      lieferscheine,
      fotos,
      tagesberichte,
      bautagebuch,
      documents,
      companyDashboard,
    ] = await Promise.all([
      readCount(`/api/regie/inbox/list?projectId=${encoded}`),

      readCount(`/api/ls/inbox/list?projectId=${encoded}`),

      readCount(`/api/fotos/inbox/list?projectId=${encoded}`),

      readReportCount(
        `/api/tagesbericht/inbox/list?projectId=${encoded}`,
        "TAGESBERICHT"
      ),

      readReportCount(
        `/api/regie/inbox/list?projectId=${encoded}`,
        "BAUTAGEBUCH"
      ),

      readCount(
        `/api/files/project/${encoded}/list`
      ),

      (async (): Promise<Counter> => {
        try {
          const payload = await request(
            "/api/company/admin/dashboard"
          );

          const members = Array.isArray(payload?.members)
            ? payload.members.filter(
                (member: any) => member?.active !== false
              )
            : [];

          return {
            value: members.length,
            available: true,
          };
        } catch {
          return EMPTY;
        }
      })(),
    ]);

    setData({
      regie,
      lieferscheine,
      fotos,
      tagesberichte,
      bautagebuch,
      documents,
      members: companyDashboard,
    });

    setUpdatedAt(new Date());
    setLoading(false);
  }, [projectKey]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const openIncoming =
    (data.regie.available ? data.regie.value : 0) +
    (data.lieferscheine.available ? data.lieferscheine.value : 0) +
    (data.fotos.available ? data.fotos.value : 0) +
    (data.tagesberichte.available ? data.tagesberichte.value : 0) +
    (data.bautagebuch.available ? data.bautagebuch.value : 0);

  const incomingAreas = [
    {
      title: "Regieberichte",
      text: "Eingereichte Regieberichte prüfen und weiterbearbeiten.",
      value: data.regie,
      to: "/buro/regieberichte",
      code: "RB",
    },
    {
      title: "Lieferscheine",
      text: "Neue Lieferscheine kontrollieren und freigeben.",
      value: data.lieferscheine,
      to: "/buro/lieferscheine",
      code: "LS",
    },
    {
      title: "Projektfotos",
      text: "Neue Baustellenfotos prüfen und der Projektakte zuordnen.",
      value: data.fotos,
      to: "/buro/fotos",
      code: "FO",
    },
    {
      title: "Tagesberichte",
      text: "Tagesberichte aus der Bauausführung prüfen.",
      value: data.tagesberichte,
      to: "/buro/tagesberichte",
      code: "TB",
    },
    {
      title: "Bautagebuch",
      text: "Projektbezogene Bautagebuch-Dokumentation verwalten.",
      value: data.bautagebuch,
      to: "/buro/bautagebuch",
      code: "BT",
    },
  ];

  const modules = [
    
    {
      title: "Dokumente",
      text: "Projektdateien, Versionen und Dokumentablage.",
      to: "/buro/dokumente",
      group: "DMS",
    },
    {
      title: "Verträge",
      text: "Verträge, Nachträge und Laufzeiten verwalten.",
      to: "/buro/vertraege",
      group: "Vertrag",
    },
    {
      title: "Aufgaben",
      text: "Offene Aufgaben und Verantwortlichkeiten organisieren.",
      to: "/buro/tasks",
      group: "Workflow",
    },
    {
      title: "Kommunikation",
      text: "Projektkommunikation und interne Abstimmung.",
      to: "/buro/kommunikation",
      group: "Team",
    },
    {
      title: "Outlook & Kalender",
      text: "Termine, Erinnerungen und Kalenderorganisation.",
      to: "/buro/outlook",
      group: "Termine",
    },
    {
      title: "Nutzerverwaltung",
      text: "Mitarbeiter, Lizenzen, Rollen und Rechte.",
      to: "/buro/nutzerverwaltung",
      group: "Admin",
    },
    {
      title: "Bauzeitenplan",
      text: "Termin- und Bauablaufplanung des Projekts.",
      to: "/buro/bauzeitenplan",
      group: "Planung",
    },
    {
      title: "Personalverwaltung",
      text: "Personal und projektbezogene Mitarbeiterverwaltung.",
      to: "/buro/personalverwaltung",
      group: "Personal",
    },
    {
      title: "Maschinenverwaltung",
      text: "Maschinen und Geräte projektübergreifend verwalten.",
      to: "/buro/maschinenverwaltung",
      group: "Geräte",
    },
    {
      title: "Materialverwaltung",
      text: "Materialbedarf und Materialbewegungen organisieren.",
      to: "/buro/materialverwaltung",
      group: "Material",
    },
    {
      title: "Einsatzplanung",
      text: "Personal, Maschinen und Ressourcen koordinieren.",
      to: "/buro/ressourcenplanung",
      group: "Ressourcen",
    },
    {
      title: "Lager",
      text: "Bestände und Lagerbewegungen verwalten.",
      to: "/buro/lager",
      group: "Logistik",
    },
    {
      title: "Sicherheit",
      text: "Sicherheitsorganisation und Nachweise.",
      to: "/buro/sicherheit",
      group: "HSE",
    },
    {
      title: "Übergabe",
      text: "Projektabschluss und Übergabeunterlagen strukturieren.",
      to: "/buro/uebergabe",
      group: "Abschluss",
    },
    {
      title: "Vorlagen",
      text: "Zentrale Vorlagen für den Verwaltungsbereich.",
      to: "/buro/vorlagen",
      group: "Vorlagen",
    },
  ];

  return (
    <main
      style={{
        width: "100%",
        minWidth: 0,
        padding: "22px 24px 34px",
        boxSizing: "border-box",
        background: "#f6f9fd",
        color: "#102a43",
      }}
    >
      <section
        style={{
          background:
            "linear-gradient(112deg, #073f91 0%, #075ed7 58%, #1685f8 100%)",
          color: "#fff",
          borderRadius: 20,
          padding: "25px 26px",
          boxShadow: "0 15px 40px rgba(15,80,170,.16)",
          marginBottom: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            gap: 20,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                display: "inline-flex",
                border: "1px solid rgba(255,255,255,.35)",
                background: "rgba(255,255,255,.10)",
                borderRadius: 999,
                padding: "5px 10px",
                fontSize: 12,
                fontWeight: 850,
                marginBottom: 10,
              }}
            >
              VERWALTUNGSZENTRALE
            </div>

            <h1
              style={{
                margin: 0,
                fontSize: 30,
                lineHeight: 1.15,
              }}
            >
              Büro & Verwaltung
            </h1>

            <p
              style={{
                margin: "8px 0 0",
                color: "rgba(255,255,255,.9)",
                maxWidth: 780,
              }}
            >
              Projektorganisation, Dokumente, Prüfprozesse,
              Mitarbeiter und Ressourcen zentral steuern.
            </p>

            <div
              style={{
                marginTop: 20,
                fontWeight: 800,
              }}
            >
              Projekt:{" "}
              {projectKey
                ? `${projectKey}${
                    project?.name ? ` · ${project.name}` : ""
                  }`
                : "Kein Projekt ausgewählt"}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || !projectKey}
            style={{
              minHeight: 40,
              borderRadius: 10,
              padding: "0 15px",
              border: "1px solid rgba(255,255,255,.40)",
              background: "rgba(255,255,255,.12)",
              color: "#fff",
              fontWeight: 800,
              cursor:
                loading || !projectKey ? "default" : "pointer",
              opacity: loading || !projectKey ? 0.6 : 1,
            }}
          >
            {loading ? "Wird aktualisiert …" : "Aktualisieren"}
          </button>
        </div>
      </section>

      <div style={{marginBottom:18}}><Link className="btn btn-primary" to="/buro/cockpit">Projekt-Cockpit · Fristen und offene Vorgänge</Link></div>
      {!projectKey ? (
        <section
          style={{
            ...card,
            padding: 22,
            marginBottom: 22,
            borderColor: "#f5d78e",
            background: "#fffdf5",
          }}
        >
          <strong>Kein Projekt ausgewählt.</strong>
          <div style={{ marginTop: 5, color: "#64748b" }}>
            Wähle zuerst ein Projekt aus, damit die Verwaltungsdaten
            projektbezogen geladen werden.
          </div>
        </section>
      ) : null}

      <section
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(190px, 1fr))",
          gap: 13,
          marginBottom: 28,
        }}
      >
        <KpiCard
          label="Offene Eingänge"
          value={loading ? "…" : openIncoming}
          detail="Aktuell zu prüfen"
          accent={openIncoming > 0}
        />

        <KpiCard
          label="Dokumente"
          value={
            data.documents.available
              ? data.documents.value
              : "—"
          }
          detail="Projektdateien auf dem Server"
        />

        <KpiCard
          label="Mitarbeiter"
          value={
            data.members.available ? data.members.value : "—"
          }
          detail="Aktive Firmenmitarbeiter"
        />

        <KpiCard
          label="Projektstatus"
          value={projectKey ? "Aktiv" : "—"}
          detail={
            updatedAt
              ? `Stand ${updatedAt.toLocaleTimeString("de-DE", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}`
              : "Noch nicht geladen"
          }
        />
      </section>

      <section style={{ marginBottom: 30 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            gap: 16,
            marginBottom: 14,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                color: "#1264cf",
                fontSize: 12,
                fontWeight: 900,
                letterSpacing: ".05em",
              }}
            >
              EINGANG & PRÜFUNG
            </div>

            <h2
              style={{
                margin: "4px 0 0",
                fontSize: 22,
              }}
            >
              Aktuelle Vorgänge
            </h2>
          </div>

          <div style={{ color: "#64748b", fontSize: 13 }}>
            Direkt aus den realen Projekt-Workflows
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 12,
          }}
        >
          {incomingAreas.map((area) => (
            <Link
              key={area.title}
              to={area.to}
              style={{
                ...moduleLink,
                padding: 16,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "flex-start",
                }}
              >
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 11,
                    background: "#edf5ff",
                    color: "#0759d9",
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 900,
                    fontSize: 12,
                    flexShrink: 0,
                  }}
                >
                  {area.code}
                </div>

                <div
                  style={{
                    marginLeft: "auto",
                    minWidth: 35,
                    height: 28,
                    padding: "0 9px",
                    borderRadius: 999,
                    display: "grid",
                    placeItems: "center",
                    background:
                      area.value.available &&
                      area.value.value > 0
                        ? "#fff3db"
                        : "#f1f5f9",
                    color:
                      area.value.available &&
                      area.value.value > 0
                        ? "#a35400"
                        : "#64748b",
                    fontWeight: 900,
                    fontSize: 13,
                  }}
                >
                  {area.value.available
                    ? area.value.value
                    : "—"}
                </div>
              </div>

              <strong
                style={{
                  display: "block",
                  marginTop: 14,
                  fontSize: 16,
                }}
              >
                {area.title}
              </strong>

              <div
                style={{
                  marginTop: 5,
                  color: "#64748b",
                  fontSize: 13,
                  lineHeight: 1.45,
                }}
              >
                {area.text}
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            alignItems: "flex-end",
            marginBottom: 14,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                color: "#1264cf",
                fontSize: 12,
                fontWeight: 900,
                letterSpacing: ".05em",
              }}
            >
              VERWALTUNG
            </div>

            <h2
              style={{
                margin: "4px 0 0",
                fontSize: 22,
              }}
            >
              Arbeitsbereiche
            </h2>

            <div
              style={{
                marginTop: 5,
                color: "#64748b",
                fontSize: 13,
              }}
            >
              Direkter Zugriff auf alle Verwaltungsfunktionen.
            </div>
          </div>

          <div>
            <Link to="/start" style={actionLink}>
              Projekte öffnen
            </Link>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 12,
          }}
        >
          {modules.map((module) => (
            <Link
              key={module.to}
              to={module.to}
              style={moduleLink}
            >
              <div
                style={{
                  color: "#1264cf",
                  fontSize: 11,
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: ".04em",
                }}
              >
                {module.group}
              </div>

              <strong
                style={{
                  display: "block",
                  marginTop: 7,
                  fontSize: 16,
                }}
              >
                {module.title}
              </strong>

              <div
                style={{
                  marginTop: 6,
                  color: "#64748b",
                  fontSize: 13,
                  lineHeight: 1.45,
                }}
              >
                {module.text}
              </div>

              <div
                style={{
                  marginTop: 15,
                  color: "#0759d9",
                  fontSize: 12,
                  fontWeight: 850,
                }}
              >
                Öffnen →
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
