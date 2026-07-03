import React from "react";
import { ProjekteDB } from "./store";
import { Projekt, ID } from "./types";

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  borderBottom: "1px solid var(--line)",
  fontSize: 13,
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "6px 10px",
  borderBottom: "1px solid var(--line)",
  fontSize: 13,
  verticalAlign: "middle",
};

const lbl: React.CSSProperties = {
  fontSize: 13,
  opacity: 0.8,
};

const inpB: React.CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: 6,
  padding: "6px 8px",
  fontSize: 13,
};

const inpN: React.CSSProperties = {
  ...inpB,
  width: 220,
};

const inpS: React.CSSProperties = {
  ...inpB,
  width: 150,
};

function toDateValue(value: string | number | undefined | null): Date | null {
  if (value == null || value === "") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDate(value: string | number | undefined | null): string {
  const d = toDateValue(value);
  return d ? d.toLocaleDateString() : "—";
}

function formatDateTime(value: string | number | undefined | null): string {
  const d = toDateValue(value);
  return d ? d.toLocaleString() : "—";
}

export default function Projekte() {
  const [all, setAll] = React.useState<Projekt[]>(ProjekteDB.list());
  const [sel, setSel] = React.useState<ID | null>(ProjekteDB.list()[0]?.id ?? null);
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState<"alle" | "aktiv" | "archiv">("alle");

  const refresh = React.useCallback(() => {
    const next = ProjekteDB.list();
    setAll(next);
    setSel((prev) => {
      if (prev && next.some((p) => p.id === prev)) return prev;
      return next[0]?.id ?? null;
    });
  }, []);

  const selected = React.useMemo(
    () => all.find((p) => p.id === sel) ?? null,
    [all, sel]
  );

  const add = React.useCallback(() => {
    const p = ProjekteDB.create();
    refresh();
    setSel(p.id);
  }, [refresh]);

  const dup = React.useCallback(() => {
    if (!selected) return;
    const now = new Date().toISOString();
    const copy: Projekt = {
      ...selected,
      id: crypto.randomUUID(),
      name: `${selected.name} (Kopie)`,
      createdAt: now,
      updatedAt: now,
    };
    ProjekteDB.upsert(copy);
    refresh();
    setSel(copy.id);
  }, [selected, refresh]);

  const del = React.useCallback(() => {
    if (!selected) return;
    if (!window.confirm("Projekt löschen?")) return;
    ProjekteDB.remove(selected.id);
    refresh();
  }, [selected, refresh]);

  const update = React.useCallback(
    (patch: Partial<Projekt>) => {
      if (!selected) return;
      const next: Projekt = {
        ...selected,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      ProjekteDB.upsert(next);
      setSel(next.id);
      refresh();
    },
    [selected, refresh]
  );

  const filtered = React.useMemo(() => {
    const qq = q.trim().toLowerCase();

    return all.filter((p) => {
      const s =
        `${p.name} ${p.baustellenNummer ?? ""} ${p.ort ?? ""} ${p.bauleiter ?? ""}`.toLowerCase();
      const okQ = !qq || s.includes(qq);
      const okS = status === "alle" ? true : p.status === status;
      return okQ && okS;
    });
  }, [all, q, status]);

  const exportCSV = React.useCallback(() => {
    const csv = ProjekteDB.exportCSV(filtered);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "projekte.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }, [filtered]);

  const importCSV = React.useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,text/csv";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      const txt = await f.text();
      const n = ProjekteDB.importCSV(txt);
      window.alert(`${n} Projekte importiert.`);
      refresh();
    };
    input.click();
  }, [refresh]);

  return (
    <div className="card" style={{ padding: 0 }}>
      <div
        style={{
          display: "flex",
          gap: 8,
          padding: "8px 10px",
          borderBottom: "1px solid var(--line)",
          flexWrap: "wrap",
        }}
      >
        <button className="btn" onClick={add}>
          + Projekt
        </button>
        <button className="btn" onClick={dup} disabled={!selected}>
          Duplizieren
        </button>
        <button className="btn" onClick={del} disabled={!selected}>
          Löschen
        </button>

        <div style={{ flex: 1 }} />

        <input
          placeholder="Suchen…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ ...inpN, width: 260 }}
        />

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as "alle" | "aktiv" | "archiv")}
          style={inpS}
        >
          <option value="alle">Alle</option>
          <option value="aktiv">Aktiv</option>
          <option value="archiv">Archiv</option>
        </select>

        <button className="btn" onClick={importCSV}>
          Import CSV
        </button>
        <button className="btn" onClick={exportCSV}>
          Export CSV
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateRows: "minmax(220px, 44vh) auto",
          gap: 10,
          padding: 10,
        }}
      >
        <div className="card" style={{ padding: 0, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Baustellen-Nr.</th>
                <th style={th}>Ort</th>
                <th style={th}>Bauleiter</th>
                <th style={th}>Status</th>
                <th style={th}>Erstellt</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td style={{ ...td, opacity: 0.7 }} colSpan={6}>
                    Keine Projekte gefunden.
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => setSel(p.id)}
                    style={{
                      cursor: "pointer",
                      background: p.id === sel ? "#f1f5ff" : undefined,
                    }}
                  >
                    <td style={td}>{p.name}</td>
                    <td style={td}>{p.baustellenNummer || "—"}</td>
                    <td style={td}>{p.ort || "—"}</td>
                    <td style={td}>{p.bauleiter || "—"}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{p.status}</td>
                    <td style={td}>{formatDate(p.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="card" style={{ padding: 12 }}>
          {!selected ? (
            <div style={{ opacity: 0.7 }}>
              Wähle links ein Projekt aus oder erstelle ein neues.
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "150px 1fr 150px 1fr",
                gap: 10,
                alignItems: "start",
              }}
            >
              <label style={lbl}>Name</label>
              <input
                style={{ ...inpB, width: "100%" }}
                value={selected.name}
                onChange={(e) => update({ name: e.target.value })}
              />

              <label style={lbl}>Baustellen-Nr.</label>
              <input
                style={inpS}
                value={selected.baustellenNummer ?? ""}
                onChange={(e) => update({ baustellenNummer: e.target.value })}
              />

              <label style={lbl}>Ort</label>
              <input
                style={inpS}
                value={selected.ort ?? ""}
                onChange={(e) => update({ ort: e.target.value })}
              />

              <label style={lbl}>Bauleiter</label>
              <input
                style={inpS}
                value={selected.bauleiter ?? ""}
                onChange={(e) => update({ bauleiter: e.target.value })}
              />

              <label style={lbl}>Status</label>
              <select
                style={inpS}
                value={selected.status}
                onChange={(e) =>
                  update({ status: e.target.value as Projekt["status"] })
                }
              >
                <option value="aktiv">Aktiv</option>
                <option value="archiv">Archiv</option>
              </select>

              <label style={lbl}>Erstellt</label>
              <div>{formatDateTime(selected.createdAt)}</div>

              <label style={lbl}>Geändert</label>
              <div>{formatDateTime(selected.updatedAt)}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}





