import React, { useMemo, useRef, useState } from "react";

/** ===== Types ===== */
type LVPos = {
  posnr: string;
  kurztext: string;
  langtext?: string;
  me?: string;
  menge?: number;
  // possono arrivare ma li rimuoviamo:
  ep?: number | string | null;
  gp?: number | string | null;
  preis?: number | string | null;
};

const parseNum = (v: any) => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
};

/** CSV <-> JSON minimal (separatore ;) */
function parseCSV(text: string): LVPos[] {
  const lines = text.replace(/\r/g, "").split("\n").filter(l => l.trim() !== "");
  if (lines.length === 0) return [];
  const headers = lines[0].split(";").map(s => s.trim().toLowerCase());

  const idx = (alts: string[]) => headers.findIndex(h => alts.includes(h));

  const iPos   = idx(["posnr","positionsnummer","pos","position"]);
  const iKurz  = idx(["kurztext","kurz","bezeichnung"]);
  const iLang  = idx(["langtext","text","beschreibung"]);
  const iME    = idx(["me","einheit","eh","unit"]);
  const iMenge = idx(["menge","qty","m"]);
  const iEP    = idx(["ep","einheitspreis","preis","preis_ep","preis (ep)"]);
  const iGP    = idx(["gp","gesamtpreis","ges preis","preis (gp)"]);

  const out: LVPos[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cols = lines[r].split(";");
    if (cols.length === 1 && cols[0].trim() === "") continue;
    out.push({
      posnr: String(cols[iPos] ?? "").trim(),
      kurztext: String(cols[iKurz] ?? "").trim(),
      langtext: iLang >= 0 ? String(cols[iLang] ?? "").trim() : undefined,
      me: iME >= 0 ? String(cols[iME] ?? "").trim() : undefined,
      menge: iMenge >= 0 ? parseNum(cols[iMenge]) : undefined,
      ep: iEP >= 0 ? cols[iEP] : undefined,
      gp: iGP >= 0 ? cols[iGP] : undefined,
    });
  }
  return out;
}

function toCSV(rows: LVPos[], include: IncludeFields): string {
  const head = [
    include.posnr ? "PosNr" : null,
    include.kurztext ? "Kurztext" : null,
    include.langtext ? "Langtext" : null,
    include.me ? "ME" : null,
    include.menge ? "Menge" : null,
  ].filter(Boolean);

  const body = rows.map(r => [
    include.posnr ? r.posnr : null,
    include.kurztext ? r.kurztext?.replace(/;/g, ",") : null,
    include.langtext ? (r.langtext ?? "").replace(/;/g, ",") : null,
    include.me ? (r.me ?? "") : null,
    include.menge ? (r.menge ?? "") : null,
  ].filter(v => v !== null).join(";"));

  return [head.join(";"), ...body].join("\n");
}

/** ===== Component ===== */
type IncludeFields = {
  posnr: boolean; kurztext: boolean; langtext: boolean; me: boolean; menge: boolean;
};

export default function LVExportOhnePreisePage() {
  const [rows, setRows] = useState<LVPos[]>([]);
  const [query, setQuery] = useState("");
  const [include, setInclude] = useState<IncludeFields>({
    posnr: true, kurztext: true, langtext: false, me: true, menge: true,
  });
  const [stripEmptyLines, setStripEmptyLines] = useState(true);
  const [outputSepComma, setOutputSepComma] = useState(false); // opzionale
  const fileRef = useRef<HTMLInputElement>(null);

  /** filtra + rimuovi colonne prezzo */
  const cleaned = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = rows
      .map(r => ({ ...r, ep: undefined, gp: undefined, preis: undefined })) // rimuovi prezzi
      .filter(r =>
        !stripEmptyLines ||
        (r.posnr?.trim() || r.kurztext?.trim())
      );

    if (!q) return base;
    return base.filter(r =>
      r.posnr.toLowerCase().includes(q) ||
      (r.kurztext || "").toLowerCase().includes(q) ||
      (r.langtext || "").toLowerCase().includes(q)
    );
  }, [rows, query, stripEmptyLines]);

  const exportCSV = () => {
    let csv = toCSV(cleaned, include);
    if (outputSepComma) csv = csv.replace(/;/g, ",");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "LV_ohne_Preise.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: "#111827" }}>LV ohne Preise exportieren</div>

      {/* Toolbar */}
      <div style={toolbar}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            placeholder="Suche… (PosNr, Kurz-/Langtext)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={searchInput}
          />

          <label style={btnSecondary}>
            CSV-Import (LV)
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const r = new FileReader();
                r.onload = () => {
                  const text = String(r.result || "");
                  setRows(parseCSV(text));
                };
                r.readAsText(f, "utf-8");
              }}
            />
          </label>

          <button style={btnPrimary} disabled={cleaned.length === 0} onClick={exportCSV}>
            CSV-Export (ohne Preise)
          </button>
        </div>

        <div style={{ fontSize: 12, color: "#6b7280" }}>
          Positionen: {rows.length} • Export: {cleaned.length}
        </div>
      </div>

      {/* Opzioni */}
      <div style={card}>
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontWeight: 600 }}>Spalten im Export:</div>
          {([
            ["posnr","PosNr"],
            ["kurztext","Kurztext"],
            ["langtext","Langtext"],
            ["me","ME"],
            ["menge","Menge"],
          ] as [keyof IncludeFields, string][]).map(([k, label]) => (
            <label key={k} style={chk}>
              <input
                type="checkbox"
                checked={include[k]}
                onChange={(e) => setInclude({ ...include, [k]: e.target.checked })}
              /> {label}
            </label>
          ))}

          <label style={chk}>
            <input
              type="checkbox"
              checked={stripEmptyLines}
              onChange={(e) => setStripEmptyLines(e.target.checked)}
            /> Leere Zeilen entfernen
          </label>

          <label style={chk}>
            <input
              type="checkbox"
              checked={outputSepComma}
              onChange={(e) => setOutputSepComma(e.target.checked)}
            /> Komma statt Semikolon
          </label>
        </div>
      </div>

      {/* Tabelle di anteprima */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
        <div style={{ overflow: "auto", maxHeight: "65vh" }}>
          <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%" }}>
            <thead style={{ position: "sticky", top: 0, background: "#f8fafc", borderBottom: "1px solid #e5e7eb" }}>
              <tr>
                {include.posnr && <th style={th(120)}>PosNr</th>}
                {include.kurztext && <th style={th(360)}>Kurztext</th>}
                {include.langtext && <th style={th(420)}>Langtext</th>}
                {include.me && <th style={th(80)}>ME</th>}
                {include.menge && <th style={th(100)}>Menge</th>}
              </tr>
            </thead>
            <tbody>
              {cleaned.map((r, i) => (
                <tr key={i} style={{ background: i % 2 ? "#fcfcfc" : "white" }}>
                  {include.posnr && <td style={td(120)}>{r.posnr}</td>}
                  {include.kurztext && <td style={td(360)} title={r.kurztext}>{r.kurztext}</td>}
                  {include.langtext && <td style={td(420)} title={r.langtext}>{r.langtext}</td>}
                  {include.me && <td style={td(80)}>{r.me ?? ""}</td>}
                  {include.menge && <td style={td(100)}>{r.menge ?? ""}</td>}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: 16, color: "#6b7280" }}>
                    Noch keine Daten. CSV importieren (Spalten-Beispiele: <b>PosNr;Kurztext;Langtext;ME;Menge;EP;GP</b>).
                    Preise werden beim Export automatisch entfernt.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** ===== Styles ===== */
const toolbar: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  border: "1px solid #e5e7eb",
  background: "#f8fafc",
  borderRadius: 10,
  padding: 12,
  marginBottom: 8,
};
const card: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, background: "white" };
const btnPrimary: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid #2563eb", background: "#2563eb", color: "white", cursor: "pointer", fontWeight: 600 };
const btnSecondary: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb", background: "white", color: "#111827", cursor: "pointer", fontWeight: 600 };
const searchInput: React.CSSProperties = { width: 260, height: 36, borderRadius: 8, border: "1px solid #e5e7eb", outline: "none", padding: "0 10px", fontSize: 14 };
const chk: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, userSelect: "none" };
function th(w: number): React.CSSProperties { return { position: "sticky", top: 0, background: "#f8fafc", textAlign: "left", padding: "10px 8px", fontSize: 12, borderBottom: "1px solid #e5e7eb", minWidth: w, maxWidth: w, zIndex: 1 }; }
function td(w: number): React.CSSProperties { return { padding: "8px", fontSize: 12, borderBottom: "1px solid #f1f5f9", minWidth: w, maxWidth: w, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }; }
