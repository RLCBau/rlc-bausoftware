import React, { useMemo, useRef, useState } from "react";

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
type UploadResult = { fileId: string; url: string; ocrText?: string };

/** ===== Component ===== */
export default function RegieAuto() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Meta
  const [projectId, setProjectId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Upload / KI
  const [uploads, setUploads] = useState<UploadResult[]>([]);
  const [aufmass, setAufmass] = useState<RecognizedAufmass[]>([]);
  const [scheine, setScheine] = useState<RecognizedLieferschein[]>([]);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [pdfUrl, setPdfUrl] = useState("");

  // Manuell (Regiebericht klassisch)
  const [personal, setPersonal] = useState<string>("");     // z.B. „Müller, Huber“
  const [geraete, setGeraete] = useState<string>("");       // z.B. „Bagger 20t, Rüttler“
  const [arbeitszeit, setArbeitszeit] = useState<string>(""); // „07:30–16:30 (8h)“
  const [ort, setOrt] = useState<string>("");
  const [wetter, setWetter] = useState<string>("");
  const [bemerkung, setBemerkung] = useState<string>("");

  const canGenerate = useMemo(
    () =>
      projectId.trim().length > 0 &&
      (aufmass.length > 0 || scheine.length > 0 || personal || geraete || arbeitszeit || bemerkung),
    [projectId, aufmass, scheine, personal, geraete, arbeitszeit, bemerkung]
  );

  /** ===== Upload & KI ===== */
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files || e.target.files.length === 0) return;
    setUploading(true);
    try {
      const fd = new FormData();
      Array.from(e.target.files).forEach((f) => fd.append("files", f));
      fd.append("projectId", projectId || "unknown");

      const res = await fetch("/api/ki/regie/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      setUploads((p) => [...p, ...data.files]);
      setAufmass((p) => [...p, ...data.recognized.aufmass]);
      setScheine((p) => [...p, ...data.recognized.lieferscheine]);
    } catch (err: any) {
      alert("Upload/Erkennung fehlgeschlagen: " + err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  /** ===== Commit in Mengenermittlung ===== */
  async function commitToMengenermittlung() {
    try {
      const res = await fetch("/api/ki/regie/commit/mengen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, date, aufmass }),
      });
      if (!res.ok) throw new Error(await res.text());
      alert("Aufmaß in Mengenermittlung übernommen.");
    } catch (e: any) {
      alert("Fehler Mengenermittlung: " + e.message);
    }
  }

  /** ===== Salva Regiebericht (JSON) ===== */
  async function saveRegieJson() {
    try {
      const res = await fetch("/api/ki/regie/commit/regiebericht", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          date,
          meta: { personal, geraete, arbeitszeit, ort, wetter, bemerkung },
          aufmass,
          lieferscheine: scheine,
          fotos: uploads.map((u) => u.url),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      alert("Regiebericht gespeichert.");
    } catch (e: any) {
      alert("Fehler Speichern: " + e.message);
    }
  }

  /** ===== PDF ===== */
  async function generatePDF() {
    setGenerating(true);
    try {
      const res = await fetch("/api/ki/regie/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          date,
          photos: uploads.map((u) => u.url),
          items: { aufmass, lieferscheine: scheine },
          meta: { personal, geraete, arbeitszeit, ort, wetter, bemerkung },
          participants: { bauleiter: "", auftraggeber: "" },
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setPdfUrl(data.pdfUrl);
    } catch (err: any) {
      alert("Fehler bei Generierung: " + err.message);
    } finally {
      setGenerating(false);
    }
  }

  /** ===== UI Helpers ===== */
  const fmt = (v: any) => (v === undefined || v === null ? "" : String(v));
  function addAufmass() {
    setAufmass((r) => [...r, { id: `A_${Date.now()}`, position: "", kurztext: "", einheit: "m", menge: 0 }]);
  }
  function addSchein() {
    setScheine((r) => [...r, { id: `L_${Date.now()}`, lieferant: "", datum: date, menge: 0, einheit: "stk" }]);
  }
  function updateAufmass(i: number, patch: Partial<RecognizedAufmass>) {
    setAufmass((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function updateSchein(i: number, patch: Partial<RecognizedLieferschein>) {
    setScheine((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Regieberichte automatisch generieren</h1>

      {/* Meta + Upload */}
      <div style={{ display: "flex", gap: 16, marginTop: 12, alignItems: "center" }}>
        <label>Projekt-ID:&nbsp;
          <input value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="P-2025-001" />
        </label>
        <label>Datum:&nbsp;
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.heic,.pdf"
          multiple
          onChange={handleUpload}
          style={{ marginLeft: "auto" }}
        />
      </div>

      {/* Manuelle Kopfdaten */}
      <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <input placeholder="Personal (Namen)" value={personal} onChange={(e) => setPersonal(e.target.value)} />
        <input placeholder="Geräte/Maschinen" value={geraete} onChange={(e) => setGeraete(e.target.value)} />
        <input placeholder="Arbeitszeit (z.B. 07:30–16:30, 8h)" value={arbeitszeit} onChange={(e) => setArbeitszeit(e.target.value)} />
        <input placeholder="Ort/Bereich" value={ort} onChange={(e) => setOrt(e.target.value)} />
        <input placeholder="Wetter" value={wetter} onChange={(e) => setWetter(e.target.value)} />
        <input placeholder="Bemerkung" value={bemerkung} onChange={(e) => setBemerkung(e.target.value)} />
      </div>

      {/* Upload Preview */}
      {uploads.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <h3>Fotos / Belege</h3>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {uploads.map((f) => (
              <div key={f.fileId} style={{ border: "1px solid #ddd", padding: 8, width: 180 }}>
                <div style={{ fontSize: 12, color: "#555" }}>{f.fileId}</div>
                {/\.(pdf)$/i.test(f.url)
                  ? <a href={f.url} target="_blank" rel="noopener noreferrer">Öffnen</a>
                  : <img src={f.url} alt="" style={{ width: "100%", height: 120, objectFit: "cover" }} />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Aufmaß Tabelle */}
      <div style={{ marginTop: 22 }}>
        <h3>Erkannte / manuelle Aufmaß-Positionen</h3>
        <button onClick={addAufmass} style={{ marginBottom: 8 }}>Zeile hinzufügen</button>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>{["Pos.", "Kurztext", "Einh.", "Menge", "Kommentar"].map((h) =>
              <th key={h} style={{ borderBottom: "1px solid #ccc", textAlign: "left", padding: 8 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {aufmass.length === 0 && <tr><td colSpan={5} style={{ padding: 8, color: "#777" }}>Keine Positionen.</td></tr>}
            {aufmass.map((r, i) => (
              <tr key={r.id}>
                <td style={{ padding: 6 }}><input value={fmt(r.position)} onChange={(e) => updateAufmass(i, { position: e.target.value })} /></td>
                <td style={{ padding: 6 }}><input value={fmt(r.kurztext)} onChange={(e) => updateAufmass(i, { kurztext: e.target.value })} /></td>
                <td style={{ padding: 6, width: 90 }}><input value={fmt(r.einheit)} onChange={(e) => updateAufmass(i, { einheit: e.target.value })} /></td>
                <td style={{ padding: 6, width: 120 }}>
                  <input type="number" step="0.001" value={r.menge ?? 0} onChange={(e) => updateAufmass(i, { menge: Number(e.target.value) })} />
                </td>
                <td style={{ padding: 6 }}><input value={fmt(r.kommentar)} onChange={(e) => updateAufmass(i, { kommentar: e.target.value })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Lieferscheine Tabelle */}
      <div style={{ marginTop: 22 }}>
        <h3>Lieferscheine</h3>
        <button onClick={addSchein} style={{ marginBottom: 8 }}>Zeile hinzufügen</button>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>{["Lieferant", "Datum", "Material", "Menge", "Einh.", "Preis", "Kostenstelle", "Beleg"].map((h) =>
              <th key={h} style={{ borderBottom: "1px solid #ccc", textAlign: "left", padding: 8 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {scheine.length === 0 && <tr><td colSpan={8} style={{ padding: 8, color: "#777" }}>Keine Lieferscheine.</td></tr>}
            {scheine.map((s, i) => (
              <tr key={s.id}>
                <td style={{ padding: 6 }}><input value={fmt(s.lieferant)} onChange={(e) => updateSchein(i, { lieferant: e.target.value })} /></td>
                <td style={{ padding: 6, width: 150 }}><input type="date" value={fmt(s.datum)} onChange={(e) => updateSchein(i, { datum: e.target.value })} /></td>
                <td style={{ padding: 6 }}><input value={fmt(s.material)} onChange={(e) => updateSchein(i, { material: e.target.value })} /></td>
                <td style={{ padding: 6, width: 120 }}><input type="number" step="0.001" value={s.menge ?? 0} onChange={(e) => updateSchein(i, { menge: Number(e.target.value) })} /></td>
                <td style={{ padding: 6, width: 90 }}><input value={fmt(s.einheit)} onChange={(e) => updateSchein(i, { einheit: e.target.value })} /></td>
                <td style={{ padding: 6, width: 120 }}><input type="number" step="0.01" value={s.preis ?? 0} onChange={(e) => updateSchein(i, { preis: Number(e.target.value) })} /></td>
                <td style={{ padding: 6 }}><input value={fmt(s.kostenstelle)} onChange={(e) => updateSchein(i, { kostenstelle: e.target.value })} /></td>
                <td style={{ padding: 6 }}>{s.belegUrl ? <a href={s.belegUrl} target="_blank" rel="noopener noreferrer">Öffnen</a> : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
        <button disabled={uploading} onClick={() => fileInputRef.current?.click()}>
          {uploading ? "Erkenne..." : "Weitere Fotos/Belege hochladen"}
        </button>
        <button onClick={commitToMengenermittlung} disabled={!projectId || aufmass.length === 0}>
          In Mengenermittlung übernehmen
        </button>
        <button onClick={saveRegieJson} disabled={!projectId}>Als Regiebericht speichern</button>
        <button disabled={!canGenerate || generating} onClick={generatePDF}>
          {generating ? "Generiere..." : "Regiebericht generieren (PDF)"}
        </button>
        {pdfUrl && <a href={pdfUrl} target="_blank" rel="noopener noreferrer" style={{ marginLeft: "auto" }}>PDF öffnen</a>}
      </div>

      {!projectId.trim() && <div style={{ marginTop: 8, color: "#b00" }}>⚠️ Projekt-ID eintragen.</div>}
    </div>
  );
}
