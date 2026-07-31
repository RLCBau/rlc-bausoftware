import React from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

/* ======================= Types ======================= */
type LVItem = {
  id: string;
  projectId?: string;
  posNr?: string;
  kurztext: string;
  einheit?: string;
  menge?: number | null;     // opzionale: se presente → Soll = menge * preis
  preis?: number | null;     // EP netto
  quelle?: string;           // p.es. "Fotoerkennung", "Widersprüche", "Import"
  createdAt: number;
};

type Abschlag = {
  id?: string;
  projectId: string;
  nr: number;
  datum: string;             // yyyy-mm-dd
  betrag: number;            // netto
};

type BuchhaltungSaveBody = {
  projectId: string;
  summeNetto: number;
  summeBrutto: number;
  quelle: string;
};

type ApiList<T> = { items: T[] };
type ApiLV = { projectId: string; items: LVItem[] };

const card: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 10, padding: 16, background: "#fff" };
const tbl:  React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const th:   React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid var(--line)", background: "#f7f7f7", textAlign: "left", whiteSpace: "nowrap" };
const td:   React.CSSProperties = { padding: "6px 10px", borderBottom: "1px solid #eee", verticalAlign: "top", fontSize: 13 };
const inp:  React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", fontSize: 14 };

const num = (v?: number | null, d = 2) =>
  v == null || !Number.isFinite(v) ? "" : (v as number).toLocaleString(undefined, { maximumFractionDigits: d });

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

/* ======================= Component ======================= */
export default function AbrechnungAuto() {
  const [projectId, setProjectId] = React.useState<string>(() => {
    const q = new URLSearchParams(window.location.search).get("projectId") || "";
    const s = sessionStorage.getItem("projectId") || "";
    return q || s || "";
  });

  const [lv, setLV] = React.useState<LVItem[]>([]);
  const [abschlaege, setAbschlaege] = React.useState<Abschlag[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [filterText, setFilterText] = React.useState("");
  const [mwst, setMwst] = React.useState(19);
  const [aufschlag, setAufschlag] = React.useState(0); // opzionale markup globale

  // persist Project-ID
  React.useEffect(() => {
    if (projectId) sessionStorage.setItem("projectId", projectId);
  }, [projectId]);

  /* ----------------------- Loaders ----------------------- */
  async function loadLV() {
    if (!projectId) return alert("Bitte Projekt-ID eingeben");
    const res = await api<ApiLV>(`/api/lv/by-project/${encodeURIComponent(projectId)}`);
    setLV((res.items || []).slice().sort(sortLV));
  }
  async function loadAbschlaege() {
    if (!projectId) return alert("Bitte Projekt-ID eingeben");
    const res = await api<ApiList<Abschlag>>(`/api/abrechnung/by-project/${encodeURIComponent(projectId)}`);
    const items = (res.items || []).slice().sort((a,b)=>a.nr-b.nr);
    setAbschlaege(items);
  }
  async function loadAll() {
    setLoading(true);
    try { await Promise.all([loadLV(), loadAbschlaege()]); } finally { setLoading(false); }
  }

  /* ----------------------- Helpers calcolo ----------------------- */
  function sortLV(a: LVItem, b: LVItem) {
    const pa = (a.posNr || "").padStart(10, "0");
    const pb = (b.posNr || "").padStart(10, "0");
    return pa.localeCompare(pb);
  }

  const lvFiltered = React.useMemo(() => {
    if (!filterText.trim()) return lv;
    const s = filterText.toLowerCase();
    return lv.filter(it =>
      (it.posNr || "").toLowerCase().includes(s) ||
      (it.kurztext || "").toLowerCase().includes(s) ||
      (it.quelle || "").toLowerCase().includes(s)
    );
  }, [lv, filterText]);

  // Σ LV (Soll)
  const sollNetto = React.useMemo(() => {
    // Se abbiamo menge e preis → menge * preis; altrimenti, se c'è solo preis → somma dei preis
    let sum = 0;
    for (const r of lv) {
      const preis = Number(r.preis ?? 0);
      const menge = r.menge != null ? Number(r.menge) : null;
      sum += (menge != null ? (menge * preis) : preis);
    }
    // markup opzionale
    return sum * (1 + (aufschlag || 0)/100);
  }, [lv, aufschlag]);

  // Σ Abschläge (Ist)
  const istNetto = React.useMemo(() => abschlaege.reduce((s, a) => s + (a.betrag || 0), 0), [abschlaege]);

  const diffNetto = istNetto - sollNetto;
  const mwstSoll = sollNetto * (mwst/100);
  const mwstIst  = istNetto  * (mwst/100);
  const sollBrutto = sollNetto + mwstSoll;
  const istBrutto  = istNetto  + mwstIst;

  const deckungsgrad = sollNetto > 0 ? Math.round((istNetto / sollNetto) * 100) : 0;

  /* ----------------------- Abschlag CRUD (semplice) ----------------------- */
  async function addAbschlag() {
    if (!projectId) return alert("Projekt-ID fehlt");
    const betragStr = prompt("Betrag (netto):");
    if (!betragStr) return;
    const betrag = Number(betragStr.replace(",", "."));
    if (!Number.isFinite(betrag) || betrag <= 0) return alert("Ungültiger Betrag.");

    const res = await api<{ ok: boolean; item: Abschlag }>(`/api/abrechnung/save`, {
      method: "POST",
      body: JSON.stringify({ projectId, betrag }),
    });
    setAbschlaege(prev => [...prev, res.item].sort((a,b)=>a.nr-b.nr));
  }

  async function delAbschlag(a: Abschlag) {
    if (!a.id) return;
    if (!confirm(`Abschlag Nr. ${a.nr} löschen?`)) return;
    await api(`/api/abrechnung/${a.id}`, { method: "DELETE" });
    setAbschlaege(prev => prev.filter(x => x.id !== a.id));
  }

  /* ----------------------- Export CSV ----------------------- */
  function exportCSV() {
    if (!lv.length && !abschlaege.length) return alert("Nichts zu exportieren.");
    const head = [
      "ProjektID","Typ","PosNr","Kurztext","Einheit","Menge","EP","Quelle","Datum/Erstellt","BetragNetto"
    ];
    const rows: (string | number)[][] = [];

    for (const r of lv) {
      rows.push([
        projectId,
        "LV",
        r.posNr || "",
        r.kurztext || "",
        r.einheit || "",
        r.menge ?? "",
        r.preis ?? "",
        r.quelle || "",
        new Date(r.createdAt).toLocaleDateString(),
        ""
      ]);
    }
    for (const a of abschlaege) {
      rows.push([
        projectId,
        "Abschlag",
        "",
        "",
        "",
        "",
        "",
        "",
        a.datum,
        a.betrag
      ]);
    }

    const csv = [head.join(";"), ...rows.map(r => r.map(v => String(v).replace(/;/g, ",")).join(";"))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Abrechnung_${projectId || "ohneProjekt"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /* ----------------------- Export PDF + Buchhaltung ----------------------- */
  async function exportPDF(andSendToBuchhaltung = true) {
    if (!projectId) return alert("Projekt-ID fehlt");
    if (!lv.length) return alert("Kein LV geladen.");

    const doc = new jsPDF({ orientation: "landscape", unit: "mm" });
    doc.setFontSize(16);
    doc.text(`Abrechnung – Projekt ${projectId}`, 14, 16);

    // KPI Box
    const startY = 22;
    doc.setFontSize(11);
    doc.text(`Soll (Netto): ${num(sollNetto)} €  |  Ist (Netto): ${num(istNetto)} €  |  Δ: ${num(diffNetto)} €  |  Deckungsgrad: ${deckungsgrad}%`, 14, startY);

    // LV Tabelle
    autoTable(doc, {
      startY: startY + 6,
      head: [["Pos","Kurztext","Einheit","Menge","EP (netto)","Σ Position (netto)","Quelle","Erstellt am"]],
      body: lv.map(l => {
        const preis = Number(l.preis || 0);
        const menge = l.menge != null ? Number(l.menge) : null;
        const sum = (menge != null ? menge * preis : preis) * (1 + (aufschlag || 0)/100);
        return [
          l.posNr || "—",
          l.kurztext || "",
          l.einheit || "—",
          menge != null ? num(menge, 3) : "—",
          num(preis),
          num(sum),
          l.quelle || "—",
          new Date(l.createdAt).toLocaleDateString(),
        ];
      }),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [20,20,20], textColor: 255 },
      columnStyles: { 5: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
      margin: { left: 14, right: 14 },
    });

    // Abschläge
    let y = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(12);
    doc.text("Abschlagsrechnungen", 14, y);
    autoTable(doc, {
      startY: y + 5,
      head: [["Nr","Datum","Netto (€)","Brutto (€)"]],
      body: abschlaege.map(a => [a.nr, a.datum, num(a.betrag), num(a.betrag * (1 + mwst/100))]),
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [230,230,230] },
      columnStyles: { 2: { halign: "right" }, 3: { halign: "right" } },
      margin: { left: 14, right: 14 },
    });

    // Totali
    y = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(12);
    doc.text(`MwSt: ${mwst}%   ·   Aufschlag: ${aufschlag}%`, 14, y);
    y += 6;
    doc.text(`Soll Netto: ${num(sollNetto)} € | Soll Brutto: ${num(sollBrutto)} €`, 14, y);
    y += 6;
    doc.text(`Ist Netto (Abschläge): ${num(istNetto)} € | Ist Brutto: ${num(istBrutto)} €`, 14, y);
    y += 6;
    doc.text(`Differenz Netto (Ist − Soll): ${num(diffNetto)} €`, 14, y);

    doc.save(`Abrechnung_${projectId}.pdf`);

    if (andSendToBuchhaltung) {
      // invio sintetico a Buchhaltung (Ist aggregato)
      const body: BuchhaltungSaveBody = {
        projectId,
        summeNetto: istNetto,
        summeBrutto: istBrutto,
        quelle: "Abrechnung (Ist/Aggregat)",
      };
      try {
        await api(`/api/buchhaltung/save`, { method: "POST", body: JSON.stringify(body) });
        alert("PDF exportiert und in Buchhaltung gespeichert ✅");
      } catch (e: any) {
        alert("PDF ok, aber Buchhaltung-Transfer fehlgeschlagen: " + (e?.message || e));
      }
    }
  }

  /* ----------------------- Render ----------------------- */
  return (
    <div style={{ display: "grid", gap: 16, padding: 16 }}>
      <h1>Abrechnung – Automatik & Soll-Ist-Vergleich</h1>

      {/* Top Bar */}
      <div style={card}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto auto", gap: 12, alignItems: "center" }}>
          <input
            placeholder="Projekt-ID"
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
            style={{ ...inp }}
          />
          <button className="btn" onClick={loadLV} disabled={!projectId || loading}>LV laden</button>
          <button className="btn" onClick={loadAbschlaege} disabled={!projectId || loading}>Abschläge laden</button>
          <button className="btn" onClick={loadAll} disabled={!projectId || loading}>Alles laden</button>
          <button className="btn" onClick={addAbschlag} disabled={!projectId}>+ Abschlag</button>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"repeat(6, 1fr)", gap:12, marginTop:12 }}>
          <Kpi title="LV-Positionen">{lv.length}</Kpi>
          <Kpi title="Abschläge">{abschlaege.length}</Kpi>
          <Kpi title="Soll Netto (€)"><b>{num(sollNetto)}</b></Kpi>
          <Kpi title="Ist Netto (€)"><b>{num(istNetto)}</b></Kpi>
          <Kpi title="Δ Netto (Ist−Soll)"><span style={{ color: diffNetto>=0?"#065f46":"#991b1b" }}>{num(diffNetto)}</span></Kpi>
          <Kpi title="Deckungsgrad">{deckungsgrad}%</Kpi>
        </div>

        <div style={{ display:"flex", gap:12, alignItems:"center", marginTop:12, flexWrap:"wrap" }}>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <span style={{ fontSize:13, color:"var(--muted)" }}>MwSt</span>
            <input type="number" value={mwst} onChange={e=>setMwst(Number(e.target.value))} style={{ ...inp, width:90 }} />%
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <span style={{ fontSize:13, color:"var(--muted)" }}>Aufschlag</span>
            <input type="number" value={aufschlag} onChange={e=>setAufschlag(Number(e.target.value))} style={{ ...inp, width:90 }} />%
          </div>
          <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
            <input placeholder="Filter (Pos/Kurztext/Quelle)" value={filterText} onChange={e=>setFilterText(e.target.value)} style={{ ...inp, minWidth:240 }} />
            <button className="btn" onClick={() => exportPDF(true)} disabled={!lv.length}>PDF & → Buchhaltung</button>
            <button className="btn" onClick={exportCSV} disabled={!lv.length && !abschlaege.length}>CSV Export</button>
          </div>
        </div>
      </div>

      {/* Tabelle LV */}
      {!!lvFiltered.length && (
        <div style={card}>
          <h3 style={{ marginTop:0 }}>LV-Positionen (gefiltert: {lvFiltered.length}/{lv.length})</h3>
          <table style={tbl}>
            <thead>
              <tr>
                <th style={th}>Pos</th>
                <th style={th}>Kurztext</th>
                <th style={th}>Einheit</th>
                <th style={th}>Menge</th>
                <th style={th}>EP (netto)</th>
                <th style={th}>Σ Position (netto)</th>
                <th style={th}>Quelle</th>
                <th style={th}>Erstellt am</th>
              </tr>
            </thead>
            <tbody>
              {lvFiltered.map((l) => {
                const preis = Number(l.preis || 0);
                const menge = l.menge != null ? Number(l.menge) : null;
                const sum = (menge != null ? menge * preis : preis) * (1 + (aufschlag || 0)/100);
                return (
                  <tr key={l.id}>
                    <td style={td}>{l.posNr || "—"}</td>
                    <td style={td}>{l.kurztext}</td>
                    <td style={td}>{l.einheit || "—"}</td>
                    <td style={{ ...td, textAlign:"right" }}>{menge != null ? num(menge, 3) : "—"}</td>
                    <td style={{ ...td, textAlign:"right" }}>{num(preis)}</td>
                    <td style={{ ...td, textAlign:"right" }}>{num(sum)}</td>
                    <td style={td}>{l.quelle || "—"}</td>
                    <td style={td}>{new Date(l.createdAt).toLocaleDateString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Tabelle Abschläge + Ist-Summe */}
      {!!abschlaege.length && (
        <div style={card}>
          <h3 style={{ marginTop:0 }}>Abschlagsrechnungen</h3>
          <table style={tbl}>
            <thead>
              <tr>
                <th style={th}>Nr</th>
                <th style={th}>Datum</th>
                <th style={{ ...th, textAlign:"right" }}>Netto (€)</th>
                <th style={{ ...th, textAlign:"right" }}>Brutto (€)</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {abschlaege.map(a => (
                <tr key={a.id || `a-${a.nr}-${a.datum}`}>
                  <td style={td}>{a.nr}</td>
                  <td style={td}>{a.datum}</td>
                  <td style={{ ...td, textAlign:"right" }}>{num(a.betrag)}</td>
                  <td style={{ ...td, textAlign:"right" }}>{num(a.betrag * (1 + mwst/100))}</td>
                  <td style={td}><button className="btn" onClick={()=>delAbschlag(a)}>🗑️</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop:8, fontWeight:600 }}>
            Ist Netto: {num(istNetto)} € · Ist Brutto: {num(istBrutto)} €
          </div>
        </div>
      )}

      {/* Box Vergleich Soll-Ist */}
      <div style={card}>
        <h3 style={{ marginTop: 0 }}>Vergleich – Soll vs. Ist</h3>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:12 }}>
          <Box label="Soll Netto" value={`${num(sollNetto)} €`} />
          <Box label="Ist Netto"  value={`${num(istNetto)} €`} />
          <Box label="Differenz Netto (Ist−Soll)" value={`${num(diffNetto)} €`} color={diffNetto>=0?"#065f46":"#991b1b"} />
          <Box label="Deckungsgrad" value={`${deckungsgrad}%`} />
        </div>
      </div>
    </div>
  );
}

/* ======================= Small UI ======================= */
function Kpi({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border:"1px dashed var(--line)", borderRadius:10, padding:"10px 12px", background:"#fafafa" }}>
      <div style={{ fontSize:12, color:"var(--muted)" }}>{title}</div>
      <div style={{ fontSize:16, fontWeight:700 }}>{children}</div>
    </div>
  );
}
function Box({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ border:"1px solid #e5e7eb", borderRadius:10, padding:12 }}>
      <div style={{ fontSize:12, color:"var(--muted)" }}>{label}</div>
      <div style={{ fontSize:18, fontWeight:800, color: color || "inherit" }}>{value}</div>
    </div>
  );
}
