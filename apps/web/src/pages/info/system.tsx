import { rlcClass } from "../../ui/rlcRuntimeStyle";import { API_BASE } from "../../lib/apiBase";
import React, { useEffect, useState } from "react";

const shell = {
  maxWidth: 900,
  margin: "0 auto",
  padding: "12px 16px 40px",
  fontFamily: "Inter,system-ui,Arial",
  color: "#0f172a"
} as const;

const box = {
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  padding: 12,
  margin: "10px 0",
  background: "#fafafa"
} as const;

const row = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap" as const,
  marginTop: 12
} as const;

const btn = {
  padding: "8px 12px",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  background: "#fff",
  cursor: "pointer",
  fontWeight: 600
} as const;

const supportBtn = {
  position: "fixed",
  right: 20,
  bottom: 20,
  background: "#0ea5e9",
  color: "#fff",
  border: "none",
  borderRadius: 999,
  padding: "12px 18px",
  fontWeight: 600,
  cursor: "pointer",
  boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
} as const;

function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${p}` : p;
}

type StatusInfo = {
  ua?: string;
  lang?: string;
  online?: boolean;
  storage?: boolean;
  time?: string;
  api?: string;
};

export default function Systemstatus() {
  const [info, setInfo] = useState<StatusInfo>({});
  const [loading, setLoading] = useState(false);

  const loadInfo = async () => {
    setLoading(true);

    const baseInfo: StatusInfo = {
      ua: navigator.userAgent,
      lang: navigator.language,
      online: navigator.onLine,
      storage: !!window.localStorage,
      time: new Date().toISOString(),
      api: "unbekannt"
    };

    try {
      const res = await fetch(apiUrl("/health"), {
        method: "GET"
      });

      if (res.ok) {
        baseInfo.api = "online";
      } else {
        baseInfo.api = `Fehler (${res.status})`;
      }
    } catch {
      baseInfo.api = "offline / nicht erreichbar";
    }

    setInfo(baseInfo);
    setLoading(false);
  };

  useEffect(() => {
    loadInfo();

    const onOnline = () => {
      setInfo((prev) => ({
        ...prev,
        online: true,
        time: new Date().toISOString()
      }));
    };

    const onOffline = () => {
      setInfo((prev) => ({
        ...prev,
        online: false,
        time: new Date().toISOString()
      }));
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const clearAll = () => {
    if (confirm("Lokalen Speicher wirklich leeren?")) {
      localStorage.clear();
      alert("Lokale Daten gelöscht.");
      loadInfo();
    }
  };

  const openSupport = () => {
    window.location.href = "/info/support";
  };

  return (
    <div className={rlcClass(null, shell)}>
      <h2>Systemstatus</h2>

      <div className={rlcClass(null, box)}>
        <b>API-Status:</b> {loading ? "Prüfung läuft..." : info.api}
      </div>

      <div className={rlcClass(null, box)}>
        <b>Browser:</b> {info.ua}
      </div>

      <div className={rlcClass(null, box)}>
        <b>Sprache:</b> {info.lang}
        <br />
        <b>Online:</b> {String(info.online)}
        <br />
        <b>LocalStorage:</b> {String(info.storage)}
      </div>

      <div className={rlcClass(null, box)}>
        <b>Uhrzeit:</b> {info.time}
      </div>

      <div className={rlcClass(null, row)}>
        <button className={rlcClass(null, btn)} onClick={loadInfo} type="button">
          Status aktualisieren
        </button>

        <button className={rlcClass(null, btn)} onClick={clearAll} type="button">
          Lokale Daten löschen
        </button>
      </div>

      <button className={rlcClass(null, supportBtn)} onClick={openSupport} type="button">
        Support Chat
      </button>
    </div>);

}
