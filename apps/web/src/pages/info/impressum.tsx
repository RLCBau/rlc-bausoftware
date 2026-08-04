import { rlcClass } from "../../ui/rlcRuntimeStyle";import React from "react";

/* ================= STYLE ================= */

const shell = {
  maxWidth: 900,
  margin: "0 auto",
  padding: "12px 16px 40px",
  fontFamily: "Inter,system-ui,Arial"
} as const;

const p = {
  margin: "8px 0",
  color: "#334155",
  lineHeight: 1.5
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

/* ================= COMPONENT ================= */

export default function Impressum() {
  const openSupport = () => {
    alert("Support Chat wird geöffnet (Integration folgt)");
  };

  return (
    <div className={rlcClass(null, shell)}>
      <h2>Impressum</h2>

      <p className={rlcClass(null, p)}>
        <b>Firma:</b> RLC Bausoftware
      </p>

      <p className={rlcClass(null, p)}>
        <b>Inhaber:</b> Roberto Lo Curto
      </p>

      <p className={rlcClass(null, p)}>
        <b>Anschrift:</b> (Adresse eintragen)
      </p>

      <p className={rlcClass(null, p)}>
        <b>E-Mail:</b> info@rlcbausoftware.com
      </p>

      <p className={rlcClass(null, p)}>
        <b>Telefon:</b> (optional)
      </p>

      <p className={rlcClass(null, p)}>
        <b>Umsatzsteuer-ID:</b> (falls vorhanden)
      </p>

      <p className={rlcClass(null, p)}>
        <b>Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV:</b>
        <br />
        Roberto Lo Curto
      </p>

      {/* SUPPORT BUTTON */}
      <button className={rlcClass(null, supportBtn)} onClick={openSupport}>
        Support Chat
      </button>
    </div>);

}
