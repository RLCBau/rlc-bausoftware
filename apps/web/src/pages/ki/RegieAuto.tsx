import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/ki/RegieAuto.tsx

import React, { useMemo, useRef, useState } from "react";
import { useProject } from "../../store/useProject";

/** ===== Types ===== */
type RecognizedAufmass = {
  id: string;
  position?: string;
  kurztext?: string;
  einheit?: string;
  menge?: number;
  kommentar?: string;
};

type RecognizedLieferschein = {
  id: string;
  lieferant?: string;
  datum?: string;
  material?: string;
  menge?: number;
  einheit?: string;
  preis?: number;
  kostenstelle?: string;
  belegUrl?: string;
};

type UploadResult = {
  fileId: string;
  url: string;
  ocrText?: string;
};

type UploadApiResponse = {
  files?: UploadResult[];
  recognized?: {
    aufmass?: RecognizedAufmass[];
    lieferscheine?: RecognizedLieferschein[];
  };
};

type GenerateApiResponse = {
  pdfUrl?: string;
};

type ProjectLike = {
  id?: string;
  code?: string;
};

const shell: React.CSSProperties = {
  display: "grid",
  gap: 16,
  padding: 24
};

const card: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: 16,
  background: "#fff"
};

const input: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 14,
  width: "100%"
};

const btn: React.CSSProperties = {
  padding: "8px 12px",
  border: "1px solid #cbd5e1",
  background: "#fff",
  borderRadius: 8,
  fontSize: 13,
  cursor: "pointer"
};

const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse"
};

const th: React.CSSProperties = {
  borderBottom: "1px solid #ccc",
  textAlign: "left",
  padding: 8,
  background: "#f8fafc"
};

const td: React.CSSProperties = {
  padding: 6,
  borderBottom: "1px solid #eee",
  verticalAlign: "top"
};

/** ===== Component ===== */
export default function RegieAuto() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const projectCtx = useProject() as unknown as {
    currentProject?: ProjectLike | null;
  };

  const currentProject = projectCtx?.currentProject ?? null;
  const storeProjectId = currentProject?.id ?? "";
  const projectCode = currentProject?.code ?? "";

  const [projectInput, setProjectInput] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [uploads, setUploads] = useState<UploadResult[]>([]);
  const [aufmass, setAufmass] = useState<RecognizedAufmass[]>([]);
  const [scheine, setScheine] = useState<RecognizedLieferschein[]>([]);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pdfUrl, setPdfUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [personal, setPersonal] = useState("");
  const [geraete, setGeraete] = useState("");
  const [arbeitszeit, setArbeitszeit] = useState("");
  const [ort, setOrt] = useState("");
  const [wetter, setWetter] = useState("");
  const [bemerkung, setBemerkung] = useState("");

  const effectiveProjectId = useMemo(
    () => projectInput.trim() || storeProjectId || projectCode || "",
    [projectInput, storeProjectId, projectCode]
  );

  const canGenerate = useMemo(
    () =>
    effectiveProjectId.trim().length > 0 && (
    aufmass.length > 0 ||
    scheine.length > 0 ||
    !!personal.trim() ||
    !!geraete.trim() ||
    !!arbeitszeit.trim() ||
    !!bemerkung.trim()),
    [effectiveProjectId, aufmass, scheine, personal, geraete, arbeitszeit, bemerkung]
  );

  /** ===== Upload & KI ===== */
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files || e.target.files.length === 0) return;
    if (!effectiveProjectId) {
      window.alert("Projekt-ID fehlt.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const fd = new FormData();
      Array.from(e.target.files).forEach((f) => fd.append("files", f));
      fd.append("projectId", effectiveProjectId);
      if (projectCode) fd.append("projectCode", projectCode);

      const res = await fetch("/api/ki/regie/upload", {
        method: "POST",
        body: fd
      });

      if (!res.ok) throw new Error(await res.text());

      const data = (await res.json()) as UploadApiResponse;

      const nextFiles = Array.isArray(data?.files) ?
      data.files.map(normalizeUpload) :
      [];
      const nextAufmass = Array.isArray(data?.recognized?.aufmass) ?
      data.recognized.aufmass.map(normalizeAufmass) :
      [];
      const nextScheine = Array.isArray(data?.recognized?.lieferscheine) ?
      data.recognized.lieferscheine.map(normalizeLieferschein) :
      [];

      setUploads((p) => [...p, ...nextFiles]);
      setAufmass((p) => [...p, ...nextAufmass]);
      setScheine((p) => [...p, ...nextScheine]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload/Erkennung fehlgeschlagen";
      setError(msg);
      window.alert(`Upload/Erkennung fehlgeschlagen: ${msg}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  /** ===== Commit in Mengenermittlung ===== */
  async function commitToMengenermittlung() {
    if (!effectiveProjectId || aufmass.length === 0) return;

    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/ki/regie/commit/mengen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: effectiveProjectId,
          projectCode: projectCode || "",
          date,
          aufmass
        })
      });

      if (!res.ok) throw new Error(await res.text());
      window.alert("Aufmaß in Mengenermittlung übernommen.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Fehler Mengenermittlung";
      setError(msg);
      window.alert(`Fehler Mengenermittlung: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  /** ===== Salva Regiebericht (JSON) ===== */
  async function saveRegieJson() {
    if (!effectiveProjectId) {
      window.alert("Projekt-ID fehlt.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/ki/regie/commit/regiebericht", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: effectiveProjectId,
          projectCode: projectCode || "",
          date,
          meta: { personal, geraete, arbeitszeit, ort, wetter, bemerkung },
          aufmass,
          lieferscheine: scheine,
          fotos: uploads.map((u) => u.url)
        })
      });

      if (!res.ok) throw new Error(await res.text());
      window.alert("Regiebericht gespeichert.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Fehler Speichern";
      setError(msg);
      window.alert(`Fehler Speichern: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  /** ===== PDF ===== */
  async function generatePDF() {
    if (!effectiveProjectId) {
      window.alert("Projekt-ID fehlt.");
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/ki/regie/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: effectiveProjectId,
          projectCode: projectCode || "",
          date,
          photos: uploads.map((u) => u.url),
          items: { aufmass, lieferscheine: scheine },
          meta: { personal, geraete, arbeitszeit, ort, wetter, bemerkung },
          participants: { bauleiter: "", auftraggeber: "" }
        })
      });

      if (!res.ok) throw new Error(await res.text());

      const data = (await res.json()) as GenerateApiResponse;
      setPdfUrl(String(data?.pdfUrl || ""));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Fehler bei Generierung";
      setError(msg);
      window.alert(`Fehler bei Generierung: ${msg}`);
    } finally {
      setGenerating(false);
    }
  }

  /** ===== UI Helpers ===== */
  const fmt = (v: unknown) => v === undefined || v === null ? "" : String(v);

  function addAufmass() {
    setAufmass((r) => [
    ...r,
    {
      id: `A_${Date.now()}`,
      position: "",
      kurztext: "",
      einheit: "m",
      menge: 0
    }]
    );
  }

  function addSchein() {
    setScheine((r) => [
    ...r,
    {
      id: `L_${Date.now()}`,
      lieferant: "",
      datum: date,
      menge: 0,
      einheit: "stk"
    }]
    );
  }

  function updateAufmass(i: number, patch: Partial<RecognizedAufmass>) {
    setAufmass((rows) =>
    rows.map((r, idx) =>
    idx === i ? normalizeAufmass({ ...r, ...patch }) : r
    )
    );
  }

  function updateSchein(i: number, patch: Partial<RecognizedLieferschein>) {
    setScheine((rows) =>
    rows.map((r, idx) =>
    idx === i ? normalizeLieferschein({ ...r, ...patch }) : r
    )
    );
  }

  return (
    <div className={rlcClass(null, shell)}>
      <h1>Regieberichte automatisch generieren</h1>

      <div className={rlcClass(null, card)}>
        <div className="rlc-migrated-pages-ki-regieauto-tsx-1026">

          
          <label>
            Projekt-ID:&nbsp;
            <input className={rlcClass(null,
            input)}
            value={projectInput}
            onChange={(e) => setProjectInput(e.target.value)}
            placeholder="P-2025-001" />
            
          </label>

          <label>
            Datum:&nbsp;
            <input className={rlcClass(null,
            input)}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)} />
            
          </label>

          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.heic,.pdf"
            multiple
            onChange={handleUpload} className="rlc-migrated-pages-ki-regieauto-tsx-1027" />

          
        </div>

        <div className="rlc-migrated-pages-ki-regieauto-tsx-1028">
          Aktiv: {effectiveProjectId || "kein Projekt gewählt"}
        </div>

        {error &&
        <div className="rlc-migrated-pages-ki-regieauto-tsx-1029">
            {error}
          </div>
        }
      </div>

      <div className={rlcClass(null, { ...card, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 })}>
        <input className={rlcClass(null,
        input)}
        placeholder="Personal (Namen)"
        value={personal}
        onChange={(e) => setPersonal(e.target.value)} />
        
        <input className={rlcClass(null,
        input)}
        placeholder="Geräte/Maschinen"
        value={geraete}
        onChange={(e) => setGeraete(e.target.value)} />
        
        <input className={rlcClass(null,
        input)}
        placeholder="Arbeitszeit (z. B. 07:30–16:30, 8h)"
        value={arbeitszeit}
        onChange={(e) => setArbeitszeit(e.target.value)} />
        
        <input className={rlcClass(null,
        input)}
        placeholder="Ort/Bereich"
        value={ort}
        onChange={(e) => setOrt(e.target.value)} />
        
        <input className={rlcClass(null,
        input)}
        placeholder="Wetter"
        value={wetter}
        onChange={(e) => setWetter(e.target.value)} />
        
        <input className={rlcClass(null,
        input)}
        placeholder="Bemerkung"
        value={bemerkung}
        onChange={(e) => setBemerkung(e.target.value)} />
        
      </div>

      {uploads.length > 0 &&
      <div className={rlcClass(null, card)}>
          <h3 className="rlc-migrated-pages-ki-regieauto-tsx-1030">Fotos / Belege</h3>
          <div className="rlc-migrated-pages-ki-regieauto-tsx-1031">
            {uploads.map((f) =>
          <div
            key={f.fileId} className="rlc-migrated-pages-ki-regieauto-tsx-1032">

            
                <div className="rlc-migrated-pages-ki-regieauto-tsx-1033">{f.fileId}</div>
                {/\.(pdf)$/i.test(f.url) ?
            <a href={f.url} target="_blank" rel="noopener noreferrer">
                    Öffnen
                  </a> :

            <img
              src={f.url}
              alt="" className="rlc-migrated-pages-ki-regieauto-tsx-1034" />


            }
              </div>
          )}
          </div>
        </div>
      }

      <div className={rlcClass(null, card)}>
        <h3 className="rlc-migrated-pages-ki-regieauto-tsx-1035">Erkannte / manuelle Aufmaß-Positionen</h3>
        <button onClick={addAufmass} className={rlcClass(null, { ...btn, marginTop: 8, marginBottom: 8 })}>
          Zeile hinzufügen
        </button>

        <table className={rlcClass(null, table)}>
          <thead>
            <tr>
              {["Pos.", "Kurztext", "Einh.", "Menge", "Kommentar"].map((h) =>
              <th key={h} className={rlcClass(null, th)}>
                  {h}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {aufmass.length === 0 &&
            <tr>
                <td colSpan={5} className="rlc-migrated-pages-ki-regieauto-tsx-1036">
                  Keine Positionen.
                </td>
              </tr>
            }

            {aufmass.map((r, i) =>
            <tr key={r.id}>
                <td className={rlcClass(null, td)}>
                  <input className={rlcClass(null,
                input)}
                value={fmt(r.position)}
                onChange={(e) => updateAufmass(i, { position: e.target.value })} />
                
                </td>
                <td className={rlcClass(null, td)}>
                  <input className={rlcClass(null,
                input)}
                value={fmt(r.kurztext)}
                onChange={(e) => updateAufmass(i, { kurztext: e.target.value })} />
                
                </td>
                <td className={rlcClass(null, { ...td, width: 90 })}>
                  <input className={rlcClass(null,
                input)}
                value={fmt(r.einheit)}
                onChange={(e) => updateAufmass(i, { einheit: e.target.value })} />
                
                </td>
                <td className={rlcClass(null, { ...td, width: 120 })}>
                  <input className={rlcClass(null,
                input)}
                type="number"
                step="0.001"
                value={r.menge ?? 0}
                onChange={(e) =>
                updateAufmass(i, { menge: safeNumber(e.target.value, 0) })
                } />
                
                </td>
                <td className={rlcClass(null, td)}>
                  <input className={rlcClass(null,
                input)}
                value={fmt(r.kommentar)}
                onChange={(e) => updateAufmass(i, { kommentar: e.target.value })} />
                
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className={rlcClass(null, card)}>
        <h3 className="rlc-migrated-pages-ki-regieauto-tsx-1037">Lieferscheine</h3>
        <button onClick={addSchein} className={rlcClass(null, { ...btn, marginTop: 8, marginBottom: 8 })}>
          Zeile hinzufügen
        </button>

        <table className={rlcClass(null, table)}>
          <thead>
            <tr>
              {["Lieferant", "Datum", "Material", "Menge", "Einh.", "Preis", "Kostenstelle", "Beleg"].map(
                (h) =>
                <th key={h} className={rlcClass(null, th)}>
                    {h}
                  </th>

              )}
            </tr>
          </thead>
          <tbody>
            {scheine.length === 0 &&
            <tr>
                <td colSpan={8} className="rlc-migrated-pages-ki-regieauto-tsx-1038">
                  Keine Lieferscheine.
                </td>
              </tr>
            }

            {scheine.map((s, i) =>
            <tr key={s.id}>
                <td className={rlcClass(null, td)}>
                  <input className={rlcClass(null,
                input)}
                value={fmt(s.lieferant)}
                onChange={(e) => updateSchein(i, { lieferant: e.target.value })} />
                
                </td>
                <td className={rlcClass(null, { ...td, width: 150 })}>
                  <input className={rlcClass(null,
                input)}
                type="date"
                value={fmt(s.datum)}
                onChange={(e) => updateSchein(i, { datum: e.target.value })} />
                
                </td>
                <td className={rlcClass(null, td)}>
                  <input className={rlcClass(null,
                input)}
                value={fmt(s.material)}
                onChange={(e) => updateSchein(i, { material: e.target.value })} />
                
                </td>
                <td className={rlcClass(null, { ...td, width: 120 })}>
                  <input className={rlcClass(null,
                input)}
                type="number"
                step="0.001"
                value={s.menge ?? 0}
                onChange={(e) =>
                updateSchein(i, { menge: safeNumber(e.target.value, 0) })
                } />
                
                </td>
                <td className={rlcClass(null, { ...td, width: 90 })}>
                  <input className={rlcClass(null,
                input)}
                value={fmt(s.einheit)}
                onChange={(e) => updateSchein(i, { einheit: e.target.value })} />
                
                </td>
                <td className={rlcClass(null, { ...td, width: 120 })}>
                  <input className={rlcClass(null,
                input)}
                type="number"
                step="0.01"
                value={s.preis ?? 0}
                onChange={(e) =>
                updateSchein(i, { preis: safeNumber(e.target.value, 0) })
                } />
                
                </td>
                <td className={rlcClass(null, td)}>
                  <input className={rlcClass(null,
                input)}
                value={fmt(s.kostenstelle)}
                onChange={(e) => updateSchein(i, { kostenstelle: e.target.value })} />
                
                </td>
                <td className={rlcClass(null, td)}>
                  {s.belegUrl ?
                <a href={s.belegUrl} target="_blank" rel="noopener noreferrer">
                      Öffnen
                    </a> :

                "-"
                }
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="rlc-migrated-pages-ki-regieauto-tsx-1039">
        <button className={rlcClass(null, btn)} disabled={uploading} onClick={() => fileInputRef.current?.click()}>
          {uploading ? "Erkenne..." : "Weitere Fotos/Belege hochladen"}
        </button>

        <button className={rlcClass(null,
        btn)}
        onClick={commitToMengenermittlung}
        disabled={!effectiveProjectId || aufmass.length === 0 || busy}>
          
          In Mengenermittlung übernehmen
        </button>

        <button className={rlcClass(null,
        btn)}
        onClick={saveRegieJson}
        disabled={!effectiveProjectId || busy}>
          
          Als Regiebericht speichern
        </button>

        <button className={rlcClass(null,
        btn)}
        disabled={!canGenerate || generating}
        onClick={generatePDF}>
          
          {generating ? "Generiere..." : "Regiebericht generieren (PDF)"}
        </button>

        {pdfUrl &&
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer" className="rlc-migrated-pages-ki-regieauto-tsx-1040">

          
            PDF öffnen
          </a>
        }
      </div>

      {!effectiveProjectId.trim() &&
      <div className="rlc-migrated-pages-ki-regieauto-tsx-1041">⚠️ Projekt-ID eintragen.</div>
      }
    </div>);

}

function safeNumber(v: unknown, fallback = 0): number {
  const n =
  typeof v === "number" ?
  v :
  typeof v === "string" ?
  Number(v.replace(",", ".")) :
  Number(v);

  return Number.isFinite(n) ? n : fallback;
}

function normalizeUpload(u: unknown): UploadResult {
  const x = (u ?? {}) as Partial<UploadResult>;
  return {
    fileId: String(x.fileId || crypto.randomUUID()),
    url: String(x.url || ""),
    ocrText: x.ocrText ? String(x.ocrText) : undefined
  };
}

function normalizeAufmass(a: unknown): RecognizedAufmass {
  const x = (a ?? {}) as Partial<RecognizedAufmass>;
  return {
    id: String(x.id || `A_${Date.now()}_${Math.random()}`),
    position: x.position ? String(x.position) : "",
    kurztext: x.kurztext ? String(x.kurztext) : "",
    einheit: x.einheit ? String(x.einheit) : "",
    menge: safeNumber(x.menge, 0),
    kommentar: x.kommentar ? String(x.kommentar) : ""
  };
}

function normalizeLieferschein(s: unknown): RecognizedLieferschein {
  const x = (s ?? {}) as Partial<RecognizedLieferschein>;
  return {
    id: String(x.id || `L_${Date.now()}_${Math.random()}`),
    lieferant: x.lieferant ? String(x.lieferant) : "",
    datum: x.datum ? String(x.datum) : "",
    material: x.material ? String(x.material) : "",
    menge: safeNumber(x.menge, 0),
    einheit: x.einheit ? String(x.einheit) : "",
    preis: safeNumber(x.preis, 0),
    kostenstelle: x.kostenstelle ? String(x.kostenstelle) : "",
    belegUrl: x.belegUrl ? String(x.belegUrl) : ""
  };
}
