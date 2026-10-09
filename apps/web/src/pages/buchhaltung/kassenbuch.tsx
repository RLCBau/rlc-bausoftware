
import React, { useEffect, useMemo, useRef, useState } from "react";
import { accountingApi, dateDe, euro } from "./accountingApi";
import "./styles.css";
import {Link} from "react-router-dom";

export default function Kassenbuch() {
  const requestId=useRef(crypto.randomUUID());
  const [busy,setBusy]=useState(false);
  const [history,setHistory]=useState<any>(null);
  const [centers,setCenters]=useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0,10),
    text: "",
    account: "1000",
    contraAccount: "1200",
    costCenter: "",
    amount: ""
  });

  const load = async () => {
    try {
      setError("");
      const [data,master]=await Promise.all([accountingApi("/api/accounting/ledger"),accountingApi("/api/cost-centers")]);
      setCenters(master.items||[]);
      setRows(data.items || []);
    } catch (e:any) {
      setError(e?.message || "Fehler");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    setBusy(true);setError("");
    try{
      await accountingApi("/api/accounting/ledger",{method:"POST",body:JSON.stringify({...form,requestId:requestId.current})});
      requestId.current=crypto.randomUUID();
      setForm({date:new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Berlin",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()),text:"",account:"1000",contraAccount:"1200",costCenter:"",amount:""});
      await load();
    }catch(e:any){setError(e.message);}finally{setBusy(false);}
  };
  const reverse = async (row:any) => {
    const reason=window.prompt("Grund der Stornobuchung:");if(!reason?.trim())return;
    setBusy(true);setError("");
    try{await accountingApi(`/api/accounting/ledger/${row.id}/reverse`,{method:"POST",body:JSON.stringify({reason:reason.trim()})});await load();}
    catch(e:any){setError(e.message);}finally{setBusy(false);}
  };

  const showHistory=async(row:any)=>{
    setBusy(true);setError("");
    try{const data=await accountingApi("/api/accounting/ledger/"+row.id+"/history");setHistory({id:row.id,items:data.items});}
    catch(e:any){setError(e.message);}finally{setBusy(false);}
  };
  const saldo = useMemo(
    () => rows.reduce((s,r) => s + Number(r.amount || 0), 0),
    [rows]
  );

  let running = 0;

  return (
    <div className="bh-page">
      <div className="bh-header-row">
        <div>
          <h2>Kassenbuch / Journal</h2>
          <div className="bh-note">
            Saldo: <b>{euro(saldo)} €</b>
          </div>
        </div>

        <button className="bh-btn ghost" onClick={load}>Aktualisieren</button>
      </div>

      <Link className="bh-btn ghost" to="/buchhaltung/dauerbuchungen">Dauerbuchungen öffnen</Link>
      <fieldset disabled={busy} style={{border:0,padding:0}}><div className="bh-filters">
        <div>
          <label>Datum</label>
          <input type="date" value={form.date}
            onChange={e=>setForm({...form,date:e.target.value})}/>
        </div>

        <div>
          <label>Text</label>
          <input value={form.text}
            onChange={e=>setForm({...form,text:e.target.value})}/>
        </div>

        <div>
          <label>Konto</label>
          <input value={form.account}
            onChange={e=>setForm({...form,account:e.target.value})}/>
        </div>

        <div>
          <label>Gegenkonto</label>
          <input value={form.contraAccount}
            onChange={e=>setForm({...form,contraAccount:e.target.value})}/>
        </div>

        <div>
          <label>Betrag (+ Einnahme / - Ausgabe)</label>
          <input type="number" step="0.01" value={form.amount}
            onChange={e=>setForm({...form,amount:e.target.value})}/>
        </div>

        <div><label>Kostenstelle</label><select value={form.costCenter} onChange={e=>setForm({...form,costCenter:e.target.value})}><option value="">Ohne Zuordnung</option>{centers.map(c=><option key={c.id} value={c.code}>{c.code} · {c.description}</option>)}</select></div>
        <div style={{alignSelf:"end"}}>
          <button className="bh-btn" onClick={save}>
            + Buchung speichern
          </button>
        </div>
      </div>

      </fieldset>
      {error && <div className="bh-note">{error}</div>}

      <table className="bh-table">
        <thead>
          <tr>
            <th>Datum</th>
            <th>Text</th>
            <th>Konto</th>
            <th>Gegenkonto</th>
            <th>Kostenstelle</th>
            <th>Einnahme</th>
            <th>Ausgabe</th>
            <th>Saldo</th>
            <th></th>
          </tr>
        </thead>

        <tbody>
          {rows.map(row => {
            running += Number(row.amount || 0);

            return (
              <tr key={row.id}>
                <td>{dateDe(row.date)}</td>
                <td>{row.text || "—"}</td>
                <td>{row.account}</td>
                <td>{row.contraAccount}</td><td>{row.costCenter||"—"}</td>
                <td>
                  {Number(row.amount) > 0 ? `${euro(row.amount)} €` : "—"}
                </td>
                <td>
                  {Number(row.amount) < 0 ? `${euro(Math.abs(row.amount))} €` : "—"}
                </td>
                <td>{euro(running)} €</td>
                <td>
                  <button className="bh-btn ghost" disabled={busy} onClick={()=>void showHistory(row)}>Historie</button>
                  <button className="bh-btn"
                    disabled={busy || ["LEDGER_REVERSAL","PAYMENT","PAYMENT_REVERSAL"].includes(row.refType) || rows.some(r=>r.refType==="LEDGER_REVERSAL"&&r.refId===row.id)}
                    onClick={() => void reverse(row)}>
                    Stornieren
                  </button>
                </td>
              </tr>
            );
          })}

          {!rows.length && (
            <tr>
              <td colSpan={9}>Keine Buchungen vorhanden.</td>
            </tr>
          )}
        </tbody>
      </table>
      {history&&<section className="bh-card"><h3>Historie · {history.id}</h3>{history.items.map((h:any)=><div className="bh-note" key={h.id}>{dateDe(h.createdAt)} · {h.action} · {h.userId}{h.meta?.reason?" · "+h.meta.reason:""}</div>)}{!history.items.length&&<div className="bh-note">Für diese ältere Buchung ist kein Audit-Eintrag vorhanden.</div>}</section>}
    </div>
  );
}
