// apps/web/src/pages/mengenermittlung/Raumbuch.tsx
import React, { useMemo, useState } from "react";
import { evaluateExpression } from "../../lib/formulas";
import { AufmassZeile, MengeVariablen } from "../../lib/types";

const shell: React.CSSProperties = {
  maxWidth: 1260,
  margin: "0 auto",
  padding: "12px 16px 40px",
  fontFamily: "Inter, system-ui, Arial, Helvetica, sans-serif",
  color: "#0f172a",
};

const layout: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "320px 1fr",
  gap: 12,
};

const panel: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  overflow: "hidden",
  background: "#fff",
};

const left: React.CSSProperties = {
  ...panel,
  padding: 10,
};

const right: React.CSSProperties = {
  ...panel,
  padding: 10,
};

const listItem: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 6,
  cursor: "pointer",
};

const selected: React.CSSProperties = {
  background: "#f1f5f9",
  fontWeight: 600,
};

const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
};

const thtd: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  padding: "6px 8px",
  verticalAlign: "middle",
};

const head: React.CSSProperties = {
  ...thtd,
  background: "#f8fafc",
  fontWeight: 600,
  textAlign: "left",
  position: "sticky",
  top: 0,
  zIndex: 1,
};

const numberInput: React.CSSProperties = {
  width: "80px",
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  padding: "4px 6px",
  textAlign: "right",
};

type Raum = {
  id: string;
  name: string;
  gebaeude: string;
  geschoss: string;
  flaeche: number;
  umfang: number;
  pos: AufmassZeile[];
};

function rid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 9);
}

const mkPos = (
  posNr: string,
  kurztext: string,
  einheit: string,
  ep: number,
  vars: MengeVariablen,
  formel: string
): AufmassZeile => ({
  id: rid(),
  posNr,
  kurztext,
  einheit,
  ep,
  variablen: vars,
  formel,
  menge: 0,
  betrag: 0,
});

const DEMO_RAEUME: Raum[] = [
  {
    id: "R-001",
    name: "01.01 Flur",
    gebaeude: "Haus A",
    geschoss: "EG",
    flaeche: 28.3,
    umfang: 21.2,
    pos: [
      mkPos("010.001", "Fliesen 30x30", "m²", 41.2, { L: 5.2, B: 5.44 }, "=L*B"),
      mkPos("010.002", "Sockelleiste", "m", 9.8, { L: 21.2 }, "=L"),
    ],
  },
  {
    id: "R-002",
    name: "01.02 Technik",
    gebaeude: "Haus A",
    geschoss: "EG",
    flaeche: 12.1,
    umfang: 14.3,
    pos: [
      mkPos("020.001", "Estrich", "m²", 22.7, { L: 4.4, B: 2.75 }, "=L*B"),
      mkPos("020.002", "Bodenbeschichtung", "m²", 11.5, { L: 4.4, B: 2.75 }, "=L*B"),
    ],
  },
];

const fmt = (n: number) =>
  new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);

function parseNumber(value: string): number {
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function safeEval(formel: string, variablen: MengeVariablen): number {
  try {
    const out = evaluateExpression(formel, variablen as any);
    return Number.isFinite(out) ? out : 0;
  } catch {
    return 0;
  }
}

export default function Raumbuch() {
  const [rooms, setRooms] = useState<Raum[]>(DEMO_RAEUME);
  const [activeId, setActiveId] = useState<string>(DEMO_RAEUME[0]?.id || "");

  const room = useMemo(() => {
    return rooms.find((r) => r.id === activeId) || rooms[0] || null;
  }, [rooms, activeId]);

  const updateVar = (posId: string, key: keyof MengeVariablen, value: string) => {
    setRooms((prev) =>
      prev.map((r) =>
        r.id !== activeId
          ? r
          : {
              ...r,
              pos: r.pos.map((p) =>
                p.id !== posId
                  ? p
                  : {
                      ...p,
                      variablen: {
                        ...(p.variablen || {}),
                        [key]: parseNumber(value),
                      },
                    }
              ),
            }
      )
    );
  };

  const calc = useMemo(() => {
    if (!room) return { pos: [] as AufmassZeile[], sum: 0 };

    const pos = room.pos.map((z) => {
      const menge = safeEval(z.formel || "", (z.variablen || {}) as MengeVariablen);
      const ep = Number.isFinite(z.ep) ? z.ep : 0;
      const betrag = menge * ep;
      return { ...z, menge, betrag };
    });

    return {
      pos,
      sum: pos.reduce((acc, row) => acc + (Number(row.betrag) || 0), 0),
    };
  }, [room]);

  if (!room) {
    return (
      <div style={shell}>
        <h2 style={{ margin: "4px 0 12px", fontSize: 20, fontWeight: 700 }}>
          Raumbuch / Raumaufmaße
        </h2>
        <div style={{ color: "#64748b" }}>Keine Räume vorhanden.</div>
      </div>
    );
  }

  return (
    <div style={shell}>
      <h2 style={{ margin: "4px 0 12px", fontSize: 20, fontWeight: 700 }}>
        Raumbuch / Raumaufmaße
      </h2>

      <div style={layout}>
        <div style={left}>
          <div style={{ fontSize: 12, color: "#334155", marginBottom: 8 }}>Räume</div>

          {rooms.map((r) => (
            <div
              key={r.id}
              style={{ ...listItem, ...(r.id === room.id ? selected : {}) }}
              onClick={() => setActiveId(r.id)}
            >
              <div style={{ fontWeight: 600 }}>{r.name}</div>
              <div style={{ fontSize: 12, color: "#64748b" }}>
                {r.gebaeude} · {r.geschoss} · {fmt(r.flaeche)} m²
              </div>
            </div>
          ))}
        </div>

        <div style={right}>
          <div style={{ marginBottom: 8, color: "#334155" }}>
            <b>{room.name}</b> · {room.gebaeude} / {room.geschoss} – Fläche {fmt(room.flaeche)} m²,
            Umfang {fmt(room.umfang)} m
          </div>

          <div style={{ overflow: "auto", border: "1px solid #e2e8f0", borderRadius: 8 }}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={head}>Pos-Nr</th>
                  <th style={head}>Kurztext</th>
                  <th style={head}>ME</th>
                  <th style={head}>EP</th>
                  <th style={head}>L</th>
                  <th style={head}>B</th>
                  <th style={head}>H</th>
                  <th style={head}>Formel</th>
                  <th style={head}>Menge</th>
                  <th style={head}>Betrag</th>
                </tr>
              </thead>

              <tbody>
                {calc.pos.map((p) => (
                  <tr key={p.id}>
                    <td style={thtd}>{p.posNr}</td>
                    <td style={thtd}>{p.kurztext}</td>
                    <td style={thtd}>{p.einheit}</td>
                    <td style={thtd}>{fmt(Number(p.ep) || 0)}</td>

                    <td style={thtd}>
                      <input
                        style={numberInput}
                        value={p.variablen?.L ?? ""}
                        onChange={(e) => updateVar(p.id, "L", e.target.value)}
                      />
                    </td>

                    <td style={thtd}>
                      <input
                        style={numberInput}
                        value={p.variablen?.B ?? ""}
                        onChange={(e) => updateVar(p.id, "B", e.target.value)}
                      />
                    </td>

                    <td style={thtd}>
                      <input
                        style={numberInput}
                        value={p.variablen?.H ?? ""}
                        onChange={(e) => updateVar(p.id, "H", e.target.value)}
                      />
                    </td>

                    <td style={thtd}>{p.formel}</td>
                    <td style={thtd}>{fmt(Number(p.menge) || 0)}</td>
                    <td style={thtd}>{fmt(Number(p.betrag) || 0)}</td>
                  </tr>
                ))}

                <tr>
                  <td colSpan={9} style={{ ...thtd, textAlign: "right" }}>
                    <b>Zwischensumme</b>
                  </td>
                  <td style={thtd}>
                    <b>{fmt(calc.sum)}</b>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}





