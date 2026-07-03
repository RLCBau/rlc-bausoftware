import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./styles.css";

import { useProject } from "../../store/useProject";
import { useRechnungen, useZahlungen, useLieferscheine } from "./stores";

/** =========================
 *  TYPES (UI-Model)
 *  ========================= */
type RechnungUI = {
  id: string;
  nr: string;
  datum: string;
  faellig?: string;
  kunde: string;
  netto: number;
  mwstPct: number;
  gezahlt: number;
  projekt?: string;
  projectId?: string;
  projectCode?: string;
};

type ZahlungUI = {
  id: string;
  datum: string;
  kunde?: string;
  betrag: number;
  referenz?: string;
  projekt?: string;
  projectId?: string;
  projectCode?: string;
};

type LieferscheinKostenUI = {
  id: string;
  datum: string;
  kostenstelle?: string;
  lieferant?: string;
  betrag: number;
  projekt?: string;
  projectId?: string;
  projectCode?: string;
};

type Zeitraum = "ALL" | "30" | "60" | "90" | "YTD" | "THIS_MONTH";
type RechnungsStatus = "ALL" | "OPEN" | "PART" | "PAID";

/** =========================
 *  HELPERS
 *  ========================= */
const safeTrim = (v: unknown) => String(v ?? "").trim();

const safeNumber = (v: unknown, fallback = 0) => {
  if (v === null || v === undefined || v === "") return fallback;
  const normalized =
    typeof v === "string" ? v.replace(/\s/g, "").replace(",", ".") : v;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : fallback;
};

const parseDate = (s: string) => {
  const value = safeTrim(s);
  if (!value) return new Date("1970-01-01");

  if (/^\d{2}\.\d{2}\.\d{4}$/.test(value)) {
    const [d, m, y] = value.split(".").map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }

  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? new Date("1970-01-01") : dt;
};

const withinDays = (d: Date, days: number) => {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - days);
  return d >= from;
};

const isSameMonth = (d: Date, ref: Date) =>
  d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();

const eur = (n: number) =>
  safeNumber(n).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const sum = (arr: number[]) => arr.reduce((a, b) => a + safeNumber(b), 0);

const bruttoOf = (r: RechnungUI) => safeNumber(r.netto) * (1 + safeNumber(r.mwstPct) / 100);

const projectKeysOf = (row: {
  projekt?: string;
  projectId?: string;
  projectCode?: string;
}) =>
  [row.projectCode, row.projectId, row.projekt]
    .map((v) => safeTrim(v))
    .filter(Boolean);

const matchesZeitraum = (datum: string, zeitraum: Zeitraum) => {
  const d = parseDate(datum);

  switch (zeitraum) {
    case "30":
      return withinDays(d, 30);
    case "60":
      return withinDays(d, 60);
    case "90":
      return withinDays(d, 90);
    case "YTD":
      return d.getFullYear() === new Date().getFullYear();
    case "THIS_MONTH":
      return isSameMonth(d, new Date());
    default:
      return true;
  }
};

const invoiceStatusOf = (r: RechnungUI): Exclude<RechnungsStatus, "ALL"> => {
  const brutto = bruttoOf(r);
  const gezahlt = safeNumber(r.gezahlt);

  if (gezahlt >= brutto - 0.01) return "PAID";
  if (gezahlt <= 0.01) return "OPEN";
  return "PART";
};

const csvEscape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

const downloadCSV = (rows: Record<string, unknown>[], filename: string) => {
  if (!rows.length) {
    alert("Keine Daten für den Export vorhanden.");
    return;
  }

  const headers = Object.keys(rows[0] || {});
  const csv = [
    headers.join(";"),
    ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(";")),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  const href = URL.createObjectURL(blob);
  a.href = href;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(href);
};

const spark = (series: number[]) => {
  if (!series.length) return "—";
  const max = Math.max(...series, 0);
  const glyphs = "▁▂▃▄▅▆▇█";

  return series
    .map((n) => {
      const idx = max === 0 ? 0 : Math.round((safeNumber(n) / max) * (glyphs.length - 1));
      return glyphs.charAt(idx);
    })
    .join("");
};

/** =========================
 *  COMPONENT
 *  ========================= */
export default function Kostenuebersicht() {
  const nav = useNavigate();

  const ctx: any = useProject();
  const cur = ctx?.currentProject || ctx?.selectedProject || ctx?.getSelectedProject?.() || null;

  const currentProjectCode: string = safeTrim(cur?.code);
  const currentProjectId: string = safeTrim(cur?.id);
  const activeProjectKey = currentProjectCode || currentProjectId || "";

  const [rechnungen] = useRechnungen();
  const [zahlungen] = useZahlungen();
  const [lieferscheine] = useLieferscheine();

  const [zeitraum, setZeitraum] = useState<Zeitraum>("THIS_MONTH");
  const [kunde, setKunde] = useState<string>("ALL");
  const [status, setStatus] = useState<RechnungsStatus>("ALL");

  const rechnungenUI: RechnungUI[] = useMemo(() => {
    return (rechnungen || []).map((r: any) => ({
      id: String(r.id ?? ""),
      nr: String(r.nummer ?? r.nr ?? r.id ?? "—"),
      datum: String(r.datum || ""),
      faellig: r.faellig ? String(r.faellig) : undefined,
      kunde: String(r.kunde ?? r.client ?? r.auftraggeber ?? "—"),
      netto: safeNumber(r.betragNetto ?? r.netto ?? 0),
      mwstPct: safeNumber(r.mwstPct ?? r.mwst ?? 19),
      gezahlt: safeNumber(r.gezahlt ?? 0),
      projekt: r.projekt ? String(r.projekt) : undefined,
      projectId: r.projectId ? String(r.projectId) : undefined,
      projectCode: r.projectCode ? String(r.projectCode) : undefined,
    }));
  }, [rechnungen]);

  const zahlungenUI: ZahlungUI[] = useMemo(() => {
    return (zahlungen || []).map((z: any) => ({
      id: String(z.id ?? ""),
      datum: String(z.datum || ""),
      kunde: z.kunde ? String(z.kunde) : undefined,
      betrag: safeNumber(z.betrag ?? 0),
      referenz: z.referenz ? String(z.referenz) : undefined,
      projekt: z.projekt ? String(z.projekt) : undefined,
      projectId: z.projectId ? String(z.projectId) : undefined,
      projectCode: z.projectCode ? String(z.projectCode) : undefined,
    }));
  }, [zahlungen]);

  const kostenUI: LieferscheinKostenUI[] = useMemo(() => {
    return (lieferscheine || []).map((ls: any) => ({
      id: String(ls.id ?? ""),
      datum: String(ls.datum || ""),
      kostenstelle: ls.kostenstelle ? String(ls.kostenstelle) : undefined,
      lieferant: ls.lieferant ? String(ls.lieferant) : undefined,
      betrag: safeNumber(ls.kosten ?? ls.betrag ?? 0),
      projekt: ls.projekt ? String(ls.projekt) : undefined,
      projectId: ls.projectId ? String(ls.projectId) : undefined,
      projectCode: ls.projectCode ? String(ls.projectCode) : undefined,
    }));
  }, [lieferscheine]);

  const filterByProject = <T extends { projekt?: string; projectId?: string; projectCode?: string }>(
    rows: T[]
  ): T[] => {
    if (!activeProjectKey) return rows;

    const hasAnyProjectInfo = rows.some((row) => projectKeysOf(row).length > 0);
    if (!hasAnyProjectInfo) return rows;

    return rows.filter((row) => projectKeysOf(row).includes(activeProjectKey));
  };

  const rechnungenProjectFiltered = useMemo(
    () => filterByProject(rechnungenUI),
    [rechnungenUI, activeProjectKey]
  );

  const zahlungenProjectFiltered = useMemo(
    () => filterByProject(zahlungenUI),
    [zahlungenUI, activeProjectKey]
  );

  const kostenProjectFiltered = useMemo(
    () => filterByProject(kostenUI),
    [kostenUI, activeProjectKey]
  );

  const kundenListe = useMemo(() => {
    const ks = Array.from(
      new Set(rechnungenProjectFiltered.map((r) => safeTrim(r.kunde)).filter(Boolean))
    );
    return ["ALL", ...ks];
  }, [rechnungenProjectFiltered]);

  const rechnungenGefiltert = useMemo(() => {
    let arr = rechnungenProjectFiltered.filter((r) => matchesZeitraum(r.datum, zeitraum));

    if (kunde !== "ALL") {
      arr = arr.filter((r) => safeTrim(r.kunde) === kunde);
    }

    if (status !== "ALL") {
      arr = arr.filter((r) => invoiceStatusOf(r) === status);
    }

    return arr;
  }, [rechnungenProjectFiltered, zeitraum, kunde, status]);

  const zahlungenGefiltert = useMemo(() => {
    return zahlungenProjectFiltered.filter((z) => {
      const okZeit = matchesZeitraum(z.datum, zeitraum);
      const okKunde = kunde === "ALL" ? true : safeTrim(z.kunde) === kunde;
      return okZeit && okKunde;
    });
  }, [zahlungenProjectFiltered, zeitraum, kunde]);

  const kostenGefiltert = useMemo(() => {
    return kostenProjectFiltered.filter((k) => matchesZeitraum(k.datum, zeitraum));
  }, [kostenProjectFiltered, zeitraum]);

  const reBrutto = useMemo(
    () => sum(rechnungenGefiltert.map((r) => bruttoOf(r))),
    [rechnungenGefiltert]
  );

  const zahlungenSum = useMemo(
    () => sum(zahlungenGefiltert.map((z) => safeNumber(z.betrag))),
    [zahlungenGefiltert]
  );

  const reGezahlt = zahlungenSum;
  const offenePosten = Math.max(0, reBrutto - reGezahlt);

  const kosten = useMemo(
    () => sum(kostenGefiltert.map((k) => safeNumber(k.betrag))),
    [kostenGefiltert]
  );

  const deckungsbeitrag = reGezahlt - kosten;

  const offeneListe = useMemo(() => {
    return rechnungenGefiltert
      .map((r) => {
        const brutto = bruttoOf(r);
        const bezahlt = safeNumber(r.gezahlt);
        return {
          ...r,
          offen: Math.max(0, brutto - bezahlt),
          brutto,
          bezahlt,
        };
      })
      .filter((r) => r.offen > 0.01)
      .sort((a, b) => b.offen - a.offen)
      .slice(0, 10);
  }, [rechnungenGefiltert]);

  const kostenByKs = useMemo<[string, number][]>(() => {
    const map = new Map<string, number>();

    for (const k of kostenGefiltert) {
      const key = safeTrim(k.kostenstelle) || "—";
      map.set(key, (map.get(key) || 0) + safeNumber(k.betrag));
    }

    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [kostenGefiltert]);

  const exportKPIs = () => {
    downloadCSV(
      [
        { Kennzahl: "Rechnungen (Brutto)", Wert: reBrutto.toFixed(2) },
        { Kennzahl: "Zahlungseingänge", Wert: reGezahlt.toFixed(2) },
        { Kennzahl: "Offene Posten", Wert: offenePosten.toFixed(2) },
        { Kennzahl: "Kosten (Belege/Lieferscheine)", Wert: kosten.toFixed(2) },
        { Kennzahl: "Deckungsbeitrag", Wert: deckungsbeitrag.toFixed(2) },
      ],
      "kostenuebersicht_kpi.csv"
    );
  };

  const exportOffen = () => {
    downloadCSV(
      offeneListe.map((o) => ({
        Nr: o.nr,
        Kunde: o.kunde,
        Datum: o.datum,
        Brutto: o.brutto.toFixed(2),
        Gezahlt: safeNumber(o.bezahlt).toFixed(2),
        Offen: o.offen.toFixed(2),
        Faellig: o.faellig || "",
      })),
      "offene_posten.csv"
    );
  };

  const exportKosten = () => {
    downloadCSV(
      kostenByKs.map(([ks, betrag]) => ({
        Kostenstelle: ks,
        Betrag: betrag.toFixed(2),
      })),
      "kosten_nach_kostenstelle.csv"
    );
  };

  const serieZahlungen = useMemo(() => {
    const days = [6, 5, 4, 3, 2, 1, 0];

    return days.map((daysAgo) => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - daysAgo);

      const end = new Date(start);
      end.setDate(end.getDate() + 1);

      return sum(
        zahlungenProjectFiltered
          .filter((z) => {
            const dt = parseDate(z.datum);
            return dt >= start && dt < end;
          })
          .map((z) => safeNumber(z.betrag))
      );
    });
  }, [zahlungenProjectFiltered]);

  return (
    <div className="bh-page">
      <div className="bh-header-row">
        <h2>Kostenübersicht pro Projekt (live)</h2>
        <div className="bh-actions">
          <button className="bh-btn ghost" onClick={() => nav("/buchhaltung/rechnungen")}>
            → Zu Rechnungen
          </button>
          <button className="bh-btn ghost" onClick={() => nav("/buchhaltung/zahlungen")}>
            → Zu Zahlungen
          </button>
          <button className="bh-btn ghost" onClick={() => nav("/buchhaltung/reports")}>
            → Zu Belegen
          </button>
          <button
            className="bh-btn ghost"
            onClick={() => nav("/mengenermittlung/lieferscheine")}
          >
            → Zu Lieferscheinen
          </button>
        </div>
      </div>

      <div className="bh-filters">
        <div>
          <label>Zeitraum</label>
          <select value={zeitraum} onChange={(e) => setZeitraum(e.target.value as Zeitraum)}>
            <option value="THIS_MONTH">Dieser Monat</option>
            <option value="30">Letzte 30 Tage</option>
            <option value="60">Letzte 60 Tage</option>
            <option value="90">Letzte 90 Tage</option>
            <option value="YTD">YTD</option>
            <option value="ALL">Alle</option>
          </select>
        </div>

        <div>
          <label>Kunde</label>
          <select value={kunde} onChange={(e) => setKunde(e.target.value)}>
            {kundenListe.map((k) => (
              <option key={k} value={k}>
                {k === "ALL" ? "Alle" : k}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as RechnungsStatus)}
          >
            <option value="ALL">Alle</option>
            <option value="OPEN">Offen</option>
            <option value="PART">Teilbezahlt</option>
            <option value="PAID">Bezahlt</option>
          </select>
        </div>

        <div className="bh-filters-right">
          <button className="bh-btn" onClick={exportKPIs}>
            Export KPI (CSV)
          </button>
        </div>
      </div>

      <div className="bh-cards">
        <div className="bh-card">
          <div className="k">Rechnungen (Brutto)</div>
          <div className="v">{eur(reBrutto)} €</div>
          <div className="s">Zahlungsserie: {spark(serieZahlungen)}</div>
        </div>

        <div className="bh-card">
          <div className="k">Zahlungseingänge</div>
          <div className="v">{eur(reGezahlt)} €</div>
        </div>

        <div className="bh-card">
          <div className="k">Offene Posten</div>
          <div className="v">{eur(offenePosten)} €</div>
        </div>

        <div className="bh-card">
          <div className="k">Kosten (Belege/Lieferscheine)</div>
          <div className="v">{eur(kosten)} €</div>
          <div className="s">
            <span style={{ opacity: 0.8 }}>
              Quelle: <code>useLieferscheine()</code>
            </span>
          </div>
        </div>

        <div className="bh-card">
          <div className="k">Deckungsbeitrag (Zahlungen − Kosten)</div>
          <div className="v">{eur(deckungsbeitrag)} €</div>
        </div>
      </div>

      <div className="bh-grid-2">
        <div className="bh-panel">
          <div className="bh-panel-head">
            <h3>Top 10 Offene Posten</h3>
            <button className="bh-btn ghost" onClick={exportOffen}>
              Export CSV
            </button>
          </div>

          <table className="bh-table">
            <thead>
              <tr>
                <th>Nr.</th>
                <th>Kunde</th>
                <th>Datum</th>
                <th>Fällig</th>
                <th>Brutto (€)</th>
                <th>Gezahlt (€)</th>
                <th>Offen (€)</th>
                <th>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {offeneListe.map((o) => (
                <tr key={o.id}>
                  <td>{o.nr}</td>
                  <td>{o.kunde}</td>
                  <td>{o.datum}</td>
                  <td>{o.faellig || "—"}</td>
                  <td>{eur(o.brutto)}</td>
                  <td>{eur(safeNumber(o.bezahlt))}</td>
                  <td style={{ fontWeight: 600 }}>{eur(o.offen)}</td>
                  <td>
                    <Link to="/buchhaltung/zahlungen" className="bh-link">
                      zu Zahlungen
                    </Link>
                  </td>
                </tr>
              ))}

              {offeneListe.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", color: "#777" }}>
                    Keine offenen Posten im Filterzeitraum.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="bh-panel">
          <div className="bh-panel-head">
            <h3>Kosten nach Kostenstelle</h3>
            <button className="bh-btn ghost" onClick={exportKosten}>
              Export CSV
            </button>
          </div>

          <table className="bh-table">
            <thead>
              <tr>
                <th>Kostenstelle</th>
                <th>Summe (€)</th>
              </tr>
            </thead>
            <tbody>
              {kostenByKs.map(([ks, betrag]) => (
                <tr key={ks}>
                  <td>{ks}</td>
                  <td>{eur(betrag)}</td>
                </tr>
              ))}

              {kostenByKs.length === 0 && (
                <tr>
                  <td colSpan={2} style={{ textAlign: "center", color: "#777" }}>
                    Keine Kosten im Filterzeitraum.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bh-note" style={{ marginTop: 8 }}>
        *Live-Daten aus <code>stores.ts</code> (Rechnungen/Zahlungen/Lieferscheine).{" "}
        {activeProjectKey ? (
          <>
            Aktuelles Projekt: <b>{activeProjectKey}</b>
          </>
        ) : (
          <>Kein Projekt gewählt: Projektfilter wird nicht angewendet.</>
        )}
      </div>
    </div>
  );
}





