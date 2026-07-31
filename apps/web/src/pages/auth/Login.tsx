import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/auth/Login.tsx
import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiUrl } from "../../lib/apiBase";

type CompanyPayload = {
  id: string;
  name: string;
  code: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  logoPath?: string | null;
  updatedAt?: string | null;
};

type AuthUser = {
  id: string;
  email: string;
  appRole?: string | null;
  emailVerifiedAt?: string | null;
  companyId?: string | null;
  companyRole?: string | null;
};

type AuthResponse = {
  ok?: boolean;
  token?: string;
  user?: AuthUser;
  company?: CompanyPayload | null;
  error?: string;
  canResend?: boolean;
  verificationSent?: boolean;
};

const AUTH_KEYS = [
"rlc_token",
"token",
"authToken",
"accessToken",
"rlc.auth.token",
"rlc_mobile_token"] as
const;

function setAuth(
token: string,
user?: AuthUser | null,
company?: CompanyPayload | null)
{
  try {
    for (const key of AUTH_KEYS) localStorage.removeItem(key);

    localStorage.setItem("rlc_token", token);

    if (user?.companyId) {
      localStorage.setItem("rlc_company_id", user.companyId);
    }

    if (company) {
      localStorage.setItem("rlc_company", JSON.stringify(company));
    }

    localStorage.setItem(
      "rlc_auth",
      JSON.stringify({
        token,
        user: user ?? null,
        company: company ?? null
      })
    );
  } catch {


    // ignore
  }}
function getRedirectTarget(state: unknown): string {
  const from = (state as any)?.from;
  if (typeof from === "string" && from.startsWith("/")) return from;
  return "/start";
}

function mapErrorMessage(code?: string) {
  switch (String(code || "").trim()) {
    case "BAD_CREDENTIALS":
      return "E-Mail oder Passwort ist falsch.";
    case "EMAIL_NOT_VERIFIED":
      return "E-Mail noch nicht bestätigt.";
    case "EMAIL_ALREADY_VERIFIED":
      return "Diese E-Mail ist bereits bestätigt.";
    case "EMAIL_SEND_FAILED":
      return "E-Mail konnte nicht gesendet werden.";
    case "INVITE_INVALID":
      return "Der Einladungscode ist ungültig.";
    case "INVITE_INACTIVE":
      return "Der Einladungscode ist nicht mehr aktiv.";
    case "INVITE_EXPIRED":
      return "Der Einladungscode ist abgelaufen.";
    case "INVITE_ALREADY_USED":
      return "Der Einladungscode wurde bereits verwendet.";
    case "INVITE_EMAIL_MISMATCH":
      return "Der Einladungscode gehört zu einer anderen E-Mail-Adresse.";
    case "WEB_SEAT_LIMIT_REACHED":
      return "Keine freien Web-Lizenzen mehr verfügbar.";
    case "TOKEN_INVALID":
      return "Der Code ist ungültig oder abgelaufen.";
    case "company missing":
      return "Firma konnte nicht geladen werden.";
    default:
      return code || "Vorgang fehlgeschlagen.";
  }
}

const shell: React.CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  gridTemplateColumns: "1.15fr 0.85fr",
  background: "linear-gradient(180deg,#eef4ff 0%, #f8fafc 100%)"
};

const left: React.CSSProperties = {
  padding: "56px 64px",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center"
};

const right: React.CSSProperties = {
  padding: "40px 48px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center"
};

const logoRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  marginBottom: 20
};

const title: React.CSSProperties = {
  margin: 0,
  fontSize: 36,
  lineHeight: 1.05,
  fontWeight: 600,
  color: "#0f172a"
};

const subtitle: React.CSSProperties = {
  marginTop: 18,
  fontSize: 16,
  lineHeight: 1.6,
  color: "#475569",
  maxWidth: 760
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2,minmax(220px,1fr))",
  gap: 14,
  marginTop: 28,
  maxWidth: 820
};

const featureCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.72)",
  border: "1px solid #dbe4f0",
  borderRadius: 16,
  padding: "16px 18px",
  boxShadow: "0 8px 24px rgba(15,23,42,0.05)"
};

const featureTitle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  color: "#0f172a",
  marginBottom: 6
};

const featureText: React.CSSProperties = {
  fontSize: 13,
  lineHeight: 1.55,
  color: "#475569"
};

const loginCard: React.CSSProperties = {
  width: "100%",
  maxWidth: 460,
  background: "#ffffff",
  border: "1px solid #dbe4f0",
  borderRadius: 14,
  padding: 22,
  boxShadow: "0 4px 18px rgba(15,23,42,0.06)"
};

const hLogin: React.CSSProperties = {
  margin: 0,
  fontSize: 26,
  lineHeight: 1.2,
  fontWeight: 600,
  color: "#0f172a"
};

const loginSub: React.CSSProperties = {
  marginTop: 8,
  color: "#64748b",
  fontSize: 14
};

const label: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  marginBottom: 6,
  color: "#0f172a"
};

const input: React.CSSProperties = {
  width: "100%",
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  outline: "none",
  background: "#fff",
  color: "#0f172a",
  boxSizing: "border-box"
};

const primaryBtn: React.CSSProperties = {
  width: "100%",
  border: 0,
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 15,
  fontWeight: 700,
  cursor: "pointer",
  background: "#1769e0",
  color: "#fff"
};

const secondaryBtn: React.CSSProperties = {
  width: "100%",
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  cursor: "pointer",
  background: "#fff",
  color: "#0f172a"
};

const tabBtn = (active: boolean): React.CSSProperties => ({
  flex: 1,
  border: active ? "1px solid #146ef5" : "1px solid #cbd5e1",
  background: active ? "#eaf2ff" : "#fff",
  color: active ? "#0b5bd3" : "#0f172a",
  borderRadius: 12,
  padding: "11px 12px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer"
});

const foot: React.CSSProperties = {
  marginTop: 16,
  fontSize: 12,
  color: "#64748b",
  textAlign: "center",
  lineHeight: 1.5
};

export default function Login() {
  const nav = useNavigate();
  const location = useLocation();

  const [mode, setMode] = React.useState<"login" | "register">("login");

  const [email, setEmail] = React.useState("rlcvermessung@gmail.com");
  const [password, setPassword] = React.useState("");
  const [name, setName] = React.useState("");
  const [inviteCode, setInviteCode] = React.useState("");

  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [canResend, setCanResend] = React.useState(false);

  const redirectTo = React.useMemo(
    () => getRedirectTarget(location.state),
    [location.state]
  );

  async function handleLogin(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password;

    if (!cleanEmail || !cleanPassword) {
      setError("Bitte E-Mail und Passwort eingeben.");
      return;
    }

    setBusy(true);
    setError(null);
    setInfo(null);
    setCanResend(false);

    try {
      const res = await fetch(apiUrl("/api/auth/login"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          email: cleanEmail,
          password: cleanPassword,
          mode: "SERVER_SYNC"
        })
      });

      const data = (await res.json().catch(() => null)) as AuthResponse | null;

      if (!res.ok || !data?.ok || !data?.token) {
        setCanResend(Boolean(data?.canResend));
        throw new Error(mapErrorMessage(data?.error));
      }

      setAuth(data.token, data.user, data.company ?? null);
      nav(redirectTo, { replace: true });
    } catch (err: any) {
      setError(err?.message || "Login fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRegister(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password;
    const cleanName = name.trim();
    const cleanInviteCode = inviteCode.trim();

    if (!cleanEmail || !cleanPassword) {
      setError("Bitte E-Mail und Passwort eingeben.");
      return;
    }

    if (!cleanName) {
      setError("Bitte Namen eingeben.");
      return;
    }

    setBusy(true);
    setError(null);
    setInfo(null);
    setCanResend(false);

    try {
      const res = await fetch(apiUrl("/api/auth/register"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          email: cleanEmail,
          password: cleanPassword,
          name: cleanName,
          inviteCode: cleanInviteCode || undefined,
          mode: "SERVER_SYNC"
        })
      });

      const data = (await res.json().catch(() => null)) as AuthResponse | null;

      if (!res.ok || !data?.ok || !data?.token) {
        setCanResend(Boolean(data?.canResend));
        throw new Error(mapErrorMessage(data?.error));
      }

      setAuth(data.token, data.user, data.company ?? null);

      if (data.user?.emailVerifiedAt) {
        nav(redirectTo, { replace: true });
        return;
      }

      setInfo(
        data.verificationSent ?
        "Registrierung erfolgreich. Bitte bestätigen Sie jetzt Ihre E-Mail." :
        "Registrierung erfolgreich. Bitte bestätigen Sie Ihre E-Mail."
      );
      setMode("login");
    } catch (err: any) {
      setError(err?.message || "Registrierung fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || busy) return;

    setBusy(true);
    setError(null);
    setInfo(null);

    try {
      const res = await fetch(apiUrl("/api/auth/resend"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({ email: cleanEmail })
      });

      const data = (await res.json().catch(() => null)) as
      {ok?: boolean;error?: string;} |
      null;

      if (!res.ok || data?.ok === false) {
        throw new Error(mapErrorMessage(data?.error || "Resend fehlgeschlagen"));
      }

      setInfo("Bestätigungs-E-Mail wurde erneut gesendet.");
    } catch (err: any) {
      setError(err?.message || "Resend fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={rlcClass(null, shell)}>
      <div className={rlcClass(null, left)}>
        <div className={rlcClass(null, logoRow)}>
          <img src="/logo.svg" alt="RLC Logo" className="rlc-migrated-pages-auth-login-tsx-57" />
        </div>

        <h1 className={rlcClass(null, title)}>RLC Bausoftware</h1>

        <div className={rlcClass(null, subtitle)}>
          Die intelligente <b>Bausoftware</b> mit <b>Web</b>, <b>Mobile App</b>{" "}
          und
          <b> Cloud</b>, um nicht nur zu dokumentieren, sondern einen großen
          Teil der Arbeit des <b>Kalkulators</b> real zu übernehmen – von{" "}
          <b>Kalkulation</b> und
          <b> LV</b> bis zu <b>Mengenermittlung</b>, <b>Baustelle</b>,
          <b> Angeboten</b>, <b>Rechnungen</b> und intelligenter
          <b> Projektlogik</b>.
        </div>

        <div className={rlcClass(null, grid)}>
          <div className={rlcClass(null, featureCard)}>
            <div className={rlcClass(null, featureTitle)}>Kalkulation & LV</div>
            <div className={rlcClass(null, featureText)}>
              Leistungsverzeichnis importieren, Preise pflegen, Angebote
              erstellen, Nachträge verwalten und Kalkulationsprozesse deutlich
              beschleunigen.
            </div>
          </div>

          <div className={rlcClass(null, featureCard)}>
            <div className={rlcClass(null, featureTitle)}>Mengenermittlung & Baustelle</div>
            <div className={rlcClass(null, featureText)}>
              Aufmaß, Regieberichte, Lieferscheine, Soll-Ist-Vergleich und
              praktische Baustellenprozesse direkt im Projekt zusammenführen.
            </div>
          </div>

          <div className={rlcClass(null, featureCard)}>
            <div className={rlcClass(null, featureTitle)}>
              Mobile App, Baustelle & Synchronisation
            </div>
            <div className={rlcClass(null, featureText)}>
              Eine echte Bausoftware-App für die Baustelle: Regieberichte,
              Fotos, Lieferscheine, Mengenermittlung, Angebote und Rechnungen
              direkt mobil erfassen – offline nutzbar und mit dem Hauptsystem
              synchronisiert.
            </div>
          </div>

          <div className={rlcClass(null, featureCard)}>
            <div className={rlcClass(null, featureTitle)}>KI-gestützte Kalkulation</div>
            <div className={rlcClass(null, featureText)}>
              KI mit echtem Praxisnutzen: Positionen, Mengen und Zusammenhänge
              intelligenter erkennen, Kalkulationen beschleunigen und manuelle
              Routinen des Kalkulators spürbar reduzieren.
            </div>
          </div>
        </div>
      </div>

      <div className={rlcClass(null, right)}>
        <form className={rlcClass(null,
        loginCard)}
        onSubmit={mode === "login" ? handleLogin : handleRegister}>
          
          <div className="rlc-migrated-pages-auth-login-tsx-58">
            <button
              type="button" className={rlcClass(null,
              tabBtn(mode === "login"))}
              onClick={() => {
                setMode("login");
                setError(null);
                setInfo(null);
              }}>
              
              Anmelden
            </button>
            <button
              type="button" className={rlcClass(null,
              tabBtn(mode === "register"))}
              onClick={() => {
                setMode("register");
                setError(null);
                setInfo(null);
              }}>
              
              Registrieren
            </button>
          </div>

          <h2 className={rlcClass(null, hLogin)}>
            {mode === "login" ? "Anmelden" : "Registrierung"}
          </h2>
          <div className={rlcClass(null, loginSub)}>
            {mode === "login" ?
            "Bitte mit Ihrem Server-Zugang einloggen." :
            "Neuen Zugang erstellen und optional Einladungscode eingeben."}
          </div>

          {mode === "register" ?
          <div className="rlc-migrated-pages-auth-login-tsx-59">
              <label className={rlcClass(null, label)}>Name</label>
              <input className={rlcClass(null,
            input)}
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Vor- und Nachname" />
            
            </div> :
          null}

          <div className="rlc-migrated-pages-auth-login-tsx-60">
            <label className={rlcClass(null, label)}>E-Mail</label>
            <input className={rlcClass(null,
            input)}
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ihre@email.de" />
            
          </div>

          <div className="rlc-migrated-pages-auth-login-tsx-61">
            <label className={rlcClass(null, label)}>Passwort</label>
            <input className={rlcClass(null,
            input)}
            type="password"
            autoComplete={
            mode === "login" ? "current-password" : "new-password"
            }
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Passwort" />
            
          </div>

          {mode === "register" ?
          <div className="rlc-migrated-pages-auth-login-tsx-62">
              <label className={rlcClass(null, label)}>Einladungscode der Firma</label>
              <input className={rlcClass(null,
            input)}
            type="text"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
            placeholder="z. B. RLC-7A3F-91BC" />
            
            </div> :
          null}

          {error ?
          <div className="rlc-migrated-pages-auth-login-tsx-63">









            
              {error}
            </div> :
          null}

          {info ?
          <div className="rlc-migrated-pages-auth-login-tsx-64">









            
              {info}
            </div> :
          null}

          <div className="rlc-migrated-pages-auth-login-tsx-65">
            <button type="submit" className={rlcClass(null, primaryBtn)} disabled={busy}>
              {busy ?
              mode === "login" ?
              "Anmeldung..." :
              "Registrierung..." :
              mode === "login" ?
              "Einloggen" :
              "Registrieren"}
            </button>

            {mode === "login" && canResend ?
            <button
              type="button" className={rlcClass(null,
              secondaryBtn)}
              onClick={handleResend}
              disabled={busy}>
              
                Bestätigungs-E-Mail erneut senden
              </button> :
            null}
          </div>

          <div className={rlcClass(null, foot)}>
            RLC Bausoftware · Cloud · Web · Mobile App
            <br />
            Tiefbau · Hochbau · Planungsbüro · Vermessung
          </div>
        </form>
      </div>
    </div>);

}
