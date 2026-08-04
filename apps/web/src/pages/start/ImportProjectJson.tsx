import { API_BASE } from "../../lib/apiBase";
import React, { useRef, useState } from "react";

function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${p}` : p;
}

type Props = {
  onImported?: () => void;
};

export default function ImportProjectJson({ onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handleChoose = () => {
    fileRef.current?.click();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    const isJsonName = /\.json$/i.test(f.name);
    const isJsonType =
    f.type === "application/json" || f.type === "text/json";

    if (!isJsonName && !isJsonType) {
      window.alert("Bitte eine gültige project.json auswählen.");
      e.target.value = "";
      return;
    }

    setBusy(true);

    try {
      const fd = new FormData();
      fd.append("file", f);

      const res = await fetch(apiUrl("/api/import/project-json"), {
        method: "POST",
        body: fd,
        credentials: "include"
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json || json?.ok === false) {
        throw new Error(json?.error || `Import fehlgeschlagen (${res.status})`);
      }

      onImported?.();

      window.alert(
        `Import erfolgreich: ${
        json?.imported?.name || json?.project?.name || f.name}`

      );
    } catch (err: any) {
      console.error("Import error:", err);
      window.alert(`Fehler beim Import: ${err?.message || String(err)}`);
    } finally {
      setBusy(false);
      if (fileRef.current) {
        fileRef.current.value = "";
      }
    }
  };

  return (
    <div className="rlc-migrated-pages-start-importprojectjson-tsx-1560">
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"

        onChange={handleFile} className="rlc-migrated-pages-start-importprojectjson-tsx-1561" />
      

      <button type="button" onClick={handleChoose} disabled={busy}>
        {busy ? "Importiere..." : "Import project.json"}
      </button>

      <small>
        Unterstützt: Datei <code>project.json</code>
      </small>
    </div>);

}
