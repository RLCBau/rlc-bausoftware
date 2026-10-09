import {useMasterCatalog} from "./useMasterCatalog";
import { rlcClass } from "../../ui/rlcRuntimeStyle";import React from "react";
import { useNavigate } from "react-router-dom";
import { apiUrl } from "../../lib/apiBase";
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
  const navigate = useNavigate();
  const unitCatalog=useMasterCatalog("UNIT");

  const [all, setAll] = React.useState<MaterialItem[]>([]);
  const [selId, setSelId] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  const [proj, setProj] = React.useState("");
  const [onlyLow, setOnlyLow] = React.useState(false);
  const [draft, setDraft] = React.useState<MaterialItem | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const refresh = React.useCallback(async () => {
    const r = await apiRequest("/api/resource-costs/materials");
    const next = Array.isArray(r?.items) ? r.items : [];
    setAll(next);
    setSelId((prev) => {
      if (prev && next.some((x: MaterialItem) => x.id === prev)) return prev;
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

  const add = React.useCallback(async () => {
    const r = await apiRequest("/api/resource-costs/materials", {
      method: "POST",
      body: JSON.stringify({
        name: "Neuer Artikel",
        unit: "Stk",
        stock: 0,
        minStock: 0,
        priceNet: 0
      })
    });
    await refresh();
    if (r?.item?.id) setSelId(r.item.id);
  }, [refresh]);

  const del = React.useCallback(() => {
    if (!sel) return;
    if (!confirm("Artikel löschen?")) return;
    void apiRequest(`/api/resource-costs/materials/${encodeURIComponent(sel.id)}`, {
      method: "DELETE"
    }).then(() => refresh());
  }, [sel, refresh]);

  const patchDraft = React.useCallback(
    (patch: Partial<MaterialItem>) => {
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
        `/api/resource-costs/materials/${encodeURIComponent(sel.id)}`,
        {
          method: "PUT",
          body: JSON.stringify(draft)
        }
      );

      if (result?.item) {
        const item = {
          ...result.item,
          moves: sel.moves || [],
          materialAttachments:
            (sel as any).materialAttachments || []
        };

        setAll((rows) =>
          rows.map((row) =>
            row.id === item.id ? item : row
          )
        );

        setDraft(item);
        setDirty(false);
      }
    } catch (error: any) {
      console.error("Material speichern fehlgeschlagen", error);
      alert(error?.message || "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }, [sel, draft]);

  const move = React.useCallback(
    (dir: "IN" | "OUT") => {
      if (!sel) return;

      if (dirty) {
        alert("Bitte Änderungen zuerst speichern.");
        return;
      }

      const qty = Number(
        prompt(dir === "IN" ? "Eingang Menge:" : "Ausgang Menge:", "1")
      );
      if (!qty || qty <= 0) return;

      void apiRequest(
        `/api/resource-costs/materials/${encodeURIComponent(sel.id)}/moves`,
        {
          method: "POST",
          body: JSON.stringify({
            date: new Date().toISOString(),
            dir,
            qty,
            projectId: sel.projectId || "",
            costCenter: sel.costCenter || "",
            note: ""
          })
        }
      ).then(() => refresh());
    },
    [sel, refresh, dirty]
  );

  const uploadMaterialAttachment = React.useCallback(
    async (file: File) => {
      if (!sel) return;

      const form = new FormData();
      form.append("file", file);

      await apiRequest(
        `/api/resource-costs/materials/${encodeURIComponent(sel.id)}/attachments`,
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
        await uploadMaterialAttachment(file);
      } catch (error: any) {
        alert(
          error?.message ||
          "Datei konnte nicht hochgeladen werden."
        );
      }
    },
    [uploadMaterialAttachment]
  );

  const open = React.useCallback(
    async (a: any) => {
      if (!sel) return;

      const result = await apiRequest(
        `/api/resource-costs/materials/${encodeURIComponent(sel.id)}/attachments/${encodeURIComponent(a.id)}/open`
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
        `/api/resource-costs/materials/${encodeURIComponent(sel.id)}/attachments/${encodeURIComponent(attachmentId)}`,
        {
          method: "DELETE"
        }
      );

      await refresh();
    },
    [sel, refresh]
  );

  const pickMaterialAttachment = React.useCallback(() => {
    pickFile((file) => {
      void uploadMaterialAttachment(file).catch((error: any) => {
        alert(
          error?.message ||
          "Datei konnte nicht hochgeladen werden."
        );
      });
    });
  }, [uploadMaterialAttachment]);

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

  const active = draft || sel;

  const openBauzeitenplan = React.useCallback(() => {
    navigate("/buro/bauzeitenplan");
  }, [navigate]);

  const createTask = React.useCallback(async () => {
    if (!active) return;

    if (!active.projectId) {
      alert("Bitte zuerst ein Projekt zuordnen.");
      return;
    }

    await apiRequest("/api/tasks", {
      method: "POST",
      body: JSON.stringify({
        projectId: active.projectId,
        title: `Material prüfen / bestellen: ${active.name}`,
        description:
          `Material: ${active.name}\n` +
          `Code: ${active.code || "—"}\n` +
          `Bestand: ${active.stock ?? 0} ${active.unit || ""}\n` +
          `Mindestbestand: ${active.minStock ?? 0} ${active.unit || ""}\n` +
          `Lieferant: ${active.supplier || "—"}`,
        priority:
          Number(active.stock || 0) <= Number(active.minStock || 0)
            ? "high"
            : "med",
        tags: ["Material", "Beschaffung"],
        sourceType: "material",
        sourceId: active.id
      })
    });

    navigate("/buro/tasks");
  }, [active, navigate]);

  const openCalendar = React.useCallback(() => {
    if (!active) return;

    sessionStorage.setItem(
      "rlc.calendar.prefill",
      JSON.stringify({
        projectId: active.projectId || "",
        title: `Material / Lieferung – ${active.name}`,
        notes:
          `Material: ${active.name}\n` +
          `Code: ${active.code || "—"}\n` +
          `Lieferant: ${active.supplier || "—"}\n` +
          `Lagerort: ${active.location || "—"}`,
        category: "Lieferung",
        sourceType: "material",
        sourceId: active.id
      })
    );

    navigate("/buro/outlook?new=1");
  }, [active, navigate]);


  return (
    <div style={{ display: "grid", gap: 12 }}>






      
      <section className="rlc-page-hero rlc-page-hero--split">
        <div>
          <div className="rlc-page-hero__eyebrow">
            Büro · Ressourcen
          </div>

          <h1 style={{ margin: "3px 0 4px" }}>
            Materialverwaltung
          </h1>

          <div style={{ opacity: 0.9 }}>
            Material, Lagerbestand, Kosten, Lieferanten und Bewegungen zentral verwalten.
          </div>
        </div>

        <div className="rlc-page-hero__actions">
          <button className="btn" onClick={()=>{if(dirty&&!window.confirm("Ungespeicherte Änderungen verwerfen?"))return;navigate("/buro/zuordnungen?art=HAZARD_CLASS"+(selId?"&targetId="+encodeURIComponent(selId):""));}}>Gefahrenklassen</button>
          <button
            className="rlc-page-hero__button"
            onClick={add}
          >
            + Artikel
          </button>
        </div>
      </section>

      <div
        className="card rlc-migrated-pages-buro-materialverwaltung-tsx-560">







        

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
                <th className={rlcClass(null, th)}>Kostenstelle</th>
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
                    <td className={rlcClass(null, td)}>{it.costCenter || "—"}</td>
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
                  <td className={rlcClass(null, { ...td, opacity: 0.6 })} colSpan={9}>
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
            

              <label className={rlcClass(null, lbl)}>Code (Barcode/RFID)</label>
              <input className={rlcClass(null,
            inp)}
            value={active?.code ?? ""}
            onChange={(e) => patchDraft({ code: e.target.value })} />
            

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

              <label className={rlcClass(null, lbl)}>Ort/Lager</label>
              <input className={rlcClass(null,
            inp)}
            value={active?.location ?? ""}
            onChange={(e) => patchDraft({ location: e.target.value })} />
            

              <label className={rlcClass(null, lbl)}>Einheit</label>
              <input className={rlcClass(null,
            inp)}
            list="rlc-material-unit-catalog"
            value={active?.unit ?? ""}
            onChange={(e) => patchDraft({ unit: e.target.value })} />
              <datalist id="rlc-material-unit-catalog">{unitCatalog.items.map(x=><option key={x.id} value={x.symbol||x.code}>{x.label}</option>)}</datalist>
              {unitCatalog.error&&<span className="muted">Einheitenkatalog nicht verfügbar; vorhandene Einheit kann weiter eingegeben werden.</span>}
            

              <label className={rlcClass(null, lbl)}>Bestand</label>
              <input
              type="number" className={rlcClass(null,
              inp)}
              value={active?.stock ?? 0}
              onChange={(e) => patchDraft({ stock: Number(e.target.value) || 0 })} />
            

              <label className={rlcClass(null, lbl)}>Mindestbestand</label>
              <input
              type="number" className={rlcClass(null,
              inp)}
              value={active?.minStock ?? 0}
              onChange={(e) => patchDraft({ minStock: Number(e.target.value) || 0 })} />
            

              <label className={rlcClass(null, lbl)}>Preis Netto (€)</label>
              <input
              type="number"
              step="0.01" className={rlcClass(null,
              inp)}
              value={active?.priceNet ?? 0}
              onChange={(e) => patchDraft({ priceNet: Number(e.target.value) || 0 })} />
            

              <label className={rlcClass(null, lbl)}>Lieferant</label>
              <input className={rlcClass(null,
            inp)}
            value={active?.supplier ?? ""}
            onChange={(e) => patchDraft({ supplier: e.target.value })} />
            

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

              <div
                style={{
                  gridColumn: "1 / -1",
                  display: "flex",
                  alignItems: "center",
                  gap: 8
                }}
              >
                <label className={rlcClass(null, lbl)}>
                  Dokumente / Bilder
                </label>

                <div style={{ flex: 1 }} />

                <button
                  className="btn"
                  onClick={pickMaterialAttachment}
                >
                  + Datei
                </button>
              </div>
              <div className="rlc-migrated-pages-buro-materialverwaltung-tsx-573">






              
                {(((sel as any).materialAttachments || []) as any[]).map((a) =>
              <div
                key={a.id} className="rlc-migrated-pages-buro-materialverwaltung-tsx-574">






                
                    <div className="rlc-migrated-pages-buro-materialverwaltung-tsx-575">







                  
                      <b





                    title={a.name} className="rlc-migrated-pages-buro-materialverwaltung-tsx-576">
                    
                        {a.name}
                      </b>
                      <div className="rlc-migrated-pages-buro-materialverwaltung-tsx-577" />
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

                    {(a.mime || "").startsWith("image/") &&
                <img
                  src={a.dataURL}
                  alt={a.name} className="rlc-migrated-pages-buro-materialverwaltung-tsx-578" />






                }
                  </div>
              )}

                {((sel as any).materialAttachments || []).length === 0 &&
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
