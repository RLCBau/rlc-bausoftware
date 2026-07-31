import React, { useMemo } from "react";
import { useRechnungen, useZahlungen, useLieferscheine } from "./stores";

export default function Uebersicht(){
  const [re] = useRechnungen();
  const [za] = useZahlungen();
  const [ls] = useLieferscheine();

  const sumRe = useMemo(()=> re.reduce((s,r)=> s + (r.betragBrutto||0),0),[re]);
  const sumZa = useMemo(()=> za.reduce((s,z)=> s + (z.betrag||0),0),[za]);
  const sumLs = useMemo(()=> ls.reduce((s,l)=> s + (l.kosten||0),0),[ls]);

  const offen = Math.max(0, sumRe - sumZa);
  const cash = sumZa - sumLs;
  const guv = (re.reduce((s,r)=> s + (r.betragNetto||0),0)) - sumLs;

  return (
    <div>
      <h2>Übersicht</h2>
      <div className="bh-cards">
        <div className="bh-card"><div className="k">Rechnungen (Brutto)</div><div className="v">{sumRe.toFixed(2)} €</div></div>
        <div className="bh-card"><div className="k">Zahlungen</div><div className="v">{sumZa.toFixed(2)} €</div></div>
        <div className="bh-card"><div className="k">Offene Posten</div><div className="v">{offen.toFixed(2)} €</div></div>
        <div className="bh-card"><div className="k">Kosten (Lieferscheine)</div><div className="v">{sumLs.toFixed(2)} €</div></div>
        <div className="bh-card"><div className="k">Cashflow</div><div className="v">{cash.toFixed(2)} €</div></div>
        <div className="bh-card"><div className="k">GuV (≈ Umsatz − Kosten)</div><div className="v">{guv.toFixed(2)} €</div></div>
      </div>
    </div>
  );
}
