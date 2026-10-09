import { rlcClass } from "../../ui/rlcRuntimeStyle";import React from "react";
import { useNavigate } from "react-router-dom";
import { apiUrl } from "../../lib/apiBase";
import { MachinesDB } from "./store.machines";
import { Machine, MaintRecord, MachAttachment } from "./types";

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

export default function Maschinenverwaltung() {
  const navigate = useNavigate();

  const [all, setAll] = React.useState<Machine[]>([]);
  const [selId, setSelId] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  const [proj, setProj] = React.useState("");
  const [onlyDue, setOnlyDue] = React.useState(false);
  const [draft, setDraft] = React.useState<Machine | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const refresh = React.useCallback(async () => {
    const r = await apiRequest("/api/resource-costs/machines");
    const next = Array.isArray(r?.items) ? r.items : [];
    setAll(next);
    setSelId((prev) => {
      if (prev && next.some((x: Machine) => x.id === prev)) return prev;
      return next[0]?.id ?? null;
    });
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const sel = React.useMemo(
    () => all.find((x) => x.id === selId) ?? null,
    [all, selId]
  );

  React.useEffect(() => {
    setDraft(sel ? { ...sel } : null);
    setDirty(false);
  }, [sel]);


  const filtered = React.useMemo(() => {
    const qq = q.trim().toLowerCase();

    return all.filter((m) => {
      const s = `${m.name} ${m.type ?? ""} ${m.serial ?? ""} ${m.projectId ?? ""}`.toLowerCase();
      const okQ = !qq || s.includes(qq);
      const okP = !proj || (m.projectId ?? "") === proj;
      const due = isDue(m);
      const okD = !onlyDue || due;
      return okQ && okP && okD;
    });
  }, [all, q, proj, onlyDue]);

  const projects = React.useMemo(
    () => Array.from(new Set(all.map((m) => m.projectId).filter(Boolean))) as string[],
    [all]
  );

  const add = React.useCallback(async () => {
    const r = await apiRequest("/api/resource-costs/machines", {
      method: "POST",
      body: JSON.stringify({
        name: "Neue Maschine",
        status: "Betrieb",
        hours: 0,
        hourlyRate: 0,
        serviceIntervalDays: 180
      })
    });
    await refresh();
    if (r?.item?.id) setSelId(r.item.id);
  }, [refresh]);

  const del = React.useCallback(() => {
    if (!sel) return;
    if (!confirm("Maschine löschen?")) return;
    void apiRequest(`/api/resource-costs/machines/${encodeURIComponent(sel.id)}`, {
      method: "DELETE"
    }).then(() => refresh());
  }, [sel, refresh]);

  const patchDraft = React.useCallback(
    (patch: Partial<Machine>) => {
      setDraft((current) =>
        current ? { ...current, ...patch } : current
      );
      setDirty(true);
    },
    []
  );

  const save = React.useCallback(async () => {
    if (!sel || !draft) return;

    setSaving(true);

    try {
      const result = await apiRequest(
        `/api/resource-costs/machines/${encodeURIComponent(sel.id)}`,
        {
          method: "PUT",
          body: JSON.stringify(draft)
        }
      );

      if (result?.item) {
        setAll((rows) =>
          rows.map((row) =>
            row.id === result.item.id
              ? result.item
              : row
          )
        );

        setDraft(result.item);
        setDirty(false);
      }
    } catch (error: any) {
      console.error("Maschine speichern fehlgeschlagen", error);
      alert(error?.message || "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }, [sel, draft]);

  const addMaint = React.useCallback(() => {
    if (!draft) return;
    const r: MaintRecord = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      hours: draft.hours || 0,
      notes: ""
    };
    patchDraft({ maintenance: [r, ...(draft.maintenance || [])] });
  }, [draft, patchDraft]);

  const delMaint = React.useCallback(
    (id: string) => {
      if (!sel) return;
      patchDraft({ maintenance: (draft?.maintenance || []).filter((x) => x.id !== id) });
    },
    [draft, patchDraft]
  );

  const uploadMachineAttachment = React.useCallback(
    async (file: File) => {
      if (!sel) return;

      const form = new FormData();
      form.append("file", file);

      await apiRequest(
        `/api/resource-costs/machines/${encodeURIComponent(sel.id)}/attachments`,
        {
          method: "POST",
          body: form
        }
      );

      await refresh();
    },
    [sel, refresh]
  );

  const onDrop = React.useCallback(
    async (ev: React.DragEvent) => {
      ev.preventDefault();

      const file = ev.dataTransfer.files?.[0];
      if (!file) return;

      try {
        await uploadMachineAttachment(file);
      } catch (error: any) {
        alert(
          error?.message ||
          "Datei konnte nicht hochgeladen werden."
        );
      }
    },
    [uploadMachineAttachment]
  );

  const open = React.useCallback(
    async (a: any) => {
      if (!sel) return;

      const result = await apiRequest(
        `/api/resource-costs/machines/${encodeURIComponent(sel.id)}/attachments/${encodeURIComponent(a.id)}/open`
      );

      if (result?.url) {
        window.open(result.url, "_blank");
      }
    },
    [sel]
  );

  const deleteAttachment = React.useCallback(
    async (attachmentId: string) => {
      if (!sel) return;

      if (!confirm("Anhang wirklich entfernen?")) return;

      await apiRequest(
        `/api/resource-costs/machines/${encodeURIComponent(sel.id)}/attachments/${encodeURIComponent(attachmentId)}`,
        {
          method: "DELETE"
        }
      );

      await refresh();
    },
    [sel, refresh]
  );

  const pickMachineAttachment = React.useCallback(() => {
    pickFile((file) => {
      void uploadMachineAttachment(file).catch((error: any) => {
        alert(
          error?.message ||
          "Datei konnte nicht hochgeladen werden."
        );
      });
    });
  }, [uploadMachineAttachment]);

  const importCSV = React.useCallback(() => {
    pickFile(async (f) => {
      const n = MachinesDB.importCSV(await f.text());
      alert(`Import: ${n} Maschinen.`);
      refresh();
    });
  }, [refresh]);

  const exportCSV = React.useCallback(() => {
    download(
      "text/csv;charset=utf-8",
      "maschinen.csv",
      MachinesDB.exportCSV(filtered)
    );
  }, [filtered]);

  const exportJSON = React.useCallback(() => {
    download("application/json", "maschinen_backup.json", MachinesDB.exportJSON());
  }, []);

  const importJSON = React.useCallback(() => {
    pickFile(async (f) => {
      const n = MachinesDB.importJSON(await f.text());
      alert(`Backup importiert: ${n}.`);
      refresh();
    });
  }, [refresh]);

  const recalcNext = React.useCallback(() => {
    if (!draft) return;

    const last =
      draft.lastService || new Date().toISOString();

    const days =
      draft.serviceIntervalDays || 180;

    const next = new Date(
      new Date(last).getTime() +
      days * 86400000
    ).toISOString();

    patchDraft({
      nextService: next
    });
  }, [draft, patchDraft]);

  const openBauzeitenplan = React.useCallback(() => {
    navigate("/buro/bauzeitenplan");
  }, [navigate]);

  const createTask = React.useCallback(async () => {
    if (!draft) return;

    if (!draft.projectId) {
      alert("Bitte zuerst ein Projekt zuordnen.");
      return;
    }

    await apiRequest("/api/tasks", {
      method: "POST",
      body: JSON.stringify({
        projectId: draft.projectId,
        title: `Wartung: ${draft.name}`,
        description:
          `Maschine: ${draft.name}\n` +
          `Seriennr.: ${draft.serial || "—"}\n` +
          `Standort: ${draft.location || "—"}`,
        due: draft.nextService || null,
        priority: "med",
        tags: ["Maschine", "Wartung"],
        sourceType: "maschine",
        sourceId: draft.id
      })
    });

    navigate("/buro/tasks");
  }, [draft, navigate]);

  const openCalendar = React.useCallback(() => {
    if (!draft) return;

    let start = draft.nextService || "";
    let end = start;

    if (start) {
      const d = new Date(start);
      d.setHours(d.getHours() + 1);
      end = d.toISOString();
    }

    sessionStorage.setItem(
      "rlc.calendar.prefill",
      JSON.stringify({
        projectId: draft.projectId || "",
        title: `Service / Wartung – ${draft.name}`,
        notes:
          `Maschine: ${draft.name}\n` +
          `Seriennr.: ${draft.serial || "—"}\n` +
          `Standort: ${draft.location || "—"}`,
        category: "Wartung",
        sourceType: "maschine",
        sourceId: draft.id,
        start,
        end
      })
    );

    navigate("/buro/outlook?new=1");
  }, [draft, navigate]);

  const active = draft || sel;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <section className="rlc-page-hero rlc-page-hero--split">
        <div>
          <div className="rlc-page-hero__eyebrow">
            Büro · Ressourcen
          </div>

          <h1 style={{ margin: "3px 0 4px" }}>
            Maschinenverwaltung
          </h1>

          <div style={{ opacity: 0.9 }}>
            Maschinen, Kosten, Betriebsstunden, Wartung und Einsatz zentral verwalten.
          </div>
        </div>

        <div className="rlc-page-hero__actions">
          <button
            className="rlc-page-hero__button"
            onClick={add}
          >
            + Maschine
          </button>
        </div>
      </section>

      <div
        className="card rlc-migrated-pages-buro-maschinenverwaltung-tsx-537">

        

        <button className="btn" onClick={del} disabled={!sel}>
          Löschen
        </button>

        <div className="rlc-migrated-pages-buro-maschinenverwaltung-tsx-538" />

        <input
          placeholder="Suche Name / Typ / Seriennr. / Projekt…"
          value={q}
          onChange={(e) => setQ(e.target.value)} className={rlcClass(null,
          { ...inp, width: 300 })} />
        

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

        <label className="rlc-migrated-pages-buro-maschinenverwaltung-tsx-539">
          <input
            type="checkbox"
            checked={onlyDue}
            onChange={(e) => setOnlyDue(e.target.checked)} />
          
          <span className="rlc-migrated-pages-buro-maschinenverwaltung-tsx-540">nur fällige</span>
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

      <div className="rlc-migrated-pages-buro-maschinenverwaltung-tsx-541">






        
        <div className="card rlc-migrated-pages-buro-maschinenverwaltung-tsx-542">
          <table className="rlc-migrated-pages-buro-maschinenverwaltung-tsx-543">
            <thead>
              <tr>
                <th className={rlcClass(null, th)}>Name</th>
                <th className={rlcClass(null, th)}>Typ</th>
                <th className={rlcClass(null, th)}>Seriennr.</th>
                <th className={rlcClass(null, th)}>Projekt</th>
                <th className={rlcClass(null, th)}>Kostenstelle</th>
                <th className={rlcClass(null, th)}>Stunden</th>
                <th className={rlcClass(null, th)}>Std.-Satz</th>
                <th className={rlcClass(null, th)}>nächster Service</th>
                <th className={rlcClass(null, th)}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => {
                const due = isDue(m);
                const days = daysLeft(m.nextService);

                return (
                  <tr
                    key={m.id}
                    onClick={() => setSelId(m.id)} className={rlcClass(null,
                    {
                      cursor: "pointer",
                      background: sel?.id === m.id ? "#f1f5ff" : undefined
                    })}>
                    
                    <td className={rlcClass(null, td)}>
                      <b>{m.name}</b>
                    </td>
                    <td className={rlcClass(null, td)}>{m.type || "—"}</td>
                    <td className={rlcClass(null, td)}>{m.serial || "—"}</td>
                    <td className={rlcClass(null, td)}>{m.projectId || "—"}</td>
                    <td className={rlcClass(null, td)}>{m.costCenter || "—"}</td>
                    <td className={rlcClass(null, td)}>{m.hours ?? 0}</td>
                    <td className={rlcClass(null, td)}>
                      {Number(m.hourlyRate || 0).toFixed(2)} €
                    </td>
                    <td className={rlcClass(null, td)}>
                      {m.nextService ? fmt(m.nextService) : "—"}
                      {m.nextService &&
                      <span className="rlc-migrated-pages-buro-maschinenverwaltung-tsx-544">
                          ({days} Tg)
                        </span>
                      }
                    </td>
                    <td className={rlcClass(null, td)}>{due ? "⚠️ fällig" : m.status || "Betrieb"}</td>
                  </tr>);

              })}

              {filtered.length === 0 &&
              <tr>
                  <td className={rlcClass(null, { ...td, opacity: 0.6 })} colSpan={9}>
                    Keine Maschinen.
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div
          className="card rlc-migrated-pages-buro-maschinenverwaltung-tsx-545"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}>

          
          {!sel ?
          <div className="rlc-migrated-pages-buro-maschinenverwaltung-tsx-546">Links Maschine wählen oder neu anlegen.</div> :

          <div className="rlc-migrated-pages-buro-maschinenverwaltung-tsx-547">





            
              <div
                style={{
                  gridColumn: "1 / -1",
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  flexWrap: "wrap",
                  marginBottom: 8
                }}
              >
                <button
                  className="btn btn-primary"
                  disabled={!dirty || saving}
                  onClick={() => void save()}
                >
                  {saving ? "Speichern…" : "Speichern"}
                </button>

                <button
                  className="btn"
                  onClick={openBauzeitenplan}
                >
                  Bauzeitenplan
                </button>

                <button
                  className="btn"
                  onClick={() => void createTask()}
                >
                  Als Aufgabe
                </button>

                <button
                  className="btn"
                  onClick={openCalendar}
                >
                  In Kalender
                </button>

                {dirty && (
                  <span
                    style={{
                      fontSize: 11,
                      color: "#b45309"
                    }}
                  >
                    Ungespeicherte Änderungen
                  </span>
                )}
              </div>

              <label className={rlcClass(null, lbl)}>Name</label>
              <input className={rlcClass(null,
            inp)}
            value={active?.name ?? ""}
            onChange={(e) => patchDraft({ name: e.target.value })} />
            

              <label className={rlcClass(null, lbl)}>Typ</label>
              <input className={rlcClass(null,
            inp)}
            value={active?.type ?? ""}
            onChange={(e) => patchDraft({ type: e.target.value })} />
            

              <label className={rlcClass(null, lbl)}>Seriennr.</label>
              <input className={rlcClass(null,
            inp)}
            value={active?.serial ?? ""}
            onChange={(e) => patchDraft({ serial: e.target.value })} />
            

              <label className={rlcClass(null, lbl)}>Projekt-ID</label>
              <input className={rlcClass(null,
            inp)}
            value={active?.projectId ?? ""}
            onChange={(e) => patchDraft({ projectId: e.target.value })} />
            

              <label className={rlcClass(null, lbl)}>Kostenstelle</label>
              <input
                className={rlcClass(null, inp)}
                value={active?.costCenter ?? ""}
                onChange={(e) => patchDraft({ costCenter: e.target.value })}
              />

              <label className={rlcClass(null, lbl)}>Standort</label>
              <input className={rlcClass(null,
            inp)}
            value={active?.location ?? ""}
            onChange={(e) => patchDraft({ location: e.target.value })} />
            

              <label className={rlcClass(null, lbl)}>Status</label>
              <select className={rlcClass(null,
            inp)}
            value={active?.status ?? "Betrieb"}
            onChange={(e) => patchDraft({ status: e.target.value as any })}>
              
                <option>Betrieb</option>
                <option>Wartung</option>
                <option>Außer Betrieb</option>
              </select>

              <label className={rlcClass(null, lbl)}>Betriebsstunden</label>
              <input
              type="number" className={rlcClass(null,
              inp)}
              value={active?.hours ?? 0}
              onChange={(e) => patchDraft({ hours: Number(e.target.value) || 0 })} />
            

              <label className={rlcClass(null, lbl)}>Std.-Satz (€)</label>
              <input
                type="number"
                step="0.01"
                className={rlcClass(null, inp)}
                value={active?.hourlyRate ?? 0}
                onChange={(e) => patchDraft({ hourlyRate: Number(e.target.value) || 0 })}
              />

              <label className={rlcClass(null, lbl)}>Letzter Service</label>
              <input
              type="date" className={rlcClass(null,
              inp)}
              value={toDateInput(active?.lastService)}
              onChange={(e) => patchDraft({ lastService: fromDateInput(e.target.value) })} />
            

              <label className={rlcClass(null, lbl)}>Intervall (Tage)</label>
              <input
              type="number" className={rlcClass(null,
              inp)}
              value={active?.serviceIntervalDays ?? 180}
              onChange={(e) =>
              patchDraft({ serviceIntervalDays: Number(e.target.value) || 0 })
              } />
            

              <label className={rlcClass(null, lbl)}>Nächster Service</label>
              <div className="rlc-migrated-pages-buro-maschinenverwaltung-tsx-548">
                <input
                type="date" className={rlcClass(null,
                { ...inp, flex: 1 })}
                value={toDateInput(active?.nextService)}
                onChange={(e) => patchDraft({ nextService: fromDateInput(e.target.value) })} />
              
                <button className="btn" onClick={recalcNext}>
                  Berechnen
                </button>
              </div>

              <label className={rlcClass(null, { ...lbl, gridColumn: "1 / -1" })}>Wartungsprotokolle</label>
              <div className="rlc-migrated-pages-buro-maschinenverwaltung-tsx-549">
                <div className="rlc-migrated-pages-buro-maschinenverwaltung-tsx-550">
                  <button className="btn" onClick={addMaint}>
                    + Eintrag
                  </button>
                </div>

                <table className="rlc-migrated-pages-buro-maschinenverwaltung-tsx-551">
                  <thead>
                    <tr>
                      <th className={rlcClass(null, th)}>Datum</th>
                      <th className={rlcClass(null, th)}>Std.</th>
                      <th className={rlcClass(null, th)}>Notizen</th>
                      <th className={rlcClass(null, th)}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(draft?.maintenance || []).map((r) =>
                  <tr key={r.id}>
                        <td className={rlcClass(null, td)}>
                          <input
                        type="date" className={rlcClass(null,
                        inp)}
                        value={toDateInput(r.date)}
                        onChange={(e) =>
                        patchDraft({
                          maintenance: (draft?.maintenance || []).map((x) =>
                          x.id === r.id ?
                          { ...r, date: fromDateInput(e.target.value) } :
                          x
                          )
                        })
                        } />
                      
                        </td>
                        <td className={rlcClass(null, td)}>
                          <input
                        type="number" className={rlcClass(null,
                        inp)}
                        value={r.hours ?? 0}
                        onChange={(e) =>
                        patchDraft({
                          maintenance: (draft?.maintenance || []).map((x) =>
                          x.id === r.id ?
                          { ...r, hours: Number(e.target.value) || 0 } :
                          x
                          )
                        })
                        } />
                      
                        </td>
                        <td className={rlcClass(null, td)}>
                          <input className={rlcClass(null,
                      { ...inp, width: "100%" })}
                      value={r.notes ?? ""}
                      onChange={(e) =>
                      patchDraft({
                        maintenance: (draft?.maintenance || []).map((x) =>
                        x.id === r.id ? { ...r, notes: e.target.value } : x
                        )
                      })
                      } />
                      
                        </td>
                        <td className={rlcClass(null, { ...td, whiteSpace: "nowrap" })}>
                          <button className="btn" onClick={() => delMaint(r.id)}>
                            Entfernen
                          </button>
                        </td>
                      </tr>
                  )}

                    {(draft?.maintenance || []).length === 0 &&
                  <tr>
                        <td className={rlcClass(null, { ...td, opacity: 0.6 })} colSpan={4}>
                          Keine Einträge.
                        </td>
                      </tr>
                  }
                  </tbody>
                </table>
              </div>

              <div
                style={{
                  gridColumn: "1 / -1",
                  display: "flex",
                  alignItems: "center",
                  gap: 8
                }}
              >
                <label className={rlcClass(null, lbl)}>
                  Dokumente / Fotos
                </label>

                <div style={{ flex: 1 }} />

                <button
                  className="btn"
                  onClick={pickMachineAttachment}
                >
                  + Datei
                </button>
              </div>
              <div className="rlc-migrated-pages-buro-maschinenverwaltung-tsx-552">






              
                {(((sel as any).machineAttachments || []) as any[]).map((a) =>
              <div
                key={a.id} className="rlc-migrated-pages-buro-maschinenverwaltung-tsx-553">






                
                    <div className="rlc-migrated-pages-buro-maschinenverwaltung-tsx-554">







                  
                      <b





                    title={a.name} className="rlc-migrated-pages-buro-maschinenverwaltung-tsx-555">
                    
                        {a.name}
                      </b>
                      <div className="rlc-migrated-pages-buro-maschinenverwaltung-tsx-556" />
                      <button
                        className="btn"
                        onClick={() => void open(a)}
                      >
                        Öffnen
                      </button>

                      <button
                        className="btn"
                        onClick={() => void deleteAttachment(a.id)}
                      >
                        Entfernen
                      </button>
                    </div>


                  </div>
              )}

                {((sel as any).machineAttachments || []).length === 0 &&
              <div className="rlc-migrated-pages-buro-maschinenverwaltung-tsx-558">Keine Anhänge.</div>
              }
              </div>
            </div>
          }
        </div>
      </div>
    </div>);

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

function fmt(iso?: string) {
  return iso ? new Date(iso).toLocaleDateString() : "—";
}

function daysLeft(iso?: string) {
  if (!iso) return NaN;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

function isDue(m: Machine) {
  const d = daysLeft(m.nextService);
  return !isNaN(d) && d <= 14 || m.status === "Wartung";
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


function getAuthToken(): string {
  const keys = [
    "rlc_token",
    "token",
    "authToken",
    "accessToken",
    "rlc_auth_token",
    "rlc.auth.token",
    "rlc_mobile_token"
  ];

  for (const storage of [localStorage, sessionStorage]) {
    for (const key of keys) {
      const value = storage.getItem(key);
      if (value?.trim()) return value.trim();
    }

    try {
      const raw = storage.getItem("rlc_auth");
      if (raw) {
        const parsed = JSON.parse(raw);
        const token = parsed?.token || parsed?.accessToken;
        if (token) return String(token).trim();
      }
    } catch {}
  }

  return "";
}

async function apiRequest(path: string, init: RequestInit = {}) {
  const token = getAuthToken();

  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> || {})
  };

  if (init.body && !(init.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(apiUrl(path), {
    ...init,
    headers,
    credentials: "include"
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = data?.error || `HTTP ${res.status}`;
    console.error("Resource API Fehler:", path, message);
    throw new Error(message);
  }

  return data;
}
