import React, { useMemo } from "react";
import { useRechnungen, useZahlungen, useLieferscheine } from "./stores";
import "./styles.css";

function safeNumber(v: unknown, fallback = 0) {
  if (v === null || v === undefined || v === "") return fallback;
  const normalized =
    typeof v === "string" ? v.replace(/\s/g, "").replace(",", ".") : v;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : fallback;
}

const fmt = (n: number) =>
  safeNumber(n).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function Uebersicht() {
  const [re] = useRechnungen();
  const [za] = useZahlungen();
  const [ls] = useLieferscheine();

  const sumRe = useMemo(
    () =>
      (re || []).reduce(
        (s, r: any) => s + safeNumber(r.betragBrutto ?? r.brutto ?? 0),
        0
      ),
    [re]
  );

  const sumReNetto = useMemo(
    () =>
      (re || []).reduce(
        (s, r: any) => s + safeNumber(r.betragNetto ?? r.netto ?? 0),
        0
      ),
    [re]
  );

  const sumZa = useMemo(
    () =>
      (za || []).reduce((s, z: any) => s + safeNumber(z.betrag ?? 0), 0),
    [za]
  );

  const sumLs = useMemo(
    () =>
      (ls || []).reduce(
        (s, l: any) => s + safeNumber(l.kosten ?? l.betrag ?? 0),
        0
      ),
    [ls]
  );

  const offen = Math.max(0, sumRe - sumZa);
  const cash = sumZa - sumLs;
  const guv = sumReNetto - sumLs;

  return (
    <div className="bh-page">
      <h2>Übersicht</h2>

      <div className="bh-cards">
        <div className="bh-card">
          <div className="k">Rechnungen (Brutto)</div>
          <div className="v">{fmt(sumRe)} €</div>
        </div>

        <div className="bh-card">
          <div className="k">Zahlungen</div>
          <div className="v">{fmt(sumZa)} €</div>
        </div>

        <div className="bh-card">
          <div className="k">Offene Posten</div>
          <div className="v">{fmt(offen)} €</div>
        </div>

        <div className="bh-card">
          <div className="k">Kosten (Lieferscheine)</div>
          <div className="v">{fmt(sumLs)} €</div>
        </div>

        <div className="bh-card">
          <div className="k">Cashflow</div>
          <div className="v">{fmt(cash)} €</div>
        </div>

        <div className="bh-card">
          <div className="k">GuV (≈ Umsatz − Kosten)</div>
          <div className="v">{fmt(guv)} €</div>
        </div>
      </div>
    </div>
  );
}





