import React, { useEffect, useRef, useState } from "react";
import { accountingApi, dateDe, euro, getAccountingProject } from "./accountingApi";
import "./styles.css";
import { initDocument, getUploadUrl, putToStorage, completeUpload, detectKind } from "../../api/files";

const iso = (value: any) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

const empty = () => ({
  documentType: "EINGANGSRECHNUNG",
  number: "", supplier: "", date: new Date().toISOString().slice(0, 10), dueDate: "",
  serviceDate: "", serviceDescription: "", buyerReference: "-",
  supplierStreet: "", supplierPostalCode: "", supplierCity: "", supplierCountry: "DE",
  supplierEmail: "", supplierVatId: "", supplierTaxNumber: "", supplierIban: "", supplierBic: "", supplierPhone: "",
  costCenter: "", netAmount: 0, taxRate: 19, note: "",
  deliveryNoteKey: "", deliveryNoteFilename: "", deliveryNoteNumber: ""
});

const billLocked = (row: any) => ["booked", "cancelled", "corrected"].includes(String(row?.status || "captured").toLowerCase());

export default function Eingangsrechnungen() {
  const [rows, setRows] = useState<any[]>([]);
  const [deliveryNotes, setDeliveryNotes] = useState<any[]>([]);
  const [edit, setEdit] = useState<any>(null);
  const [form, setForm] = useState<any>(empty());
  const [error, setError] = useState("");
  const queryApplied = useRef(false);
  const [busy,setBusy]=useState(false),busyRef=useRef(false);
  const runAction=async(action:()=>Promise<any>)=>{
    if(busyRef.current)return;busyRef.current=true;setBusy(true);setError("");
    try{await action();}catch(e:any){setError(e.message||"Vorgang fehlgeschlagen.");}finally{busyRef.current=false;setBusy(false);}
  };

  const load = async () => {
    try {
      setError("");
      const projectId = getAccountingProject();
      const [bills, notes] = await Promise.all([
        accountingApi("/api/accounting/vendor-bills"),
        accountingApi(`/api/accounting/delivery-review?projectId=${encodeURIComponent(projectId)}`)
      ]);
      setRows(bills.items || []);
      setDeliveryNotes(notes.items || []);
    } catch (e: any) { setError(e?.message || "Daten konnten nicht geladen werden."); }
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    const key = new URLSearchParams(window.location.search).get("deliveryNoteKey");
    if (!key || queryApplied.current) return;
    const note = deliveryNotes.find((item) => item.key === key);
    if (!note) return;
    queryApplied.current = true;
    setEdit(null);
    setForm({
      ...empty(),
      supplier: note.supplier || "",
      date: String(note.date || "").slice(0, 10) || new Date().toISOString().slice(0, 10),
      costCenter: note.costCenter || "",
      note: `Lieferschein ${note.number || note.reportId || ""}${note.material ? ` · ${note.material}` : ""}`,
      deliveryNoteKey: note.key, deliveryNoteFilename: note.filename || "",
      deliveryNoteNumber: note.number || note.reportId || ""
    });
  }, [deliveryNotes]);

  const selectDeliveryNote = (key: string) => {
    const note = deliveryNotes.find((item) => item.key === key);
    if (!note) {
      setForm({ ...form, deliveryNoteKey: "", deliveryNoteFilename: "", deliveryNoteNumber: "" });
      return;
    }
    setForm({
      ...form,
      supplier: note.supplier || form.supplier,
      date: String(note.date || "").slice(0, 10) || form.date,
      costCenter: note.costCenter || form.costCenter,
      note: form.note || `Lieferschein ${note.number || note.reportId || ""}${note.material ? ` · ${note.material}` : ""}`,
      deliveryNoteKey: note.key, deliveryNoteFilename: note.filename || "",
      deliveryNoteNumber: note.number || note.reportId || ""
    });
  };

  const save = async () => {
    try {
      if (edit && billLocked(edit)) throw new Error("Gebuchte Eingangsrechnungen dürfen nicht geändert werden.");
      const net = Number(form.netAmount || 0);
      const tax = net * Number(form.taxRate || 0) / 100;
      const body = { ...form, ...(edit?{editRevision:Number(edit.data?.editRevision||0)}:{}), netAmount: net, taxAmount: tax, grossAmount: net + tax };
      await accountingApi(edit?.id ? `/api/accounting/vendor-bills/${edit.id}` : "/api/accounting/vendor-bills", {
        method: edit?.id ? "PATCH" : "POST", body: JSON.stringify(body)
      });
      queryApplied.current = true;
      window.history.replaceState({}, "", "/buchhaltung/eingang");
      setEdit(null); setForm(empty()); await load();
    } catch (e: any) { setError(e?.message || "Speichern fehlgeschlagen."); }
  };

  const editRow = (row: any) => {
    if (billLocked(row)) { setError("Gebuchte Eingangsrechnungen sind unveränderbar. Verwenden Sie eine Korrektur/Stornierung."); return; }
    const meta = row.data || {};
    const rate = Number(row.netAmount) > 0 ? Number(row.taxAmount) / Number(row.netAmount) * 100 : 19;
    setEdit(row);
    setForm({
      number: row.number || "", supplier: row.supplier?.name || "", date: iso(row.date),
      documentType: meta.documentType || "EINGANGSRECHNUNG",
      dueDate: meta.dueDate ? iso(meta.dueDate) : "", serviceDate: meta.serviceDate ? iso(meta.serviceDate) : "",
      serviceDescription: meta.serviceDescription || "", buyerReference: meta.buyerReference || "-",
      supplierStreet: meta.supplierStreet || "", supplierPostalCode: meta.supplierPostalCode || "", supplierCity: meta.supplierCity || "", supplierCountry: meta.supplierCountry || "DE",
      supplierEmail: meta.supplierEmail || "", supplierVatId: meta.supplierVatId || "", supplierTaxNumber: meta.supplierTaxNumber || "",
      supplierIban: meta.supplierIban || "", supplierBic: meta.supplierBic || "", supplierPhone: meta.supplierPhone || "",
      costCenter: meta.costCenter || "",
      netAmount: Number(row.netAmount || 0), taxRate: Math.round(rate * 100) / 100,
      note: meta.note || "", deliveryNoteKey: meta.deliveryNoteKey || "",
      deliveryNoteFilename: meta.deliveryNoteFilename || "", deliveryNoteNumber: meta.deliveryNoteNumber || ""
    });
  };

  const pay = async (row: any) => {
    if (String(row?.status || "").toLowerCase() !== "booked") { setError("Eingangsrechnung muss vor Zahlung gebucht werden."); return; }
    if (Number(row.openAmount || 0) <= 0) return;
    await accountingApi("/api/accounting/payments", {
      method: "POST",
      body: JSON.stringify({
        date: new Date().toISOString().slice(0, 10), party: row.supplier?.name || "",
        amount: row.openAmount, method: "Überweisung", purpose: `Eingangsrechnung ${row.number}`,
        direction: "OUT", refType: "VENDOR_BILL", refId: row.id
      })
    });
    await load();
  };

  const issueSelfBilling = async (row: any) => {
    try {
      setError("");
      if (!window.confirm(`Gutschrift ${row.number} gemäß § 14 UStG jetzt verbindlich ausstellen?`)) return;
      const result = await accountingApi(`/api/accounting/vendor-bills/${row.id}/issue-self-billing`, { method: "POST", body: "{}" });
      if (!result?.kositValid) throw new Error("KoSIT-Validierung wurde nicht bestätigt.");
      await load();
    } catch (e: any) { setError(e?.message || "Gutschrift konnte nicht ausgestellt werden."); }
  };

  const book = async (row: any) => {
    try {
      setError("");
      if (!row.pdfDocId) { setError("Vor dem Buchen muss der Originalbeleg hochgeladen und im DMS verknüpft werden."); return; }
      if (!window.confirm(`Eingangsrechnung ${row.number} jetzt verbindlich buchen? Danach ist sie gegen Änderungen und Löschung gesperrt.`)) return;
      await accountingApi(`/api/accounting/vendor-bills/${row.id}/book`, { method: "POST", body: "{}" });
      await load();
    } catch (e: any) { setError(e?.message || "Eingangsrechnung konnte nicht gebucht werden."); }
  };

  const uploadBeleg = async (row: any) => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "application/pdf,image/png,image/jpeg,image/webp";
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return;
      try {
        const resolved = await accountingApi(`/api/accounting/dms/resolve?sourceType=VENDOR_BILL&sourceId=${encodeURIComponent(row.id)}`);
        const projectId = String(resolved?.projectId || "").trim();
        if (!projectId) throw new Error("DMS-Projekt konnte nicht ermittelt werden.");
        const created = await initDocument(projectId, detectKind(file), file.name);
        const documentId = String(created?.documentId || "").trim();
        if (!documentId) throw new Error("Dokument-ID fehlt.");
        const upload = await getUploadUrl(documentId, file.name, file.type || "application/octet-stream");
        await putToStorage(upload.uploadUrl, file, file.type || "application/octet-stream");
        await completeUpload({ documentId, key: upload.key, version: upload.version, contentType: upload.contentType || file.type || "application/octet-stream", size: file.size });
        await accountingApi("/api/accounting/dms/link", { method: "PATCH", body: JSON.stringify({ sourceType: "VENDOR_BILL", sourceId: row.id, documentId }) });
        await load();
      } catch (e: any) { setError(e?.message || "Beleg konnte nicht hochgeladen werden."); }
    };
    input.click();
  };

  const remove = async (id: string) => {
    const row = rows.find((item) => item.id === id);
    if (billLocked(row)) { setError("Gebuchte Eingangsrechnungen dürfen nicht gelöscht werden."); return; }
    if (!window.confirm("Nicht gebuchten Eingangsrechnungs-Entwurf wirklich löschen?")) return;
    await accountingApi(`/api/accounting/vendor-bills/${id}`, { method: "DELETE" });
    await load();
  };

  return (
    <fieldset disabled={busy} className="bh-page" style={{border:0,padding:0,minWidth:0}}>
      <div className="bh-header-row">
        <div><h2>Eingangsrechnungen</h2><div className="bh-note">Projekt: {getAccountingProject()}</div></div>
        <button className="bh-btn ghost" onClick={() => void runAction(()=>load())}>Aktualisieren</button>
      </div>

      <div className="bh-note" style={{ marginBottom: 14 }}>
        Lieferschein wählen, echten Rechnungsbetrag erfassen, Originalbeleg hochladen und anschließend verbindlich buchen. Gebuchte Belege bleiben unveränderbar erhalten.
      </div>

      <div className="bh-filters">
        <div><label>Dokumentart</label><select value={form.documentType} onChange={e => setForm({ ...form, documentType: e.target.value })}><option value="EINGANGSRECHNUNG">Eingangsrechnung</option><option value="GUTSCHRIFT_14">Gutschrift § 14 UStG (Self-billing)</option></select></div>
        <div><label>{form.documentType === "GUTSCHRIFT_14" ? "Gutschriftnummer" : "Belegnummer"}</label><input value={form.number} onChange={e => setForm({ ...form, number: e.target.value })} /></div>
        <div><label>Lieferschein zuordnen</label><select value={form.deliveryNoteKey} onChange={e => selectDeliveryNote(e.target.value)}>
          <option value="">Ohne Lieferschein</option>
          {deliveryNotes.map(note => <option key={note.key} value={note.key}>
            {(note.number || `LS-${note.reportId || ""}`)} · {note.supplier || "Lieferant unbekannt"} · {dateDe(note.date)}
          </option>)}
        </select></div>
        <div><label>Lieferant</label><input value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} /></div>
        <div><label>Datum</label><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
        <div><label>Fällig</label><input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} /></div>
        <div><label>Kostenstelle</label><input value={form.costCenter} onChange={e => setForm({ ...form, costCenter: e.target.value })} /></div>
        <div><label>Netto</label><input type="number" step="0.01" value={form.netAmount} onChange={e => setForm({ ...form, netAmount: Number(e.target.value) })} /></div>
        <div><label>MwSt. %</label><input type="number" step="0.01" value={form.taxRate} onChange={e => setForm({ ...form, taxRate: Number(e.target.value) })} /></div>
        {form.documentType === "GUTSCHRIFT_14" ? <>
          <div><label>Leistungsdatum</label><input type="date" value={form.serviceDate} onChange={e => setForm({ ...form, serviceDate: e.target.value })} /></div>
          <div><label>Leistungsbeschreibung</label><input value={form.serviceDescription} onChange={e => setForm({ ...form, serviceDescription: e.target.value })} /></div>
          <div><label>BuyerReference</label><input value={form.buyerReference} onChange={e => setForm({ ...form, buyerReference: e.target.value })} /></div>
          <div><label>Lieferant Straße</label><input value={form.supplierStreet} onChange={e => setForm({ ...form, supplierStreet: e.target.value })} /></div>
          <div><label>Lieferant PLZ</label><input value={form.supplierPostalCode} onChange={e => setForm({ ...form, supplierPostalCode: e.target.value })} /></div>
          <div><label>Lieferant Ort</label><input value={form.supplierCity} onChange={e => setForm({ ...form, supplierCity: e.target.value })} /></div>
          <div><label>Lieferant Land</label><input value={form.supplierCountry} onChange={e => setForm({ ...form, supplierCountry: e.target.value })} /></div>
          <div><label>Lieferant E-Mail</label><input type="email" value={form.supplierEmail} onChange={e => setForm({ ...form, supplierEmail: e.target.value })} /></div>
          <div><label>Lieferant USt-IdNr.</label><input value={form.supplierVatId} onChange={e => setForm({ ...form, supplierVatId: e.target.value })} /></div>
          <div><label>Lieferant Steuernummer</label><input value={form.supplierTaxNumber} onChange={e => setForm({ ...form, supplierTaxNumber: e.target.value })} /></div>
          <div><label>Lieferant IBAN</label><input value={form.supplierIban} onChange={e => setForm({ ...form, supplierIban: e.target.value })} /></div>
          <div><label>Lieferant BIC</label><input value={form.supplierBic} onChange={e => setForm({ ...form, supplierBic: e.target.value })} /></div>
          <div><label>Lieferant Telefon</label><input value={form.supplierPhone} onChange={e => setForm({ ...form, supplierPhone: e.target.value })} /></div>
        </> : null}
        <div><label>Notiz</label><input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} /></div>
        <div style={{ alignSelf: "end" }}>
          <button className="bh-btn" onClick={() => void runAction(()=>save())}>{edit ? "Änderungen speichern" : "+ Eingangsrechnung speichern"}</button>
          {edit ? <button className="bh-btn ghost" style={{ marginLeft: 6 }} onClick={() => { setEdit(null); setForm(empty()); }}>Abbrechen</button> : null}
        </div>
      </div>

      {error ? <div className="bh-note">{error}</div> : null}

      <table className="bh-table">
        <thead><tr><th>Beleg</th><th>Status</th><th>Datum</th><th>Lieferant</th><th>Lieferschein</th><th>Kostenstelle</th><th>Brutto</th><th>Bezahlt</th><th>Offen</th><th>Aktionen</th></tr></thead>
        <tbody>
          {rows.map(row => {
            const meta = row.data || {};
            return <tr key={row.id}>
              <td><b>{meta.documentType === "GUTSCHRIFT_14" ? "Gutschrift" : "ER"}</b> · {row.number}</td><td><b>{String(row.status || "captured").toUpperCase()}</b></td><td>{dateDe(row.date)}</td><td>{row.supplier?.name || "—"}</td>
              <td>{meta.deliveryNoteNumber || "—"}</td><td>{meta.costCenter || "—"}</td>
              <td>{euro(row.grossAmount)} €</td><td>{euro(row.paidAmount)} €</td><td>{euro(row.openAmount)} €</td>
              <td><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {!billLocked(row) ? <button className="bh-btn ghost" onClick={() => editRow(row)}>Bearbeiten</button> : null}
                {!billLocked(row) && meta.documentType === "GUTSCHRIFT_14" ? <button className="bh-btn" onClick={() => void runAction(()=>issueSelfBilling(row))}>Gutschrift ausstellen</button> : null}
                {!billLocked(row) && meta.documentType !== "GUTSCHRIFT_14" ? <button className="bh-btn" onClick={() => void runAction(()=>book(row))} disabled={!row.pdfDocId}>Buchen</button> : null}
                {String(row.status).toLowerCase() === "booked" && Number(row.openAmount) > 0 ? <button className="bh-btn" onClick={() => void runAction(()=>pay(row))}>Bezahlen</button> : null}
                {!billLocked(row) && meta.documentType !== "GUTSCHRIFT_14" ? <button className="bh-btn ghost" onClick={() => void runAction(()=>uploadBeleg(row))}>Beleg hochladen</button> : billLocked(row) ? <span className="bh-note">Originalbeleg gesperrt</span> : null}
                {!billLocked(row) ? <button className="bh-btn ghost" onClick={() => void runAction(()=>remove(row.id))}>Entwurf löschen</button> : null}
              </div></td>
            </tr>;
          })}
          {!rows.length ? <tr><td colSpan={10}>Keine Eingangsrechnungen vorhanden.</td></tr> : null}
        </tbody>
      </table>
    </fieldset>
  );
}
