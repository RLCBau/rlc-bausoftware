import React from "react";
import { PersonalDB } from "./store.personal";
import { RlcEmployee, EmpCert, EmpAttachment } from "./types";

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

const inp: React.CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: 6,
  padding: "6px 8px",
  fontSize: 13,
};

const lbl: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.8,
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
      validUntil: new Date().toISOString(),
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
    <div style={{ display: "grid", gridTemplateRows: "auto 1fr", gap: 10, padding: 10 }}>
      <div
        className="card"
        style={{ padding: "8px 10px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
      >
        <button className="btn" onClick={add}>
          + Mitarbeiter
        </button>
        <button className="btn" onClick={del} disabled={!sel}>
          Löschen
        </button>

        <div style={{ flex: 1 }} />

        <input
          placeholder="Suche Name / Rolle / Projekt…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ ...inp, width: 280 }}
        />

        <select
          value={proj}
          onChange={(e) => setProj(e.target.value)}
          style={{ ...inp, width: 160 }}
        >
          <option value="">Alle Projekte</option>
          {projects.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(460px, 48vw) 1fr",
          gap: 10,
          minHeight: "60vh",
        }}
      >
        <div className="card" style={{ padding: 0, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Rolle</th>
                <th style={th}>E-Mail</th>
                <th style={th}>Std.-Satz</th>
                <th style={th}>Projekte</th>
                <th style={th}>Abläufe</th>
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
                    onClick={() => setSelId(e.id)}
                    style={{
                      cursor: "pointer",
                      background: sel?.id === e.id ? "#f1f5ff" : undefined,
                    }}
                  >
                    <td style={td}>
                      <b>{e.name}</b>
                    </td>
                    <td style={td}>{e.role || "—"}</td>
                    <td style={td}>{e.email || "—"}</td>
                    <td style={td}>
                      {typeof e.hourlyRate === "number"
                        ? `${e.hourlyRate.toFixed(2)} €`
                        : "—"}
                    </td>
                    <td style={td}>{(e.projects || []).join(", ") || "—"}</td>
                    <td style={td}>{warn ? `⚠️ ${exp} Tg.` : "—"}</td>
                  </tr>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td style={{ ...td, opacity: 0.6 }} colSpan={6}>
                    Keine Mitarbeiter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div
          className="card"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          style={{ padding: 12 }}
        >
          {!sel ? (
            <div style={{ opacity: 0.7 }}>Links Mitarbeiter wählen oder neu anlegen.</div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "120px 1fr 120px 1fr",
                gap: 10,
              }}
            >
              <label style={lbl}>Name</label>
              <input
                style={inp}
                value={sel.name}
                onChange={(e) => up({ name: e.target.value })}
              />

              <label style={lbl}>Rolle</label>
              <input
                style={inp}
                value={sel.role ?? ""}
                onChange={(e) => up({ role: e.target.value })}
              />

              <label style={lbl}>E-Mail</label>
              <input
                style={inp}
                value={sel.email ?? ""}
                onChange={(e) => up({ email: e.target.value })}
              />

              <label style={lbl}>Telefon</label>
              <input
                style={inp}
                value={sel.phone ?? ""}
                onChange={(e) => up({ phone: e.target.value })}
              />

              <label style={lbl}>Kostenstelle</label>
              <input
                style={inp}
                value={sel.costCenter ?? ""}
                onChange={(e) => up({ costCenter: e.target.value })}
              />

              <label style={lbl}>Std.-Satz (€)</label>
              <input
                type="number"
                step="0.01"
                style={inp}
                value={sel.hourlyRate ?? 0}
                onChange={(e) => up({ hourlyRate: Number(e.target.value) || 0 })}
              />

              <label style={lbl}>Projekte</label>
              <input
                style={inp}
                placeholder="P001, P002"
                value={(sel.projects ?? []).join(", ")}
                onChange={(e) =>
                  up({
                    projects: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />

              <label style={lbl}>Anstellung</label>
              <select
                style={inp}
                value={sel.employmentType ?? "Vollzeit"}
                onChange={(e) => up({ employmentType: e.target.value as any })}
              >
                <option>Vollzeit</option>
                <option>Teilzeit</option>
                <option>Werkvertrag</option>
                <option>Praktikum</option>
              </select>

              <label style={lbl}>Vertragsbeginn</label>
              <input
                type="date"
                style={inp}
                value={toDateInput(sel.contractStart)}
                onChange={(e) => up({ contractStart: fromDateInput(e.target.value) })}
              />

              <label style={lbl}>Vertragsende</label>
              <input
                type="date"
                style={inp}
                value={toDateInput(sel.contractEnd)}
                onChange={(e) => up({ contractEnd: fromDateInput(e.target.value) })}
              />

              <label style={lbl}>Urlaub (gesamt)</label>
              <input
                type="number"
                style={inp}
                value={sel.vacationTotal ?? 25}
                onChange={(e) => up({ vacationTotal: Number(e.target.value) || 0 })}
              />

              <label style={lbl}>Urlaub (genommen)</label>
              <input
                type="number"
                style={inp}
                value={sel.vacationTaken ?? 0}
                onChange={(e) => up({ vacationTaken: Number(e.target.value) || 0 })}
              />

              <label style={{ ...lbl, gridColumn: "1 / -1" }}>
                Zertifikate &amp; Schulungen
              </label>
              <div style={{ gridColumn: "1 / -1", display: "grid", gap: 6 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button className="btn" onClick={addCert}>
                    + Zertifikat
                  </button>
                  <small style={{ opacity: 0.7 }}>
                    Warnung bei Ablauf &lt;= 30 Tage
                  </small>
                </div>

                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Bezeichnung</th>
                      <th style={th}>gültig bis</th>
                      <th style={th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(sel.certs || []).map((c) => {
                      const d = expWarn(c.validUntil);
                      const warn = d !== null && d <= 30;

                      return (
                        <tr
                          key={c.id}
                          style={{ background: warn ? "#fff3f0" : undefined }}
                        >
                          <td style={td}>
                            <input
                              style={{ ...inp, width: "100%" }}
                              value={c.name}
                              onChange={(e) =>
                                up({
                                  certs: (sel.certs || []).map((x) =>
                                    x.id === c.id ? { ...c, name: e.target.value } : x
                                  ),
                                })
                              }
                            />
                          </td>
                          <td style={td}>
                            <input
                              type="date"
                              style={inp}
                              value={toDateInput(c.validUntil)}
                              onChange={(e) =>
                                up({
                                  certs: (sel.certs || []).map((x) =>
                                    x.id === c.id
                                      ? { ...c, validUntil: fromDateInput(e.target.value) }
                                      : x
                                  ),
                                })
                              }
                            />
                            {warn && (
                              <span style={{ marginLeft: 8, color: "#c03" }}>
                                ⚠ {d} Tg
                              </span>
                            )}
                          </td>
                          <td style={{ ...td, whiteSpace: "nowrap" }}>
                            <button className="btn" onClick={() => delCert(c.id)}>
                              Entfernen
                            </button>
                          </td>
                        </tr>
                      );
                    })}

                    {(sel.certs || []).length === 0 && (
                      <tr>
                        <td style={{ ...td, opacity: 0.6 }} colSpan={3}>
                          Keine Zertifikate.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <label style={{ ...lbl, gridColumn: "1 / -1" }}>
                Dokumente (Drag&amp;Drop hier)
              </label>
              <div
                style={{
                  gridColumn: "1 / -1",
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))",
                  gap: 8,
                }}
              >
                {(sel.attachments || []).map((a) => (
                  <div
                    key={a.id}
                    style={{
                      border: "1px solid var(--line)",
                      borderRadius: 6,
                      overflow: "hidden",
                      background: "#fff",
                    }}
                  >
                    <div
                      style={{
                        padding: "6px 8px",
                        fontSize: 12,
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                      }}
                    >
                      <b
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={a.name}
                      >
                        {a.name}
                      </b>
                      <div style={{ flex: 1 }} />
                      <button className="btn" onClick={() => open(a)}>
                        Öffnen
                      </button>
                    </div>

                    {(a.mime || "").startsWith("image/") && (
                      <img
                        src={a.dataURL}
                        alt={a.name}
                        style={{ width: "100%", height: "auto", display: "block" }}
                      />
                    )}
                  </div>
                ))}

                {(sel.attachments || []).length === 0 && (
                  <div style={{ opacity: 0.6 }}>Keine Anhänge.</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
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





