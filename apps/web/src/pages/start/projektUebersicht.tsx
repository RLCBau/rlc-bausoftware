// apps/web/src/pages/start/projektUebersicht.tsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useProject } from "../../store/useProject";

/* === Config API (fallback) === */
const API = (import.meta as any)?.env?.VITE_API_URL || "http://localhost:4000";

/* === Mini-Widget inline per importare ein project.json === */
function ImportProjectJsonInline({ onDone }: { onDone?: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const upload = async () => {
    if (!file) return alert("Bitte zuerst eine project.json auswählen");
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch(`${API}/api/import/project-json`, {
        method: "POST",
        body: form,
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json) throw new Error("Import fehlgeschlagen");
      if (json.ok === false)
        throw new Error(json.error || "Import fehlgeschlagen");

      alert("Projekt importiert!");
      onDone?.();
    } catch (e: any) {
      console.error(e);
      alert("Import fehlgeschlagen: " + (e?.message ?? String(e)));
    } finally {
      setBusy(false);
      setFile(null);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        margin: "8px 0 16px",
      }}
    >
      <input
        type="file"
        accept=".json,application/json"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />
      <button className="btn" onClick={upload} disabled={!file || busy}>
        {busy ? "Importiere…" : "Import JSON"}
      </button>
    </div>
  );
}

export default function ProjektUebersicht() {
  const nav = useNavigate();
  const projectCtx: any = useProject?.() ?? null;

  // Progetto dal context, se disponibile
  const ctxProject =
    projectCtx?.currentProject ??
    projectCtx?.current ??
    projectCtx?.selectedProject ??
    projectCtx?.project ??
    (typeof projectCtx?.getCurrentProject === "function"
      ? projectCtx.getCurrentProject()
      : null);

  // Fallback: variabile globale impostata in project.tsx
  let globalProject: any = null;
  try {
    const g = globalThis as any;
    globalProject = g.__RLC_CURRENT_PROJECT ?? null;
  } catch {
    globalProject = null;
  }

  const cur = ctxProject || globalProject || null;

  // 🔗 NUOVO: se abbiamo un progetto (cur) ma il context è vuoto,
  // sincronizziamo il context così tutte le sezioni lo vedono.
  useEffect(() => {
    if (!projectCtx || !cur) return;

    const already =
      projectCtx.currentProject ??
      projectCtx.current ??
      projectCtx.selectedProject ??
      projectCtx.project ??
      null;

    // se il context ha già lo stesso progetto, non facciamo nulla
    if (already && (already.id === cur.id || already.code === cur.code)) {
      return;
    }

    if (typeof projectCtx.setCurrentProject === "function") {
      projectCtx.setCurrentProject(cur);
    } else if (typeof projectCtx.selectProject === "function" && cur.id) {
      projectCtx.selectProject(cur.id);
    }
  }, [projectCtx, cur]);

  console.log("ProjektÜbersicht current project:", cur);

  // --- Nessun progetto selezionato ---
  if (!cur) {
    return (
      <div style={{ padding: 16 }}>
        <div className="card" style={{ padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Kein Projekt gewählt</h2>
          <p style={{ marginBottom: 12 }}>
            Bitte wähle zuerst ein Projekt oder importiere eine Projekt-Datei.
          </p>

          <ImportProjectJsonInline onDone={() => nav("/start")} />

          <button className="btn" onClick={() => nav("/start")}>
            → Projekt auswählen
          </button>
        </div>
      </div>
    );
  }

  // Normalizziamo i campi
  const number = cur.code ?? cur.number ?? cur.projektnummer ?? "";
  const name = cur.name ?? cur.projectName ?? cur.projektname ?? "";
  const client = cur.client ?? cur.auftraggeber ?? cur.kunde ?? "";
  const location = cur.place ?? cur.city ?? cur.ort ?? cur.location ?? "";

  const tiles = [
    { title: "Kalkulation (Manuell)", to: "/kalkulation/manuell", emoji: "💰" },
    { title: "Kalkulation (KI)", to: "/kalkulation/mit-ki", emoji: "🤖" },
    {
      title: "Mengenermittlung",
      to: "/mengenermittlung/aufmasseditor",
      emoji: "📋",
    },
    { title: "CAD / PDF", to: "/cad/viewer", emoji: "📐" },
    { title: "Büro / Verwaltung", to: "/buro", emoji: "🏢" },
    { title: "Buchhaltung", to: "/buchhaltung", emoji: "📒" },
    { title: "Info / Hilfe", to: "/hilfe", emoji: "ℹ️" },
  ];

  return (
    <div style={{ padding: 16, display: "grid", gap: 16 }}>
      <div className="card" style={{ padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>Projekt-Übersicht</h2>

        <div style={{ opacity: 0.85, marginBottom: 8 }}>
          <b>{number}</b> — {name}
          {client ? <> • {client}</> : null}
          {location ? <> • {location}</> : null}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))",
            gap: 12,
          }}
        >
          {tiles.map((t) => (
            <button
              key={t.to}
              className="btn"
              onClick={() => nav(t.to)}
              style={{
                textAlign: "left",
                padding: "14px 12px",
                border: "1px solid #e6e6e6",
                borderRadius: 10,
                background: "#fff",
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 6 }}>{t.emoji}</div>
              <div style={{ fontWeight: 700 }}>{t.title}</div>
              <div style={{ opacity: 0.6, fontSize: 13 }}>
                Zum Modul wechseln
              </div>
            </button>
          ))}
        </div>

        <div
          style={{
            marginTop: 12,
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          <button className="btn" onClick={() => nav("/start")}>
            ← Zurück zu Projekt auswählen
          </button>

          <span style={{ marginLeft: 8, opacity: 0.7, fontSize: 13 }}>
            Oder neues Projekt importieren:
          </span>
          <ImportProjectJsonInline onDone={() => nav("/start")} />
        </div>
      </div>
    </div>
  );
}
