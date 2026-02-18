import React, { useRef, useState } from "react";

export default function ProjectImport() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const API = import.meta.env.VITE_API_URL || "http://localhost:4000";

  const openPicker = () => inputRef.current?.click();

  const onPick: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setMsg(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await fetch(`${API}/api/import/project`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Import fehlgeschlagen");
      setMsg(`✅ Import OK: ${j.project?.name || j.created || j.from}`);
      // TODO: refresh lista progetti o navigate allo specifico progetto
    } catch (err: any) {
      setMsg(`❌ ${err.message}`);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <button
        type="button"
        onClick={openPicker}
        disabled={busy}
        style={{ padding: "8px 14px", borderRadius: 6, cursor: "pointer" }}
      >
        Import
      </button>

      <input
        ref={inputRef}
        type="file"
        accept=".json,.zip"
        onChange={onPick}
        style={{ display: "none" }}
      />

      {busy && <span>⏳ Import…</span>}
      {msg && <span>{msg}</span>}
    </div>
  );
}
