import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
import React from "react";
import { apiUrl } from "../../lib/apiBase";
const th = {
    textAlign: "left",
    padding: "11px 12px",
    borderBottom: "1px solid #dbe4ef",
    fontSize: 12,
    fontWeight: 700,
    color: "#334155",
    background: "#f8fafc",
    whiteSpace: "nowrap"
};
const td = {
    padding: "10px 12px",
    borderBottom: "1px solid #e7edf5",
    fontSize: 13,
    verticalAlign: "middle",
    color: "#1e293b"
};
const inp = {
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
const lbl = {
    fontSize: 12,
    color: "#475569",
    fontWeight: 700
};
const sectionTitle = {
    margin: 0,
    fontSize: 17,
    fontWeight: 700,
    color: "#0f172a",
    letterSpacing: "-0.01em"
};
const muted = {
    fontSize: 12,
    color: "#64748b"
};
const badge = (bg, color = "#111827") => ({
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
const sectionCard = {
    background: "#ffffff",
    border: "1px solid #dbe4ef",
    borderRadius: 16,
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
    overflow: "hidden"
};
const sectionHeader = {
    padding: "14px 16px",
    borderBottom: "1px solid #e2e8f0",
    background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)"
};
const statCard = {
    border: "1px solid #dbe4ef",
    borderRadius: 14,
    padding: 14,
    background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
    boxShadow: "0 4px 14px rgba(15, 23, 42, 0.04)"
};
function getToken() {
    try {
        return (localStorage.getItem("rlc_token") ||
            JSON.parse(localStorage.getItem("rlc_auth") || "{}")?.token ||
            "");
    }
    catch {
        return "";
    }
}
function authHeaders(extra) {
    const token = getToken();
    return {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(extra || {})
    };
}
function fmtDate(v) {
    if (!v)
        return "—";
    const d = new Date(v);
    if (Number.isNaN(d.getTime()))
        return v;
    return d.toLocaleString("de-DE");
}
function statusStyle(status) {
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
    "GAST"
];
const MOBILE_ROLE_OPTIONS = [
    "BAULEITER",
    "POLIER",
    "VORARBEITER",
    "FAHRER",
    "MASCHINIST",
    "VERMESSER",
    "MITARBEITER"
];
function webRoleLabel(role) {
    return role === "MITARBEITER" ? "VERMESSUNG / TECHNIKER" : role;
}
function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === "string" ?
            resolve(reader.result) :
            reject(new Error("Logo konnte nicht gelesen werden."));
        reader.onerror = () => reject(reader.error || new Error("Logo konnte nicht gelesen werden."));
        reader.readAsDataURL(file);
    });
}
function persistSharedCompanyProfile(company, logoDataUrl) {
    if (!company)
        return;
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
    const [error, setError] = React.useState(null);
    const [info, setInfo] = React.useState(null);
    const [company, setCompany] = React.useState(null);
    const [subscription, setSubscription] = React.useState(null);
    const [seats, setSeats] = React.useState({
        used: 0,
        limit: 0,
        available: 0
    });
    const [members, setMembers] = React.useState([]);
    const [invites, setInvites] = React.useState([]);
    const [form, setForm] = React.useState({
        name: "",
        address: "",
        phone: "",
        email: ""
    });
    const [inviteEmail, setInviteEmail] = React.useState("");
    const [inviteRole, setInviteRole] = React.useState("MITARBEITER");
    const [mobileLicenses, setMobileLicenses] = React.useState([]);
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
    const fileRef = React.useRef(null);
    const [logoUrl, setLogoUrl] = React.useState(null);
    const loadMobileLicensesFromServer = React.useCallback(async () => {
        const res = await fetch(apiUrl("/api/company/mobile-licenses"), {
            method: "GET",
            headers: authHeaders()
        });
        const data = (await res.json().catch(() => null));
        if (!res.ok || !data?.ok) {
            throw new Error(data?.error || "Mobile-Lizenzen konnten nicht geladen werden.");
        }
        setMobileLicenses(data.mobileLicenses ?? []);
        setMobileSeatInfo(data.seats ?? {
            subscriptionActive: false,
            used: 0,
            limit: 0,
            available: 0
        });
    }, []);
    const loadDashboard = React.useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(apiUrl("/api/company/admin/dashboard"), {
                method: "GET",
                headers: authHeaders()
            });
            const data = (await res.json().catch(() => null));
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
        }
        catch (err) {
            setError(err?.message || "Dashboard konnte nicht geladen werden.");
        }
        finally {
            setLoading(false);
        }
    }, [loadMobileLicensesFromServer]);
    React.useEffect(() => {
        loadDashboard();
    }, [loadDashboard]);
    React.useEffect(() => {
        let alive = true;
        let objectUrl = null;
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
                        const dataUrl = await new Promise((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onload = () => typeof reader.result === "string" ?
                                resolve(reader.result) :
                                reject(new Error("Logo konnte nicht gelesen werden."));
                            reader.onerror = () => reject(reader.error);
                            reader.readAsDataURL(blob);
                        });
                        persistSharedCompanyProfile(company, dataUrl);
                    }
                    catch {
                        persistSharedCompanyProfile(company);
                    }
                }
            }
            catch {
                if (alive)
                    setLogoUrl(null);
            }
        }
        loadLogo();
        return () => {
            alive = false;
            if (objectUrl)
                URL.revokeObjectURL(objectUrl);
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
            const data = (await res.json().catch(() => null));
            if (!res.ok || !data?.ok || !data.company) {
                throw new Error(data?.error || "Firmendaten konnten nicht gespeichert werden.");
            }
            setCompany(data.company);
            persistSharedCompanyProfile(data.company, logoUrl?.startsWith("data:image/") ? logoUrl : null);
            setInfo("Firmendaten gespeichert und für alle PDF-Module bereitgestellt.");
        }
        catch (err) {
            setError(err?.message || "Firmendaten konnten nicht gespeichert werden.");
        }
        finally {
            setSaving(false);
        }
    }
    async function uploadLogo(file) {
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
            const data = (await res.json().catch(() => null));
            if (!res.ok || !data?.ok || !data.company) {
                throw new Error(data?.error || "Logo konnte nicht hochgeladen werden.");
            }
            setCompany(data.company);
            setLogoUrl(logoDataUrl);
            persistSharedCompanyProfile(data.company, logoDataUrl);
            setInfo("Logo erfolgreich hochgeladen und für alle PDF-Module gespeichert.");
        }
        catch (err) {
            setError(err?.message || "Logo konnte nicht hochgeladen werden.");
        }
        finally {
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
            const data = (await res.json().catch(() => null));
            if (!res.ok || !data?.ok || !data.invite) {
                const apiError = String(data?.error || "");
                if (apiError.toLowerCase().includes("invalid role")) {
                    throw new Error("Ungültige Web-Rolle. Für Web-Einladungen sind nur ADMIN, BAULEITER, VERMESSUNG / TECHNIKER, KALKULATOR, BUCHHALTUNG und GAST erlaubt.");
                }
                throw new Error(apiError || "Web-Einladungscode konnte nicht erstellt werden.");
            }
            setInfo(`Einladungscode erstellt: ${data.invite.code}`);
            setInviteEmail("");
            await loadDashboard();
        }
        catch (err) {
            setError(err?.message || "Web-Einladungscode konnte nicht erstellt werden.");
        }
        finally {
            setBusyInvite(false);
        }
    }
    async function deactivateInvite(id) {
        setError(null);
        setInfo(null);
        try {
            const res = await fetch(apiUrl(`/api/company/invites/deactivate/${id}`), {
                method: "POST",
                headers: authHeaders()
            });
            const data = (await res.json().catch(() => null));
            if (!res.ok || !data?.ok) {
                throw new Error(data?.error || "Web-Einladung konnte nicht deaktiviert werden.");
            }
            setInfo("Web-Einladung deaktiviert.");
            await loadDashboard();
        }
        catch (err) {
            setError(err?.message || "Web-Einladung konnte nicht deaktiviert werden.");
        }
    }
    async function updateMember(userId, patch) {
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
            const data = (await res.json().catch(() => null));
            if (!res.ok || !data?.ok) {
                throw new Error(data?.error || "Mitglied konnte nicht aktualisiert werden.");
            }
            await loadDashboard();
        }
        catch (err) {
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
            const data = (await res.json().catch(() => null));
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
        }
        catch (err) {
            setError(err?.message || "Mobile-Aktivierungscode konnte nicht erstellt werden.");
        }
    }
    async function patchMobileLicense(id, patch) {
        setError(null);
        setInfo(null);
        try {
            const res = await fetch(apiUrl(`/api/company/mobile-licenses/${id}`), {
                method: "PATCH",
                headers: authHeaders(),
                body: JSON.stringify(patch)
            });
            const data = (await res.json().catch(() => null));
            if (!res.ok || !data?.ok) {
                throw new Error(data?.error || "Mobile-Lizenz konnte nicht aktualisiert werden.");
            }
            await loadMobileLicensesFromServer();
        }
        catch (err) {
            setError(err?.message || "Mobile-Lizenz konnte nicht aktualisiert werden.");
        }
    }
    async function removeMobileLicense(id) {
        if (!window.confirm("Mobile-Lizenzcode wirklich löschen?"))
            return;
        setError(null);
        setInfo(null);
        try {
            const res = await fetch(apiUrl(`/api/company/mobile-licenses/${id}`), {
                method: "DELETE",
                headers: authHeaders()
            });
            const data = (await res.json().catch(() => null));
            if (!res.ok || !data?.ok) {
                throw new Error(data?.error || "Mobile-Lizenz konnte nicht gelöscht werden.");
            }
            setInfo("Mobile-Lizenz gelöscht.");
            await loadMobileLicensesFromServer();
        }
        catch (err) {
            setError(err?.message || "Mobile-Lizenz konnte nicht gelöscht werden.");
        }
    }
    async function copyMobileCode(code) {
        try {
            await navigator.clipboard.writeText(code);
            setInfo(`Code kopiert: ${code}`);
            setError(null);
        }
        catch {
            setInfo(code);
        }
    }
    return (_jsxs("div", { className: "rlc-migrated-pages-buro-nutzerverwaltung-tsx-355", children: [_jsx("style", { children: `
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
      ` }), _jsxs("div", { className: "rlc-page-hero rlc-page-hero--split", children: [_jsxs("div", { children: [_jsx("div", { className: "rlc-page-hero__eyebrow", children: "RLC Unternehmenszentrale" }), _jsx("h1", { className: "rlc-migrated-pages-buro-nutzerverwaltung-tsx-358", children: "Firma, Team & Lizenzen" }), _jsx("div", { className: "rlc-migrated-pages-buro-nutzerverwaltung-tsx-359", children: "Firmendaten, Web- und Mobile-Lizenzen, Mitarbeiter und Aktivierungscodes zentral verwalten." })] }), _jsxs("div", { className: "rlc-migrated-pages-buro-nutzerverwaltung-tsx-360", children: [_jsx("button", { className: "btn", onClick: loadDashboard, disabled: loading, children: "Aktualisieren" }), _jsx("button", { className: "btn primary", onClick: saveHeader, disabled: saving || loading, children: saving ? "Speichert..." : "Firmendaten speichern" })] })] }), error ?
                _jsx("div", { className: rlcClass(null, {
                        ...sectionCard,
                        padding: 13,
                        border: "1px solid #fecaca",
                        background: "#fff7f7",
                        color: "#b91c1c"
                    }), children: error }) :
                null, info ?
                _jsx("div", { className: rlcClass(null, {
                        ...sectionCard,
                        padding: 13,
                        border: "1px solid #bed6ff",
                        background: "#eaf2ff",
                        color: "#0b5bd3"
                    }), children: info }) :
                null, _jsxs("div", { className: "rlc-admin-two", children: [_jsxs("div", { className: rlcClass(null, { ...sectionCard, padding: 16 }), children: [_jsx("div", { className: rlcClass(null, { ...sectionTitle, marginBottom: 14 }), children: "Firmendaten" }), _jsxs("div", { className: "rlc-migrated-pages-buro-nutzerverwaltung-tsx-361", children: [_jsx("label", { className: rlcClass(null, lbl), children: "Firmenname" }), _jsx("input", { className: rlcClass(null, inp), value: form.name, onChange: (e) => setForm((v) => ({ ...v, name: e.target.value })) }), _jsx("label", { className: rlcClass(null, lbl), children: "Adresse" }), _jsx("input", { className: rlcClass(null, inp), value: form.address, onChange: (e) => setForm((v) => ({ ...v, address: e.target.value })) }), _jsx("label", { className: rlcClass(null, lbl), children: "Telefon" }), _jsx("input", { className: rlcClass(null, inp), value: form.phone, onChange: (e) => setForm((v) => ({ ...v, phone: e.target.value })) }), _jsx("label", { className: rlcClass(null, lbl), children: "E-Mail" }), _jsx("input", { className: rlcClass(null, inp), value: form.email, onChange: (e) => setForm((v) => ({ ...v, email: e.target.value })) }), _jsx("label", { className: rlcClass(null, lbl), children: "Firmencode" }), _jsx("div", { className: "rlc-migrated-pages-buro-nutzerverwaltung-tsx-362", children: _jsx("b", { children: company?.code || "—" }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Firmenlogo" }), _jsxs("div", { className: "rlc-migrated-pages-buro-nutzerverwaltung-tsx-363", children: [logoUrl ?
                                                _jsx("div", { className: "rlc-migrated-pages-buro-nutzerverwaltung-tsx-364", children: _jsx("img", { src: logoUrl, alt: "Firmenlogo", className: "rlc-migrated-pages-buro-nutzerverwaltung-tsx-365" }) }) :
                                                _jsx("div", { className: "rlc-migrated-pages-buro-nutzerverwaltung-tsx-366", children: "Noch kein Firmenlogo eingef\u00FCgt." }), _jsxs("div", { className: "rlc-migrated-pages-buro-nutzerverwaltung-tsx-367", children: [_jsx("input", { ref: fileRef, type: "file", accept: ".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp", onChange: (e) => {
                                                            const f = e.target.files?.[0];
                                                            if (f)
                                                                uploadLogo(f);
                                                            if (fileRef.current)
                                                                fileRef.current.value = "";
                                                        }, className: "rlc-migrated-pages-buro-nutzerverwaltung-tsx-368" }), _jsx("button", { className: "btn", onClick: () => fileRef.current?.click(), disabled: busyLogo, children: busyLogo ? "Logo wird hochgeladen..." : "Logo einfügen" })] })] })] })] }), _jsxs("div", { className: rlcClass(null, { ...sectionCard, padding: 16 }), children: [_jsx("div", { className: rlcClass(null, { ...sectionTitle, marginBottom: 14 }), children: "Lizenz\u00FCbersicht" }), _jsxs("div", { className: "rlc-migrated-pages-buro-nutzerverwaltung-tsx-369", children: [_jsxs("div", { className: "rlc-migrated-pages-buro-nutzerverwaltung-tsx-370", children: [_jsxs("div", { className: rlcClass(null, statCard), children: [_jsx("div", { className: rlcClass(null, muted), children: "Web-Lizenzen gekauft" }), _jsx("div", { className: "rlc-migrated-pages-buro-nutzerverwaltung-tsx-371", children: subscription?.webSeatsPurchased ?? 0 })] }), _jsxs("div", { className: rlcClass(null, statCard), children: [_jsx("div", { className: rlcClass(null, muted), children: "Benutzt" }), _jsx("div", { className: "rlc-migrated-pages-buro-nutzerverwaltung-tsx-372", children: seats.used ?? 0 })] }), _jsxs("div", { className: rlcClass(null, statCard), children: [_jsx("div", { className: rlcClass(null, muted), children: "Frei" }), _jsx("div", { className: "rlc-migrated-pages-buro-nutzerverwaltung-tsx-373", children: seats.available ?? 0 })] })] }), _jsxs("div", { className: "rlc-migrated-pages-buro-nutzerverwaltung-tsx-374", children: [_jsx("div", { className: rlcClass(null, lbl), children: "Status" }), _jsx("div", { children: subscription?.active ? "Aktiv" : "Inaktiv" }), _jsx("div", { className: rlcClass(null, lbl), children: "Plan" }), _jsx("div", { children: subscription?.plan || "—" }), _jsx("div", { className: rlcClass(null, lbl), children: "Zeitraum Ende" }), _jsx("div", { children: fmtDate(subscription?.currentPeriodEnd) }), _jsx("div", { className: rlcClass(null, lbl), children: "Mobile-Lizenzen" }), _jsx("div", { children: subscription?.mobileSeatsPurchased ?? 0 })] })] })] })] }), _jsxs("div", { className: rlcClass(null, {
                    ...sectionCard,
                    padding: 14,
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12
                }), children: [_jsxs("div", { children: [_jsx("div", { className: "rlc-migrated-pages-buro-nutzerverwaltung-tsx-375", children: "Web-Einladungscode" }), _jsx("div", { className: rlcClass(null, { ...muted, marginTop: 3 }), children: "Erstellt einen Benutzerzugang f\u00FCr die RLC-Web-Anwendung." })] }), _jsxs("div", { children: [_jsx("div", { className: "rlc-migrated-pages-buro-nutzerverwaltung-tsx-376", children: "Mobile-Aktivierungscode" }), _jsx("div", { className: rlcClass(null, { ...muted, marginTop: 3 }), children: "Aktiviert eine RLC-Mobile-Lizenz f\u00FCr Rolle, Mitarbeiter und Ger\u00E4t." })] })] }), _jsxs("div", { className: "rlc-admin-invite", children: [_jsxs("div", { className: rlcClass(null, { ...sectionCard, padding: 16 }), children: [_jsx("div", { className: rlcClass(null, { ...sectionTitle, marginBottom: 14 }), children: "Web-Einladungscode erzeugen" }), _jsxs("div", { className: "rlc-migrated-pages-buro-nutzerverwaltung-tsx-377", children: [_jsx("label", { className: rlcClass(null, lbl), children: "E-Mail" }), _jsx("input", { className: rlcClass(null, inp), value: inviteEmail, onChange: (e) => setInviteEmail(e.target.value), placeholder: "optional@firma.de" }), _jsx("label", { className: rlcClass(null, lbl), children: "Rolle" }), _jsx("select", { className: rlcClass(null, inp), value: inviteRole, onChange: (e) => setInviteRole(e.target.value), children: WEB_ROLE_OPTIONS.map((r) => _jsx("option", { value: r, children: webRoleLabel(r) }, r)) })] }), _jsx("div", { className: "rlc-migrated-pages-buro-nutzerverwaltung-tsx-378", children: _jsx("button", { className: "btn primary", onClick: createInvite, disabled: busyInvite, children: busyInvite ? "Erstellt..." : "Web-Code erstellen" }) }), _jsx("div", { className: rlcClass(null, { ...muted, marginTop: 12 }), children: "Dieser Code ist nur f\u00FCr den Web-Zugang. Der Mitarbeiter registriert sich damit im RLC-Web-Login." })] }), _jsxs("div", { className: rlcClass(null, sectionCard), children: [_jsxs("div", { className: rlcClass(null, sectionHeader), children: [_jsx("div", { className: rlcClass(null, sectionTitle), children: "Web-Einladungen" }), _jsx("div", { className: rlcClass(null, { ...muted, marginTop: 3 }), children: "Web-Benutzerzug\u00E4nge vorbereiten und verwalten." })] }), _jsxs("table", { className: "rlc-admin-table rlc-migrated-pages-buro-nutzerverwaltung-tsx-379", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, th), children: "Code" }), _jsx("th", { className: rlcClass(null, th), children: "E-Mail" }), _jsx("th", { className: rlcClass(null, th), children: "Rolle" }), _jsx("th", { className: rlcClass(null, th), children: "Status" }), _jsx("th", { className: rlcClass(null, th), children: "G\u00FCltig bis" }), _jsx("th", { className: rlcClass(null, th), children: "Aktion" })] }) }), _jsx("tbody", { children: invites.length === 0 ?
                                            _jsx("tr", { children: _jsx("td", { className: rlcClass(null, { ...td, opacity: 0.7 }), colSpan: 6, children: "Keine Web-Einladungen vorhanden." }) }) :
                                            invites.map((i) => _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, { ...td, fontFamily: "monospace", fontWeight: 600 }), children: i.code }), _jsx("td", { className: rlcClass(null, td), children: i.email || "—" }), _jsx("td", { className: rlcClass(null, td), children: i.role }), _jsx("td", { className: rlcClass(null, td), children: _jsx("span", { className: rlcClass(null, statusStyle(i.status)), children: i.status }) }), _jsx("td", { className: rlcClass(null, td), children: fmtDate(i.expiresAt) }), _jsx("td", { className: rlcClass(null, td), children: _jsx("button", { className: "btn", onClick: () => deactivateInvite(i.id), disabled: !i.isActive || i.status !== "PENDING", children: "Deaktivieren" }) })] }, i.id)) })] })] })] }), _jsxs("div", { className: "card rlc-migrated-pages-buro-nutzerverwaltung-tsx-380", children: [_jsxs("div", { className: "rlc-migrated-pages-buro-nutzerverwaltung-tsx-381", children: [_jsxs("div", { children: [_jsx("div", { className: rlcClass(null, sectionTitle), children: "Mobile-Lizenzen & Mobile-Aktivierungscodes" }), _jsx("div", { className: rlcClass(null, muted), children: "Rollenbezogene Codes f\u00FCr Bauleiter, Polier, Fahrer, Maschinist, Vermesser und Mitarbeiter." })] }), _jsxs("div", { className: "rlc-migrated-pages-buro-nutzerverwaltung-tsx-382", children: [_jsxs("span", { className: rlcClass(null, badge("#eaf2ff", "#0b5bd3")), children: ["Gekauft: ", mobileSeatInfo.limit] }), _jsxs("span", { className: rlcClass(null, badge("#dcfce7", "#166534")), children: ["Aktiv: ", mobileLicenses.filter((item) => item.status === "ACTIVE").length] }), _jsxs("span", { className: rlcClass(null, badge("#f3f4f6", "#374151")), children: ["Frei: ", mobileSeatInfo.available] })] })] }), _jsxs("div", { className: "rlc-admin-mobile-form rlc-migrated-pages-buro-nutzerverwaltung-tsx-383", children: [_jsxs("label", { className: rlcClass(null, lbl), children: ["Rolle", _jsx("select", { className: rlcClass(null, { ...inp, marginTop: 4 }), value: mobileRole, onChange: (e) => setMobileRole(e.target.value), children: MOBILE_ROLE_OPTIONS.map((role) => _jsx("option", { value: role, children: role }, role)) })] }), _jsxs("label", { className: rlcClass(null, lbl), children: ["Mitarbeiter", _jsx("input", { className: rlcClass(null, { ...inp, marginTop: 4 }), value: mobileEmployeeName, onChange: (e) => setMobileEmployeeName(e.target.value), placeholder: "optional" })] }), _jsxs("label", { className: rlcClass(null, lbl), children: ["E-Mail", _jsx("input", { className: rlcClass(null, { ...inp, marginTop: 4 }), value: mobileEmployeeEmail, onChange: (e) => setMobileEmployeeEmail(e.target.value), placeholder: "optional@firma.de" })] }), _jsxs("label", { className: rlcClass(null, lbl), children: ["Ger\u00E4t", _jsx("input", { className: rlcClass(null, { ...inp, marginTop: 4 }), value: mobileDeviceName, onChange: (e) => setMobileDeviceName(e.target.value), placeholder: "z. B. Tablet 03" })] }), _jsx("button", { className: "btn primary", onClick: createMobileLicense, children: "Mobile-Web-Code erstellen" })] }), _jsx("div", { className: "rlc-migrated-pages-buro-nutzerverwaltung-tsx-384", children: _jsxs("table", { className: "rlc-admin-table rlc-migrated-pages-buro-nutzerverwaltung-tsx-385", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, th), children: "Code" }), _jsx("th", { className: rlcClass(null, th), children: "Rolle" }), _jsx("th", { className: rlcClass(null, th), children: "Mitarbeiter" }), _jsx("th", { className: rlcClass(null, th), children: "Ger\u00E4t" }), _jsx("th", { className: rlcClass(null, th), children: "Status" }), _jsx("th", { className: rlcClass(null, th), children: "Erstellt" }), _jsx("th", { className: rlcClass(null, th), children: "Aktion" })] }) }), _jsx("tbody", { children: mobileLicenses.length === 0 ?
                                        _jsx("tr", { children: _jsx("td", { className: rlcClass(null, { ...td, opacity: 0.7 }), colSpan: 7, children: "Noch keine Mobile-Lizenzcodes erstellt." }) }) :
                                        mobileLicenses.map((item) => _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, { ...td, fontFamily: "monospace", fontWeight: 700 }), children: item.code }), _jsx("td", { className: rlcClass(null, td), children: item.role }), _jsxs("td", { className: rlcClass(null, td), children: [_jsx("div", { children: item.employeeName || "—" }), _jsx("div", { className: rlcClass(null, muted), children: item.employeeEmail || "" })] }), _jsx("td", { className: rlcClass(null, td), children: item.deviceName || "—" }), _jsx("td", { className: rlcClass(null, td), children: _jsxs("select", { className: rlcClass(null, { ...inp, minWidth: 120 }), value: item.status, onChange: (e) => patchMobileLicense(item.id, {
                                                            status: e.target.value
                                                        }), children: [_jsx("option", { value: "FREE", children: "FREI" }), _jsx("option", { value: "ACTIVE", children: "AKTIV" }), _jsx("option", { value: "BLOCKED", children: "GESPERRT" })] }) }), _jsx("td", { className: rlcClass(null, td), children: fmtDate(item.createdAt) }), _jsx("td", { className: rlcClass(null, td), children: _jsxs("div", { className: "rlc-migrated-pages-buro-nutzerverwaltung-tsx-386", children: [_jsx("button", { className: "btn", onClick: () => copyMobileCode(item.code), children: "Kopieren" }), _jsx("button", { className: "btn", onClick: () => patchMobileLicense(item.id, {
                                                                    status: item.status === "BLOCKED" ? "FREE" : "BLOCKED"
                                                                }), children: item.status === "BLOCKED" ? "Freigeben" : "Sperren" }), _jsx("button", { className: "btn", onClick: () => removeMobileLicense(item.id), children: "L\u00F6schen" })] }) })] }, item.id)) })] }) })] }), _jsxs("div", { className: rlcClass(null, sectionCard), children: [_jsxs("div", { className: rlcClass(null, sectionHeader), children: [_jsx("div", { className: rlcClass(null, sectionTitle), children: "Mitglieder der Firma" }), _jsx("div", { className: rlcClass(null, { ...muted, marginTop: 3 }), children: "Rollen, Aktivstatus und Zugriffsrechte zentral steuern." })] }), loading ?
                        _jsx("div", { className: "rlc-migrated-pages-buro-nutzerverwaltung-tsx-387", children: "L\u00E4dt..." }) :
                        _jsxs("table", { className: "rlc-admin-table rlc-migrated-pages-buro-nutzerverwaltung-tsx-388", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, th), children: "Name" }), _jsx("th", { className: rlcClass(null, th), children: "E-Mail" }), _jsx("th", { className: rlcClass(null, th), children: "Rolle" }), _jsx("th", { className: rlcClass(null, th), children: "Aktiv" }), _jsx("th", { className: rlcClass(null, th), children: "Best\u00E4tigt" }), _jsx("th", { className: rlcClass(null, th), children: "Aktion" })] }) }), _jsx("tbody", { children: members.length === 0 ?
                                        _jsx("tr", { children: _jsx("td", { className: rlcClass(null, { ...td, opacity: 0.7 }), colSpan: 6, children: "Keine Mitglieder vorhanden." }) }) :
                                        members.map((m) => _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, td), children: m.name || "—" }), _jsx("td", { className: rlcClass(null, td), children: m.email }), _jsx("td", { className: rlcClass(null, td), children: _jsx("select", { className: rlcClass(null, { ...inp, minWidth: 160 }), value: m.companyRole, onChange: (e) => updateMember(m.userId, { companyRole: e.target.value }), children: WEB_ROLE_OPTIONS.map((r) => _jsx("option", { value: r, children: webRoleLabel(r) }, r)) }) }), _jsx("td", { className: rlcClass(null, td), children: m.active ? "Ja" : "Nein" }), _jsx("td", { className: rlcClass(null, td), children: m.emailVerifiedAt ? "Ja" : "Nein" }), _jsx("td", { className: rlcClass(null, td), children: _jsx("button", { className: "btn", onClick: () => updateMember(m.userId, { active: !m.active }), children: m.active ? "Deaktivieren" : "Aktivieren" }) })] }, m.id)) })] })] })] }));
}
