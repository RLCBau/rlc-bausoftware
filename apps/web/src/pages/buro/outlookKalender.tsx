import { rlcClass } from "../../ui/rlcRuntimeStyle";import React from "react";
import { CalendarDB } from "./store.calendar";
import { CalEvent } from "./types";

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

export default function OutlookKalender() {
  const [all, setAll] = React.useState<CalEvent[]>(CalendarDB.list());
  const [q, setQ] = React.useState("");
  const [proj, setProj] = React.useState("");
  const [showForm, setShowForm] = React.useState(false);
  const [draft, setDraft] = React.useState<CalEvent>(CalendarDB.blank());

  const refresh = React.useCallback(() => {
    setAll(CalendarDB.list());
  }, []);

  const filtered = React.useMemo(() => {
    const qq = q.trim().toLowerCase();

    return all.filter((e) => {
      const text = `${e.title} ${e.projectId ?? ""} ${e.location ?? ""}`.toLowerCase();
      const okQ = !qq || text.includes(qq);
      const okP = !proj || (e.projectId ?? "") === proj;
      return okQ && okP;
    });
  }, [all, q, proj]);

  const projects = React.useMemo(
    () => Array.from(new Set(all.map((e) => e.projectId).filter(Boolean))) as string[],
    [all]
  );

  const openForm = React.useCallback((e?: CalEvent) => {
    setDraft(e ? { ...e } : CalendarDB.blank());
    setShowForm(true);
  }, []);

  const save = React.useCallback(() => {
    if (!draft.title.trim()) {
      alert("Bitte einen Titel eingeben.");
      return;
    }
    if (!draft.start || !draft.end) {
      alert("Bitte Beginn und Ende eingeben.");
      return;
    }
    if (new Date(draft.end).getTime() < new Date(draft.start).getTime()) {
      alert("Ende darf nicht vor Beginn liegen.");
      return;
    }

    CalendarDB.upsert(draft);
    setShowForm(false);
    refresh();
  }, [draft, refresh]);

  const del = React.useCallback(
    (id: string) => {
      if (!confirm("Termin löschen?")) return;
      CalendarDB.remove(id);
      refresh();
    },
    [refresh]
  );

  const importICS = React.useCallback(() => {
    pickFile(async (f) => {
      const txt = await f.text();
      const n = CalendarDB.importICS(txt);
      alert(`Import: ${n} Termine.`);
      refresh();
    });
  }, [refresh]);

  const exportICS = React.useCallback(() => {
    downloadBlob(
      CalendarDB.exportICS(filtered),
      "kalender_export.ics",
      "text/calendar;charset=utf-8"
    );
  }, [filtered]);

  const openOutlookDesktop = React.useCallback(() => {
    const ics = CalendarDB.exportICS(filtered);
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "RLC_Kalender.ics";
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered]);

  return (
    <div className="rlc-migrated-pages-buro-outlookkalender-tsx-580">
      <div
        className="card rlc-migrated-pages-buro-outlookkalender-tsx-581">

        
        <button className="btn" onClick={() => openForm()}>
          + Neuer Termin
        </button>

        <div className="rlc-migrated-pages-buro-outlookkalender-tsx-582" />

        <input
          placeholder="Suche Titel / Ort / Projekt…"
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

        <button className="btn" onClick={importICS}>
          Import .ics
        </button>
        <button className="btn" onClick={exportICS}>
          Export .ics
        </button>
        <button className="btn" onClick={openOutlookDesktop}>
          In Outlook/Google öffnen
        </button>
      </div>

      <div className="card rlc-migrated-pages-buro-outlookkalender-tsx-583">
        <table className="rlc-migrated-pages-buro-outlookkalender-tsx-584">
          <thead>
            <tr>
              <th className={rlcClass(null, th)}>Beginn</th>
              <th className={rlcClass(null, th)}>Ende</th>
              <th className={rlcClass(null, th)}>Titel</th>
              <th className={rlcClass(null, th)}>Projekt</th>
              <th className={rlcClass(null, th)}>Ort</th>
              <th className={rlcClass(null, th)}>Teilnehmer</th>
              <th className={rlcClass(null, th)}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((ev) =>
            <tr key={ev.id}>
                <td className={rlcClass(null, td)}>{fmt(ev.start)}</td>
                <td className={rlcClass(null, td)}>{fmt(ev.end)}</td>
                <td className={rlcClass(null, td)}>
                  <b>{ev.title}</b>
                </td>
                <td className={rlcClass(null, td)}>{ev.projectId || "—"}</td>
                <td className={rlcClass(null, td)}>{ev.location || "—"}</td>
                <td className={rlcClass(null, td)}>{(ev.attendees ?? []).join(", ") || "—"}</td>
                <td className={rlcClass(null, { ...td, whiteSpace: "nowrap" })}>
                  <button className="btn" onClick={() => openForm(ev)}>
                    Bearbeiten
                  </button>
                  <button className="btn" onClick={() => del(ev.id)}>
                    Löschen
                  </button>
                </td>
              </tr>
            )}

            {filtered.length === 0 &&
            <tr>
                <td className={rlcClass(null, { ...td, opacity: 0.6 })} colSpan={7}>
                  Keine Termine.
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      {showForm &&
      <Modal onClose={() => setShowForm(false)}>
          <div className="rlc-migrated-pages-buro-outlookkalender-tsx-585">
            <label className={rlcClass(null, lbl)}>Titel</label>
            <input className={rlcClass(null,
          inp)}
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          

            <label className={rlcClass(null, lbl)}>Projekt-ID</label>
            <input className={rlcClass(null,
          inp)}
          value={draft.projectId ?? ""}
          onChange={(e) => setDraft({ ...draft, projectId: e.target.value })} />
          

            <label className={rlcClass(null, lbl)}>Beginn</label>
            <input className={rlcClass(null,
          inp)}
          type="datetime-local"
          value={toLocalInput(draft.start)}
          onChange={(e) => setDraft({ ...draft, start: fromLocalInput(e.target.value) })} />
          

            <label className={rlcClass(null, lbl)}>Ende</label>
            <input className={rlcClass(null,
          inp)}
          type="datetime-local"
          value={toLocalInput(draft.end)}
          onChange={(e) => setDraft({ ...draft, end: fromLocalInput(e.target.value) })} />
          

            <label className={rlcClass(null, lbl)}>Ort</label>
            <input className={rlcClass(null,
          inp)}
          value={draft.location ?? ""}
          onChange={(e) => setDraft({ ...draft, location: e.target.value })} />
          

            <label className={rlcClass(null, lbl)}>Teilnehmer</label>
            <input className={rlcClass(null,
          inp)}
          placeholder="mail1@..., mail2@..."
          value={(draft.attendees ?? []).join(", ")}
          onChange={(e) =>
          setDraft({
            ...draft,
            attendees: e.target.value.
            split(",").
            map((s) => s.trim()).
            filter(Boolean)
          })
          } />
          

            <label className={rlcClass(null, lbl)}>Beschreibung</label>
            <textarea className={rlcClass(null,
          { ...inp, gridColumn: "1 / -1", minHeight: 100 })}
          value={draft.notes ?? ""}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          

            <div className="rlc-migrated-pages-buro-outlookkalender-tsx-586">






            
              <button className="btn" onClick={() => setShowForm(false)}>
                Abbrechen
              </button>
              <button className="btn" onClick={save}>
                Speichern
              </button>
            </div>
          </div>
        </Modal>
      }
    </div>);

}

/* ==== Utils ==== */
function fmt(iso?: string) {
  return iso ? new Date(iso).toLocaleString() : "—";
}

function toLocalInput(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function fromLocalInput(v: string) {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

function pickFile(onPick: (f: File) => void) {
  const inp = document.createElement("input");
  inp.type = "file";
  inp.onchange = () => {
    const f = inp.files?.[0];
    if (f) onPick(f);
  };
  inp.click();
}

function downloadBlob(text: string, name: string, type: string) {
  const blob = new Blob([text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function Modal({
  children,
  onClose



}: {children: React.ReactNode;onClose: () => void;}) {
  return (
    <div className="rlc-migrated-pages-buro-outlookkalender-tsx-587">








      
      <div
        className="card rlc-migrated-pages-buro-outlookkalender-tsx-588">







        
        {children}
      </div>
    </div>);

}
