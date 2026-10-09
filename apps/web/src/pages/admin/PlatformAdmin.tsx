import React from "react";
import { apiUrl } from "../../lib/apiBase";

type Subscription = {
  status: string;
  plan: string;
  webSeatsPurchased: number;
  mobileSeatsPurchased: number;
  cloudEnabled: boolean;
  aiMarketMonthlyIncluded?: number;
  aiMarketMonthlyUsed?: number;
  aiMarketMonthKey?: string | null;
  aiMarketCreditsPurchased?: number;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
};

type CompanyListItem = {
  id: string;
  code: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  subscription?: Subscription | null;
  _count: {
    members: number;
    users: number;
    projects: number;
    mobileLicenses: number;
  };
};

type Invite = {
  id: string;
  email?: string | null;
  role: string;
  code: string;
  maxUses: number;
  usedCount: number;
  isActive: boolean;
  expiresAt: string;
  createdAt: string;
  acceptedAt?: string | null;
};

type MobileLicense = {
  id: string;
  code: string;
  role: string;
  status: string;
  employeeName?: string | null;
  employeeEmail?: string | null;
  deviceName?: string | null;
  deviceId?: string | null;
  appVersion?: string | null;
  activatedAt?: string | null;
  lastLoginAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
};

type Member = {
  id: string;
  role: string;
  active: boolean;
  createdAt: string;
  user: {
    id: string;
    name?: string | null;
    email: string;
    role: string;
    createdAt: string;
  };
};

type Project = {
  id: string;
  code: string;
  name: string;
  status: string;
  client?: string | null;
  place?: string | null;
  createdAt: string;
};

type AiMarketOrder = {
  id: string;
  credits: number;
  priceCents: number;
  status: string;
  createdAt: string;
  paidAt?: string | null;
  creditedAt?: string | null;
};

type AiMarketOverview = {
  monthKey: string;
  summary?: { _count?: { _all?: number }; _sum?: Record<string, any> };
  balance?: { included: number; used: number; includedRemaining: number; purchasedRemaining: number; totalRemaining: number };
  orders?: AiMarketOrder[];
  byModel?: any[];
  sales?: { paidRevenueCentsMonth: number; paidCreditsMonth: number; paidOrdersMonth: number; pendingOrders: number };
};

type CompanyDetail = {
  id: string;
  code: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  logoPath?: string | null;
  createdAt: string;
  updatedAt: string;
  subscription?: Subscription | null;
  members: Member[];
  invites: Invite[];
  mobileLicenses: MobileLicense[];
  projects: Project[];
};

function authHeaders(): Record<string, string> {
  const keys = [
    "rlc_token",
    "token",
    "authToken",
    "accessToken",
    "rlc.auth.token",
    "rlc_mobile_token",
  ];

  for (const key of keys) {
    const token =
      localStorage.getItem(key) ||
      sessionStorage.getItem(key);

    if (token?.trim()) {
      return {
        Authorization: `Bearer ${token.trim()}`,
      };
    }
  }

  try {
    const auth = JSON.parse(localStorage.getItem("rlc_auth") || "null");
    if (auth?.token) {
      return { Authorization: `Bearer ${String(auth.token)}` };
    }
  } catch {}

  return {};
}

async function apiRequest(
  path: string,
  options: RequestInit = {}
) {
  const response = await fetch(apiUrl(path), {
    credentials: "include",
    ...options,
    headers: {
      Accept: "application/json",
      ...authHeaders(),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || `HTTP ${response.status}`);
  }

  return data;
}

const card: React.CSSProperties = {
  background: "white",
  border: "1px solid #dbe4f0",
  borderRadius: 12,
  overflow: "hidden",
};

const sectionHead: React.CSSProperties = {
  padding: "10px 14px",
  background: "#f8fafc",
  borderBottom: "1px solid #e2e8f0",
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
  gap: 8,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  borderRadius: 9,
  border: "1px solid #cbd5e1",
  background: "white",
};

const buttonStyle: React.CSSProperties = {
  padding: "9px 13px",
  borderRadius: 9,
  border: "1px solid #cbd5e1",
  background: "white",
  cursor: "pointer",
  fontWeight: 800,
};

const primaryButton: React.CSSProperties = {
  ...buttonStyle,
  border: "1px solid #1d4ed8",
  background: "#1d4ed8",
  color: "white",
};

function Label({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "grid", gap: 5 }}>
      <span style={{ fontSize: 12, fontWeight: 800, color: "#475569" }}>
        {title}
      </span>
      {children}
    </label>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div
      style={{
        padding: 10,
        borderRadius: 12,
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
      }}
    >
      <div style={{ color: "#64748b", fontSize: 12 }}>{label}</div>
      <div style={{ marginTop: 3, fontWeight: 950, fontSize: 18 }}>
        {value}
      </div>
    </div>
  );
}

function fmtDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("de-DE");
}

export default function PlatformAdmin() {
  const [companies, setCompanies] = React.useState<CompanyListItem[]>([]);
  const [selectedId, setSelectedId] = React.useState("");
  const [company, setCompany] = React.useState<CompanyDetail | null>(null);
  const [aiOverview, setAiOverview] = React.useState<AiMarketOverview | null>(null);

  const [loading, setLoading] = React.useState(true);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [saving, setSaving] = React.useState("");
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");

  const [companyForm, setCompanyForm] = React.useState({
    name: "",
    code: "",
    email: "",
    phone: "",
    address: "",
  });

  const [newCompany, setNewCompany] = React.useState({
    name: "",
    code: "",
    email: "",
    phone: "",
    address: "",
    webSeatsPurchased: 1,
    mobileSeatsPurchased: 0,
    cloudEnabled: true,
  });

  const [inviteForm, setInviteForm] = React.useState({
    email: "",
    role: "MITARBEITER",
    ttlDays: 30,
    maxUses: 1,
  });

  const [mobileForm, setMobileForm] = React.useState({
    role: "MITARBEITER",
    employeeName: "",
    employeeEmail: "",
    deviceName: "",
    expiresAt: "",
  });

  const loadCompanies = React.useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await apiRequest("/api/platform/admin/companies");
      const rows = Array.isArray(data.companies) ? data.companies : [];

      setCompanies(rows);

      setSelectedId((current) => {
        if (current && rows.some((x: CompanyListItem) => x.id === current)) {
          return current;
        }
        return rows[0]?.id || "";
      });
    } catch (e: any) {
      setError(e?.message || "Firmen konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAiOverview = React.useCallback(async (companyId: string) => {
    if (!companyId) {
      setAiOverview(null);
      return;
    }
    try {
      const data = await apiRequest(`/api/platform/admin/companies/${encodeURIComponent(companyId)}/ai-market-overview`);
      setAiOverview(data as AiMarketOverview);
    } catch (e: any) {
      setError(e?.message || "KI-Marktverbrauch konnte nicht geladen werden.");
    }
  }, []);

  const loadCompany = React.useCallback(async (companyId: string) => {
    if (!companyId) {
      setCompany(null);
      return;
    }

    setDetailLoading(true);
    setError("");

    try {
      const data = await apiRequest(
        `/api/platform/admin/companies/${encodeURIComponent(companyId)}`
      );

      const detail = data.company as CompanyDetail;
      setCompany(detail);

      setCompanyForm({
        name: detail.name || "",
        code: detail.code || "",
        email: detail.email || "",
        phone: detail.phone || "",
        address: detail.address || "",
      });
    } catch (e: any) {
      setError(e?.message || "Firmendaten konnten nicht geladen werden.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadCompanies();
  }, [loadCompanies]);

  React.useEffect(() => {
    if (selectedId) {
      void loadCompany(selectedId);
      void loadAiOverview(selectedId);
    }
  }, [selectedId, loadCompany, loadAiOverview]);

  async function refreshSelected() {
    await loadCompanies();
    if (selectedId) {
      await Promise.all([loadCompany(selectedId), loadAiOverview(selectedId)]);
    }
  }

  async function createCompany() {
    if (!newCompany.name.trim() || !newCompany.code.trim()) {
      setError("Firmenname und Firmencode sind erforderlich.");
      return;
    }

    setSaving("new-company");
    setError("");
    setMessage("");

    try {
      const data = await apiRequest("/api/platform/admin/companies", {
        method: "POST",
        body: JSON.stringify(newCompany),
      });

      setMessage("Firma wurde angelegt.");
      setNewCompany({
        name: "",
        code: "",
        email: "",
        phone: "",
        address: "",
        webSeatsPurchased: 1,
        mobileSeatsPurchased: 0,
        cloudEnabled: true,
      });

      await loadCompanies();

      if (data.company?.id) {
        setSelectedId(String(data.company.id));
      }
    } catch (e: any) {
      setError(e?.message || "Firma konnte nicht angelegt werden.");
    } finally {
      setSaving("");
    }
  }

  async function saveCompany() {
    if (!company) return;

    setSaving("company");
    setError("");
    setMessage("");

    try {
      await apiRequest(
        `/api/platform/admin/companies/${company.id}`,
        {
          method: "PATCH",
          body: JSON.stringify(companyForm),
        }
      );

      setMessage("Firmendaten wurden gespeichert.");
      await refreshSelected();
    } catch (e: any) {
      setError(e?.message || "Firmendaten konnten nicht gespeichert werden.");
    } finally {
      setSaving("");
    }
  }

  async function updateSubscription(patch: Record<string, unknown>) {
    if (!company) return;

    setSaving("subscription");
    setError("");
    setMessage("");

    try {
      await apiRequest(
        `/api/platform/admin/companies/${company.id}/subscription`,
        {
          method: "PATCH",
          body: JSON.stringify(patch),
        }
      );

      setMessage("Lizenzdaten wurden aktualisiert.");
      await refreshSelected();
    } catch (e: any) {
      setError(e?.message || "Lizenzdaten konnten nicht gespeichert werden.");
    } finally {
      setSaving("");
    }
  }

  async function confirmAiMarketOrder(order: AiMarketOrder) {
    if (!company) return;
    if (!window.confirm(`${order.credits} RLC Marktpreis-Credits als bezahlt markieren und freischalten?`)) return;
    setSaving(order.id);
    setError("");
    setMessage("");
    try {
      await apiRequest(`/api/platform/admin/companies/${company.id}/ai-market-orders/${order.id}/confirm`, { method: "POST" });
      setMessage(`${order.credits} RLC Marktpreis-Credits wurden freigeschaltet.`);
      await refreshSelected();
    } catch (e: any) {
      setError(e?.message || "Credits konnten nicht freigeschaltet werden.");
    } finally { setSaving(""); }
  }

  async function cancelAiMarketOrder(order: AiMarketOrder) {
    if (!company) return;
    if (!window.confirm(`Offene Buchung über ${order.credits} Credits stornieren?`)) return;
    setSaving(order.id);
    try {
      await apiRequest(`/api/platform/admin/companies/${company.id}/ai-market-orders/${order.id}/cancel`, { method: "POST" });
      setMessage("Buchung wurde storniert.");
      await refreshSelected();
    } catch (e: any) {
      setError(e?.message || "Buchung konnte nicht storniert werden.");
    } finally { setSaving(""); }
  }

  async function createInvite() {
    if (!company) return;

    setSaving("invite");
    setError("");
    setMessage("");

    try {
      const data = await apiRequest(
        `/api/platform/admin/companies/${company.id}/invites`,
        {
          method: "POST",
          body: JSON.stringify(inviteForm),
        }
      );

      setMessage(`Web-Code erstellt: ${data.invite?.code || ""}`);
      setInviteForm({
        email: "",
        role: "MITARBEITER",
        ttlDays: 30,
        maxUses: 1,
      });

      await loadCompany(company.id);
    } catch (e: any) {
      setError(e?.message || "Web-Code konnte nicht erstellt werden.");
    } finally {
      setSaving("");
    }
  }

  async function setInviteActive(invite: Invite, isActive: boolean) {
    if (!company) return;

    setSaving(invite.id);

    try {
      await apiRequest(
        `/api/platform/admin/companies/${company.id}/invites/${invite.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ isActive }),
        }
      );

      await loadCompany(company.id);
    } catch (e: any) {
      setError(e?.message || "Web-Code konnte nicht geändert werden.");
    } finally {
      setSaving("");
    }
  }

  async function createMobileLicense() {
    if (!company) return;

    setSaving("mobile");
    setError("");
    setMessage("");

    try {
      const data = await apiRequest(
        `/api/platform/admin/companies/${company.id}/mobile-licenses`,
        {
          method: "POST",
          body: JSON.stringify({
            ...mobileForm,
            expiresAt: mobileForm.expiresAt || null,
          }),
        }
      );

      setMessage(
        `Mobile-Code erstellt: ${data.mobileLicense?.code || ""}`
      );

      setMobileForm({
        role: "MITARBEITER",
        employeeName: "",
        employeeEmail: "",
        deviceName: "",
        expiresAt: "",
      });

      await loadCompany(company.id);
    } catch (e: any) {
      setError(e?.message || "Mobile-Code konnte nicht erstellt werden.");
    } finally {
      setSaving("");
    }
  }

  async function updateMobileLicense(
    license: MobileLicense,
    patch: Record<string, unknown>
  ) {
    if (!company) return;

    setSaving(license.id);

    try {
      await apiRequest(
        `/api/platform/admin/companies/${company.id}/mobile-licenses/${license.id}`,
        {
          method: "PATCH",
          body: JSON.stringify(patch),
        }
      );

      await loadCompany(company.id);
    } catch (e: any) {
      setError(e?.message || "Mobile-Lizenz konnte nicht geändert werden.");
    } finally {
      setSaving("");
    }
  }

  async function deleteMobileLicense(license: MobileLicense) {
    if (!company) return;

    if (!window.confirm(`Mobile-Code ${license.code} wirklich löschen?`)) {
      return;
    }

    setSaving(license.id);

    try {
      await apiRequest(
        `/api/platform/admin/companies/${company.id}/mobile-licenses/${license.id}`,
        {
          method: "DELETE",
        }
      );

      await loadCompany(company.id);
    } catch (e: any) {
      setError(e?.message || "Mobile-Lizenz konnte nicht gelöscht werden.");
    } finally {
      setSaving("");
    }
  }

  const sub = company?.subscription;

  return (
    <div
      style={{
        padding: 16,
        display: "grid",
        gap: 12,
        maxWidth: 1500,
        margin: "0 auto",
      }}
    >
      <section
        style={{
          padding: 16,
          borderRadius: 14,
          color: "white",
          background:
            "linear-gradient(135deg,#071b47,#0f3d91,#2563eb)",
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.85 }}>
          RLC PLATTFORMVERWALTUNG
        </div>

        <h1 style={{ margin: "7px 0" }}>Firmenverwaltung</h1>

        <div style={{ opacity: 0.92 }}>
          Firmen, Benutzer, Web-Lizenzen, Mobile-Lizenzen,
          Cloud und Freischaltcodes zentral verwalten.
        </div>

        <button
          type="button"
          onClick={() => {
            [
              "rlc_token",
              "token",
              "authToken",
              "rlc_auth",
              "rlc_user",
              "rlc_company",
              "rlc_company_id",
              "rlc_active_project",
              "rlc_active_project_id",
            ].forEach((key) => {
              localStorage.removeItem(key);
              sessionStorage.removeItem(key);
            });
            window.location.replace("/login?release=portal-v1");
          }}
          style={{
            marginTop: 18,
            padding: "10px 16px",
            borderRadius: 9,
            border: "1px solid rgba(255,255,255,0.72)",
            background: "white",
            color: "#b91c1c",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          Abmelden
        </button>
      </section>

      {error ? (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#991b1b",
          }}
        >
          {error}
        </div>
      ) : null}

      {message ? (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            border: "1px solid #bbf7d0",
            background: "#f0fdf4",
            color: "#166534",
          }}
        >
          {message}
        </div>
      ) : null}

      <section style={card}>
        <div style={sectionHead}>
          <strong>Firma auswählen</strong>
        </div>

        <div
          style={{
            padding: 16,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            style={{
              ...inputStyle,
              maxWidth: 520,
              fontWeight: 800,
            }}
          >
            <option value="">Firma auswählen...</option>

            {companies.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.code}
              </option>
            ))}
          </select>

          <button
            type="button"
            style={buttonStyle}
            disabled={loading}
            onClick={() => void loadCompanies()}
          >
            {loading ? "Lädt..." : "Aktualisieren"}
          </button>

          <div style={{ marginLeft: "auto", fontWeight: 900 }}>
            {companies.length} Firmen
          </div>
        </div>
      </section>

      <details style={card}>
        <summary style={{ ...sectionHead, cursor: "pointer", fontWeight: 900 }}>
          Neue Firma anlegen
        </summary>

        <div style={{ padding: 16, display: "grid", gap: 14 }}>
          <div style={grid}>
            <Label title="Firmenname">
              <input
                style={inputStyle}
                value={newCompany.name}
                onChange={(e) =>
                  setNewCompany((p) => ({ ...p, name: e.target.value }))
                }
              />
            </Label>

            <Label title="Firmencode">
              <input
                style={inputStyle}
                value={newCompany.code}
                onChange={(e) =>
                  setNewCompany((p) => ({ ...p, code: e.target.value }))
                }
                placeholder="z. B. MUSTER-001"
              />
            </Label>

            <Label title="E-Mail">
              <input
                style={inputStyle}
                value={newCompany.email}
                onChange={(e) =>
                  setNewCompany((p) => ({ ...p, email: e.target.value }))
                }
              />
            </Label>

            <Label title="Telefon">
              <input
                style={inputStyle}
                value={newCompany.phone}
                onChange={(e) =>
                  setNewCompany((p) => ({ ...p, phone: e.target.value }))
                }
              />
            </Label>

            <Label title="Adresse">
              <input
                style={inputStyle}
                value={newCompany.address}
                onChange={(e) =>
                  setNewCompany((p) => ({ ...p, address: e.target.value }))
                }
              />
            </Label>

            <Label title="Web-Lizenzen">
              <input
                type="number"
                min={0}
                style={inputStyle}
                value={newCompany.webSeatsPurchased}
                onChange={(e) =>
                  setNewCompany((p) => ({
                    ...p,
                    webSeatsPurchased: Number(e.target.value),
                  }))
                }
              />
            </Label>

            <Label title="Mobile-Lizenzen">
              <input
                type="number"
                min={0}
                style={inputStyle}
                value={newCompany.mobileSeatsPurchased}
                onChange={(e) =>
                  setNewCompany((p) => ({
                    ...p,
                    mobileSeatsPurchased: Number(e.target.value),
                  }))
                }
              />
            </Label>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontWeight: 800,
              }}
            >
              <input
                type="checkbox"
                checked={newCompany.cloudEnabled}
                onChange={(e) =>
                  setNewCompany((p) => ({
                    ...p,
                    cloudEnabled: e.target.checked,
                  }))
                }
              />
              Cloud aktivieren
            </label>
          </div>

          <div>
            <button
              type="button"
              style={primaryButton}
              disabled={saving === "new-company"}
              onClick={() => void createCompany()}
            >
              Firma anlegen
            </button>
          </div>
        </div>
      </details>

      {detailLoading ? (
        <div style={{ padding: 20 }}>Firmendaten werden geladen...</div>
      ) : null}

      {company ? (
        <>
          <section style={card}>
            <div style={sectionHead}>
              <strong>Firmenübersicht · {company.name}</strong>
            </div>

            <div style={{ padding: 16, ...grid }}>
              <Stat label="Web-Lizenzen" value={sub?.webSeatsPurchased ?? 0} />
              <Stat label="Mobile-Lizenzen" value={sub?.mobileSeatsPurchased ?? 0} />
              <Stat
                label="RLC Marktprüfungen"
                value={`${Math.max(0, Number(sub?.aiMarketMonthlyIncluded || 0) - Number(sub?.aiMarketMonthlyUsed || 0))} Monat + ${sub?.aiMarketCreditsPurchased ?? 0} Zusatz`}
              />
              <Stat label="Benutzer" value={company.members.length} />
              <Stat label="Projekte" value={company.projects.length} />
              <Stat
                label="Cloud"
                value={sub?.cloudEnabled ? "Aktiv" : "Nicht aktiv"}
              />
              <Stat
                label="Abonnement"
                value={
                  sub?.status === "ACTIVE"
                    ? "Aktiv"
                    : sub?.status === "GRACE"
                    ? "Übergangsfrist"
                    : "Abgelaufen"
                }
              />
            </div>
          </section>

          <section style={card}>
            <div style={sectionHead}>
              <strong>RLC Marktpreisprüfung · Verbrauch & Buchungen</strong>
            </div>
            <div style={{ padding: 16, display: "grid", gap: 16 }}>
              <div style={grid}>
                <Stat label="Im Monat verbraucht" value={aiOverview?.balance?.used ?? sub?.aiMarketMonthlyUsed ?? 0} />
                <Stat label="Monatlich noch frei" value={aiOverview?.balance?.includedRemaining ?? Math.max(0, Number(sub?.aiMarketMonthlyIncluded || 0) - Number(sub?.aiMarketMonthlyUsed || 0))} />
                <Stat label="Zusatz-Credits verfügbar" value={aiOverview?.balance?.purchasedRemaining ?? sub?.aiMarketCreditsPurchased ?? 0} />
                <Stat label="Gesamt verfügbar" value={aiOverview?.balance?.totalRemaining ?? 0} />
                <Stat label="Web Searches im Monat" value={Number(aiOverview?.summary?._sum?.webSearchCalls || 0)} />
                <Stat label="Tokens im Monat" value={Number(aiOverview?.summary?._sum?.totalTokens || 0).toLocaleString("de-DE")} />
                <Stat label="KI-/Recherchekosten geschätzt" value={`$${Number(aiOverview?.summary?._sum?.estimatedCostUsd || 0).toFixed(4)}`} />
                <Stat label="Prüfungen protokolliert" value={Number(aiOverview?.summary?._count?._all || 0)} />
                <Stat label="Credit-Umsatz im Monat" value={`${Number((aiOverview?.sales?.paidRevenueCentsMonth || 0) / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`} />
                <Stat label="Offene Buchungen" value={Number(aiOverview?.sales?.pendingOrders || 0)} />
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontWeight: 900 }}>Credit-Buchungen</div>
                {(aiOverview?.orders || []).length ? (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead><tr>
                        <th style={{ textAlign: "left", padding: 8 }}>Datum</th>
                        <th style={{ textAlign: "right", padding: 8 }}>Credits</th>
                        <th style={{ textAlign: "right", padding: 8 }}>Betrag</th>
                        <th style={{ textAlign: "left", padding: 8 }}>Status</th>
                        <th style={{ textAlign: "right", padding: 8 }}>Aktion</th>
                      </tr></thead>
                      <tbody>
                        {(aiOverview?.orders || []).map((order) => (
                          <tr key={order.id} style={{ borderTop: "1px solid #e2e8f0" }}>
                            <td style={{ padding: 8 }}>{fmtDate(order.createdAt)}</td>
                            <td style={{ padding: 8, textAlign: "right", fontWeight: 900 }}>{order.credits}</td>
                            <td style={{ padding: 8, textAlign: "right" }}>{(order.priceCents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</td>
                            <td style={{ padding: 8 }}>{order.status === "PENDING" ? "Offen" : order.status === "PAID" ? "Bezahlt / freigeschaltet" : "Storniert"}</td>
                            <td style={{ padding: 8, textAlign: "right" }}>
                              {order.status === "PENDING" ? <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                                <button type="button" style={primaryButton} disabled={saving === order.id} onClick={() => void confirmAiMarketOrder(order)}>Bezahlt & Credits freischalten</button>
                                <button type="button" style={buttonStyle} disabled={saving === order.id} onClick={() => void cancelAiMarketOrder(order)}>Stornieren</button>
                              </div> : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <div style={{ color: "#64748b" }}>Noch keine Credit-Buchungen für diese Firma.</div>}
              </div>
            </div>
          </section>

          <section style={card}>
            <div style={sectionHead}>
              <strong>Firmendaten</strong>
            </div>

            <div style={{ padding: 16, display: "grid", gap: 14 }}>
              <div style={grid}>
                <Label title="Firmenname">
                  <input
                    style={inputStyle}
                    value={companyForm.name}
                    onChange={(e) =>
                      setCompanyForm((p) => ({ ...p, name: e.target.value }))
                    }
                  />
                </Label>

                <Label title="Firmencode">
                  <input
                    style={inputStyle}
                    value={companyForm.code}
                    onChange={(e) =>
                      setCompanyForm((p) => ({ ...p, code: e.target.value }))
                    }
                  />
                </Label>

                <Label title="E-Mail">
                  <input
                    style={inputStyle}
                    value={companyForm.email}
                    onChange={(e) =>
                      setCompanyForm((p) => ({ ...p, email: e.target.value }))
                    }
                  />
                </Label>

                <Label title="Telefon">
                  <input
                    style={inputStyle}
                    value={companyForm.phone}
                    onChange={(e) =>
                      setCompanyForm((p) => ({ ...p, phone: e.target.value }))
                    }
                  />
                </Label>

                <Label title="Adresse">
                  <input
                    style={inputStyle}
                    value={companyForm.address}
                    onChange={(e) =>
                      setCompanyForm((p) => ({ ...p, address: e.target.value }))
                    }
                  />
                </Label>
              </div>

              <div>
                <button
                  style={primaryButton}
                  disabled={saving === "company"}
                  onClick={() => void saveCompany()}
                >
                  Firmendaten speichern
                </button>
              </div>
            </div>
          </section>

          <section style={card}>
            <div style={sectionHead}>
              <strong>Abonnement & Lizenzen</strong>
            </div>

            <div style={{ padding: 16, ...grid }}>
              <Label title="Status">
                <select
                  style={inputStyle}
                  value={sub?.status || "EXPIRED"}
                  onChange={(e) =>
                    void updateSubscription({ status: e.target.value })
                  }
                >
                  <option value="ACTIVE">Aktiv</option>
                  <option value="GRACE">Übergangsfrist</option>
                  <option value="EXPIRED">Abgelaufen</option>
                </select>
              </Label>

              <Label title="Paket">
                <select
                  style={inputStyle}
                  value={sub?.plan || "BASIC_5"}
                  onChange={(e) =>
                    void updateSubscription({ plan: e.target.value })
                  }
                >
                  <option value="BASIC_5">Basis 5</option>
                  <option value="PRO_20">Pro 20</option>
                  <option value="MAX_UNLIMITED">Max Unbegrenzt</option>
                </select>
              </Label>

              <Label title="Web-Lizenzen">
                <input
                  type="number"
                  min={0}
                  style={inputStyle}
                  value={sub?.webSeatsPurchased ?? 0}
                  onChange={(e) =>
                    setCompany((p) =>
                      p
                        ? {
                            ...p,
                            subscription: {
                              ...(p.subscription || {
                                status: "ACTIVE",
                                plan: "BASIC_5",
                                webSeatsPurchased: 0,
                                mobileSeatsPurchased: 0,
                                cloudEnabled: false,
                              }),
                              webSeatsPurchased: Number(e.target.value),
                            },
                          }
                        : p
                    )
                  }
                  onBlur={(e) =>
                    void updateSubscription({
                      webSeatsPurchased: Number(e.target.value),
                    })
                  }
                />
              </Label>

              <Label title="Mobile-Lizenzen">
                <input
                  type="number"
                  min={0}
                  style={inputStyle}
                  value={sub?.mobileSeatsPurchased ?? 0}
                  onChange={(e) =>
                    setCompany((p) =>
                      p
                        ? {
                            ...p,
                            subscription: {
                              ...(p.subscription || {
                                status: "ACTIVE",
                                plan: "BASIC_5",
                                webSeatsPurchased: 0,
                                mobileSeatsPurchased: 0,
                                cloudEnabled: false,
                              }),
                              mobileSeatsPurchased: Number(e.target.value),
                            },
                          }
                        : p
                    )
                  }
                  onBlur={(e) =>
                    void updateSubscription({
                      mobileSeatsPurchased: Number(e.target.value),
                    })
                  }
                />
              </Label>

              <Label title="RLC Marktprüfungen / Monat">
                <input
                  type="number"
                  min={0}
                  style={inputStyle}
                  value={sub?.aiMarketMonthlyIncluded ?? 50}
                  onChange={(e) =>
                    setCompany((p) =>
                      p && p.subscription
                        ? {
                            ...p,
                            subscription: {
                              ...p.subscription,
                              aiMarketMonthlyIncluded: Number(e.target.value),
                            },
                          }
                        : p
                    )
                  }
                  onBlur={(e) =>
                    void updateSubscription({
                      aiMarketMonthlyIncluded: Number(e.target.value),
                    })
                  }
                />
              </Label>

              <Label title="KI-Zusatzkontingent">
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ ...inputStyle, background: "#f8fafc" }}>
                    {sub?.aiMarketCreditsPurchased ?? 0} Prüfungen verfügbar
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {[100, 500, 2000].map((credits) => (
                      <button
                        key={credits}
                        type="button"
                        style={buttonStyle}
                        disabled={saving === "subscription"}
                        onClick={() => void updateSubscription({ addAiMarketCredits: credits })}
                      >
                        +{credits}
                      </button>
                    ))}
                  </div>
                </div>
              </Label>

              <Label title="Laufzeit bis">
                <input
                  type="date"
                  style={inputStyle}
                  value={
                    sub?.currentPeriodEnd
                      ? sub.currentPeriodEnd.slice(0, 10)
                      : ""
                  }
                  onChange={(e) =>
                    void updateSubscription({
                      currentPeriodEnd: e.target.value || null,
                    })
                  }
                />
              </Label>

              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontWeight: 800,
                }}
              >
                <input
                  type="checkbox"
                  checked={!!sub?.cloudEnabled}
                  onChange={(e) =>
                    void updateSubscription({
                      cloudEnabled: e.target.checked,
                    })
                  }
                />
                Cloud aktiviert
              </label>
            </div>
          </section>

          <section style={card}>
            <div style={sectionHead}>
              <strong>Web-Freischaltcodes</strong>
            </div>

            <div style={{ padding: 16, display: "grid", gap: 15 }}>
              <div style={grid}>
                <Label title="E-Mail (optional)">
                  <input
                    style={inputStyle}
                    value={inviteForm.email}
                    onChange={(e) =>
                      setInviteForm((p) => ({ ...p, email: e.target.value }))
                    }
                  />
                </Label>

                <Label title="Rolle">
                  <select
                    style={inputStyle}
                    value={inviteForm.role}
                    onChange={(e) =>
                      setInviteForm((p) => ({ ...p, role: e.target.value }))
                    }
                  >
                    <option value="ADMIN">Administrator</option>
                    <option value="BAULEITER">Bauleiter</option>
                    <option value="KALKULATOR">Kalkulator</option>
                    <option value="MITARBEITER">Mitarbeiter</option>
                    <option value="NUR_LESEN">Nur Lesen</option>
                  </select>
                </Label>

                <Label title="Gültigkeit in Tagen">
                  <input
                    type="number"
                    min={1}
                    max={365}
                    style={inputStyle}
                    value={inviteForm.ttlDays}
                    onChange={(e) =>
                      setInviteForm((p) => ({
                        ...p,
                        ttlDays: Number(e.target.value),
                      }))
                    }
                  />
                </Label>

                <Label title="Maximale Nutzungen">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    style={inputStyle}
                    value={inviteForm.maxUses}
                    onChange={(e) =>
                      setInviteForm((p) => ({
                        ...p,
                        maxUses: Number(e.target.value),
                      }))
                    }
                  />
                </Label>
              </div>

              <div>
                <button
                  style={primaryButton}
                  disabled={saving === "invite"}
                  onClick={() => void createInvite()}
                >
                  Neuen Web-Code erstellen
                </button>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 13,
                  }}
                >
                  <thead>
                    <tr>
                      {[
                        "Code",
                        "E-Mail",
                        "Rolle",
                        "Nutzung",
                        "Gültig bis",
                        "Status",
                        "Aktion",
                      ].map((x) => (
                        <th
                          key={x}
                          style={{
                            textAlign: "left",
                            padding: 9,
                            borderBottom: "1px solid #e2e8f0",
                          }}
                        >
                          {x}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {company.invites.map((invite) => (
                      <tr key={invite.id}>
                        <td style={{ padding: 9, fontFamily: "monospace", fontWeight: 900 }}>
                          {invite.code}
                        </td>
                        <td style={{ padding: 9 }}>{invite.email || "—"}</td>
                        <td style={{ padding: 9 }}>{invite.role}</td>
                        <td style={{ padding: 9 }}>
                          {invite.usedCount} / {invite.maxUses}
                        </td>
                        <td style={{ padding: 9 }}>{fmtDate(invite.expiresAt)}</td>
                        <td style={{ padding: 9 }}>
                          {invite.isActive ? "Aktiv" : "Gesperrt"}
                        </td>
                        <td style={{ padding: 9 }}>
                          <button
                            style={buttonStyle}
                            disabled={saving === invite.id}
                            onClick={() =>
                              void setInviteActive(invite, !invite.isActive)
                            }
                          >
                            {invite.isActive ? "Sperren" : "Freigeben"}
                          </button>
                        </td>
                      </tr>
                    ))}

                    {!company.invites.length ? (
                      <tr>
                        <td colSpan={7} style={{ padding: 14, color: "#64748b" }}>
                          Noch keine Web-Codes vorhanden.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section style={card}>
            <div style={sectionHead}>
              <strong>Mobile-Lizenzcodes</strong>
            </div>

            <div style={{ padding: 16, display: "grid", gap: 15 }}>
              <div style={grid}>
                <Label title="Rolle">
                  <select
                    style={inputStyle}
                    value={mobileForm.role}
                    onChange={(e) =>
                      setMobileForm((p) => ({ ...p, role: e.target.value }))
                    }
                  >
                    <option value="MITARBEITER">Mitarbeiter</option>
                    <option value="BAULEITER">Bauleiter</option>
                    <option value="ADMIN">Administrator</option>
                  </select>
                </Label>

                <Label title="Mitarbeiter">
                  <input
                    style={inputStyle}
                    value={mobileForm.employeeName}
                    onChange={(e) =>
                      setMobileForm((p) => ({
                        ...p,
                        employeeName: e.target.value,
                      }))
                    }
                  />
                </Label>

                <Label title="E-Mail">
                  <input
                    style={inputStyle}
                    value={mobileForm.employeeEmail}
                    onChange={(e) =>
                      setMobileForm((p) => ({
                        ...p,
                        employeeEmail: e.target.value,
                      }))
                    }
                  />
                </Label>

                <Label title="Gerät">
                  <input
                    style={inputStyle}
                    value={mobileForm.deviceName}
                    onChange={(e) =>
                      setMobileForm((p) => ({
                        ...p,
                        deviceName: e.target.value,
                      }))
                    }
                  />
                </Label>

                <Label title="Gültig bis">
                  <input
                    type="date"
                    style={inputStyle}
                    value={mobileForm.expiresAt}
                    onChange={(e) =>
                      setMobileForm((p) => ({
                        ...p,
                        expiresAt: e.target.value,
                      }))
                    }
                  />
                </Label>
              </div>

              <div>
                <button
                  style={primaryButton}
                  disabled={saving === "mobile"}
                  onClick={() => void createMobileLicense()}
                >
                  Neuen Mobile-Code erstellen
                </button>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>
                      {[
                        "Code",
                        "Mitarbeiter",
                        "Rolle",
                        "Gerät",
                        "Status",
                        "Letzte Anmeldung",
                        "Aktion",
                      ].map((x) => (
                        <th
                          key={x}
                          style={{
                            textAlign: "left",
                            padding: 9,
                            borderBottom: "1px solid #e2e8f0",
                          }}
                        >
                          {x}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {company.mobileLicenses.map((license) => (
                      <tr key={license.id}>
                        <td style={{ padding: 9, fontFamily: "monospace", fontWeight: 900 }}>
                          {license.code}
                        </td>
                        <td style={{ padding: 9 }}>
                          <div>{license.employeeName || "—"}</div>
                          <div style={{ color: "#64748b", fontSize: 11 }}>
                            {license.employeeEmail || ""}
                          </div>
                        </td>
                        <td style={{ padding: 9 }}>{license.role}</td>
                        <td style={{ padding: 9 }}>{license.deviceName || "—"}</td>
                        <td style={{ padding: 9 }}>
                          <select
                            style={{ ...inputStyle, minWidth: 115 }}
                            value={license.status}
                            onChange={(e) =>
                              void updateMobileLicense(license, {
                                status: e.target.value,
                              })
                            }
                          >
                            <option value="FREE">Frei</option>
                            <option value="ACTIVE">Aktiv</option>
                            <option value="BLOCKED">Gesperrt</option>
                          </select>
                        </td>
                        <td style={{ padding: 9 }}>{fmtDate(license.lastLoginAt)}</td>
                        <td style={{ padding: 9 }}>
                          <button
                            style={{
                              ...buttonStyle,
                              color: "#b91c1c",
                            }}
                            disabled={saving === license.id}
                            onClick={() => void deleteMobileLicense(license)}
                          >
                            Löschen
                          </button>
                        </td>
                      </tr>
                    ))}

                    {!company.mobileLicenses.length ? (
                      <tr>
                        <td colSpan={7} style={{ padding: 14, color: "#64748b" }}>
                          Noch keine Mobile-Codes vorhanden.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section style={card}>
            <div style={sectionHead}>
              <strong>Benutzer der Firma</strong>
            </div>

            <div style={{ padding: 16, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    {["Name", "E-Mail", "Rolle", "Status", "Erstellt"].map((x) => (
                      <th
                        key={x}
                        style={{
                          textAlign: "left",
                          padding: 9,
                          borderBottom: "1px solid #e2e8f0",
                        }}
                      >
                        {x}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {company.members.map((member) => (
                    <tr key={member.id}>
                      <td style={{ padding: 9 }}>{member.user?.name || "—"}</td>
                      <td style={{ padding: 9 }}>{member.user?.email || "—"}</td>
                      <td style={{ padding: 9 }}>{member.role}</td>
                      <td style={{ padding: 9 }}>
                        {member.active ? "Aktiv" : "Deaktiviert"}
                      </td>
                      <td style={{ padding: 9 }}>
                        {fmtDate(member.createdAt)}
                      </td>
                    </tr>
                  ))}

                  {!company.members.length ? (
                    <tr>
                      <td colSpan={5} style={{ padding: 14, color: "#64748b" }}>
                        Keine Benutzer vorhanden.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}