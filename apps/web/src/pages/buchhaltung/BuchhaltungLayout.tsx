import React, { useEffect, useState } from "react";

import {
  accountingApi,
  getAccountingProject,
  setAccountingProject
} from "./accountingApi";
import { NavLink, Outlet, useLocation } from "react-router-dom";

const groups = [
  {
    label: "Übersicht",
    items: [
      { to: "/buchhaltung", label: "Übersicht" }
    ]
  },
  {
    label: "Rechnungen",
    items: [
      { to: "/buchhaltung/rechnungen", label: "Ausgangsrechnungen" },
      { to: "/buchhaltung/abschlagsrechnungen", label: "Abschlagsrechnungen" },
      { to: "/buchhaltung/eingang", label: "Eingangsrechnungen" }
    ]
  },
  {
    label: "Zahlungen",
    items: [
      { to: "/buchhaltung/zahlungen", label: "Zahlungen & Offene Posten" },
      { to: "/buchhaltung/mahnwesen", label: "Mahnwesen" },
      { to: "/buchhaltung/kassenbuch", label: "Kassenbuch" },
      { to: "/buchhaltung/dauerbuchungen", label: "Dauerbuchungen" }
    ]
  },
  {
    label: "Kosten",
    items: [
      { to: "/buchhaltung/kostenuebersicht", label: "Kostenübersicht" },
      { to: "/buchhaltung/kostenstellen", label: "Kostenstellen" },
      { to: "/buchhaltung/lieferscheine", label: "Lieferscheine" }
    ]
  },
  {
    label: "Steuern & Export",
    items: [
      { to: "/buchhaltung/ust", label: "USt." },
      { to: "/buchhaltung/datev", label: "DATEV / Export" }
    ]
  }
];

export default function BuchhaltungLayout() {
  const location = useLocation();

  const [projects, setProjects] = useState<any[]>([]);
  const [accountingProject, setProject] =
    useState(getAccountingProject());

  useEffect(() => {
    accountingApi("/api/accounting/projects")
      .then((data) => {
        const list = data.items || [];
        setProjects(list);

        if (!getAccountingProject() && list.length) {
          const preferred =
            list.find((p: any) => p.code === "BA-2026-028") ||
            list[0];

          setAccountingProject(preferred.code);
          setProject(preferred.code);
        }
      })
      .catch(console.error);
  }, []);

  const changeProject = (value: string) => {
    setAccountingProject(value);
    setProject(value);
    window.location.reload();
  };

  return (
    <div className="rlc-accounting-page">
      <section className="rlc-page-hero rlc-page-hero--split">
        <div>
          <div className="rlc-page-hero__eyebrow">
            BUCHHALTUNG · FINANZEN
          </div>

          <h1>Buchhaltung</h1>

          <p>
            Rechnungen, Zahlungen, Kosten, Belege und steuerliche Auswertungen
            zentral verwalten.
          </p>
          <div
            style={{
              marginTop: 8,
              fontWeight: 700,
              fontSize: 13
            }}
          >
            Aktives Buchhaltungsprojekt: {getAccountingProject()}
          </div>
        </div>

        <div className="rlc-page-hero__actions">
          <label style={{
            display: "grid",
            gap: 5,
            minWidth: 260
          }}>
            <span style={{
              fontSize: 11,
              fontWeight: 800
            }}>
              Buchhaltungsprojekt
            </span>

            <select
              value={accountingProject}
              onChange={(e) => changeProject(e.target.value)}
              style={{
                minHeight: 40,
                borderRadius: 9,
                padding: "0 10px"
              }}
            >
              {projects.map((p: any) => (
                <option key={p.id} value={p.code}>
                  {p.code} · {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="card rlc-accounting-navigation">
        {groups.map((group) => (
          <div
            key={group.label}
            className="rlc-accounting-navigation__group"
          >
            <span className="rlc-accounting-navigation__label">
              {group.label}
            </span>

            <div className="rlc-accounting-navigation__items">
              {group.items.map((item) => {
                const active =
                  item.to === "/buchhaltung"
                    ? location.pathname === "/buchhaltung" ||
                      location.pathname === "/buchhaltung/"
                    : location.pathname.startsWith(item.to);

                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={
                      active
                        ? "rlc-accounting-tab is-active"
                        : "rlc-accounting-tab"
                    }
                  >
                    {item.label}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <div className="rlc-accounting-module">
        <Outlet />
      </div>
    </div>
  );
}