import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/mengenermittlung/Uebersicht.tsx
import React from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../../components/PageHeader";
import { useProject } from "../../store/useProject";
import { API_BASE } from "../../lib/apiBase";

type TileGroup = "workflow" | "erfassung" | "kontrolle" | "export";

type Tile = {
  title: string;
  desc: string;
  to: string;
  icon: string;
  group: TileGroup;
  badge?: string;
};

type ProjectLike = {
  id?: string;
  code?: string;
  number?: string;
  name?: string;
  projectName?: string;
};

function getCurrentProject(projectCtx: any): ProjectLike | null {
  return (
    projectCtx?.currentProject ??
    projectCtx?.current ??
    projectCtx?.selectedProject ??
    projectCtx?.project ?? (
    typeof projectCtx?.getSelectedProject === "function" ?
    projectCtx.getSelectedProject() :
    null) ?? (
    typeof projectCtx?.getCurrentProject === "function" ?
    projectCtx.getCurrentProject() :
    null) ??
    null);

}

function projectCode(project: ProjectLike | null): string {
  return String(project?.code ?? project?.number ?? project?.id ?? "").
  trim().
  toUpperCase();
}

function projectName(project: ProjectLike | null): string {
  return String(project?.name ?? project?.projectName ?? "").trim();
}

function safeJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function apiUrl(path: string): string {
  const base = String(API_BASE || "").replace(/\/+$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;

  if (!base) return cleanPath;

  if (base.endsWith("/api") && cleanPath.startsWith("/api/")) {
    return `${base}${cleanPath.slice(4)}`;
  }

  return `${base}${cleanPath}`;
}

async function loadServerAufmassCount(code: string): Promise<number> {
  if (!code) return 0;

  const response = await fetch(
    apiUrl(`/api/aufmass/aufmass/${encodeURIComponent(code)}`),
    {
      method: "GET",
      credentials: "include"
    }
  );

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      payload?.error || `Aufmaß konnte nicht geladen werden: HTTP ${response.status}`
    );
  }

  const rows = Array.isArray(payload?.rows) ?
  payload.rows :
  Array.isArray(payload?.items) ?
  payload.items :
  Array.isArray(payload) ?
  payload :
  [];

  return rows.filter((row: any) => {
    const raw =
    row?.ist ??
    row?.istMenge ??
    row?.measuredQuantity ??
    row?.quantityActual ??
    0;

    const value =
    typeof raw === "string" ?
    Number(raw.replace(/\./g, "").replace(",", ".")) :
    Number(raw);

    return Number.isFinite(value) && Math.abs(value) > 0;
  }).length;
}

function TileButton({ tile }: {tile: Tile;}) {
  const nav = useNavigate();

  return (
    <button type="button" className={rlcClass(null, tileCard)} onClick={() => nav(tile.to)}>
      <div className={rlcClass(null, tileTop)}>
        <div className={rlcClass(null, iconBox)}>{tile.icon}</div>
        {tile.badge ? <span className={rlcClass(null, tileBadge)}>{tile.badge}</span> : null}
      </div>

      <div className={rlcClass(null, tileTitle)}>{tile.title}</div>
      <div className={rlcClass(null, tileText)}>{tile.desc}</div>
      <div className={rlcClass(null, tileFooter)}>Öffnen →</div>
    </button>);

}

function Section({
  title,
  subtitle,
  tiles




}: {title: string;subtitle: string;tiles: Tile[];}) {
  return (
    <section className={rlcClass(null, card)}>
      <div className={rlcClass(null, sectionHead)}>
        <div>
          <h2 className={rlcClass(null, sectionTitle)}>{title}</h2>
          <div className={rlcClass(null, sectionText)}>{subtitle}</div>
        </div>
      </div>

      <div className={rlcClass(null, tilesGrid)}>
        {tiles.map((tile) =>
        <TileButton key={tile.to} tile={tile} />
        )}
      </div>
    </section>);

}

function Kpi({
  label,
  value,
  sub,
  danger





}: {label: string;value: string;sub?: string;danger?: boolean;}) {
  return (
    <div className={rlcClass(null, kpiCard)}>
<div className={rlcClass(null, kpiLabel)}>{label}</div>
      <div className={rlcClass(null, { ...kpiValue, color: danger ? "#B91C1C" : "#0F172A" })}>
        {value}
      </div>
      {sub ? <div className={rlcClass(null, kpiSub)}>{sub}</div> : null}
    </div>);

}

export default function MengenermittlungUebersicht() {
  const nav = useNavigate();
  const projectCtx: any = useProject();
  const currentProject = getCurrentProject(projectCtx);
  const code = projectCode(currentProject);
  const name = projectName(currentProject);

  const [serverAufmassRows, setServerAufmassRows] = React.useState(0);
  const [aufmassLoading, setAufmassLoading] = React.useState(false);
  const [aufmassError, setAufmassError] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;

    if (!code) {
      setServerAufmassRows(0);
      setAufmassError("");
      return;
    }

    setAufmassLoading(true);
    setAufmassError("");

    loadServerAufmassCount(code).
    then((count) => {
      if (!cancelled) setServerAufmassRows(count);
    }).
    catch((error) => {
      console.error("[Mengenermittlung] Server-Aufmaß konnte nicht geladen werden", error);

      if (!cancelled) {
        setServerAufmassRows(0);
        setAufmassError("Serverdaten konnten nicht geladen werden");
      }
    }).
    finally(() => {
      if (!cancelled) setAufmassLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [code]);

  const nextStep = React.useMemo(() => {
    if (!code) {
      return {
        title: "Projekt auswählen",
        text: "Wähle zuerst ein Projekt, damit Aufmaß, Soll/Ist und Nachträge eindeutig gespeichert werden.",
        to: "/start"
      };
    }

    if (serverAufmassRows <= 0) {
      return {
        title: "Aufmaß starten",
        text: "Auf dem Server sind noch keine Positionen mit Ist-Menge vorhanden. Öffne den Aufmaß-Editor und erfasse Mengen.",
        to: "/mengenermittlung/aufmasseditor"
      };
    }

    return {
      title: "Soll/Ist prüfen",
      text: "Aufmaßdaten sind vorhanden. Prüfe Fortschritt, Abweichungen und abrechenbare Mengen.",
      to: "/mengenermittlung/soll-ist"
    };
  }, [code, serverAufmassRows]);

  const tiles: Tile[] = [
  {
    title: "Aufmaß-Editor",
    desc: "Zentrale Erfassung je LV-Position: Formel, Teilmengen, Ist-Menge, Notizen und strukturierte Aufmaßzeilen.",
    to: "/mengenermittlung/aufmasseditor",
    icon: "📋",
    group: "workflow",
    badge: "Zentral"
  },
  {
    title: "Positionen aus LV",
    desc: "LV-gestützte Mengenermittlung: Position wählen, Soll-Menge prüfen und Aufmaß direkt der Position zuordnen.",
    to: "/mengenermittlung/aufmasseditor",
    icon: "📐",
    group: "workflow"
  },
  {
    title: "Soll / Ist",
    desc: "Soll-Mengen, Ist-Mengen, Differenzen, Fortschritt und Überschreitungen je Position kontrollieren.",
    to: "/mengenermittlung/soll-ist",
    icon: "📊",
    group: "kontrolle",
    badge: serverAufmassRows ? `${serverAufmassRows} IST` : undefined
  },
  {
    title: "Auto KI",
    desc: "Automatische Mengenermittlung mit KI-Vorschlägen, Erkennung, Plausibilisierung und manueller Kontrolle.",
    to: "/mengenermittlung/auto",
    icon: "🧾",
    group: "erfassung"
  },
  {
    title: "GPS / GNSS",
    desc: "Messpunkte, GPS-Zuweisungen und Baustellenpositionen mit LV-Positionen und Aufmaß verknüpfen.",
    to: "/mengenermittlung/gps",
    icon: "✨",
    group: "erfassung"
  },
  {
    title: "Regieberichte",
    desc: "Regieleistungen erfassen, dokumentieren, prüfen und für Abrechnung oder Nachtrag vorbereiten.",
    to: "/mengenermittlung/regieberichte",
    icon: "📷",
    group: "workflow"
  },
  {
    title: "Lieferscheine",
    desc: "Lieferscheine verwalten, Mengen übernehmen und Material / Lieferung mit Positionen verknüpfen.",
    to: "/mengenermittlung/lieferscheine",
    icon: "📥",
    group: "workflow"
  },


  {
    title: "Historie",
    desc: "Änderungen, Snapshots, Aufmaßstände und ältere Mengenstände nachvollziehen.",
    to: "/mengenermittlung/historie",
    icon: "🚚",
    group: "kontrolle"
  },
  {
    title: "Aufmaß-Vergleich",
    desc: "Aufmaßstände vergleichen, Abweichungen erkennen und Differenzen strukturiert prüfen.",
    to: "/mengenermittlung/soll-ist",
    icon: "➕",
    group: "kontrolle"
  },
  {
    title: "Ausdrucke / Export",
    desc: "Massenaufstellung, Aufmaßblätter, Nachweise und prüfbare Exporte erzeugen.",
    to: "/mengenermittlung/aufmasseditor",
    icon: "💶",
    group: "export",
    badge: "PDF/XLSX"
  },
  {
    title: "Stammdaten",
    desc: "Formeln, Standardansätze, Einheiten und Grundlagen für die Mengenermittlung pflegen.",
    to: "/kalkulation/datenbank/preise",
    icon: "🕘",
    group: "kontrolle"
  }];


  return (
    <div className={rlcClass(null, page)}>
      <PageHeader
        breadcrumb="RLC Module / Mengenermittlung"
        title="Mengenermittlung"
        subtitle="Zentrale Steuerung für Aufmaß, Soll/Ist, Regie, Lieferscheine, GPS, Import, Nachträge und Abrechnung." />
      

      <section className={rlcClass("rlc-page-hero", heroCard)}>
        <div>
          <div className={rlcClass(null, eyebrow)}>RLC Mengenermittlung</div>
          <h1 className={rlcClass(null, heroTitle)}>Aufmaß- und Mengenzentrale</h1>
          <p className={rlcClass(null, heroText)}>
            Diese Übersicht steuert den gesamten Mengenprozess: LV-Position
            auswählen, Aufmaß erfassen, Soll/Ist prüfen, Regie und
            Lieferscheine übernehmen, Nachträge verknüpfen und prüfbare
            Ausgaben vorbereiten.
          </p>
        </div>

        <div className={rlcClass(null, heroActions)}>
          <button type="button" className={rlcClass(null, btnPrimary)} onClick={() => nav(nextStep.to)}>
            Nächster Schritt
          </button>

          <button
            type="button" className={rlcClass(null,
            btnSecondary)}
            onClick={() => nav("/mengenermittlung/aufmasseditor")}>
            
            Aufmaß öffnen
          </button>

          <button
            type="button" className={rlcClass(null,
            btnSecondary)}
            onClick={() => nav("/mengenermittlung/soll-ist")}>
            
            Soll/Ist prüfen
          </button>

          <button
            type="button" className={rlcClass(null,
            btnSecondary)}
            onClick={() => nav("/mengenermittlung/regieberichte")}>
            
            Regieberichte
          </button>
        </div>

        <div className={rlcClass(null, heroMeta)}>
          Projekt: <b>{code || "—"}</b>
          {name ?
          <>
              {" "}
              · <b>{name}</b>
            </> :
          null}
        </div>
      </section>

      <section className={rlcClass(null, grid4)}>
        <Kpi
          label="Projekt"
          value={code || "Kein Projekt"}
          sub={name || "Bitte Projekt auswählen"}
          danger={!code} />
        

        <Kpi
          label="Aufgemessen (IST)"
          value={String(serverAufmassRows)}
          sub={aufmassLoading ? "Serverdaten werden geladen…" : aufmassError || "Positionen mit Ist-Menge auf dem Server"}
          danger={!!code && serverAufmassRows <= 0} />
        

        <Kpi
          label="Datenfluss"
          value="LV → Aufmaß → Soll/Ist"
          sub="Grundlage für Abrechnung und Nachträge" />
        

        <Kpi
          label="Nächster Schritt"
          value={nextStep.title}
          sub={nextStep.text}
          danger={!code} />
        
      </section>

      <section className={rlcClass(null, workflowCard)}>
        <button type="button" className={rlcClass(null, workflowStep)} onClick={() => nav("/mengenermittlung/aufmasseditor")}>1. LV-Position</button>
        <div className={rlcClass(null, workflowArrow)}>→</div>
        <button type="button" className={rlcClass(null, workflowStep)} onClick={() => nav("/mengenermittlung/aufmasseditor")}>2. Aufmaß</button>
        <div className={rlcClass(null, workflowArrow)}>→</div>
        <button type="button" className={rlcClass(null, workflowStep)} onClick={() => nav("/mengenermittlung/soll-ist")}>3. Soll/Ist</button>
        <div className={rlcClass(null, workflowArrow)}>→</div>
        <button type="button" className={rlcClass(null, workflowStep)} onClick={() => nav("/mengenermittlung/regieberichte")}>4. Regie / LS / GPS</button>
        <div className={rlcClass(null, workflowArrow)}>→</div>
        
      </section>

      <section className={rlcClass(null, diagnoseGrid)}>
        <div className={rlcClass(null, card)}>
          <h2 className={rlcClass(null, sectionTitle)}>Aufmaß-Kontrolle</h2>
          <div className={rlcClass(null, miniStats)}>
            <span>Aktuelles Projekt</span>
            <b>{code || "—"}</b>
            <span>Aufgemessen auf Server</span>
            <b>{serverAufmassRows}</b>
            <span>Primärer Speicher</span>
            <b>Server</b>
            <span>Lokale Daten</span>
            <b>Cache / Fallback</b>
            <span>Ziel</span>
            <b>prüfbares Aufmaß</b>
          </div>

          <button
            type="button" className={rlcClass(null,
            btnFull)}
            onClick={() => nav("/mengenermittlung/aufmasseditor")}>
            
            Aufmaß-Editor öffnen
          </button>
        </div>

        <div className={rlcClass(null, card)}>
          <h2 className={rlcClass(null, sectionTitle)}>Prüf- und Abrechnungsfluss</h2>
          <div className={rlcClass(null, miniStats)}>
            <span>Soll/Ist</span>
            <b>aktiv</b>
            <span>Regie</span>
            <b>angebunden</b>
            <span>Lieferscheine</span>
            <b>angebunden</b>
            <span>Nachträge</span>
            <b>verknüpfbar</b>
            <span>Export</span>
            <b>prüfbar</b>
          </div>

          <button
            type="button" className={rlcClass(null,
            btnFull)}
            onClick={() => nav("/mengenermittlung/soll-ist")}>
            
            Soll/Ist öffnen
          </button>
        </div>
      </section>

      <Section
        title="Hauptworkflow"
        subtitle="Diese Bereiche sind der tägliche Kern der Mengenermittlung."
        tiles={tiles.filter((x) => x.group === "workflow")} />
      

      <Section
        title="Erfassung & Import"
        subtitle="Manuelle Erfassung, KI, Fotos, Dateien, CAD und GPS/GNSS."
        tiles={tiles.filter((x) => x.group === "erfassung")} />
      

      <Section
        title="Kontrolle & Historie"
        subtitle="Soll/Ist, Vergleich, Historie und fachliche Stammdaten."
        tiles={tiles.filter((x) => x.group === "kontrolle")} />
      

      <Section
        title="Nachträge, Abrechnung & Ausgabe"
        subtitle="Alles für Abrechnung, Nachweise, Nachträge und prüfbare Exporte."
        tiles={tiles.filter((x) => x.group === "export")} />
      
    </div>);

}

/* ===================== STYLES ===================== */

const page: React.CSSProperties = {
  maxWidth: 1480,
  margin: "0 auto",
  padding: "16px 18px 40px",
  fontFamily: "Inter, system-ui, Arial, Helvetica, sans-serif",
  color: "#0f172a",
  background:
  "radial-gradient(circle at top left, rgba(37,99,235,0.06), transparent 30%), #f6f8fc",
  minHeight: "100%"
};

const heroCard: React.CSSProperties = {
  background: "linear-gradient(135deg, #0B5BD3 0%, #0B5BD3 48%, #146EF5 100%)",
  color: "#FFFFFF",
  borderRadius: 18,
  padding: 22,
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
  fontSize: 30,
  fontWeight: 700,
  lineHeight: 1.1
};

const heroText: React.CSSProperties = {
  margin: 0,
  maxWidth: 980,
  opacity: 0.9,
  lineHeight: 1.55
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

const btnBase: React.CSSProperties = {
  fontSize: 13,
  borderRadius: 10,
  padding: "11px 16px",
  border: "1px solid #D1D5DB",
  background: "#FFFFFF",
  color: "#0F172A",
  cursor: "pointer",
  fontWeight: 700,
  whiteSpace: "nowrap"
};

const btnPrimary: React.CSSProperties = {
  padding: "9px 12px",
  border: "1px solid #146ef5",
  background: "linear-gradient(135deg,#146ef5,#155eef)",
  borderRadius: 12,
  fontSize: 13,
  fontWeight: 700,
  color: "#ffffff",
  cursor: "pointer",
  boxShadow: "0 8px 20px rgba(37,99,235,0.18)"
};

const btnSecondary: React.CSSProperties = {
  ...btnBase
};

const btnFull: React.CSSProperties = {
  ...btnPrimary,
  marginTop: 14,
  width: "100%"
};

const grid4: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
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
  marginTop: 6,
  fontSize: 20,
  color: "#0F172A",
  fontWeight: 700,
  lineHeight: 1.25
};

const kpiSub: React.CSSProperties = {
  marginTop: 4,
  fontSize: 12,
  color: "#64748B",
  lineHeight: 1.35
};

const workflowCard: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 16,
  padding: 16,
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap"
};

const workflowStep: React.CSSProperties = {
  background: "#EAF2FF",
  cursor: "pointer",
  color: "#1E3A8A",
  border: "1px solid #BED6FF",
  borderRadius: 999,
  padding: "8px 12px",
  fontSize: 13,
  fontWeight: 700
};

const workflowArrow: React.CSSProperties = {
  color: "#64748B",
  fontWeight: 700
};

const diagnoseGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))",
  gap: 14
};

const card: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e5eaf3",
  borderRadius: 18,
  boxShadow: "0 12px 32px rgba(15,23,42,0.06)",
  padding: 16
};

const miniStats: React.CSSProperties = {
  marginTop: 12,
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: 8,
  fontSize: 13,
  color: "#0F172A"
};

const sectionHead: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
  marginBottom: 12
};

const sectionTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 17,
  color: "#0F172A",
  fontWeight: 700
};

const sectionText: React.CSSProperties = {
  marginTop: 4,
  fontSize: 13,
  color: "#64748B",
  lineHeight: 1.5
};

const tilesGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
  gap: 14
};

const tileCard: React.CSSProperties = {
  textAlign: "left",
  padding: 16,
  border: "1px solid #E5E7EB",
  borderRadius: 16,
  background: "#FFFFFF",
  cursor: "pointer",
  minHeight: 158,
  display: "grid",
  alignContent: "start",
  gap: 8,
  boxShadow: "0 1px 2px rgba(15,23,42,0.035)"
};

const tileTop: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 10
};

const iconBox: React.CSSProperties = {
  width: 46,
  height: 46,
  borderRadius: 14,
  background: "#EAF2FF",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 24,
  border: "1px solid #DBEAFE"
};

const tileBadge: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  border: "1px solid #BED6FF",
  background: "#EAF2FF",
  color: "#0B5BD3",
  borderRadius: 999,
  padding: "4px 9px",
  fontSize: 11,
  fontWeight: 700,
  whiteSpace: "nowrap"
};

const tileTitle: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 16,
  color: "#0F172A",
  marginTop: 2
};

const tileText: React.CSSProperties = {
  color: "#64748B",
  fontSize: 13,
  lineHeight: 1.5
};

const tileFooter: React.CSSProperties = {
  marginTop: 6,
  color: "#146EF5",
  fontSize: 13,
  fontWeight: 700
};
