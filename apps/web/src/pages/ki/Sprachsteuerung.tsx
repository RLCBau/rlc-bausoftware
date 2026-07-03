// apps/web/src/pages/ki/Sprachsteuerung.tsx

import React from "react";
import { useProject } from "../../store/useProject";

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0?: {
    transcript?: string;
  };
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionErrorLike = {
  error?: string;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: null | (() => void);
  onend: null | (() => void);
  onerror: null | ((e: SpeechRecognitionErrorLike) => void);
  onresult: null | ((evt: SpeechRecognitionEventLike) => void);
  start: () => void;
  stop: () => void;
};

type ProjectLike = {
  id?: string;
  code?: string;
};

declare global {
  interface Window {
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    SpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

const shell: React.CSSProperties = {
  display: "grid",
  gap: 16,
};

const card: React.CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: 10,
  padding: 16,
  background: "#fff",
  display: "grid",
  gap: 12,
};

const input: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 14,
};

export default function Sprachsteuerung() {
  const projectCtx = useProject() as unknown as {
    currentProject?: ProjectLike | null;
  };

  const currentProject = projectCtx?.currentProject ?? null;
  const storeProjectId = currentProject?.id ?? "";
  const projectCode = currentProject?.code ?? "";

  const [lang, setLang] = React.useState("de-DE");
  const [listening, setListening] = React.useState(false);
  const [interim, setInterim] = React.useState("");
  const [finalText, setFinalText] = React.useState("");
  const [projectInput, setProjectInput] = React.useState("");
  const [date, setDate] = React.useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [error, setError] = React.useState<string | null>(null);

  const recogRef = React.useRef<SpeechRecognitionLike | null>(null);
  const restartTimerRef = React.useRef<number | null>(null);

  const effectiveProjectId = React.useMemo(
    () => projectInput.trim() || storeProjectId || projectCode || "",
    [projectInput, storeProjectId, projectCode]
  );

  const resetRecognition = React.useCallback(() => {
    if (recogRef.current) {
      try {
        recogRef.current.stop();
      } catch {}
    }
    recogRef.current = null;
  }, []);

  const ensureRecognition = React.useCallback(() => {
    if (recogRef.current) return recogRef.current;

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      window.alert(
        "Spracherkennung wird von diesem Browser nicht unterstützt. Bitte Chrome oder Edge verwenden."
      );
      return null;
    }

    const rec = new SR();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      setListening(true);
      setInterim("");
      setError(null);
    };

    rec.onend = () => {
      setListening(false);
    };

    rec.onerror = (e: SpeechRecognitionErrorLike) => {
      console.warn("[Speech] error", e?.error || e);
      setError(e?.error || "Spracherkennung fehlgeschlagen");
    };

    rec.onresult = (evt: SpeechRecognitionEventLike) => {
      let interimChunk = "";
      let finalChunk = "";

      for (let i = evt.resultIndex; i < evt.results.length; i++) {
        const res = evt.results[i];
        const txt = res?.[0]?.transcript || "";
        if (res.isFinal) finalChunk += txt;
        else interimChunk += txt;
      }

      if (interimChunk) setInterim(interimChunk.trim());

      if (finalChunk) {
        setFinalText((old) =>
          (old + (old ? " " : "") + finalChunk.trim()).trim()
        );
        setInterim("");
      }
    };

    recogRef.current = rec;
    return rec;
  }, [lang]);

  const start = React.useCallback(() => {
    const rec = ensureRecognition();
    if (!rec) return;
    try {
      rec.start();
    } catch (e) {
      console.debug(e);
    }
  }, [ensureRecognition]);

  const stop = React.useCallback(() => {
    const rec = ensureRecognition();
    if (!rec) return;
    try {
      rec.stop();
    } catch (e) {
      console.debug(e);
    }
  }, [ensureRecognition]);

  React.useEffect(() => {
    if (!listening) return;

    resetRecognition();

    if (restartTimerRef.current) {
      window.clearTimeout(restartTimerRef.current);
    }

    restartTimerRef.current = window.setTimeout(() => {
      start();
    }, 120);

    return () => {
      if (restartTimerRef.current) {
        window.clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
    };
  }, [lang, listening, resetRecognition, start]);

  React.useEffect(() => {
    return () => {
      if (restartTimerRef.current) {
        window.clearTimeout(restartTimerRef.current);
      }
      resetRecognition();
    };
  }, [resetRecognition]);

  const composedText =
    finalText + (interim ? (finalText ? " " : "") + interim : "");

  async function saveAndOpenRegie() {
    try {
      if (!effectiveProjectId) {
        window.alert("Bitte Projekt-ID eingeben.");
        return;
      }
      if (!finalText.trim()) {
        window.alert("Kein Text erkannt.");
        return;
      }

      setError(null);

      const res = await fetch("/api/ki/parse-speech/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: finalText.trim(),
          projectId: effectiveProjectId,
          projectCode: projectCode || "",
          date,
        }),
      });

      if (!res.ok) throw new Error(await res.text());

      const data = (await res.json()) as {
        saved?: { id?: string };
      };

      sessionStorage.setItem("regie:openProjectId", effectiveProjectId);
      if (data?.saved?.id) {
        sessionStorage.setItem("regie:focusId", String(data.saved.id));
      }

      window.location.href = `/mengenermittlung/regieberichte?projectId=${encodeURIComponent(
        effectiveProjectId
      )}`;
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "Speichern/Öffnen fehlgeschlagen";
      setError(msg);
      window.alert(msg);
    }
  }

  function openRegie() {
    if (!effectiveProjectId) {
      window.alert("Bitte Projekt-ID eingeben.");
      return;
    }
    sessionStorage.setItem("regie:openProjectId", effectiveProjectId);
    window.location.href = `/mengenermittlung/regieberichte?projectId=${encodeURIComponent(
      effectiveProjectId
    )}`;
  }

  async function parseWithKI() {
    try {
      if (!effectiveProjectId) {
        window.alert("Bitte Projekt-ID eingeben.");
        return;
      }
      if (!finalText.trim()) {
        window.alert("Kein Text erkannt.");
        return;
      }

      setError(null);

      const res = await fetch("/api/ki/parse-speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: finalText.trim(),
          projectId: effectiveProjectId,
          projectCode: projectCode || "",
          date,
        }),
      });

      if (!res.ok) throw new Error(await res.text());

      const data = (await res.json()) as {
        ok: boolean;
        item: unknown;
      };

      const doSave = window.confirm(
        "Gefundene Daten:\n\n" +
          JSON.stringify(data.item, null, 2) +
          "\n\nSoll der Eintrag gespeichert werden?"
      );

      if (!doSave) return;

      const save = await fetch("/api/regie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(typeof data.item === "object" && data.item ? data.item : {}),
          projectId: effectiveProjectId,
          projectCode: projectCode || "",
          date,
        }),
      });

      if (!save.ok) throw new Error(await save.text());

      window.alert("Regiebericht angelegt!");
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "KI-Parsing fehlgeschlagen";
      setError(msg);
      window.alert(msg);
    }
  }

  return (
    <div style={shell}>
      <h1>Sprachsteuerung (Regieberichte diktieren)</h1>

      <div style={card}>
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <label style={{ fontSize: 13, color: "var(--muted)" }}>Sprache</label>
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            style={{ ...input, width: 180 }}
          >
            <option value="de-DE">Deutsch (de-DE)</option>
            <option value="it-IT">Italiano (it-IT)</option>
            <option value="en-US">English (en-US)</option>
          </select>

          <label
            style={{ marginLeft: 16, fontSize: 13, color: "var(--muted)" }}
          >
            Projekt-ID
          </label>
          <input
            value={projectInput}
            onChange={(e) => setProjectInput(e.target.value)}
            placeholder="z. B. BA-2025-834"
            style={{ ...input, flex: 1, minWidth: 160 }}
          />

          <label
            style={{ marginLeft: 16, fontSize: 13, color: "var(--muted)" }}
          >
            Datum
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{ ...input, width: 150 }}
          />

          {!listening ? (
            <button className="btn" onClick={start} title="Start">
              🎙️ Start
            </button>
          ) : (
            <button className="btn" onClick={stop} title="Stop">
              ⏹️ Stop
            </button>
          )}
        </div>

        <div style={{ fontSize: 12, color: "#6b7280" }}>
          Aktiv: {effectiveProjectId || "kein Projekt gewählt"}
        </div>

        <div style={{ position: "relative" }}>
          <textarea
            value={composedText}
            onChange={(e) => {
              setFinalText(e.target.value);
              setInterim("");
            }}
            placeholder="gesprochenes Kommando…"
            style={{
              width: "100%",
              minHeight: 160,
              padding: 12,
              border: "1px solid var(--line)",
              borderRadius: 8,
              fontSize: 14,
            }}
          />
          {listening && (
            <div
              style={{
                position: "absolute",
                right: 12,
                top: 12,
                fontSize: 12,
                color: "#16a34a",
              }}
            >
              ● recording
            </div>
          )}
        </div>

        {error && <div style={{ color: "#b91c1c", fontSize: 13 }}>{error}</div>}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button
            className="btn"
            onClick={parseWithKI}
            disabled={!finalText.trim()}
          >
            KI-Parsing
          </button>
          <button
            className="btn"
            onClick={saveAndOpenRegie}
            disabled={!effectiveProjectId || !finalText.trim()}
          >
            ➜ Als Regiebericht speichern & öffnen
          </button>
          <button
            className="btn"
            onClick={openRegie}
            disabled={!effectiveProjectId}
          >
            Regieberichte öffnen
          </button>
          <button
            className="btn"
            onClick={() => {
              setFinalText("");
              setInterim("");
              setError(null);
            }}
          >
            Leeren
          </button>
        </div>
      </div>
    </div>
  );
}





