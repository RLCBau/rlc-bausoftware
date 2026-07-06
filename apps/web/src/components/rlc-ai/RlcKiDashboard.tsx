import React from "react";

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

function Section({ title, items }: { title: string; items: any[] }) {
  if (!items.length) return null;
  return (
    <div style={section}>
      <div style={sectionTitle}>{title}</div>
      <div style={list}>
        {items.map((x, i) => (
          <div key={i} style={item}>✓ {String(x)}</div>
        ))}
      </div>
    </div>
  );
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
      <section style={card}>
        <div style={workflow}>
          <span>1 Positionsdaten</span>
          <span>2 Ausführungsparameter</span>
          <b>3 KI-Analyse</b>
          <span>4 Ressourcen</span>
          <span>5 Preisaufbau</span>
          <span>6 Position übernehmen</span>
        </div>

        <div style={emptyHero}>
          <div>
            <div style={eyebrow}>RLC KI Analyse</div>
            <h2 style={title}>Urkalkulation noch nicht erstellt</h2>
            <p style={emptyText}>
              Starte die KI, damit RLC aus Positionsdaten, Langtext und Ausf�hrungsparametern
              automatisch Personal, Maschinen, Material, Logistik, Zuschl�ge und Preisaufbau erzeugt.
            </p>
          </div>

          {onSuggestResources ? (
            <button type="button" style={primaryAction} onClick={onSuggestResources}>
              Urkalkulation starten
            </button>
          ) : null}
        </div>

        <div style={grid}>
          <Section
            title="Die KI analysiert"
            items={[
              "Kurztext und Langtext",
              "Einheit und Menge",
              "Bodenklasse, Tiefe und Ausf�hrungsparameter",
              "Firmenwissen und importierte Bibliothek",
              "technische Plausibilit�t und Risiken",
            ]}
          />

          <Section
            title="Die KI erzeugt"
            items={[
              "Personalans�tze",
              "Maschinen und Ger�te",
              "Material und Stoffe",
              "Transport / Entsorgung",
              "Gemeinkosten, Risiko und Gewinn",
              "pr�fbaren Preisaufbau",
            ]}
          />
        </div>
      </section>
    );
  }

  return (
    <section style={card}>
      <div style={workflow}>
        <span>1 Positionsdaten</span>
        <span>2 Ausführungsparameter</span>
        <b>3 KI-Analyse</b>
        <span>4 Ressourcen</span>
        <span>5 Preisaufbau</span>
        <span>6 Position übernehmen</span>
      </div>

      <div style={head}>
        <div>
          <div style={eyebrow}>RLC KI Analyse</div>
          <h2 style={title}>RLC KI-Analyse</h2>
        </div>

        <div style={confidence}>
          {pct(ex.confidence ?? row?.confidence, percent)}
        </div>
      </div>

      <div style={meta}>
        <div><b>Quelle:</b> {ex.source || row?.source || "�"}</div>
        <div><b>Status:</b> {row?.calculationStatus || "�"}</div>
        <div><b>Risiko:</b> {row?.riskLevel || "�"}</div>
        <div><b>Version:</b> {ex.version || "�"}</div>
      </div>

      <div style={grid}>
        <Section title="Maschinen" items={machines} />
        <Section title="Personal" items={labor} />
        <Section title="Material" items={materials} />
        <Section title="Logistik" items={logistics} />
        <Section title="Risiken" items={risks} />
        <Section title="Normen / Wissen" items={arr(ex.standards)} />
        <Section title="Annahmen" items={arr(ex.assumptions)} />
        <Section title="Berechnungsschritte" items={arr(ex.calculationSteps)} />
      </div>
    </section>
  );
}

const card: React.CSSProperties = {
  display: "grid",
  gap: 16,
  padding: 18,
  borderRadius: 22,
  border: "1px solid #BFDBFE",
  background: "linear-gradient(180deg,#EFF6FF,#FFFFFF)",
  boxShadow: "0 12px 30px rgba(15,23,42,0.06)",
};

const workflow: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  fontSize: 12,
  color: "#64748B",
};

const emptyHero: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 18,
  alignItems: "center",
};

const emptyText: React.CSSProperties = {
  margin: "6px 0 0",
  fontSize: 14,
  lineHeight: 1.45,
  color: "#334155",
  maxWidth: 760,
};

const head: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "center",
};

const eyebrow: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 950,
  color: "#2563EB",
  textTransform: "uppercase",
  letterSpacing: 0.6,
};

const title: React.CSSProperties = {
  margin: 0,
  fontSize: 20,
  fontWeight: 950,
  color: "#0F172A",
};

const confidence: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 999,
  background: "#2563EB",
  color: "white",
  fontWeight: 950,
  fontSize: 16,
};

const primaryAction: React.CSSProperties = {
  padding: "13px 18px",
  borderRadius: 14,
  border: "1px solid #2563EB",
  background: "#2563EB",
  color: "#FFFFFF",
  fontWeight: 950,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const meta: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 8,
  fontSize: 13,
  color: "#334155",
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10,
};

const section: React.CSSProperties = {
  display: "grid",
  gap: 6,
  padding: 12,
  borderRadius: 16,
  background: "#FFFFFF",
  border: "1px solid #E2E8F0",
};

const sectionTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 950,
  color: "#0F172A",
};

const list: React.CSSProperties = {
  display: "grid",
  gap: 4,
};

const item: React.CSSProperties = {
  fontSize: 13,
  color: "#334155",
  lineHeight: 1.35,
};






