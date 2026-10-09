import React from "react";
import { useSearchParams } from "react-router-dom";
import MaterialCore from "./materialCore";
import Lager from "./lager";
import AbfallEntsorgung from "./AbfallEntsorgung";

type Tab =
  | "overview"
  | "material"
  | "lager"
  | "abfall";

export default function Materialverwaltung() {
  const [params, setParams] = useSearchParams();

  const area = String(params.get("bereich") || "");

  const initialTab: Tab =
    area === "material"
      ? "material"
      : area === "lager"
      ? "lager"
      : area === "abfall"
      ? "abfall"
      : "overview";

  const [tab, setTab] =
    React.useState<Tab>(initialTab);

  React.useEffect(() => {
    setTab(
      area === "material"
        ? "material"
        : area === "lager"
        ? "lager"
        : area === "abfall"
        ? "abfall"
        : "overview"
    );
  }, [area]);

  const open = (next: Tab) => {
    setTab(next);

    if (next === "overview") {
      setParams({});
    } else {
      setParams({
        bereich: next
      });
    }
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <section className="rlc-page-hero rlc-page-hero--split">
        <div>
          <div className="rlc-page-hero__eyebrow">
            Verwaltung · Material & Logistik
          </div>

          <h1 style={{ margin: "3px 0 4px" }}>
            Materialverwaltung
          </h1>

          <div style={{ opacity: 0.9 }}>
            Material, Bestände, Einkauf und Materialbewegungen zentral verwalten.
          </div>
        </div>
      </section>

      <section
        className="card"
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap"
        }}
      >
        <button
          className={
            tab === "overview"
              ? "btn btn-primary"
              : "btn"
          }
          onClick={() => open("overview")}
        >
          Übersicht
        </button>

        <button
          className={
            tab === "material"
              ? "btn btn-primary"
              : "btn"
          }
          onClick={() => open("material")}
        >
          Material
        </button>

        <button
          className={
            tab === "lager"
              ? "btn btn-primary"
              : "btn"
          }
          onClick={() => open("lager")}
        >
          Lager & Einkauf
        </button>

        <button
          className={tab === "abfall" ? "btn btn-primary" : "btn"}
          onClick={() => open("abfall")}
        >
          Abfall / Entsorgung
        </button>
      </section>

      {tab === "overview" && (
        <section
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(4,minmax(0,1fr))",
            gap: 12
          }}
        >
          <button
            className="card"
            onClick={() => open("material")}
            style={{
              minHeight: 140,
              textAlign: "left",
              cursor: "pointer",
              background: "#fff"
            }}
          >
            <div className="muted">
              Material
            </div>

            <div
              style={{
                fontSize: 20,
                fontWeight: 800,
                marginTop: 8
              }}
            >
              Materialstamm
            </div>

            <div
              className="muted"
              style={{ marginTop: 8 }}
            >
              Artikel, Bestände, Bewegungen, Barcode und RFID.
            </div>
          </button>

          <button
            className="card"
            onClick={() => open("lager")}
            style={{
              minHeight: 140,
              textAlign: "left",
              cursor: "pointer",
              background: "#fff"
            }}
          >
            <div className="muted">
              Logistik
            </div>

            <div
              style={{
                fontSize: 20,
                fontWeight: 800,
                marginTop: 8
              }}
            >
              Lagerbestand
            </div>

            <div
              className="muted"
              style={{ marginTop: 8 }}
            >
              Lagerbestände und Materialverfügbarkeit.
            </div>
          </button>

          <button
            className="card"
            onClick={() => open("lager")}
            style={{
              minHeight: 140,
              textAlign: "left",
              cursor: "pointer",
              background: "#fff"
            }}
          >
            <div className="muted">
              Einkauf
            </div>

            <div
              style={{
                fontSize: 20,
                fontWeight: 800,
                marginTop: 8
              }}
            >
              Bedarf & Einkauf
            </div>

            <div
              className="muted"
              style={{ marginTop: 8 }}
            >
              Materialbedarf, Lager und Einkauf zusammenführen.
            </div>
          </button>

          <button className="card" onClick={() => open("abfall")} style={{minHeight:140,textAlign:"left",cursor:"pointer",background:"#fff"}}>
            <div className="muted">Compliance</div>
            <div style={{fontSize:20,fontWeight:800,marginTop:8}}>Abfall / Entsorgung</div>
            <div className="muted" style={{marginTop:8}}>GewAbfV, ErsatzbaustoffV, NachweisV und Entsorgungsnachweise.</div>
          </button>
        </section>
      )}

      {tab === "material" && (
        <div className="rlc-material-core-embedded">
          <MaterialCore />
        </div>
      )}

      {tab === "lager" && (
        <Lager />
      )}

      {tab === "abfall" && (
        <AbfallEntsorgung />
      )}
    </div>
  );
}
