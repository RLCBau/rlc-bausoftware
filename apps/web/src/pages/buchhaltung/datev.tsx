
import React, { useEffect, useMemo, useState } from "react";
import { accountingApi, dateDe, euro } from "./accountingApi";
import "./styles.css";

function csv(value:any) {
  const raw = String(value ?? "");
  // Protect text fields when a DATEV CSV is viewed in spreadsheet software.
  const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(raw) && !/^-?\d+(?:[.,]\d+)?$/.test(raw.trim())
    ? "'" + raw
    : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

export default function DATEV() {
  const [data, setData] = useState<any>({
    items: [],
    project: null
  });

  const [error, setError] = useState("");
  const [taxData, setTaxData] = useState<any>(null);
  const [taxError, setTaxError] = useState("");
  const [period, setPeriod] = useState("");
  const [mappings,setMappings]=useState<any[]>([]);
  const [mappingError,setMappingError]=useState("");
  const [mappingBusy,setMappingBusy]=useState("");
  const [mappingHistory,setMappingHistory]=useState<{account:string;items:any[]}|null>(null);
  const [chart,setChart]=useState("SKR03");
  const [categories,setCategories]=useState<Record<string,string>>({});

  const load = async () => {
    try {
      setError("");
      const [journal, tax] = await Promise.allSettled([
        accountingApi("/api/accounting/datev"),
        accountingApi("/api/accounting/ust")
      ]);
      if(journal.status==="rejected")throw journal.reason;
      setData(journal.value);
      if(tax.status==="fulfilled"){setTaxData(tax.value);setTaxError("");}
      else {setTaxData(null);setTaxError("USt-Vergleich konnte nicht geladen werden.");}
      try {const result=await accountingApi("/api/accounting/tax-account-mappings");setMappings(result.items||[]);setMappingError("");}
      catch(e:any){setMappings([]);setMappingError(e?.message||"Kontenklassifikation nicht verfügbar.");}
    } catch (e:any) {
      setError(e?.message || "Fehler");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filteredItems = useMemo(() => (data.items||[]).filter((row:any) =>
    !period || String(row.date||"").slice(0,7)===period
  ),[data.items,period]);
  const taxPeriodWarning = Boolean(period);
  const downloadAccountTemplate = () => {
    if(!accountInventory.length)return;
    const cols=["Konto","Kontenrahmen","Kontoart","Steuerkennzeichen","Prüfstatus"];
    const lines=[cols.map(csv).join(";"),...accountInventory.map(([account])=>[account,"","","","OFFEN"].map(csv).join(";"))];
    const blob=new Blob(["\uFEFF"+lines.join("\r\n")],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");
    a.href=url;a.download="RLC_Kontenpruefung_"+(data.project?.code||"Projekt")+".csv";a.click();
    window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  const totals = useMemo(() => {
    let soll = 0;
    let haben = 0;

    for (const row of filteredItems) {
      const amount = Number(row.amount || 0);

      if (Number.isFinite(amount)) {
        // Each row contains both debit and credit sides.
        soll += Math.abs(amount);
        haben += Math.abs(amount);
      }
    }

    return { soll, haben };
  }, [filteredItems]);

  const accountInventory = useMemo(() => {
    const accounts = new Map<string,{count:number,debit:number,credit:number,refs:Set<string>}>();
    for (const item of filteredItems) {
      const amount=Number(item.amount);
      if(!Number.isFinite(amount))continue;
      for(const [key,side] of [[String(item.account||""),"Konto"],[String(item.contraAccount||""),"Gegenkonto"]] as const){
        if(!key.trim())continue;
        const found=accounts.get(key)||{count:0,debit:0,credit:0,refs:new Set<string>()};
        found.count++;
        // Positive amount: main account debit, contra account credit; negative reverses them.
        if ((side === "Konto") === (amount > 0)) found.debit += Math.abs(amount);
        else found.credit += Math.abs(amount);
        found.refs.add(side);
        accounts.set(key,found);
      }
    }
    return [...accounts.entries()].sort((a,b)=>a[0].localeCompare(b[0],"de",{numeric:true}));
  },[filteredItems]);

  const showMappingHistory=async(account:string)=>{
    setMappingError("");
    try{const r=await accountingApi("/api/accounting/tax-account-mappings/"+encodeURIComponent(account)+"/history");setMappingHistory({account,items:r.items||[]});}
    catch(e:any){setMappingError(e?.message||"Historie nicht verfügbar.");}
  };
  const saveMapping=async(account:string)=>{
    const category=categories[account];
    if(!category){setMappingError("Bitte Kontoart auswählen.");return;}
    if(!window.confirm("Konto "+account+" dem Kontenrahmen "+chart+" und der Kontoart "+category+" zuordnen? Keine Steuerfreigabe."))return;
    setMappingBusy(account);setMappingError("");
    try{
      await accountingApi("/api/accounting/tax-account-mappings/"+encodeURIComponent(account),{method:"PUT",body:JSON.stringify({chart,category})});
      const result=await accountingApi("/api/accounting/tax-account-mappings");setMappings(result.items||[]);
    }catch(e:any){setMappingError(e?.message||"Speichern fehlgeschlagen.");}
    finally{setMappingBusy("");}
  };
  const journalChecks = useMemo(() => {
    const issues:{id:string;date:string;account:string;problem:string}[]=[];
    for(const row of filteredItems){
      const account=String(row.account||"").trim();
      const contra=String(row.contraAccount||"").trim();
      const amount=Number(row.amount);
      const date=String(row.date||"");
      const found:string[]=[];
      if(!account||!contra)found.push("Konto / Gegenkonto fehlt");
      if(account&&contra&&account===contra)found.push("Konto identisch mit Gegenkonto");
      if(!Number.isFinite(amount)||Math.abs(amount)<0.005)found.push("Betrag ungültig oder Null");
      if(Number.isFinite(amount)&&Math.abs(amount*100-Math.round(amount*100))>0.001)found.push("Betrag mit mehr als zwei Nachkommastellen");
      if(!date||Number.isNaN(Date.parse(date)))found.push("Buchungsdatum ungültig");
      for(const problem of found)issues.push({id:String(row.id||""),date,account,problem});
    }
    return issues;
  },[filteredItems]);
  const exportCsv = () => {
    if (filteredItems.length === 0) {
      setError("Keine Journalbuchungen für den CSV-Export vorhanden.");
      return;
    }
    setError("");
    const header = [
      "Umsatz",
      "Soll/Haben",
      "Konto",
      "Gegenkonto",
      "Buchungsdatum",
      "Buchungstext"
    ];

    const lines = [
      header.map(csv).join(";"),
      ...filteredItems.map((row:any) => {
        const amount = Number(row.amount || 0);

        return [
          Math.abs(amount).toFixed(2).replace(".", ","),
          amount < 0 ? "S" : "H",
          row.account,
          row.contraAccount,
          dateDe(row.date),
          row.text || ""
        ].map(csv).join(";");
      })
    ];

    const blob = new Blob(
      [lines.join("\n")],
      { type:"text/csv;charset=utf-8" }
    );

    const a = document.createElement("a");
    const href = URL.createObjectURL(blob);

    const fileName = `DATEV_${data.project?.code || "Projekt"}${period?"_"+period:""}.csv`;
    a.href = href;
    a.download = fileName;

    a.click();
    URL.revokeObjectURL(href);

    const dmsProjectId = String(data.project?.id || "").trim();
    if (dmsProjectId) {
      void import("../../lib/dmsArchive")
        .then(({ archiveWebFile }) => archiveWebFile(dmsProjectId, fileName, blob))
        .catch((error) => console.warn("[datev:csv:dms]", error));
    }
  };

  return (
    <div className="bh-page">
      <div className="bh-header-row">
        <div>
          <h2>DATEV / Export</h2>
          <div className="bh-note">
            Projekt: {data.project?.code || "—"} ·
            Soll {euro(totals.soll)} € ·
            Haben {euro(totals.haben)} €
          </div>
        </div>

        <div className="bh-actions">
          <button className="bh-btn ghost" onClick={load}>
            Aktualisieren
          </button>

          <button className="bh-btn" onClick={exportCsv} disabled={!filteredItems.length || !!error}>
            Buchungs-CSV exportieren
          </button>
        </div>
      </div>

      <div className="bh-card">
        <label>Journalperiode (Buchungsdatum) <input type="month" value={period} onChange={e=>setPeriod(e.target.value)} /></label>
        <button type="button" className="bh-btn ghost" onClick={()=>setPeriod("")} style={{marginLeft:8}}>Alle Perioden</button>
        <span className="bh-note"> {filteredItems.length} von {data.items?.length||0} Journalzeilen</span>
        {taxPeriodWarning&&<p className="bh-note">Der Journalfilter gilt für Kontenprüfung und CSV-Export. Die USt-Kennzahlen sind weiterhin projektweit und dürfen NICHT als Periodenabgleich interpretiert werden.</p>}
      </div>
      <div className="bh-note">Buchungsdaten als CSV für Prüfung und Abstimmung. Kein zertifizierter DATEV-Buchungsstapel-Import; für den direkten DATEV-Import müssen Format, Pflichtfelder und Kontenrahmen gesondert geprüft werden.</div>
      <section className="bh-card" aria-label="USt Journal Abstimmung">
        <strong>USt ↔ Journal · Abstimmungsprüfung</strong>
        <p className="bh-note">Journalbewegungen und steuerliche Belegsumme sind unterschiedliche Grundlagen. Ein Betraggleichstand kann ohne ausgewiesene Steuerkonten und Steuerkennzeichen nicht bestätigt werden. Diese Ansicht erzeugt keine steuerliche Freigabe.</p>
        {taxError&&<div role="alert" className="bh-note">{taxError}</div>}
        {taxData&&<div className="rlc-accounting-recon-kpis">
          <div className="bh-card"><div className="bh-note">USt aus Belegen (vorläufig)</div><strong>{euro(taxData.umsatzsteuer)} €</strong></div>
          <div className="bh-card"><div className="bh-note">Vorsteuer aus Belegen (vorläufig)</div><strong>{euro(taxData.vorsteuer)} €</strong></div>
          <div className="bh-card"><div className="bh-note">Vorläufige Zahllast</div><strong>{euro(taxData.zahllast)} €</strong></div>
          <div className="bh-card"><div className="bh-note">0%-Steuerfälle zur Prüfung</div><strong>{Number(taxData.taxReviewCount||0)}</strong></div>
        </div>}
        <div className="bh-note">Journal: {data.items?.length||0} Buchungszeilen · Soll {euro(totals.soll)} € · Haben {euro(totals.haben)} €. Es fehlt eine verifizierte Steuerkonto-/Steuerschlüssel-Zuordnung für einen automatischen Saldenabgleich.</div>
      </section>
      {error && <div className="bh-note" role="alert">{error}</div>}

      <section className="bh-card">
        <strong>Journal-Plausibilitätskontrolle · {journalChecks.length} Auffälligkeiten</strong>
        <p className="bh-note">Prüft fehlende/identische Konten, ungültige Beträge und Datumswerte. Keine automatische Korrektur oder Steuerfreigabe.</p>
        {journalChecks.length>0&&<div style={{overflowX:"auto",maxHeight:270,overflowY:"auto"}}><table className="bh-table"><thead><tr><th>Datum</th><th>Konto</th><th>Beleg-ID</th><th>Prüfhinweis</th></tr></thead><tbody>{journalChecks.slice(0,200).map((x,i)=><tr key={x.id+"-"+i}><td>{dateDe(x.date)}</td><td>{x.account||"—"}</td><td>{x.id}</td><td>{x.problem}</td></tr>)}</tbody></table></div>}
        {journalChecks.length>200&&<p className="bh-note">Weitere {journalChecks.length-200} Hinweise nicht angezeigt.</p>}
      </section>
      <section className="bh-card">
        <strong>Kontenprüfung · tatsächlich verwendete Konten ({accountInventory.length})</strong>
        <p className="bh-note">Keine automatische Zuordnung von SKR03/SKR04 oder Steuerkennzeichen: ohne verbindlichen Kontenrahmen und Buchungsschlüssel wäre ein USt-Abgleich unzuverlässig. Beträge enthalten Buchungs- und Gegenkontoseiten und sind keine Steuersalden.</p>
        <div className="bh-actions"><button type="button" className="bh-btn ghost" disabled={!accountInventory.length} onClick={downloadAccountTemplate}>Konten-Zuordnungsvorlage CSV</button>
          <label>Kontenrahmen <select value={chart} onChange={e=>setChart(e.target.value)}><option value="SKR03">SKR03</option><option value="SKR04">SKR04</option><option value="CUSTOM">Individuell</option></select></label>
        </div>
        {mappingError&&<p role="alert" className="bh-note">{mappingError}</p>}
        <p className="bh-note">Manuelle Einordnung mit Audit-Log; Steuerkennzeichen bleiben bis zur Fachprüfung offen. Bereits klassifiziert: {accountInventory.filter(([account])=>mappings.some((x:any)=>x.account===account)).length} von {accountInventory.length} Konten.</p>
        <div style={{overflowX:"auto",maxHeight:320,overflowY:"auto"}}><table className="bh-table"><thead><tr><th>Konto</th><th>Vorkommen</th><th>Verwendung</th><th>Steuerkennzeichen</th></tr></thead><tbody>
        {accountInventory.map(([account,v])=><tr key={account}><td>{account}</td><td>{v.count}</td><td>{[...v.refs].join(", ")}</td><td>{mappings.find((x:any)=>x.account===account)?.category||"Offen"} <select aria-label={"Kontoart "+account} value={categories[account]||""} onChange={e=>setCategories(v=>({...v,[account]:e.target.value}))}><option value="">Kontoart wählen</option>{["REVENUE","EXPENSE","INPUT_TAX","OUTPUT_TAX","OTHER","BANK","RECEIVABLE","PAYABLE"].map(c=><option key={c} value={c}>{c}</option>)}</select><button type="button" className="bh-btn ghost" disabled={Boolean(mappingBusy)||!categories[account]} onClick={()=>void saveMapping(account)}>Speichern</button> <button type="button" className="bh-btn ghost" onClick={()=>void showMappingHistory(account)}>Historie</button></td></tr>)}
        {!accountInventory.length&&<tr><td colSpan={4}>Keine Konten ermittelt.</td></tr>}
        </tbody></table></div>
      </section>
      {mappingHistory&&<section className="bh-card"><strong>Änderungshistorie Konto {mappingHistory.account}</strong><button type="button" className="bh-btn ghost" onClick={()=>setMappingHistory(null)}>Schließen</button><table className="bh-table"><thead><tr><th>Zeit</th><th>Benutzer</th><th>Änderung</th></tr></thead><tbody>{mappingHistory.items.map((h:any)=><tr key={h.id}><td>{dateDe(h.createdAt)}</td><td>{h.userId||"—"}</td><td>{h.meta?.after?.chart||"—"} · {h.meta?.after?.category||"—"}</td></tr>)}{!mappingHistory.items.length&&<tr><td colSpan={3}>Keine Änderungen.</td></tr>}</tbody></table></section>}
      <table className="bh-table">
        <thead>
          <tr>
            <th>Datum</th>
            <th>Konto</th>
            <th>Gegenkonto</th>
            <th>Text</th>
            <th>Betrag</th>
            <th>S/H</th>
          </tr>
        </thead>

        <tbody>
          {filteredItems.map((row:any) => (
            <tr key={row.id}>
              <td>{dateDe(row.date)}</td>
              <td>{row.account}</td>
              <td>{row.contraAccount}</td>
              <td>{row.text || "—"}</td>
              <td>{euro(Math.abs(Number(row.amount)))} €</td>
              <td>{Number(row.amount) < 0 ? "S" : "H"}</td>
            </tr>
          ))}

          {!filteredItems.length && (
            <tr>
              <td colSpan={6}>Keine Journalbuchungen vorhanden.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
