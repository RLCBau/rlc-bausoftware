// apps/web/src/pages/ki/ManuellFoto.tsx
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useProject } from "../../store/useProject";
// @ts-ignore – einfache Einbindung
import jsPDF from "jspdf";
// @ts-ignore
import autoTable from "jspdf-autotable";

// ⚙️ API-Basis (am besten in .env: VITE_API_URL="http://localhost:4000/api")
const API =
  (import.meta as any)?.env?.VITE_API_URL || "http://localhost:4000/api";

const KI_REGIE_BUFFER_KEY = "ki-regie-buffer";

/** Ergebnis eines KI-Erkennungsbox */
type DetectBox = {
  id: string;
  label: string;
  score: number;
  qty?: number;
  unit?: string;
  box?: [number, number, number, number];
};

type AnalyzeResponse = {
  boxes: DetectBox[];
  summary?: string;
};

type ExtraRow = {
  id: string;
  typ: "KI" | "Manuell";
  /** LV-Positionsnummer, z. B. 001.001 oder FOTO.004 */
  lvPos?: string;
  /** Kurztext / Beschreibung */
  beschreibung: string;
  einheit: string;
  menge: number;
};

type FotoHistoryEntry = {
  id: string; // clientseitige ID
  projectId: string | null;
  createdAt: string;
  imgUrl: string | null;
  note: string;
  extras: ExtraRow[];
  boxes: DetectBox[];
  savedToBackend?: boolean;
  backendId?: string | null;
  backendFile?: string | null;
};

const prettyScore = (s: number) => (s * 100).toFixed(1) + "%";

const STATE_STORAGE_KEY = "rlc-manuell-foto-v1";
const HISTORY_KEY_BASE = "rlc-foto-history";

/* ===== Backend-Helfer ==================================== */

async function uploadFotoToBackend(
  projectId: string,
  file: File,
  note: string,
  extras: ExtraRow[],
  boxes: DetectBox[]
): Promise<FotoHistoryEntry | null> {
  const form = new FormData();
  form.append("file", file);
  form.append("note", note);
  form.append("extras", JSON.stringify(extras));
  form.append("boxes", JSON.stringify(boxes));

  const res = await fetch(`${API}/projects/${projectId}/fotos`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    console.error("Fehler beim Speichern Foto:", await res.text());
    return null;
  }

  const entry = await res.json();
  const backendFile = String(entry.file);

  return {
    id: crypto.randomUUID(),
    projectId,
    createdAt: String(entry.createdAt),
    note: String(entry.note ?? ""),
    extras: Array.isArray(entry.extras) ? entry.extras : [],
    boxes: Array.isArray(entry.boxes) ? entry.boxes : [],
    imgUrl: `${API}/projects/${projectId}/fotos/${backendFile}`,
    savedToBackend: true,
    backendId: String(entry.id),
    backendFile,
  };
}

async function deleteFotoFromBackend(
  projectId: string,
  backendId: string
): Promise<boolean> {
  const res = await fetch(`${API}/projects/${projectId}/fotos/${backendId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    console.error("Fehler beim Löschen im Backend:", await res.text());
    return false;
  }
  return true;
}

/** Hilfsfunktion: vorhandenen Verlaufseintrag im Backend speichern (aus imgUrl) */
async function saveFotoEntryToBackend(
  projectId: string,
  entry: FotoHistoryEntry
): Promise<FotoHistoryEntry | null> {
  if (!entry.imgUrl) return null;
  try {
    const resp = await fetch(entry.imgUrl);
    const blob = await resp.blob();
    const file = new File([blob], "baustellenfoto.jpg", {
      type: blob.type || "image/jpeg",
    });

    const saved = await uploadFotoToBackend(
      projectId,
      file,
      entry.note,
      entry.extras,
      entry.boxes
    );
    if (!saved) return null;

    return {
      ...entry,
      savedToBackend: true,
      backendId: saved.backendId,
      backendFile: saved.backendFile,
      imgUrl: saved.imgUrl,
      projectId,
    };
  } catch (e) {
    console.error("Fehler beim Foto-Speichern ins Projekt", e);
    return null;
  }
}

export default function ManuellFoto() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlProjectId = searchParams.get("projectId");
  const from = searchParams.get("from") || "";

  const { getSelectedProject } = useProject();
  const project = getSelectedProject();

  // ❗ effektive Projekt-ID (für Dateien/Fotos)
  const effectiveProjectId: string | null =
    (urlProjectId as string | null) ||
    (project?.code as string | undefined) ||
    (project?.id as string | undefined) ||
    null;

  const historyKey = React.useMemo(
    () => `${HISTORY_KEY_BASE}_${effectiveProjectId ?? "default"}`,
    [effectiveProjectId]
  );

  const [file, setFile] = React.useState<File | null>(null);
  const [imgUrl, setImgUrl] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // ✅ zusätzlicher Busy-State nur fürs Speichern (damit Analyse nicht blockiert)
  const [saveBusy, setSaveBusy] = React.useState(false);

  const [result, setResult] = React.useState<AnalyzeResponse | null>(null);
  const [note, setNote] = React.useState("");
  const [extras, setExtras] = React.useState<ExtraRow[]>([]);
  const [history, setHistory] = React.useState<FotoHistoryEntry[]>([]);

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const imgRef = React.useRef<HTMLImageElement | null>(null);

  /* ---- aktuellen Zustand laden ---- */
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(STATE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        imgUrl?: string | null;
        note?: string;
        extras?: ExtraRow[];
        result?: AnalyzeResponse | null;
      };
      if (parsed.imgUrl) setImgUrl(parsed.imgUrl);
      if (parsed.note) setNote(parsed.note);
      if (parsed.extras) setExtras(parsed.extras);
      if (parsed.result) setResult(parsed.result);
    } catch (e) {
      console.error("Konnte lokalen Zustand nicht laden", e);
    }
  }, []);

  React.useEffect(() => {
    try {
      const data = JSON.stringify({ imgUrl, note, extras, result });
      localStorage.setItem(STATE_STORAGE_KEY, data);
    } catch (e) {
      console.error("Konnte lokalen Zustand nicht speichern", e);
    }
  }, [imgUrl, note, extras, result]);

  /* ---- Historie laden ---- */
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(historyKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setHistory(parsed as FotoHistoryEntry[]);
      }
    } catch (e) {
      console.error("Konnte Foto-Historie nicht laden", e);
    }
  }, [historyKey]);

  /* ---- Overlay zeichnen ---- */
  React.useEffect(() => {
    if (!imgUrl || !result?.boxes?.length) return;
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;

    const draw = () => {
      const W = img.naturalWidth;
      const H = img.naturalHeight;
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, W, H);
      ctx.lineWidth = 3;
      ctx.font = "18px system-ui";
      ctx.textBaseline = "top";

      result.boxes.forEach((b) => {
        if (!b.box) return;
        const [x, y, w, h] = b.box;

        ctx.strokeStyle = "#0b1324";
        ctx.fillStyle = "rgba(11,19,36,0.08)";
        ctx.fillRect(x * W, y * H, w * W, h * H);
        ctx.strokeRect(x * W, y * H, w * W, h * H);

        const tag = `${b.label}${b.qty ? ` (${b.qty} ${b.unit ?? ""})` : ""} ${prettyScore(
          b.score
        )}`;

        const tw = ctx.measureText(tag).width + 10;
        const tx = x * W;
        const ty = Math.max(0, y * H - 22);

        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.fillRect(tx, ty, tw, 22);
        ctx.fillStyle = "#0b1324";
        ctx.fillText(tag, tx + 5, ty + 3);
      });
    };

    if (img.complete) draw();
    else img.onload = draw;
  }, [imgUrl, result]);

  /* ---- Datei wählen ---- */
  const onPick = (f: File) => {
    setResult(null);
    setExtras([]);
    setError(null);
    setFile(f);
    const url = URL.createObjectURL(f);
    setImgUrl(url);
  };

  const onDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) onPick(f);
  };

  const onSelect: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const f = e.target.files?.[0];
    if (f) onPick(f);
  };

  /* ---- KI-Analyse (mit /ki/photo-analyze) ---- */
  const analyze = async () => {
    if (!file) {
      setError(
        "Bitte zuerst ein Foto importieren (für die KI-Analyse wird die Datei benötigt)."
      );
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const form = new FormData();
      form.append("file", file);
      if (note) form.append("note", note);
      if (effectiveProjectId) form.append("projectId", effectiveProjectId);

      const res = await fetch(`${API}/ki/photo-analyze`, {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const data = (await res.json()) as {
        positions: {
          id?: string; // hier kann z. B. 001.001 stehen
          kurztext: string;
          einheit?: string;
          typ?: "sichtbar" | "implizit";
          status?: "bestehend" | "nachtrag";
        }[];
        summary?: string;
      };

      const positions = data.positions || [];

      // Rechte Tabelle (Bauteile)
      const boxes: DetectBox[] = positions.map((p, idx) => ({
        id: p.id || String(idx + 1),
        label: p.kurztext,
        score: 0.95,
        qty: undefined,
        unit: p.einheit || "",
        box: undefined,
      }));

      setResult({
        boxes,
        summary: data.summary || "Fotoanalyse mit KI durchgeführt.",
      });

      // Zusätzliche Positionen für das Aufmaß + LV-Position speichern
      const extraRows: ExtraRow[] = positions.map((p) => ({
        id: crypto.randomUUID(),
        typ: "KI",
        lvPos: p.id || "", // ⬅️ LV-Positionsnummer für PDF / Regie
        beschreibung: p.kurztext,
        einheit: p.einheit || "",
        menge: 0,
      }));

      setExtras(extraRows);
    } catch (e) {
      console.error("Fehler bei KI-Fotoanalyse:", e);
      setError("Fehler bei der KI-Analyse. Bitte Server/OPENAI-Key prüfen.");
    } finally {
      setBusy(false);
    }
  };

  /* ---- Extras bearbeiten ---- */
  const addExtra = () => {
    setExtras((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        typ: "Manuell",
        lvPos: "", // manuell noch keine LV-Pos
        beschreibung: "",
        einheit: "m",
        menge: 0,
      },
    ]);
  };

  const patchExtra = (id: string, patch: Partial<ExtraRow>) => {
    setExtras((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeExtra = (id: string) => {
    setExtras((prev) => prev.filter((r) => r.id !== id));
  };

  /* ---- NEU: Speichern (gleiche Logik wie Ins Aufmaß übernehmen, ohne Navigation) ---- */
  const handleSpeichern = async () => {
    if (!effectiveProjectId) {
      alert("Bitte zuerst ein Projekt wählen.");
      return;
    }
    if (saveBusy) return;

    setSaveBusy(true);
    try {
      const boxes = result?.boxes ?? [];

      // 1) Verlaufseintrag anlegen (lokal)
      const entryId = crypto.randomUUID();
      const entry: FotoHistoryEntry = {
        id: entryId,
        projectId: effectiveProjectId,
        createdAt: new Date().toISOString(),
        imgUrl,
        note,
        extras,
        boxes,
        savedToBackend: false,
      };

      setHistory((prev) => {
        const updated = [...prev, entry];
        try {
          localStorage.setItem(historyKey, JSON.stringify(updated));
        } catch (e) {
          console.error("Konnte Foto-Historie nicht speichern", e);
        }
        return updated;
      });

      // 2) Foto + Metadaten ins Projekt speichern (FS/DB je nach Backend)
      const saved = await saveFotoEntryToBackend(effectiveProjectId, entry);
      if (saved) {
        setHistory((prev) => {
          const next = prev.map((h) => (h.id === entryId ? saved : h));
          try {
            localStorage.setItem(historyKey, JSON.stringify(next));
          } catch (e) {
            console.error("Konnte Foto-Historie nicht speichern", e);
          }
          return next;
        });
      } else {
        alert("Foto konnte nicht im Projekt gespeichert werden.");
      }

      // 3) Aufmaß-Übernahme-Endpoint triggern (schreibt ins Projekt-Root wie bei Übernehmen)
      try {
        await fetch(`${API}/aufmass/from-foto`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: effectiveProjectId,
            from,
            note,
            extras,
            boxes,
          }),
        });
      } catch (e) {
        console.error("Fehler beim Speichern (from-foto)", e);
        // nicht abbrechen: Foto ist ggf. schon gespeichert
      }

      alert("Gespeichert (Projekt).");
    } finally {
      setSaveBusy(false);
    }
  };

  /* ---- Ins Aufmaß übernehmen (inkl. automatischem Projekt-Save) ---- */
  const goToAufmass = async () => {
    const boxes = result?.boxes ?? [];

    if (imgUrl) {
      const entryId = crypto.randomUUID();

      const entry: FotoHistoryEntry = {
        id: entryId,
        projectId: effectiveProjectId,
        createdAt: new Date().toISOString(),
        imgUrl,
        note,
        extras,
        boxes,
        savedToBackend: false,
      };

      setHistory((prev) => {
        const updated = [...prev, entry];
        try {
          localStorage.setItem(historyKey, JSON.stringify(updated));
        } catch (e) {
          console.error("Konnte Foto-Historie nicht speichern", e);
        }
        return updated;
      });

      // gleich beim Übergang ins Aufmaß im Projekt speichern
      if (effectiveProjectId) {
        const saved = await saveFotoEntryToBackend(effectiveProjectId, entry);
        if (saved) {
          setHistory((prev) => {
            const next = prev.map((h) => (h.id === entryId ? saved : h));
            try {
              localStorage.setItem(historyKey, JSON.stringify(next));
            } catch (e) {
              console.error("Konnte Foto-Historie nicht speichern", e);
            }
            return next;
          });
        }
      }
    }

    try {
      await fetch("/api/aufmass/from-foto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: effectiveProjectId,
          from,
          note,
          extras,
          boxes,
        }),
      });
    } catch (e) {
      console.error("Fehler beim Übergeben ins Aufmaß", e);
    }

    navigate("/mengenermittlung/aufmasseditor");
  };

  /* ---- Zu Regieberichten (alles aus extras + Foto) ---- */
  const goToRegieberichte = () => {
    if (!effectiveProjectId) {
      alert("Bitte zuerst ein Projekt wählen.");
      return;
    }

    const dateStr = new Date().toISOString().slice(0, 10);

    const baseItems =
      extras.length > 0
        ? extras
        : (result?.boxes ?? []).map((b) => ({
            id: crypto.randomUUID(),
            typ: "KI" as const,
            lvPos: "",
            beschreibung: b.label,
            einheit: b.unit || "",
            menge: b.qty ?? 0,
          }));

    if (!baseItems.length) {
      alert(
        "Keine Positionen vorhanden. Bitte zuerst die KI laufen lassen oder manuelle Positionen erfassen."
      );
      return;
    }

    const items = baseItems.map((ex) => ({
      date: dateStr,
      worker: "",
      hours: 0,
      machine: "",
      material: "",
      menge: ex.menge ?? 0,
      einheit: ex.einheit ?? "",
      kurztext: ex.beschreibung || "Regieposition aus Foto",
      lvItemPos: ex.lvPos || "",
      // einfache Foto-Weitergabe (objectURL reicht, da wir direkt weiterleiten)
      photoUrl: imgUrl || null,
    }));

    localStorage.setItem(
      KI_REGIE_BUFFER_KEY,
      JSON.stringify({
        projectId: effectiveProjectId,
        items,
      })
    );

    navigate(
      `/mengenermittlung/regieberichte?projectId=${encodeURIComponent(
        effectiveProjectId
      )}&from=ki&date=${dateStr}`
    );
  };

  const sumQty = (result?.boxes ?? []).reduce((a, b) => a + (b.qty ?? 0), 0);

  /* ---- PDF Export ---- */
  const exportPdfForEntry = (h: FotoHistoryEntry) => {
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });

    const left = 15;
    let y = 15;

    const projTitle = project ? `${project.code} – ${project.name}` : "Projekt";
    const projMeta = project ? [project.client, project.place].filter(Boolean).join(" • ") : "";

    doc.setFontSize(14);
    doc.text("Foto-Aufmaß Bericht", left, y);
    y += 8;
    doc.setFontSize(11);
    doc.text(projTitle, left, y);
    y += 5;
    if (projMeta) {
      doc.text(projMeta, left, y);
      y += 5;
    }
    doc.text(`Datum: ${new Date(h.createdAt).toLocaleString("de-DE")}`, left, y);
    y += 6;
    if (h.note && h.note.trim()) {
      doc.text(`Beschreibung: ${h.note}`, left, y);
      y += 6;
    }

    // Tabelle: Typ | LV-Positionen | Beschreibung | Mengen
    const head = [["Typ", "LV-Positionen", "Beschreibung", "Mengen"]];

    const body = h.extras.map((ex) => {
      const mengeStr =
        (ex.menge ?? 0).toLocaleString("de-DE", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }) + (ex.einheit ? ` ${ex.einheit}` : "");

      return [
        ex.typ,
        ex.lvPos || "", // ⬅️ Nummer wie 001.001 / FOTO.004
        ex.beschreibung || "", // ⬅️ Text direkt unter "Beschreibung"
        mengeStr,
      ];
    });

    // Platz für Bild rechts freilassen
    const imgWidth = 90;
    const reservedRight = 15 + imgWidth + 5;

    autoTable(doc, {
      startY: y + 2,
      head,
      body,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [37, 99, 235] },
      margin: { left, right: reservedRight },
      columnStyles: {
        0: { cellWidth: 16 }, // Typ
        1: { cellWidth: 24 }, // LV-Pos
        2: { cellWidth: "auto" }, // Beschreibung
        3: { cellWidth: 25, halign: "right" }, // Mengen
      },
    });

    if (h.imgUrl) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const pageWidth = doc.internal.pageSize.getWidth();
        const ratio = img.height / img.width;
        const imgHeight = imgWidth * ratio;

        const x = pageWidth - imgWidth - 15;
        const imgY = 25;

        doc.addImage(img, "JPEG", x, imgY, imgWidth, imgHeight);
        doc.save(
          `Foto-Aufmass_${project?.code ?? "Projekt"}_${new Date(h.createdAt)
            .toISOString()
            .slice(0, 10)}.pdf`
        );
      };
      img.src = h.imgUrl;
    } else {
      doc.save(
        `Foto-Aufmass_${project?.code ?? "Projekt"}_${new Date(h.createdAt)
          .toISOString()
          .slice(0, 10)}.pdf`
      );
    }
  };

  /* ---- Verlauf Helper ---- */
  const persistHistory = (next: FotoHistoryEntry[]) => {
    try {
      localStorage.setItem(historyKey, JSON.stringify(next));
    } catch (e) {
      console.error("Konnte Foto-Historie nicht speichern", e);
    }
  };

  const handleHistoryEdit = (h: FotoHistoryEntry) => {
    setImgUrl(h.imgUrl);
    setNote(h.note);
    setExtras(h.extras || []);
    setResult({
      boxes: h.boxes || [],
      summary: "Ergebnis aus gespeicherten Daten (Foto-Verlauf). Mengen bitte im Aufmaß prüfen.",
    });
    setFile(null);
  };

  const handleHistoryDelete = async (h: FotoHistoryEntry) => {
    const confirm = window.confirm(
      "Dieses Foto aus dem Verlauf löschen? (Falls bereits gespeichert, wird es auch im Projekt gelöscht.)"
    );
    if (!confirm) return;

    if (effectiveProjectId && h.savedToBackend && h.backendId) {
      await deleteFotoFromBackend(effectiveProjectId, h.backendId);
    }

    setHistory((prev) => {
      const next = prev.filter((x) => x.id !== h.id);
      persistHistory(next);
      return next;
    });
  };

  const handleHistorySave = async (h: FotoHistoryEntry) => {
    if (!effectiveProjectId) {
      alert("Kein Projekt gewählt – Foto kann nicht im Projekt gespeichert werden.");
      return;
    }
    if (h.savedToBackend) {
      alert("Dieses Foto ist bereits im Projekt gespeichert.");
      return;
    }

    const saved = await saveFotoEntryToBackend(effectiveProjectId, h);
    if (!saved) {
      alert("Foto konnte nicht im Projekt gespeichert werden.");
      return;
    }

    setHistory((prev) => {
      const next = prev.map((x) => (x.id === h.id ? saved : h));
      persistHistory(next);
      return next;
    });
  };

  /* ==================== RENDER ===================== */

  return (
    <div className="card" style={{ padding: 0 }}>
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          gap: 8,
          padding: "8px 10px",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <div style={{ fontWeight: 700, opacity: 0.8 }}>
          Manuell · per Foto / Sprache
        </div>
        <div style={{ flex: 1 }} />

        <button className="btn" type="button" onClick={analyze} disabled={busy}>
          {busy ? "Analysiere …" : "KI analysieren"}
        </button>

        {/* ✅ NEU: Speichern neben Übernehmen */}
        <button
          className="btn"
          type="button"
          onClick={handleSpeichern}
          disabled={saveBusy || !effectiveProjectId}
          style={{ marginLeft: 8 }}
          title={!effectiveProjectId ? "Bitte zuerst ein Projekt wählen" : "Speichert ins Projekt"}
        >
          {saveBusy ? "Speichert …" : "Speichern"}
        </button>

        <button
          className="btn"
          type="button"
          onClick={goToAufmass}
          style={{ marginLeft: 8 }}
        >
          Ins Aufmaß übernehmen
        </button>

        <button
          className="btn"
          type="button"
          onClick={goToRegieberichte}
          style={{ marginLeft: 8 }}
        >
          Zu Regieberichten
        </button>
      </div>

      {/* Hauptbereich */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(260px, 50%) minmax(260px, 50%)",
          gap: 10,
          padding: 10,
        }}
      >
        {/* LINKER BLOCK */}
        <div className="card" style={{ padding: 12 }}>
          {!imgUrl ? (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              style={{
                border: "1px dashed var(--line)",
                borderRadius: 10,
                padding: 24,
                textAlign: "center",
                color: "var(--muted)",
              }}
            >
              <div style={{ marginBottom: 10 }}>
                Ziehen Sie ein Baustellenfoto hierher
                <br />
                oder klicken Sie auf „Foto importieren (JPG/PNG)“.
              </div>
              <label className="btn" style={{ cursor: "pointer" }}>
                Foto importieren (JPG/PNG)
                <input
                  type="file"
                  accept="image/*"
                  onChange={onSelect}
                  style={{ display: "none" }}
                />
              </label>
            </div>
          ) : (
            <>
              <div
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: 10,
                  padding: 8,
                  maxHeight: 420,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    height: 0,
                    paddingBottom: "65%",
                  }}
                >
                  <img
                    ref={imgRef}
                    src={imgUrl}
                    alt="Baustellenfoto"
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                      display: "block",
                    }}
                  />
                  <canvas
                    ref={canvasRef}
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      pointerEvents: "none",
                    }}
                  />
                </div>
              </div>

              <div style={{ marginTop: 10 }}>
                <label className="btn" style={{ cursor: "pointer" }}>
                  Foto importieren
                  <input
                    type="file"
                    accept="image/*"
                    onChange={onSelect}
                    style={{ display: "none" }}
                  />
                </label>
              </div>
            </>
          )}

          {error && (
            <div style={{ color: "#b00020", marginTop: 8, fontSize: 13 }}>
              {error}
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <label style={lbl}>Sprachnotiz / Text</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="z. B. Bereich Nord, Zufahrt, Bauabschnitt …"
              style={{
                ...inpWide,
                minHeight: 80,
                resize: "vertical",
                marginTop: 4,
              }}
            />
          </div>
        </div>

        {/* RECHTER BLOCK */}
        <div className="card" style={{ padding: 12 }}>
          {/* KI-Ergebnisse */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>
              Vorschau (Ergebnisse der KI)
            </div>
            {!result ? (
              <div style={{ opacity: 0.7, fontSize: 13 }}>
                Noch keine Analyse durchgeführt. Klicken Sie oben auf
                <b> „KI analysieren“</b>, nachdem ein Foto importiert wurde.
              </div>
            ) : (
              <>
                {result.summary && (
                  <div
                    style={{
                      padding: "6px 8px",
                      background: "#f7f7fb",
                      borderRadius: 6,
                      marginBottom: 8,
                      fontSize: 13,
                    }}
                  >
                    <b>Zusammenfassung:</b> {result.summary}
                  </div>
                )}
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Bauteil</th>
                      <th style={th}>Sicherheit</th>
                      <th style={th}>Menge</th>
                      <th style={th}>Einheit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.boxes.map((b) => (
                      <tr key={b.id}>
                        <td style={td}>{b.label}</td>
                        <td style={td}>{prettyScore(b.score)}</td>
                        <td style={td}>{b.qty ?? "-"}</td>
                        <td style={td}>{b.unit ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td style={{ ...td, fontWeight: 700 }} colSpan={2}>
                        Summe
                      </td>
                      <td style={{ ...td, fontWeight: 700 }}>{sumQty || "-"}</td>
                      <td style={{ ...td, fontWeight: 700 }}>–</td>
                    </tr>
                  </tfoot>
                </table>
              </>
            )}
          </div>

          {/* Zusätzliche Positionen */}
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                marginBottom: 6,
                gap: 10,
              }}
            >
              <div style={{ fontWeight: 600 }}>
                Zusätzliche Positionen (aus Foto / manuell)
              </div>
              <button
                className="btn"
                type="button"
                onClick={addExtra}
                style={{ padding: "4px 10px", fontSize: 12 }}
              >
                + Zeile
              </button>
            </div>

            {extras.length === 0 ? (
              <div style={{ opacity: 0.7, fontSize: 13 }}>
                Noch keine zusätzlichen Positionen. Mit <b>„+ Zeile“</b>{" "}
                kannst du manuelle Positionen ergänzen (z. B. „Pflaster verlegen“).
              </div>
            ) : (
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  marginTop: 4,
                }}
              >
                <thead>
                  <tr>
                    <th style={th}>Typ</th>
                    <th style={th}>Beschreibung / LV-Bezug</th>
                    <th style={th}>Einheit</th>
                    <th style={th}>Menge</th>
                    <th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {extras.map((r) => (
                    <tr key={r.id}>
                      <td style={td}>{r.typ}</td>
                      <td style={td}>
                        <input
                          type="text"
                          value={r.beschreibung}
                          onChange={(e) =>
                            patchExtra(r.id, { beschreibung: e.target.value })
                          }
                          placeholder="z. B. Pflasterfläche herstellen"
                          style={inpWide}
                        />
                        {r.lvPos && (
                          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>
                            LV-Pos: {r.lvPos}
                          </div>
                        )}
                      </td>
                      <td style={td}>
                        <input
                          type="text"
                          value={r.einheit}
                          onChange={(e) => patchExtra(r.id, { einheit: e.target.value })}
                          style={{ ...inpBase, width: 70 }}
                        />
                      </td>
                      <td style={td}>
                        <input
                          type="number"
                          step="0.01"
                          value={r.menge}
                          onChange={(e) =>
                            patchExtra(r.id, { menge: Number(e.target.value) || 0 })
                          }
                          style={{ ...inpBase, width: 90 }}
                        />
                      </td>
                      <td style={td}>
                        <button
                          className="btn"
                          type="button"
                          onClick={() => removeExtra(r.id)}
                          style={{ padding: "2px 8px", fontSize: 12 }}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* FOTO-VERLAUF */}
      {history.length > 0 && (
        <div style={{ padding: "0 10px 10px" }}>
          <div
            style={{
              marginTop: 8,
              padding: 10,
              borderRadius: 10,
              border: "1px solid var(--line)",
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 14 }}>
              Foto-Verlauf (Projekt)
            </div>
            <div style={{ maxHeight: 260, overflow: "auto" }}>
              {history.map((h) => (
                <div
                  key={h.id}
                  style={{
                    display: "flex",
                    gap: 10,
                    padding: "6px 4px",
                    borderBottom: "1px solid #E5E7EB",
                  }}
                >
                  <div
                    style={{
                      width: 80,
                      height: 60,
                      borderRadius: 6,
                      overflow: "hidden",
                      background: "#F3F4F6",
                      flexShrink: 0,
                    }}
                  >
                    {h.imgUrl && (
                      <img
                        src={h.imgUrl}
                        alt="Foto"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          display: "block",
                        }}
                      />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>
                      {new Date(h.createdAt).toLocaleString("de-DE", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "#4B5563",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h.note && h.note.trim() ? h.note : "Ohne Beschreibung"}
                    </div>
                    <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2, marginBottom: 2 }}>
                      {h.extras.length} Position(en), KI-Bauteile:{" "}
                      {h.boxes.map((b) => b.label).join(", ") || "–"}
                    </div>
                    {h.extras.length > 0 && (
                      <div style={{ fontSize: 11, color: "#111827", marginTop: 2 }}>
                        {h.extras.map((ex) => (
                          <div key={ex.id}>
                            • {ex.typ} – {ex.lvPos ? `${ex.lvPos} – ` : ""}
                            {ex.beschreibung} ({ex.menge} {ex.einheit})
                          </div>
                        ))}
                      </div>
                    )}
                    {h.savedToBackend && (
                      <div style={{ fontSize: 10, color: "#059669", marginTop: 4 }}>
                        ✓ Im Projekt gespeichert
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                    <button
                      className="btn"
                      type="button"
                      style={{ fontSize: 11, padding: "2px 8px" }}
                      onClick={() => handleHistorySave(h)}
                      disabled={!effectiveProjectId || h.savedToBackend}
                    >
                      Foto speichern
                    </button>
                    <button
                      className="btn"
                      type="button"
                      style={{ fontSize: 11, padding: "2px 8px" }}
                      onClick={() => handleHistoryEdit(h)}
                    >
                      Foto bearbeiten
                    </button>
                    <button
                      className="btn"
                      type="button"
                      style={{ fontSize: 11, padding: "2px 8px" }}
                      onClick={() => handleHistoryDelete(h)}
                    >
                      Foto löschen
                    </button>
                    <button
                      className="btn"
                      type="button"
                      style={{ fontSize: 11, padding: "2px 8px" }}
                      onClick={() => exportPdfForEntry(h)}
                    >
                      PDF
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- Styles ---- */
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
const lbl: React.CSSProperties = { fontSize: 13, opacity: 0.8 };
const inpBase: React.CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: 6,
  padding: "6px 8px",
  fontSize: 13,
};
const inpWide: React.CSSProperties = { ...inpBase, width: "100%" };
