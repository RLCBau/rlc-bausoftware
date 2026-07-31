import React, { useMemo, useState } from "react";
import "./styles.css";

/* =========================
   TYPES
   ========================= */
type JournalQuelle = "Rechnungen" | "Eingangsrechnungen" | "Kassenbuch";
type Kontenplan = "SKR03" | "SKR04";
type Zeitraum = "ALL" | "30" | "60" | "90" | "THIS_MONTH" | "YTD";

type JournalRow = {
  id: number;
  quelle: JournalQuelle;
  belegNr: string;
  buchungsdatum: string;  // dd.mm.yyyy
  belegdatum: string;     // dd.mm.yyyy
  text: string;
  debitor?: string;       // Debitorenkonto / Kundennr
  kreditor?: string;      // Kreditorenkonto / Lieferantennr
  konto?: string;         // Erlös-/Aufwandskonto
  gegenkonto?: string;    // Bank/Kasse/Debitor/Kreditor
  betrag: number;         // + = Haben-Umsatz (Erlös), - = Soll (Aufwand) per preview
  ustSchluessel?: string; // z.B. 19 USt = 3; 7% = 2 (schematico)
  kost1?: string;
  kost2?: string;
};

type Stammdatensatz = {
  nr: string;             // Debitor/Kreditor Nr
  name: string;
  plz?: string; ort?: string; strasse?: string; land?: string;
  email?: string; ustId?: string;
  konto?: string;         // Sammelkonto Debitor/Kreditor
};

/* =========================
   HELPERS
   ========================= */
const fmt = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const parseDE = (s: string) => {
  if (!s) return new Date("1970-01-01");
  const [d, m, y] = s.split(".").map(Number);
  return new Date(y, m - 1, d);
};
const withinDays = (d: Date, days: number) => { const from = new Date(); from.setDate(from.getDate() - days); return d >= from; };
const isSameMonth = (d: Date, ref: Date) => d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();

/* =========================
   COMPONENT
   ========================= */
export default function DATEV() {
  /* Demo journal (unificato da Rechnungen/Eingangsrechnungen/Kasse) */
  const [rows, setRows] = useState<JournalRow[]>([
    { id: 1, quelle: "Rechnungen", belegNr: "R-2025-102", buchungsdatum: "30.10.2025", belegdatum: "30.10.2025", text: "Erlöse Rohrbau", debitor: "10001", konto: "8400", gegenkonto: "1200", betrag: 5355.00, ustSchluessel: "3", kost1: "KS-02" },
    { id: 2, quelle: "Eingangsrechnungen", belegNr: "E-2025-077", buchungsdatum: "28.10.2025", belegdatum: "27.10.2025", text: "Material Rohr DN200", kreditor: "70021", konto: "3400", gegenkonto: "1200", betrag: -1240.50, ustSchluessel: "8", kost1: "KS-01" },
    { id: 3, quelle: "Kassenbuch", belegNr: "K-0009", buchungsdatum: "25.10.2025", belegdatum: "25.10.2025", text: "Büromaterial bar", konto: "4920", gegenkonto: "1000", betrag: -36.50, ustSchluessel: "8" },
  ]);

  const [kontenplan, setKontenplan] = useState<Kontenplan>("SKR03");
  const [quelle, setQuelle] = useState<JournalQuelle | "ALL">("ALL");
  const [zeitraum, setZeitraum] = useState<Zeitraum>("THIS_MONTH");
  const [query, setQuery] = useState("");
  const [belegkreis, setBelegkreis] = useState("RLC");
  const [standardBank, setStandardBank] = useState("1200");   // Bank
  const [standardKasse, setStandardKasse] = useState("1000"); // Kasse

  /* ====== Stammdaten demo ====== */
  const [debitoren] = useState<Stammdatensatz[]>([
    { nr: "10001", name: "Muster GmbH", plz: "80331", ort: "München", strasse: "Hauptstr. 1", land: "DE", email: "info@muster.de", konto: kontenplan === "SKR03" ? "10000" : "120000" },
  ]);
  const [kreditoren] = useState<Stammdatensatz[]>([
    { nr: "70021", name: "Bauhandel AG", plz: "90402", ort: "Nürnberg", strasse: "Industriepark 5", land: "DE", email: "office@bauhandel.de", konto: kontenplan === "SKR03" ? "70000" : "160000" },
  ]);

  /* ====== Filtering ====== */
  const filtered = useMemo(() => {
    let arr = rows.slice();
    if (quelle !== "ALL") arr = arr.filter(r => r.quelle === quelle);
    arr = arr.filter(r => {
      const d = parseDE(r.buchungsdatum);
      switch (zeitraum) {
        case "30": return withinDays(d, 30);
        case "60": return withinDays(d, 60);
        case "90": return withinDays(d, 90);
        case "THIS_MONTH": return isSameMonth(d, new Date());
        case "YTD": return d.getFullYear() === new Date().getFullYear();
        default: return true;
      }
    });
    if (query.trim()) {
      const q = query.toLowerCase();
      arr = arr.filter(r =>
        (r.text || "").toLowerCase().includes(q) ||
        (r.belegNr || "").toLowerCase().includes(q) ||
        (r.konto || "").toLowerCase().includes(q) ||
        (r.gegenkonto || "").toLowerCase().includes(q) ||
        (r.debitor || "").toLowerCase().includes(q) ||
        (r.kreditor || "").toLowerCase().includes(q)
      );
    }
    // normalizza conti standard
    arr = arr.map(r => {
      let gk = r.gegenkonto || "";
      if (r.quelle === "Rechnungen" && !r.debitor) gk = gk || (kontenplan === "SKR03" ? "10000" : "120000");
      if (r.quelle === "Eingangsrechnungen" && !r.kreditor) gk = gk || (kontenplan === "SKR03" ? "70000" : "160000");
      if (r.quelle === "Kassenbuch" && !gk) gk = standardKasse;
      return { ...r, gegenkonto: gk };
    });
    // ordina per data
    arr.sort((a, b) => parseDE(b.buchungsdatum).getTime() - parseDE(a.buchungsdatum).getTime() || b.id - a.id);
    return arr;
  }, [rows, quelle, zeitraum, query, kontenplan, standardKasse]);

  const totals = useMemo(() => {
    const sum = filtered.reduce((s, r) => s + r.betrag, 0);
    const soll = filtered.filter(r => r.betrag < 0).reduce((s, r) => s + Math.abs(r.betrag), 0);
    const haben = filtered.filter(r => r.betrag > 0).reduce((s, r) => s + r.betrag, 0);
    return { sum, soll, haben };
  }, [filtered]);

  /* ====== Inline update ====== */
  const update = <K extends keyof JournalRow>(id: number, key: K, val: JournalRow[K]) =>
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [key]: val } : r)));

  /* ====== EXPORT: DATEV Buchungsstapel (CSV) ======
     Colonne principali (compat semplificata):
     - UMSATZ_OHNE_SHK ; SHK ; KTO ; GEGKTO ; BU ; DATUM ; BELEG ; BELEGDAT ; TEXT ; KOST1 ; KOST2 ; BELEGKREIS
     Dove SHK: S/H (Soll/Haben), BU: BU-Schlüssel (z.B. 3=19% USt, 2=7%, 8=19% Vorsteuer)  */
  const exportBuchungsstapelCSV = (useFiltered: boolean) => {
    const list = useFiltered ? filtered : rows;
    if (!list.length) return;

    const header = [
      "Umsatz (ohne Soll/Haben-Kz)",
      "Soll/Haben-Kennzeichen",
      "Konto",
      "Gegenkonto",
      "BU-Schlüssel",
      "Buchungsdatum",
      "Belegfeld1",
      "Belegdatum",
      "Buchungstext",
      "KOST1",
      "KOST2",
      "Belegkreis"
    ];

    const toRow = (r: JournalRow) => {
      const shk = r.betrag < 0 ? "S" : "H";
      const betragAbs = Math.abs(r.betrag);
      const konto = r.konto || "";
      const geg = r.gegenkonto || (r.quelle === "Rechnungen" ? (r.debitor || (kontenplan === "SKR03" ? "10000" : "120000")) :
                  r.quelle === "Eingangsrechnungen" ? (r.kreditor || (kontenplan === "SKR03" ? "70000" : "160000")) :
                  r.quelle === "Kassenbuch" ? standardKasse : standardBank);
      const bu = r.ustSchluessel || "";
      return [
        betragAbs.toFixed(2).replace(".", ","), // Umsatz
        shk,
        konto,
        geg,
        bu,
        r.buchungsdatum,
        r.belegNr,
        r.belegdatum,
        (r.text || "").replace(/;/g, ","),
        r.kost1 || "",
        r.kost2 || "",
        belegkreis
      ].join(";");
    };

    const csv = [header.join(";"), ...list.map(toRow)].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "DATEV_Buchungsstapel.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /* ====== EXPORT: Debitoren/Kreditoren Stammdaten (CSV) ====== */
  const exportStammdatenCSV = (typ: "Debitor" | "Kreditor") => {
    const src = typ === "Debitor" ? debitoren : kreditoren;
    if (!src.length) return;
    const header = ["Nr", "Name", "Straße", "PLZ", "Ort", "Land", "E-Mail", "USt-ID", "Sammelkonto"];
    const csv = [
      header.join(";"),
      ...src.map(s => [s.nr, s.name, s.strasse || "", s.plz || "", s.ort || "", s.land || "", s.email || "", s.ustId || "", s.konto || ""].join(";")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `DATEV_${typ}_Stammdaten.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /* ====== PRINT PREVIEW ====== */
  function openPrint(html: string) {
    const w = window.open("", "_blank", "noopener,noreferrer,width=1000,height=700");
    if (!w) { alert("Pop-ups blockiert – bitte zulassen!"); return; }
    w.document.open(); w.document.write(html); w.document.close(); w.focus();
    setTimeout(() => { try { w.print(); } catch {} }, 400);
  }
  const printPreview = (useFiltered: boolean) => {
    const list = useFiltered ? filtered : rows;
    const body = list.map(r => `
      <tr>
        <td>${r.quelle}</td>
        <td>${r.belegNr}</td>
        <td>${r.buchungsdatum}</td>
        <td>${r.betrag < 0 ? "S" : "H"}</td>
        <td style="text-align:right">${fmt(Math.abs(r.betrag))}</td>
        <td>${r.konto || ""}</td>
        <td>${r.gegenkonto || ""}</td>
        <td>${r.ustSchluessel || ""}</td>
        <td>${r.kost1 || ""}</td>
        <td>${(r.text || "").replace(/</g,"&lt;")}</td>
      </tr>
    `).join("");

    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>DATEV Preview</title>
    <style>
      body{font-family:Arial, sans-serif;margin:32px;color:#222}
      table{width:100%;border-collapse:collapse;margin-top:12px}
      th,td{border-bottom:1px solid #ddd;padding:6px;text-align:left}
      th{background:#f5f5f5}
      .right{text-align:right}
    </style></head><body>
    <h1>DATEV – Buchungsstapel (Preview)</h1>
    <div>Datensätze: ${list.length} · Soll: ${fmt(totals.soll)} € · Haben: ${fmt(totals.haben)} €</div>
    <table>
      <thead>
        <tr><th>Quelle</th><th>Beleg</th><th>Datum</th><th>SHK</th><th class="right">Umsatz €</th><th>Konto</th><th>Gegenkonto</th><th>BU</th><th>KOST1</th><th>Text</th></tr>
      </thead>
      <tbody>${body || `<tr><td colspan="10" style="color:#666">Keine Daten.</td></tr>`}</tbody>
    </table>
    </body></html>`;
    openPrint(html);
  };

  /* =========================
     RENDER
     ========================= */
  return (
    <div className="bh-page">
      <div className="bh-header-row">
        <h2>DATEV Export</h2>
        <div className="bh-actions">
          <button className="bh-btn" onClick={() => exportBuchungsstapelCSV(true)}>Buchungsstapel CSV (gefiltert)</button>
          <button className="bh-btn ghost" onClick={() => printPreview(true)}>PDF Preview (gefiltert)</button>
          <button className="bh-btn ghost" onClick={() => exportStammdatenCSV("Debitor")}>Debitoren CSV</button>
          <button className="bh-btn ghost" onClick={() => exportStammdatenCSV("Kreditor")}>Kreditoren CSV</button>
        </div>
      </div>

      {/* FILTRI & PARAMETRI */}
      <div className="bh-filters">
        <div>
          <label>Kontenplan</label>
          <select value={kontenplan} onChange={e => setKontenplan(e.target.value as Kontenplan)}>
            <option value="SKR03">SKR03</option>
            <option value="SKR04">SKR04</option>
          </select>
        </div>
        <div>
          <label>Quelle</label>
          <select value={quelle} onChange={e => setQuelle(e.target.value as any)}>
            <option value="ALL">Alle</option>
            <option value="Rechnungen">Rechnungen (Ausgang)</option>
            <option value="Eingangsrechnungen">Eingangsrechnungen</option>
            <option value="Kassenbuch">Kassenbuch</option>
          </select>
        </div>
        <div>
          <label>Zeitraum</label>
          <select value={zeitraum} onChange={e => setZeitraum(e.target.value as Zeitraum)}>
            <option value="THIS_MONTH">Dieser Monat</option>
            <option value="30">Letzte 30 Tage</option>
            <option value="60">Letzte 60 Tage</option>
            <option value="90">Letzte 90 Tage</option>
            <option value="YTD">YTD</option>
            <option value="ALL">Alle</option>
          </select>
        </div>
        <div>
          <label>Suche</label>
          <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="Beleg / Text / Konto" />
        </div>
        <div>
          <label>Belegkreis</label>
          <input type="text" value={belegkreis} onChange={e => setBelegkreis(e.target.value)} />
        </div>
        <div>
          <label>Standard Bank (Gegenkonto)</label>
          <input type="text" value={standardBank} onChange={e => setStandardBank(e.target.value)} />
        </div>
        <div>
          <label>Standard Kasse (Gegenkonto)</label>
          <input type="text" value={standardKasse} onChange={e => setStandardKasse(e.target.value)} />
        </div>
        <div style={{ alignSelf: "end", fontWeight: 600 }}>
          Soll: {fmt(totals.soll)} € · Haben: {fmt(totals.haben)} € · Δ {fmt(totals.haben - totals.soll)} €
        </div>
      </div>

      {/* TABella registrazioni */}
      <table className="bh-table">
        <thead>
          <tr>
            <th>Quelle</th>
            <th>Beleg</th>
            <th>Buchungsdatum</th>
            <th>Belegdatum</th>
            <th>Text</th>
            <th>Konto</th>
            <th>Gegenkonto</th>
            <th>BU</th>
            <th>KOST1</th>
            <th className="right">Umsatz (€)</th>
            <th>SHK</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(r => {
            const shk = r.betrag < 0 ? "S" : "H";
            const i = rows.findIndex(x => x.id === r.id);
            return (
              <tr key={r.id}>
                <td>{r.quelle}</td>
                <td>{r.belegNr}</td>
                <td><input type="text" value={r.buchungsdatum} onChange={e => update(r.id, "buchungsdatum", e.target.value)} style={{ width: 110 }} /></td>
                <td><input type="text" value={r.belegdatum} onChange={e => update(r.id, "belegdatum", e.target.value)} style={{ width: 110 }} /></td>
                <td><input type="text" value={r.text} onChange={e => update(r.id, "text", e.target.value)} style={{ minWidth: 200 }} /></td>
                <td><input type="text" value={r.konto || ""} onChange={e => update(r.id, "konto", e.target.value)} style={{ width: 100 }} /></td>
                <td><input type="text" value={r.gegenkonto || ""} onChange={e => update(r.id, "gegenkonto", e.target.value)} style={{ width: 100 }} /></td>
                <td>
                  <select value={r.ustSchluessel || ""} onChange={e => update(r.id, "ustSchluessel", e.target.value)}>
                    <option value="">—</option>
                    <option value="3">3 · 19% USt</option>
                    <option value="2">2 · 7% USt</option>
                    <option value="8">8 · 19% Vorst.</option>
                    <option value="9">9 · 7% Vorst.</option>
                    <option value="0">0 · steuerfrei</option>
                  </select>
                </td>
                <td><input type="text" value={r.kost1 || ""} onChange={e => update(r.id, "kost1", e.target.value)} style={{ width: 110 }} /></td>
                <td className="right">{fmt(Math.abs(r.betrag))}</td>
                <td>{shk}</td>
              </tr>
            );
          })}
          <tr style={{ background: "#fafafa", fontWeight: 600 }}>
            <td colSpan={9} style={{ textAlign: "right" }}>Summe (gefiltert):</td>
            <td className="right">{fmt(Math.abs(totals.sum))}</td>
            <td></td>
          </tr>
        </tbody>
      </table>

      <div className="bh-note" style={{ marginTop: 8 }}>
        *CSV-Layout semplificato per import. Mappa avanzata (EXTF, Feldlängen, Zeichensatz, Kopfzeile) integrabile su richiesta.
      </div>
    </div>
  );
}
