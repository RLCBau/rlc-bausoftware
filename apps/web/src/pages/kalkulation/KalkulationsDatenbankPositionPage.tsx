import { rlcClass } from "../../ui/rlcRuntimeStyle";
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { KalkulationsDatenbank } from "./kalkulationsDatenbank";

const RECIPE_CONTEXT_KEY = "rlc_recipes_new_position_context_v1";

function n(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const raw = String(v).trim();
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const x = Number(normalized);
  return Number.isFinite(x) ? x : 0;
}

function money(v: unknown): string {
  return `${n(v).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

export default function KalkulationsDatenbankPositionPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [entry, setEntry] = useState<any>(() => id ? KalkulationsDatenbank.get(id) || null : null);

  useEffect(() => {
    if (id) setEntry(KalkulationsDatenbank.get(id) || null);
  }, [id]);

  const ep = useMemo(() => n(entry?.kosten?.epNetto), [entry]);

  function update(patch: any) {
    if (!entry) return;
    const next = { ...entry, ...patch, updatedAt: new Date().toISOString() };
    const saved = KalkulationsDatenbank.upsert(next);
    setEntry(saved);
  }

  function updateParameter(patch: any) {
    update({ parameter: { ...(entry?.parameter || {}), ...patch } });
  }

  function updateEp(value: unknown) {
    const nextEp = n(value);
    update({
      menge: 1,
      kosten: {
        ...(entry?.kosten || {}),
        epNetto: nextEp,
        gpNetto: nextEp,
      },
    });
  }

  function openUrkalkulation() {
    if (!entry) return;
    sessionStorage.setItem(RECIPE_CONTEXT_KEY, JSON.stringify({
      source: "datenbank",
      returnTo: `/kalkulation/datenbank/position/${entry.id}`,
      ts: new Date().toISOString(),
      initialDraft: {
        id: "",
        posNr: "",
        kurztext: String(entry.kurztext || ""),
        langtext: String(entry.langtext || ""),
        einheit: String(entry.einheit || "m"),
        menge: 1,
      },
    }));
    navigate("/kalkulation/rezepte");
  }

  if (!entry) {
    return <div className={rlcClass(null, page)}>
      <button className={rlcClass(null, btnSecondary)} onClick={() => navigate("/kalkulation/datenbank")}>← Zurück zur Datenbank</button>
      <section className={rlcClass(null, card)}><h1 className={rlcClass(null, title)}>Eintrag nicht gefunden</h1></section>
    </div>;
  }

  return <div className={rlcClass(null, page)}>
    <div className={rlcClass(null, topBar)}>
      <button className={rlcClass(null, btnSecondary)} onClick={() => navigate("/kalkulation/datenbank")}>← Zurück zur Datenbank</button>
      <div className={rlcClass(null, topActions)}>
        <button className={rlcClass(null, btnSecondary)} onClick={openUrkalkulation}>Urkalkulation öffnen</button>
        <button className={rlcClass(null, btnPrimary)} onClick={() => { const saved = KalkulationsDatenbank.upsert({ ...entry, menge: 1, kosten: { ...(entry.kosten || {}), gpNetto: ep } }); setEntry(saved); }}>Speichern</button>
      </div>
    </div>

    <section className={rlcClass("rlc-page-hero", hero)}>
      <div>
        <div className={rlcClass(null, eyebrow)}>Preis- / Leistungsbibliothek</div>
        <h1 className={rlcClass(null, title)}>Datenbankeintrag bearbeiten</h1>
        <p className={rlcClass(null, subtitle)}>{entry.kurztext || "Ohne Kurztext"}</p>
      </div>
      <div className={rlcClass(null, priceBox)}>
        <span>Basis 1 {entry.einheit || "ME"}</span>
        <strong>{money(ep)}</strong>
      </div>
    </section>

    <section className={rlcClass(null, grid)}>
      <div className={rlcClass(null, card)}>
        <h2 className={rlcClass(null, sectionTitle)}>Leistungsdaten</h2>
        <div className={rlcClass(null, formGrid)}>
          <Field label="Einheit"><input className={rlcClass(null, input)} value={entry.einheit || ""} onChange={(e) => update({ einheit: e.target.value, menge: 1 })} /></Field>
          <Field label="EP netto / 1 ME"><input className={rlcClass(null, input)} inputMode="decimal" value={ep || ""} onChange={(e) => updateEp(e.target.value)} /></Field>
          <Field label="Quelle"><input className={rlcClass(null, input)} value={entry.quelle || ""} onChange={(e) => update({ quelle: e.target.value })} /></Field>
          <Field label="Herkunft"><input className={rlcClass(null, input)} value={entry.projektCode || ""} onChange={(e) => update({ projektCode: e.target.value })} /></Field>
        </div>
        <Field label="Kurztext"><input className={rlcClass(null, input)} value={entry.kurztext || ""} onChange={(e) => update({ kurztext: e.target.value })} /></Field>
        <Field label="Langtext"><textarea className={rlcClass(null, { ...input, minHeight: 105 })} value={entry.langtext || ""} onChange={(e) => update({ langtext: e.target.value })} /></Field>
      </div>

      <div className={rlcClass(null, card)}>
        <h2 className={rlcClass(null, sectionTitle)}>Technische Einordnung</h2>
        <div className={rlcClass(null, formGrid)}>
          <Field label="Gewerk"><input className={rlcClass(null, input)} value={entry.parameter?.gewerk || ""} onChange={(e) => updateParameter({ gewerk: e.target.value })} /></Field>
          <Field label="Leistungsart"><input className={rlcClass(null, input)} value={entry.parameter?.leistungsart || ""} onChange={(e) => updateParameter({ leistungsart: e.target.value })} /></Field>
          <Field label="Bauverfahren"><input className={rlcClass(null, input)} value={entry.parameter?.bauverfahren || ""} onChange={(e) => updateParameter({ bauverfahren: e.target.value })} /></Field>
          <Field label="Bodenklasse"><input className={rlcClass(null, input)} value={entry.parameter?.bodenklasse || ""} onChange={(e) => updateParameter({ bodenklasse: e.target.value })} /></Field>
          <Field label="DN / Durchmesser mm"><input type="number" className={rlcClass(null, input)} value={entry.parameter?.rohrDurchmesserMm ?? ""} onChange={(e) => updateParameter({ rohrDurchmesserMm: n(e.target.value) })} /></Field>
          <Field label="Grabentiefe m"><input type="number" className={rlcClass(null, input)} value={entry.parameter?.grabentiefeM ?? ""} onChange={(e) => updateParameter({ grabentiefeM: n(e.target.value) })} /></Field>
        </div>
        <div className={rlcClass(null, hintBox)}>
          <b>Preisaufbau nicht doppelt pflegen.</b>
          <span>Personal, Maschinen, Material, Transport, Zuschläge und Rezeptur werden zentral in der Urkalkulation bearbeitet.</span>
          <button className={rlcClass(null, btnPrimary)} onClick={openUrkalkulation}>Urkalkulation öffnen</button>
        </div>
      </div>
    </section>

    <section className={rlcClass(null, grid)}>
      <div className={rlcClass(null, card)}>
        <h2 className={rlcClass(null, sectionTitle)}>Qualität</h2>
        <div className={rlcClass(null, formGrid)}>
          <Field label="Vertrauen 0–1"><input type="number" step="0.01" min="0" max="1" className={rlcClass(null, input)} value={entry.confidence ?? 0} onChange={(e) => update({ confidence: n(e.target.value) })} /></Field>
          <Field label="Risiko-Stufe"><select className={rlcClass(null, input)} value={entry.risiko || "normal"} onChange={(e) => update({ risiko: e.target.value })}><option value="niedrig">niedrig</option><option value="normal">normal</option><option value="mittel">mittel</option><option value="hoch">hoch</option><option value="kritisch">kritisch</option></select></Field>
        </div>
        <Field label="KI-Prüfhinweis"><textarea className={rlcClass(null, { ...input, minHeight: 80 })} value={entry.kiHinweis || ""} onChange={(e) => update({ kiHinweis: e.target.value })} /></Field>
      </div>
      <div className={rlcClass(null, card)}>
        <h2 className={rlcClass(null, sectionTitle)}>Notizen</h2>
        <Field label="Kalkulator-Notiz"><textarea className={rlcClass(null, { ...input, minHeight: 145 })} value={entry.kalkulatorNotiz || ""} onChange={(e) => update({ kalkulatorNotiz: e.target.value })} /></Field>
      </div>
    </section>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className={rlcClass(null, field)}><span className={rlcClass(null, labelStyle)}>{label}</span>{children}</label>;
}

const page: React.CSSProperties = { padding: 12, display: "grid", gap: 10 };
const topBar: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" };
const topActions: React.CSSProperties = { display: "flex", gap: 7, flexWrap: "wrap" };
const hero: React.CSSProperties = { color: "#fff", borderRadius: 12, padding: "14px 18px", background: "linear-gradient(135deg,#0B5BD3,#146EF5)", display: "flex", justifyContent: "space-between", gap: 18, alignItems: "center" };
const eyebrow: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", opacity: .85 };
const title: React.CSSProperties = { margin: "2px 0", fontSize: 22, fontWeight: 750 };
const subtitle: React.CSSProperties = { margin: 0, fontSize: 12, opacity: .9 };
const priceBox: React.CSSProperties = { display: "grid", gap: 1, minWidth: 170, padding: "8px 12px", borderRadius: 9, background: "rgba(255,255,255,.14)", textAlign: "right", fontSize: 11 };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10, alignItems: "start" };
const card: React.CSSProperties = { background: "#fff", border: "1px solid #E2E8F0", borderRadius: 11, padding: 12, boxShadow: "0 1px 2px rgba(15,23,42,.03)" };
const sectionTitle: React.CSSProperties = { margin: "0 0 8px", fontSize: 15.5, fontWeight: 750, color: "#0F172A" };
const formGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8 };
const field: React.CSSProperties = { display: "grid", gap: 3, marginBottom: 7 };
const labelStyle: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, color: "#475569" };
const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", border: "1px solid #CBD5E1", borderRadius: 8, padding: "6px 8px", minHeight: 34, fontSize: 11.5, background: "#fff", color: "#0F172A" };
const hintBox: React.CSSProperties = { display: "grid", gap: 6, marginTop: 3, padding: 10, borderRadius: 9, background: "#F8FAFC", border: "1px solid #E2E8F0", fontSize: 11.5, color: "#475569" };
const btnPrimary: React.CSSProperties = { border: "1px solid #0B5BD3", background: "#0B5BD3", color: "#fff", borderRadius: 8, padding: "7px 11px", fontWeight: 700, cursor: "pointer", fontSize: 11.5 };
const btnSecondary: React.CSSProperties = { border: "1px solid #CBD5E1", background: "#fff", color: "#0F172A", borderRadius: 8, padding: "7px 11px", fontWeight: 700, cursor: "pointer", fontSize: 11.5 };
