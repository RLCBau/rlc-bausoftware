import { rlcClass } from "../../ui/rlcRuntimeStyle";import React from "react";
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


type MobileLicenseDto = {
  id: string;
  code: string;
  role: string;
  employeeName?: string;
  employeeEmail?: string;
  deviceName?: string;
  deviceId?: string;
  status: "FREE" | "ACTIVE" | "BLOCKED";
  createdAt: string;
  activatedAt?: string;
  expiresAt?: string;
};


type MobileLicenseListResponse = {
  ok: boolean;
  mobileLicenses?: MobileLicenseDto[];
  seats?: {
    subscriptionActive: boolean;
    used: number;
    limit: number;
    available: number;
  };
  error?: string;
};

type MobileLicenseMutationResponse = {
  ok: boolean;
  mobileLicense?: MobileLicenseDto;
  error?: string;
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
  padding: "11px 12px",
  borderBottom: "1px solid #dbe4ef",
  fontSize: 12,
  fontWeight: 700,
  color: "#334155",
  background: "#f8fafc",
  whiteSpace: "nowrap"
};

const td: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #e7edf5",
  fontSize: 13,
  verticalAlign: "middle",
  color: "#1e293b"
};

const inp: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  padding: "9px 11px",
  fontSize: 13,
  width: "100%",
  boxSizing: "border-box",
  background: "#fff",
  color: "#0f172a",
  outline: "none"
};

const lbl: React.CSSProperties = {
  fontSize: 12,
  color: "#475569",
  fontWeight: 700
};

const sectionTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 17,
  fontWeight: 700,
  color: "#0f172a",
  letterSpacing: "-0.01em"
};

const muted: React.CSSProperties = {
  fontSize: 12,
  color: "#64748b"
};

const badge = (bg: string, color = "#111827"): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600,
  background: bg,
  color
});


const sectionCard: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #dbe4ef",
  borderRadius: 16,
  boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
  overflow: "hidden"
};

const sectionHeader: React.CSSProperties = {
  padding: "14px 16px",
  borderBottom: "1px solid #e2e8f0",
  background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)"
};

const statCard: React.CSSProperties = {
  border: "1px solid #dbe4ef",
  borderRadius: 14,
  padding: 14,
  background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
  boxShadow: "0 4px 14px rgba(15, 23, 42, 0.04)"
};

function getToken(): string {
  try {
    return (
      localStorage.getItem("rlc_token") ||
      JSON.parse(localStorage.getItem("rlc_auth") || "{}")?.token ||
      "");

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
    ...(extra || {})
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
      return badge("#eaf2ff", "#0b5bd3");
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

const WEB_ROLE_OPTIONS = [
"ADMIN",
"BAULEITER",
"MITARBEITER",
"KALKULATOR",
"BUCHHALTUNG",
"GAST"];


const MOBILE_ROLE_OPTIONS = [
"BAULEITER",
"POLIER",
"VORARBEITER",
"FAHRER",
"MASCHINIST",
"VERMESSER",
"MITARBEITER"];


function webRoleLabel(role: string) {
  return role === "MITARBEITER" ? "VERMESSUNG / TECHNIKER" : role;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
    typeof reader.result === "string" ?
    resolve(reader.result) :
    reject(new Error("Logo konnte nicht gelesen werden."));
    reader.onerror = () => reject(reader.error || new Error("Logo konnte nicht gelesen werden."));
    reader.readAsDataURL(file);
  });
}

function persistSharedCompanyProfile(company: CompanyDto | null, logoDataUrl?: string | null) {
  if (!company) return;

  const profile = {
    name: company.name || "",
    companyName: company.name || "",
    firmenname: company.name || "",
    address: company.address || "",
    street: company.address || "",
    phone: company.phone || "",
    email: company.email || "",
    logoUrl: "/api/company/logo",
    logoPath: "/api/company/logo",
    code: company.code || "",
    updatedAt: new Date().toISOString()
  };

  // RLC_COMPANY_PROFILE_COMPACT_V1
  // Il logo resta sul server; localStorage conserva solo dati leggeri e il relativo endpoint.
  const compactCompanyProfile = {
    ...profile,
    logoDataUrl: undefined,
    logo: undefined,

    logoUrl: "/api/company/logo",
    logoPath: "/api/company/logo",
  };

  localStorage.setItem("rlc_company_profile", JSON.stringify(compactCompanyProfile));
  localStorage.setItem("rlc_company", JSON.stringify(compactCompanyProfile));
  localStorage.setItem("companyProfile", JSON.stringify(compactCompanyProfile));
}

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
    available: 0
  });
  const [members, setMembers] = React.useState<MemberDto[]>([]);
  const [invites, setInvites] = React.useState<InviteDto[]>([]);

  const [form, setForm] = React.useState({
    name: "",
    address: "",
    phone: "",
    email: ""
  });

  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState("MITARBEITER");

  const [mobileLicenses, setMobileLicenses] = React.useState<MobileLicenseDto[]>([]);
  const [mobileSeatInfo, setMobileSeatInfo] = React.useState({
    subscriptionActive: false,
    used: 0,
    limit: 0,
    available: 0
  });
  const [mobileRole, setMobileRole] = React.useState("BAULEITER");
  const [mobileEmployeeName, setMobileEmployeeName] = React.useState("");
  const [mobileEmployeeEmail, setMobileEmployeeEmail] = React.useState("");
  const [mobileDeviceName, setMobileDeviceName] = React.useState("");

  const fileRef = React.useRef<HTMLInputElement | null>(null);

  const [logoUrl, setLogoUrl] = React.useState<string | null>(null);

  const loadMobileLicensesFromServer = React.useCallback(async () => {
    const res = await fetch(apiUrl("/api/company/mobile-licenses"), {
      method: "GET",
      headers: authHeaders()
    });

    const data = (await res.json().catch(() => null)) as MobileLicenseListResponse | null;

    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || "Mobile-Lizenzen konnten nicht geladen werden.");
    }

    setMobileLicenses(data.mobileLicenses ?? []);
    setMobileSeatInfo(
      data.seats ?? {
        subscriptionActive: false,
        used: 0,
        limit: 0,
        available: 0
      }
    );
  }, []);

  const loadDashboard = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(apiUrl("/api/company/admin/dashboard"), {
        method: "GET",
        headers: authHeaders()
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
      await loadMobileLicensesFromServer();
      persistSharedCompanyProfile(data.company ?? null);

      setForm({
        name: data.company?.name || "",
        address: data.company?.address || "",
        phone: data.company?.phone || "",
        email: data.company?.email || ""
      });
    } catch (err: any) {
      setError(err?.message || "Dashboard konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [loadMobileLicensesFromServer]);

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
          headers: token ? { Authorization: `Bearer ${token}` } : undefined
        });

        if (!res.ok) {
          throw new Error("Logo konnte nicht geladen werden.");
        }

        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);

        if (alive) {
          setLogoUrl(objectUrl);
          try {
            const dataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () =>
              typeof reader.result === "string" ?
              resolve(reader.result) :
              reject(new Error("Logo konnte nicht gelesen werden."));
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(blob);
            });
            persistSharedCompanyProfile(company, dataUrl);
          } catch {
            persistSharedCompanyProfile(company);
          }
        }
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
        body: JSON.stringify(form)
      });

      const data = (await res.json().catch(() => null)) as HeaderPatchResponse | null;

      if (!res.ok || !data?.ok || !data.company) {
        throw new Error(data?.error || "Firmendaten konnten nicht gespeichert werden.");
      }

      setCompany(data.company);
      persistSharedCompanyProfile(data.company, logoUrl?.startsWith("data:image/") ? logoUrl : null);
      setInfo("Firmendaten gespeichert und für alle PDF-Module bereitgestellt.");
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
      const logoDataUrl = await fileToDataUrl(file);
      const token = getToken();
      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch(apiUrl("/api/company/admin/logo"), {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: fd
      });

      const data = (await res.json().catch(() => null)) as HeaderPatchResponse | null;

      if (!res.ok || !data?.ok || !data.company) {
        throw new Error(data?.error || "Logo konnte nicht hochgeladen werden.");
      }

      setCompany(data.company);
      setLogoUrl(logoDataUrl);
      persistSharedCompanyProfile(data.company, logoDataUrl);
      setInfo("Logo erfolgreich hochgeladen und für alle PDF-Module gespeichert.");
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
        role: inviteRole
      };

      const res = await fetch(apiUrl("/api/company/invites"), {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body)
      });

      const data = (await res.json().catch(() => null)) as InviteCreateResponse | null;

      if (!res.ok || !data?.ok || !data.invite) {
        const apiError = String(data?.error || "");
        if (apiError.toLowerCase().includes("invalid role")) {
          throw new Error(
            "Ungültige Web-Rolle. Für Web-Einladungen sind nur ADMIN, BAULEITER, VERMESSUNG / TECHNIKER, KALKULATOR, BUCHHALTUNG und GAST erlaubt."
          );
        }
        throw new Error(apiError || "Web-Einladungscode konnte nicht erstellt werden.");
      }

      setInfo(`Einladungscode erstellt: ${data.invite.code}`);
      setInviteEmail("");
      await loadDashboard();
    } catch (err: any) {
      setError(err?.message || "Web-Einladungscode konnte nicht erstellt werden.");
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
        headers: authHeaders()
      });

      const data = (await res.json().catch(() => null)) as
      {ok?: boolean;error?: string;} |
      null;

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Web-Einladung konnte nicht deaktiviert werden.");
      }

      setInfo("Web-Einladung deaktiviert.");
      await loadDashboard();
    } catch (err: any) {
      setError(err?.message || "Web-Einladung konnte nicht deaktiviert werden.");
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
          role: patch.companyRole
        })
      });

      const data = (await res.json().catch(() => null)) as
      {ok?: boolean;error?: string;} |
      null;

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Mitglied konnte nicht aktualisiert werden.");
      }

      await loadDashboard();
    } catch (err: any) {
      setError(err?.message || "Mitglied konnte nicht aktualisiert werden.");
    }
  }

  async function createMobileLicense() {
    setError(null);
    setInfo(null);

    try {
      const res = await fetch(apiUrl("/api/company/mobile-licenses"), {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          role: mobileRole,
          employeeName: mobileEmployeeName.trim() || undefined,
          employeeEmail: mobileEmployeeEmail.trim() || undefined,
          deviceName: mobileDeviceName.trim() || undefined
        })
      });

      const data = (await res.json().catch(() => null)) as MobileLicenseMutationResponse | null;

      if (!res.ok || !data?.ok || !data.mobileLicense) {
        const apiError = String(data?.error || "");
        if (apiError === "MOBILE_SEAT_LIMIT_REACHED") {
          throw new Error("Keine freie Mobile-Lizenz verfügbar.");
        }
        throw new Error(apiError || "Mobile-Aktivierungscode konnte nicht erstellt werden.");
      }

      setMobileEmployeeName("");
      setMobileEmployeeEmail("");
      setMobileDeviceName("");
      setInfo(`Mobile-Aktivierungscode erstellt: ${data.mobileLicense.code}`);
      await loadMobileLicensesFromServer();
    } catch (err: any) {
      setError(err?.message || "Mobile-Aktivierungscode konnte nicht erstellt werden.");
    }
  }

  async function patchMobileLicense(
  id: string,
  patch: Partial<MobileLicenseDto>)
  {
    setError(null);
    setInfo(null);

    try {
      const res = await fetch(apiUrl(`/api/company/mobile-licenses/${id}`), {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify(patch)
      });

      const data = (await res.json().catch(() => null)) as MobileLicenseMutationResponse | null;

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Mobile-Lizenz konnte nicht aktualisiert werden.");
      }

      await loadMobileLicensesFromServer();
    } catch (err: any) {
      setError(err?.message || "Mobile-Lizenz konnte nicht aktualisiert werden.");
    }
  }

  async function removeMobileLicense(id: string) {
    if (!window.confirm("Mobile-Lizenzcode wirklich löschen?")) return;

    setError(null);
    setInfo(null);

    try {
      const res = await fetch(apiUrl(`/api/company/mobile-licenses/${id}`), {
        method: "DELETE",
        headers: authHeaders()
      });

      const data = (await res.json().catch(() => null)) as
      {ok?: boolean;error?: string;} |
      null;

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Mobile-Lizenz konnte nicht gelöscht werden.");
      }

      setInfo("Mobile-Lizenz gelöscht.");
      await loadMobileLicensesFromServer();
    } catch (err: any) {
      setError(err?.message || "Mobile-Lizenz konnte nicht gelöscht werden.");
    }
  }

  async function copyMobileCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setInfo(`Code kopiert: ${code}`);
      setError(null);
    } catch {
      setInfo(code);
    }
  }


  return (
    <div className="rlc-migrated-pages-buro-nutzerverwaltung-tsx-355">
      <style>{`
        .rlc-admin-grid {
          display: grid;
          gap: 16px;
        }

        .rlc-admin-two {
          display: grid;
          grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
          gap: 16px;
        }

        .rlc-admin-invite {
          display: grid;
          grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
          gap: 16px;
        }

        .rlc-admin-mobile-form {
          display: grid;
          grid-template-columns: 150px minmax(160px, 1fr) minmax(180px, 1fr) minmax(160px, 1fr) auto;
          gap: 10px;
          align-items: end;
        }

        .rlc-admin-table-wrap {
          overflow: auto;
        }

        .rlc-admin-table tbody tr:hover {
          background: #f8fbff;
        }

        @media (max-width: 1100px) {
          .rlc-admin-two,
          .rlc-admin-invite {
            grid-template-columns: 1fr;
          }

          .rlc-admin-mobile-form {
            grid-template-columns: 1fr 1fr;
          }
        }

        @media (max-width: 720px) {
          .rlc-admin-mobile-form {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div className="rlc-page-hero rlc-page-hero--split">












        
        <div>
          <div className="rlc-page-hero__eyebrow">








            
            RLC Unternehmenszentrale
          </div>
          <h1 className="rlc-migrated-pages-buro-nutzerverwaltung-tsx-358">
            Firma, Team & Lizenzen
          </h1>
          <div className="rlc-migrated-pages-buro-nutzerverwaltung-tsx-359">
            Firmendaten, Web- und Mobile-Lizenzen, Mitarbeiter und Aktivierungscodes zentral verwalten.
          </div>
        </div>

        <div className="rlc-migrated-pages-buro-nutzerverwaltung-tsx-360">
          <button className="btn" onClick={loadDashboard} disabled={loading}>
            Aktualisieren
          </button>
          <button className="btn primary" onClick={saveHeader} disabled={saving || loading}>
            {saving ? "Speichert..." : "Firmendaten speichern"}
          </button>
        </div>
      </div>

      {error ?
      <div className={rlcClass(null,
      {
        ...sectionCard,
        padding: 13,
        border: "1px solid #fecaca",
        background: "#fff7f7",
        color: "#b91c1c"
      })}>
        
          {error}
        </div> :
      null}

      {info ?
      <div className={rlcClass(null,
      {
        ...sectionCard,
        padding: 13,
        border: "1px solid #bed6ff",
        background: "#eaf2ff",
        color: "#0b5bd3"
      })}>
        
          {info}
        </div> :
      null}

      <div className="rlc-admin-two">
        <div className={rlcClass(null, { ...sectionCard, padding: 16 })}>
          <div className={rlcClass(null, { ...sectionTitle, marginBottom: 14 })}>Firmendaten</div>

          <div className="rlc-migrated-pages-buro-nutzerverwaltung-tsx-361">
            <label className={rlcClass(null, lbl)}>Firmenname</label>
            <input className={rlcClass(null,
            inp)}
            value={form.name}
            onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} />
            

            <label className={rlcClass(null, lbl)}>Adresse</label>
            <input className={rlcClass(null,
            inp)}
            value={form.address}
            onChange={(e) => setForm((v) => ({ ...v, address: e.target.value }))} />
            

            <label className={rlcClass(null, lbl)}>Telefon</label>
            <input className={rlcClass(null,
            inp)}
            value={form.phone}
            onChange={(e) => setForm((v) => ({ ...v, phone: e.target.value }))} />
            

            <label className={rlcClass(null, lbl)}>E-Mail</label>
            <input className={rlcClass(null,
            inp)}
            value={form.email}
            onChange={(e) => setForm((v) => ({ ...v, email: e.target.value }))} />
            

            <label className={rlcClass(null, lbl)}>Firmencode</label>
            <div className="rlc-migrated-pages-buro-nutzerverwaltung-tsx-362">
              <b>{company?.code || "—"}</b>
            </div>

            <label className={rlcClass(null, lbl)}>Firmenlogo</label>
            <div className="rlc-migrated-pages-buro-nutzerverwaltung-tsx-363">
              {logoUrl ?
              <div className="rlc-migrated-pages-buro-nutzerverwaltung-tsx-364">










                
                  <img
                  src={logoUrl}
                  alt="Firmenlogo" className="rlc-migrated-pages-buro-nutzerverwaltung-tsx-365" />





                
                </div> :

              <div className="rlc-migrated-pages-buro-nutzerverwaltung-tsx-366">












                
                  Noch kein Firmenlogo eingefügt.
                </div>
              }

              <div className="rlc-migrated-pages-buro-nutzerverwaltung-tsx-367">

                
                <input
                  ref={fileRef}
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"

                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadLogo(f);
                    if (fileRef.current) fileRef.current.value = "";
                  }} className="rlc-migrated-pages-buro-nutzerverwaltung-tsx-368" />
                
                <button
                  className="btn"
                  onClick={() => fileRef.current?.click()}
                  disabled={busyLogo}>
                  
                  {busyLogo ? "Logo wird hochgeladen..." : "Logo einfügen"}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className={rlcClass(null, { ...sectionCard, padding: 16 })}>
          <div className={rlcClass(null, { ...sectionTitle, marginBottom: 14 })}>Lizenzübersicht</div>

          <div className="rlc-migrated-pages-buro-nutzerverwaltung-tsx-369">
            <div className="rlc-migrated-pages-buro-nutzerverwaltung-tsx-370">





              
              <div className={rlcClass(null,
              statCard)}>
                
                <div className={rlcClass(null, muted)}>Web-Lizenzen gekauft</div>
                <div className="rlc-migrated-pages-buro-nutzerverwaltung-tsx-371">
                  {subscription?.webSeatsPurchased ?? 0}
                </div>
              </div>

              <div className={rlcClass(null,
              statCard)}>
                
                <div className={rlcClass(null, muted)}>Benutzt</div>
                <div className="rlc-migrated-pages-buro-nutzerverwaltung-tsx-372">{seats.used ?? 0}</div>
              </div>

              <div className={rlcClass(null,
              statCard)}>
                
                <div className={rlcClass(null, muted)}>Frei</div>
                <div className="rlc-migrated-pages-buro-nutzerverwaltung-tsx-373">
                  {seats.available ?? 0}
                </div>
              </div>
            </div>

            <div className="rlc-migrated-pages-buro-nutzerverwaltung-tsx-374">
              <div className={rlcClass(null, lbl)}>Status</div>
              <div>{subscription?.active ? "Aktiv" : "Inaktiv"}</div>

              <div className={rlcClass(null, lbl)}>Plan</div>
              <div>{subscription?.plan || "—"}</div>

              <div className={rlcClass(null, lbl)}>Zeitraum Ende</div>
              <div>{fmtDate(subscription?.currentPeriodEnd)}</div>

              <div className={rlcClass(null, lbl)}>Mobile-Lizenzen</div>
              <div>{subscription?.mobileSeatsPurchased ?? 0}</div>
            </div>
          </div>
        </div>
      </div>

      <div className={rlcClass(null,
      {
        ...sectionCard,
        padding: 14,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 12
      })}>
        
        <div>
          <div className="rlc-migrated-pages-buro-nutzerverwaltung-tsx-375">Web-Einladungscode</div>
          <div className={rlcClass(null, { ...muted, marginTop: 3 })}>
            Erstellt einen Benutzerzugang für die RLC-Web-Anwendung.
          </div>
        </div>
        <div>
          <div className="rlc-migrated-pages-buro-nutzerverwaltung-tsx-376">Mobile-Aktivierungscode</div>
          <div className={rlcClass(null, { ...muted, marginTop: 3 })}>
            Aktiviert eine RLC-Mobile-Lizenz für Rolle, Mitarbeiter und Gerät.
          </div>
        </div>
      </div>

      <div className="rlc-admin-invite">
        <div className={rlcClass(null, { ...sectionCard, padding: 16 })}>
          <div className={rlcClass(null, { ...sectionTitle, marginBottom: 14 })}>Web-Einladungscode erzeugen</div>

          <div className="rlc-migrated-pages-buro-nutzerverwaltung-tsx-377">
            <label className={rlcClass(null, lbl)}>E-Mail</label>
            <input className={rlcClass(null,
            inp)}
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="optional@firma.de" />
            

            <label className={rlcClass(null, lbl)}>Rolle</label>
            <select className={rlcClass(null,
            inp)}
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}>
              
              {WEB_ROLE_OPTIONS.map((r) =>
              <option key={r} value={r}>
                  {webRoleLabel(r)}
                </option>
              )}
            </select>
          </div>

          <div className="rlc-migrated-pages-buro-nutzerverwaltung-tsx-378">
            <button className="btn primary" onClick={createInvite} disabled={busyInvite}>
              {busyInvite ? "Erstellt..." : "Web-Code erstellen"}
            </button>
          </div>

          <div className={rlcClass(null, { ...muted, marginTop: 12 })}>
            Dieser Code ist nur für den Web-Zugang. Der Mitarbeiter registriert sich damit im RLC-Web-Login.
          </div>
        </div>

        <div className={rlcClass(null, sectionCard)}>
          <div className={rlcClass(null, sectionHeader)}>
            <div className={rlcClass(null, sectionTitle)}>Web-Einladungen</div>
            <div className={rlcClass(null, { ...muted, marginTop: 3 })}>
              Web-Benutzerzugänge vorbereiten und verwalten.
            </div>
          </div>

          <table className="rlc-admin-table rlc-migrated-pages-buro-nutzerverwaltung-tsx-379">
            <thead>
              <tr>
                <th className={rlcClass(null, th)}>Code</th>
                <th className={rlcClass(null, th)}>E-Mail</th>
                <th className={rlcClass(null, th)}>Rolle</th>
                <th className={rlcClass(null, th)}>Status</th>
                <th className={rlcClass(null, th)}>Gültig bis</th>
                <th className={rlcClass(null, th)}>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {invites.length === 0 ?
              <tr>
                  <td className={rlcClass(null, { ...td, opacity: 0.7 })} colSpan={6}>
                    Keine Web-Einladungen vorhanden.
                  </td>
                </tr> :

              invites.map((i) =>
              <tr key={i.id}>
                    <td className={rlcClass(null, { ...td, fontFamily: "monospace", fontWeight: 600 })}>
                      {i.code}
                    </td>
                    <td className={rlcClass(null, td)}>{i.email || "—"}</td>
                    <td className={rlcClass(null, td)}>{i.role}</td>
                    <td className={rlcClass(null, td)}>
                      <span className={rlcClass(null, statusStyle(i.status))}>{i.status}</span>
                    </td>
                    <td className={rlcClass(null, td)}>{fmtDate(i.expiresAt)}</td>
                    <td className={rlcClass(null, td)}>
                      <button
                    className="btn"
                    onClick={() => deactivateInvite(i.id)}
                    disabled={!i.isActive || i.status !== "PENDING"}>
                    
                        Deaktivieren
                      </button>
                    </td>
                  </tr>
              )
              }
            </tbody>
          </table>
        </div>
      </div>

      <div className="card rlc-migrated-pages-buro-nutzerverwaltung-tsx-380">
        <div className="rlc-migrated-pages-buro-nutzerverwaltung-tsx-381">








          
          <div>
            <div className={rlcClass(null, sectionTitle)}>Mobile-Lizenzen & Mobile-Aktivierungscodes</div>
            <div className={rlcClass(null, muted)}>
              Rollenbezogene Codes für Bauleiter, Polier, Fahrer, Maschinist,
              Vermesser und Mitarbeiter.
            </div>
          </div>

          <div className="rlc-migrated-pages-buro-nutzerverwaltung-tsx-382">
            <span className={rlcClass(null, badge("#eaf2ff", "#0b5bd3"))}>
              Gekauft: {mobileSeatInfo.limit}
            </span>
            <span className={rlcClass(null, badge("#dcfce7", "#166534"))}>
              Aktiv: {mobileLicenses.filter((item) => item.status === "ACTIVE").length}
            </span>
            <span className={rlcClass(null, badge("#f3f4f6", "#374151"))}>
              Frei: {mobileSeatInfo.available}
            </span>
          </div>
        </div>

        <div className="rlc-admin-mobile-form rlc-migrated-pages-buro-nutzerverwaltung-tsx-383">
          <label className={rlcClass(null, lbl)}>
            Rolle
            <select className={rlcClass(null,
            { ...inp, marginTop: 4 })}
            value={mobileRole}
            onChange={(e) => setMobileRole(e.target.value)}>
              
              {MOBILE_ROLE_OPTIONS.map((role) =>
              <option key={role} value={role}>
                  {role}
                </option>
              )}
            </select>
          </label>

          <label className={rlcClass(null, lbl)}>
            Mitarbeiter
            <input className={rlcClass(null,
            { ...inp, marginTop: 4 })}
            value={mobileEmployeeName}
            onChange={(e) => setMobileEmployeeName(e.target.value)}
            placeholder="optional" />
            
          </label>

          <label className={rlcClass(null, lbl)}>
            E-Mail
            <input className={rlcClass(null,
            { ...inp, marginTop: 4 })}
            value={mobileEmployeeEmail}
            onChange={(e) => setMobileEmployeeEmail(e.target.value)}
            placeholder="optional@firma.de" />
            
          </label>

          <label className={rlcClass(null, lbl)}>
            Gerät
            <input className={rlcClass(null,
            { ...inp, marginTop: 4 })}
            value={mobileDeviceName}
            onChange={(e) => setMobileDeviceName(e.target.value)}
            placeholder="z. B. Tablet 03" />
            
          </label>

          <button className="btn primary" onClick={createMobileLicense}>
            Mobile-Web-Code erstellen
          </button>
        </div>

        <div className="rlc-migrated-pages-buro-nutzerverwaltung-tsx-384">
          <table className="rlc-admin-table rlc-migrated-pages-buro-nutzerverwaltung-tsx-385">
            <thead>
              <tr>
                <th className={rlcClass(null, th)}>Code</th>
                <th className={rlcClass(null, th)}>Rolle</th>
                <th className={rlcClass(null, th)}>Mitarbeiter</th>
                <th className={rlcClass(null, th)}>Gerät</th>
                <th className={rlcClass(null, th)}>Status</th>
                <th className={rlcClass(null, th)}>Erstellt</th>
                <th className={rlcClass(null, th)}>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {mobileLicenses.length === 0 ?
              <tr>
                  <td className={rlcClass(null, { ...td, opacity: 0.7 })} colSpan={7}>
                    Noch keine Mobile-Lizenzcodes erstellt.
                  </td>
                </tr> :

              mobileLicenses.map((item) =>
              <tr key={item.id}>
                    <td className={rlcClass(null, { ...td, fontFamily: "monospace", fontWeight: 700 })}>
                      {item.code}
                    </td>
                    <td className={rlcClass(null, td)}>{item.role}</td>
                    <td className={rlcClass(null, td)}>
                      <div>{item.employeeName || "—"}</div>
                      <div className={rlcClass(null, muted)}>{item.employeeEmail || ""}</div>
                    </td>
                    <td className={rlcClass(null, td)}>{item.deviceName || "—"}</td>
                    <td className={rlcClass(null, td)}>
                      <select className={rlcClass(null,
                  { ...inp, minWidth: 120 })}
                  value={item.status}
                  onChange={(e) =>
                  patchMobileLicense(item.id, {
                    status: e.target.value as MobileLicenseDto["status"]
                  })
                  }>
                    
                        <option value="FREE">FREI</option>
                        <option value="ACTIVE">AKTIV</option>
                        <option value="BLOCKED">GESPERRT</option>
                      </select>
                    </td>
                    <td className={rlcClass(null, td)}>{fmtDate(item.createdAt)}</td>
                    <td className={rlcClass(null, td)}>
                      <div className="rlc-migrated-pages-buro-nutzerverwaltung-tsx-386">
                        <button className="btn" onClick={() => copyMobileCode(item.code)}>
                          Kopieren
                        </button>
                        <button
                      className="btn"
                      onClick={() =>
                      patchMobileLicense(item.id, {
                        status: item.status === "BLOCKED" ? "FREE" : "BLOCKED"
                      })
                      }>
                      
                          {item.status === "BLOCKED" ? "Freigeben" : "Sperren"}
                        </button>
                        <button className="btn" onClick={() => removeMobileLicense(item.id)}>
                          Löschen
                        </button>
                      </div>
                    </td>
                  </tr>
              )
              }
            </tbody>
          </table>
        </div>
      </div>

      <div className={rlcClass(null, sectionCard)}>
        <div className={rlcClass(null, sectionHeader)}>
          <div className={rlcClass(null, sectionTitle)}>Mitglieder der Firma</div>
          <div className={rlcClass(null, { ...muted, marginTop: 3 })}>
            Rollen, Aktivstatus und Zugriffsrechte zentral steuern.
          </div>
        </div>

        {loading ?
        <div className="rlc-migrated-pages-buro-nutzerverwaltung-tsx-387">Lädt...</div> :

        <table className="rlc-admin-table rlc-migrated-pages-buro-nutzerverwaltung-tsx-388">
            <thead>
              <tr>
                <th className={rlcClass(null, th)}>Name</th>
                <th className={rlcClass(null, th)}>E-Mail</th>
                <th className={rlcClass(null, th)}>Rolle</th>
                <th className={rlcClass(null, th)}>Aktiv</th>
                <th className={rlcClass(null, th)}>Bestätigt</th>
                <th className={rlcClass(null, th)}>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ?
            <tr>
                  <td className={rlcClass(null, { ...td, opacity: 0.7 })} colSpan={6}>
                    Keine Mitglieder vorhanden.
                  </td>
                </tr> :

            members.map((m) =>
            <tr key={m.id}>
                    <td className={rlcClass(null, td)}>{m.name || "—"}</td>
                    <td className={rlcClass(null, td)}>{m.email}</td>
                    <td className={rlcClass(null, td)}>
                      <select className={rlcClass(null,
                { ...inp, minWidth: 160 })}
                value={m.companyRole}
                onChange={(e) =>
                updateMember(m.userId, { companyRole: e.target.value })
                }>
                  
                        {WEB_ROLE_OPTIONS.map((r) =>
                  <option key={r} value={r}>
                            {webRoleLabel(r)}
                          </option>
                  )}
                      </select>
                    </td>
                    <td className={rlcClass(null, td)}>{m.active ? "Ja" : "Nein"}</td>
                    <td className={rlcClass(null, td)}>{m.emailVerifiedAt ? "Ja" : "Nein"}</td>
                    <td className={rlcClass(null, td)}>
                      <button
                  className="btn"
                  onClick={() => updateMember(m.userId, { active: !m.active })}>
                  
                        {m.active ? "Deaktivieren" : "Aktivieren"}
                      </button>
                    </td>
                  </tr>
            )
            }
            </tbody>
          </table>
        }
      </div>
    </div>);

}
