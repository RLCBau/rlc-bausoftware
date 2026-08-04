import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/ki/Foto.tsx

import React, { useMemo, useState } from "react";
import { useProject } from "../../store/useProject";

const shell = {
  maxWidth: 900,
  margin: "0 auto",
  padding: "12px 16px",
  fontFamily: "Inter,system-ui,Arial"
} as const;

const card = {
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: 16,
  background: "#fff"
} as const;

const input = {
  margin: "8px 0"
} as const;

const btn = {
  padding: "8px 12px",
  border: "1px solid #cbd5e1",
  background: "#fff",
  borderRadius: 8,
  fontSize: 13,
  cursor: "pointer"
} as const;

const muted = {
  color: "#6b7280",
  fontSize: 13
} as const;

type KiPhotoResponse = {
  items?: string[];
  result?: string[];
  suggestions?: string[];
  text?: string;
};

export default function Foto() {
  const { currentProject } = useProject();
  const projectId = currentProject?.id ?? "";
  const projectCode = currentProject?.code ?? "";

  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewUrl = useMemo(() => {
    if (!file) return "";
    return URL.createObjectURL(file);
  }, [file]);

  const effectiveProject = projectCode || projectId || "";

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.files?.[0] || null;
    setFile(next);
    setResult([]);
    setError(null);
  };

  async function runRecognition() {
    if (!file) {
      setError("Bitte zuerst ein Foto auswÃ¤hlen.");
      return;
    }

    if (!effectiveProject) {
      setError("Kein Projekt ausgewÃ¤hlt.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult([]);

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("projectId", projectId || "");
      fd.append("projectCode", projectCode || "");

      const uploadRes = await fetch("/api/ki/vision-files", {
        method: "POST",
        body: fd
      });

      if (!uploadRes.ok) {
        throw new Error((await uploadRes.text()) || "Upload fehlgeschlagen");
      }

      const uploadData = await uploadRes.json();

      const suggestRes = await fetch("/api/ki/photos/suggest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          projectId: projectId || "",
          projectCode: projectCode || "",
          files: Array.isArray(uploadData?.files) ? uploadData.files : undefined,
          fileId: uploadData?.fileId,
          fileName: file.name
        })
      });

      if (!suggestRes.ok) {
        throw new Error((await suggestRes.text()) || "Foto-KI fehlgeschlagen");
      }

      const data: KiPhotoResponse = await suggestRes.json();

      const lines = Array.isArray(data?.items) ?
      data.items :
      Array.isArray(data?.result) ?
      data.result :
      Array.isArray(data?.suggestions) ?
      data.suggestions :
      typeof data?.text === "string" ?
      data.text.
      split("\n").
      map((x) => x.trim()).
      filter(Boolean) :
      [];

      setResult(lines);
    } catch (e: any) {
      setError(e?.message || "Fehler bei Fotoerkennung");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={rlcClass(null, shell)}>
      <h2>Fotoerkennung (KI)</h2>

      <div className={rlcClass(null, card)}>
        <div className={rlcClass(null, muted)}>Projekt: {effectiveProject || "â€”"}</div>

        <input
          type="file"
          accept="image/*" className={rlcClass(null,
          input)}
          onChange={handleFile} />
        

        <div className="rlc-migrated-pages-ki-foto-tsx-1080">
          <button className={rlcClass(null, btn)} onClick={() => void runRecognition()} disabled={!file || loading}>
            {loading ? "Erkenne..." : "Foto analysieren"}
          </button>
        </div>

        {error &&
        <div className="rlc-migrated-pages-ki-foto-tsx-1081">
            {error}
          </div>
        }

        {file &&
        <div className="rlc-migrated-pages-ki-foto-tsx-1082">
            <div className={rlcClass(null, { ...muted, marginBottom: 8 })}>
              Datei: <strong>{file.name}</strong>
            </div>

            <img
            src={previewUrl}
            alt="Vorschau" className="rlc-migrated-pages-ki-foto-tsx-1083" />






          
          </div>
        }
      </div>

      <div className={rlcClass(null, { ...card, marginTop: 16 })}>
        <h3 className="rlc-migrated-pages-ki-foto-tsx-1084">Ergebnis</h3>

        {!result.length && !loading &&
        <div className={rlcClass(null, muted)}>Noch keine Analyse durchgefÃ¼hrt.</div>
        }

        {!!result.length &&
        <ul className="rlc-migrated-pages-ki-foto-tsx-1085">
            {result.map((r, i) =>
          <li key={`${r}-${i}`} className="rlc-migrated-pages-ki-foto-tsx-1086">
                {r}
              </li>
          )}
          </ul>
        }
      </div>
    </div>);

}

