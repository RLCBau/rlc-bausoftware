import { rlcClass } from "../../ui/rlcRuntimeStyle";import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { KalkulationsDatenbank } from "./kalkulationsDatenbank";

function n(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const s = String(v).replace(/\./g, "").replace(",", ".");
  const x = typeof v === "number" ? v : Number(s);
  return Number.isFinite(x) ? x : 0;
}

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

function money(v: unknown): string {
  return `${n(v).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} €`;
}

export default function KalkulationsDatenbankPositionPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [entry, setEntry] = useState<any>(() => {
    if (!id) return null;
    return KalkulationsDatenbank.get(id) || null;
  });

  useEffect(() => {
    if (!id) return;
    setEntry(KalkulationsDatenbank.get(id) || null);
  }, [id]);

  const ep = useMemo(() => n(entry?.kosten?.epNetto), [entry]);
  const gp = useMemo(() => n(entry?.kosten?.gpNetto), [entry]);

  function update(patch: any) {
    if (!entry) return;
    const next = {
      ...entry,
      ...patch,
      updatedAt: new Date().toISOString()
    };
    const saved = KalkulationsDatenbank.upsert(next);
    setEntry(saved);
  }

  function updateKosten(patch: any) {
    if (!entry) return;

    const kosten = {
      ...(entry.kosten || {}),
      ...patch
    };

    if (Object.prototype.hasOwnProperty.call(patch, "epNetto")) {
      kosten.gpNetto = round2(n(entry.menge) * n(kosten.epNetto));
    }

    update({ kosten });
  }

  function updateParameter(patch: any) {
    update({
      parameter: {
        ...(entry?.parameter || {}),
        ...patch
      }
    });
  }

  function addResource() {
    const r = {
      id: crypto.randomUUID(),
      typ: "material",
      bezeichnung: "",
      kurztext: "",
      beschreibung: "",
      einheit: entry?.einheit || "St",
      menge: 0,
      einzelpreis: 0,
      gesamtpreis: 0,
      bemerkung: ""
    };

    update({
      ressourcen: [...(entry?.ressourcen || []), r]
    });
  }

  function updateResource(resourceId: string, patch: any) {
    const next = (entry?.ressourcen || []).map((r: any) => {
      if (r.id !== resourceId) return r;

      const updated = { ...r, ...patch };
      updated.gesamtpreis = round2(n(updated.menge) * n(updated.einzelpreis));
      return updated;
    });

    update({ ressourcen: next });
  }

  function removeResource(resourceId: string) {
    update({
      ressourcen: (entry?.ressourcen || []).filter((r: any) => r.id !== resourceId)
    });
  }

  if (!entry) {
    return (
      <div className={rlcClass(null, page)}>
        <button className={rlcClass(null, btnSecondary)} onClick={() => navigate("/kalkulation/datenbank")}>
          Zurück zur Datenbank
        </button>

        <section className={rlcClass(null, card)}>
          <h1 className={rlcClass(null, title)}>Position nicht gefunden</h1>
          <p className={rlcClass(null, muted)}>Der Datenbankeintrag konnte nicht geladen werden.</p>
        </section>
      </div>);

  }

  return (
    <div className={rlcClass(null, page)}>
      <div className={rlcClass(null, topBar)}>
        <button className={rlcClass(null, btnSecondary)} onClick={() => navigate("/kalkulation/datenbank")}>
          ← Zurück zur Datenbank
        </button>

        <div className={rlcClass(null, topActions)}>
          <button className={rlcClass(null,
          btnPrimary)}
          onClick={() => {
            const saved = KalkulationsDatenbank.upsert(entry);
            setEntry(saved);
            alert("Position gespeichert.");
          }}>
            
            Speichern
          </button>
        </div>
      </div>

      <section className={rlcClass("rlc-page-hero", hero)}>
        <div>
          <div className={rlcClass(null, eyebrow)}>Kalkulationsdatenbank</div>
          <h1 className={rlcClass(null, title)}>Position bearbeiten</h1>
          <p className={rlcClass(null, subtitle)}>
            {entry.posNr || "—"} · {entry.kurztext || "Ohne Kurztext"}
          </p>
        </div>

        <div className={rlcClass(null, priceBox)}>
          <div className={rlcClass(null, priceLabel)}>EP netto</div>
          <div className={rlcClass(null, priceValue)}>{money(ep)}</div>
          <div className={rlcClass(null, priceLabel)}>GP netto: {money(gp)}</div>
        </div>
      </section>

      <section className={rlcClass(null, grid)}>
        <div className={rlcClass(null, card)}>
          <h2 className={rlcClass(null, sectionTitle)}>Grunddaten</h2>

          <div className={rlcClass(null, formGrid)}>
            <Field label="PosNr">
              <input className={rlcClass(null, input)} value={entry.posNr || ""} onChange={(e) => update({ posNr: e.target.value })} />
            </Field>

            <Field label="Einheit">
              <input className={rlcClass(null, input)} value={entry.einheit || ""} onChange={(e) => update({ einheit: e.target.value })} />
            </Field>

            <Field label="Menge">
              <input
                type="number" className={rlcClass(null,
                input)}
                value={entry.menge || 0}
                onChange={(e) => {
                  const menge = n(e.target.value);
                  update({
                    menge,
                    kosten: {
                      ...(entry.kosten || {}),
                      gpNetto: round2(menge * n(entry.kosten?.epNetto))
                    }
                  });
                }} />
              
            </Field>

            <Field label="Quelle">
              <input className={rlcClass(null, input)} value={entry.quelle || ""} onChange={(e) => update({ quelle: e.target.value })} />
            </Field>
          </div>

          <Field label="Kurztext">
            <input className={rlcClass(null, input)} value={entry.kurztext || ""} onChange={(e) => update({ kurztext: e.target.value })} />
          </Field>

          <Field label="Langtext">
            <textarea className={rlcClass(null,
            { ...input, minHeight: 160 })}
            value={entry.langtext || ""}
            onChange={(e) => update({ langtext: e.target.value })} />
            
          </Field>
        </div>

        <div className={rlcClass(null, card)}>
          <h2 className={rlcClass(null, sectionTitle)}>Technische Parameter</h2>

          <div className={rlcClass(null, formGrid)}>
            <Field label="Gewerk">
              <input className={rlcClass(null, input)} value={entry.parameter?.gewerk || ""} onChange={(e) => updateParameter({ gewerk: e.target.value })} />
            </Field>

            <Field label="Leistungsart">
              <input className={rlcClass(null, input)} value={entry.parameter?.leistungsart || ""} onChange={(e) => updateParameter({ leistungsart: e.target.value })} />
            </Field>

            <Field label="Bauverfahren">
              <input className={rlcClass(null, input)} value={entry.parameter?.bauverfahren || ""} onChange={(e) => updateParameter({ bauverfahren: e.target.value })} />
            </Field>

            <Field label="Bodenklasse">
              <input className={rlcClass(null, input)} value={entry.parameter?.bodenklasse || ""} onChange={(e) => updateParameter({ bodenklasse: e.target.value })} />
            </Field>

            <Field label="Grabentiefe m">
              <input type="number" className={rlcClass(null, input)} value={entry.parameter?.grabentiefeM ?? ""} onChange={(e) => updateParameter({ grabentiefeM: n(e.target.value) })} />
            </Field>

            <Field label="Grabenbreite m">
              <input type="number" className={rlcClass(null, input)} value={entry.parameter?.grabenbreiteM ?? ""} onChange={(e) => updateParameter({ grabenbreiteM: n(e.target.value) })} />
            </Field>

            <Field label="DN / Durchmesser mm">
              <input type="number" className={rlcClass(null, input)} value={entry.parameter?.rohrDurchmesserMm ?? ""} onChange={(e) => updateParameter({ rohrDurchmesserMm: n(e.target.value) })} />
            </Field>

            <Field label="Entfernung km">
              <input type="number" className={rlcClass(null, input)} value={entry.parameter?.baustellenEntfernungKm ?? ""} onChange={(e) => updateParameter({ baustellenEntfernungKm: n(e.target.value) })} />
            </Field>

            <Field label="Fahrzeit min">
              <input type="number" className={rlcClass(null, input)} value={entry.parameter?.fahrzeitMin ?? ""} onChange={(e) => updateParameter({ fahrzeitMin: n(e.target.value) })} />
            </Field>

            <Field label="Bauzeit Tage">
              <input type="number" className={rlcClass(null, input)} value={entry.parameter?.bauzeitTage ?? ""} onChange={(e) => updateParameter({ bauzeitTage: n(e.target.value) })} />
            </Field>
          </div>
        </div>
      </section>

      <section className={rlcClass(null, card)}>
        <div className={rlcClass(null, sectionHeader)}>
          <div>
            <h2 className={rlcClass(null, sectionTitle)}>Kostenaufbau / Ressourcen</h2>
            <p className={rlcClass(null, muted)}>Personal, Maschinen, Material, Transport und Fremdleistungen.</p>
          </div>

          <button className={rlcClass(null, btnSecondary)} onClick={addResource}>
            + Kostenposition
          </button>
        </div>

        {(entry.ressourcen || []).length ?
        <div className={rlcClass(null, resourceList)}>
            {(entry.ressourcen || []).map((r: any) =>
          <div key={r.id} className={rlcClass(null, resourceBox)}>
                <select className={rlcClass(null, input)} value={r.typ || "material"} onChange={(e) => updateResource(r.id, { typ: e.target.value })}>
                  <option value="personal">personal</option>
                  <option value="maschine">maschine</option>
                  <option value="material">material</option>
                  <option value="transport">transport</option>
                  <option value="fremdleistung">fremdleistung</option>
                  <option value="entsorgung">entsorgung</option>
                  <option value="sonstiges">sonstiges</option>
                </select>

                <input className={rlcClass(null, input)} value={r.bezeichnung || ""} placeholder="Bezeichnung" onChange={(e) => updateResource(r.id, { bezeichnung: e.target.value })} />
                <input className={rlcClass(null, input)} value={r.einheit || ""} placeholder="EH" onChange={(e) => updateResource(r.id, { einheit: e.target.value })} />
                <input type="number" className={rlcClass(null, input)} value={r.menge || 0} placeholder="Menge" onChange={(e) => updateResource(r.id, { menge: n(e.target.value) })} />
                <input type="number" className={rlcClass(null, input)} value={r.einzelpreis || 0} placeholder="EP" onChange={(e) => updateResource(r.id, { einzelpreis: n(e.target.value) })} />

                <div className={rlcClass(null, totalBox)}>{money(r.gesamtpreis)}</div>

                <button className={rlcClass(null, btnDanger)} onClick={() => removeResource(r.id)}>
                  Entfernen
                </button>
              </div>
          )}
          </div> :

        <div className={rlcClass(null, empty)}>Noch kein Kostenaufbau vorhanden.</div>
        }
      </section>

      <section className={rlcClass(null, grid)}>
        <div className={rlcClass(null, card)}>
          <h2 className={rlcClass(null, sectionTitle)}>Kosten & Bewertung</h2>

          <div className={rlcClass(null, formGrid)}>
            {[
            ["material", "Material"],
            ["lohn", "Lohn"],
            ["maschinen", "Maschinen"],
            ["fremdleistung", "Fremdleistung"],
            ["entsorgung", "Entsorgung"],
            ["transport", "Transport"],
            ["gemeinkosten", "Gemeinkosten"],
            ["risiko", "Risiko"],
            ["gewinn", "Gewinn"],
            ["epNetto", "EP netto"],
            ["gpNetto", "GP netto"]].
            map(([key, label]) =>
            <Field key={key} label={label}>
                <input
                type="number" className={rlcClass(null,
                input)}
                value={entry.kosten?.[key] ?? 0}
                onChange={(e) => updateKosten({ [key]: n(e.target.value) })} />
              
              </Field>
            )}
          </div>
        </div>

        <div className={rlcClass(null, card)}>
          <h2 className={rlcClass(null, sectionTitle)}>KI / Notizen</h2>

          <Field label="Confidence 0-1">
            <input type="number" step="0.01" min="0" max="1" className={rlcClass(null, input)} value={entry.confidence ?? 0} onChange={(e) => update({ confidence: n(e.target.value) })} />
          </Field>

          <Field label="Risiko-Stufe">
            <select className={rlcClass(null, input)} value={entry.risiko || "normal"} onChange={(e) => update({ risiko: e.target.value })}>
              <option value="niedrig">niedrig</option>
              <option value="normal">normal</option>
              <option value="hoch">hoch</option>
              <option value="kritisch">kritisch</option>
            </select>
          </Field>

          <Field label="KI-Prüfhinweis">
            <textarea className={rlcClass(null, { ...input, minHeight: 100 })} value={entry.kiHinweis || ""} onChange={(e) => update({ kiHinweis: e.target.value })} />
          </Field>

          <Field label="Kalkulator-Notiz">
            <textarea className={rlcClass(null, { ...input, minHeight: 100 })} value={entry.kalkulatorNotiz || ""} onChange={(e) => update({ kalkulatorNotiz: e.target.value })} />
          </Field>
        </div>
      </section>
    </div>);

}

function Field({ label, children }: {label: string;children: React.ReactNode;}) {
  return (
    <label className={rlcClass(null, field)}>
      <span className={rlcClass(null, labelStyle)}>{label}</span>
      {children}
    </label>);

}

const page: React.CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 18
};

const topBar: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center"
};

const topActions: React.CSSProperties = {
  display: "flex",
  gap: 10
};

const hero: React.CSSProperties = {
  color: "#FFFFFF", border: "1px solid #E2E8F0",
  borderRadius: 22,
  padding: 22,
  background: "linear-gradient(135deg, #0B5BD3 0%, #0B5BD3 48%, #146EF5 100%)",
  display: "flex",
  justifyContent: "space-between",
  gap: 18
};

const eyebrow: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  textTransform: "uppercase",
  color: "#146EF5",
  letterSpacing: 0.5
};

const title: React.CSSProperties = {
  margin: "6px 0",
  fontSize: 30,
  fontWeight: 700,
  color: "#0F172A"
};

const subtitle: React.CSSProperties = {
  margin: 0,
  color: "#475569",
  fontWeight: 600
};

const priceBox: React.CSSProperties = {
  minWidth: 210,
  border: "1px solid #DBEAFE",
  borderRadius: 18,
  padding: 16,
  background: "#EAF2FF"
};

const priceLabel: React.CSSProperties = {
  color: "#475569",
  fontSize: 12,
  fontWeight: 700
};

const priceValue: React.CSSProperties = {
  color: "#0F172A",
  fontSize: 26,
  fontWeight: 700,
  margin: "4px 0 8px"
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2,minmax(0,1fr))",
  gap: 18
};

const card: React.CSSProperties = {
  border: "1px solid #E2E8F0",
  borderRadius: 20,
  padding: 20,
  background: "#FFFFFF",
  boxShadow: "0 10px 25px rgba(15,23,42,0.04)"
};

const sectionHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12
};

const sectionTitle: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 18,
  fontWeight: 700,
  color: "#0F172A"
};

const muted: React.CSSProperties = {
  margin: 0,
  color: "#64748B",
  fontWeight: 600
};

const formGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2,minmax(0,1fr))",
  gap: 12,
  marginBottom: 12
};

const field: React.CSSProperties = {
  display: "grid",
  gap: 6,
  marginBottom: 12
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#475569",
  fontWeight: 700
};

const input: React.CSSProperties = {
  width: "100%",
  border: "1px solid #CBD5E1",
  borderRadius: 12,
  padding: "10px 12px",
  fontSize: 14,
  outline: "none",
  background: "#FFFFFF"
};

const btnPrimary: React.CSSProperties = {
  border: "1px solid #0B5BD3",
  background: "#146EF5",
  color: "#FFFFFF",
  borderRadius: 12,
  padding: "10px 14px",
  fontWeight: 700,
  cursor: "pointer"
};

const btnSecondary: React.CSSProperties = {
  border: "1px solid #CBD5E1",
  background: "#FFFFFF",
  color: "#0F172A",
  borderRadius: 12,
  padding: "10px 14px",
  fontWeight: 700,
  cursor: "pointer"
};

const btnDanger: React.CSSProperties = {
  border: "1px solid #FECACA",
  background: "#FEF2F2",
  color: "#B91C1C",
  borderRadius: 12,
  padding: "10px 12px",
  fontWeight: 700,
  cursor: "pointer"
};

const resourceList: React.CSSProperties = {
  display: "grid",
  gap: 10
};

const resourceBox: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "130px 1fr 90px 100px 110px 120px 110px",
  gap: 8,
  alignItems: "center",
  border: "1px solid #E2E8F0",
  borderRadius: 14,
  padding: 10,
  background: "#F8FAFC"
};

const totalBox: React.CSSProperties = {
  border: "1px solid #DBEAFE",
  background: "#EAF2FF",
  color: "#0F172A",
  borderRadius: 12,
  padding: "10px 12px",
  fontWeight: 700,
  textAlign: "right"
};

const empty: React.CSSProperties = {
  border: "1px dashed #CBD5E1",
  borderRadius: 14,
  padding: 16,
  color: "#64748B",
  fontWeight: 600
};
