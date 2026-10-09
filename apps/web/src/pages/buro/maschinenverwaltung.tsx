import React from "react";
import { useSearchParams } from "react-router-dom";
import { apiUrl } from "../../lib/apiBase";
import MaschinenCore from "./maschinenCore";
import Einsatzplanung from "./ressourcenplanung";
import MaschinenWartung from "./MaschinenWartung";
import MachineDeadlines from "./MachineDeadlines";
import MaschinenKosten from "./MaschinenKosten";

type Tab =
  | "overview"
  | "maschinen"
  | "fristen"
  | "wartung"
  | "einsatz"
  | "kosten";

type Machine = {
  id: string;
  name: string;
  type?: string | null;
  serial?: string | null;
  projectId?: string | null;
  location?: string | null;
  status?: string | null;
  hours?: number;
  hourlyRate?: number;
  lastService?: string | null;
  nextService?: string | null;
  serviceIntervalDays?: number;
};

function getAuthToken(): string {
  const keys = [
    "rlc_token",
    "token",
    "authToken",
    "accessToken",
    "rlc_auth_token"
  ];

  for (const storage of [localStorage, sessionStorage]) {
    for (const key of keys) {
      const value = storage.getItem(key);
      if (value?.trim()) return value.trim();
    }
  }

  return "";
}

async function request(path: string) {
  const token = getAuthToken();

  const response = await fetch(apiUrl(path), {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(token
        ? { Authorization: `Bearer ${token}` }
        : {})
    }
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || data?.ok === false) {
    throw new Error(
      data?.error ||
      data?.message ||
      `HTTP ${response.status}`
    );
  }

  return data;
}

function daysLeft(value?: string | null) {
  if (!value) return null;

  return Math.round((Date.parse(String(value).slice(0,10)+"T00:00:00Z")-Date.parse(new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Berlin",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())+"T00:00:00Z"))/86400000);
}

export default function Maschinenverwaltung() {
  const [params, setParams] = useSearchParams();

  const area = String(
    params.get("bereich") || ""
  );

  const resolveTab = (): Tab => {
    if (area === "maschinen") return "maschinen";
    if (area === "fristen") return "fristen";
    if (area === "wartung") return "wartung";
    if (area === "einsatz") return "einsatz";
    if (area === "kosten") return "kosten";
    return "overview";
  };

  const [tab, setTab] =
    React.useState<Tab>(resolveTab);

  const [actualCost,setActualCost]=React.useState(0),[maintenanceIncluded,setMaintenanceIncluded]=React.useState(false);
  const [maintenanceDirty,setMaintenanceDirty]=React.useState(false);
  const [machines, setMachines] =
    React.useState<Machine[]>([]);

  const [loading, setLoading] =
    React.useState(false);

  const [error, setError] =
    React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [data,costs] = await Promise.all([request("/api/resource-costs/machines"),request("/api/resource-costs/machine-costs")]);
      setActualCost(Number(costs.totals?.totalCost||0));setMaintenanceIncluded(!!costs.maintenanceIncluded);

      setMachines(
        Array.isArray(data?.items)
          ? data.items
          : []
      );
    } catch (e: any) {
      setError(
        e?.message ||
        "Maschinendaten konnten nicht geladen werden."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    setTab(resolveTab());
  }, [area]);

  const open = (next: Tab) => {
    if(tab==="wartung"&&next!==tab&&maintenanceDirty&&!window.confirm("Ungespeicherte Wartung verwerfen?"))return;
    setTab(next);

    const nextParams =
      new URLSearchParams(params);

    if (next === "overview") {
      nextParams.delete("bereich");
    } else {
      nextParams.set("bereich", next);
    }

    setParams(nextParams);
  };

  const dueMachines = machines.filter(
    (machine) => {
      const days = daysLeft(
        machine.nextService
      );

      return (
        machine.status === "Wartung" ||
        (days !== null && days <= 14)
      );
    }
  );

  const operating = machines.filter(
    (machine) =>
      machine.status !== "Außer Betrieb"
  ).length;

  const assignedProjects = new Set(
    machines
      .map((machine) => machine.projectId)
      .filter(Boolean)
  ).size;

  const hourlyCost = machines.reduce(
    (sum, machine) =>
      sum +
      Number(machine.hourlyRate || 0),
    0
  );

  const operatingValue = machines.reduce(
    (sum, machine) =>
      sum +
      Number(machine.hours || 0) *
        Number(machine.hourlyRate || 0),
    0
  );

  const cards = [
    {
      key: "maschinen" as Tab,
      title: "Maschinen",
      value: machines.length,
      text: `${operating} aktiv`
    },
    {
      key: "wartung" as Tab,
      title: "Wartung",
      value: dueMachines.length,
      text: "fällig oder innerhalb 14 Tagen"
    },
    {
      key: "einsatz" as Tab,
      title: "Einsatz",
      value: assignedProjects,
      text: "zugeordnete Projekte"
    },
    {
      key: "kosten" as Tab,
      title: "Kosten",
      value: `${hourlyCost.toFixed(2)} €`,
      text: "Summe hinterlegte Stundensätze"
    }
  ];

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <style>{`
        .maschinen-hub-module {
          display: grid;
          gap: 12px;
        }

        .maschinen-hub-module .rlc-page-hero {
          display: none !important;
        }

        .maschinen-hub-module > div {
          margin-top: 0 !important;
        }
      `}</style>
      <section className="rlc-page-hero rlc-page-hero--split">
        <div>
          <div className="rlc-page-hero__eyebrow">
            Verwaltung · Maschinen
          </div>

          <h1 style={{ margin: "3px 0 4px" }}>
            Maschinenverwaltung
          </h1>

          <div style={{ opacity: 0.9 }}>
            Maschinen, Wartung, Einsatz und Kosten zentral steuern.
          </div>
        </div>

        <div className="rlc-page-hero__actions">
          <button
            className="rlc-page-hero__button"
            onClick={() => void load()}
          >
            Aktualisieren
          </button>
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
        {[
          ["overview", "Übersicht"],
          ["maschinen", "Maschinen"],
          ["wartung", "Wartung"],
          ["fristen", "Fristen / Prüfungen"],
          ["einsatz", "Einsatz"],
          ["kosten", "Kosten"]
        ].map(([key, label]) => (
          <button
            key={key}
            className={
              tab === key
                ? "btn btn-primary"
                : "btn"
            }
            onClick={() =>
              open(key as Tab)
            }
          >
            {label}
          </button>
        ))}
      </section>

      {error && (
        <div
          className="card"
          style={{ color: "#b42318" }}
        >
          {error}
        </div>
      )}

      {tab === "overview" && (
        <>
          <section
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(4,minmax(0,1fr))",
              gap: 10
            }}
          >
            {cards.map((card) => (
              <button
                key={card.key}
                className="card"
                onClick={() =>
                  open(card.key)
                }
                style={{
                  minHeight: 130,
                  textAlign: "left",
                  cursor: "pointer",
                  background: "#fff",
                  border:
                    "1px solid #dbe3ee"
                }}
              >
                <div className="muted">
                  {card.title}
                </div>

                <div
                  style={{
                    fontSize: 27,
                    fontWeight: 800,
                    marginTop: 6
                  }}
                >
                  {card.value}
                </div>

                <div
                  className="muted"
                  style={{ marginTop: 7 }}
                >
                  {card.text}
                </div>
              </button>
            ))}
          </section>

          <section
            style={{
              display: "grid",
              gridTemplateColumns:
                "1fr 1fr",
              gap: 12
            }}
          >
            <div className="card">
              <strong>
                Maschinenstatus
              </strong>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "1fr 1fr",
                  gap: 10,
                  marginTop: 12
                }}
              >
                <div>
                  <div className="muted">
                    Gesamt
                  </div>
                  <b style={{ fontSize: 24 }}>
                    {machines.length}
                  </b>
                </div>

                <div>
                  <div className="muted">
                    Aktiv
                  </div>
                  <b style={{ fontSize: 24 }}>
                    {operating}
                  </b>
                </div>

                <div>
                  <div className="muted">
                    Wartung fällig
                  </div>
                  <b style={{ fontSize: 24 }}>
                    {dueMachines.length}
                  </b>
                </div>

                <div>
                  <div className="muted">
                    Projekte
                  </div>
                  <b style={{ fontSize: 24 }}>
                    {assignedProjects}
                  </b>
                </div>
              </div>
            </div>

            <div className="card">
              <strong>
                Maschinenkosten
              </strong>

              <div
                style={{
                  fontSize: 28,
                  fontWeight: 800,
                  marginTop: 12
                }}
              >
                {actualCost.toFixed(2)} €
              </div>

              <div className="muted">
                Gebuchte Geräteeinsätze{maintenanceIncluded?" und erledigte Wartungen im Firmenbericht":" in den zugänglichen Projekten"}.
              </div>

              <button
                className="btn"
                style={{ marginTop: 12 }}
                onClick={() =>
                  open("kosten")
                }
              >
                Kosten öffnen
              </button>
            </div>
          </section>
        </>
      )}

      {tab === "maschinen" && (
        <div className="maschinen-hub-module">
          <MaschinenCore />
        </div>
      )}

      {tab === "einsatz" && (
        <div className="maschinen-hub-module">
          <Einsatzplanung />
        </div>
      )}

      {tab === "fristen" && <MachineDeadlines />}
      {tab === "wartung" && (
        <div className="maschinen-hub-module">
          <MaschinenWartung onDirtyChange={setMaintenanceDirty} />
        </div>
      )}

      {tab === "kosten" && (
        <div className="maschinen-hub-module">
          <MaschinenKosten />
        </div>
      )}

      {loading && (
        <div className="muted">
          Maschinendaten werden geladen…
        </div>
      )}
    </div>
  );
}
