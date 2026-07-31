import { rlcClass } from "../../ui/rlcRuntimeStyle";import React from "react";

type Props = {
  row: any;
  percent?: (v: any) => string;
  onSuggestResources?: () => void;
};

function arr(v: any): any[] {
  return Array.isArray(v) ? v.filter(Boolean) : [];
}

function pct(v: any, percent?: (v: any) => string): string {
  if (percent) return percent(v);
  const n = Number(v);
  if (!Number.isFinite(n)) return "�";
  return `${Math.round(n * 100)} %`;
}

function Section({ title, items }: {title: string;items: any[];}) {
  if (!items.length) return null;
  return (
    <div className={rlcClass(null, section)}>
      <div className={rlcClass(null, sectionTitle)}>{title}</div>
      <div className={rlcClass(null, list)}>
        {items.map((x, i) =>
        <div key={i} className={rlcClass(null, item)}>✓ {String(x)}</div>
        )}
      </div>
    </div>);

}

export default function RlcKiDashboard({ row, percent, onSuggestResources }: Props) {
  const ex = row?.explainability || {};
  const tb = row?.technicalBreakdown || {};

  const machines = arr(ex.machines).length ? arr(ex.machines) : arr(tb.machines);
  const labor = arr(ex.labor).length ? arr(ex.labor) : arr(tb.labor);
  const materials = arr(ex.materials).length ? arr(ex.materials) : arr(tb.materials);
  const logistics = arr(ex.logistics).length ? arr(ex.logistics) : arr(tb.logistics);
  const risks = arr(ex.risks).length ? arr(ex.risks) : arr(tb.risks);

  const hasResources =
  machines.length || labor.length || materials.length || logistics.length || arr(ex.calculationSteps).length;

  if (!hasResources) {
    return (
      <section className={rlcClass(null, card)}>
        <div className={rlcClass(null, workflow)}>
          <span>1 Positionsdaten</span>
          <span>2 Ausführungsparameter</span>
          <b>3 KI-Analyse</b>
          <span>4 Ressourcen</span>
          <span>5 Preisaufbau</span>
          <span>6 Position übernehmen</span>
        </div>

        <div className={rlcClass(null, emptyHero)}>
          <div>
            <div className={rlcClass(null, eyebrow)}>RLC KI Analyse</div>
            <h2 className={rlcClass(null, title)}>Urkalkulation noch nicht erstellt</h2>
            <p className={rlcClass(null, emptyText)}>
              Starte die KI, damit RLC aus Positionsdaten, Langtext und Ausf�hrungsparametern
              automatisch Personal, Maschinen, Material, Logistik, Zuschl�ge und Preisaufbau erzeugt.
            </p>
          </div>

          {onSuggestResources ?
          <button type="button" className={rlcClass(null, primaryAction)} onClick={onSuggestResources}>
              Urkalkulation starten
            </button> :
          null}
        </div>

        <div className={rlcClass(null, grid)}>
          <Section
            title="Die KI analysiert"
            items={[
            "Kurztext und Langtext",
            "Einheit und Menge",
            "Bodenklasse, Tiefe und Ausf�hrungsparameter",
            "Firmenwissen und importierte Bibliothek",
            "technische Plausibilit�t und Risiken"]
            } />
          

          <Section
            title="Die KI erzeugt"
            items={[
            "Personalans�tze",
            "Maschinen und Ger�te",
            "Material und Stoffe",
            "Transport / Entsorgung",
            "Gemeinkosten, Risiko und Gewinn",
            "pr�fbaren Preisaufbau"]
            } />
          
        </div>
      </section>);

  }

  return (
    <section className={rlcClass(null, card)}>
      <div className={rlcClass(null, workflow)}>
        <span>1 Positionsdaten</span>
        <span>2 Ausführungsparameter</span>
        <b>3 KI-Analyse</b>
        <span>4 Ressourcen</span>
        <span>5 Preisaufbau</span>
        <span>6 Position übernehmen</span>
      </div>

      <div className={rlcClass(null, head)}>
        <div>
          <div className={rlcClass(null, eyebrow)}>RLC KI Analyse</div>
          <h2 className={rlcClass(null, title)}>RLC KI-Analyse</h2>
        </div>

        <div className={rlcClass(null, confidence)}>
          {pct(ex.confidence ?? row?.confidence, percent)}
        </div>
      </div>

      <div className={rlcClass(null, meta)}>
        <div><b>Quelle:</b> {ex.source || row?.source || "�"}</div>
        <div><b>Status:</b> {row?.calculationStatus || "�"}</div>
        <div><b>Risiko:</b> {row?.riskLevel || "�"}</div>
        <div><b>Version:</b> {ex.version || "�"}</div>
      </div>

      <div className={rlcClass(null, grid)}>
        <Section title="Maschinen" items={machines} />
        <Section title="Personal" items={labor} />
        <Section title="Material" items={materials} />
        <Section title="Logistik" items={logistics} />
        <Section title="Risiken" items={risks} />
        <Section title="Normen / Wissen" items={arr(ex.standards)} />
        <Section title="Annahmen" items={arr(ex.assumptions)} />
        <Section title="Berechnungsschritte" items={arr(ex.calculationSteps)} />
      </div>
    </section>);

}

const card: React.CSSProperties = {
  display: "grid",
  gap: 16,
  padding: 18,
  borderRadius: 22,
  border: "1px solid #BED6FF",
  background: "linear-gradient(180deg,#EAF2FF,#FFFFFF)",
  boxShadow: "0 12px 30px rgba(15,23,42,0.06)"
};

const workflow: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  fontSize: 12,
  color: "#64748B"
};

const emptyHero: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 18,
  alignItems: "center"
};

const emptyText: React.CSSProperties = {
  margin: "6px 0 0",
  fontSize: 14,
  lineHeight: 1.45,
  color: "#334155",
  maxWidth: 760
};

const head: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "center"
};

const eyebrow: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#146EF5",
  textTransform: "uppercase",
  letterSpacing: 0.6
};

const title: React.CSSProperties = {
  margin: 0,
  fontSize: 20,
  fontWeight: 700,
  color: "#0F172A"
};

const confidence: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 999,
  background: "#146EF5",
  color: "white",
  fontWeight: 700,
  fontSize: 16
};

const primaryAction: React.CSSProperties = {
  padding: "13px 18px",
  borderRadius: 14,
  border: "1px solid #146EF5",
  background: "#146EF5",
  color: "#FFFFFF",
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap"
};

const meta: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 8,
  fontSize: 13,
  color: "#334155"
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10
};

const section: React.CSSProperties = {
  display: "grid",
  gap: 6,
  padding: 12,
  borderRadius: 16,
  background: "#FFFFFF",
  border: "1px solid #E2E8F0"
};

const sectionTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "#0F172A"
};

const list: React.CSSProperties = {
  display: "grid",
  gap: 4
};

const item: React.CSSProperties = {
  fontSize: 13,
  color: "#334155",
  lineHeight: 1.35
};
