import { rlcClass } from "../../ui/rlcRuntimeStyle";import React from "react";
import { MaterialDB } from "./store.material";
import { MaterialItem, MatMove, MatAttachment } from "./types";

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

const inp: React.CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: 6,
  padding: "6px 8px",
  fontSize: 13
};

const lbl: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.8
};

function getMoveWhen(m: MatMove): string {
  const v =
  (m as any).when ??
  (m as any).date ??
  (m as any).createdAt ??
  (m as any).timestamp ??
  "";
  return String(v || "");
}

export default function Materialverwaltung() {
  const [all, setAll] = React.useState<MaterialItem[]>(MaterialDB.list());
  const [selId, setSelId] = React.useState<string | null>(
    MaterialDB.list()[0]?.id ?? null
  );
  const [q, setQ] = React.useState("");
  const [proj, setProj] = React.useState("");
  const [onlyLow, setOnlyLow] = React.useState(false);

  const refresh = React.useCallback(() => {
    const next = MaterialDB.list();
    setAll(next);
    setSelId((prev) => {
      if (prev && next.some((x) => x.id === prev)) return prev;
      return next[0]?.id ?? null;
    });
  }, []);

  const sel = React.useMemo(
    () => all.find((x) => x.id === selId) ?? null,
    [all, selId]
  );

  const filtered = React.useMemo(() => {
    const qq = q.trim().toLowerCase();

    return all.filter((m) => {
      const s = `${m.name} ${m.code ?? ""} ${m.projectId ?? ""} ${m.location ?? ""}`.toLowerCase();
      const okQ = !qq || s.includes(qq);
      const okP = !proj || (m.projectId ?? "") === proj;
      const okL = !onlyLow || (m.stock ?? 0) <= (m.minStock ?? 0);
      return okQ && okP && okL;
    });
  }, [all, q, proj, onlyLow]);

  const projects = React.useMemo(
    () =>
    Array.from(
      new Set(all.map((m) => m.projectId).filter(Boolean))
    ) as string[],
    [all]
  );

  const add = React.useCallback(() => {
    const it = MaterialDB.create();
    refresh();
    setSelId(it.id);
  }, [refresh]);

  const del = React.useCallback(() => {
    if (!sel) return;
    if (!confirm("Artikel löschen?")) return;
    MaterialDB.remove(sel.id);
    refresh();
  }, [sel, refresh]);

  const up = React.useCallback(
    (p: Partial<MaterialItem>) => {
      if (!sel) return;
      const next: MaterialItem = { ...sel, ...p, updatedAt: Date.now() };
      MaterialDB.upsert(next);
      setSelId(next.id);
      refresh();
    },
    [sel, refresh]
  );

  const move = React.useCallback(
    (dir: "IN" | "OUT") => {
      if (!sel) return;

      const qty = Number(
        prompt(dir === "IN" ? "Eingang Menge:" : "Ausgang Menge:", "1")
      );
      if (!qty || qty <= 0) return;

      const rawMove = {
        id: crypto.randomUUID(),
        when: new Date().toISOString(),
        dir,
        qty,
        projectId: sel.projectId || "",
        note: ""
      };

      MaterialDB.addMove(sel.id, rawMove as unknown as MatMove);
      refresh();
    },
    [sel, refresh]
  );

  const onDrop = React.useCallback(
    async (ev: React.DragEvent) => {
      ev.preventDefault();
      if (!sel) return;
      const f = ev.dataTransfer.files?.[0];
      if (!f) return;
      await MaterialDB.attach(sel.id, f);
      refresh();
    },
    [sel, refresh]
  );

  const open = React.useCallback((a: MatAttachment) => {
    const w = window.open(a.dataURL, "_blank");
    if (!w) alert("Popup blockiert.");
  }, []);

  const importCSV = React.useCallback(() => {
    pickFile(async (f: File) => {
      const n = MaterialDB.importCSV(await f.text());
      alert(`Import: ${n} Artikel.`);
      refresh();
    });
  }, [refresh]);

  const exportCSV = React.useCallback(() => {
    download(
      "text/csv;charset=utf-8",
      "material.csv",
      MaterialDB.exportCSV(filtered)
    );
  }, [filtered]);

  const exportJSON = React.useCallback(() => {
    download(
      "application/json",
      "material_backup.json",
      MaterialDB.exportJSON()
    );
  }, []);

  const importJSON = React.useCallback(() => {
    pickFile(async (f: File) => {
      const n = MaterialDB.importJSON(await f.text());
      alert(`Backup importiert: ${n}.`);
      refresh();
    });
  }, [refresh]);

  const printLabel = React.useCallback(() => {
    if (!sel) return;

    const html = `
      <html>
        <body style="font-family:Inter,Arial;padding:12px">
          <div style="border:1px solid #333;padding:10px;width:280px">
            <div style="font-weight:700">${escapeHtml(sel.name || "")}</div>
            <div>${escapeHtml(sel.code || "")}</div>
            <div style="font-size:12px;opacity:.8">${escapeHtml(sel.location || "")}</div>
          </div>
          <script>window.print();</script>
        </body>
      </html>
    `;

    const w = window.open("", "_blank");
    if (!w) {
      alert("Popup blockiert.");
      return;
    }

    w.document.write(html);
    w.document.close();
  }, [sel]);

  return (
    <div className="rlc-migrated-pages-buro-materialverwaltung-tsx-559">






      
      <div
        className="card rlc-migrated-pages-buro-materialverwaltung-tsx-560">







        
        <button className="btn" onClick={add}>
          + Artikel
        </button>
        <button className="btn" onClick={del} disabled={!sel}>
          Löschen
        </button>

        <div className="rlc-migrated-pages-buro-materialverwaltung-tsx-561" />

        <input
          placeholder="Suche Name / Code / Projekt…"
          value={q}
          onChange={(e) => setQ(e.target.value)} className={rlcClass(null,
          { ...inp, width: 280 })} />
        

        <select
          value={proj}
          onChange={(e) => setProj(e.target.value)} className={rlcClass(null,
          { ...inp, width: 160 })}>
          
          <option value="">Alle Projekte</option>
          {projects.map((p) =>
          <option key={p} value={p}>
              {p}
            </option>
          )}
        </select>

        <label className="rlc-migrated-pages-buro-materialverwaltung-tsx-562">
          <input
            type="checkbox"
            checked={onlyLow}
            onChange={(e) => setOnlyLow(e.target.checked)} />
          
          <span className="rlc-migrated-pages-buro-materialverwaltung-tsx-563">nur Unterbestand</span>
        </label>

        <button className="btn" onClick={importCSV}>
          Import CSV
        </button>
        <button className="btn" onClick={exportCSV}>
          Export CSV
        </button>
        <button className="btn" onClick={importJSON}>
          Import JSON
        </button>
        <button className="btn" onClick={exportJSON}>
          Export JSON
        </button>
      </div>

      <div className="rlc-migrated-pages-buro-materialverwaltung-tsx-564">






        
        <div className="card rlc-migrated-pages-buro-materialverwaltung-tsx-565">
          <table className="rlc-migrated-pages-buro-materialverwaltung-tsx-566">
            <thead>
              <tr>
                <th className={rlcClass(null, th)}>Name</th>
                <th className={rlcClass(null, th)}>Code</th>
                <th className={rlcClass(null, th)}>Projekt</th>
                <th className={rlcClass(null, th)}>Ort</th>
                <th className={rlcClass(null, th)}>Einheit</th>
                <th className={rlcClass(null, th)}>Bestand</th>
                <th className={rlcClass(null, th)}>min</th>
                <th className={rlcClass(null, th)}>Preis Netto</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => {
                const low = (it.stock ?? 0) <= (it.minStock ?? 0);

                return (
                  <tr
                    key={it.id}
                    onClick={() => setSelId(it.id)} className={rlcClass(null,
                    {
                      cursor: "pointer",
                      background: sel?.id === it.id ? "#f1f5ff" : undefined
                    })}>
                    
                    <td className={rlcClass(null, td)}>
                      <b>{it.name}</b>
                    </td>
                    <td className={rlcClass(null, td)}>{it.code || "—"}</td>
                    <td className={rlcClass(null, td)}>{it.projectId || "—"}</td>
                    <td className={rlcClass(null, td)}>{it.location || "—"}</td>
                    <td className={rlcClass(null, td)}>{it.unit || "—"}</td>
                    <td className={rlcClass(null, { ...td, color: low ? "#c03" : undefined })}>
                      {it.stock ?? 0}
                    </td>
                    <td className={rlcClass(null, td)}>{it.minStock ?? 0}</td>
                    <td className={rlcClass(null, td)}>
                      {typeof it.priceNet === "number" ?
                      `${it.priceNet.toFixed(2)} €` :
                      "—"}
                    </td>
                  </tr>);

              })}

              {filtered.length === 0 &&
              <tr>
                  <td className={rlcClass(null, { ...td, opacity: 0.6 })} colSpan={8}>
                    Keine Artikel.
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div
          className="card rlc-migrated-pages-buro-materialverwaltung-tsx-567"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}>

          
          {!sel ?
          <div className="rlc-migrated-pages-buro-materialverwaltung-tsx-568">
              Links Artikel wählen oder neu anlegen.
            </div> :

          <div className="rlc-migrated-pages-buro-materialverwaltung-tsx-569">





            
              <label className={rlcClass(null, lbl)}>Name</label>
              <input className={rlcClass(null,
            inp)}
            value={sel.name}
            onChange={(e) => up({ name: e.target.value })} />
            

              <label className={rlcClass(null, lbl)}>Code (Barcode/RFID)</label>
              <input className={rlcClass(null,
            inp)}
            value={sel.code ?? ""}
            onChange={(e) => up({ code: e.target.value })} />
            

              <label className={rlcClass(null, lbl)}>Projekt-ID</label>
              <input className={rlcClass(null,
            inp)}
            value={sel.projectId ?? ""}
            onChange={(e) => up({ projectId: e.target.value })} />
            

              <label className={rlcClass(null, lbl)}>Ort/Lager</label>
              <input className={rlcClass(null,
            inp)}
            value={sel.location ?? ""}
            onChange={(e) => up({ location: e.target.value })} />
            

              <label className={rlcClass(null, lbl)}>Einheit</label>
              <input className={rlcClass(null,
            inp)}
            value={sel.unit ?? ""}
            onChange={(e) => up({ unit: e.target.value })} />
            

              <label className={rlcClass(null, lbl)}>Bestand</label>
              <input
              type="number" className={rlcClass(null,
              inp)}
              value={sel.stock ?? 0}
              onChange={(e) => up({ stock: Number(e.target.value) || 0 })} />
            

              <label className={rlcClass(null, lbl)}>Mindestbestand</label>
              <input
              type="number" className={rlcClass(null,
              inp)}
              value={sel.minStock ?? 0}
              onChange={(e) => up({ minStock: Number(e.target.value) || 0 })} />
            

              <label className={rlcClass(null, lbl)}>Preis Netto (€)</label>
              <input
              type="number"
              step="0.01" className={rlcClass(null,
              inp)}
              value={sel.priceNet ?? 0}
              onChange={(e) => up({ priceNet: Number(e.target.value) || 0 })} />
            

              <label className={rlcClass(null, lbl)}>Lieferant</label>
              <input className={rlcClass(null,
            inp)}
            value={sel.supplier ?? ""}
            onChange={(e) => up({ supplier: e.target.value })} />
            

              <div className="rlc-migrated-pages-buro-materialverwaltung-tsx-570">






              
                <button className="btn" onClick={() => move("IN")}>
                  + Eingang
                </button>
                <button className="btn" onClick={() => move("OUT")}>
                  − Ausgang
                </button>
                <button className="btn" onClick={printLabel}>
                  Etikett drucken
                </button>
              </div>

              <label className={rlcClass(null, { ...lbl, gridColumn: "1 / -1" })}>
                Bewegungen
              </label>
              <div className="rlc-migrated-pages-buro-materialverwaltung-tsx-571">
                <table className="rlc-migrated-pages-buro-materialverwaltung-tsx-572">
                  <thead>
                    <tr>
                      <th className={rlcClass(null, th)}>Datum</th>
                      <th className={rlcClass(null, th)}>Typ</th>
                      <th className={rlcClass(null, th)}>Menge</th>
                      <th className={rlcClass(null, th)}>Projekt</th>
                      <th className={rlcClass(null, th)}>Notiz</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(sel.moves || []).
                  slice().
                  sort(
                    (a, b) =>
                    new Date(getMoveWhen(b)).getTime() -
                    new Date(getMoveWhen(a)).getTime()
                  ).
                  map((m) =>
                  <tr key={m.id}>
                          <td className={rlcClass(null, td)}>
                            {getMoveWhen(m) ?
                      new Date(getMoveWhen(m)).toLocaleString() :
                      "—"}
                          </td>
                          <td className={rlcClass(null, td)}>{m.dir}</td>
                          <td className={rlcClass(null, td)}>{m.qty}</td>
                          <td className={rlcClass(null, td)}>{m.projectId || "—"}</td>
                          <td className={rlcClass(null, td)}>{m.note || "—"}</td>
                        </tr>
                  )}

                    {(sel.moves || []).length === 0 &&
                  <tr>
                        <td className={rlcClass(null, { ...td, opacity: 0.6 })} colSpan={5}>
                          Keine Bewegungen.
                        </td>
                      </tr>
                  }
                  </tbody>
                </table>
              </div>

              <label className={rlcClass(null, { ...lbl, gridColumn: "1 / -1" })}>
                Dokumente / Bilder (Drag&amp;Drop)
              </label>
              <div className="rlc-migrated-pages-buro-materialverwaltung-tsx-573">






              
                {(sel.attachments || []).map((a) =>
              <div
                key={a.id} className="rlc-migrated-pages-buro-materialverwaltung-tsx-574">






                
                    <div className="rlc-migrated-pages-buro-materialverwaltung-tsx-575">







                  
                      <b





                    title={a.name} className="rlc-migrated-pages-buro-materialverwaltung-tsx-576">
                    
                        {a.name}
                      </b>
                      <div className="rlc-migrated-pages-buro-materialverwaltung-tsx-577" />
                      <button className="btn" onClick={() => open(a)}>
                        Öffnen
                      </button>
                    </div>

                    {(a.mime || "").startsWith("image/") &&
                <img
                  src={a.dataURL}
                  alt={a.name} className="rlc-migrated-pages-buro-materialverwaltung-tsx-578" />






                }
                  </div>
              )}

                {(sel.attachments || []).length === 0 &&
              <div className="rlc-migrated-pages-buro-materialverwaltung-tsx-579">Keine Anhänge.</div>
              }
              </div>
            </div>
          }
        </div>
      </div>
    </div>);

}

function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (m) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[m]!
  );
}

function pickFile(onPick: (f: File) => void) {
  const i = document.createElement("input");
  i.type = "file";
  i.onchange = () => {
    const f = i.files?.[0];
    if (f) onPick(f);
  };
  i.click();
}

function download(type: string, name: string, data: string) {
  const b = new Blob([data], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(b);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
