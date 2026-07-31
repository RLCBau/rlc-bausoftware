import { rlcClass } from "../../ui/rlcRuntimeStyle";import React from "react";
import { ProjekteDB } from "./store";
import { Projekt, ID } from "./types";

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  borderBottom: "1px solid var(--line)",
  fontSize: 13,
  whiteSpace: "nowrap"
};

const td: React.CSSProperties = {
  padding: "6px 10px",
  borderBottom: "1px solid var(--line)",
  fontSize: 13,
  verticalAlign: "middle"
};

const lbl: React.CSSProperties = {
  fontSize: 13,
  opacity: 0.8
};

const inpB: React.CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: 6,
  padding: "6px 8px",
  fontSize: 13
};

const inpN: React.CSSProperties = {
  ...inpB,
  width: 220
};

const inpS: React.CSSProperties = {
  ...inpB,
  width: 150
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
      updatedAt: now
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
        updatedAt: new Date().toISOString()
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
    <div className="card rlc-migrated-pages-buro-projekte-tsx-610">
      <div className="rlc-migrated-pages-buro-projekte-tsx-611">







        
        <button className="btn" onClick={add}>
          + Projekt
        </button>
        <button className="btn" onClick={dup} disabled={!selected}>
          Duplizieren
        </button>
        <button className="btn" onClick={del} disabled={!selected}>
          Löschen
        </button>

        <div className="rlc-migrated-pages-buro-projekte-tsx-612" />

        <input
          placeholder="Suchen…"
          value={q}
          onChange={(e) => setQ(e.target.value)} className={rlcClass(null,
          { ...inpN, width: 260 })} />
        

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as "alle" | "aktiv" | "archiv")} className={rlcClass(null,
          inpS)}>
          
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

      <div className="rlc-migrated-pages-buro-projekte-tsx-613">






        
        <div className="card rlc-migrated-pages-buro-projekte-tsx-614">
          <table className="rlc-migrated-pages-buro-projekte-tsx-615">
            <thead>
              <tr>
                <th className={rlcClass(null, th)}>Name</th>
                <th className={rlcClass(null, th)}>Baustellen-Nr.</th>
                <th className={rlcClass(null, th)}>Ort</th>
                <th className={rlcClass(null, th)}>Bauleiter</th>
                <th className={rlcClass(null, th)}>Status</th>
                <th className={rlcClass(null, th)}>Erstellt</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ?
              <tr>
                  <td className={rlcClass(null, { ...td, opacity: 0.7 })} colSpan={6}>
                    Keine Projekte gefunden.
                  </td>
                </tr> :

              filtered.map((p) =>
              <tr
                key={p.id}
                onClick={() => setSel(p.id)} className={rlcClass(null,
                {
                  cursor: "pointer",
                  background: p.id === sel ? "#f1f5ff" : undefined
                })}>
                
                    <td className={rlcClass(null, td)}>{p.name}</td>
                    <td className={rlcClass(null, td)}>{p.baustellenNummer || "—"}</td>
                    <td className={rlcClass(null, td)}>{p.ort || "—"}</td>
                    <td className={rlcClass(null, td)}>{p.bauleiter || "—"}</td>
                    <td className={rlcClass(null, { ...td, fontWeight: 600 })}>{p.status}</td>
                    <td className={rlcClass(null, td)}>{formatDate(p.createdAt)}</td>
                  </tr>
              )
              }
            </tbody>
          </table>
        </div>

        <div className="card rlc-migrated-pages-buro-projekte-tsx-616">
          {!selected ?
          <div className="rlc-migrated-pages-buro-projekte-tsx-617">
              Wähle links ein Projekt aus oder erstelle ein neues.
            </div> :

          <div className="rlc-migrated-pages-buro-projekte-tsx-618">






            
              <label className={rlcClass(null, lbl)}>Name</label>
              <input className={rlcClass(null,
            { ...inpB, width: "100%" })}
            value={selected.name}
            onChange={(e) => update({ name: e.target.value })} />
            

              <label className={rlcClass(null, lbl)}>Baustellen-Nr.</label>
              <input className={rlcClass(null,
            inpS)}
            value={selected.baustellenNummer ?? ""}
            onChange={(e) => update({ baustellenNummer: e.target.value })} />
            

              <label className={rlcClass(null, lbl)}>Ort</label>
              <input className={rlcClass(null,
            inpS)}
            value={selected.ort ?? ""}
            onChange={(e) => update({ ort: e.target.value })} />
            

              <label className={rlcClass(null, lbl)}>Bauleiter</label>
              <input className={rlcClass(null,
            inpS)}
            value={selected.bauleiter ?? ""}
            onChange={(e) => update({ bauleiter: e.target.value })} />
            

              <label className={rlcClass(null, lbl)}>Status</label>
              <select className={rlcClass(null,
            inpS)}
            value={selected.status}
            onChange={(e) =>
            update({ status: e.target.value as Projekt["status"] })
            }>
              
                <option value="aktiv">Aktiv</option>
                <option value="archiv">Archiv</option>
              </select>

              <label className={rlcClass(null, lbl)}>Erstellt</label>
              <div>{formatDateTime(selected.createdAt)}</div>

              <label className={rlcClass(null, lbl)}>Geändert</label>
              <div>{formatDateTime(selected.updatedAt)}</div>
            </div>
          }
        </div>
      </div>
    </div>);

}
