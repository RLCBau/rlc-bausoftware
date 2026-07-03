import { API_BASE } from "../../lib/apiBase";
import React, { useRef, useState } from "react";

type Props = {
  onImported?: () => void;
};

function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${p}` : p;
}

export default function ProjectImport({ onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const openPicker = () => inputRef.current?.click();

  const onPick: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;

    setMsg(null);
    setBusy(true);

    try {
      const fd = new FormData();
      fd.append("file", f);

      const isJson = /\.json$/i.test(f.name);
      const isZip = /\.zip$/i.test(f.name);

      if (!isJson && !isZip) {
        throw new Error("Bitte eine .json oder .zip Datei auswählen.");
      }

      const endpoint = isJson
        ? apiUrl("/api/import/project-json")
        : apiUrl("/api/import/project-zip");

      const r = await fetch(endpoint, {
        method: "POST",
        body: fd,
        credentials: "include",
      });

      const j = await r.json().catch(() => null);

      if (!r.ok || !j || j.ok === false) {
        throw new Error(j?.error || "Import fehlgeschlagen");
      }

      setMsg(`✅ Import OK: ${j.project?.name || j.created || j.from || f.name}`);
      onImported?.();
    } catch (err: any) {
      console.error("Import error:", err);
      setMsg(`❌ ${err?.message || String(err)}`);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={openPicker}
        disabled={busy}
        style={{ padding: "8px 14px", borderRadius: 6, cursor: "pointer" }}
      >
        {busy ? "Importiere..." : "Import"}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept=".json,.zip,application/json,application/zip"
        onChange={onPick}
        style={{ display: "none" }}
      />

      {busy && <span>⏳ Import läuft...</span>}
      {msg && <span>{msg}</span>}
    </div>
  );
}










