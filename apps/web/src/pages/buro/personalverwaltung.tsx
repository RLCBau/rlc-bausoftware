import { rlcClass } from "../../ui/rlcRuntimeStyle";import React from "react";
import { PersonalDB } from "./store.personal";
import { RlcEmployee, EmpCert, EmpAttachment } from "./types";

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

export default function Personalverwaltung() {
  const [all, setAll] = React.useState<RlcEmployee[]>(PersonalDB.list());
  const [selId, setSelId] = React.useState<string | null>(PersonalDB.list()[0]?.id ?? null);
  const [q, setQ] = React.useState("");
  const [proj, setProj] = React.useState("");

  const refresh = React.useCallback(() => {
    const next = PersonalDB.list();
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

    return all.filter((e) => {
      const s = `${e.name} ${e.role ?? ""} ${(e.projects ?? []).join(" ")}`.toLowerCase();
      const okQ = !qq || s.includes(qq);
      const okP = !proj || (e.projects ?? []).includes(proj);
      return okQ && okP;
    });
  }, [all, q, proj]);

  const projects = React.useMemo(
    () => Array.from(new Set(all.flatMap((e) => e.projects ?? []))).sort(),
    [all]
  );

  const add = React.useCallback(() => {
    const e = PersonalDB.create();
    refresh();
    setSelId(e.id);
  }, [refresh]);

  const del = React.useCallback(() => {
    if (!sel) return;
    if (!confirm("Mitarbeiter löschen?")) return;
    PersonalDB.remove(sel.id);
    refresh();
  }, [sel, refresh]);

  const up = React.useCallback(
    (p: Partial<RlcEmployee>) => {
      if (!sel) return;
      const next: RlcEmployee = { ...sel, ...p, updatedAt: Date.now() };
      PersonalDB.upsert(next);
      setSelId(next.id);
      refresh();
    },
    [sel, refresh]
  );

  const expWarn = React.useCallback((d?: string) => {
    return d ? daysLeft(d) : null;
  }, []);

  const addCert = React.useCallback(() => {
    if (!sel) return;
    const c: EmpCert = {
      id: crypto.randomUUID(),
      name: "",
      validUntil: new Date().toISOString()
    };
    up({ certs: [c, ...(sel.certs || [])] });
  }, [sel, up]);

  const delCert = React.useCallback(
    (id: string) => {
      if (!sel) return;
      up({ certs: (sel.certs || []).filter((c) => c.id !== id) });
    },
    [sel, up]
  );

  const onDrop = React.useCallback(
    async (ev: React.DragEvent) => {
      ev.preventDefault();
      if (!sel) return;
      const f = ev.dataTransfer.files?.[0];
      if (!f) return;
      await PersonalDB.attach(sel.id, f);
      refresh();
    },
    [sel, refresh]
  );

  const open = React.useCallback((a: EmpAttachment) => {
    const w = window.open(a.dataURL, "_blank");
    if (!w) alert("Popup blockiert.");
  }, []);

  const exportCSV = React.useCallback(() => {
    download(
      "text/csv;charset=utf-8",
      "personal.csv",
      PersonalDB.exportCSV(filtered)
    );
  }, [filtered]);

  const importCSV = React.useCallback(() => {
    pickFile(async (f) => {
      const n = PersonalDB.importCSV(await f.text());
      alert(`Import: ${n} Datensätze.`);
      refresh();
    });
  }, [refresh]);

  const exportJSON = React.useCallback(() => {
    download("application/json", "personal_backup.json", PersonalDB.exportJSON());
  }, []);

  const importJSON = React.useCallback(() => {
    pickFile(async (f) => {
      const n = PersonalDB.importJSON(await f.text());
      alert(`Backup importiert: ${n}.`);
      refresh();
    });
  }, [refresh]);

  return (
    <div className="rlc-migrated-pages-buro-personalverwaltung-tsx-589">
      <div
        className="card rlc-migrated-pages-buro-personalverwaltung-tsx-590">

        
        <button className="btn" onClick={add}>
          + Mitarbeiter
        </button>
        <button className="btn" onClick={del} disabled={!sel}>
          Löschen
        </button>

        <div className="rlc-migrated-pages-buro-personalverwaltung-tsx-591" />

        <input
          placeholder="Suche Name / Rolle / Projekt…"
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

      <div className="rlc-migrated-pages-buro-personalverwaltung-tsx-592">






        
        <div className="card rlc-migrated-pages-buro-personalverwaltung-tsx-593">
          <table className="rlc-migrated-pages-buro-personalverwaltung-tsx-594">
            <thead>
              <tr>
                <th className={rlcClass(null, th)}>Name</th>
                <th className={rlcClass(null, th)}>Rolle</th>
                <th className={rlcClass(null, th)}>E-Mail</th>
                <th className={rlcClass(null, th)}>Std.-Satz</th>
                <th className={rlcClass(null, th)}>Projekte</th>
                <th className={rlcClass(null, th)}>Abläufe</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const exp = Math.min(
                  ...(e.certs || []).map((c) => daysLeft(c.validUntil)),
                  e.contractEnd ? daysLeft(e.contractEnd) : Infinity
                );
                const warn = Number.isFinite(exp) && exp <= 30;

                return (
                  <tr
                    key={e.id}
                    onClick={() => setSelId(e.id)} className={rlcClass(null,
                    {
                      cursor: "pointer",
                      background: sel?.id === e.id ? "#f1f5ff" : undefined
                    })}>
                    
                    <td className={rlcClass(null, td)}>
                      <b>{e.name}</b>
                    </td>
                    <td className={rlcClass(null, td)}>{e.role || "—"}</td>
                    <td className={rlcClass(null, td)}>{e.email || "—"}</td>
                    <td className={rlcClass(null, td)}>
                      {typeof e.hourlyRate === "number" ?
                      `${e.hourlyRate.toFixed(2)} €` :
                      "—"}
                    </td>
                    <td className={rlcClass(null, td)}>{(e.projects || []).join(", ") || "—"}</td>
                    <td className={rlcClass(null, td)}>{warn ? `⚠️ ${exp} Tg.` : "—"}</td>
                  </tr>);

              })}

              {filtered.length === 0 &&
              <tr>
                  <td className={rlcClass(null, { ...td, opacity: 0.6 })} colSpan={6}>
                    Keine Mitarbeiter.
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div
          className="card rlc-migrated-pages-buro-personalverwaltung-tsx-595"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}>

          
          {!sel ?
          <div className="rlc-migrated-pages-buro-personalverwaltung-tsx-596">Links Mitarbeiter wählen oder neu anlegen.</div> :

          <div className="rlc-migrated-pages-buro-personalverwaltung-tsx-597">





            
              <label className={rlcClass(null, lbl)}>Name</label>
              <input className={rlcClass(null,
            inp)}
            value={sel.name}
            onChange={(e) => up({ name: e.target.value })} />
            

              <label className={rlcClass(null, lbl)}>Rolle</label>
              <input className={rlcClass(null,
            inp)}
            value={sel.role ?? ""}
            onChange={(e) => up({ role: e.target.value })} />
            

              <label className={rlcClass(null, lbl)}>E-Mail</label>
              <input className={rlcClass(null,
            inp)}
            value={sel.email ?? ""}
            onChange={(e) => up({ email: e.target.value })} />
            

              <label className={rlcClass(null, lbl)}>Telefon</label>
              <input className={rlcClass(null,
            inp)}
            value={sel.phone ?? ""}
            onChange={(e) => up({ phone: e.target.value })} />
            

              <label className={rlcClass(null, lbl)}>Kostenstelle</label>
              <input className={rlcClass(null,
            inp)}
            value={sel.costCenter ?? ""}
            onChange={(e) => up({ costCenter: e.target.value })} />
            

              <label className={rlcClass(null, lbl)}>Std.-Satz (€)</label>
              <input
              type="number"
              step="0.01" className={rlcClass(null,
              inp)}
              value={sel.hourlyRate ?? 0}
              onChange={(e) => up({ hourlyRate: Number(e.target.value) || 0 })} />
            

              <label className={rlcClass(null, lbl)}>Projekte</label>
              <input className={rlcClass(null,
            inp)}
            placeholder="P001, P002"
            value={(sel.projects ?? []).join(", ")}
            onChange={(e) =>
            up({
              projects: e.target.value.
              split(",").
              map((s) => s.trim()).
              filter(Boolean)
            })
            } />
            

              <label className={rlcClass(null, lbl)}>Anstellung</label>
              <select className={rlcClass(null,
            inp)}
            value={sel.employmentType ?? "Vollzeit"}
            onChange={(e) => up({ employmentType: e.target.value as any })}>
              
                <option>Vollzeit</option>
                <option>Teilzeit</option>
                <option>Werkvertrag</option>
                <option>Praktikum</option>
              </select>

              <label className={rlcClass(null, lbl)}>Vertragsbeginn</label>
              <input
              type="date" className={rlcClass(null,
              inp)}
              value={toDateInput(sel.contractStart)}
              onChange={(e) => up({ contractStart: fromDateInput(e.target.value) })} />
            

              <label className={rlcClass(null, lbl)}>Vertragsende</label>
              <input
              type="date" className={rlcClass(null,
              inp)}
              value={toDateInput(sel.contractEnd)}
              onChange={(e) => up({ contractEnd: fromDateInput(e.target.value) })} />
            

              <label className={rlcClass(null, lbl)}>Urlaub (gesamt)</label>
              <input
              type="number" className={rlcClass(null,
              inp)}
              value={sel.vacationTotal ?? 25}
              onChange={(e) => up({ vacationTotal: Number(e.target.value) || 0 })} />
            

              <label className={rlcClass(null, lbl)}>Urlaub (genommen)</label>
              <input
              type="number" className={rlcClass(null,
              inp)}
              value={sel.vacationTaken ?? 0}
              onChange={(e) => up({ vacationTaken: Number(e.target.value) || 0 })} />
            

              <label className={rlcClass(null, { ...lbl, gridColumn: "1 / -1" })}>
                Zertifikate &amp; Schulungen
              </label>
              <div className="rlc-migrated-pages-buro-personalverwaltung-tsx-598">
                <div className="rlc-migrated-pages-buro-personalverwaltung-tsx-599">
                  <button className="btn" onClick={addCert}>
                    + Zertifikat
                  </button>
                  <small className="rlc-migrated-pages-buro-personalverwaltung-tsx-600">
                    Warnung bei Ablauf &lt;= 30 Tage
                  </small>
                </div>

                <table className="rlc-migrated-pages-buro-personalverwaltung-tsx-601">
                  <thead>
                    <tr>
                      <th className={rlcClass(null, th)}>Bezeichnung</th>
                      <th className={rlcClass(null, th)}>gültig bis</th>
                      <th className={rlcClass(null, th)}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(sel.certs || []).map((c) => {
                    const d = expWarn(c.validUntil);
                    const warn = d !== null && d <= 30;

                    return (
                      <tr
                        key={c.id} className={rlcClass(null,
                        { background: warn ? "#fff3f0" : undefined })}>
                        
                          <td className={rlcClass(null, td)}>
                            <input className={rlcClass(null,
                          { ...inp, width: "100%" })}
                          value={c.name}
                          onChange={(e) =>
                          up({
                            certs: (sel.certs || []).map((x) =>
                            x.id === c.id ? { ...c, name: e.target.value } : x
                            )
                          })
                          } />
                          
                          </td>
                          <td className={rlcClass(null, td)}>
                            <input
                            type="date" className={rlcClass(null,
                            inp)}
                            value={toDateInput(c.validUntil)}
                            onChange={(e) =>
                            up({
                              certs: (sel.certs || []).map((x) =>
                              x.id === c.id ?
                              { ...c, validUntil: fromDateInput(e.target.value) } :
                              x
                              )
                            })
                            } />
                          
                            {warn &&
                          <span className="rlc-migrated-pages-buro-personalverwaltung-tsx-602">
                                ⚠ {d} Tg
                              </span>
                          }
                          </td>
                          <td className={rlcClass(null, { ...td, whiteSpace: "nowrap" })}>
                            <button className="btn" onClick={() => delCert(c.id)}>
                              Entfernen
                            </button>
                          </td>
                        </tr>);

                  })}

                    {(sel.certs || []).length === 0 &&
                  <tr>
                        <td className={rlcClass(null, { ...td, opacity: 0.6 })} colSpan={3}>
                          Keine Zertifikate.
                        </td>
                      </tr>
                  }
                  </tbody>
                </table>
              </div>

              <label className={rlcClass(null, { ...lbl, gridColumn: "1 / -1" })}>
                Dokumente (Drag&amp;Drop hier)
              </label>
              <div className="rlc-migrated-pages-buro-personalverwaltung-tsx-603">






              
                {(sel.attachments || []).map((a) =>
              <div
                key={a.id} className="rlc-migrated-pages-buro-personalverwaltung-tsx-604">






                
                    <div className="rlc-migrated-pages-buro-personalverwaltung-tsx-605">







                  
                      <b





                    title={a.name} className="rlc-migrated-pages-buro-personalverwaltung-tsx-606">
                    
                        {a.name}
                      </b>
                      <div className="rlc-migrated-pages-buro-personalverwaltung-tsx-607" />
                      <button className="btn" onClick={() => open(a)}>
                        Öffnen
                      </button>
                    </div>

                    {(a.mime || "").startsWith("image/") &&
                <img
                  src={a.dataURL}
                  alt={a.name} className="rlc-migrated-pages-buro-personalverwaltung-tsx-608" />


                }
                  </div>
              )}

                {(sel.attachments || []).length === 0 &&
              <div className="rlc-migrated-pages-buro-personalverwaltung-tsx-609">Keine Anhänge.</div>
              }
              </div>
            </div>
          }
        </div>
      </div>
    </div>);

}

/* utils */
function daysLeft(iso: string) {
  const d = (new Date(iso).getTime() - Date.now()) / 86400000;
  return Math.ceil(d);
}

function toDateInput(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function fromDateInput(v: string) {
  if (!v) return "";
  return `${v}T12:00:00.000Z`;
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
