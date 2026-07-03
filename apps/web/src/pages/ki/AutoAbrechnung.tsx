// apps/web/src/pages/ki/AbrechnungAuto.tsx

import React from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { useProject } from "../../store/useProject";

/* ======================= Types ======================= */

type LVItem = {
  id: string;
  projectId?: string;
  posNr?: string;
  kurztext: string;
  einheit?: string;
  menge?: number | null;
  preis?: number | null;
  quelle?: string;
  createdAt: number;
};

type Abschlag = {
  id?: string;
  projectId: string;
  nr: number;
  datum: string;
  betrag: number;
};

type BuchhaltungSaveBody = {
  projectId: string;
  summeNetto: number;
  summeBrutto: number;
  quelle: string;
};

type ApiList<T> = { items: T[] };
type ApiLV = { projectId: string; items: LVItem[] };

type ProjectLike = {
  id?: string;
  code?: string;
};

/* ======================= Styles ======================= */

const card: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: 16,
  background: "#fff",
};

const tbl: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const th: React.CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid #e5e7eb",
  background: "#f7f7f7",
  textAlign: "left",
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "6px 10px",
  borderBottom: "1px solid #eee",
  verticalAlign: "top",
  fontSize: 13,
};

const inp: React.CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 14,
};

const shell: React.CSSProperties = {
  display: "grid",
  gap: 16,
  padding: 16,
};

/* ======================= Utils ======================= */

const num = (v?: number | null, d = 2) =>
  v == null || !Number.isFinite(v)
    ? ""
    : Number(v).toLocaleString("de-DE", {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
      });

function toNumber(v: unknown, fallback = 0): number {
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string"
      ? Number(v.replace(",", "."))
      : Number(v);

  return Number.isFinite(n) ? n : fallback;
}

function normalizeLvItem(item: unknown): LVItem {
  const x = (item ?? {}) as Partial<LVItem>;
  return {
    id: String(x.id ?? crypto.randomUUID()),
    projectId: x.projectId ? String(x.projectId) : undefined,
    posNr: x.posNr ? String(x.posNr) : undefined,
    kurztext: String(x.kurztext ?? ""),
    einheit: x.einheit ? String(x.einheit) : undefined,
    menge: x.menge == null ? null : toNumber(x.menge, 0),
    preis: x.preis == null ? null : toNumber(x.preis, 0),
    quelle: x.quelle ? String(x.quelle) : undefined,
    createdAt: Number(x.createdAt ?? Date.now()),
  };
}

function normalizeAbschlag(item: unknown): Abschlag {
  const x = (item ?? {}) as Partial<Abschlag>;
  return {
    id: x.id ? String(x.id) : undefined,
    projectId: String(x.projectId ?? ""),
    nr: toNumber(x.nr, 0),
    datum: String(x.datum ?? ""),
    betrag: toNumber(x.betrag, 0),
  };
}

function sortLV(a: LVItem, b: LVItem) {
  const pa = String(a.posNr || "").padStart(10, "0");
  const pb = String(b.posNr || "").padStart(10, "0");
  return pa.localeCompare(pb);
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers || {});
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url, {
    ...init,
    headers,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

/* ======================= Component ======================= */

export default function AbrechnungAuto() {
  const projectCtx = useProject() as unknown as {
    currentProject?: ProjectLike | null;
  };

  const currentProject = projectCtx?.currentProject ?? null;
  const storeProjectId = currentProject?.id ?? "";
  const projectCode = currentProject?.code ?? "";

  const [projectIdInput, setProjectIdInput] = React.useState<string>("");
  const [lv, setLV] = React.useState<LVItem[]>([]);
  const [abschlaege, setAbschlaege] = React.useState<Abschlag[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [filterText, setFilterText] = React.useState("");
  const [mwst, setMwst] = React.useState(19);
  const [aufschlag, setAufschlag] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);

  const effectiveProjectId =
    projectIdInput.trim() || storeProjectId || projectCode || "";

  const canLoad = !!effectiveProjectId && !loading;

  const lvFiltered = React.useMemo(() => {
    if (!filterText.trim()) return lv;
    const s = filterText.toLowerCase();

    return lv.filter((it) => {
      return (
        String(it.posNr || "").toLowerCase().includes(s) ||
        String(it.kurztext || "").toLowerCase().includes(s) ||
        String(it.quelle || "").toLowerCase().includes(s)
      );
    });
  }, [lv, filterText]);

  const sollNetto = React.useMemo(() => {
    let sum = 0;

    for (const r of lv) {
      const preis = toNumber(r.preis, 0);
      const menge = r.menge != null ? toNumber(r.menge, 0) : null;
      sum += menge != null ? menge * preis : preis;
    }

    return sum * (1 + toNumber(aufschlag, 0) / 100);
  }, [lv, aufschlag]);

  const istNetto = React.useMemo(() => {
    return abschlaege.reduce((s, a) => s + toNumber(a.betrag, 0), 0);
  }, [abschlaege]);

  const diffNetto = istNetto - sollNetto;
  const mwstSoll = sollNetto * (toNumber(mwst, 0) / 100);
  const mwstIst = istNetto * (toNumber(mwst, 0) / 100);
  const sollBrutto = sollNetto + mwstSoll;
  const istBrutto = istNetto + mwstIst;
  const deckungsgrad =
    sollNetto > 0 ? Math.round((istNetto / sollNetto) * 100) : 0;

  /* ----------------------- Loaders ----------------------- */

  async function loadLV() {
    if (!effectiveProjectId) {
      setError("Bitte Projekt auswählen oder Projekt-ID eingeben.");
      return;
    }

    const res = await api<ApiLV>(
      `/api/lv/by-project/${encodeURIComponent(effectiveProjectId)}`
    );

    setLV(
      Array.isArray(res.items)
        ? res.items.map(normalizeLvItem).slice().sort(sortLV)
        : []
    );
  }

  async function loadAbschlaege() {
    if (!effectiveProjectId) {
      setError("Bitte Projekt auswählen oder Projekt-ID eingeben.");
      return;
    }

    const res = await api<ApiList<Abschlag>>(
      `/api/abrechnung/by-project/${encodeURIComponent(effectiveProjectId)}`
    );

    setAbschlaege(
      Array.isArray(res.items)
        ? res.items.map(normalizeAbschlag).slice().sort((a, b) => a.nr - b.nr)
        : []
    );
  }

  async function loadAll() {
    if (!effectiveProjectId) {
      setError("Bitte Projekt auswählen oder Projekt-ID eingeben.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [lvRes, abschlagRes] = await Promise.all([
        api<ApiLV>(`/api/lv/by-project/${encodeURIComponent(effectiveProjectId)}`),
        api<ApiList<Abschlag>>(
          `/api/abrechnung/by-project/${encodeURIComponent(effectiveProjectId)}`
        ),
      ]);

      setLV(
        Array.isArray(lvRes.items)
          ? lvRes.items.map(normalizeLvItem).slice().sort(sortLV)
          : []
      );

      setAbschlaege(
        Array.isArray(abschlagRes.items)
          ? abschlagRes.items
              .map(normalizeAbschlag)
              .slice()
              .sort((a, b) => a.nr - b.nr)
          : []
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }

  /* ----------------------- Abschlag CRUD ----------------------- */

  async function addAbschlag() {
    if (!effectiveProjectId) {
      setError("Projekt-ID fehlt");
      return;
    }

    const betragStr = window.prompt("Betrag (netto):");
    if (!betragStr) return;

    const betrag = toNumber(betragStr, Number.NaN);
    if (!Number.isFinite(betrag) || betrag <= 0) {
      window.alert("Ungültiger Betrag.");
      return;
    }

    try {
      setError(null);

      const res = await api<{ ok: boolean; item: Abschlag }>(
        `/api/abrechnung/save`,
        {
          method: "POST",
          body: JSON.stringify({
            projectId: effectiveProjectId,
            betrag,
          }),
        }
      );

      setAbschlaege((prev) =>
        [...prev, normalizeAbschlag(res.item)].sort((a, b) => a.nr - b.nr)
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Abschlag konnte nicht gespeichert werden."
      );
    }
  }

  async function delAbschlag(a: Abschlag) {
    if (!a.id) return;
    if (!window.confirm(`Abschlag Nr. ${a.nr} löschen?`)) return;

    try {
      setError(null);
      await api<unknown>(`/api/abrechnung/${a.id}`, { method: "DELETE" });
      setAbschlaege((prev) => prev.filter((x) => x.id !== a.id));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Abschlag konnte nicht gelöscht werden."
      );
    }
  }

  /* ----------------------- Export CSV ----------------------- */

  function exportCSV() {
    if (!effectiveProjectId) {
      setError("Projekt-ID fehlt");
      return;
    }

    if (!lv.length && !abschlaege.length) {
      window.alert("Nichts zu exportieren.");
      return;
    }

    const head = [
      "ProjektID",
      "Typ",
      "PosNr",
      "Kurztext",
      "Einheit",
      "Menge",
      "EP",
      "Quelle",
      "Datum/Erstellt",
      "BetragNetto",
    ];

    const rows: (string | number)[][] = [];

    for (const r of lv) {
      rows.push([
        effectiveProjectId,
        "LV",
        r.posNr || "",
        r.kurztext || "",
        r.einheit || "",
        r.menge ?? "",
        r.preis ?? "",
        r.quelle || "",
        new Date(r.createdAt).toLocaleDateString("de-DE"),
        "",
      ]);
    }

    for (const a of abschlaege) {
      rows.push([
        effectiveProjectId,
        "Abschlag",
        "",
        "",
        "",
        "",
        "",
        "",
        a.datum,
        a.betrag,
      ]);
    }

    const csv = [
      head.join(";"),
      ...rows.map((r) =>
        r.map((v) => String(v ?? "").replace(/;/g, ",")).join(";")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Abrechnung_${effectiveProjectId}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  /* ----------------------- Export PDF + Buchhaltung ----------------------- */

  async function exportPDF(andSendToBuchhaltung = true) {
    if (!effectiveProjectId) {
      setError("Projekt-ID fehlt");
      return;
    }

    if (!lv.length) {
      window.alert("Kein LV geladen.");
      return;
    }

    try {
      setError(null);

      const doc = new jsPDF({ orientation: "landscape", unit: "mm" });

      doc.setFontSize(16);
      doc.text(`Abrechnung – Projekt ${effectiveProjectId}`, 14, 16);

      const startY = 22;
      doc.setFontSize(11);
      doc.text(
        `Soll (Netto): ${num(sollNetto)} €  |  Ist (Netto): ${num(
          istNetto
        )} €  |  Δ: ${num(diffNetto)} €  |  Deckungsgrad: ${deckungsgrad}%`,
        14,
        startY
      );

      autoTable(doc, {
        startY: startY + 6,
        head: [
          [
            "Pos",
            "Kurztext",
            "Einheit",
            "Menge",
            "EP (netto)",
            "Σ Position (netto)",
            "Quelle",
            "Erstellt am",
          ],
        ],
        body: lv.map((l) => {
          const preis = toNumber(l.preis, 0);
          const menge = l.menge != null ? toNumber(l.menge, 0) : null;
          const sum =
            (menge != null ? menge * preis : preis) *
            (1 + toNumber(aufschlag, 0) / 100);

          return [
            l.posNr || "—",
            l.kurztext || "",
            l.einheit || "—",
            menge != null ? num(menge, 3) : "—",
            num(preis),
            num(sum),
            l.quelle || "—",
            new Date(l.createdAt).toLocaleDateString("de-DE"),
          ];
        }),
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [20, 20, 20], textColor: 255 },
        columnStyles: {
          3: { halign: "right" },
          4: { halign: "right" },
          5: { halign: "right" },
        },
        margin: { left: 14, right: 14 },
      });

      let y =
        ((doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable
          ?.finalY ?? startY + 6) + 8;

      doc.setFontSize(12);
      doc.text("Abschlagsrechnungen", 14, y);

      autoTable(doc, {
        startY: y + 5,
        head: [["Nr", "Datum", "Netto (€)", "Brutto (€)"]],
        body: abschlaege.map((a) => [
          a.nr,
          a.datum,
          num(a.betrag),
          num(a.betrag * (1 + toNumber(mwst, 0) / 100)),
        ]),
        styles: { fontSize: 9, cellPadding: 2 },
        headStyles: { fillColor: [230, 230, 230] },
        columnStyles: {
          2: { halign: "right" },
          3: { halign: "right" },
        },
        margin: { left: 14, right: 14 },
      });

      y =
        ((doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable
          ?.finalY ?? y) + 8;

      doc.setFontSize(12);
      doc.text(`MwSt: ${mwst}%   ·   Aufschlag: ${aufschlag}%`, 14, y);
      y += 6;
      doc.text(
        `Soll Netto: ${num(sollNetto)} € | Soll Brutto: ${num(sollBrutto)} €`,
        14,
        y
      );
      y += 6;
      doc.text(
        `Ist Netto (Abschläge): ${num(istNetto)} € | Ist Brutto: ${num(
          istBrutto
        )} €`,
        14,
        y
      );
      y += 6;
      doc.text(`Differenz Netto (Ist − Soll): ${num(diffNetto)} €`, 14, y);

      doc.save(`Abrechnung_${effectiveProjectId}.pdf`);

      if (andSendToBuchhaltung) {
        const body: BuchhaltungSaveBody = {
          projectId: effectiveProjectId,
          summeNetto: istNetto,
          summeBrutto: istBrutto,
          quelle: "Abrechnung (Ist/Aggregat)",
        };

        try {
          await api<unknown>(`/api/buchhaltung/save`, {
            method: "POST",
            body: JSON.stringify(body),
          });
          window.alert("PDF exportiert und in Buchhaltung gespeichert ✅");
        } catch (e) {
          window.alert(
            "PDF ok, aber Buchhaltung-Transfer fehlgeschlagen: " +
              (e instanceof Error ? e.message : String(e))
          );
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF-Export fehlgeschlagen");
    }
  }

  /* ----------------------- Render ----------------------- */

  return (
    <div style={shell}>
      <h1>Abrechnung – Automatik & Soll-Ist-Vergleich</h1>

      <div style={card}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto auto auto auto",
            gap: 12,
            alignItems: "center",
          }}
        >
          <input
            placeholder="Projekt-ID oder Projektcode"
            value={projectIdInput}
            onChange={(e) => setProjectIdInput(e.target.value)}
            style={inp}
          />

          <button
            className="btn"
            onClick={() => void loadLV()}
            disabled={!canLoad}
          >
            LV laden
          </button>

          <button
            className="btn"
            onClick={() => void loadAbschlaege()}
            disabled={!canLoad}
          >
            Abschläge laden
          </button>

          <button
            className="btn"
            onClick={() => void loadAll()}
            disabled={!canLoad}
          >
            {loading ? "Lädt..." : "Alles laden"}
          </button>

          <button
            className="btn"
            onClick={() => void addAbschlag()}
            disabled={!effectiveProjectId}
          >
            + Abschlag
          </button>
        </div>

        <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
          Aktiv: {effectiveProjectId || "kein Projekt gewählt"}
        </div>

        {error && (
          <div style={{ marginTop: 10, color: "#b91c1c", fontSize: 13 }}>
            {error}
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6, 1fr)",
            gap: 12,
            marginTop: 12,
          }}
        >
          <Kpi title="LV-Positionen">{lv.length}</Kpi>
          <Kpi title="Abschläge">{abschlaege.length}</Kpi>
          <Kpi title="Soll Netto (€)">
            <b>{num(sollNetto)}</b>
          </Kpi>
          <Kpi title="Ist Netto (€)">
            <b>{num(istNetto)}</b>
          </Kpi>
          <Kpi title="Δ Netto (Ist−Soll)">
            <span style={{ color: diffNetto >= 0 ? "#065f46" : "#991b1b" }}>
              {num(diffNetto)}
            </span>
          </Kpi>
          <Kpi title="Deckungsgrad">{deckungsgrad}%</Kpi>
        </div>

        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            marginTop: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "#6b7280" }}>MwSt</span>
            <input
              type="number"
              value={mwst}
              onChange={(e) => setMwst(toNumber(e.target.value, 0))}
              style={{ ...inp, width: 90 }}
            />
            %
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "#6b7280" }}>Aufschlag</span>
            <input
              type="number"
              value={aufschlag}
              onChange={(e) => setAufschlag(toNumber(e.target.value, 0))}
              style={{ ...inp, width: 90 }}
            />
            %
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <input
              placeholder="Filter (Pos/Kurztext/Quelle)"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              style={{ ...inp, minWidth: 240 }}
            />

            <button
              className="btn"
              onClick={() => void exportPDF(true)}
              disabled={!lv.length}
            >
              PDF & → Buchhaltung
            </button>

            <button
              className="btn"
              onClick={exportCSV}
              disabled={!lv.length && !abschlaege.length}
            >
              CSV Export
            </button>
          </div>
        </div>
      </div>

      {!!lvFiltered.length && (
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>
            LV-Positionen (gefiltert: {lvFiltered.length}/{lv.length})
          </h3>

          <table style={tbl}>
            <thead>
              <tr>
                <th style={th}>Pos</th>
                <th style={th}>Kurztext</th>
                <th style={th}>Einheit</th>
                <th style={th}>Menge</th>
                <th style={th}>EP (netto)</th>
                <th style={th}>Σ Position (netto)</th>
                <th style={th}>Quelle</th>
                <th style={th}>Erstellt am</th>
              </tr>
            </thead>
            <tbody>
              {lvFiltered.map((l) => {
                const preis = toNumber(l.preis, 0);
                const menge = l.menge != null ? toNumber(l.menge, 0) : null;
                const sum =
                  (menge != null ? menge * preis : preis) *
                  (1 + toNumber(aufschlag, 0) / 100);

                return (
                  <tr key={l.id}>
                    <td style={td}>{l.posNr || "—"}</td>
                    <td style={td}>{l.kurztext}</td>
                    <td style={td}>{l.einheit || "—"}</td>
                    <td style={{ ...td, textAlign: "right" }}>
                      {menge != null ? num(menge, 3) : "—"}
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>{num(preis)}</td>
                    <td style={{ ...td, textAlign: "right" }}>{num(sum)}</td>
                    <td style={td}>{l.quelle || "—"}</td>
                    <td style={td}>
                      {new Date(l.createdAt).toLocaleDateString("de-DE")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!!abschlaege.length && (
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Abschlagsrechnungen</h3>

          <table style={tbl}>
            <thead>
              <tr>
                <th style={th}>Nr</th>
                <th style={th}>Datum</th>
                <th style={{ ...th, textAlign: "right" }}>Netto (€)</th>
                <th style={{ ...th, textAlign: "right" }}>Brutto (€)</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {abschlaege.map((a) => (
                <tr key={a.id || `a-${a.nr}-${a.datum}`}>
                  <td style={td}>{a.nr}</td>
                  <td style={td}>{a.datum}</td>
                  <td style={{ ...td, textAlign: "right" }}>{num(a.betrag)}</td>
                  <td style={{ ...td, textAlign: "right" }}>
                    {num(a.betrag * (1 + toNumber(mwst, 0) / 100))}
                  </td>
                  <td style={td}>
                    <button className="btn" onClick={() => void delAbschlag(a)}>
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: 8, fontWeight: 600 }}>
            Ist Netto: {num(istNetto)} € · Ist Brutto: {num(istBrutto)} €
          </div>
        </div>
      )}

      <div style={card}>
        <h3 style={{ marginTop: 0 }}>Vergleich – Soll vs. Ist</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 12,
          }}
        >
          <Box label="Soll Netto" value={`${num(sollNetto)} €`} />
          <Box label="Ist Netto" value={`${num(istNetto)} €`} />
          <Box
            label="Differenz Netto (Ist−Soll)"
            value={`${num(diffNetto)} €`}
            color={diffNetto >= 0 ? "#065f46" : "#991b1b"}
          />
          <Box label="Deckungsgrad" value={`${deckungsgrad}%`} />
        </div>
      </div>
    </div>
  );
}

/* ======================= Small UI ======================= */

function Kpi({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px dashed #d1d5db",
        borderRadius: 10,
        padding: "10px 12px",
        background: "#fafafa",
      }}
    >
      <div style={{ fontSize: 12, color: "#6b7280" }}>{title}</div>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{children}</div>
    </div>
  );
}

function Box({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 12, color: "#6b7280" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: color || "inherit" }}>
        {value}
      </div>
    </div>
  );
}





