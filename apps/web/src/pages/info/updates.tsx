import { API_BASE } from "../../lib/apiBase";
import React, { useState } from "react";

function apiUrl(path: string) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${p}` : p;
}

const shell = {
  maxWidth: 800,
  margin: "0 auto",
  padding: "12px 16px 40px",
  fontFamily: "Inter,system-ui,Arial",
} as const;

const card = {
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  padding: 10,
  margin: "10px 0",
} as const;

const btn = {
  padding: "8px 12px",
  border: "1px solid #cbd5e1",
  background: "#fff",
  borderRadius: 6,
  fontSize: 13,
  cursor: "pointer",
} as const;

export default function Updates() {
  const [log, setLog] = useState("");
  const [loading, setLoading] = useState(false);

  const check = async () => {
    setLoading(true);
    setLog("");

    try {
      const res = await fetch(apiUrl("/health"));
      const data = await res.json();

      setLog(
        `Version Web: v0.4\nServer: ONLINE\nZeit: ${new Date(
          data.ts
        ).toLocaleString()}`
      );
    } catch {
      setLog("Server nicht erreichbar ❌");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={shell}>
      <h2>Updates & System</h2>

      <button style={btn} onClick={check}>
        {loading ? "Prüfe..." : "Auf Updates prüfen"}
      </button>

      <div style={card}>
        {log || "Noch keine Prüfung durchgeführt."}
      </div>

      <div style={{ fontSize: 12, color: "#64748b" }}>
        Hinweis: Automatische Updates, Versionsvergleich und
        Release-Notes werden integriert.
      </div>
    </div>
  );
}










