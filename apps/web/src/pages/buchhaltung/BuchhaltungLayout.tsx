import React, { useEffect, useState } from "react";

import {
  accountingApi,
  getAccountingProject,
  setAccountingProject
} from "./accountingApi";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";

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
      { to: "/buchhaltung/eingang", label: "Eingangsrechnungen" },
      { to: "/buchhaltung/belegpruefung", label: "Belegprüfung" }
    ]
  },
  {
    label: "Zahlungen",
    items: [
      { to: "/buchhaltung/zahlungen", label: "Zahlungen & Offene Posten" },
      { to: "/buchhaltung/zahlungsabgleich", label: "Zahlungsabgleich" },
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
      { to: "/buchhaltung/datev", label: "DATEV / Export" },
      { to: "/buchhaltung/reports", label: "Reports / Auswertungen" }
    ]
  }
];

export default function BuchhaltungLayout() {
  const location = useLocation();

  const [projects, setProjects] = useState<any[]>([]);
  const [accountingProject, setProject] =
    useState(getAccountingProject());

  const [loadingProjects, setLoadingProjects] = useState(true);
  const [projectError, setProjectError] = useState("");

  useEffect(() => {
    let mounted = true;
    accountingApi("/api/accounting/projects")
      .then((data) => {
        if (!mounted) return;
        const list = data.items || [];
        setProjects(list);
        const current = getAccountingProject();
        const valid = list.find((p: any) => p.code === current || p.id === current);
        const preferred = valid || list[0];
        if (preferred && (!valid || current !== preferred.code)) {
          setAccountingProject(preferred.code);
          setProject(preferred.code);
        } else if (!preferred) {
          setProject("");
        }
      })
      .catch((error) => {
        if (mounted) setProjectError(error?.message || "Projekte konnten nicht geladen werden.");
      })
      .finally(() => { if (mounted) setLoadingProjects(false); });
    return () => { mounted = false; };
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
            Aktives Buchhaltungsprojekt: {accountingProject || "Bitte wählen"}
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
              {!accountingProject && <option value="">Projekt wählen</option>}
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

      <section className="card rlc-accounting-connections">
        <strong>Verbundene Arbeitsbereiche</strong>
        <div className="rlc-page-toolbar" style={{ flexWrap: "wrap", marginTop: 9 }}>
          <Link className="btn" to="/kalkulation/angebot">Angebote</Link>
          <Link className="btn" to="/kalkulation/nachtraege">Nachträge</Link>
          <Link className="btn" to="/mengenermittlung/aufmasseditor">Aufmaß</Link>
          <Link className="btn" to="/buro/kontakte">Kunden & Lieferanten</Link>
          <Link className="btn" to="/mobile/abschlagsrechnungen">Mobile-Abschläge</Link>
          <Link className="btn" to="/buchhaltung/reports">Auswertungen</Link>
        </div>
      </section>
      <div className="rlc-accounting-module">
        {loadingProjects ? <div className="card">Buchhaltungsprojekte werden geladen …</div>
          : projectError ? <div className="card" role="alert">Projektzuordnung nicht prüfbar: {projectError}. Keine Buchhaltungsdaten werden automatisch geladen.</div>
          : !accountingProject || !projects.some((p: any) => p.code === accountingProject) ? <div className="card" role="alert">Kein gültiges Buchhaltungsprojekt ausgewählt.</div>
          : <Outlet />}
      </div>
    </div>
  );
}