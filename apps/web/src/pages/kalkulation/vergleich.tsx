// apps/web/src/pages/kalkulation/vergleich.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProject } from "../../store/useProject";

type Pos = {
  position: string;
  kurztext: string;
  einheit: string;
  menge: number;
  ep: number;
  betrag: number;
};

type DiffRow = {
  position: string;
  kurztext: string;
  einheit: string;
  mengeA: number;
  mengeB: number;
  epA: number;
  epB: number;
  betragA: number;
  betragB: number;
  delta: number;
  status: "gleich" | "teurer" | "guenstiger" | "nurA" | "nurB";
};

function getProjectKey(projectCtx: any): string {
  const p =
    projectCtx?.project ||
    projectCtx?.currentProject ||
    projectCtx?.selectedProject ||
    projectCtx?.current ||
    projectCtx;

  return String(
    p?.code ||
      p?.projectCode ||
      p?.number ||
      p?.projektnummer ||
      p?.id ||
      ""
  ).trim();
}

function storageKey(projectKey: string, key: "A" | "B") {
  return `rlc_versionsvergleich_v2:${projectKey || "NO_PROJECT"}:${key}`;
}

function safeNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;

  const raw = String(value)
    .trim()
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:[.,]|$))/g, "")
    .replace(",", ".");

  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function money(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value || 0);
}

function numberFmt(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function parseCsvLine(line: string, sep = ";"): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (quoted && next === '"') {
        cur += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (ch === sep && !quoted) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur);
  return out;
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[_-]/g, "");
}

function parseCsv(text: string): Pos[] {
  const content = String(text || "").replace(/^\uFEFF/, "").trim();
  if (!content) return [];

  const lines = content.split(/\r?\n/).filter((x) => x.trim());
  if (!lines.length) return [];

  const header = parseCsvLine(lines[0]).map(normalizeHeader);

  const hasHeader =
    header.includes("posnr") ||
    header.includes("position") ||
    header.includes("kurztext") ||
    header.includes("menge") ||
    header.includes("ep") ||
    header.includes("betrag");

  const idx = (names: string[], fallback: number) => {
    const found = header.findIndex((h) => names.includes(h));
    return found >= 0 ? found : fallback;
  };

  const iPos = hasHeader
    ? idx(["posnr", "position", "positionsnummer", "pos"], 0)
    : 0;
  const iText = hasHeader
    ? idx(["kurztext", "text", "bezeichnung", "beschreibung"], 1)
    : 1;
  const iEinheit = hasHeader ? idx(["me", "einheit", "unit", "eh"], 2) : 2;
  const iMenge = hasHeader ? idx(["menge", "qty", "quantity"], 3) : 3;
  const iEp = hasHeader
    ? idx(["ep", "preis", "einheitspreis", "einzelpreis"], 4)
    : 4;
  const iBetrag = hasHeader
    ? idx(["betrag", "gesamt", "gp", "gesamtpreis", "total"], 5)
    : 5;

  const body = hasHeader ? lines.slice(1) : lines;

  return body
    .map((line) => {
      const c = parseCsvLine(line);

      const menge = safeNumber(c[iMenge]);
      const ep = safeNumber(c[iEp]);
      const betragRaw = safeNumber(c[iBetrag]);
      const betrag = betragRaw || menge * ep;

      return {
        position: String(c[iPos] || "").trim(),
        kurztext: String(c[iText] || "").trim(),
        einheit: String(c[iEinheit] || "").trim(),
        menge,
        ep,
        betrag,
      };
    })
    .filter((r) => r.position || r.kurztext);
}

function loadRows(projectKey: string, key: "A" | "B"): Pos[] {
  try {
    const raw = localStorage.getItem(storageKey(projectKey, key));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRows(projectKey: string, key: "A" | "B", rows: Pos[]) {
  localStorage.setItem(storageKey(projectKey, key), JSON.stringify(rows));
}

function exportCsv(rows: DiffRow[], projectKey: string) {
  const head = [
    "Position",
    "Kurztext",
    "ME",
    "Menge A",
    "Menge B",
    "EP A",
    "EP B",
    "Betrag A",
    "Betrag B",
    "Delta",
    "Status",
  ];

  const body = rows.map((r) =>
    [
      r.position,
      r.kurztext,
      r.einheit,
      r.mengeA,
      r.mengeB,
      r.epA,
      r.epB,
      r.betragA,
      r.betragB,
      r.delta,
      r.status,
    ]
      .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
      .join(";")
  );

  const blob = new Blob([[head.join(";"), ...body].join("\n")], {
    type: "text/csv;charset=utf-8",
  });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `Versionsvergleich_${projectKey || "Projekt"}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function Versionsvergleich() {
  const navigate = useNavigate();
  const projectCtx: any = useProject() as any;
  const activeProjectKey = getProjectKey(projectCtx);

  const [projectKey, setProjectKey] = useState(
    activeProjectKey || "PROJ-ANG-001"
  );
  const [rowsA, setRowsA] = useState<Pos[]>(() =>
    loadRows(activeProjectKey || "PROJ-ANG-001", "A")
  );
  const [rowsB, setRowsB] = useState<Pos[]>(() =>
    loadRows(activeProjectKey || "PROJ-ANG-001", "B")
  );
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "alle" | "abweichend" | "teurer" | "guenstiger" | "nurA" | "nurB"
  >("alle");
  const [info, setInfo] = useState("");

  useEffect(() => {
    if (!activeProjectKey) return;

    setProjectKey(activeProjectKey);
    setRowsA(loadRows(activeProjectKey, "A"));
    setRowsB(loadRows(activeProjectKey, "B"));
  }, [activeProjectKey]);

  const diff = useMemo<DiffRow[]>(() => {
    const mapA = new Map(rowsA.map((p) => [p.position, p]));
    const mapB = new Map(rowsB.map((p) => [p.position, p]));
    const keys = Array.from(new Set([...mapA.keys(), ...mapB.keys()])).sort(
      (a, b) => a.localeCompare(b, "de", { numeric: true })
    );

    return keys.map((key) => {
      const a = mapA.get(key);
      const b = mapB.get(key);

      const betragA = a?.betrag || 0;
      const betragB = b?.betrag || 0;
      const delta = betragB - betragA;

      let status: DiffRow["status"] = "gleich";
      if (a && !b) status = "nurA";
      else if (!a && b) status = "nurB";
      else if (delta > 0.009) status = "teurer";
      else if (delta < -0.009) status = "guenstiger";

      return {
        position: key,
        kurztext: a?.kurztext || b?.kurztext || "",
        einheit: a?.einheit || b?.einheit || "",
        mengeA: a?.menge || 0,
        mengeB: b?.menge || 0,
        epA: a?.ep || 0,
        epB: b?.ep || 0,
        betragA,
        betragB,
        delta,
        status,
      };
    });
  }, [rowsA, rowsB]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return diff.filter((r) => {
      if (q) {
        const hay = `${r.position} ${r.kurztext} ${r.einheit}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      if (statusFilter === "alle") return true;
      if (statusFilter === "abweichend") return r.status !== "gleich";
      return r.status === statusFilter;
    });
  }, [diff, query, statusFilter]);

  const summary = useMemo(() => {
    const sumA = rowsA.reduce((s, p) => s + (p.betrag || 0), 0);
    const sumB = rowsB.reduce((s, p) => s + (p.betrag || 0), 0);
    const delta = sumB - sumA;

    return {
      sumA,
      sumB,
      delta,
      countA: rowsA.length,
      countB: rowsB.length,
      total: diff.length,
      changed: diff.filter((r) => r.status !== "gleich").length,
      teurer: diff.filter((r) => r.status === "teurer").length,
      guenstiger: diff.filter((r) => r.status === "guenstiger").length,
      nurA: diff.filter((r) => r.status === "nurA").length,
      nurB: diff.filter((r) => r.status === "nurB").length,
    };
  }, [rowsA, rowsB, diff]);

  function importCsv(which: "A" | "B", file: File) {
    const reader = new FileReader();

    reader.onload = () => {
      const parsed = parseCsv(String(reader.result || ""));

      saveRows(projectKey, which, parsed);

      if (which === "A") setRowsA(parsed);
      else setRowsB(parsed);

      setInfo(
        `Import ${which} abgeschlossen: ${parsed.length.toLocaleString(
          "de-DE"
        )} Positionen.`
      );
      setTimeout(() => setInfo(""), 2500);
    };

    reader.readAsText(file, "utf-8");
  }

  function clear(which: "A" | "B") {
    if (!confirm(`Version ${which} wirklich löschen?`)) return;

    saveRows(projectKey, which, []);
    if (which === "A") setRowsA([]);
    else setRowsB([]);
  }

  return (
    <div style={page}>
      <section style={heroCard}>
        <div>
          <div style={eyebrow}>RLC Angebotsanalyse</div>
          <h1 style={title}>Versionsvergleich</h1>
          <p style={subtitle}>
            Zwei LV-/Angebotsstände vergleichen, Preisabweichungen prüfen und
            Differenzen sauber auswerten.
          </p>
        </div>

        <div style={heroActions}>
          <button style={btnSecondary} onClick={() => navigate("/kalkulation/mit-ki")}>
            ⇢ Kalkulation mit KI
          </button>
          <button style={btnSecondary} onClick={() => navigate("/kalkulation/manuell")}>
            ⇢ Manuell
          </button>
          <button style={btnSecondary} onClick={() => navigate("/kalkulation/angebot")}>
            ⇢ Angebot
          </button>
          <button
            style={btnPrimary}
            onClick={() => exportCsv(filtered, projectKey)}
            disabled={!filtered.length}
          >
            Ergebnis exportieren
          </button>
        </div>

        <div style={heroMeta}>
          Projekt: <b>{projectKey || "—"}</b>
          {info ? <span> · {info}</span> : null}
        </div>
      </section>

      <section style={grid4}>
        <Kpi label="Summe A" value={money(summary.sumA)} sub={`${summary.countA} Positionen`} />
        <Kpi label="Summe B" value={money(summary.sumB)} sub={`${summary.countB} Positionen`} />
        <Kpi
          label="Delta"
          value={money(summary.delta)}
          sub={summary.delta >= 0 ? "B ist teurer" : "B ist günstiger"}
          danger={summary.delta > 0}
          ok={summary.delta < 0}
        />
        <Kpi
          label="Abweichungen"
          value={`${summary.changed}/${summary.total}`}
          sub={`${summary.teurer} teurer · ${summary.guenstiger} günstiger`}
        />
      </section>

      <section style={card}>
        <div style={sectionHead}>
          <div>
            <h2 style={sectionTitle}>Import & Filter</h2>
            <div style={sectionText}>
              CSV-Struktur: Position;Kurztext;ME;Menge;EP;Betrag
            </div>
          </div>
        </div>

        <div style={toolbar}>
          <Field label="Projekt">
            <input
              style={input}
              value={projectKey}
              onChange={(e) => {
                const next = e.target.value;
                setProjectKey(next);
                setRowsA(loadRows(next, "A"));
                setRowsB(loadRows(next, "B"));
              }}
            />
          </Field>

          <Field label="Suche">
            <input
              style={input}
              placeholder="PosNr / Kurztext / Einheit"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </Field>

          <Field label="Filter">
            <select
              style={input}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
            >
              <option value="alle">Alle</option>
              <option value="abweichend">Nur abweichend</option>
              <option value="teurer">B teurer</option>
              <option value="guenstiger">B günstiger</option>
              <option value="nurA">Nur in A</option>
              <option value="nurB">Nur in B</option>
            </select>
          </Field>

          <div style={buttonCluster}>
            <label style={btnSecondary}>
              Import A
              <input
                type="file"
                accept=".csv,text/csv"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importCsv("A", f);
                  e.currentTarget.value = "";
                }}
              />
            </label>

            <label style={btnSecondary}>
              Import B
              <input
                type="file"
                accept=".csv,text/csv"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importCsv("B", f);
                  e.currentTarget.value = "";
                }}
              />
            </label>

            <button style={btnDanger} onClick={() => clear("A")} disabled={!rowsA.length}>
              A löschen
            </button>
            <button style={btnDanger} onClick={() => clear("B")} disabled={!rowsB.length}>
              B löschen
            </button>
          </div>
        </div>
      </section>

      <section style={card}>
        <div style={sectionHead}>
          <div>
            <h2 style={sectionTitle}>Vergleichstabelle</h2>
            <div style={sectionText}>
              Grün = B günstiger. Rot = B teurer. Grau = nur in einer Version vorhanden.
            </div>
          </div>
          <div style={badgeNeutral}>
            Sichtbar: {filtered.length.toLocaleString("de-DE")} Positionen
          </div>
        </div>

        <div style={tableWrap}>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Pos.</th>
                <th style={th}>Kurztext</th>
                <th style={th}>ME</th>
                <th style={thRight}>Menge A</th>
                <th style={thRight}>Menge B</th>
                <th style={thRight}>EP A</th>
                <th style={thRight}>EP B</th>
                <th style={thRight}>Betrag A</th>
                <th style={thRight}>Betrag B</th>
                <th style={thRight}>Delta</th>
                <th style={th}>Status</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((r, i) => {
                const rowBg =
                  r.status === "teurer"
                    ? "#FEF2F2"
                    : r.status === "guenstiger"
                    ? "#F0FDF4"
                    : r.status === "nurA" || r.status === "nurB"
                    ? "#F8FAFC"
                    : i % 2
                    ? "#FCFCFC"
                    : "#FFFFFF";

                return (
                  <tr key={`${r.position}-${i}`} style={{ background: rowBg }}>
                    <td style={tdStrong}>{r.position}</td>
                    <td style={td}>{r.kurztext}</td>
                    <td style={td}>{r.einheit}</td>
                    <td style={tdRight}>{numberFmt(r.mengeA)}</td>
                    <td style={tdRight}>{numberFmt(r.mengeB)}</td>
                    <td style={tdRight}>{money(r.epA)}</td>
                    <td style={tdRight}>{money(r.epB)}</td>
                    <td style={tdRight}>{money(r.betragA)}</td>
                    <td style={tdRight}>{money(r.betragB)}</td>
                    <td
                      style={{
                        ...tdRight,
                        fontWeight: 900,
                        color:
                          r.delta > 0
                            ? "#B91C1C"
                            : r.delta < 0
                            ? "#15803D"
                            : "#475569",
                      }}
                    >
                      {money(r.delta)}
                    </td>
                    <td style={td}>
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                );
              })}

              {!filtered.length ? (
                <tr>
                  <td colSpan={11} style={{ ...td, color: "#64748B" }}>
                    Keine Daten vorhanden oder kein Treffer im aktuellen Filter.
                  </td>
                </tr>
              ) : null}
            </tbody>

            {filtered.length ? (
              <tfoot>
                <tr>
                  <td style={tfootCell} colSpan={7}>
                    Summe
                  </td>
                  <td style={tfootRight}>{money(summary.sumA)}</td>
                  <td style={tfootRight}>{money(summary.sumB)}</td>
                  <td
                    style={{
                      ...tfootRight,
                      color: summary.delta > 0 ? "#B91C1C" : "#15803D",
                    }}
                  >
                    {money(summary.delta)}
                  </td>
                  <td style={tfootCell}></td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </section>
    </div>
  );
}

/* ================= UI ================= */

function Kpi({
  label,
  value,
  sub,
  danger,
  ok,
}: {
  label: string;
  value: string;
  sub?: string;
  danger?: boolean;
  ok?: boolean;
}) {
  return (
    <div style={kpiCard}>
      <div style={kpiLabel}>{label}</div>
      <div
        style={{
          ...kpiValue,
          color: danger ? "#B91C1C" : ok ? "#15803D" : "#0F172A",
        }}
      >
        {value}
      </div>
      {sub ? <div style={kpiSub}>{sub}</div> : null}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "grid", gap: 5, minWidth: 220 }}>
      <span style={fieldLabel}>{label}</span>
      {children}
    </label>
  );
}

function StatusBadge({ status }: { status: DiffRow["status"] }) {
  if (status === "teurer") return <span style={badgeDanger}>B teurer</span>;
  if (status === "guenstiger") return <span style={badgeOk}>B günstiger</span>;
  if (status === "nurA") return <span style={badgeNeutral}>Nur A</span>;
  if (status === "nurB") return <span style={badgeNeutral}>Nur B</span>;
  return <span style={badgeOk}>Gleich</span>;
}

/* ================= STYLES ================= */

const page: React.CSSProperties = {
  display: "grid",
  gap: 16,
  padding: 16,
};

const heroCard: React.CSSProperties = {
  background: "linear-gradient(135deg,#0F172A,#1E3A8A)",
  color: "#FFFFFF",
  borderRadius: 18,
  padding: 22,
  display: "grid",
  gap: 14,
  boxShadow: "0 16px 40px rgba(15,23,42,0.18)",
};

const eyebrow: React.CSSProperties = {
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  opacity: 0.8,
  fontWeight: 800,
};

const title: React.CSSProperties = {
  margin: "4px 0",
  fontSize: 30,
  fontWeight: 900,
};

const subtitle: React.CSSProperties = {
  margin: 0,
  maxWidth: 840,
  opacity: 0.88,
  lineHeight: 1.55,
};

const heroActions: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const heroMeta: React.CSSProperties = {
  fontSize: 13,
  opacity: 0.9,
};

const grid4: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
  gap: 12,
};

const card: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
};

const sectionHead: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
  marginBottom: 12,
};

const sectionTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 17,
  color: "#0F172A",
  fontWeight: 900,
};

const sectionText: React.CSSProperties = {
  marginTop: 4,
  fontSize: 13,
  color: "#64748B",
};

const toolbar: React.CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "end",
  flexWrap: "wrap",
};

const buttonCluster: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const fieldLabel: React.CSSProperties = {
  fontSize: 12,
  color: "#64748B",
  fontWeight: 800,
};

const input: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: 10,
  padding: "9px 11px",
  fontSize: 13,
  width: "100%",
  boxSizing: "border-box",
  background: "#FFFFFF",
};

const kpiCard: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
};

const kpiLabel: React.CSSProperties = {
  fontSize: 12,
  color: "#64748B",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const kpiValue: React.CSSProperties = {
  marginTop: 6,
  fontSize: 22,
  fontWeight: 900,
};

const kpiSub: React.CSSProperties = {
  marginTop: 3,
  fontSize: 12,
  color: "#64748B",
};

const btnBase: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: 10,
  padding: "9px 13px",
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const btnPrimary: React.CSSProperties = {
  ...btnBase,
  border: "1px solid #2563EB",
  background: "#2563EB",
  color: "#FFFFFF",
};

const btnSecondary: React.CSSProperties = {
  ...btnBase,
  background: "#FFFFFF",
  color: "#0F172A",
};

const btnDanger: React.CSSProperties = {
  ...btnBase,
  border: "1px solid #FECACA",
  background: "#FEF2F2",
  color: "#B91C1C",
};

const tableWrap: React.CSSProperties = {
  overflowX: "auto",
  border: "1px solid #E5E7EB",
  borderRadius: 12,
};

const table: React.CSSProperties = {
  width: "100%",
  minWidth: 1160,
  borderCollapse: "collapse",
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 9px",
  fontSize: 12,
  color: "#475569",
  background: "#F8FAFC",
  borderBottom: "1px solid #E5E7EB",
  whiteSpace: "nowrap",
};

const thRight: React.CSSProperties = {
  ...th,
  textAlign: "right",
};

const td: React.CSSProperties = {
  padding: "8px 9px",
  fontSize: 12,
  borderBottom: "1px solid #F1F5F9",
  verticalAlign: "middle",
};

const tdStrong: React.CSSProperties = {
  ...td,
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const tdRight: React.CSSProperties = {
  ...td,
  textAlign: "right",
  whiteSpace: "nowrap",
};

const tfootCell: React.CSSProperties = {
  padding: "10px 9px",
  fontSize: 13,
  borderTop: "2px solid #E5E7EB",
  background: "#F8FAFC",
  fontWeight: 900,
  textAlign: "right",
};

const tfootRight: React.CSSProperties = {
  ...tfootCell,
  textAlign: "right",
};

const badgeNeutral: React.CSSProperties = {
  display: "inline-flex",
  border: "1px solid #CBD5E1",
  background: "#F8FAFC",
  color: "#475569",
  borderRadius: 999,
  padding: "4px 9px",
  fontSize: 11,
  fontWeight: 900,
};

const badgeOk: React.CSSProperties = {
  ...badgeNeutral,
  border: "1px solid #BBF7D0",
  background: "#F0FDF4",
  color: "#15803D",
};

const badgeDanger: React.CSSProperties = {
  ...badgeNeutral,
  border: "1px solid #FECACA",
  background: "#FEF2F2",
  color: "#B91C1C",
};