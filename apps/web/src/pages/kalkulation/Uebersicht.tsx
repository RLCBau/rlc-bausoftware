import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/kalkulation/Uebersicht.tsx
import React from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../../components/PageHeader";
import { useProject } from "../../store/useProject";
import { LV, type LVPos } from "./store.lv";
import { KalkulationsDatenbank } from "./kalkulationsDatenbank";

type TileGroup = "workflow" | "daten" | "export";

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

function n(value: unknown): number {
  const raw = String(value ?? "0").
  replace(/\s/g, "").
  replace(/\.(?=\d{3}(?:[.,]|$))/g, "").
  replace(",", ".");

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: unknown): string {
  return `${n(value).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} €`;
}

function rowPrice(row: LVPos): number {
  return n((row as any).finalUnitPrice ?? row.preis ?? (row as any).suggestedUnitPrice);
}

function rowTotal(row: LVPos): number {
  const stored = n((row as any).gesamt ?? (row as any).totalNet ?? (row as any).gp);
  if (stored > 0) return stored;
  return n(row.menge) * rowPrice(row);
}

function extractKiRows(payload: any): LVPos[] {
  const candidates = [
    payload?.rows,
    payload?.data?.rows,
    payload?.snapshot?.rows,
    payload?.data?.snapshot?.rows,
    payload?.positions,
    payload?.data?.positions,
    payload?.items,
    payload?.data?.items
  ];
  for (const value of candidates) {
    if (Array.isArray(value)) return value as LVPos[];
  }
  return [];
}

function readLocalKiRows(code: string): LVPos[] {
  if (!code || typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(`rlc_kalkulation_mit_ki_elite_v1:${code}`);
    if (!raw) return [];
    return extractKiRows(JSON.parse(raw));
  } catch {
    return [];
  }
}

function norm(value: unknown): string {
  return String(value ?? "").
  toLowerCase().
  normalize("NFKD").
  replace(/[\u0300-\u036f]/g, "").
  replace(/[^\p{L}\p{N}]+/gu, " ").
  replace(/\s+/g, " ").
  trim();
}

function duplicateKey(row: LVPos): string {
  const text = norm(`${row.kurztext || ""} ${row.langtext || ""}`);
  if (text.length < 8) return "";

  return [
  text,
  norm(row.einheit),
  Math.round(n(row.menge) * 1000) / 1000,
  Math.round(rowPrice(row) * 100) / 100].
  join("|");
}

function getDuplicateCount(rows: LVPos[]): number {
  const map = new Map<string, LVPos[]>();

  for (const row of rows) {
    const key = duplicateKey(row);
    if (!key) continue;

    const list = map.get(key) || [];
    list.push(row);
    map.set(key, list);
  }

  return Array.from(map.values()).reduce(
    (sum, group) => sum + Math.max(0, group.length - 1),
    0
  );
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
    <div className={rlcClass("rlc-global-kpi-card", kpiCard)}>
      <div className={rlcClass("rlc-global-kpi-label", kpiLabel)}>{label}</div>
      <div className={rlcClass("rlc-global-kpi-value", { ...kpiValue, color: danger ? "#B91C1C" : "#0F172A" })}>
        {value}
      </div>
      {sub ? <div className={rlcClass("rlc-global-kpi-sub", kpiSub)}>{sub}</div> : null}
    </div>);

}

export default function KalkulationUebersicht() {
  const nav = useNavigate();
  const projectCtx: any = useProject();
  const currentProject = getCurrentProject(projectCtx);
  const code = projectCode(currentProject);
  const name = projectName(currentProject);

  const [lvRows, setLvRows] = React.useState<LVPos[]>(() => {
    const local = readLocalKiRows(code);
    if (local.length) return local;
    try {
      return LV.list();
    } catch {
      return [];
    }
  });

  React.useEffect(() => {
    if (!code) {
      setLvRows([]);
      return;
    }

    const local = readLocalKiRows(code);
    if (local.length) setLvRows(local);

    let cancelled = false;
    void fetch(`/api/kalkulation/storage/ki/${encodeURIComponent(code)}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store"
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((payload) => {
        if (cancelled) return;
        const serverRows = extractKiRows(payload);
        if (serverRows.length) setLvRows(serverRows);
      })
      .catch(() => {
        // Lokaler KI-Stand bleibt sichtbar, wenn der Server kurz nicht erreichbar ist.
      });

    return () => {
      cancelled = true;
    };
  }, [code]);

  const dbRows = React.useMemo(() => {
    try {
      return KalkulationsDatenbank.list();
    } catch {
      return [];
    }
  }, []);

  const lvStats = React.useMemo(() => {
    const total = lvRows.length;
    const net = lvRows.reduce((sum, row) => sum + rowTotal(row), 0);
    const missingQty = lvRows.filter((r) => n(r.menge) <= 0).length;
    const missingUnit = lvRows.filter((r) => !String(r.einheit || "").trim()).length;
    const missingPrice = lvRows.filter((r) => rowPrice(r) <= 0).length;
    const missingText = lvRows.filter((r) => !String(r.kurztext || "").trim()).length;
    const missingLang = lvRows.filter((r) => !String(r.langtext || "").trim()).length;
    const duplicates = getDuplicateCount(lvRows);
    const ready = lvRows.filter(
      (r) =>
      String(r.posNr || "").trim() &&
      String(r.kurztext || "").trim() &&
      String(r.einheit || "").trim() &&
      n(r.menge) > 0 &&
      rowPrice(r) > 0
    ).length;

    return {
      total,
      net,
      missingQty,
      missingUnit,
      missingPrice,
      missingText,
      missingLang,
      duplicates,
      ready,
      problems:
      missingQty + missingUnit + missingPrice + missingText + missingLang + duplicates
    };
  }, [lvRows]);

  const dbStats = React.useMemo(() => {
    const total = dbRows.length;
    const missingEp = dbRows.filter((r) => n(r.kosten?.epNetto) <= 0).length;
    const missingUnit = dbRows.filter((r) => !String(r.einheit || "").trim()).length;
    const missingResources = dbRows.filter((r) => !r.ressourcen?.length).length;
    const highRisk = dbRows.filter(
      (r) => r.risiko === "hoch" || r.risiko === "kritisch"
    ).length;
    const lowConfidence = dbRows.filter((r) => n(r.confidence) < 0.7).length;

    return {
      total,
      missingEp,
      missingUnit,
      missingResources,
      highRisk,
      lowConfidence,
      problems: missingEp + missingUnit + missingResources + highRisk + lowConfidence
    };
  }, [dbRows]);

  const nextStep = React.useMemo(() => {
    if (!lvStats.total) {
      return {
        title: "LV importieren oder Positionen anlegen",
        text: "Es sind noch keine LV-Positionen vorhanden. Starte mit LV / Positionen.",
        to: "/kalkulation/lv-import"
      };
    }

    if (lvStats.problems > 0) {
      return {
        title: "LV-Daten prüfen",
        text: "Es gibt fehlende Mengen, Einheiten, Texte, Preise oder doppelte Positionen.",
        to: "/kalkulation/lv-import"
      };
    }

    if (dbStats.problems > 0) {
      return {
        title: "Kalkulationsdatenbank bereinigen",
        text: "Die Datenbank enthält fehlende EP, Ressourcen, Einheiten oder Risiko-Einträge.",
        to: "/kalkulation/datenbank"
      };
    }

    return {
      title: "KI-Kalkulation starten",
      text: "LV und Datenbasis sind vorbereitet. Jetzt kann die Kalkulation mit KI geprüft werden.",
      to: "/kalkulation/mit-ki"
    };
  }, [lvStats, dbStats]);

  const tiles: Tile[] = [
  {
    title: "LV / Positionen",
    desc: "Leistungsverzeichnis importieren, Positionen prüfen, neue Positionen anlegen und Projekt-LV vorbereiten.",
    to: "/kalkulation/lv-import",
    icon: "📋",
    group: "workflow",
    badge: lvStats.problems ? `${lvStats.problems} prüfen` : "Start"
  },
  {
    title: "Kalkulation",
    desc: "Zentrale Kalkulation mit Hauptauftrag, Unteraufträgen, KI-Vorschlag, manueller Bearbeitung, Preisaufbau und Urkalkulation.",
    to: "/kalkulation/mit-ki",
    icon: "🧮",
    group: "workflow",
    badge: "Zentral"
  },
  {
    title: "Preise & Ressourcen",
    desc: "Firmenpreise, Personal, Maschinen, Material, Transport, Entsorgung und Standardansätze pflegen.",
    to: "/kalkulation/preise",
    icon: "💶",
    group: "daten"
  },
  {
    title: "Kalkulationsdatenbank",
    desc: "Erfahrungswerte, gelernte Positionen, Preisansätze und wiederverwendbare Kalkulationsdaten verwalten.",
    to: "/kalkulation/datenbank",
    icon: "🧠",
    group: "daten",
    badge: dbStats.problems ? `${dbStats.problems} prüfen` : undefined
  },
  {
    title: "GAEB Import / Export",
    desc: "GAEB-Dateien importieren, prüfen, übernehmen und als X83/X84 exportieren.",
    to: "/kalkulation/gaeb",
    icon: "📦",
    group: "daten",
    badge: "GAEB"
  },
  {
    title: "Nachträge",
    desc: "Zusatzleistungen, Varianten und Nachtragspositionen erstellen und prüfen.",
    to: "/kalkulation/nachtraege",
    icon: "➕",
    group: "export"
  },
  {
    title: "Angebot / Export",
    desc: "Angebot aus der Kalkulation erzeugen und als PDF, Excel oder weitere Ausgabeformate exportieren.",
    to: "/kalkulation/angebot",
    icon: "📄",
    group: "export",
    badge: "PDF/XLSX"
  },
  {
    title: "Versionsvergleich / Analyse",
    desc: "Kalkulationsstände, Angebotsversionen, Preisabweichungen und Risiken vergleichen.",
    to: "/kalkulation/versionsvergleich",
    icon: "📊",
    group: "export"
  },
  {
    title: "CRM / Angebotsverfolgung",
    desc: "Angebote nachverfolgen, Status pflegen und Rückmeldungen strukturiert verwalten.",
    to: "/kalkulation/crm",
    icon: "📌",
    group: "export"
  }];


  return (
    <div className={rlcClass(null, page)}>
      <PageHeader
        breadcrumb="RLC Module / Kalkulation"
        title="Kalkulation"
        subtitle="Zentrale Steuerung für LV, KI-Kalkulation, Datenbank, GAEB und Angebot." />
      

      <section className={rlcClass(null, overviewIntro)}>
        <div>
          <div className={rlcClass(null, eyebrow)}>RLC Kalkulation</div>
          <h1 className={rlcClass(null, heroTitle)}>Kalkulation Übersicht</h1>
          <p className={rlcClass(null, heroText)}>
            Direkter Zugriff auf die Kalkulationsmodule des aktiven Projekts.
          </p>
        </div>
        <div className={rlcClass(null, heroMeta)}>
          Projekt: <b>{code || "—"}</b>{name ? <> · <b>{name}</b></> : null}
        </div>
      </section>

      <Section
        title="Hauptworkflow"
        subtitle="Diese zwei Bereiche sind der tägliche Kern der Kalkulation."
        tiles={tiles.filter((x) => x.group === "workflow")} />
      

      <Section
        title="Daten & Preisgrundlagen"
        subtitle="Hier liegen Preisbasis, Ressourcen, GAEB und Erfahrungswerte."
        tiles={tiles.filter((x) => x.group === "daten")} />
      

      <Section
        title="Nachträge, Angebot & Analyse"
        subtitle="Alles für Ausgabe, Nachträge, Vergleich und Angebotsverfolgung."
        tiles={tiles.filter((x) => x.group === "export")} />
      
    </div>);

}

/* ===================== STYLES ===================== */

const overviewIntro: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: "10px 14px",
  border: "1px solid #DCE4EF",
  borderRadius: 12,
  background: "#FFFFFF"
};

const page: React.CSSProperties = {
  display: "grid",
  gap: 16,
  padding: 16
};

const heroCard: React.CSSProperties = {
  background: "#FFFFFF",
  color: "#0F172A",
  border: "1px solid #DCE5F2",
  borderRadius: 18,
  padding: 22,
  display: "grid",
  gap: 14,
  boxShadow: "0 4px 16px rgba(15,23,42,0.06)"
};

const eyebrow: React.CSSProperties = {
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "#0B5BD3",
  fontWeight: 700
};

const heroTitle: React.CSSProperties = {
  color: "#0F172A",
  margin: "4px 0",
  fontSize: 30,
  fontWeight: 700,
  lineHeight: 1.1
};

const heroText: React.CSSProperties = {
  margin: 0,
  maxWidth: 980,
  color: "#475569",
  lineHeight: 1.55
};

const heroActions: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap"
};

const heroMeta: React.CSSProperties = {
  fontSize: 13,
  color: "#475569"
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
  ...btnBase,
  background: "#146EF5",
  border: "1px solid #146EF5",
  color: "#FFFFFF",
  boxShadow: "0 10px 20px rgba(37,99,235,0.22)"
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
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)"
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
