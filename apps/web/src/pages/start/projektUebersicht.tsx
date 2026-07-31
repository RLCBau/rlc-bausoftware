import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/start/projektUebersicht.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../../lib/apiBase";
import { useProject } from "../../store/useProject";

/* ================= API ================= */

function apiUrl(path: string): string {
  const base = String(API_BASE || "").replace(/\/+$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;

  if (!base) return cleanPath;

  if (base.endsWith("/api") && cleanPath.startsWith("/api/")) {
    return `${base}${cleanPath.slice(4)}`;
  }

  return `${base}${cleanPath}`;
}

/* ================= TYPES ================= */

type ProjectLike = {
  id?: string;
  code?: string;
  number?: string;
  projektnummer?: string;
  name?: string;
  projectName?: string;
  projektname?: string;
  client?: string;
  auftraggeber?: string;
  kunde?: string;
  place?: string;
  city?: string;
  ort?: string;
  location?: string;
};

type ProjectStatus = "Cloud" | "Local" | "Unbekannt";

type ModuleTile = {
  nr: string;
  title: string;
  desc: string;
  to: string;
  icon: string;
  accent: string;
  accentText: string;
  main?: boolean;
};

/* ================= IMPORT WIDGET ================= */

function ImportProjectJsonInline({ onDone }: {onDone?: () => void;}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload() {
    if (!file) {
      window.alert("Bitte zuerst eine project.json auswählen.");
      return;
    }

    setBusy(true);

    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch(apiUrl("/api/import/project-json"), {
        method: "POST",
        body: form,
        credentials: "include"
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json || json.ok === false) {
        throw new Error(json?.error || "Import fehlgeschlagen.");
      }

      window.alert("Projekt importiert.");
      setFile(null);
      onDone?.();
    } catch (e: any) {
      console.error(e);
      window.alert(`Import fehlgeschlagen: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={rlcClass(null, importInline)}>
      <input
        type="file"
        accept=".json,application/json"
        onChange={(e) => setFile(e.target.files?.[0] || null)} className={rlcClass(null,
        fileInput)} />
      

      <button
        type="button"
        onClick={upload}
        disabled={!file || busy} className={rlcClass(null,
        !file || busy ? btnDisabled : btnPrimary)}>
        
        {busy ? "Importiere…" : "Project.json importieren"}
      </button>
    </div>);

}

/* ================= HELPERS ================= */

function getProjectStatus(cur: ProjectLike | null): ProjectStatus {
  if (!cur) return "Unbekannt";
  if (cur.id && String(cur.id).startsWith("local-")) return "Local";
  if (cur.id) return "Cloud";
  return "Unbekannt";
}

function readLastOpenedAt(idOrCode: string): string {
  try {
    const raw = localStorage.getItem("rlc_recent_projects_meta");
    const parsed = raw ? JSON.parse(raw) : {};
    const ts = parsed?.[idOrCode];

    if (!ts) return "—";

    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "—";

    return d.toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return "—";
  }
}

function saveLastOpenedAt(idOrCode: string) {
  try {
    const raw = localStorage.getItem("rlc_recent_projects_meta");
    const parsed = raw ? JSON.parse(raw) : {};
    parsed[idOrCode] = new Date().toISOString();
    localStorage.setItem("rlc_recent_projects_meta", JSON.stringify(parsed));
  } catch {


    // ignore
  }}
function getProjectFromCtx(projectCtx: any): ProjectLike | null {
  const p =
  projectCtx?.currentProject ??
  projectCtx?.current ??
  projectCtx?.selectedProject ??
  projectCtx?.project ?? (
  typeof projectCtx?.getCurrentProject === "function" ?
  projectCtx.getCurrentProject() :
  null);

  if (p && typeof p === "object") return p as ProjectLike;

  try {
    const g = globalThis as any;
    return g.__RLC_CURRENT_PROJECT ?? null;
  } catch {
    return null;
  }
}

function statusBadge(status: ProjectStatus): React.CSSProperties {
  if (status === "Cloud") {
    return {
      ...badgeBase,
      border: "1px solid #BED6FF",
      background: "#EAF2FF",
      color: "#0B5BD3"
    };
  }

  if (status === "Local") {
    return {
      ...badgeBase,
      border: "1px solid #FDE68A",
      background: "#FFFBEB",
      color: "#92400E"
    };
  }

  return {
    ...badgeBase,
    border: "1px solid #CBD5E1",
    background: "#F8FAFC",
    color: "#475569"
  };
}

/* ================= COMPONENT ================= */

export default function ProjektUebersicht() {
  const nav = useNavigate();
  const projectCtx: any = useProject?.() ?? null;
  const cur = getProjectFromCtx(projectCtx);

  useEffect(() => {
    if (!projectCtx || !cur) return;

    const already =
    projectCtx.currentProject ??
    projectCtx.current ??
    projectCtx.selectedProject ??
    projectCtx.project ??
    null;

    if (
    already && (
    already.id && cur.id && already.id === cur.id ||
    already.code && cur.code && already.code === cur.code))
    {
      return;
    }

    try {
      projectCtx?.setCurrentProject?.(cur);
      if (cur.id) {
        projectCtx?.setCurrentProjectId?.(cur.id);
        projectCtx?.selectProjectById?.(cur.id);
      }
      projectCtx?.selectProject?.(cur);
    } catch (e) {
      console.warn("Projekt-Kontext konnte nicht synchronisiert werden:", e);
    }

    try {
      const g = globalThis as any;
      g.__RLC_CURRENT_PROJECT = cur;
    } catch {


      // ignore
    }}, [projectCtx, cur]);
  useEffect(() => {
    const key = String(cur?.id || cur?.code || "");
    if (key) saveLastOpenedAt(key);
  }, [cur?.id, cur?.code]);

  const normalized = useMemo(() => {
    const number = cur?.code ?? cur?.number ?? cur?.projektnummer ?? "";
    const name = cur?.name ?? cur?.projectName ?? cur?.projektname ?? "";
    const client = cur?.client ?? cur?.auftraggeber ?? cur?.kunde ?? "";
    const location = cur?.place ?? cur?.city ?? cur?.ort ?? cur?.location ?? "";
    const status = getProjectStatus(cur);
    const lastOpened = readLastOpenedAt(String(cur?.id || cur?.code || ""));

    return {
      number,
      name,
      client,
      location,
      status,
      lastOpened
    };
  }, [cur]);

  const tiles: ModuleTile[] = [
  {
    nr: "01",
    title: "Kalkulation",
    desc: "LV, Preise, KI-Kalkulation, Nachträge, Angebot, GAEB und Angebotsanalyse.",
    to: "/kalkulation",
    icon: "💰",
    accent: "#DCFCE7",
    accentText: "#166534",
    main: true
  },
  {
    nr: "02",
    title: "Mengenermittlung",
    desc: "Aufmaß, Regieberichte, Lieferscheine, Fotos, Soll-Ist und Abrechnung.",
    to: "/mengenermittlung",
    icon: "📋",
    accent: "#DBEAFE",
    accentText: "#0B5BD3",
    main: true
  },
  {
    nr: "03",
    title: "CAD / Planung",
    desc: "Pläne, Viewer, PDF, As-Built, technische Projektansicht und Export.",
    to: "/cad/viewer",
    icon: "📐",
    accent: "#EDE9FE",
    accentText: "#6D28D9",
    main: true
  },
  {
    nr: "04",
    title: "Büro / Verwaltung",
    desc: "Dokumente, Kommunikation, Aufgaben, Nutzer, Kalender und Organisation.",
    to: "/buro",
    icon: "🏢",
    accent: "#E0F2FE",
    accentText: "#0369A1",
    main: true
  },
  {
    nr: "05",
    title: "KI",
    desc: "Intelligente Unterstützung für Kalkulation, Analyse und Baustellenlogik.",
    to: "/ki",
    icon: "🤖",
    accent: "#FCE7F3",
    accentText: "#BE185D",
    main: true
  },
  {
    nr: "06",
    title: "Buchhaltung",
    desc: "Rechnungen, Abschläge, Zahlungen, Kostenstellen, DATEV und Auswertung.",
    to: "/buchhaltung",
    icon: "📒",
    accent: "#FEF3C7",
    accentText: "#B45309",
    main: true
  },
  {
    nr: "07",
    title: "Info / Hilfe",
    desc: "Anleitungen, Updates, Support, Videoerklärungen und Systeminformationen.",
    to: "/info",
    icon: "ℹ️",
    accent: "#E2E8F0",
    accentText: "#334155"
  }];


  if (!cur) {
    return (
      <div className={rlcClass(null, page)}>
        <section className={rlcClass("rlc-page-hero", heroCard)}>
          <div>
            <div className={rlcClass(null, eyebrow)}>RLC Projekt</div>
            <h1 className={rlcClass(null, heroTitle)}>Kein Projekt gewählt</h1>
            <p className={rlcClass(null, heroSubtitle)}>
              Bitte zuerst ein Projekt auswählen oder eine project.json importieren.
            </p>
          </div>

          <div className={rlcClass(null, heroActions)}>
            <button type="button" className={rlcClass(null, btnPrimary)} onClick={() => nav("/start")}>
              Projekt auswählen
            </button>
          </div>
        </section>

        <section className={rlcClass(null, card)}>
          <h2 className={rlcClass(null, sectionTitle)}>Projekt importieren</h2>
          <p className={rlcClass(null, sectionText)}>
            Optional kann ein bestehendes Projekt über eine project.json übernommen werden.
          </p>

          <div className="rlc-migrated-pages-start-projektuebersicht-tsx-1566">
            <ImportProjectJsonInline onDone={() => nav("/start")} />
          </div>
        </section>
      </div>);

  }

  return (
    <div className={rlcClass(null, page)}>
      <section className={rlcClass("rlc-page-hero", heroCard)}>
        <div>
          <div className={rlcClass(null, eyebrow)}>RLC Projektzentrale</div>
          <h1 className={rlcClass(null, heroTitle)}>Projekt-Übersicht</h1>
          <p className={rlcClass(null, heroSubtitle)}>
            Zentrale Projektseite für Module, Status, Schnellzugriffe und Weiterbearbeitung.
          </p>
        </div>

        <div className={rlcClass(null, heroActions)}>
          <button type="button" className={rlcClass(null, btnPrimary)} onClick={() => nav("/kalkulation")}>
            Kalkulation öffnen
          </button>

          <button
            type="button" className={rlcClass(null,
            btnSecondaryDark)}
            onClick={() => nav("/kalkulation/lv-import")}>
            
            LV / Positionen
          </button>

          <button
            type="button" className={rlcClass(null,
            btnSecondaryDark)}
            onClick={() => nav("/kalkulation/angebot")}>
            
            Angebot / Export
          </button>

          <button type="button" className={rlcClass(null, btnSecondaryDark)} onClick={() => nav("/start")}>
            Projekt wechseln
          </button>
        </div>

        <div className={rlcClass(null, heroMeta)}>
          Projekt: <b>{normalized.number || "—"}</b>
          {normalized.name ? <span> · {normalized.name}</span> : null}
          <span> · Status: </span>
          <b>{normalized.status}</b>
        </div>
      </section>

      <section className={rlcClass(null, kpiGrid)}>
        <InfoKpi label="Projektcode" value={normalized.number || "—"} />
        <InfoKpi label="Projektname" value={normalized.name || "—"} />
        <InfoKpi label="Auftraggeber" value={normalized.client || "—"} />
        <InfoKpi label="Ort" value={normalized.location || "—"} />
        <InfoKpi label="Letzter Zugriff" value={normalized.lastOpened} />
        <InfoKpi label="Speicherart" value={normalized.status} badge={normalized.status} />
      </section>

      <section className={rlcClass(null, card)}>
        <div className={rlcClass(null, sectionHead)}>
          <div>
            <h2 className={rlcClass(null, sectionTitle)}>Module</h2>
            <div className={rlcClass(null, sectionText)}>
              Gleiche Struktur wie in der Kalkulation: klare Module, schnelle Navigation,
              saubere Projektlogik.
            </div>
          </div>

          <div className={rlcClass(null, statusBadge(normalized.status))}>{normalized.status}</div>
        </div>

        <div className={rlcClass(null, tilesGrid)}>
          {tiles.map((tile) =>
          <button
            key={tile.to}
            type="button"
            onClick={() => nav(tile.to)} className={rlcClass(null,
            {
              ...tileCard,
              minHeight: tile.main ? 178 : 154
            })}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 14px 32px rgba(15,23,42,0.10)";
              e.currentTarget.style.borderColor = "#BED6FF";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 1px 2px rgba(15,23,42,0.04)";
              e.currentTarget.style.borderColor = "#E5E7EB";
            }}>
            
              <div className={rlcClass(null, tileTop)}>
                <div className={rlcClass(null, { ...tileIcon, background: tile.accent, color: tile.accentText })}>
                  {tile.icon}
                </div>
                <div className={rlcClass(null, tileNr)}>{tile.nr}</div>
              </div>

              <div className={rlcClass(null, tileTitle)}>{tile.title}</div>
              <div className={rlcClass(null, tileDesc)}>{tile.desc}</div>

              <div className={rlcClass(null, tileFooter)}>
                Öffnen <span>→</span>
              </div>
            </button>
          )}
        </div>
      </section>

      <section className={rlcClass(null, quickCard)}>
        <div>
          <h2 className={rlcClass(null, sectionTitle)}>Schnellzugriffe</h2>
          <div className={rlcClass(null, sectionText)}>
            Direkte Wege zu den wichtigsten Projektfunktionen.
          </div>
        </div>

        <div className={rlcClass(null, quickActions)}>
          <button type="button" className={rlcClass(null, btnSecondary)} onClick={() => nav("/kalkulation/gaeb")}>
            GAEB prüfen
          </button>

          <button type="button" className={rlcClass(null, btnSecondary)} onClick={() => nav("/kalkulation/nachtraege")}>
            Nachträge
          </button>

          <button type="button" className={rlcClass(null, btnSecondary)} onClick={() => nav("/kalkulation/crm")}>
            CRM / Angebotsverfolgung
          </button>

          <button type="button" className={rlcClass(null, btnSecondary)} onClick={() => nav("/kalkulation/versionsvergleich")}>
            Versionsvergleich / Analyse
          </button>

          <button type="button" className={rlcClass(null, btnSecondary)} onClick={() => nav("/start")}>
            Zurück zur Projektauswahl
          </button>
        </div>
      </section>

      <section className={rlcClass(null, card)}>
        <div className={rlcClass(null, sectionHead)}>
          <div>
            <h2 className={rlcClass(null, sectionTitle)}>Weiteres Projekt importieren</h2>
            <div className={rlcClass(null, sectionText)}>
              Optional: project.json direkt importieren und danach zur Projekt-Auswahl wechseln.
            </div>
          </div>
        </div>

        <ImportProjectJsonInline onDone={() => nav("/start")} />
      </section>
    </div>);

}

/* ================= UI ================= */

function InfoKpi({
  label,
  value,
  badge




}: {label: string;value: string;badge?: ProjectStatus;}) {
  return (
    <div className={rlcClass(null, kpiCard)}>
      <div className={rlcClass(null, kpiLabel)}>{label}</div>
      <div className={rlcClass(null, kpiValue)}>
        {badge ? <span className={rlcClass(null, statusBadge(badge))}>{value}</span> : value}
      </div>
    </div>);

}

/* ================= STYLES ================= */

const page: React.CSSProperties = {
  display: "grid",
  gap: 16,
  padding: 16
};

const heroCard: React.CSSProperties = {
  background: "linear-gradient(135deg, #0B5BD3 0%, #0B5BD3 48%, #146EF5 100%)",
  color: "#FFFFFF",
  borderRadius: 18,
  padding: 24,
  display: "grid",
  gap: 14,
  boxShadow: "0 16px 40px rgba(15,23,42,0.18)"
};

const eyebrow: React.CSSProperties = {
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  opacity: 0.82,
  fontWeight: 700
};

const heroTitle: React.CSSProperties = {
  color: "#FFFFFF", margin: "4px 0",
  fontSize: 32,
  lineHeight: 1.12,
  fontWeight: 700
};

const heroSubtitle: React.CSSProperties = {
  margin: 0,
  maxWidth: 980,
  opacity: 0.9,
  lineHeight: 1.55,
  fontSize: 14
};

const heroActions: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap"
};

const heroMeta: React.CSSProperties = {
  fontSize: 13,
  opacity: 0.92
};

const card: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 16,
  padding: 18,
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)"
};

const quickCard: React.CSSProperties = {
  ...card,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 14,
  flexWrap: "wrap",
  border: "1px solid #DBEAFE"
};

const kpiGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
  gap: 12
};

const kpiCard: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)"
};

const kpiLabel: React.CSSProperties = {
  fontSize: 12,
  color: "#64748B",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em"
};

const kpiValue: React.CSSProperties = {
  marginTop: 7,
  fontSize: 17,
  color: "#0F172A",
  fontWeight: 700,
  wordBreak: "break-word"
};

const sectionHead: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 14
};

const sectionTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 19,
  color: "#0F172A",
  fontWeight: 700
};

const sectionText: React.CSSProperties = {
  marginTop: 5,
  fontSize: 13,
  color: "#64748B",
  lineHeight: 1.45
};

const tilesGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(285px,1fr))",
  gap: 14
};

const tileCard: React.CSSProperties = {
  textAlign: "left",
  padding: 18,
  border: "1px solid #E5E7EB",
  borderRadius: 18,
  background: "#FFFFFF",
  cursor: "pointer",
  transition: "all 160ms ease",
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
  display: "grid",
  alignContent: "space-between",
  gap: 10
};

const tileTop: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 10
};

const tileIcon: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: 14,
  display: "grid",
  placeItems: "center",
  fontSize: 25,
  fontWeight: 700
};

const tileNr: React.CSSProperties = {
  border: "1px solid #DBEAFE",
  background: "#EAF2FF",
  color: "#0B5BD3",
  borderRadius: 999,
  padding: "5px 9px",
  fontSize: 11,
  fontWeight: 700
};

const tileTitle: React.CSSProperties = {
  marginTop: 4,
  fontSize: 19,
  fontWeight: 700,
  color: "#0F172A"
};

const tileDesc: React.CSSProperties = {
  color: "#64748B",
  fontSize: 13,
  lineHeight: 1.5
};

const tileFooter: React.CSSProperties = {
  marginTop: 6,
  color: "#0B5BD3",
  fontSize: 13,
  fontWeight: 700,
  display: "flex",
  gap: 6,
  alignItems: "center"
};

const quickActions: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap"
};

const btnBase: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: 10,
  padding: "10px 14px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap"
};

const btnPrimary: React.CSSProperties = {
  ...btnBase,
  border: "1px solid #146EF5",
  background: "#146EF5",
  color: "#FFFFFF"
};

const btnSecondary: React.CSSProperties = {
  ...btnBase,
  background: "#FFFFFF",
  color: "#0F172A"
};

const btnSecondaryDark: React.CSSProperties = {
  ...btnBase,
  border: "1px solid rgba(255,255,255,0.35)",
  background: "rgba(255,255,255,0.95)",
  color: "#0F172A"
};

const btnDisabled: React.CSSProperties = {
  ...btnPrimary,
  border: "1px solid #CBD5E1",
  background: "#E5E7EB",
  color: "#64748B",
  cursor: "not-allowed",
  opacity: 0.75
};

const badgeBase: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 999,
  padding: "5px 10px",
  fontSize: 12,
  fontWeight: 700
};

const importInline: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap"
};

const fileInput: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: 10,
  padding: "9px 11px",
  background: "#FFFFFF",
  fontSize: 13
};
