// preise.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Catalog, type CatalogPos } from "./catalogStore";
import { LV, type LVPos } from "./store.lv";
// ❌ import { Projects } from "./projectStore";  // <-- RIMOSSO
import { useProject } from "../../store/useProject"; // ✅ usa lo store globale (adatta path se diverso)

type Gruppe = "Alle" | "Material" | "Arbeiter" | "Maschinen";

type BulkUpsertRow = {
  refKey: string;
  price: number;
  unit: string;
  validFrom: string; // ISO date
  validTo?: string | null;
  note?: string | null;
};

const API =
  (import.meta as any)?.env?.VITE_API_URL ||
  (import.meta as any)?.env?.VITE_BACKEND_URL ||
  "http://localhost:4000";

export default function PreisePage() {
  // ✅ PROJEKT: prende lo stesso progetto che vedi nella UI globale
  const projectState: any = useProject();
  const project =
    projectState?.project ||
    projectState?.currentProject ||
    projectState?.selectedProject ||
    projectState; // fallback: se lo store ritorna direttamente il project

  const [cat, setCat] = useState<CatalogPos[]>([]);
  const [query, setQuery] = useState("");
  const [gruppe, setGruppe] = useState<Gruppe>("Alle");
  const [allWords, setAllWords] = useState(false);
  const [wholeWords, setWholeWords] = useState(true);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [stat, setStat] = useState<string>("");
  const [err, setErr] = useState<string>("");

  // Company context (opzione 2)
  const [companyId, setCompanyId] = useState<string>("");
  const [savingPrices, setSavingPrices] = useState(false);

  // Validity inputs
  const [validFrom, setValidFrom] = useState<string>(() => new Date().toISOString().slice(0, 10)); // yyyy-mm-dd
  const [note, setNote] = useState<string>("seed-ui");

  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCat(Catalog.list());
  }, []);

  // ====== load companyId for current project (OPZIONE 2) ======
  useEffect(() => {
    let alive = true;
    setErr("");
    setCompanyId("");

    async function loadCompanyId() {
      if (!project?.id) return;

      try {
        // Assumption: GET /api/projects/:id returns { ok, project: { companyId, ... } } or { companyId }
        const r = await fetch(`${API.replace(/\/$/, "")}/api/projects/${encodeURIComponent(project.id)}`, {
          headers: { "Content-Type": "application/json" },
        });

        if (!r.ok) throw new Error(`GET project failed: ${r.status}`);
        const j = await r.json();

        const cid = j?.project?.companyId || j?.companyId || j?.data?.companyId || "";

        if (!cid) throw new Error("companyId not found in project response");

        if (alive) setCompanyId(String(cid));
      } catch (e: any) {
        if (alive) setErr(e?.message || String(e));
      }
    }

    loadCompanyId();
    return () => {
      alive = false;
    };
  }, [project?.id]);

  const gruppen: Gruppe[] = ["Alle", "Material", "Arbeiter", "Maschinen"];

  // ✅ compatibile ovunque: rimuove accenti senza \p{...}
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "");

  const tokens = useMemo(() => {
    const t = norm(query).split(/[^a-z0-9.]+/g).filter(Boolean);
    return Array.from(new Set(t));
  }, [query]);

  const matchRow = (r: CatalogPos) => {
    if (!tokens.length) return true;
    const hay = norm(`${r.posNr ?? ""} ${r.kurztext ?? ""}`);
    const check = (tok: string) => {
      if (!wholeWords) return hay.includes(tok);
      const re = new RegExp(`(^|\\W)${escapeRegex(tok)}(\\W|$)`, "i");
      return re.test(hay);
    };
    return allWords ? tokens.every(check) : tokens.some(check);
  };

  const view = useMemo(() => {
    let rows = [...cat];
    if (gruppe !== "Alle") rows = rows.filter((x) => (x.gruppe || "") === gruppe);
    rows = rows.filter(matchRow);
    return rows.slice(0, 2000);
  }, [cat, gruppe, tokens, allWords, wholeWords]);

  const counts = useMemo(() => {
    const c: Record<Gruppe, number> = { Alle: 0, Material: 0, Arbeiter: 0, Maschinen: 0 };
    for (const r of cat) {
      c.Alle++;
      if (r.gruppe === "Material") c.Material++;
      else if (r.gruppe === "Arbeiter") c.Arbeiter++;
      else if (r.gruppe === "Maschinen") c.Maschinen++;
    }
    return c;
  }, [cat]);

  const toggleAll = (checked: boolean) => {
    const next: Record<string, boolean> = {};
    if (checked) view.forEach((r) => (next[r.id] = true));
    setSelected(next);
  };

  const importCSV = (text: string) => {
    setErr("");
    const n = Catalog.importCSV(text);
    setCat(Catalog.list());
    setStat(`Importiert: ${n.toLocaleString("de-DE")} Positionen.`);
  };

  const exportCSV = () => {
    setErr("");
    const csv = Catalog.exportCSV();
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "katalog.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const addToLV = (mode: "insert" | "upsert") => {
    setErr("");
    const sel = view.filter((r) => selected[r.id]);
    if (!sel.length) {
      alert("Bitte mindestens eine Position auswählen.");
      return;
    }
    const cur = LV.list();
    const map = new Map(cur.map((x) => [x.posNr, x] as const));
    let ins = 0,
      upd = 0;

    for (const r of sel) {
      const found = map.get(r.posNr);
      if (found && mode === "upsert") {
        LV.upsert({
          ...found,
          preis: r.ep,
          kurztext: found.kurztext || r.kurztext,
          einheit: found.einheit || r.einheit,
        } as LVPos);
        upd++;
      } else if (!found) {
        LV.upsert({
          id: (crypto as any)?.randomUUID?.() ?? Math.random().toString(36).slice(2),
          posNr: r.posNr,
          kurztext: r.kurztext,
          einheit: r.einheit,
          menge: 0,
          preis: r.ep,
          confidence: undefined,
        });
        ins++;
      }
    }
    setStat(`Zum LV übernommen — neu: ${ins}, aktualisiert: ${upd}.`);
  };

  // ====== NEW: save selected to CompanyPrice (opzione 2) ======
  function toRefKey(r: CatalogPos): string {
    const pos = String(r.posNr || "").trim();
    // if already looks like LABOR:..., MACHINE:..., MATERIAL:..., keep it
    if (/^(LABOR|MACHINE|MATERIAL):/i.test(pos)) return pos.toUpperCase();

    const g = String(r.gruppe || "").trim();
    if (g === "Arbeiter") return `LABOR:${pos}`;
    if (g === "Maschinen") return `MACHINE:${pos}`;
    if (g === "Material") return `MATERIAL:${pos}`;

    // fallback: keep group-less as OTHER
    return `OTHER:${pos}`;
  }

  async function saveToCompanyPrices(mode: "insert" | "upsert") {
    setErr("");
    setStat("");

    if (!project?.id) {
      alert("Kein Projekt ausgewählt.");
      return;
    }
    if (!companyId) {
      alert("companyId konnte nicht geladen werden. Prüfe /api/projects/:id Route.");
      return;
    }

    const sel = view.filter((r) => selected[r.id]);
    if (!sel.length) {
      alert("Bitte mindestens eine Position auswählen.");
      return;
    }

    const vf = (validFrom || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(vf)) {
      alert("validFrom muss im Format YYYY-MM-DD sein.");
      return;
    }

    const rows: BulkUpsertRow[] = sel
      .filter((r) => typeof r.ep === "number" && !Number.isNaN(r.ep))
      .map((r) => ({
        refKey: toRefKey(r),
        price: Number(r.ep || 0),
        unit: String(r.einheit || "").trim() || "pauschal",
        validFrom: new Date(`${vf}T00:00:00.000Z`).toISOString(),
        validTo: null,
        note: note?.trim() ? note.trim() : null,
      }))
      .filter((x) => x.refKey && x.price >= 0);

    if (!rows.length) {
      alert("Keine gültigen Preise in der Auswahl (EP fehlt?).");
      return;
    }

    setSavingPrices(true);
    try {
      const resp = await fetch(`${API.replace(/\/$/, "")}/api/company-prices/bulk-upsert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          mode, // "insert" | "upsert"
          rows,
        }),
      });

      const j = await resp.json().catch(() => ({}));
      if (!resp.ok || j?.ok === false) {
        throw new Error(j?.error || `bulk-upsert failed: ${resp.status}`);
      }

      const inserted = Number(j?.inserted ?? 0);
      const updated = Number(j?.updated ?? 0);
      const skipped = Number(j?.skipped ?? 0);

      setStat(`CompanyPrice gespeichert — inserted: ${inserted}, updated: ${updated}, skipped: ${skipped}.`);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setSavingPrices(false);
    }
  }

  const katalogCount = Catalog.count();

  return (
    <div style={{ padding: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>Preise einfügen (Material / Arbeiter / Maschinen)</h2>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={badge}>
            {project?.id ? (
              <>
                <b>{project.number || project.code || project.id}</b>
                <span> — {project.name || "Projekt"}</span>
              </>
            ) : (
              "kein Projekt ausgewählt"
            )}
          </div>

          <div style={badge}>
            <span style={{ opacity: 0.75 }}>CompanyId:</span>{" "}
            <b style={{ fontFamily: "monospace" }}>{companyId || "—"}</b>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={panel}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            placeholder="Suche… (PosNr, Kurztext)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={input(360)}
          />
          <label style={chk}>
            <input type="checkbox" checked={allWords} onChange={(e) => setAllWords(e.target.checked)} />
            Alle Wörter (UND)
          </label>
          <label style={chk}>
            <input type="checkbox" checked={wholeWords} onChange={(e) => setWholeWords(e.target.checked)} />
            Ganze Wörter
          </label>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {gruppen.map((g) => (
              <button
                key={g}
                onClick={() => setGruppe(g)}
                style={{ ...chip, ...(gruppe === g ? chipActive : {}) }}
                title={`${g} (${counts[g].toLocaleString("de-DE")})`}
              >
                {g}
                <span style={{ opacity: 0.7, marginLeft: 6 }}>{counts[g].toLocaleString("de-DE")}</span>
              </button>
            ))}
          </div>

          <div style={{ marginLeft: "auto", color: "#666" }}>
            Katalog: <b>{katalogCount.toLocaleString("de-DE")}</b> Positionen
          </div>
        </div>

        {/* Aktionen */}
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={() => fileRef.current?.click()}>CSV-Import</button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const r = new FileReader();
              r.onload = () => importCSV(String(r.result || ""));
              r.readAsText(f, "utf-8");
            }}
          />
          <button onClick={exportCSV}>CSV-Export (Katalog)</button>

          <span style={{ width: 16 }} />

          <button onClick={() => addToLV("insert")} style={primary}>
            → Ins LV einfügen (nur neue)
          </button>
          <button onClick={() => addToLV("upsert")}>→ Aktualisieren/Einfügen ins LV (Upsert)</button>

          <span style={{ width: 16 }} />

          {/* NEW: CompanyPrice save */}
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            gültig ab
            <input
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
              style={input(140)}
              placeholder="YYYY-MM-DD"
            />
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            note
            <input value={note} onChange={(e) => setNote(e.target.value)} style={input(160)} placeholder="note" />
          </label>

          <button
            onClick={() => saveToCompanyPrices("insert")}
            disabled={savingPrices || !companyId}
            style={{ ...primary, borderColor: "#27a", background: "#eef7ff" }}
            title="Schreibt CompanyPrice für die Company des aktuellen Projekts"
          >
            → In Firmenpreise speichern (nur neue)
          </button>

          <button
            onClick={() => saveToCompanyPrices("upsert")}
            disabled={savingPrices || !companyId}
            title="Upsert CompanyPrice für die Company des aktuellen Projekts"
          >
            → In Firmenpreise speichern (Upsert)
          </button>
        </div>

        {err && <div style={{ marginTop: 8, color: "#b00020" }}>{err}</div>}
        {stat && <div style={{ marginTop: 8, color: "#0b7a3c" }}>{stat}</div>}

        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
          Mapping: Arbeiter → <code>LABOR:PosNr</code>, Maschinen → <code>MACHINE:PosNr</code>, Material → <code>MATERIAL:PosNr</code>
        </div>
      </div>

      {/* Tabelle */}
      <div style={{ marginTop: 12, border: "1px solid #eee", borderRadius: 8, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead style={{ background: "#fafafa", position: "sticky", top: 0, zIndex: 1 }}>
            <tr>
              <th style={th}>
                <input type="checkbox" onChange={(e) => toggleAll(e.target.checked)} title="Seite auswählen (max. 2000 sichtbar)" />
              </th>
              {["PosNr", "Kurztext", "ME", "EP (netto)", "Gruppe"].map((h, i) => (
                <th key={i} style={th}>
                  {h}
                </th>
              ))}
              <th style={th}>refKey (Preview)</th>
            </tr>
          </thead>
          <tbody>
            {view.map((r, i) => {
              const sel = !!selected[r.id];
              return (
                <tr key={r.id} style={{ background: i % 2 ? "#fcfcfc" : "#fff" }}>
                  <td style={tdCenter}>
                    <input
                      type="checkbox"
                      checked={sel}
                      onChange={(e) => setSelected((s) => ({ ...s, [r.id]: e.target.checked }))}
                    />
                  </td>
                  <td style={td}>{r.posNr}</td>
                  <td style={td}>{r.kurztext}</td>
                  <td style={td}>{r.einheit}</td>
                  <td style={{ ...tdNum, fontWeight: 600 }}>{fmt(r.ep)}</td>
                  <td style={td}>{r.gruppe || "–"}</td>
                  <td style={{ ...td, fontFamily: "monospace", fontSize: 12, opacity: 0.85 }}>{toRefKey(r)}</td>
                </tr>
              );
            })}
            {!view.length && (
              <tr>
                <td colSpan={7} style={{ padding: 12, color: "#777" }}>
                  Kein Ergebnis. Bitte Katalog-CSV importieren oder Filter anpassen.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- UI ---------- */
const th: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 6px",
  borderBottom: "1px solid #eee",
  whiteSpace: "nowrap",
  fontWeight: 600,
};
const td: React.CSSProperties = { padding: "6px", borderBottom: "1px solid #f5f5f5" };
const tdNum: React.CSSProperties = { ...td, textAlign: "right" };
const tdCenter: React.CSSProperties = { ...td, textAlign: "center", width: 36 };
const panel: React.CSSProperties = { border: "1px solid #eee", borderRadius: 10, background: "#fff", padding: 12, marginTop: 8 };
const input = (w?: number): React.CSSProperties => ({ width: w, padding: "6px 8px", border: "1px solid #ddd", borderRadius: 6 });
const badge: React.CSSProperties = {
  border: "1px solid #eee",
  borderRadius: 999,
  padding: "6px 12px",
  background: "#fafafa",
  display: "flex",
  gap: 8,
  alignItems: "center",
  whiteSpace: "nowrap",
};
const primary: React.CSSProperties = { fontWeight: 700, border: "1px solid #2b7", background: "#eafff4", padding: "6px 10px", borderRadius: 6 };
const chip: React.CSSProperties = { border: "1px solid #ddd", background: "#fff", borderRadius: 999, padding: "4px 10px", cursor: "pointer" };
const chipActive: React.CSSProperties = { borderColor: "#2b7", background: "#f2fffa", fontWeight: 600 };
const chk: React.CSSProperties = { display: "flex", alignItems: "center", gap: 4, fontSize: 13 };

const fmt = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n || 0);

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
