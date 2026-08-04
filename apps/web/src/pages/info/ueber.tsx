import { rlcClass } from "../../ui/rlcRuntimeStyle";import React from "react";

const shell = {
  maxWidth: 760,
  margin: "0 auto",
  padding: "12px 16px 40px",
  fontFamily: "Inter,system-ui,Arial",
  color: "#0f172a"
} as const;

const p = {
  margin: "10px 0",
  color: "#334155",
  lineHeight: 1.6
} as const;

const card = {
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  padding: 14,
  margin: "12px 0",
  background: "#fff"
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

export default function Ueber() {
  const openSupport = () => {
    window.location.href = "/info/support";
  };

  return (
    <div className={rlcClass(null, shell)}>
      <h2>Über die App</h2>

      <div className={rlcClass(null, card)}>
        <p className={rlcClass(null, p)}>
          <b>RLC Bausoftware</b> ist eine modulare Softwarelösung für reale
          Baustellen- und Büroprozesse im Tiefbau, Leitungsbau und verwandten
          Bereichen.
        </p>

        <p className={rlcClass(null, p)}>
          Die Anwendung ist auf eine schnelle, praktische und strukturierte
          Arbeitsweise ausgelegt – sowohl im Büro als auch mobil auf der
          Baustelle.
        </p>
      </div>

      <div className={rlcClass(null, card)}>
        <p className={rlcClass(null, p)}>
          <b>Aktuelle Hauptbereiche:</b>
        </p>
        <p className={rlcClass(null, p)}>
          Mengenermittlung, Kalkulation, CAD, Büro / Verwaltung, Buchhaltung,
          KI sowie Info / Hilfe.
        </p>
      </div>

      <div className={rlcClass(null, card)}>
        <p className={rlcClass(null, p)}>
          <b>Ziel:</b> Eine moderne Bausoftware, die schneller, schlanker und
          praxisnäher ist als klassische Systeme und sich an realen
          Baustellenabläufen orientiert.
        </p>
      </div>

      <div className={rlcClass(null, card)}>
        <p className={rlcClass(null, p)}>
          <b>Systemstand:</b> Demo / Entwicklungsstand
        </p>
        <p className={rlcClass(null, p)}>
          Web, Mobile, Server, Cloud-API und Support-Funktionen werden laufend
          erweitert.
        </p>
      </div>

      <button className={rlcClass(null, supportBtn)} onClick={openSupport} type="button">
        Support Chat
      </button>
    </div>);

}
