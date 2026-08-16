import React from "react";
import { apiUrl } from "../../lib/apiBase";

type Company = {
  id: string;
  code: string;
  name: string;
  email?: string | null;
  createdAt: string;
  subscription?: {
    status: string;
    plan: string;
    webSeatsPurchased: number;
    mobileSeatsPurchased: number;
    cloudEnabled: boolean;
    currentPeriodEnd?: string | null;
  } | null;
  _count: {
    members: number;
    users: number;
    projects: number;
    mobileLicenses: number;
  };
};

function authHeaders(): Record<string, string> {
  for (const key of [
    "rlc_token",
    "token",
    "authToken",
    "accessToken",
    "rlc_auth_token",
  ]) {
    const token =
      localStorage.getItem(key) || sessionStorage.getItem(key);

    if (token?.trim()) {
      return { Authorization: `Bearer ${token.trim()}` };
    }
  }

  return {};
}

export default function PlatformAdmin() {
  const [companies, setCompanies] = React.useState<Company[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        apiUrl("/api/platform/admin/companies"),
        {
          credentials: "include",
          headers: {
            Accept: "application/json",
            ...authHeaders(),
          },
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${response.status}`);
      }

      setCompanies(
        Array.isArray(data.companies) ? data.companies : []
      );
    } catch (e: any) {
      setError(e?.message || "Firmen konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function updateSubscription(
    companyId: string,
    patch: Record<string, unknown>
  ) {
    setSaving(companyId);
    setError("");

    try {
      const response = await fetch(
        apiUrl(`/api/platform/admin/companies/${companyId}/subscription`),
        {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            ...authHeaders(),
          },
          body: JSON.stringify(patch),
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${response.status}`);
      }

      await load();
    } catch (e: any) {
      setError(e?.message || "Änderung fehlgeschlagen.");
    } finally {
      setSaving("");
    }
  }

  return (
    <div style={{ padding: 24, display: "grid", gap: 18 }}>
      <section
        style={{
          padding: 24,
          borderRadius: 20,
          color: "white",
          background:
            "linear-gradient(135deg,#071b47,#0f3d91,#2563eb)",
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.8 }}>
          RLC PLATFORM
        </div>

        <h1 style={{ margin: "7px 0" }}>Super-Admin</h1>

        <div style={{ opacity: 0.9 }}>
          Firmen, Lizenzen, Cloud und Abonnements zentral verwalten.
        </div>
      </section>

      {error ? (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            background: "#fef2f2",
            color: "#991b1b",
          }}
        >
          {error}
        </div>
      ) : null}

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <strong>{companies.length} Firmen</strong>

        <button onClick={() => void load()} disabled={loading}>
          {loading ? "Lädt..." : "Aktualisieren"}
        </button>
      </div>

      <div style={{ display: "grid", gap: 14 }}>
        {companies.map((company) => {
          const sub = company.subscription;

          return (
            <section
              key={company.id}
              style={{
                background: "white",
                border: "1px solid #dbe4f0",
                borderRadius: 16,
                padding: 18,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 16,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div style={{ fontSize: 19, fontWeight: 950 }}>
                    {company.name}
                  </div>

                  <div style={{ color: "#64748b", fontSize: 13 }}>
                    {company.code} · {company.email || "Keine E-Mail"}
                  </div>
                </div>

                <select
                  value={sub?.status || "EXPIRED"}
                  disabled={saving === company.id}
                  onChange={(e) =>
                    void updateSubscription(company.id, {
                      status: e.target.value,
                    })
                  }
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="GRACE">GRACE</option>
                  <option value="EXPIRED">EXPIRED</option>
                </select>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit,minmax(150px,1fr))",
                  gap: 12,
                  marginTop: 18,
                }}
              >
                <Stat label="Web-Lizenzen" value={sub?.webSeatsPurchased ?? 0} />
                <Stat label="Mobile-Lizenzen" value={sub?.mobileSeatsPurchased ?? 0} />
                <Stat label="Mitglieder" value={company._count.members} />
                <Stat label="Projekte" value={company._count.projects} />
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 12,
                  flexWrap: "wrap",
                  marginTop: 18,
                  alignItems: "center",
                }}
              >
                <label>
                  Web Seats{" "}
                  <input
                    type="number"
                    min={0}
                    defaultValue={sub?.webSeatsPurchased ?? 0}
                    onBlur={(e) =>
                      void updateSubscription(company.id, {
                        webSeatsPurchased: Number(e.target.value),
                      })
                    }
                    style={{ width: 75 }}
                  />
                </label>

                <label>
                  Mobile Seats{" "}
                  <input
                    type="number"
                    min={0}
                    defaultValue={sub?.mobileSeatsPurchased ?? 0}
                    onBlur={(e) =>
                      void updateSubscription(company.id, {
                        mobileSeatsPurchased: Number(e.target.value),
                      })
                    }
                    style={{ width: 75 }}
                  />
                </label>

                <label>
                  <input
                    type="checkbox"
                    checked={!!sub?.cloudEnabled}
                    onChange={(e) =>
                      void updateSubscription(company.id, {
                        cloudEnabled: e.target.checked,
                      })
                    }
                  />{" "}
                  Cloud
                </label>

                <select
                  value={sub?.plan || "BASIC_5"}
                  onChange={(e) =>
                    void updateSubscription(company.id, {
                      plan: e.target.value,
                    })
                  }
                >
                  <option value="BASIC_5">BASIC 5</option>
                  <option value="PRO_20">PRO 20</option>
                  <option value="MAX_UNLIMITED">MAX UNLIMITED</option>
                </select>
              </div>
            </section>
          );
        })}
      </div>

      {!loading && companies.length === 0 ? (
        <div style={{ color: "#64748b" }}>
          Keine Firmen vorhanden.
        </div>
      ) : null}
    </div>
  );
}

function Stat(props: { label: string; value: number }) {
  return (
    <div
      style={{
        padding: 12,
        background: "#f8fafc",
        borderRadius: 11,
      }}
    >
      <div style={{ color: "#64748b", fontSize: 12 }}>
        {props.label}
      </div>

      <div style={{ fontSize: 22, fontWeight: 950 }}>
        {props.value}
      </div>
    </div>
  );
}
