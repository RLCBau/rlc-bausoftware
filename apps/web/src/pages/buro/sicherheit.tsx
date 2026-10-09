import React from "react";
import { useNavigate } from "react-router-dom";
import { apiUrl } from "../../lib/apiBase";

type Employee = {
  id: string;
  name: string;
};

type Project = {
  id: string;
  code?: string | null;
  name?: string | null;
};

type Instruction = {
  id: string;
  title: string;
  projectId?: string | null;
  date?: string | null;
  nextDate?: string | null;
  instructor?: string | null;
  notes?: string | null;
  participants?: Array<{
    id: string;
    employeeId: string;
    employee?: Employee;
  }>;
};

type Risk = {
  id: string;
  title: string;
  projectId?: string | null;
  activity?: string | null;
  hazard?: string | null;
  riskLevel: string;
  measures?: string | null;
  responsible?: string | null;
  dueDate?: string | null;
  status: string;
};

type Finding = {
  id: string;
  title: string;
  severity: string;
  measure?: string | null;
  responsible?: string | null;
  dueDate?: string | null;
  status: string;
};

type Inspection = {
  id: string;
  title: string;
  projectId?: string | null;
  date?: string | null;
  inspector?: string | null;
  status: string;
  notes?: string | null;
  findings?: Finding[];
};

type Ppe = {
  id: string;
  employeeId: string;
  employee?: Employee;
  type: string;
  itemName?: string | null;
  issuedAt?: string | null;
  nextCheck?: string | null;
  condition?: string | null;
  status: string;
  notes?: string | null;
};

type Permit = {
  id: string;
  title: string;
  projectId?: string | null;
  permitType: string;
  validFrom?: string | null;
  validUntil?: string | null;
  responsible?: string | null;
  status: string;
  notes?: string | null;
};

type Accident = {
  id: string; projectId?: string | null; employeeName: string; eventAt: string; knownAt?: string; location: string;
  eventDescription: string; injuryDescription: string; witnesses?: string; firstAidAt?: string; firstAidMeasures: string; firstAiderName: string;
  doctorTreatment?: boolean; doctorName?: string; incapacityDays?: number; fatal?: boolean; insurerName?: string; accidentReportSubmittedAt?: string | null;
  worksCouncilExists?: boolean; worksCouncilAcknowledgedBy?: string; sifaNotified?: boolean; occupationalDoctorNotified?: boolean; authorityCopySent?: boolean;
  notes?: string; status?: string; evidenceLock?: any; compliance?: any;
};

type BaustellvRecord = {
  projectId: string;
  projectCode?: string;
  projectName?: string;
  siteLocation: string;
  clientName: string;
  clientAddress: string;
  projectType: string;
  responsibleThirdParty?: string;
  coordinatorName?: string;
  coordinatorAddress?: string;
  plannedStart: string;
  plannedDurationDays: number;
  maxWorkers: number;
  employerCount: number;
  personDays: number;
  multipleEmployers: boolean;
  dangerousWork: boolean;
  selectedEmployers: string[];
  priorNoticeSubmittedAt?: string | null;
  priorNoticePosted: boolean;
  sigePlanExists: boolean;
  sigePlanUpdatedAt?: string | null;
  laterWorksDocumentExists: boolean;
  status: string;
};

type BaustellvCompliance = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  priorNoticeRequired: boolean;
  coordinatorRequired: boolean;
  sigePlanRequired: boolean;
  laterWorksDocumentRequired: boolean;
};

type Tab =
  | "overview"
  | "instructions"
  | "risks"
  | "inspections"
  | "ppe"
  | "permits"
  | "baustellv"
  | "accidents";

function authHeaders(): Record<string, string> {
  for (const key of [
    "rlc_token",
    "token",
    "authToken",
    "accessToken",
    "rlc_auth_token"
  ]) {
    const token =
      localStorage.getItem(key) ||
      sessionStorage.getItem(key);

    if (token?.trim()) {
      return {
        Authorization: `Bearer ${token.trim()}`
      };
    }
  }

  return {};
}

async function request(path: string, init?: RequestInit) {
  const response = await fetch(apiUrl(path), {
    credentials: "include",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...authHeaders(),
      ...(init?.headers || {})
    }
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || payload?.ok === false) {
    throw new Error(
      payload?.error ||
      payload?.message ||
      `HTTP ${response.status}`
    );
  }

  return payload;
}

function dateValue(value?: string | null) {
  return value ? String(value).slice(0, 10) : "";
}

function statusBadge(status: string) {
  const s = String(status || "").toUpperCase();

  if (["DONE", "CLOSED", "VALID", "ACTIVE"].includes(s)) {
    return {
      label:
        s === "DONE" || s === "CLOSED"
          ? "Erledigt"
          : "Aktiv",
      bg: "#ecfdf3",
      color: "#067647"
    };
  }

  if (["HIGH", "CRITICAL"].includes(s)) {
    return {
      label: s,
      bg: "#fee4e2",
      color: "#b42318"
    };
  }

  return {
    label: s || "Offen",
    bg: "#fffaeb",
    color: "#b54708"
  };
}

const field: React.CSSProperties = {
  width: "100%",
  border: "1px solid #d7deea",
  borderRadius: 7,
  padding: "8px 9px",
  fontSize: 13,
  background: "#fff"
};

export default function Sicherheit() {
  const navigate = useNavigate();

  const [tab, setTab] = React.useState<Tab>("overview");
  const [employees, setEmployees] = React.useState<Employee[]>([]);
  const [projects, setProjects] = React.useState<Project[]>([]);

  const [instructions, setInstructions] = React.useState<Instruction[]>([]);
  const [risks, setRisks] = React.useState<Risk[]>([]);
  const [inspections, setInspections] = React.useState<Inspection[]>([]);
  const [ppe, setPpe] = React.useState<Ppe[]>([]);
  const [permits, setPermits] = React.useState<Permit[]>([]);

  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const [instructionDraft, setInstructionDraft] = React.useState<Instruction | null>(null);
  const [instructionDirty, setInstructionDirty] = React.useState(false);
  const [participantToAdd, setParticipantToAdd] = React.useState("");

  const [riskDraft, setRiskDraft] = React.useState<Risk | null>(null);
  const [inspectionDraft, setInspectionDraft] = React.useState<Inspection | null>(null);
  const [ppeDraft, setPpeDraft] = React.useState<Ppe | null>(null);
  const [permitDraft, setPermitDraft] = React.useState<Permit | null>(null);

  const [riskDirty, setRiskDirty] = React.useState(false);
  const [inspectionDirty, setInspectionDirty] = React.useState(false);
  const [ppeDirty, setPpeDirty] = React.useState(false);
  const [permitDirty, setPermitDirty] = React.useState(false);
  const [baustellvProject, setBaustellvProject] = React.useState("");
  const [baustellvDraft, setBaustellvDraft] = React.useState<BaustellvRecord | null>(null);
  const [baustellvCompliance, setBaustellvCompliance] = React.useState<BaustellvCompliance | null>(null);
  const [baustellvDirty, setBaustellvDirty] = React.useState(false);
  const [accidents, setAccidents] = React.useState<Accident[]>([]);
  const [accidentDraft, setAccidentDraft] = React.useState<Accident | null>(null);
  const [accidentDirty, setAccidentDirty] = React.useState(false);
  const [accidentDenied, setAccidentDenied] = React.useState(false);

  const loadAll = React.useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [
        personal,
        projectData,
        instructionData,
        riskData,
        inspectionData,
        ppeData,
        permitData
      ] = await Promise.all([
        request("/api/personal/directory"),
        request("/api/projects"),
        request("/api/safety"),
        request("/api/safety/risk-assessments"),
        request("/api/safety/inspections"),
        request("/api/safety/ppe"),
        request("/api/safety/permits")
      ]);

      setEmployees(
        Array.isArray(personal?.items)
          ? personal.items
          : []
      );

      setProjects(
        Array.isArray(projectData?.projects)
          ? projectData.projects
          : []
      );

      setInstructions(
        Array.isArray(instructionData?.items)
          ? instructionData.items
          : []
      );

      setRisks(
        Array.isArray(riskData?.items)
          ? riskData.items
          : []
      );

      setInspections(
        Array.isArray(inspectionData?.items)
          ? inspectionData.items
          : []
      );

      setPpe(
        Array.isArray(ppeData?.items)
          ? ppeData.items
          : []
      );

      setPermits(
        Array.isArray(permitData?.items)
          ? permitData.items
          : []
      );
    } catch (e: any) {
      setError(
        e?.message ||
        "Sicherheitsdaten konnten nicht geladen werden."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const projectLabel = React.useCallback(
    (projectId?: string | null) => {
      if (!projectId) return "—";

      const p =
        projects.find(
          (x) =>
            x.id === projectId ||
            x.code === projectId
        );

      if (!p) return projectId;

      return `${p.code || p.id}${
        p.name ? ` · ${p.name}` : ""
      }`;
    },
    [projects]
  );

  const createInstruction = async () => {
    const result = await request("/api/safety", {
      method: "POST",
      body: JSON.stringify({
        title: "Neue Unterweisung"
      })
    });

    await loadAll();

    setInstructionDraft({
      ...result.item,
      participants: []
    });

    setInstructionDirty(false);
    setParticipantToAdd("");
    setTab("instructions");
  };

  const saveInstruction = async () => {
    if (!instructionDraft) return;

    await request(
      `/api/safety/${instructionDraft.id}`,
      {
        method: "PUT",
        body: JSON.stringify({
          title: instructionDraft.title,
          projectId: instructionDraft.projectId || null,
          instructor: instructionDraft.instructor || null,
          date: instructionDraft.date || null,
          nextDate: instructionDraft.nextDate || null,
          notes: instructionDraft.notes || null
        })
      }
    );

    await loadAll();
    setInstructionDirty(false);
  };

  const addInstructionParticipant = async () => {
    if (!instructionDraft || !participantToAdd) return;

    await request(
      `/api/safety/${instructionDraft.id}/participants`,
      {
        method: "POST",
        body: JSON.stringify({
          employeeId: participantToAdd
        })
      }
    );

    const data = await request("/api/safety");

    const updated = (data.items || []).find(
      (x: Instruction) =>
        x.id === instructionDraft.id
    );

    setInstructions(data.items || []);

    if (updated) {
      setInstructionDraft({
        ...updated,
        participants: [
          ...(updated.participants || [])
        ]
      });
    }

    setParticipantToAdd("");
  };

  const removeInstructionParticipant = async (
    employeeId: string
  ) => {
    if (!instructionDraft) return;

    await request(
      `/api/safety/${instructionDraft.id}/participants/${employeeId}`,
      {
        method: "DELETE"
      }
    );

    const data = await request("/api/safety");

    const updated = (data.items || []).find(
      (x: Instruction) =>
        x.id === instructionDraft.id
    );

    setInstructions(data.items || []);

    if (updated) {
      setInstructionDraft({
        ...updated,
        participants: [
          ...(updated.participants || [])
        ]
      });
    }
  };

  const createRisk = async () => {
    const result = await request(
      "/api/safety/risk-assessments",
      {
        method: "POST",
        body: JSON.stringify({})
      }
    );

    await loadAll();
    setRiskDraft(result.item);
    setRiskDirty(false);
    setTab("risks");
  };

  const saveRisk = async () => {
    if (!riskDraft) return;

    await request(
      `/api/safety/risk-assessments/${riskDraft.id}`,
      {
        method: "PUT",
        body: JSON.stringify(riskDraft)
      }
    );

    await loadAll();
    setRiskDirty(false);
  };

  const createInspection = async () => {
    const result = await request(
      "/api/safety/inspections",
      {
        method: "POST",
        body: JSON.stringify({})
      }
    );

    await loadAll();
    setInspectionDraft({
      ...result.item,
      findings: []
    });
    setInspectionDirty(false);
    setTab("inspections");
  };

  const saveInspection = async () => {
    if (!inspectionDraft) return;

    await request(
      `/api/safety/inspections/${inspectionDraft.id}`,
      {
        method: "PUT",
        body: JSON.stringify(inspectionDraft)
      }
    );

    await loadAll();
    setInspectionDirty(false);
  };

  const createPpe = async () => {
    const employee = employees[0];

    if (!employee) {
      alert("Kein Mitarbeiter vorhanden.");
      return;
    }

    const result = await request(
      "/api/safety/ppe",
      {
        method: "POST",
        body: JSON.stringify({
          employeeId: employee.id,
          type: "PSA"
        })
      }
    );

    await loadAll();
    setPpeDraft(result.item);
    setPpeDirty(false);
    setTab("ppe");
  };

  const savePpe = async () => {
    if (!ppeDraft) return;

    await request(
      `/api/safety/ppe/${ppeDraft.id}`,
      {
        method: "PUT",
        body: JSON.stringify(ppeDraft)
      }
    );

    await loadAll();
    setPpeDirty(false);
  };

  const createPermit = async () => {
    const result = await request(
      "/api/safety/permits",
      {
        method: "POST",
        body: JSON.stringify({})
      }
    );

    await loadAll();
    setPermitDraft(result.item);
    setPermitDirty(false);
    setTab("permits");
  };

  const savePermit = async () => {
    if (!permitDraft) return;

    await request(
      `/api/safety/permits/${permitDraft.id}`,
      {
        method: "PUT",
        body: JSON.stringify(permitDraft)
      }
    );

    await loadAll();
    setPermitDirty(false);
  };

  const loadBaustellv = async (projectToken: string) => {
    setBaustellvProject(projectToken);
    if (!projectToken) {
      setBaustellvDraft(null);
      setBaustellvCompliance(null);
      setBaustellvDirty(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await request(`/api/safety/baustellv/${encodeURIComponent(projectToken)}`);
      setBaustellvDraft(data.item || null);
      setBaustellvCompliance(data.compliance || null);
      setBaustellvDirty(false);
    } catch (e: any) {
      setError(e?.message || "BaustellV-Daten konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  };

  const saveBaustellv = async (finalize = false) => {
    if (!baustellvProject || !baustellvDraft) return;
    setError("");
    try {
      const payload = {
        ...baustellvDraft,
        status: finalize ? "FINAL" : baustellvDraft.status
      };
      const data = await request(`/api/safety/baustellv/${encodeURIComponent(baustellvProject)}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      setBaustellvDraft(data.item || payload);
      setBaustellvCompliance(data.compliance || null);
      setBaustellvDirty(false);
    } catch (e: any) {
      setError(e?.message || "BaustellV-Daten konnten nicht gespeichert werden.");
    }
  };

  const loadAccidents = React.useCallback(async () => {
    setAccidentDenied(false);
    try {
      const data = await request("/api/safety/accidents");
      const rows = Array.isArray(data?.items) ? data.items : [];
      setAccidents(rows);
      setAccidentDraft((current) => current ? rows.find((x: Accident) => x.id === current.id) || null : null);
    } catch (e: any) {
      if (String(e?.message || "").includes("Berechtigung") || String(e?.message || "").includes("403")) setAccidentDenied(true);
      else setError(e?.message || "Unfall-/Erste-Hilfe-Daten konnten nicht geladen werden.");
    }
  }, []);

  React.useEffect(() => { if (tab === "accidents") void loadAccidents(); }, [tab, loadAccidents]);

  const createAccident = async () => {
    const now = new Date().toISOString();
    const data = await request("/api/safety/accidents", {method:"POST",body:JSON.stringify({eventAt:now,knownAt:now,firstAidAt:now,employeeName:"",location:"",eventDescription:"",injuryDescription:"",firstAidMeasures:"",firstAiderName:"",incapacityDays:0})});
    await loadAccidents(); setAccidentDraft(data.item || null); setAccidentDirty(false);
  };
  const saveAccident = async (finalize=false) => {
    if (!accidentDraft) return;
    const data = await request(`/api/safety/accidents/${accidentDraft.id}`, {method:"PUT",body:JSON.stringify({...accidentDraft,status:finalize?"FINAL":accidentDraft.status||"OPEN"})});
    await loadAccidents(); setAccidentDraft(data.item || accidentDraft); setAccidentDirty(false);
  };
  const patchAccident = (patch: Partial<Accident>) => { if (!accidentDraft || accidentDraft.evidenceLock) return; setAccidentDraft({...accidentDraft,...patch}); setAccidentDirty(true); };

  const openCalendar = (
    title: string,
    date?: string | null,
    projectId?: string | null,
    sourceType?: string,
    sourceId?: string
  ) => {
    const startDate = new Date(
      date || new Date().toISOString()
    );

    const endDate = new Date(
      startDate.getTime() + 60 * 60 * 1000
    );

    sessionStorage.setItem(
      "rlc.calendar.prefill",
      JSON.stringify({
        projectId: projectId || "",
        title,
        category: "Sicherheit",
        sourceType,
        sourceId,
        start: startDate.toISOString(),
        end: endDate.toISOString()
      })
    );

    navigate("/buro/outlook?new=1");
  };

  const createTask = async (
    title: string,
    projectId?: string | null,
    due?: string | null,
    sourceType?: string,
    sourceId?: string
  ) => {
    if (!projectId) {
      alert("Bitte zuerst ein Projekt zuordnen.");
      return;
    }

    await request("/api/tasks", {
      method: "POST",
      body: JSON.stringify({
        projectId,
        title,
        due: due || null,
        priority: "high",
        tags: ["Sicherheit"],
        sourceType,
        sourceId
      })
    });

    navigate("/buro/tasks");
  };

  const cards = [
    {
      key: "instructions" as Tab,
      title: "Unterweisungen",
      value: instructions.length,
      text: "Mitarbeiterunterweisungen und Wiederholungstermine"
    },
    {
      key: "risks" as Tab,
      title: "Gefährdungen",
      value: risks.filter(
        (x) => x.status !== "DONE"
      ).length,
      text: "Gefährdungsbeurteilungen und Maßnahmen"
    },
    {
      key: "inspections" as Tab,
      title: "Begehungen",
      value: inspections.length,
      text: "Baustellenkontrollen und Sicherheitsmängel"
    },
    {
      key: "ppe" as Tab,
      title: "PSA / Nachweise",
      value: ppe.length,
      text: "PSA-Ausgabe, Prüfungen und Mitarbeiterzuordnung"
    },
    {
      key: "permits" as Tab,
      title: "Freigaben",
      value: permits.length,
      text: "Arbeitsfreigaben, Notfall- und Rettungsorganisation"
    },
    {
      key: "baustellv" as Tab,
      title: "BaustellV / SiGe",
      value: projects.length,
      text: "Vorankündigung, SiGeKo, SiGePlan und Baustellen-Unterlage"
    }
  ];

  return (
    <div className="rlc-safety-page">
      <section className="rlc-page-hero rlc-page-hero--split">
        <div>
          <div className="rlc-page-hero__eyebrow">
            Verwaltung · Arbeitssicherheit
          </div>

          <h1 style={{ margin: "3px 0 4px" }}>
            Sicherheit
          </h1>

          <div style={{ opacity: 0.9 }}>
            Unterweisungen, Gefährdungen, Begehungen, PSA und Freigaben zentral steuern.
          </div>
        </div>

        <div className="rlc-page-hero__actions">
          <button
            className="rlc-page-hero__button"
            onClick={() => void loadAll()}
          >
            Aktualisieren
          </button>
        </div>
      </section>

      <section
        className="card rlc-safety-tabs"
      >
        {[
          ["overview", "Übersicht"],
          ["instructions", "Unterweisungen"],
          ["risks", "Gefährdungen"],
          ["inspections", "Begehungen"],
          ["ppe", "PSA / Nachweise"],
          ["permits", "Freigaben"],
          ["baustellv", "BaustellV / SiGe"],
          ["accidents", "Unfall / Erste Hilfe"]
        ].map(([key, label]) => (
          <button
            key={key}
            className={
              tab === key
                ? "btn btn-primary"
                : "btn"
            }
            onClick={() =>
              setTab(key as Tab)
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
                "repeat(5,minmax(0,1fr))",
              gap: 10
            }}
          >
            {cards.map((card) => (
              <button
                key={card.key}
                className="card"
                onClick={() => setTab(card.key)}
                style={{
                  textAlign: "left",
                  cursor: "pointer",
                  border: "1px solid #dbe3ee",
                  background: "#fff"
                }}
              >
                <div className="muted">
                  {card.title}
                </div>

                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 800,
                    marginTop: 4
                  }}
                >
                  {card.value}
                </div>

                <div
                  className="muted"
                  style={{ marginTop: 6 }}
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
                Offene Sicherheitsmaßnahmen
              </strong>

              <div
                style={{
                  display: "grid",
                  gap: 8,
                  marginTop: 10
                }}
              >
                {risks
                  .filter((x) => x.status !== "DONE")
                  .slice(0, 6)
                  .map((risk) => (
                    <div
                      key={risk.id}
                      style={{
                        padding: 9,
                        border:
                          "1px solid #e4eaf2",
                        borderRadius: 8
                      }}
                    >
                      <b>{risk.title}</b>

                      <div className="muted">
                        {projectLabel(
                          risk.projectId
                        )}
                      </div>
                    </div>
                  ))}

                {!risks.length && (
                  <div className="muted">
                    Keine offenen Gefährdungsbeurteilungen.
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <strong>
                Offene Mängel aus Begehungen
              </strong>

              <div
                style={{
                  display: "grid",
                  gap: 8,
                  marginTop: 10
                }}
              >
                {inspections
                  .flatMap((inspection) =>
                    (inspection.findings || [])
                      .filter(
                        (finding) =>
                          finding.status !== "DONE"
                      )
                      .map((finding) => ({
                        inspection,
                        finding
                      }))
                  )
                  .slice(0, 6)
                  .map(({ inspection, finding }) => (
                    <div
                      key={finding.id}
                      style={{
                        padding: 9,
                        border:
                          "1px solid #e4eaf2",
                        borderRadius: 8
                      }}
                    >
                      <b>{finding.title}</b>

                      <div className="muted">
                        {inspection.title}
                      </div>
                    </div>
                  ))}

                {!inspections.some(
                  (inspection) =>
                    (inspection.findings || []).some(
                      (finding) =>
                        finding.status !== "DONE"
                    )
                ) && (
                  <div className="muted">
                    Keine offenen Mängel.
                  </div>
                )}
              </div>
            </div>
          </section>
        </>
      )}

      {tab === "instructions" && (
        <section
          style={{
            display: "grid",
            gridTemplateColumns:
              "minmax(380px,.8fr) minmax(540px,1.2fr)",
            gap: 12
          }}
        >
          <div className="card">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                marginBottom: 10
              }}
            >
              <div>
                <strong>Unterweisungen</strong>
                <div className="muted">
                  Mitarbeiterunterweisungen und Wiederholungstermine
                </div>
              </div>

              <div style={{ flex: 1 }} />

              <button
                className="btn btn-primary"
                onClick={() =>
                  void createInstruction()
                }
              >
                + Unterweisung
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gap: 7
              }}
            >
              {instructions.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setInstructionDraft({
                      ...item,
                      participants: [
                        ...(item.participants || [])
                      ]
                    });
                    setInstructionDirty(false);
                    setParticipantToAdd("");
                  }}
                  style={{
                    border: "1px solid #e4eaf2",
                    borderRadius: 8,
                    padding: 10,
                    background:
                      instructionDraft?.id === item.id
                        ? "#eff6ff"
                        : "#fff",
                    cursor: "pointer",
                    textAlign: "left"
                  }}
                >
                  <b>{item.title}</b>

                  <div className="muted">
                    {(item.participants || [])
                      .map(
                        (p) =>
                          p.employee?.name
                      )
                      .filter(Boolean)
                      .join(", ") ||
                      "Keine Teilnehmer"}
                  </div>

                  <div className="muted">
                    {projectLabel(
                      item.projectId
                    )}
                    {" · "}
                    Nächster Termin:{" "}
                    {dateValue(
                      item.nextDate
                    ) || "—"}
                  </div>
                </button>
              ))}

              {!instructions.length && (
                <div className="muted">
                  Keine Unterweisungen vorhanden.
                </div>
              )}
            </div>
          </div>

          <div className="card">
            {!instructionDraft ? (
              <div className="muted">
                Unterweisung auswählen oder neu anlegen.
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: 12
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    paddingBottom: 10,
                    borderBottom:
                      "1px solid #e4eaf2"
                  }}
                >
                  <div>
                    <strong
                      style={{ fontSize: 18 }}
                    >
                      {instructionDraft.title}
                    </strong>

                    {instructionDirty && (
                      <div
                        style={{
                          fontSize: 11,
                          color: "#b54708"
                        }}
                      >
                        Ungespeichert
                      </div>
                    )}
                  </div>

                  <div style={{ flex: 1 }} />

                  <button
                    className="btn"
                    onClick={() =>
                      openCalendar(
                        `Unterweisung – ${instructionDraft.title}`,
                        instructionDraft.nextDate ||
                          instructionDraft.date,
                        instructionDraft.projectId,
                        "safety",
                        instructionDraft.id
                      )
                    }
                  >
                    Kalender
                  </button>

                  <button
                    className="btn"
                    onClick={() =>
                      void createTask(
                        `Unterweisung: ${instructionDraft.title}`,
                        instructionDraft.projectId,
                        instructionDraft.nextDate,
                        "safety",
                        instructionDraft.id
                      )
                    }
                  >
                    Aufgabe
                  </button>

                  <button
                    className="btn btn-primary"
                    disabled={!instructionDirty}
                    onClick={() =>
                      void saveInstruction()
                    }
                  >
                    Speichern
                  </button>
                </div>

                <div>
                  <label className="muted">
                    Titel
                  </label>

                  <input
                    style={field}
                    value={
                      instructionDraft.title
                    }
                    onChange={(e) => {
                      setInstructionDraft({
                        ...instructionDraft,
                        title: e.target.value
                      });
                      setInstructionDirty(true);
                    }}
                  />
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "1fr 1fr",
                    gap: 10
                  }}
                >
                  <div>
                    <label className="muted">
                      Projekt
                    </label>

                    <select
                      style={field}
                      value={
                        instructionDraft.projectId ||
                        ""
                      }
                      onChange={(e) => {
                        setInstructionDraft({
                          ...instructionDraft,
                          projectId:
                            e.target.value
                        });
                        setInstructionDirty(true);
                      }}
                    >
                      <option value="">
                        Kein Projekt
                      </option>

                      {projects.map((p) => (
                        <option
                          key={p.id}
                          value={p.code || p.id}
                        >
                          {projectLabel(
                            p.code || p.id
                          )}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="muted">
                      Unterweisender
                    </label>

                    <input
                      style={field}
                      value={
                        instructionDraft.instructor ||
                        ""
                      }
                      onChange={(e) => {
                        setInstructionDraft({
                          ...instructionDraft,
                          instructor:
                            e.target.value
                        });
                        setInstructionDirty(true);
                      }}
                    />
                  </div>

                  <div>
                    <label className="muted">
                      Datum
                    </label>

                    <input
                      type="date"
                      style={field}
                      value={dateValue(
                        instructionDraft.date
                      )}
                      onChange={(e) => {
                        setInstructionDraft({
                          ...instructionDraft,
                          date:
                            e.target.value
                              ? `${e.target.value}T12:00:00.000Z`
                              : null
                        });
                        setInstructionDirty(true);
                      }}
                    />
                  </div>

                  <div>
                    <label className="muted">
                      Nächste Unterweisung
                    </label>

                    <input
                      type="date"
                      style={field}
                      value={dateValue(
                        instructionDraft.nextDate
                      )}
                      onChange={(e) => {
                        setInstructionDraft({
                          ...instructionDraft,
                          nextDate:
                            e.target.value
                              ? `${e.target.value}T12:00:00.000Z`
                              : null
                        });
                        setInstructionDirty(true);
                      }}
                    />
                  </div>
                </div>

                <div
                  style={{
                    borderTop:
                      "1px solid #e4eaf2",
                    paddingTop: 10
                  }}
                >
                  <strong>Teilnehmer</strong>

                  <div
                    style={{
                      display: "flex",
                      gap: 7,
                      marginTop: 8
                    }}
                  >
                    <select
                      style={field}
                      value={
                        participantToAdd
                      }
                      onChange={(e) =>
                        setParticipantToAdd(
                          e.target.value
                        )
                      }
                    >
                      <option value="">
                        Mitarbeiter wählen…
                      </option>

                      {employees
                        .filter(
                          (employee) =>
                            !(
                              instructionDraft.participants ||
                              []
                            ).some(
                              (participant) =>
                                participant.employeeId ===
                                employee.id
                            )
                        )
                        .map((employee) => (
                          <option
                            key={employee.id}
                            value={employee.id}
                          >
                            {employee.name}
                          </option>
                        ))}
                    </select>

                    <button
                      className="btn btn-primary"
                      disabled={
                        !participantToAdd
                      }
                      onClick={() =>
                        void addInstructionParticipant()
                      }
                    >
                      Hinzufügen
                    </button>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 7,
                      marginTop: 8
                    }}
                  >
                    {(instructionDraft.participants ||
                      []).map((participant) => (
                      <div
                        key={participant.id}
                        style={{
                          display: "flex",
                          gap: 7,
                          alignItems: "center",
                          border:
                            "1px solid #dbe3ee",
                          borderRadius: 999,
                          padding: "5px 9px"
                        }}
                      >
                        <button
                          style={{
                            border: 0,
                            background:
                              "transparent",
                            cursor: "pointer",
                            fontWeight: 650
                          }}
                          onClick={() =>
                            navigate(
                              `/buro/personalverwaltung?mitarbeiter=${encodeURIComponent(
                                participant.employee
                                  ?.name || ""
                              )}`
                            )
                          }
                        >
                          {participant.employee
                            ?.name ||
                            participant.employeeId}
                        </button>

                        <button
                          style={{
                            border: 0,
                            background:
                              "transparent",
                            cursor: "pointer"
                          }}
                          onClick={() =>
                            void removeInstructionParticipant(
                              participant.employeeId
                            )
                          }
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="muted">
                    Bemerkungen
                  </label>

                  <textarea
                    style={{
                      ...field,
                      minHeight: 100,
                      resize: "vertical"
                    }}
                    value={
                      instructionDraft.notes ||
                      ""
                    }
                    onChange={(e) => {
                      setInstructionDraft({
                        ...instructionDraft,
                        notes: e.target.value
                      });
                      setInstructionDirty(true);
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {tab === "risks" && (
        <section
          style={{
            display: "grid",
            gridTemplateColumns:
              "minmax(380px,.8fr) minmax(520px,1.2fr)",
            gap: 12
          }}
        >
          <div className="card">
            <div
              style={{
                display: "flex",
                marginBottom: 10
              }}
            >
              <strong>
                Gefährdungsbeurteilungen
              </strong>

              <div style={{ flex: 1 }} />

              <button
                className="btn btn-primary"
                onClick={() =>
                  void createRisk()
                }
              >
                + Neu
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gap: 7
              }}
            >
              {risks.map((risk) => {
                const badge =
                  statusBadge(risk.riskLevel);

                return (
                  <button
                    key={risk.id}
                    onClick={() => {
                      setRiskDraft({
                        ...risk
                      });
                      setRiskDirty(false);
                    }}
                    style={{
                      border:
                        "1px solid #e4eaf2",
                      borderRadius: 8,
                      padding: 9,
                      textAlign: "left",
                      background:
                        riskDraft?.id === risk.id
                          ? "#eff6ff"
                          : "#fff",
                      cursor: "pointer"
                    }}
                  >
                    <b>{risk.title}</b>

                    <div className="muted">
                      {projectLabel(
                        risk.projectId
                      )}
                    </div>

                    <span
                      style={{
                        display:
                          "inline-flex",
                        marginTop: 5,
                        padding: "2px 7px",
                        borderRadius: 999,
                        background:
                          badge.bg,
                        color:
                          badge.color,
                        fontSize: 11,
                        fontWeight: 700
                      }}
                    >
                      {badge.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="card">
            {!riskDraft ? (
              <div className="muted">
                Gefährdungsbeurteilung auswählen.
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: 10
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center"
                  }}
                >
                  <strong
                    style={{
                      fontSize: 18
                    }}
                  >
                    {riskDraft.title}
                  </strong>

                  <div style={{ flex: 1 }} />

                  <button
                    className="btn"
                    onClick={() =>
                      openCalendar(
                        `Gefährdung – ${riskDraft.title}`,
                        riskDraft.dueDate,
                        riskDraft.projectId,
                        "safety-risk",
                        riskDraft.id
                      )
                    }
                  >
                    Kalender
                  </button>

                  <button
                    className="btn"
                    onClick={() =>
                      void createTask(
                        `Sicherheitsmaßnahme: ${riskDraft.title}`,
                        riskDraft.projectId,
                        riskDraft.dueDate,
                        "safety-risk",
                        riskDraft.id
                      )
                    }
                  >
                    Aufgabe
                  </button>

                  <button
                    className="btn btn-primary"
                    disabled={!riskDirty}
                    onClick={() =>
                      void saveRisk()
                    }
                  >
                    Speichern
                  </button>
                </div>

                <input
                  style={field}
                  value={riskDraft.title}
                  onChange={(e) => {
                    setRiskDraft({
                      ...riskDraft,
                      title: e.target.value
                    });
                    setRiskDirty(true);
                  }}
                />

                <select
                  style={field}
                  value={
                    riskDraft.projectId || ""
                  }
                  onChange={(e) => {
                    setRiskDraft({
                      ...riskDraft,
                      projectId:
                        e.target.value
                    });
                    setRiskDirty(true);
                  }}
                >
                  <option value="">
                    Kein Projekt
                  </option>

                  {projects.map((p) => (
                    <option
                      key={p.id}
                      value={p.code || p.id}
                    >
                      {projectLabel(
                        p.code || p.id
                      )}
                    </option>
                  ))}
                </select>

                <input
                  style={field}
                  placeholder="Tätigkeit"
                  value={
                    riskDraft.activity || ""
                  }
                  onChange={(e) => {
                    setRiskDraft({
                      ...riskDraft,
                      activity:
                        e.target.value
                    });
                    setRiskDirty(true);
                  }}
                />

                <textarea
                  style={{
                    ...field,
                    minHeight: 80
                  }}
                  placeholder="Gefährdung"
                  value={
                    riskDraft.hazard || ""
                  }
                  onChange={(e) => {
                    setRiskDraft({
                      ...riskDraft,
                      hazard:
                        e.target.value
                    });
                    setRiskDirty(true);
                  }}
                />

                <select
                  style={field}
                  value={riskDraft.riskLevel}
                  onChange={(e) => {
                    setRiskDraft({
                      ...riskDraft,
                      riskLevel:
                        e.target.value
                    });
                    setRiskDirty(true);
                  }}
                >
                  <option value="LOW">
                    Niedrig
                  </option>
                  <option value="MEDIUM">
                    Mittel
                  </option>
                  <option value="HIGH">
                    Hoch
                  </option>
                  <option value="CRITICAL">
                    Kritisch
                  </option>
                </select>

                <textarea
                  style={{
                    ...field,
                    minHeight: 100
                  }}
                  placeholder="Schutzmaßnahmen"
                  value={
                    riskDraft.measures || ""
                  }
                  onChange={(e) => {
                    setRiskDraft({
                      ...riskDraft,
                      measures:
                        e.target.value
                    });
                    setRiskDirty(true);
                  }}
                />

                <input
                  style={field}
                  placeholder="Verantwortlich"
                  value={
                    riskDraft.responsible || ""
                  }
                  onChange={(e) => {
                    setRiskDraft({
                      ...riskDraft,
                      responsible:
                        e.target.value
                    });
                    setRiskDirty(true);
                  }}
                />

                <input
                  style={field}
                  type="date"
                  value={dateValue(
                    riskDraft.dueDate
                  )}
                  onChange={(e) => {
                    setRiskDraft({
                      ...riskDraft,
                      dueDate:
                        e.target.value
                          ? `${e.target.value}T12:00:00.000Z`
                          : null
                    });
                    setRiskDirty(true);
                  }}
                />
              </div>
            )}
          </div>
        </section>
      )}

      {tab === "inspections" && (
        <section
          style={{
            display: "grid",
            gridTemplateColumns:
              "minmax(380px,.8fr) minmax(520px,1.2fr)",
            gap: 12
          }}
        >
          <div className="card">
            <div
              style={{
                display: "flex",
                marginBottom: 10
              }}
            >
              <strong>
                Sicherheitsbegehungen
              </strong>

              <div style={{ flex: 1 }} />

              <button
                className="btn btn-primary"
                onClick={() =>
                  void createInspection()
                }
              >
                + Begehung
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gap: 7
              }}
            >
              {inspections.map(
                (inspection) => (
                  <button
                    key={inspection.id}
                    onClick={() => {
                      setInspectionDraft({
                        ...inspection,
                        findings: [
                          ...(inspection.findings ||
                            [])
                        ]
                      });
                      setInspectionDirty(false);
                    }}
                    style={{
                      border:
                        "1px solid #e4eaf2",
                      borderRadius: 8,
                      padding: 9,
                      textAlign: "left",
                      background:
                        inspectionDraft?.id ===
                        inspection.id
                          ? "#eff6ff"
                          : "#fff",
                      cursor: "pointer"
                    }}
                  >
                    <b>
                      {inspection.title}
                    </b>

                    <div className="muted">
                      {dateValue(
                        inspection.date
                      ) || "—"}
                    </div>

                    <div className="muted">
                      Offene Mängel:{" "}
                      {(inspection.findings ||
                        []).filter(
                        (f) =>
                          f.status !== "DONE"
                      ).length}
                    </div>
                  </button>
                )
              )}
            </div>
          </div>

          <div className="card">
            {!inspectionDraft ? (
              <div className="muted">
                Sicherheitsbegehung auswählen.
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: 10
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center"
                  }}
                >
                  <strong
                    style={{
                      fontSize: 18
                    }}
                  >
                    {inspectionDraft.title}
                  </strong>

                  <div style={{ flex: 1 }} />

                  <button
                    className="btn btn-primary"
                    disabled={
                      !inspectionDirty
                    }
                    onClick={() =>
                      void saveInspection()
                    }
                  >
                    Speichern
                  </button>
                </div>

                <input
                  style={field}
                  value={
                    inspectionDraft.title
                  }
                  onChange={(e) => {
                    setInspectionDraft({
                      ...inspectionDraft,
                      title: e.target.value
                    });
                    setInspectionDirty(true);
                  }}
                />

                <select
                  style={field}
                  value={
                    inspectionDraft.projectId ||
                    ""
                  }
                  onChange={(e) => {
                    setInspectionDraft({
                      ...inspectionDraft,
                      projectId:
                        e.target.value
                    });
                    setInspectionDirty(true);
                  }}
                >
                  <option value="">
                    Kein Projekt
                  </option>

                  {projects.map((p) => (
                    <option
                      key={p.id}
                      value={p.code || p.id}
                    >
                      {projectLabel(
                        p.code || p.id
                      )}
                    </option>
                  ))}
                </select>

                <input
                  style={field}
                  type="date"
                  value={dateValue(
                    inspectionDraft.date
                  )}
                  onChange={(e) => {
                    setInspectionDraft({
                      ...inspectionDraft,
                      date:
                        e.target.value
                          ? `${e.target.value}T12:00:00.000Z`
                          : null
                    });
                    setInspectionDirty(true);
                  }}
                />

                <input
                  style={field}
                  placeholder="Prüfer / Begehender"
                  value={
                    inspectionDraft.inspector ||
                    ""
                  }
                  onChange={(e) => {
                    setInspectionDraft({
                      ...inspectionDraft,
                      inspector:
                        e.target.value
                    });
                    setInspectionDirty(true);
                  }}
                />

                <div
                  style={{
                    borderTop:
                      "1px solid #e4eaf2",
                    paddingTop: 10
                  }}
                >
                  <strong>
                    Festgestellte Mängel
                  </strong>

                  <div
                    style={{
                      display: "grid",
                      gap: 7,
                      marginTop: 8
                    }}
                  >
                    {(inspectionDraft.findings ||
                      []).map((finding) => (
                      <div
                        key={finding.id}
                        style={{
                          padding: 8,
                          border:
                            "1px solid #e4eaf2",
                          borderRadius: 8
                        }}
                      >
                        <b>{finding.title}</b>
                        <div className="muted">
                          {finding.severity}
                          {" · "}
                          {finding.status}
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    className="btn"
                    style={{ marginTop: 8 }}
                    onClick={async () => {
                      const result =
                        await request(
                          `/api/safety/inspections/${inspectionDraft.id}/findings`,
                          {
                            method: "POST",
                            body: JSON.stringify({
                              title:
                                "Neuer Sicherheitsmangel"
                            })
                          }
                        );

                      await loadAll();

                      setInspectionDraft(
                        (current) =>
                          current
                            ? {
                                ...current,
                                findings: [
                                  ...(current.findings ||
                                    []),
                                  result.item
                                ]
                              }
                            : current
                      );
                    }}
                  >
                    + Mangel
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {tab === "ppe" && (
        <section
          style={{
            display: "grid",
            gridTemplateColumns:
              "minmax(380px,.8fr) minmax(520px,1.2fr)",
            gap: 12
          }}
        >
          <div className="card">
            <div
              style={{
                display: "flex",
                marginBottom: 10
              }}
            >
              <strong>
                PSA / Nachweise
              </strong>

              <div style={{ flex: 1 }} />

              <button
                className="btn btn-primary"
                onClick={() =>
                  void createPpe()
                }
              >
                + PSA
              </button>
            </div>

            {ppe.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setPpeDraft({
                    ...item
                  });
                  setPpeDirty(false);
                }}
                style={{
                  width: "100%",
                  border:
                    "1px solid #e4eaf2",
                  borderRadius: 8,
                  padding: 9,
                  textAlign: "left",
                  background:
                    ppeDraft?.id === item.id
                      ? "#eff6ff"
                      : "#fff",
                  cursor: "pointer",
                  marginBottom: 7
                }}
              >
                <b>
                  {item.employee?.name ||
                    "Mitarbeiter"}
                </b>

                <div className="muted">
                  {item.type}
                  {item.itemName
                    ? ` · ${item.itemName}`
                    : ""}
                </div>

                <div className="muted">
                  Nächste Prüfung:{" "}
                  {dateValue(
                    item.nextCheck
                  ) || "—"}
                </div>
              </button>
            ))}
          </div>

          <div className="card">
            {!ppeDraft ? (
              <div className="muted">
                PSA-Nachweis auswählen.
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: 10
                }}
              >
                <div
                  style={{
                    display: "flex"
                  }}
                >
                  <strong
                    style={{
                      fontSize: 18
                    }}
                  >
                    PSA / Nachweis
                  </strong>

                  <div style={{ flex: 1 }} />

                  <button
                    className="btn"
                    onClick={() =>
                      navigate(
                        `/buro/personalverwaltung?mitarbeiter=${encodeURIComponent(
                          ppeDraft.employee
                            ?.name || ""
                        )}`
                      )
                    }
                  >
                    Personalakte
                  </button>

                  <button
                    className="btn btn-primary"
                    disabled={!ppeDirty}
                    onClick={() =>
                      void savePpe()
                    }
                  >
                    Speichern
                  </button>
                </div>

                <select
                  style={field}
                  value={ppeDraft.employeeId}
                  disabled
                >
                  {employees.map((e) => (
                    <option
                      key={e.id}
                      value={e.id}
                    >
                      {e.name}
                    </option>
                  ))}
                </select>

                <select
                  style={field}
                  value={ppeDraft.type}
                  onChange={(e) => {
                    setPpeDraft({
                      ...ppeDraft,
                      type: e.target.value
                    });
                    setPpeDirty(true);
                  }}
                >
                  <option value="PSA">
                    PSA
                  </option>
                  <option value="PSAGA">
                    PSAgA
                  </option>
                  <option value="ATEMSCHUTZ">
                    Atemschutz
                  </option>
                  <option value="GEHOERSCHUTZ">
                    Gehörschutz
                  </option>
                  <option value="SCHUTZKLEIDUNG">
                    Schutzkleidung
                  </option>
                  <option value="SONSTIG">
                    Sonstiger Nachweis
                  </option>
                </select>

                <input
                  style={field}
                  placeholder="Bezeichnung / Artikel"
                  value={
                    ppeDraft.itemName || ""
                  }
                  onChange={(e) => {
                    setPpeDraft({
                      ...ppeDraft,
                      itemName:
                        e.target.value
                    });
                    setPpeDirty(true);
                  }}
                />

                <input
                  style={field}
                  type="date"
                  value={dateValue(
                    ppeDraft.issuedAt
                  )}
                  onChange={(e) => {
                    setPpeDraft({
                      ...ppeDraft,
                      issuedAt:
                        e.target.value
                          ? `${e.target.value}T12:00:00.000Z`
                          : null
                    });
                    setPpeDirty(true);
                  }}
                />

                <input
                  style={field}
                  type="date"
                  value={dateValue(
                    ppeDraft.nextCheck
                  )}
                  onChange={(e) => {
                    setPpeDraft({
                      ...ppeDraft,
                      nextCheck:
                        e.target.value
                          ? `${e.target.value}T12:00:00.000Z`
                          : null
                    });
                    setPpeDirty(true);
                  }}
                />

                <input
                  style={field}
                  placeholder="Zustand"
                  value={
                    ppeDraft.condition || ""
                  }
                  onChange={(e) => {
                    setPpeDraft({
                      ...ppeDraft,
                      condition:
                        e.target.value
                    });
                    setPpeDirty(true);
                  }}
                />
              </div>
            )}
          </div>
        </section>
      )}

      {tab === "permits" && (
        <section
          style={{
            display: "grid",
            gridTemplateColumns:
              "minmax(380px,.8fr) minmax(520px,1.2fr)",
            gap: 12
          }}
        >
          <div className="card">
            <div
              style={{
                display: "flex",
                marginBottom: 10
              }}
            >
              <strong>
                Freigaben / Notfall
              </strong>

              <div style={{ flex: 1 }} />

              <button
                className="btn btn-primary"
                onClick={() =>
                  void createPermit()
                }
              >
                + Freigabe
              </button>
            </div>

            {permits.map((permit) => (
              <button
                key={permit.id}
                onClick={() => {
                  setPermitDraft({
                    ...permit
                  });
                  setPermitDirty(false);
                }}
                style={{
                  width: "100%",
                  border:
                    "1px solid #e4eaf2",
                  borderRadius: 8,
                  padding: 9,
                  textAlign: "left",
                  background:
                    permitDraft?.id ===
                    permit.id
                      ? "#eff6ff"
                      : "#fff",
                  cursor: "pointer",
                  marginBottom: 7
                }}
              >
                <b>{permit.title}</b>
                <div className="muted">
                  {permit.permitType}
                </div>
                <div className="muted">
                  {projectLabel(
                    permit.projectId
                  )}
                </div>
              </button>
            ))}
          </div>

          <div className="card">
            {!permitDraft ? (
              <div className="muted">
                Freigabe auswählen.
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: 10
                }}
              >
                <div
                  style={{
                    display: "flex"
                  }}
                >
                  <strong
                    style={{
                      fontSize: 18
                    }}
                  >
                    {permitDraft.title}
                  </strong>

                  <div style={{ flex: 1 }} />

                  <button
                    className="btn"
                    onClick={() =>
                      openCalendar(
                        permitDraft.title,
                        permitDraft.validUntil,
                        permitDraft.projectId,
                        "safety-permit",
                        permitDraft.id
                      )
                    }
                  >
                    Kalender
                  </button>

                  <button
                    className="btn btn-primary"
                    disabled={!permitDirty}
                    onClick={() =>
                      void savePermit()
                    }
                  >
                    Speichern
                  </button>
                </div>

                <input
                  style={field}
                  value={permitDraft.title}
                  onChange={(e) => {
                    setPermitDraft({
                      ...permitDraft,
                      title: e.target.value
                    });
                    setPermitDirty(true);
                  }}
                />

                <select
                  style={field}
                  value={
                    permitDraft.permitType
                  }
                  onChange={(e) => {
                    setPermitDraft({
                      ...permitDraft,
                      permitType:
                        e.target.value
                    });
                    setPermitDirty(true);
                  }}
                >
                  <option value="ARBEITSFREIGABE">
                    Arbeitsfreigabe
                  </option>
                  <option value="ZUTRITTSFREIGABE">
                    Zutrittsfreigabe
                  </option>
                  <option value="HEISSARBEIT">
                    Heißarbeit
                  </option>
                  <option value="GRABEN">
                    Graben / Einstieg
                  </option>
                  <option value="HOEHE">
                    Arbeiten in Höhe
                  </option>
                  <option value="NOTFALLPLAN">
                    Notfall- / Rettungsplan
                  </option>
                </select>

                <select
                  style={field}
                  value={
                    permitDraft.projectId ||
                    ""
                  }
                  onChange={(e) => {
                    setPermitDraft({
                      ...permitDraft,
                      projectId:
                        e.target.value
                    });
                    setPermitDirty(true);
                  }}
                >
                  <option value="">
                    Kein Projekt
                  </option>

                  {projects.map((p) => (
                    <option
                      key={p.id}
                      value={p.code || p.id}
                    >
                      {projectLabel(
                        p.code || p.id
                      )}
                    </option>
                  ))}
                </select>

                <input
                  style={field}
                  placeholder="Verantwortlich"
                  value={
                    permitDraft.responsible ||
                    ""
                  }
                  onChange={(e) => {
                    setPermitDraft({
                      ...permitDraft,
                      responsible:
                        e.target.value
                    });
                    setPermitDirty(true);
                  }}
                />

                <input
                  style={field}
                  type="date"
                  value={dateValue(
                    permitDraft.validFrom
                  )}
                  onChange={(e) => {
                    setPermitDraft({
                      ...permitDraft,
                      validFrom:
                        e.target.value
                          ? `${e.target.value}T12:00:00.000Z`
                          : null
                    });
                    setPermitDirty(true);
                  }}
                />

                <input
                  style={field}
                  type="date"
                  value={dateValue(
                    permitDraft.validUntil
                  )}
                  onChange={(e) => {
                    setPermitDraft({
                      ...permitDraft,
                      validUntil:
                        e.target.value
                          ? `${e.target.value}T12:00:00.000Z`
                          : null
                    });
                    setPermitDirty(true);
                  }}
                />

                <textarea
                  style={{
                    ...field,
                    minHeight: 100
                  }}
                  placeholder="Bemerkungen / Freigabebedingungen"
                  value={
                    permitDraft.notes || ""
                  }
                  onChange={(e) => {
                    setPermitDraft({
                      ...permitDraft,
                      notes:
                        e.target.value
                    });
                    setPermitDirty(true);
                  }}
                />
              </div>
            )}
          </div>
        </section>
      )}

      {tab === "baustellv" && (
        <section className="card" style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <strong style={{ fontSize: 18 }}>BaustellV / SiGe-Nachweis</strong>
              <div className="muted">Prüfung nach BaustellV §§ 2–3 und Anhang I.</div>
            </div>
            <div style={{ flex: 1 }} />
            <select style={{ ...field, width: 340 }} value={baustellvProject} onChange={(e) => void loadBaustellv(e.target.value)}>
              <option value="">Projekt auswählen</option>
              {projects.map((p) => <option key={p.id} value={p.code || p.id}>{projectLabel(p.code || p.id)}</option>)}
            </select>
            <button className="btn" disabled={!baustellvDraft || !baustellvDirty} onClick={() => void saveBaustellv(false)}>Speichern</button>
            <button className="btn btn-primary" disabled={!baustellvDraft || Boolean(baustellvCompliance && !baustellvCompliance.valid)} onClick={() => void saveBaustellv(true)}>Nachweis abschließen</button>
          </div>

          {baustellvCompliance && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 8 }}>
              {[
                ["Vorankündigung", baustellvCompliance.priorNoticeRequired],
                ["Koordinator", baustellvCompliance.coordinatorRequired],
                ["SiGePlan", baustellvCompliance.sigePlanRequired],
                ["Unterlage spätere Arbeiten", baustellvCompliance.laterWorksDocumentRequired]
              ].map(([label, required]) => (
                <div key={String(label)} style={{ border: "1px solid #dbe3ee", borderRadius: 8, padding: 10, background: required ? "#fff7ed" : "#f8fafc" }}>
                  <b>{String(label)}</b><div className="muted">{required ? "erforderlich" : "derzeit nicht erforderlich"}</div>
                </div>
              ))}
            </div>
          )}

          {baustellvCompliance?.errors?.length ? <div style={{ border: "1px solid #fecaca", background: "#fef2f2", borderRadius: 8, padding: 10, color: "#991b1b" }}><b>Fehlende Pflichtangaben</b><ul>{baustellvCompliance.errors.map((x) => <li key={x}>{x}</li>)}</ul></div> : null}
          {baustellvCompliance?.warnings?.length ? <div style={{ border: "1px solid #fde68a", background: "#fffbeb", borderRadius: 8, padding: 10 }}><b>Hinweise</b><ul>{baustellvCompliance.warnings.map((x) => <li key={x}>{x}</li>)}</ul></div> : null}

          {!baustellvDraft ? <div className="muted">Bitte ein Projekt auswählen.</div> : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 10 }}>
              {[
                ["siteLocation","Ort der Baustelle"],
                ["clientName","Bauherr"],
                ["clientAddress","Anschrift Bauherr"],
                ["projectType","Art des Bauvorhabens"],
                ["responsibleThirdParty","Verantwortlicher Dritter"],
                ["coordinatorName","SiGe-Koordinator"],
                ["coordinatorAddress","Anschrift Koordinator"]
              ].map(([key,label]) => <label key={key} style={{ display:"grid", gap:4 }}><span className="muted">{label}</span><input style={field} value={String((baustellvDraft as any)[key] || "")} onChange={(e)=>{setBaustellvDraft({...baustellvDraft,[key]:e.target.value});setBaustellvDirty(true);}} /></label>)}

              <label style={{display:"grid",gap:4}}><span className="muted">Voraussichtlicher Beginn</span><input style={field} type="date" value={String(baustellvDraft.plannedStart||"").slice(0,10)} onChange={(e)=>{setBaustellvDraft({...baustellvDraft,plannedStart:e.target.value});setBaustellvDirty(true);}} /></label>
              {[
                ["plannedDurationDays","Dauer Arbeitstage"],
                ["maxWorkers","Max. Beschäftigte"],
                ["employerCount","Arbeitgeber / Unternehmer"],
                ["personDays","Personentage"]
              ].map(([key,label]) => <label key={key} style={{display:"grid",gap:4}}><span className="muted">{label}</span><input style={field} type="number" min={0} value={Number((baustellvDraft as any)[key]||0)} onChange={(e)=>{setBaustellvDraft({...baustellvDraft,[key]:Number(e.target.value||0)});setBaustellvDirty(true);}} /></label>)}

              <label style={{display:"flex",gap:8,alignItems:"center"}}><input type="checkbox" checked={baustellvDraft.multipleEmployers} onChange={(e)=>{setBaustellvDraft({...baustellvDraft,multipleEmployers:e.target.checked});setBaustellvDirty(true);}} /> Mehrere Arbeitgeber tätig</label>
              <label style={{display:"flex",gap:8,alignItems:"center"}}><input type="checkbox" checked={baustellvDraft.dangerousWork} onChange={(e)=>{setBaustellvDraft({...baustellvDraft,dangerousWork:e.target.checked});setBaustellvDirty(true);}} /> Besonders gefährliche Arbeiten (Anhang II)</label>
              <label style={{display:"flex",gap:8,alignItems:"center"}}><input type="checkbox" checked={baustellvDraft.priorNoticePosted} onChange={(e)=>{setBaustellvDraft({...baustellvDraft,priorNoticePosted:e.target.checked});setBaustellvDirty(true);}} /> Vorankündigung ausgehängt</label>
              <label style={{display:"flex",gap:8,alignItems:"center"}}><input type="checkbox" checked={baustellvDraft.sigePlanExists} onChange={(e)=>{setBaustellvDraft({...baustellvDraft,sigePlanExists:e.target.checked});setBaustellvDirty(true);}} /> SiGePlan vorhanden</label>
              <label style={{display:"flex",gap:8,alignItems:"center"}}><input type="checkbox" checked={baustellvDraft.laterWorksDocumentExists} onChange={(e)=>{setBaustellvDraft({...baustellvDraft,laterWorksDocumentExists:e.target.checked});setBaustellvDirty(true);}} /> Unterlage spätere Arbeiten vorhanden</label>

              <label style={{display:"grid",gap:4}}><span className="muted">Vorankündigung übermittelt am</span><input style={field} type="date" value={String(baustellvDraft.priorNoticeSubmittedAt||"").slice(0,10)} onChange={(e)=>{setBaustellvDraft({...baustellvDraft,priorNoticeSubmittedAt:e.target.value||null});setBaustellvDirty(true);}} /></label>
              <label style={{display:"grid",gap:4}}><span className="muted">SiGePlan zuletzt aktualisiert</span><input style={field} type="date" value={String(baustellvDraft.sigePlanUpdatedAt||"").slice(0,10)} onChange={(e)=>{setBaustellvDraft({...baustellvDraft,sigePlanUpdatedAt:e.target.value||null});setBaustellvDirty(true);}} /></label>
              <label style={{display:"grid",gap:4,gridColumn:"span 3"}}><span className="muted">Bereits ausgewählte Arbeitgeber / Unternehmer (eine Zeile je Firma)</span><textarea style={{...field,minHeight:90}} value={(baustellvDraft.selectedEmployers||[]).join("\n")} onChange={(e)=>{setBaustellvDraft({...baustellvDraft,selectedEmployers:e.target.value.split(/\n/).map(x=>x.trim()).filter(Boolean)});setBaustellvDirty(true);}} /></label>
            </div>
          )}
        </section>
      )}

      {tab === "accidents" && (
        <section style={{display:"grid",gridTemplateColumns:"minmax(320px,.65fr) minmax(680px,1.35fr)",gap:12}}>
          {accidentDenied ? <div className="card" style={{gridColumn:"span 2",color:"#b42318"}}><b>Zugriff geschützt</b><div className="muted">Unfall- und Erste-Hilfe-Daten enthalten Gesundheitsdaten und sind nur für berechtigte Administratoren verfügbar.</div></div> : <>
          <div className="card">
            <div style={{display:"flex",alignItems:"center",marginBottom:10}}><div><strong>Unfall / Erste Hilfe</strong><div className="muted">DGUV-Dokumentation · vertraulich</div></div><div style={{flex:1}}/><button className="btn btn-primary" onClick={()=>void createAccident()}>+ Eintrag</button></div>
            {accidents.map(a => <button key={a.id} onClick={()=>{setAccidentDraft(a);setAccidentDirty(false);}} style={{width:"100%",textAlign:"left",padding:9,marginBottom:6,border:"1px solid #e4eaf2",borderRadius:8,background:accidentDraft?.id===a.id?"#eff6ff":"#fff"}}><b>{a.employeeName||"Ohne Name"}</b><div className="muted">{dateValue(a.eventAt)} · {a.location||"Ort fehlt"} {a.compliance?.reportable?"· meldepflichtig":""} {a.evidenceLock?"· abgeschlossen":""}</div></button>)}
          </div>
          <div className="card">{!accidentDraft ? <div className="muted">Eintrag auswählen oder neu anlegen.</div> : <div style={{display:"grid",gap:10}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}><div><strong style={{fontSize:18}}>Erste-Hilfe-/Unfallnachweis</strong><div className="muted">Aufbewahrung 5 Jahre · Gesundheitsdaten geschützt</div></div><div style={{flex:1}}/>{accidentDraft.evidenceLock?<span style={{fontSize:11,color:"#067647"}}>gesperrt</span>:null}<button className="btn" disabled={!accidentDirty||Boolean(accidentDraft.evidenceLock)} onClick={()=>void saveAccident(false)}>Speichern</button><button className="btn btn-primary" disabled={Boolean(accidentDraft.evidenceLock)||Boolean(accidentDraft.compliance&&!accidentDraft.compliance.valid)} onClick={()=>void saveAccident(true)}>Nachweis abschließen</button></div>
            {accidentDraft.compliance?.reportable ? <div style={{padding:10,borderRadius:8,border:"1px solid #fecaca",background:"#fef2f2"}}><b>Unfallanzeige nach §193 SGB VII erforderlich</b><div className="muted">Frist: {dateValue(accidentDraft.compliance.reportDeadline)} · mehr als 3 Tage arbeitsunfähig oder Todesfall.</div></div> : null}
            {accidentDraft.compliance?.errors?.length ? <div style={{padding:10,borderRadius:8,border:"1px solid #fecaca",color:"#991b1b"}}><ul>{accidentDraft.compliance.errors.map((x:string)=><li key={x}>{x}</li>)}</ul></div> : null}
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:9}}>
              <label><span className="muted">Projekt</span><select style={field} disabled={Boolean(accidentDraft.evidenceLock)} value={accidentDraft.projectId||""} onChange={e=>patchAccident({projectId:e.target.value||null})}><option value="">Kein Projekt</option>{projects.map(p=><option key={p.id} value={p.code||p.id}>{projectLabel(p.code||p.id)}</option>)}</select></label>
              <label><span className="muted">Verletzte / erkrankte Person *</span><input style={field} disabled={Boolean(accidentDraft.evidenceLock)} value={accidentDraft.employeeName||""} onChange={e=>patchAccident({employeeName:e.target.value})}/></label>
              <label><span className="muted">Ereignis Datum/Uhrzeit *</span><input type="datetime-local" style={field} disabled={Boolean(accidentDraft.evidenceLock)} value={String(accidentDraft.eventAt||"").slice(0,16)} onChange={e=>patchAccident({eventAt:e.target.value})}/></label>
              <label><span className="muted">Ort *</span><input style={field} disabled={Boolean(accidentDraft.evidenceLock)} value={accidentDraft.location||""} onChange={e=>patchAccident({location:e.target.value})}/></label>
              <label><span className="muted">Unfall-/Ereignishergang *</span><textarea style={{...field,minHeight:80}} disabled={Boolean(accidentDraft.evidenceLock)} value={accidentDraft.eventDescription||""} onChange={e=>patchAccident({eventDescription:e.target.value})}/></label>
              <label><span className="muted">Art/Umfang Verletzung *</span><textarea style={{...field,minHeight:80}} disabled={Boolean(accidentDraft.evidenceLock)} value={accidentDraft.injuryDescription||""} onChange={e=>patchAccident({injuryDescription:e.target.value})}/></label>
              <label><span className="muted">Zeugen</span><input style={field} disabled={Boolean(accidentDraft.evidenceLock)} value={accidentDraft.witnesses||""} onChange={e=>patchAccident({witnesses:e.target.value})}/></label>
              <label><span className="muted">Ersthelfer/in *</span><input style={field} disabled={Boolean(accidentDraft.evidenceLock)} value={accidentDraft.firstAiderName||""} onChange={e=>patchAccident({firstAiderName:e.target.value})}/></label>
              <label><span className="muted">Erste-Hilfe-Maßnahmen *</span><textarea style={{...field,minHeight:80}} disabled={Boolean(accidentDraft.evidenceLock)} value={accidentDraft.firstAidMeasures||""} onChange={e=>patchAccident({firstAidMeasures:e.target.value})}/></label>
              <label><span className="muted">Arbeitsunfähigkeit (Tage)</span><input type="number" min={0} style={field} disabled={Boolean(accidentDraft.evidenceLock)} value={accidentDraft.incapacityDays||0} onChange={e=>patchAccident({incapacityDays:Number(e.target.value||0)})}/></label>
              <label style={{display:"flex",gap:8,alignItems:"center"}}><input type="checkbox" disabled={Boolean(accidentDraft.evidenceLock)} checked={Boolean(accidentDraft.fatal)} onChange={e=>patchAccident({fatal:e.target.checked})}/> Todesfall</label>
              <label style={{display:"flex",gap:8,alignItems:"center"}}><input type="checkbox" disabled={Boolean(accidentDraft.evidenceLock)} checked={Boolean(accidentDraft.doctorTreatment)} onChange={e=>patchAccident({doctorTreatment:e.target.checked})}/> ärztlich behandelt</label>
              <label><span className="muted">Arzt / D-Arzt</span><input style={field} disabled={Boolean(accidentDraft.evidenceLock)} value={accidentDraft.doctorName||""} onChange={e=>patchAccident({doctorName:e.target.value})}/></label>
              <label><span className="muted">Unfallversicherungsträger</span><input style={field} disabled={Boolean(accidentDraft.evidenceLock)} value={accidentDraft.insurerName||""} onChange={e=>patchAccident({insurerName:e.target.value})}/></label>
              <label><span className="muted">Unfallanzeige übermittelt am</span><input type="date" style={field} disabled={Boolean(accidentDraft.evidenceLock)} value={String(accidentDraft.accidentReportSubmittedAt||"").slice(0,10)} onChange={e=>patchAccident({accidentReportSubmittedAt:e.target.value||null})}/></label>
              <label style={{display:"flex",gap:8,alignItems:"center"}}><input type="checkbox" disabled={Boolean(accidentDraft.evidenceLock)} checked={Boolean(accidentDraft.worksCouncilExists)} onChange={e=>patchAccident({worksCouncilExists:e.target.checked})}/> Betriebs-/Personalrat vorhanden</label>
              <label><span className="muted">Kenntnisnahme Betriebs-/Personalrat</span><input style={field} disabled={Boolean(accidentDraft.evidenceLock)} value={accidentDraft.worksCouncilAcknowledgedBy||""} onChange={e=>patchAccident({worksCouncilAcknowledgedBy:e.target.value})}/></label>
              <label style={{display:"flex",gap:8,alignItems:"center"}}><input type="checkbox" disabled={Boolean(accidentDraft.evidenceLock)} checked={Boolean(accidentDraft.sifaNotified)} onChange={e=>patchAccident({sifaNotified:e.target.checked})}/> Fachkraft für Arbeitssicherheit informiert</label>
              <label style={{display:"flex",gap:8,alignItems:"center"}}><input type="checkbox" disabled={Boolean(accidentDraft.evidenceLock)} checked={Boolean(accidentDraft.occupationalDoctorNotified)} onChange={e=>patchAccident({occupationalDoctorNotified:e.target.checked})}/> Betriebsarzt informiert</label>
              <label style={{display:"flex",gap:8,alignItems:"center"}}><input type="checkbox" disabled={Boolean(accidentDraft.evidenceLock)} checked={Boolean(accidentDraft.authorityCopySent)} onChange={e=>patchAccident({authorityCopySent:e.target.checked})}/> Durchschrift Arbeitsschutzbehörde gesendet</label>
              <label style={{gridColumn:"span 2"}}><span className="muted">Bemerkungen</span><textarea style={{...field,minHeight:80}} disabled={Boolean(accidentDraft.evidenceLock)} value={accidentDraft.notes||""} onChange={e=>patchAccident({notes:e.target.value})}/></label>
            </div>
          </div>}</div>
          </>}
        </section>
      )}

      {loading && (
        <div className="muted">
          Sicherheitsdaten werden geladen…
        </div>
      )}
    </div>
  );
}
