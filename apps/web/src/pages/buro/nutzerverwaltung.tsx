import React from "react";
import { apiUrl } from "../../lib/apiBase";

type CompanyDto = {
  id: string;
  code: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  logoPath?: string | null;
  createdAt?: string | null;
};

type SubscriptionDto = {
  status: string;
  plan: string;
  webSeatsPurchased: number;
  mobileSeatsPurchased: number;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  active: boolean;
};

type SeatsDto = {
  used: number;
  limit: number | null;
  available: number | null;
};

type MemberDto = {
  id: string;
  userId: string;
  email: string;
  name?: string | null;
  appRole?: string | null;
  companyRole: string;
  active: boolean;
  emailVerifiedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type InviteDto = {
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
  status: string;
};

type DashboardResponse = {
  ok: boolean;
  company: CompanyDto | null;
  subscription: SubscriptionDto | null;
  seats: SeatsDto;
  members: MemberDto[];
  invites: InviteDto[];
  error?: string;
};

type HeaderPatchResponse = {
  ok: boolean;
  company?: CompanyDto;
  error?: string;
};

type InviteCreateResponse = {
  ok: boolean;
  invite?: InviteDto;
  error?: string;
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  borderBottom: "1px solid var(--line)",
  fontSize: 13,
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "8px 12px",
  borderBottom: "1px solid var(--line)",
  fontSize: 13,
  verticalAlign: "middle",
};

const inp: React.CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
  width: "100%",
  boxSizing: "border-box",
  background: "#fff",
};

const lbl: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.8,
  fontWeight: 600,
};

const sectionTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 800,
};

const muted: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.75,
};

const badge = (bg: string, color = "#111827"): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  background: bg,
  color,
});

function getToken(): string {
  try {
    return (
      localStorage.getItem("rlc_token") ||
      JSON.parse(localStorage.getItem("rlc_auth") || "{}")?.token ||
      ""
    );
  } catch {
    return "";
  }
}

function authHeaders(extra?: Record<string, string>) {
  const token = getToken();
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extra || {}),
  };
}

function fmtDate(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString("de-DE");
}

function statusStyle(status?: string) {
  switch (String(status || "").toUpperCase()) {
    case "PENDING":
      return badge("#eff6ff", "#1d4ed8");
    case "USED_UP":
      return badge("#fef3c7", "#92400e");
    case "EXPIRED":
      return badge("#fee2e2", "#b91c1c");
    case "INACTIVE":
      return badge("#e5e7eb", "#374151");
    case "ACCEPTED":
      return badge("#dcfce7", "#166534");
    default:
      return badge("#f3f4f6", "#111827");
  }
}

const ROLE_OPTIONS = [
  "ADMIN",
  "BAULEITER",
  "MITARBEITER",
  "KALKULATOR",
  "BUCHHALTUNG",
  "GAST",
];

export default function Nutzerverwaltung() {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [busyInvite, setBusyInvite] = React.useState(false);
  const [busyLogo, setBusyLogo] = React.useState(false);

  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);

  const [company, setCompany] = React.useState<CompanyDto | null>(null);
  const [subscription, setSubscription] = React.useState<SubscriptionDto | null>(
    null
  );
  const [seats, setSeats] = React.useState<SeatsDto>({
    used: 0,
    limit: 0,
    available: 0,
  });
  const [members, setMembers] = React.useState<MemberDto[]>([]);
  const [invites, setInvites] = React.useState<InviteDto[]>([]);

  const [form, setForm] = React.useState({
    name: "",
    address: "",
    phone: "",
    email: "",
  });

  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState("MITARBEITER");

  const fileRef = React.useRef<HTMLInputElement | null>(null);

  const [logoUrl, setLogoUrl] = React.useState<string | null>(null);

  const loadDashboard = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(apiUrl("/api/company/admin/dashboard"), {
        method: "GET",
        headers: authHeaders(),
      });

      const data = (await res.json().catch(() => null)) as DashboardResponse | null;

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Dashboard konnte nicht geladen werden.");
      }

      setCompany(data.company ?? null);
      setSubscription(data.subscription ?? null);
      setSeats(data.seats ?? { used: 0, limit: 0, available: 0 });
      setMembers(data.members ?? []);
      setInvites(data.invites ?? []);

      setForm({
        name: data.company?.name || "",
        address: data.company?.address || "",
        phone: data.company?.phone || "",
        email: data.company?.email || "",
      });
    } catch (err: any) {
      setError(err?.message || "Dashboard konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  React.useEffect(() => {
  let alive = true;
  let objectUrl: string | null = null;

  async function loadLogo() {
    if (!company?.logoPath) {
      setLogoUrl(null);
      return;
    }

    try {
      const token = getToken();
      const res = await fetch(apiUrl("/api/company/logo"), {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (!res.ok) {
        throw new Error("Logo konnte nicht geladen werden.");
      }

      const blob = await res.blob();
      objectUrl = URL.createObjectURL(blob);

      if (alive) setLogoUrl(objectUrl);
    } catch {
      if (alive) setLogoUrl(null);
    }
  }

  loadLogo();

  return () => {
    alive = false;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  };
}, [company?.logoPath]);

  async function saveHeader() {
    setSaving(true);
    setError(null);
    setInfo(null);

    try {
      const res = await fetch(apiUrl("/api/company/admin/header"), {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify(form),
      });

      const data = (await res.json().catch(() => null)) as HeaderPatchResponse | null;

      if (!res.ok || !data?.ok || !data.company) {
        throw new Error(data?.error || "Firmendaten konnten nicht gespeichert werden.");
      }

      setCompany(data.company);
      setInfo("Firmendaten gespeichert.");
    } catch (err: any) {
      setError(err?.message || "Firmendaten konnten nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadLogo(file: File) {
    setBusyLogo(true);
    setError(null);
    setInfo(null);

    try {
      const token = getToken();
      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch(apiUrl("/api/company/admin/logo"), {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: fd,
      });

      const data = (await res.json().catch(() => null)) as HeaderPatchResponse | null;

      if (!res.ok || !data?.ok || !data.company) {
        throw new Error(data?.error || "Logo konnte nicht hochgeladen werden.");
      }

      setCompany(data.company);
      setInfo("Logo erfolgreich hochgeladen.");
    } catch (err: any) {
      setError(err?.message || "Logo konnte nicht hochgeladen werden.");
    } finally {
      setBusyLogo(false);
    }
  }

  async function createInvite() {
    setBusyInvite(true);
    setError(null);
    setInfo(null);

    try {
      const body = {
        email: inviteEmail.trim() || undefined,
        role: inviteRole,
      };

      const res = await fetch(apiUrl("/api/company/invites"), {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body),
      });

      const data = (await res.json().catch(() => null)) as InviteCreateResponse | null;

      if (!res.ok || !data?.ok || !data.invite) {
        throw new Error(data?.error || "Einladungscode konnte nicht erstellt werden.");
      }

      setInfo(`Einladungscode erstellt: ${data.invite.code}`);
      setInviteEmail("");
      await loadDashboard();
    } catch (err: any) {
      setError(err?.message || "Einladungscode konnte nicht erstellt werden.");
    } finally {
      setBusyInvite(false);
    }
  }

  async function deactivateInvite(id: string) {
    setError(null);
    setInfo(null);

    try {
      const res = await fetch(apiUrl(`/api/company/invites/deactivate/${id}`), {
        method: "POST",
        headers: authHeaders(),
      });

      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Einladung konnte nicht deaktiviert werden.");
      }

      setInfo("Einladung deaktiviert.");
      await loadDashboard();
    } catch (err: any) {
      setError(err?.message || "Einladung konnte nicht deaktiviert werden.");
    }
  }

  async function updateMember(userId: string, patch: Partial<MemberDto>) {
    setError(null);
    setInfo(null);

    try {
      const res = await fetch(apiUrl(`/api/company/admin/members/${userId}`), {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({
          active: patch.active,
          role: patch.companyRole,
        }),
      });

      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Mitglied konnte nicht aktualisiert werden.");
      }

      await loadDashboard();
    } catch (err: any) {
      setError(err?.message || "Mitglied konnte nicht aktualisiert werden.");
    }
  }

  return (
    <div style={{ display: "grid", gap: 12, padding: 10 }}>
      <div
        className="card"
        style={{
          padding: "10px 12px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={sectionTitle}>Firma, Team & Web-Lizenzen</div>
          <div style={muted}>
            Firmenprofil, Logo, Lizenzübersicht, Mitarbeiter und Einladungscodes.
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" onClick={loadDashboard} disabled={loading}>
            Aktualisieren
          </button>
          <button className="btn primary" onClick={saveHeader} disabled={saving || loading}>
            {saving ? "Speichert..." : "Firmendaten speichern"}
          </button>
        </div>
      </div>

      {error ? (
        <div
          className="card"
          style={{
            padding: 12,
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#b91c1c",
          }}
        >
          {error}
        </div>
      ) : null}

      {info ? (
        <div
          className="card"
          style={{
            padding: 12,
            border: "1px solid #bfdbfe",
            background: "#eff6ff",
            color: "#1d4ed8",
          }}
        >
          {info}
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 12 }}>
        <div className="card" style={{ padding: 12 }}>
          <div style={{ ...sectionTitle, marginBottom: 12 }}>Firmendaten</div>

          <div style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: 10 }}>
            <label style={lbl}>Firmenname</label>
            <input
              style={inp}
              value={form.name}
              onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))}
            />

            <label style={lbl}>Adresse</label>
            <input
              style={inp}
              value={form.address}
              onChange={(e) => setForm((v) => ({ ...v, address: e.target.value }))}
            />

            <label style={lbl}>Telefon</label>
            <input
              style={inp}
              value={form.phone}
              onChange={(e) => setForm((v) => ({ ...v, phone: e.target.value }))}
            />

            <label style={lbl}>E-Mail</label>
            <input
              style={inp}
              value={form.email}
              onChange={(e) => setForm((v) => ({ ...v, email: e.target.value }))}
            />

            <label style={lbl}>Firmencode</label>
            <div style={{ display: "flex", alignItems: "center", fontSize: 13 }}>
              <b>{company?.code || "—"}</b>
            </div>

            <label style={lbl}>Firmenlogo</label>
            <div style={{ display: "grid", gap: 10 }}>
              {logoUrl ? (
                <div
                  style={{
                    border: "1px solid var(--line)",
                    borderRadius: 10,
                    padding: 12,
                    background: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: 110,
                  }}
                >
                  <img
                    src={logoUrl}
                    alt="Firmenlogo"
                    style={{
                      maxHeight: 80,
                      maxWidth: 260,
                      objectFit: "contain",
                    }}
                  />
                </div>
              ) : (
                <div
                  style={{
                    border: "1px dashed var(--line)",
                    borderRadius: 10,
                    padding: 12,
                    background: "#fafafa",
                    minHeight: 110,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 13,
                    opacity: 0.75,
                  }}
                >
                  Noch kein Firmenlogo eingefügt.
                </div>
              )}

              <div
                style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadLogo(f);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                />
                <button
                  className="btn"
                  onClick={() => fileRef.current?.click()}
                  disabled={busyLogo}
                >
                  {busyLogo ? "Logo wird hochgeladen..." : "Logo einfügen"}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 12 }}>
          <div style={{ ...sectionTitle, marginBottom: 12 }}>Lizenzübersicht</div>

          <div style={{ display: "grid", gap: 10 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 10,
              }}
            >
              <div
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: 10,
                  padding: 12,
                  background: "#fafafa",
                }}
              >
                <div style={muted}>Web-Lizenzen gekauft</div>
                <div style={{ fontSize: 26, fontWeight: 800 }}>
                  {subscription?.webSeatsPurchased ?? 0}
                </div>
              </div>

              <div
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: 10,
                  padding: 12,
                  background: "#fafafa",
                }}
              >
                <div style={muted}>Benutzt</div>
                <div style={{ fontSize: 26, fontWeight: 800 }}>{seats.used ?? 0}</div>
              </div>

              <div
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: 10,
                  padding: 12,
                  background: "#fafafa",
                }}
              >
                <div style={muted}>Frei</div>
                <div style={{ fontSize: 26, fontWeight: 800 }}>
                  {seats.available ?? 0}
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 8 }}>
              <div style={lbl}>Status</div>
              <div>{subscription?.active ? "Aktiv" : "Inaktiv"}</div>

              <div style={lbl}>Plan</div>
              <div>{subscription?.plan || "—"}</div>

              <div style={lbl}>Zeitraum Ende</div>
              <div>{fmtDate(subscription?.currentPeriodEnd)}</div>

              <div style={lbl}>Mobile-Lizenzen</div>
              <div>{subscription?.mobileSeatsPurchased ?? 0}</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "0.95fr 1.05fr", gap: 12 }}>
        <div className="card" style={{ padding: 12 }}>
          <div style={{ ...sectionTitle, marginBottom: 12 }}>Einladungscode erzeugen</div>

          <div style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: 10 }}>
            <label style={lbl}>E-Mail</label>
            <input
              style={inp}
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="optional@firma.de"
            />

            <label style={lbl}>Rolle</label>
            <select
              style={inp}
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn primary" onClick={createInvite} disabled={busyInvite}>
              {busyInvite ? "Erstellt..." : "Code erstellen"}
            </button>
          </div>

          <div style={{ ...muted, marginTop: 12 }}>
            Den erzeugten Code gibst du dem Mitarbeiter. Er registriert sich
            sich damit direkt im Login-Bereich.
          </div>
        </div>

        <div className="card" style={{ padding: 0, overflow: "auto" }}>
          <div style={{ padding: 12, borderBottom: "1px solid var(--line)" }}>
            <div style={sectionTitle}>Einladungen</div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Code</th>
                <th style={th}>E-Mail</th>
                <th style={th}>Rolle</th>
                <th style={th}>Status</th>
                <th style={th}>Gültig bis</th>
                <th style={th}>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {invites.length === 0 ? (
                <tr>
                  <td style={{ ...td, opacity: 0.7 }} colSpan={6}>
                    Keine Einladungen vorhanden.
                  </td>
                </tr>
              ) : (
                invites.map((i) => (
                  <tr key={i.id}>
                    <td style={{ ...td, fontFamily: "monospace", fontWeight: 700 }}>
                      {i.code}
                    </td>
                    <td style={td}>{i.email || "—"}</td>
                    <td style={td}>{i.role}</td>
                    <td style={td}>
                      <span style={statusStyle(i.status)}>{i.status}</span>
                    </td>
                    <td style={td}>{fmtDate(i.expiresAt)}</td>
                    <td style={td}>
                      <button
                        className="btn"
                        onClick={() => deactivateInvite(i.id)}
                        disabled={!i.isActive || i.status !== "PENDING"}
                      >
                        Deaktivieren
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: "auto" }}>
        <div style={{ padding: 12, borderBottom: "1px solid var(--line)" }}>
          <div style={sectionTitle}>Mitglieder der Firma</div>
        </div>

        {loading ? (
          <div style={{ padding: 12, opacity: 0.75 }}>Lädt...</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>E-Mail</th>
                <th style={th}>Rolle</th>
                <th style={th}>Aktiv</th>
                <th style={th}>Bestätigt</th>
                <th style={th}>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr>
                  <td style={{ ...td, opacity: 0.7 }} colSpan={6}>
                    Keine Mitglieder vorhanden.
                  </td>
                </tr>
              ) : (
                members.map((m) => (
                  <tr key={m.id}>
                    <td style={td}>{m.name || "—"}</td>
                    <td style={td}>{m.email}</td>
                    <td style={td}>
                      <select
                        style={{ ...inp, minWidth: 160 }}
                        value={m.companyRole}
                        onChange={(e) =>
                          updateMember(m.userId, { companyRole: e.target.value })
                        }
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={td}>{m.active ? "Ja" : "Nein"}</td>
                    <td style={td}>{m.emailVerifiedAt ? "Ja" : "Nein"}</td>
                    <td style={td}>
                      <button
                        className="btn"
                        onClick={() => updateMember(m.userId, { active: !m.active })}
                      >
                        {m.active ? "Deaktivieren" : "Aktivieren"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}