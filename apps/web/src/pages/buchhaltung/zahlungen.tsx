import React, { useMemo, useState } from "react";
import "./styles.css";

/* =========================
   TYPES
   ========================= */
type RechnungLite = {
  id: number;
  nr: string;
  kunde: string;
  datum: string;
  netto: number;
  mwstPct: number;
  gezahlt: number;
};

type Zahlung = {
  id: number;
  datum: string;
  kunde: string;
  betrag: number;
  methode: "Überweisung" | "Bar" | "Karte" | "Scheck" | "Sonstiges";
  verwendungszweck?: string;
  rechnungId?: number;
};

type Zeitraum = "ALL" | "30" | "60" | "90" | "THIS_MONTH";
type MatchStatus = "unmatched" | "matched";

/* =========================
   HELPERS
   ========================= */
const fmt = (n: number) =>
  safeNumber(n).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const brutto = (r: RechnungLite) => safeNumber(r.netto) * (1 + safeNumber(r.mwstPct) / 100);

function safeTrim(v: unknown) {
  return String(v ?? "").trim();
}

function safeNumber(v: unknown, fallback = 0) {
  if (v === null || v === undefined || v === "") return fallback;
  const normalized =
    typeof v === "string" ? v.replace(/\s/g, "").replace(",", ".") : v;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : fallback;
}

function escapeHtml(s: unknown) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (m) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      }[m]!)
  );
}

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

function csvEscape(v: unknown) {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

/* =========================
   COMPONENT
   ========================= */
export default function Zahlungseingaenge() {
  const [rechnungen] = useState<RechnungLite[]>([
    {
      id: 1,
      nr: "R-2025-001",
      kunde: "Muster GmbH",
      datum: "30.10.2025",
      netto: 4500,
      mwstPct: 19,
      gezahlt: 1200,
    },
    {
      id: 2,
      nr: "R-2025-002",
      kunde: "Bau AG",
      datum: "29.10.2025",
      netto: 2890,
      mwstPct: 19,
      gezahlt: 2890,
    },
    {
      id: 3,
      nr: "R-2025-003",
      kunde: "Stadtwerke",
      datum: "15.09.2025",
      netto: 9800,
      mwstPct: 7,
      gezahlt: 0,
    },
  ]);

  const [zahlungen, setZahlungen] = useState<Zahlung[]>([
    {
      id: 1,
      datum: "02.11.2025",
      kunde: "Muster GmbH",
      betrag: 1000,
      methode: "Überweisung",
      verwendungszweck: "R-2025-001",
    },
    {
      id: 2,
      datum: "01.11.2025",
      kunde: "Stadtwerke",
      betrag: 3500,
      methode: "Überweisung",
      verwendungszweck: "Teilzahlung Baugrube",
    },
  ]);

  const [zeitraum, setZeitraum] = useState<Zeitraum>("THIS_MONTH");
  const [kunde, setKunde] = useState<string>("ALL");
  const [methode, setMethode] = useState<Zahlung["methode"] | "ALL">("ALL");
  const [match, setMatch] = useState<MatchStatus | "ALL">("ALL");

  const kundenListe = useMemo(
    () => [
      "ALL",
      ...Array.from(new Set([...rechnungen.map((r) => r.kunde), ...zahlungen.map((z) => z.kunde)])),
    ],
    [rechnungen, zahlungen]
  );

  const assignedByRechnung = useMemo(() => {
    const map = new Map<number, number>();
    for (const z of zahlungen) {
      if (z.rechnungId && safeNumber(z.betrag) > 0) {
        map.set(z.rechnungId, (map.get(z.rechnungId) || 0) + safeNumber(z.betrag));
      }
    }
    return map;
  }, [zahlungen]);

  const rechnungenMitRest = useMemo(() => {
    return rechnungen.map((r) => {
      const extra = assignedByRechnung.get(r.id) || 0;
      const b = brutto(r);
      const bezahltGes = safeNumber(r.gezahlt) + extra;
      const offen = Math.max(0, b - bezahltGes);
      return { ...r, brutto: b, bezahltGes, offen };
    });
  }, [rechnungen, assignedByRechnung]);

  const filtered = useMemo(() => {
    let list = zahlungen.slice();

    list = list.filter((z) => {
      const d = parseDate(z.datum);
      switch (zeitraum) {
        case "30":
          return withinDays(d, 30);
        case "60":
          return withinDays(d, 60);
        case "90":
          return withinDays(d, 90);
        case "THIS_MONTH":
          return isSameMonth(d, new Date());
        default:
          return true;
      }
    });

    if (kunde !== "ALL") list = list.filter((z) => z.kunde === kunde);
    if (methode !== "ALL") list = list.filter((z) => z.methode === methode);
    if (match !== "ALL") {
      list = list.filter((z) => (z.rechnungId ? "matched" : "unmatched") === match);
    }

    list.sort((a, b) => parseDate(b.datum).getTime() - parseDate(a.datum).getTime() || b.id - a.id);
    return list;
  }, [zahlungen, zeitraum, kunde, methode, match]);

  /* CRUD */
  const addZahlung = () => {
    const id = zahlungen.length ? Math.max(...zahlungen.map((z) => z.id)) + 1 : 1;
    setZahlungen((prev) => [
      ...prev,
      {
        id,
        datum: new Date().toLocaleDateString("de-DE"),
        kunde: "Neuer Kunde",
        betrag: 0,
        methode: "Überweisung",
      },
    ]);
  };

  const removeZahlung = (id: number) =>
    setZahlungen((prev) => prev.filter((z) => z.id !== id));

  const updateZahlung = <K extends keyof Zahlung>(index: number, key: K, value: Zahlung[K]) => {
    setZahlungen((prev) => {
      const c = [...prev];
      if (!c[index]) return prev;

      c[index] = {
        ...c[index],
        [key]: key === "betrag" ? safeNumber(value, 0) : value,
      };

      return c;
    });
  };

  /* Auto-Match */
  const autoMatch = () => {
    const tol = 0.5;

    setZahlungen((prev) =>
      prev.map((z) => {
        if (z.rechnungId || safeNumber(z.betrag) <= 0) return z;

        const vz = safeTrim(z.verwendungszweck);

        const byNr = rechnungenMitRest.find((r) => vz.includes(r.nr));
        if (byNr) return { ...z, rechnungId: byNr.id };

        const cand = rechnungenMitRest
          .filter((r) => r.kunde === z.kunde && r.offen > 0)
          .find((r) => Math.abs(r.offen - safeNumber(z.betrag)) <= tol);

        if (cand) return { ...z, rechnungId: cand.id };

        return z;
      })
    );
  };

  /* EXPORT CSV */
  const exportCSV = (useFiltered: boolean) => {
    const data = (useFiltered ? filtered : zahlungen).map((z) => ({
      Datum: z.datum,
      Kunde: z.kunde,
      Betrag: fmt(z.betrag),
      Methode: z.methode,
      Verwendungszweck: z.verwendungszweck || "",
      Rechnung: z.rechnungId ? rechnungen.find((r) => r.id === z.rechnungId)?.nr || "" : "",
      Status: z.rechnungId ? "zugeordnet" : "offen",
    }));

    if (!data.length) {
      alert("Keine Daten für den Export vorhanden.");
      return;
    }

    const headers = Object.keys(data[0]);
    const csv = [
      headers.map(csvEscape).join(";"),
      ...data.map((row) =>
        headers.map((h) => csvEscape((row as Record<string, unknown>)[h])).join(";")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    const href = URL.createObjectURL(blob);
    a.href = href;
    a.download = useFiltered
      ? "zahlungseingaenge_gefiltert.csv"
      : "zahlungseingaenge_alle.csv";
    a.click();
    URL.revokeObjectURL(href);
  };

  /* DOWNLOAD PDF */
  const downloadPDF = async (useFiltered: boolean) => {
    const list = useFiltered ? filtered : zahlungen;
    if (!list.length) {
      alert("Keine Daten für den PDF-Download vorhanden.");
      return;
    }

    const html2canvas = (await import("html2canvas")).default;
    const { jsPDF } = await import("jspdf");

    const node = buildReportNode(list);
    const canvas = await html2canvas(node, { scale: 2 });
    node.remove();

    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const img = canvas.toDataURL("image/png");
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const ratio = Math.min(pageW / canvas.width, pageH / canvas.height);
    const w = canvas.width * ratio;
    const h = canvas.height * ratio;
    const x = (pageW - w) / 2;
    const y = (pageH - h) / 2;

    pdf.addImage(img, "PNG", x, y, w, h);
    pdf.save(useFiltered ? "Zahlungseingaenge_gefiltert.pdf" : "Zahlungseingaenge_alle.pdf");
  };

  function buildReportNode(list: Zahlung[]) {
    const wrap = document.createElement("div");
    wrap.style.position = "fixed";
    wrap.style.left = "-10000px";
    wrap.style.top = "0";
    wrap.style.width = "1024px";
    wrap.style.background = "#fff";
    wrap.style.padding = "24px";
    wrap.innerHTML = `
      <style>
        *{box-sizing:border-box;font-family:Arial}
        h1{margin:0 0 12px}
        table{width:100%;border-collapse:collapse}
        th,td{border-bottom:1px solid #eee;padding:8px;text-align:left}
        .right{text-align:right}
        .chip{padding:2px 8px;border-radius:999px;font-size:12px;display:inline-block}
        .ok{background:#eafaf1;color:#0a6c3e}
        .warn{background:#fff7e6;color:#9a6700}
      </style>
      <h1>Zahlungseingänge – Report</h1>
      <table>
        <thead>
          <tr>
            <th>Datum</th><th>Kunde</th><th class="right">Betrag (€)</th>
            <th>Methode</th><th>Verwendungszweck</th><th>Rechnung</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${list
            .map((z) => {
              const nr = z.rechnungId
                ? rechnungen.find((r) => r.id === z.rechnungId)?.nr || ""
                : "";
              const matched = !!z.rechnungId;
              return `
                <tr>
                  <td>${escapeHtml(z.datum)}</td>
                  <td>${escapeHtml(z.kunde)}</td>
                  <td class="right">${fmt(z.betrag)}</td>
                  <td>${escapeHtml(z.methode)}</td>
                  <td>${escapeHtml(z.verwendungszweck || "")}</td>
                  <td>${escapeHtml(nr)}</td>
                  <td>${matched ? '<span class="chip ok">zugeordnet</span>' : '<span class="chip warn">offen</span>'}</td>
                </tr>`;
            })
            .join("")}
        </tbody>
      </table>
      <div style="margin-top:10px">
        <b>Summe:</b> ${fmt(list.reduce((s, z) => s + safeNumber(z.betrag), 0))} €
      </div>
    `;
    document.body.appendChild(wrap);
    return wrap;
  }

  const sumFiltered = useMemo(
    () => filtered.reduce((s, z) => s + safeNumber(z.betrag), 0),
    [filtered]
  );

  const sumAll = useMemo(
    () => zahlungen.reduce((s, z) => s + safeNumber(z.betrag), 0),
    [zahlungen]
  );

  const sumUnmatched = useMemo(
    () => zahlungen.filter((z) => !z.rechnungId).reduce((s, z) => s + safeNumber(z.betrag), 0),
    [zahlungen]
  );

  /* RENDER */
  return (
    <div className="bh-page">
      <div className="bh-header-row">
        <h2>Zahlungseingänge / Zuordnung</h2>
        <div className="bh-actions">
          <button className="bh-btn" onClick={addZahlung}>
            + Neuer Zahlungseingang
          </button>
          <button className="bh-btn ghost" onClick={autoMatch}>
            Auto-Match
          </button>
          <button className="bh-btn ghost" onClick={() => exportCSV(true)}>
            Export CSV (gefiltert)
          </button>
          <button className="bh-btn ghost" onClick={() => exportCSV(false)}>
            Export CSV (alle)
          </button>
          <button className="bh-btn ghost" onClick={() => downloadPDF(true)}>
            Download PDF (gefiltert)
          </button>
          <button className="bh-btn ghost" onClick={() => downloadPDF(false)}>
            Download PDF (alle)
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
          <label>Methode</label>
          <select
            value={methode}
            onChange={(e) => setMethode(e.target.value as Zahlung["methode"] | "ALL")}
          >
            <option value="ALL">Alle</option>
            <option value="Überweisung">Überweisung</option>
            <option value="Bar">Bar</option>
            <option value="Karte">Karte</option>
            <option value="Scheck">Scheck</option>
            <option value="Sonstiges">Sonstiges</option>
          </select>
        </div>

        <div>
          <label>Status</label>
          <select value={match} onChange={(e) => setMatch(e.target.value as MatchStatus | "ALL")}>
            <option value="ALL">Alle</option>
            <option value="matched">zugeordnet</option>
            <option value="unmatched">offen</option>
          </select>
        </div>
      </div>

      <table className="bh-table">
        <thead>
          <tr>
            <th>Aktionen</th>
            <th>Datum</th>
            <th>Kunde</th>
            <th className="right">Betrag (€)</th>
            <th>Methode</th>
            <th>Verwendungszweck</th>
            <th>Rechnung</th>
            <th>Status</th>
            <th className="right">Rest offen (Rechnung)</th>
          </tr>
        </thead>

        <tbody>
          {filtered.map((z) => {
            const i = zahlungen.findIndex((x) => x.id === z.id);
            const r = z.rechnungId
              ? rechnungenMitRest.find((x) => x.id === z.rechnungId)
              : undefined;
            const nr = z.rechnungId
              ? rechnungen.find((r) => r.id === z.rechnungId)?.nr || ""
              : "";
            const matched = !!z.rechnungId;

            return (
              <tr key={z.id}>
                <td>
                  <button
                    className="bh-btn"
                    style={{ background: "#e74c3c" }}
                    onClick={() => removeZahlung(z.id)}
                  >
                    Löschen
                  </button>
                </td>

                <td>
                  <input
                    type="text"
                    value={z.datum}
                    onChange={(e) => updateZahlung(i, "datum", e.target.value)}
                    style={{ width: 110 }}
                  />
                </td>

                <td>
                  <input
                    type="text"
                    value={z.kunde}
                    onChange={(e) => updateZahlung(i, "kunde", e.target.value)}
                    style={{ minWidth: 160 }}
                  />
                </td>

                <td className="right">
                  <input
                    type="number"
                    step="0.01"
                    value={z.betrag}
                    onChange={(e) => updateZahlung(i, "betrag", safeNumber(e.target.value, 0))}
                    style={{ width: 120, textAlign: "right" }}
                  />
                </td>

                <td>
                  <select
                    value={z.methode}
                    onChange={(e) => updateZahlung(i, "methode", e.target.value as Zahlung["methode"])}
                  >
                    <option value="Überweisung">Überweisung</option>
                    <option value="Bar">Bar</option>
                    <option value="Karte">Karte</option>
                    <option value="Scheck">Scheck</option>
                    <option value="Sonstiges">Sonstiges</option>
                  </select>
                </td>

                <td>
                  <input
                    type="text"
                    value={z.verwendungszweck || ""}
                    onChange={(e) => updateZahlung(i, "verwendungszweck", e.target.value)}
                    style={{ minWidth: 220 }}
                  />
                </td>

                <td>
                  <select
                    value={z.rechnungId || ""}
                    onChange={(e) =>
                      updateZahlung(
                        i,
                        "rechnungId",
                        e.target.value ? Number(e.target.value) : undefined
                      )
                    }
                  >
                    <option value="">– auswählen –</option>
                    {rechnungenMitRest.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.nr} · {r.kunde} · offen {fmt(r.offen)} €
                      </option>
                    ))}
                  </select>
                </td>

                <td>
                  {matched ? (
                    <span className="chip ok">zugeordnet</span>
                  ) : (
                    <span className="chip warn">offen</span>
                  )}
                </td>

                <td className="right">
                  {r ? fmt(Math.max(0, r.offen - safeNumber(z.betrag))) : "—"}
                </td>
              </tr>
            );
          })}

          {filtered.length === 0 && (
            <tr>
              <td colSpan={9} style={{ textAlign: "center", color: "#777", padding: 14 }}>
                Keine Zahlungseingänge im aktuellen Filter.
              </td>
            </tr>
          )}

          <tr style={{ background: "#fafafa", fontWeight: 600 }}>
            <td colSpan={3} style={{ textAlign: "right" }}>
              Summe (gefiltert):
            </td>
            <td className="right">{fmt(sumFiltered)}</td>
            <td colSpan={5}></td>
          </tr>
        </tbody>
      </table>

      <div className="bh-note" style={{ marginTop: 8 }}>
        Gesamt Zahlungen: <b>{fmt(sumAll)} €</b> · Nicht zugeordnet: <b>{fmt(sumUnmatched)} €</b>
      </div>
    </div>
  );
}





