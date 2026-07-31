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
  datum: string; // ISO o dd.mm.yyyy ok
  faellig?: string;
  kunde: string;
  netto: number;
  mwstPct: number;
  gezahlt: number; // incassato su questa fattura (se non hai dettaglio pagamenti -> 0)
};

type ZahlungUI = {
  id: string;
  datum: string;
  kunde?: string;
  betrag: number;
  referenz?: string;
};

type LieferscheinKostenUI = {
  id: string;
  datum: string;
  kostenstelle?: string;
  lieferant?: string;
  betrag: number;
  projekt?: string; // opzionale (fallback)
};

type Zeitraum = "ALL" | "30" | "60" | "90" | "YTD" | "THIS_MONTH";

/** =========================
 *  HELPER
 *  ========================= */
const parseDate = (s: string) => {
  // supporta dd.mm.yyyy o ISO
  if (/\d{2}\.\d{2}\.\d{4}/.test(s)) {
    const [d, m, y] = s.split(".").map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }
  return new Date(s);
};

const withinDays = (d: Date, days: number) => {
  const from = new Date();
  from.setDate(from.getDate() - days);
  return d >= from;
};

const isSameMonth = (d: Date, ref: Date) =>
  d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();

const eur = (n: number) =>
  n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

/** =========================
 *  COMPONENT
 *  ========================= */
export default function Kostenuebersicht() {
  const nav = useNavigate();

  // Project context (per filtro)
  const ctx: any = useProject();
  const cur = ctx?.currentProject || ctx?.selectedProject || null;
  const currentProjectCode: string | null = cur?.code ?? null;
  const currentProjectId: string | null = cur?.id ?? ctx?.projectId ?? null;

  // Store data
  const [rechnungen] = useRechnungen();
  const [zahlungen] = useZahlungen();
  const [lieferscheine] = useLieferscheine();

  // Filtri UI
  const [zeitraum, setZeitraum] = useState<Zeitraum>("THIS_MONTH");
  const [kunde, setKunde] = useState<string>("ALL");
  const [status, setStatus] = useState<"ALL" | "OPEN" | "PART" | "PAID">("ALL");

  /**
   * =========================================================
   * Mapping DALLO STORE -> UI-Model
   * Nota: i tuoi types in ./types non includono sempre project/kunde.
   * Qui facciamo mapping "robusto":
   * - Rechnung: progetto (se presente) o fallback: currentProjectCode
   * - Zahlung: se manca kunde, la lasciamo vuota
   * - Lieferschein: costo = field "kosten" (dal tuo type Lieferschein)
   * =========================================================
   */

  const rechnungenUI: RechnungUI[] = useMemo(() => {
    return (rechnungen || []).map((r: any) => ({
      id: String(r.id),
      nr: String(r.nummer ?? r.nr ?? r.id),
      datum: String(r.datum || ""),
      faellig: r.faellig ? String(r.faellig) : undefined,
      kunde: String(r.kunde ?? r.client ?? r.auftraggeber ?? "—"),
      netto: Number(r.betragNetto ?? r.netto ?? 0),
      mwstPct: Number(r.mwst ?? r.mwstPct ?? 19),
      // se non hai il dettaglio "gezahlt" sul type Rechnung, resta 0;
      // se lo aggiungi in futuro, qui lo prende automaticamente.
      gezahlt: Number(r.gezahlt ?? 0),
    }));
  }, [rechnungen]);

  const zahlungenUI: ZahlungUI[] = useMemo(() => {
    return (zahlungen || []).map((z: any) => ({
      id: String(z.id),
      datum: String(z.datum || ""),
      kunde: z.kunde ? String(z.kunde) : undefined,
      betrag: Number(z.betrag ?? 0),
      referenz: z.referenz ? String(z.referenz) : undefined,
    }));
  }, [zahlungen]);

  const kostenUI: LieferscheinKostenUI[] = useMemo(() => {
    return (lieferscheine || []).map((ls: any) => ({
      id: String(ls.id),
      datum: String(ls.datum || ""),
      kostenstelle: ls.kostenstelle ? String(ls.kostenstelle) : undefined,
      lieferant: ls.lieferant ? String(ls.lieferant) : undefined,
      betrag: Number(ls.kosten ?? ls.betrag ?? 0),
      projekt: ls.projekt ? String(ls.projekt) : undefined, // opzionale (se lo aggiungi in futuro)
    }));
  }, [lieferscheine]);

  // Filtro per progetto (best-effort)
  // - Se nelle righe esiste "projekt"/"projectId"/"projectCode", usalo.
  // - Altrimenti: non filtrare (per non perdere dati).
  const filterByProject = <T extends any>(rows: T[], getter: (x: T) => any) => {
    const key = currentProjectCode || currentProjectId;
    if (!key) return rows;

    // se nessuna riga ha info progetto -> non filtrare
    const hasAnyProjectInfo = rows.some((x) => {
      const v = getter(x);
      return v !== undefined && v !== null && String(v).trim() !== "";
    });
    if (!hasAnyProjectInfo) return rows;

    return rows.filter((x) => String(getter(x) ?? "") === String(key));
  };

  // Qui puoi personalizzare quale field usare quando in futuro aggiungi project linkage nei types
  const rechnungenProjectFiltered = useMemo(() => {
    return filterByProject(rechnungenUI, (r) => (r as any).projekt ?? (r as any).projectId ?? (r as any).projectCode);
  }, [rechnungenUI, currentProjectCode, currentProjectId]);

  const zahlungenProjectFiltered = useMemo(() => {
    return filterByProject(zahlungenUI as any, (z) => (z as any).projekt ?? (z as any).projectId ?? (z as any).projectCode);
  }, [zahlungenUI, currentProjectCode, currentProjectId]);

  const kostenProjectFiltered = useMemo(() => {
    // nel tuo Lieferschein type attuale NON c’è progetto: quindi (oggi) non filtra,
    // ma è pronto appena aggiungi projekt/projectId/projectCode.
    return filterByProject(kostenUI as any, (k) => (k as any).projekt ?? (k as any).projectId ?? (k as any).projectCode);
  }, [kostenUI, currentProjectCode, currentProjectId]);

  // Derivati per i filtri (Kunde)
  const kundenListe = useMemo(() => {
    const ks = Array.from(new Set(rechnungenProjectFiltered.map((r) => r.kunde).filter(Boolean)));
    return ["ALL", ...ks];
  }, [rechnungenProjectFiltered]);

  const rechnungenGefiltert = useMemo(() => {
    let arr = rechnungenProjectFiltered.slice();

    // Zeitraum
    arr = arr.filter((r) => {
      const d = parseDate(r.datum);
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
    });

    // Kunde
    if (kunde !== "ALL") arr = arr.filter((r) => r.kunde === kunde);

    // Status
    if (status !== "ALL") {
      arr = arr.filter((r) => {
        const brutto = r.netto * (1 + r.mwstPct / 100);
        if (status === "PAID") return r.gezahlt >= brutto - 0.01;
        if (status === "OPEN") return r.gezahlt <= 0.01;
        if (status === "PART") return r.gezahlt > 0.01 && r.gezahlt < brutto - 0.01;
        return true;
      });
    }

    return arr;
  }, [rechnungenProjectFiltered, zeitraum, kunde, status]);

  const zahlungenGefiltert = useMemo(() => {
    return zahlungenProjectFiltered.filter((z) => {
      const d = parseDate(z.datum);
      const okZeit =
        zeitraum === "30"
          ? withinDays(d, 30)
          : zeitraum === "60"
          ? withinDays(d, 60)
          : zeitraum === "90"
          ? withinDays(d, 90)
          : zeitraum === "YTD"
          ? d.getFullYear() === new Date().getFullYear()
          : zeitraum === "THIS_MONTH"
          ? isSameMonth(d, new Date())
          : true;

      const okKunde = kunde === "ALL" ? true : z.kunde === kunde;
      return okZeit && okKunde;
    });
  }, [zahlungenProjectFiltered, zeitraum, kunde]);

  const kostenGefiltert = useMemo(() => {
    return kostenProjectFiltered.filter((k) => {
      const d = parseDate(k.datum);
      const okZeit =
        zeitraum === "30"
          ? withinDays(d, 30)
          : zeitraum === "60"
          ? withinDays(d, 60)
          : zeitraum === "90"
          ? withinDays(d, 90)
          : zeitraum === "YTD"
          ? d.getFullYear() === new Date().getFullYear()
          : zeitraum === "THIS_MONTH"
          ? isSameMonth(d, new Date())
          : true;
      return okZeit;
    });
  }, [kostenProjectFiltered, zeitraum]);

  // KPI calcoli
  const reBrutto = useMemo(
    () => sum(rechnungenGefiltert.map((r) => r.netto * (1 + r.mwstPct / 100))),
    [rechnungenGefiltert]
  );

  /**
   * IMPORTANT:
   * - Se il tuo modello "Zahlung" rappresenta pagamenti reali, qui usiamo SOMMA pagamenti come KPI "Zahlungseingänge".
   * - Il campo r.gezahlt sulle rechnungen resta utile per lo status OPEN/PART/PAID se lo compili.
   */
  const zahlungenSum = useMemo(() => sum(zahlungenGefiltert.map((z) => z.betrag)), [zahlungenGefiltert]);

  const reGezahlt = zahlungenSum; // KPI (live) = pagamenti registrati
  const offenePosten = Math.max(0, reBrutto - reGezahlt);

  const kosten = useMemo(() => sum(kostenGefiltert.map((k) => k.betrag)), [kostenGefiltert]);
  const deckungsbeitrag = reGezahlt - kosten;

  // Tabelle Offene Posten (Top 10)
  const offeneListe = useMemo(() => {
    return rechnungenGefiltert
      .map((r) => {
        const brutto = r.netto * (1 + r.mwstPct / 100);
        // “gezahlt” pro Rechnung è opzionale; se non lo gestisci ancora, la riga resta "offen".
        const bezahlt = Number(r.gezahlt ?? 0);
        return { ...r, offen: Math.max(0, brutto - bezahlt), brutto, bezahlt };
      })
      .filter((r) => r.offen > 0.01)
      .sort((a, b) => b.offen - a.offen)
      .slice(0, 10);
  }, [rechnungenGefiltert]);

  // Aggregazione costi per Kostenstelle
  const kostenByKs = useMemo(() => {
    const map = new Map<string, number>();
    for (const k of kostenGefiltert) {
      const key = k.kostenstelle || "—";
      map.set(key, (map.get(key) || 0) + k.betrag);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [kostenGefiltert]);

  // mini sparkline ascii (0..7)
  const spark = (series: number[]) => {
    if (!series.length) return "—";
    const max = Math.max(...series);
    const glyphs = "▁▂▃▄▅▆▇█";
    return series
      .map((n) => {
        const idx = max === 0 ? 0 : Math.round((n / max) * (glyphs.length - 1));
        return glyphs[idx];
      })
      .join("");
  };

  // CSV export
  const downloadCSV = (rows: Record<string, any>[], filename: string) => {
    const headers = Object.keys(rows[0] || {});
    const csv = [headers.join(";"), ...rows.map((r) => headers.map((h) => String(r[h] ?? "")).join(";"))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

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
        Gezahlt: Number(o.bezahlt ?? 0).toFixed(2),
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

  // Serie: ultimi 7 step (Zahlungen)
  const serieZahlungen = useMemo(() => {
    const days = [7, 6, 5, 4, 3, 2, 1].reverse();
    return days.map((d) => {
      const since = new Date();
      since.setDate(since.getDate() - d);
      const till = new Date();
      till.setDate(till.getDate() - (d - 1));
      return sum(
        zahlungenProjectFiltered.filter((z) => {
          const dt = parseDate(z.datum);
          return dt >= since && dt < till;
        }).map((z) => z.betrag)
      );
    });
  }, [zahlungenProjectFiltered]);

  return (
    <div className="bh-page">
      <div className="bh-header-row">
        <h2>Kostenübersicht pro Projekt (live)</h2>
        <div className="bh-actions">
          {/* ✅ route esistenti */}
          <button className="bh-btn ghost" onClick={() => nav("/buchhaltung/rechnungen")}>
            → Zu Rechnungen
          </button>
          <button className="bh-btn ghost" onClick={() => nav("/buchhaltung/zahlungen")}>
            → Zu Zahlungen
          </button>
          <button className="bh-btn ghost" onClick={() => nav("/buchhaltung/reports")}>
            → Zu Belegen
          </button>

          {/* ✅ Lieferscheine esistono già in Mengenermittlung */}
          <button className="bh-btn ghost" onClick={() => nav("/mengenermittlung/lieferscheine")}>
            → Zu Lieferscheinen
          </button>
        </div>
      </div>

      {/* FILTRI */}
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
                {k}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as any)}>
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

      {/* KPI CARDS */}
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

      {/* TABELLE */}
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
                  <td>{eur(Number(o.bezahlt ?? 0))}</td>
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
        {currentProjectCode || currentProjectId ? (
          <>
            Aktuelles Projekt: <b>{currentProjectCode || currentProjectId}</b>
          </>
        ) : (
          <>Kein Projekt gewählt: Projektfilter wird nicht angewendet.</>
        )}
      </div>
    </div>
  );
}
