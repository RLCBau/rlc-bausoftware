import React, { useMemo, useRef, useState } from "react";

/** ===================== Types ===================== */
type LVPos = {
  posnr: string;         // Positionsnummer
  kurztext: string;      // Kurztext
  me: string;            // Mengeneinheit
  menge: number;         // Menge
  ep: number;            // Einheitspreis (netto)
  gp?: number;           // Gesamtpreis (calc)
  _checked?: boolean;    // UI selection
};

type Params = {
  mode: "aufschlag" | "rabatt" | "ziel_ep";
  value: number;            // % per aufschlag/rabatt, oppure EP di destinazione se mode=ziel_ep
  nurMarkierte: boolean;
  runden: "2" | "0_05" | "0_1" | "1" | "kein";
  minEP?: number;           // soglia minima EP
  nurPreisGroesser0: boolean;
  filterQuery: string;
};

/** ===================== Helpers ===================== */
const parseNumber = (v: any): number => {
  if (v === null || v === undefined) return 0;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

const fmt = (n: number) => {
  return (Math.round(n * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

function applyRound(n: number, r: Params["runden"]) {
  if (r === "kein") return n;
  if (r === "2") return Math.round(n * 100) / 100;
  if (r === "0_1") return Math.round(n * 10) / 10;
  if (r === "1") return Math.round(n);
  if (r === "0_05") return Math.round(n / 0.05) * 0.05;
  return n;
}

/** CSV parser minimale (header liberi) */
function parseCSV(text: string): LVPos[] {
  const lines = text.replace(/\r/g, "").split("\n").filter(l => l.trim() !== "");
  if (lines.length === 0) return [];
  const headers = lines[0].split(";").map(h => h.trim().toLowerCase());
  const idx = (names: string[]) => headers.findIndex(h => names.includes(h));

  const iPos   = idx(["posnr","positionsnummer","pos","position"]);
  const iKurz  = idx(["kurztext","kurz","bezeichnung"]);
  const iME    = idx(["me","einheit","eh","unit"]);
  const iMenge = idx(["menge","qty","m"]);
  const iEP    = idx(["ep","einheitspreis","preis","preis_ep","preis (ep)"]);

  const rows: LVPos[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(";");
    if (cols.length === 1 && cols[0].trim() === "") continue;
    const pos: LVPos = {
      posnr: String(cols[iPos] ?? "").trim(),
      kurztext: String(cols[iKurz] ?? "").trim(),
      me: String(cols[iME] ?? "").trim(),
      menge: parseNumber(cols[iMenge]),
      ep: parseNumber(cols[iEP]),
    };
    pos.gp = pos.menge * pos.ep;
    rows.push(pos);
  }
  return rows;
}

function toCSV(rows: LVPos[]): string {
  const head = ["PosNr","Kurztext","ME","Menge","EP (neu)","GP (neu)"];
  const body = rows.map(r => [
    r.posnr,
    r.kurztext.replace(/;/g, ","),
    r.me,
    fmt(r.menge),
    fmt(r.ep),
    fmt((r.menge||0) * (r.ep||0)),
  ].join(";"));
  return [head.join(";"), ...body].join("\n");
}

/** Applica regole di sconto/markup ai prezzi (immutabile) */
function recalc(original: LVPos[], p: Params): LVPos[] {
  const q = p.filterQuery.trim().toLowerCase();
  return original.map(o => {
    const use =
      (!p.nurMarkierte || o._checked) &&
      (!p.nurPreisGroesser0 || (o.ep || 0) > 0) &&
      (q === "" || o.posnr.toLowerCase().includes(q) || o.kurztext.toLowerCase().includes(q));

    if (!use) {
      // non cambia
      return { ...o, gp: (o.menge || 0) * (o.ep || 0) };
    }

    let epNeu = o.ep || 0;

    if (p.mode === "aufschlag") {
      epNeu = epNeu * (1 + (p.value / 100));
    } else if (p.mode === "rabatt") {
      epNeu = epNeu * (1 - (p.value / 100));
    } else if (p.mode === "ziel_ep") {
      epNeu = p.value;
    }

    if (p.minEP && epNeu < p.minEP) epNeu = p.minEP;
    epNeu = applyRound(epNeu, p.runden);

    return { ...o, ep: epNeu, gp: (o.menge || 0) * epNeu };
  });
}

/** ===================== Component ===================== */
export default function AufschlagPage() {
  const [rows, setRows] = useState<LVPos[]>([]);
  const [params, setParams] = useState<Params>({
    mode: "aufschlag",
    value: 10,
    nurMarkierte: false,
    runden: "2",
    minEP: undefined,
    nurPreisGroesser0: true,
    filterQuery: "",
  });
  const fileRef = useRef<HTMLInputElement>(null);

  const sum = (lst: LVPos[]) => lst.reduce((acc, r) => acc + (r.gp || 0), 0);
  const geaendert = useMemo(() => recalc(rows, params), [rows, params]);

  const toggleAll = (checked: boolean) => {
    setRows(prev => prev.map(r => ({ ...r, _checked: checked })));
  };

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: "#111827" }}>Preisaufschlag / Rabattfunktion</div>

      {/* Toolbar */}
      <div style={toolbar}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            placeholder="Suche… (PosNr, Kurztext)"
            value={params.filterQuery}
            onChange={(e) => setParams({ ...params, filterQuery: e.target.value })}
            style={searchInput}
          />

          <label style={btnSecondary}>
            CSV-Import
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
                  const parsed = parseCSV(text);
                  setRows(parsed);
                };
                r.readAsText(f, "utf-8");
              }}
            />
          </label>

          <button
            style={btnSecondary}
            onClick={() => {
              const blob = new Blob([toCSV(geaendert)], { type: "text/csv;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = "LV_mit_Aufschlag.csv"; a.click();
              URL.revokeObjectURL(url);
            }}
            disabled={rows.length === 0}
          >
            CSV-Export
          </button>
        </div>

        <div style={{ fontSize: 12, color: "#6b7280" }}>
          Positionen: {rows.length} • Summe alt: {fmt(sum(rows))} € • Summe neu: {fmt(sum(geaendert))} €
        </div>
      </div>

      {/* Panel regole */}
      <div style={card}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <div>
            <select
              value={params.mode}
              onChange={(e) => setParams({ ...params, mode: e.target.value as Params["mode"] })}
              style={select}
            >
              <option value="aufschlag">Aufschlag (%)</option>
              <option value="rabatt">Rabatt (%)</option>
              <option value="ziel_ep">Ziel-EP (fix)</option>
            </select>
          </div>

          <div>
            <input
              type="number"
              step="0.01"
              value={params.value}
              onChange={(e) => setParams({ ...params, value: Number(e.target.value) })}
              style={numInput}
            />{" "}
            {params.mode === "ziel_ep" ? "€" : "%"}
          </div>

          <div>
            Runden:&nbsp;
            <select
              value={params.runden}
              onChange={(e) => setParams({ ...params, runden: e.target.value as Params["runden"] })}
              style={select}
            >
              <option value="2">2 Nachkommastellen</option>
              <option value="0_05">auf 0,05</option>
              <option value="0_1">auf 0,1</option>
              <option value="1">auf 1</option>
              <option value="kein">keine Rundung</option>
            </select>
          </div>

          <div>
            Min-EP:&nbsp;
            <input
              type="number"
              step="0.01"
              placeholder="optional"
              value={params.minEP ?? ""}
              onChange={(e) => setParams({ ...params, minEP: e.target.value === "" ? undefined : Number(e.target.value) })}
              style={{ ...numInput, width: 110 }}
            />{" "}
            €
          </div>

          <label style={chk}>
            <input
              type="checkbox"
              checked={params.nurMarkierte}
              onChange={(e) => setParams({ ...params, nurMarkierte: e.target.checked })}
            />
            nur markierte Positionen
          </label>

          <label style={chk}>
            <input
              type="checkbox"
              checked={params.nurPreisGroesser0}
              onChange={(e) => setParams({ ...params, nurPreisGroesser0: e.target.checked })}
            />
            nur EP &gt; 0
          </label>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button style={btnSecondary} onClick={() => toggleAll(true)} disabled={rows.length === 0}>
              Alle markieren
            </button>
            <button style={btnSecondary} onClick={() => toggleAll(false)} disabled={rows.length === 0}>
              Markierung löschen
            </button>
          </div>
        </div>
      </div>

      {/* Tabelle */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
        <div style={{ overflow: "auto", maxHeight: "65vh" }}>
          <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%" }}>
            <thead style={{ position: "sticky", top: 0, background: "#f8fafc", borderBottom: "1px solid #e5e7eb" }}>
              <tr>
                <th style={th(48)}></th>
                <th style={th(120)}>PosNr</th>
                <th style={th(360)}>Kurztext</th>
                <th style={th(60)}>ME</th>
                <th style={th(80)}>Menge</th>
                <th style={th(100)}>EP alt</th>
                <th style={th(100)}>EP neu</th>
                <th style={th(110)}>GP neu</th>
              </tr>
            </thead>
            <tbody>
              {geaendert.map((r, i) => (
                <tr key={i} style={{ background: i % 2 ? "#fcfcfc" : "white" }}>
                  <td style={td(48)}>
                    <input
                      type="checkbox"
                      checked={!!rows[i]._checked}
                      onChange={(e) =>
                        setRows(prev => {
                          const c = [...prev];
                          c[i] = { ...c[i], _checked: e.target.checked };
                          return c;
                        })
                      }
                    />
                  </td>
                  <td style={td(120)}>{r.posnr}</td>
                  <td style={td(360)} title={r.kurztext}>{r.kurztext}</td>
                  <td style={td(60)}>{r.me}</td>
                  <td style={td(80)}>{fmt(r.menge)}</td>
                  <td style={td(100)}>{fmt((rows[i].ep || 0))}</td>
                  <td style={{ ...td(100), background: (rows[i].ep !== r.ep) ? "#ecfdf5" : undefined }}>
                    {fmt(r.ep)}
                  </td>
                  <td style={td(110)}>{fmt((r.menge || 0) * (r.ep || 0))}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: 16, color: "#6b7280" }}>
                    Noch keine Daten. CSV mit Spalten z. B. <b>PosNr;Kurztext;ME;Menge;EP</b> importieren.
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

/** ===================== Styles ===================== */
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

const card: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: 12,
  background: "white",
};

const btnSecondary: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  background: "white",
  color: "#111827",
  cursor: "pointer",
  fontWeight: 600,
};

const searchInput: React.CSSProperties = {
  width: 260,
  height: 36,
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  outline: "none",
  padding: "0 10px",
  fontSize: 14,
};

const select: React.CSSProperties = {
  height: 36,
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  padding: "0 10px",
};

const numInput: React.CSSProperties = {
  width: 120,
  height: 36,
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  padding: "0 10px",
};

const chk: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, userSelect: "none" };

function th(w: number): React.CSSProperties {
  return {
    position: "sticky",
    top: 0,
    background: "#f8fafc",
    textAlign: "left",
    padding: "10px 8px",
    fontSize: 12,
    borderBottom: "1px solid #e5e7eb",
    minWidth: w,
    maxWidth: w,
    zIndex: 1,
  };
}
function td(w: number): React.CSSProperties {
  return {
    padding: "8px",
    fontSize: 12,
    borderBottom: "1px solid #f1f5f9",
    minWidth: w,
    maxWidth: w,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
}
