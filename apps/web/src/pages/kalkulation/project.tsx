import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/kalkulation/project.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Projects, type Project } from "./projectStore";
import { setCurrentProjectId } from "../../utils/project";

type ModuleTarget =
"manuell" |
"ki" |
"gaeb" |
"angebot" |
"vergleich" |
"preise" |
"nachtraege";

function safeId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function normalizeProjectNumber(value: string): string {
  return String(value || "").
  trim().
  toUpperCase().
  replace(/\s+/g, "-");
}

function getProjectCode(p: Project): string {
  return String((p as any).code || p.number || "").trim().toUpperCase();
}

function asNumericProjectId(p: Project): number {
  const raw = (p as any).dbId ?? (p as any).projectId;

  if (raw !== undefined && !Number.isNaN(Number(raw))) {
    return Number(raw);
  }

  const basis = String(
    (p as any).id ?? (p as any).number ?? (p as any).name ?? "project"
  );

  let h = 0;
  for (let i = 0; i < basis.length; i += 1) {
    h = (h << 5) - h + basis.charCodeAt(i) | 0;
  }

  return Math.abs(h % 9000000) + 1000000;
}

function formatDate(value: unknown): string {
  const d = new Date(String(value || ""));
  if (Number.isNaN(d.getTime())) return "—";

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(d);
}

function projectMatches(p: Project, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;

  const hay = [
  p.number,
  (p as any).code,
  p.name,
  p.client,
  p.location,
  (p as any).place,
  (p as any).ort].

  filter(Boolean).
  join(" ").
  toLowerCase();

  return hay.includes(s);
}

function buildRoute(target: ModuleTarget, p: Project): string {
  const code = encodeURIComponent(getProjectCode(p));
  const numericId = asNumericProjectId(p);

  if (target === "manuell") {
    return `/kalkulation/manuell?projectCode=${code}`;
  }

  if (target === "ki") {
    return `/kalkulation/mit-ki?projectCode=${code}`;
  }

  if (target === "gaeb") {
    return `/kalkulation/gaeb?projectCode=${code}`;
  }

  if (target === "angebot") {
    return `/kalkulation/angebot?projectCode=${code}`;
  }

  if (target === "preise") {
    return `/kalkulation/preise?projectCode=${code}`;
  }

  if (target === "nachtraege") {
    return `/kalkulation/nachtraege?projectCode=${code}`;
  }

  return `/kalkulation/versionsvergleich?projectId=${numericId}&projectCode=${code}`;
}

export default function ProjektPage() {
  const navigate = useNavigate();

  const [rows, setRows] = useState<Project[]>([]);
  const [q, setQ] = useState("");
  const [info, setInfo] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const list = Projects.list();
    setRows(list);

    const cur = Projects.getCurrent?.();
    if (cur?.id) setSelectedId(cur.id);
  }, []);

  const selectedProject = useMemo(() => {
    return rows.find((p) => p.id === selectedId) || Projects.getCurrent?.() || null;
  }, [rows, selectedId]);

  const filtered = useMemo(() => {
    return rows.filter((p) => projectMatches(p, q));
  }, [rows, q]);

  const stats = useMemo(() => {
    return {
      total: rows.length,
      filtered: filtered.length,
      active: selectedProject ? getProjectCode(selectedProject) : "—"
    };
  }, [rows, filtered.length, selectedProject]);

  function refresh() {
    const list = Projects.list();
    setRows(list);

    const cur = Projects.getCurrent?.();
    setSelectedId(cur?.id || "");
  }

  function selectProject(p: Project) {
    Projects.setCurrent(p.id);
    setCurrentProjectId(asNumericProjectId(p));
    setSelectedId(p.id);
    setInfo(`Projekt aktiv: ${getProjectCode(p)} — ${p.name}`);
  }

  function openProject(p: Project, target: ModuleTarget) {
    selectProject(p);
    navigate(buildRoute(target, p));
  }

  function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const fd = new FormData(e.currentTarget);

    const number = normalizeProjectNumber(String(fd.get("number") || ""));
    const name = String(fd.get("name") || "").trim();
    const client = String(fd.get("client") || "").trim();
    const location = String(fd.get("location") || "").trim();

    if (!/^[A-Z0-9\-_.]+$/i.test(number)) {
      alert("BaustellenNummer: nur A-Z, 0-9, - _ .");
      return;
    }

    if (name.length < 3) {
      alert("Projektname zu kurz.");
      return;
    }

    const existing = Projects.list().find(
      (p) => String(p.number || "").toUpperCase() === number
    );

    if (existing && !confirm("Diese BaustellenNummer existiert bereits. Aktualisieren?")) {
      return;
    }

    const item = Projects.upsert({
      id: existing?.id || safeId(),
      number,
      name,
      client,
      location,
      createdAt: existing?.createdAt || new Date().toISOString()
    } as Project);

    Projects.setCurrent(item.id);
    setCurrentProjectId(asNumericProjectId(item));

    setRows(Projects.list());
    setSelectedId(item.id);
    setInfo(`Projekt gespeichert und aktiviert: ${number} — ${name}`);

    e.currentTarget.reset();
  }

  function del(p: Project) {
    if (!confirm(`Projekt wirklich löschen?\n\n${getProjectCode(p)} — ${p.name}`)) {
      return;
    }

    Projects.remove(p.id);

    const list = Projects.list();
    setRows(list);

    const cur = Projects.getCurrent?.();
    setSelectedId(cur?.id || "");

    setInfo("Projekt gelöscht.");
  }

  function exportJSON() {
    const blob = new Blob([Projects.exportJSON()], {
      type: "application/json;charset=utf-8"
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = "rlc_projects.json";
    a.click();

    URL.revokeObjectURL(url);
  }

  function importJSON(text: string) {
    try {
      Projects.importJSON(text);
      refresh();
      setInfo("Projektdatei importiert.");
    } catch (e: any) {
      alert(`Import fehlgeschlagen: ${e?.message || e}`);
    }
  }

  function suggestNumber() {
    const y = new Date().getFullYear();
    const n = Math.floor(Math.random() * 900 + 100);
    const input = document.querySelector(
      'input[name="number"]'
    ) as HTMLInputElement | null;

    if (input) input.value = `BA-${y}-${n}`;
  }

  return (
    <div className={rlcClass(null, page)}>
      <section className={rlcClass("rlc-page-hero", hero)}>
        <div>
          <div className={rlcClass(null, eyebrow)}>RLC Bausoftware · Kalkulation</div>
          <h1 className={rlcClass(null, title)}>Projekt auswählen</h1>
          <p className={rlcClass(null, subtitle)}>
            Projekt anlegen, aktivieren und direkt in Manuell, KI, GAEB,
            Preise, Nachträge oder Angebotsanalyse weiterarbeiten.
          </p>
        </div>

        <div className={rlcClass(null, heroStats)}>
          <Kpi label="Projekte" value={String(stats.total)} />
          <Kpi label="Treffer" value={String(stats.filtered)} />
          <Kpi label="Aktiv" value={stats.active} />
        </div>
      </section>

      {info ? <div className={rlcClass(null, infoBox)}>{info}</div> : null}

      <div className={rlcClass(null, layout)}>
        <section className={rlcClass(null, card)}>
          <div className={rlcClass(null, sectionHead)}>
            <div>
              <h2 className={rlcClass(null, sectionTitle)}>Projektliste</h2>
              <div className={rlcClass(null, sectionText)}>
                Wähle ein Projekt aus und öffne direkt das gewünschte Modul.
              </div>
            </div>

            <div className={rlcClass(null, toolbar)}>
              <input
                placeholder="Suche: Name / BaustellenNr / Kunde / Ort"
                value={q}
                onChange={(e) => setQ(e.target.value)} className={rlcClass(null,
                searchInput)} />
              

              <button type="button" className={rlcClass(null, btnSecondary)} onClick={exportJSON}>
                Export
              </button>

              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"

                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;

                  const r = new FileReader();
                  r.onload = () => importJSON(String(r.result || ""));
                  r.readAsText(f, "utf-8");

                  e.currentTarget.value = "";
                }} className="rlc-migrated-pages-kalkulation-project-tsx-932" />
              

              <button
                type="button" className={rlcClass(null,
                btnSecondary)}
                onClick={() => fileRef.current?.click()}>
                
                Import
              </button>
            </div>
          </div>

          <div className={rlcClass(null, tableWrap)}>
            <table className={rlcClass(null, table)}>
              <thead>
                <tr>
                  <th className={rlcClass(null, th)}>Status</th>
                  <th className={rlcClass(null, th)}>BaustellenNr</th>
                  <th className={rlcClass(null, th)}>Projektname</th>
                  <th className={rlcClass(null, th)}>Kunde</th>
                  <th className={rlcClass(null, th)}>Ort</th>
                  <th className={rlcClass(null, th)}>Erstellt</th>
                  <th className={rlcClass(null, th)}>Aktionen</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((p) => {
                  const active = selectedProject?.id === p.id;
                  const code = getProjectCode(p);

                  return (
                    <tr
                      key={p.id} className={rlcClass(null,
                      {
                        background: active ? "#EAF2FF" : "#FFFFFF"
                      })}>
                      
                      <td className={rlcClass(null, td)}>
                        <span className={rlcClass(null, active ? badgeActive : badgeNeutral)}>
                          {active ? "Aktiv" : "—"}
                        </span>
                      </td>

                      <td className={rlcClass(null, tdStrong)}>{code || "—"}</td>
                      <td className={rlcClass(null, td)}>{p.name || "—"}</td>
                      <td className={rlcClass(null, td)}>{p.client || "—"}</td>
                      <td className={rlcClass(null, td)}>{p.location || "—"}</td>
                      <td className={rlcClass(null, td)}>{formatDate((p as any).createdAt)}</td>

                      <td className={rlcClass(null, td)}>
                        <div className={rlcClass(null, buttonGroup)}>
                          <button
                            type="button" className={rlcClass(null,
                            active ? btnPrimarySmall : btnSecondarySmall)}
                            onClick={() => selectProject(p)}>
                            
                            Aktivieren
                          </button>

                          <button
                            type="button" className={rlcClass(null,
                            btnSecondarySmall)}
                            onClick={() => openProject(p, "manuell")}>
                            
                            Manuell
                          </button>

                          <button
                            type="button" className={rlcClass(null,
                            btnPrimarySmall)}
                            onClick={() => openProject(p, "ki")}>
                            
                            KI
                          </button>

                          <button
                            type="button" className={rlcClass(null,
                            btnSecondarySmall)}
                            onClick={() => openProject(p, "gaeb")}>
                            
                            GAEB
                          </button>

                          <button
                            type="button" className={rlcClass(null,
                            btnSecondarySmall)}
                            onClick={() => openProject(p, "angebot")}>
                            
                            Angebot
                          </button>

                          <button
                            type="button" className={rlcClass(null,
                            btnSecondarySmall)}
                            onClick={() => openProject(p, "vergleich")}>
                            
                            Analyse
                          </button>

                          <button
                            type="button" className={rlcClass(null,
                            btnDangerSmall)}
                            onClick={() => del(p)}>
                            
                            Löschen
                          </button>
                        </div>
                      </td>
                    </tr>);

                })}

                {!filtered.length ?
                <tr>
                    <td colSpan={7} className={rlcClass(null, emptyCell)}>
                      Keine Projekte gefunden.
                    </td>
                  </tr> :
                null}
              </tbody>
            </table>
          </div>
        </section>

        <aside className={rlcClass(null, sideCard)}>
          <div className={rlcClass(null, sectionHead)}>
            <div>
              <h2 className={rlcClass(null, sectionTitle)}>Projekt erstellen</h2>
              <div className={rlcClass(null, sectionText)}>
                Neues Projekt lokal anlegen und direkt als aktives Projekt setzen.
              </div>
            </div>
          </div>

          <form onSubmit={create} className={rlcClass(null, form)}>
            <Field label="BaustellenNummer *" hint="z. B. BA-2026-001">
              <input
                name="number"
                required
                placeholder="BA-2026-001"
                pattern="[A-Za-z0-9_.-]+"
                title="Nur Buchstaben, Ziffern, -, _, ." className={rlcClass(null,
                input)} />
              
            </Field>

            <Field label="Projektname *" hint="Kurze, eindeutige Bezeichnung">
              <input
                name="name"
                required
                placeholder="Erneuerung TWL BA III/IV" className={rlcClass(null,
                input)} />
              
            </Field>

            <Field label="Auftraggeber">
              <input
                name="client"
                placeholder="Gemeinde / Auftraggeber" className={rlcClass(null,
                input)} />
              
            </Field>

            <Field label="Ort">
              <input name="location" placeholder="Ort / Baustelle" className={rlcClass(null, input)} />
            </Field>

            <div className={rlcClass(null, formActions)}>
              <button type="submit" className={rlcClass(null, btnPrimary)}>
                Projekt anlegen
              </button>

              <button type="button" className={rlcClass(null, btnSecondary)} onClick={suggestNumber}>
                Nummer vorschlagen
              </button>
            </div>
          </form>

          <div className={rlcClass(null, currentBox)}>
            <div className={rlcClass(null, currentLabel)}>Aktuelles Projekt</div>

            {selectedProject ?
            <>
                <div className={rlcClass(null, currentTitle)}>
                  {getProjectCode(selectedProject)} — {selectedProject.name}
                </div>

                <div className={rlcClass(null, currentSub)}>
                  {selectedProject.client || "Kein Auftraggeber"} ·{" "}
                  {selectedProject.location || "Kein Ort"}
                </div>

                <div className={rlcClass(null, quickActions)}>
                  <button
                  type="button" className={rlcClass(null,
                  btnSecondarySmall)}
                  onClick={() => openProject(selectedProject, "manuell")}>
                  
                    Manuell
                  </button>

                  <button
                  type="button" className={rlcClass(null,
                  btnPrimarySmall)}
                  onClick={() => openProject(selectedProject, "ki")}>
                  
                    KI
                  </button>

                  <button
                  type="button" className={rlcClass(null,
                  btnSecondarySmall)}
                  onClick={() => openProject(selectedProject, "gaeb")}>
                  
                    GAEB
                  </button>

                  <button
                  type="button" className={rlcClass(null,
                  btnSecondarySmall)}
                  onClick={() => openProject(selectedProject, "nachtraege")}>
                  
                    Nachträge
                  </button>
                </div>
              </> :

            <div className={rlcClass(null, muted)}>Kein Projekt ausgewählt.</div>
            }
          </div>
        </aside>
      </div>
    </div>);

}

function Kpi({ label, value }: {label: string;value: string;}) {
  return (
    <div className={rlcClass(null, kpi)}>
      <div className={rlcClass(null, kpiLabel)}>{label}</div>
      <div className={rlcClass(null, kpiValue)}>{value}</div>
    </div>);

}

function Field({
  label,
  hint,
  children




}: {label: string;hint?: string;children: React.ReactNode;}) {
  return (
    <label className={rlcClass(null, field)}>
      <span className={rlcClass(null, labelStyle)}>{label}</span>
      {children}
      {hint ? <small className={rlcClass(null, hintStyle)}>{hint}</small> : null}
    </label>);

}

/* ===================== STYLES ===================== */

const page: React.CSSProperties = {
  display: "grid",
  gap: 16,
  padding: 16
};

const hero: React.CSSProperties = {
  background: "linear-gradient(135deg, #0B5BD3 0%, #0B5BD3 48%, #146EF5 100%)",
  color: "#FFFFFF",
  borderRadius: 18,
  padding: 22,
  display: "flex",
  justifyContent: "space-between",
  gap: 18,
  flexWrap: "wrap",
  boxShadow: "0 16px 40px rgba(15,23,42,0.18)"
};

const eyebrow: React.CSSProperties = {
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  opacity: 0.8,
  fontWeight: 700
};

const title: React.CSSProperties = {
  margin: "4px 0",
  fontSize: 30,
  fontWeight: 700
};

const subtitle: React.CSSProperties = {
  margin: 0,
  maxWidth: 760,
  opacity: 0.88,
  lineHeight: 1.55
};

const heroStats: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3,minmax(95px,1fr))",
  gap: 10,
  minWidth: 320
};

const kpi: React.CSSProperties = {
  background: "rgba(255,255,255,0.10)",
  border: "1px solid rgba(255,255,255,0.18)",
  borderRadius: 14,
  padding: 12
};

const kpiLabel: React.CSSProperties = {
  fontSize: 11,
  opacity: 0.78,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em"
};

const kpiValue: React.CSSProperties = {
  marginTop: 4,
  fontSize: 18,
  fontWeight: 700,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis"
};

const layout: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0,2fr) 390px",
  gap: 16,
  alignItems: "start"
};

const card: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)"
};

const sideCard: React.CSSProperties = {
  ...card,
  position: "sticky",
  top: 12
};

const sectionHead: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
  marginBottom: 12
};

const sectionTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 17,
  color: "#0F172A",
  fontWeight: 700
};

const sectionText: React.CSSProperties = {
  marginTop: 4,
  fontSize: 13,
  color: "#64748B",
  lineHeight: 1.45
};

const toolbar: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap"
};

const searchInput: React.CSSProperties = {
  width: 330,
  border: "1px solid #D1D5DB",
  borderRadius: 10,
  padding: "9px 11px",
  fontSize: 13,
  boxSizing: "border-box"
};

const tableWrap: React.CSSProperties = {
  border: "1px solid #E5E7EB",
  borderRadius: 12,
  overflow: "auto"
};

const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 1050
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 9px",
  fontSize: 12,
  color: "#475569",
  background: "#F8FAFC",
  borderBottom: "1px solid #E5E7EB",
  whiteSpace: "nowrap",
  fontWeight: 700
};

const td: React.CSSProperties = {
  padding: "9px",
  fontSize: 13,
  color: "#0F172A",
  borderBottom: "1px solid #F1F5F9",
  verticalAlign: "middle"
};

const tdStrong: React.CSSProperties = {
  ...td,
  fontWeight: 700,
  whiteSpace: "nowrap"
};

const emptyCell: React.CSSProperties = {
  padding: 18,
  color: "#64748B",
  fontSize: 13
};

const buttonGroup: React.CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap"
};

const btnBase: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: 10,
  padding: "9px 13px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap"
};

const btnPrimary: React.CSSProperties = {
  ...btnBase,
  border: "1px solid #146EF5",
  background: "#146EF5",
  color: "#FFFFFF"
};

const btnSecondary: React.CSSProperties = {
  ...btnBase,
  background: "#FFFFFF",
  color: "#0F172A"
};

const btnPrimarySmall: React.CSSProperties = {
  ...btnPrimary,
  padding: "6px 9px",
  fontSize: 12,
  borderRadius: 8
};

const btnSecondarySmall: React.CSSProperties = {
  ...btnSecondary,
  padding: "6px 9px",
  fontSize: 12,
  borderRadius: 8
};

const btnDangerSmall: React.CSSProperties = {
  border: "1px solid #FECACA",
  background: "#FEF2F2",
  color: "#B91C1C",
  borderRadius: 8,
  padding: "6px 9px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer"
};

const form: React.CSSProperties = {
  display: "grid",
  gap: 12
};

const field: React.CSSProperties = {
  display: "grid",
  gap: 5
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#64748B",
  fontWeight: 700
};

const hintStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#94A3B8"
};

const input: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: 10,
  padding: "9px 11px",
  fontSize: 13,
  width: "100%",
  boxSizing: "border-box"
};

const formActions: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 4
};

const currentBox: React.CSSProperties = {
  marginTop: 18,
  padding: 14,
  border: "1px solid #DBEAFE",
  borderRadius: 14,
  background: "#EAF2FF"
};

const currentLabel: React.CSSProperties = {
  fontSize: 12,
  color: "#1E3A8A",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em"
};

const currentTitle: React.CSSProperties = {
  marginTop: 6,
  color: "#0F172A",
  fontSize: 15,
  fontWeight: 700,
  lineHeight: 1.35
};

const currentSub: React.CSSProperties = {
  marginTop: 4,
  color: "#64748B",
  fontSize: 13
};

const quickActions: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 12
};

const badgeNeutral: React.CSSProperties = {
  display: "inline-flex",
  border: "1px solid #CBD5E1",
  background: "#F8FAFC",
  color: "#475569",
  borderRadius: 999,
  padding: "4px 9px",
  fontSize: 11,
  fontWeight: 700
};

const badgeActive: React.CSSProperties = {
  ...badgeNeutral,
  border: "1px solid #BED6FF",
  background: "#DBEAFE",
  color: "#0B5BD3"
};

const infoBox: React.CSSProperties = {
  border: "1px solid #BBF7D0",
  background: "#F0FDF4",
  color: "#14532D",
  borderRadius: 12,
  padding: "10px 12px",
  fontSize: 13,
  fontWeight: 600
};

const muted: React.CSSProperties = {
  color: "#64748B",
  fontSize: 13
};
