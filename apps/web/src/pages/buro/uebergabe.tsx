import React from "react";
import { apiUrl } from "../../lib/apiBase";

type HandoverItem = {
  id: string;
  handoverId: string;
  text: string;
  status: string;
  note?: string | null;
};

type HandoverSignature = {
  id: string;
  role: string;
  name?: string | null;
  signedAt?: string | null;
  imageData?: string | null;
};

type HandoverAttachment = {
  id: string;
  name: string;
  mime: string;
  size: number;
};

type HandoverDoc = {
  id: string;
  title: string;
  projectId?: string | null;
  client?: string | null;
  address?: string | null;
  date?: string | null;
  status: string;
  notes?: string | null;
  items?: HandoverItem[];
  signatures?: HandoverSignature[];
  attachments?: HandoverAttachment[];
  legalMeta?: any;
};

type Draft = {
  id: string;
  title: string;
  projectId: string;
  client: string;
  address: string;
  date: string;
  status: string;
  notes: string;
  legalMeta: any;
};

function getToken() {
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

async function request(path: string, init: RequestInit = {}) {
  const token = getToken();

  const response = await fetch(apiUrl(path), {
    credentials: "include",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...(token
        ? { Authorization: `Bearer ${token}` }
        : {}),
      ...(init.headers || {})
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

function dateInput(value?: string | null) {
  return value ? String(value).slice(0, 10) : "";
}

function fileToDataURL(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const field: React.CSSProperties = {
  width: "100%",
  border: "1px solid #d7deea",
  borderRadius: 7,
  padding: "8px 9px",
  background: "#fff",
  fontSize: 13
};

export default function Uebergabe() {
  const [all, setAll] =
    React.useState<HandoverDoc[]>([]);

  const [selectedId, setSelectedId] =
    React.useState<string | null>(null);

  const [draft, setDraft] =
    React.useState<Draft | null>(null);

  const [dirty, setDirty] =
    React.useState(false);

  const [query, setQuery] =
    React.useState("");

  const [projectFilter, setProjectFilter] =
    React.useState("");

  const [loading, setLoading] =
    React.useState(false);

  const [saving, setSaving] =
    React.useState(false);

  const [error, setError] =
    React.useState("");

  const fileInput =
    React.useRef<HTMLInputElement | null>(null);

  const selected = React.useMemo(
    () =>
      all.find((x) => x.id === selectedId) || null,
    [all, selectedId]
  );

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await request("/api/handover");

      const items =
        Array.isArray(data?.items)
          ? data.items
          : [];

      setAll(items);

      setSelectedId((current) =>
        current &&
        items.some((x: HandoverDoc) => x.id === current)
          ? current
          : items[0]?.id || null
      );
    } catch (e: any) {
      setError(
        e?.message ||
        "Übergaben konnten nicht geladen werden."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (!selected) {
      setDraft(null);
      setDirty(false);
      return;
    }

    setDraft({
      id: selected.id,
      title: selected.title || "",
      projectId: selected.projectId || "",
      client: selected.client || "",
      address: selected.address || "",
      date: dateInput(selected.date),
      status: selected.status || "ENTWURF",
      notes: selected.notes || "",
      legalMeta: {
        contractBasis: "", acceptanceType: "", completionNoticeDate: "", acceptanceRequestDate: "", acceptanceDeadline: "", useStartDate: "",
        consumer: false, bgbConsequenceNoticeTextForm: false, refusalReason: "", knownDefectsReserved: false, defectRightsReservedText: "", contractualPenaltyReserved: false,
        contractorObjections: "", expertName: "", copyDeliveredToBoth: false, conditionAssessmentJoint: false, conditionAssessmentDate: "", unilateralConditionAssessmentReason: "", partialAcceptanceScope: "", legalNote: "",
        ...(selected.legalMeta || {})
      }
    });

    setDirty(false);
  }, [selected]);

  const patchDraft = (
    patch: Partial<Draft>
  ) => {
    if (selected?.status === "ABGESCHLOSSEN") return;
    setDraft((current) =>
      current
        ? { ...current, ...patch }
        : current
    );
    setDirty(true);
  };

  const create = async () => {
    const result = await request(
      "/api/handover",
      {
        method: "POST",
        body: JSON.stringify({
          title: "Abnahme",
          status: "ENTWURF",
          date: new Date().toISOString()
        })
      }
    );

    await load();

    if (result?.item?.id) {
      setSelectedId(result.item.id);
    }
  };

  const save = async () => {
    if (!draft) return;

    setSaving(true);

    try {
      await request(
        `/api/handover/${draft.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            ...draft,
            date: draft.date
              ? `${draft.date}T12:00:00.000Z`
              : null
          })
        }
      );

      await load();
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const openPdf = async () => {
    if (!selected) return;

    const data = await request(
      `/api/handover/${selected.id}/pdf`
    );

    if (data?.pdfUrl) {
      window.open(apiUrl(data.pdfUrl), "_blank");
    }
  };

  const finalize = async () => {
    if (!selected) return;

    if (!selected.projectId) {
      alert("Bitte zuerst ein Projekt zuweisen.");
      return;
    }

    if (dirty) {
      await save();
    }

    if (!confirm("Abnahme wirklich abschließen und PDF erzeugen?")) {
      return;
    }

    const data = await request(
      `/api/handover/${selected.id}/finalize`,
      {
        method: "POST"
      }
    );

    await load();

    if (data?.pdfUrl) {
      window.open(apiUrl(data.pdfUrl), "_blank");
    }
  };

  const remove = async () => {
    if (!selected) return;

    if (!confirm("Protokoll wirklich löschen?")) {
      return;
    }

    await request(
      `/api/handover/${selected.id}`,
      {
        method: "DELETE"
      }
    );

    setSelectedId(null);
    await load();
  };

  const addItem = async () => {
    if (!selected) return;

    await request(
      `/api/handover/${selected.id}/items`,
      {
        method: "POST",
        body: JSON.stringify({
          text: "Neuer Punkt",
          status: "OPEN"
        })
      }
    );

    await load();
  };

  const updateItem = async (
    item: HandoverItem,
    patch: Partial<HandoverItem>
  ) => {
    if (!selected) return;

    await request(
      `/api/handover/${selected.id}/items/${item.id}`,
      {
        method: "PUT",
        body: JSON.stringify({
          ...item,
          ...patch
        })
      }
    );

    await load();
  };

  const deleteItem = async (
    itemId: string
  ) => {
    if (!selected) return;

    await request(
      `/api/handover/${selected.id}/items/${itemId}`,
      {
        method: "DELETE"
      }
    );

    await load();
  };

  const addSignature = async (
    role: "AUFTRAGNEHMER" | "AUFTRAGGEBER"
  ) => {
    if (!selected) return;

    const input =
      document.createElement("input");

    input.type = "file";
    input.accept = "image/*";

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      const imageData =
        await fileToDataURL(file);

      const name =
        prompt(
          role === "AUFTRAGNEHMER"
            ? "Name Auftragnehmer:"
            : "Name Auftraggeber:",
          ""
        ) || "";

      await request(
        `/api/handover/${selected.id}/signatures`,
        {
          method: "POST",
          body: JSON.stringify({
            role,
            name,
            signedAt:
              new Date().toISOString(),
            imageData
          })
        }
      );

      await load();
    };

    input.click();
  };

  const uploadAttachment = async (
    file: File
  ) => {
    if (!selected) return;

    const form = new FormData();
    form.append("file", file);

    await request(
      `/api/handover/${selected.id}/attachments`,
      {
        method: "POST",
        body: form
      }
    );

    await load();
  };

  const openAttachment = async (
    attachment: HandoverAttachment
  ) => {
    if (!selected) return;

    const data = await request(
      `/api/handover/${selected.id}/attachments/${attachment.id}/open`
    );

    if (data?.url) {
      window.open(data.url, "_blank");
    }
  };

  const deleteAttachment = async (
    attachmentId: string
  ) => {
    if (!selected) return;

    await request(
      `/api/handover/${selected.id}/attachments/${attachmentId}`,
      {
        method: "DELETE"
      }
    );

    await load();
  };

  const filtered = React.useMemo(() => {
    const q =
      query.trim().toLowerCase();

    return all.filter((doc) => {
      const text = [
        doc.title,
        doc.projectId,
        doc.client,
        doc.address
      ]
        .join(" ")
        .toLowerCase();

      return (
        (!q || text.includes(q)) &&
        (!projectFilter ||
          doc.projectId === projectFilter)
      );
    });
  }, [all, query, projectFilter]);

  const projects = React.useMemo(
    () =>
      Array.from(
        new Set(
          all
            .map((x) => x.projectId)
            .filter(Boolean)
        )
      ) as string[],
    [all]
  );

  const completed = all.filter(
    (x) =>
      String(x.status).toUpperCase() ===
      "ABGESCHLOSSEN"
  ).length;

  const rejected = all.filter(
    (x) =>
      String(x.status).toUpperCase() ===
      "ABGELEHNT"
  ).length;

  const openItems = all.reduce(
    (sum, doc) =>
      sum +
      (doc.items || []).filter(
        (x) =>
          String(x.status).toUpperCase() !==
          "OK"
      ).length,
    0
  );

  const signatures =
    selected?.signatures || [];

  const contractorSign =
    signatures.find(
      (x) =>
        x.role === "AUFTRAGNEHMER"
    );

  const clientSign =
    signatures.find(
      (x) =>
        x.role === "AUFTRAGGEBER"
    );

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <section className="rlc-page-hero rlc-page-hero--split">
        <div>
          <div className="rlc-page-hero__eyebrow">
            Verwaltung · Baustellendokumentation
          </div>

          <h1 style={{ margin: "3px 0 4px" }}>
            Übergabe & Abnahme
          </h1>

          <div style={{ opacity: 0.9 }}>
            Abnahmen, Mängelpunkte, Unterschriften und Übergabeunterlagen zentral dokumentieren.
          </div>
        </div>

        <div className="rlc-page-hero__actions">
          <button
            className="rlc-page-hero__button"
            onClick={() => void create()}
          >
            + Protokoll
          </button>

          <button
            className="rlc-page-hero__button"
            onClick={() => void load()}
          >
            Aktualisieren
          </button>
        </div>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(4,minmax(0,1fr))",
          gap: 10
        }}
      >
        <div className="card">
          <div className="muted">
            Protokolle
          </div>
          <b style={{ fontSize: 24 }}>
            {all.length}
          </b>
        </div>

        <div className="card">
          <div className="muted">
            Abgeschlossen
          </div>
          <b style={{ fontSize: 24 }}>
            {completed}
          </b>
        </div>

        <div className="card">
          <div className="muted">
            Offene Punkte
          </div>
          <b style={{ fontSize: 24 }}>
            {openItems}
          </b>
        </div>

        <div className="card">
          <div className="muted">
            Abgelehnt
          </div>
          <b style={{ fontSize: 24 }}>
            {rejected}
          </b>
        </div>
      </section>

      <section
        className="card"
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center"
        }}
      >
        <input
          style={{
            ...field,
            maxWidth: 320
          }}
          placeholder="Suche Titel / Projekt / Auftraggeber..."
          value={query}
          onChange={(e) =>
            setQuery(e.target.value)
          }
        />

        <select
          style={{
            ...field,
            maxWidth: 200
          }}
          value={projectFilter}
          onChange={(e) =>
            setProjectFilter(
              e.target.value
            )
          }
        >
          <option value="">
            Alle Projekte
          </option>

          {projects.map((project) => (
            <option
              key={project}
              value={project}
            >
              {project}
            </option>
          ))}
        </select>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns:
            "minmax(360px,.7fr) minmax(700px,1.3fr)",
          gap: 12
        }}
      >
        <div className="card">
          <div
            style={{
              marginBottom: 10,
              paddingBottom: 10,
              borderBottom:
                "1px solid #e4eaf2"
            }}
          >
            <strong>
              Abnahmen / Übergaben
            </strong>
          </div>

          {filtered.map((doc) => {
            const total =
              doc.items?.length || 0;

            const done =
              doc.items?.filter(
                (x) =>
                  String(x.status).toUpperCase() ===
                  "OK"
              ).length || 0;

            return (
              <button
                key={doc.id}
                onClick={() =>
                  setSelectedId(doc.id)
                }
                style={{
                  width: "100%",
                  textAlign: "left",
                  border:
                    "1px solid #e4eaf2",
                  borderRadius: 8,
                  padding: 10,
                  marginBottom: 7,
                  background:
                    selectedId === doc.id
                      ? "#eff6ff"
                      : "#fff",
                  cursor: "pointer"
                }}
              >
                <b>{doc.title}</b>

                <div className="muted">
                  {doc.projectId || "Kein Projekt"}
                </div>

                <div className="muted">
                  {doc.client || "Kein Auftraggeber"}
                  {" · "}
                  {done}/{total} Punkte
                </div>
              </button>
            );
          })}

          {!filtered.length && (
            <div className="muted">
              Keine Protokolle.
            </div>
          )}
        </div>

        <div
          className="card"
          onDragOver={(e) =>
            e.preventDefault()
          }
          onDrop={(e) => {
            e.preventDefault();

            const file =
              e.dataTransfer.files?.[0];

            if (file) {
              void uploadAttachment(file);
            }
          }}
        >
          {!draft || !selected ? (
            <div className="muted">
              Protokoll auswählen oder neu anlegen.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
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
                    {draft.title}
                  </strong>

                  {dirty && (
                    <div
                      style={{
                        color: "#b54708",
                        fontSize: 11
                      }}
                    >
                      Ungespeicherte Änderungen
                    </div>
                  )}
                </div>

                <div style={{ flex: 1 }} />

                <button
                  className="btn"
                  onClick={() =>
                    void openPdf()
                  }
                  disabled={
                    selected.status !== "ABGESCHLOSSEN"
                  }
                >
                  PDF öffnen
                </button>

                <button
                  className="btn"
                  disabled={selected.status === "ABGESCHLOSSEN"}
                  onClick={() => void remove()}
                >
                  Löschen
                </button>

                <button
                  className="btn"
                  disabled={
                    selected.status === "ABGESCHLOSSEN"
                  }
                  onClick={() =>
                    void finalize()
                  }
                >
                  Abnahme abschließen
                </button>

                <button
                  className="btn btn-primary"
                  disabled={!dirty || saving || selected.status === "ABGESCHLOSSEN"}
                  onClick={() =>
                    void save()
                  }
                >
                  {saving
                    ? "Speichern…"
                    : "Speichern"}
                </button>
              </div>

              <div>
                <strong>
                  Grunddaten
                </strong>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "1fr 1fr",
                    gap: 9,
                    marginTop: 9
                  }}
                >
                  <div>
                    <label className="muted">
                      Titel
                    </label>
                    <input
                      style={field}
                      value={draft.title}
                      onChange={(e) =>
                        patchDraft({
                          title:
                            e.target.value
                        })
                      }
                    />
                  </div>

                  <div>
                    <label className="muted">
                      Projekt
                    </label>
                    <input
                      style={field}
                      value={draft.projectId}
                      onChange={(e) =>
                        patchDraft({
                          projectId:
                            e.target.value
                        })
                      }
                    />
                  </div>

                  <div>
                    <label className="muted">
                      Auftraggeber
                    </label>
                    <input
                      style={field}
                      value={draft.client}
                      onChange={(e) =>
                        patchDraft({
                          client:
                            e.target.value
                        })
                      }
                    />
                  </div>

                  <div>
                    <label className="muted">
                      Datum
                    </label>
                    <input
                      type="date"
                      style={field}
                      value={draft.date}
                      onChange={(e) =>
                        patchDraft({
                          date:
                            e.target.value
                        })
                      }
                    />
                  </div>

                  <div>
                    <label className="muted">
                      Adresse / Ort
                    </label>
                    <input
                      style={field}
                      value={draft.address}
                      onChange={(e) =>
                        patchDraft({
                          address:
                            e.target.value
                        })
                      }
                    />
                  </div>

                  <div>
                    <label className="muted">
                      Status
                    </label>

                    <select
                      style={field}
                      value={draft.status}
                      onChange={(e) =>
                        patchDraft({
                          status:
                            e.target.value
                        })
                      }
                    >
                      <option value="ENTWURF">
                        Entwurf
                      </option>
                      <option value="IM_GANGE">
                        Im Gange
                      </option>
                      <option value="ABGESCHLOSSEN">
                        Abgeschlossen
                      </option>
                      <option value="ABGELEHNT">
                        Abgelehnt
                      </option>
                    </select>
                  </div>
                </div>
              </div>

              <div style={{paddingTop:12,borderTop:"1px solid #e4eaf2",display:"grid",gap:10}}>
                <div><strong>Rechtsgrundlage / Abnahmeart</strong><div className="muted">BGB § 640 / § 650g bzw. VOB/B § 12 dokumentieren.</div></div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
                  <label><span className="muted">Vertragsgrundlage *</span><select style={field} disabled={selected.status==="ABGESCHLOSSEN"} value={draft.legalMeta.contractBasis||""} onChange={e=>patchDraft({legalMeta:{...draft.legalMeta,contractBasis:e.target.value}})}><option value="">Bitte wählen</option><option value="BGB">BGB</option><option value="VOBB">VOB/B</option><option value="OTHER">Sonstige</option></select></label>
                  <label><span className="muted">Art der Abnahme *</span><select style={field} disabled={selected.status==="ABGESCHLOSSEN"} value={draft.legalMeta.acceptanceType||""} onChange={e=>patchDraft({legalMeta:{...draft.legalMeta,acceptanceType:e.target.value}})}><option value="">Bitte wählen</option><option value="EXPRESS">Ausdrückliche Abnahme</option><option value="FORMAL">Förmliche Abnahme</option><option value="FICTITIOUS_BGB">Fiktive Abnahme – BGB</option><option value="FICTITIOUS_VOB_COMPLETION">Fiktive Abnahme – VOB/B Fertigstellungsmitteilung</option><option value="FICTITIOUS_VOB_USE">Fiktive Abnahme – VOB/B Benutzung</option><option value="REFUSED">Abnahme verweigert</option><option value="CONDITION_ASSESSMENT">Zustandsfeststellung §650g BGB</option><option value="PARTIAL">Teilabnahme</option></select></label>
                  <label><span className="muted">Aufforderung zur Abnahme</span><input type="date" style={field} disabled={selected.status==="ABGESCHLOSSEN"} value={(draft.legalMeta.acceptanceRequestDate||"").slice(0,10)} onChange={e=>patchDraft({legalMeta:{...draft.legalMeta,acceptanceRequestDate:e.target.value}})}/></label>
                  <label><span className="muted">Gesetzte Abnahmefrist</span><input type="date" style={field} disabled={selected.status==="ABGESCHLOSSEN"} value={(draft.legalMeta.acceptanceDeadline||"").slice(0,10)} onChange={e=>patchDraft({legalMeta:{...draft.legalMeta,acceptanceDeadline:e.target.value}})}/></label>
                  <label><span className="muted">Fertigstellungsmitteilung</span><input type="date" style={field} disabled={selected.status==="ABGESCHLOSSEN"} value={(draft.legalMeta.completionNoticeDate||"").slice(0,10)} onChange={e=>patchDraft({legalMeta:{...draft.legalMeta,completionNoticeDate:e.target.value}})}/></label>
                  <label><span className="muted">Beginn Benutzung</span><input type="date" style={field} disabled={selected.status==="ABGESCHLOSSEN"} value={(draft.legalMeta.useStartDate||"").slice(0,10)} onChange={e=>patchDraft({legalMeta:{...draft.legalMeta,useStartDate:e.target.value}})}/></label>
                  <label style={{display:"flex",gap:8,alignItems:"center"}}><input type="checkbox" disabled={selected.status==="ABGESCHLOSSEN"} checked={Boolean(draft.legalMeta.consumer)} onChange={e=>patchDraft({legalMeta:{...draft.legalMeta,consumer:e.target.checked}})}/> Auftraggeber ist Verbraucher</label>
                  <label style={{display:"flex",gap:8,alignItems:"center"}}><input type="checkbox" disabled={selected.status==="ABGESCHLOSSEN"} checked={Boolean(draft.legalMeta.bgbConsequenceNoticeTextForm)} onChange={e=>patchDraft({legalMeta:{...draft.legalMeta,bgbConsequenceNoticeTextForm:e.target.checked}})}/> Hinweis auf Folgen der Nichtabnahme in Textform erteilt</label>
                  <label style={{display:"flex",gap:8,alignItems:"center"}}><input type="checkbox" disabled={selected.status==="ABGESCHLOSSEN"} checked={Boolean(draft.legalMeta.knownDefectsReserved)} onChange={e=>patchDraft({legalMeta:{...draft.legalMeta,knownDefectsReserved:e.target.checked}})}/> Rechte wegen bekannter Mängel vorbehalten</label>
                  <label style={{display:"flex",gap:8,alignItems:"center"}}><input type="checkbox" disabled={selected.status==="ABGESCHLOSSEN"} checked={Boolean(draft.legalMeta.contractualPenaltyReserved)} onChange={e=>patchDraft({legalMeta:{...draft.legalMeta,contractualPenaltyReserved:e.target.checked}})}/> Vertragsstrafe vorbehalten</label>
                  <label><span className="muted">Vorbehalt bekannte Mängel</span><textarea style={{...field,minHeight:70}} disabled={selected.status==="ABGESCHLOSSEN"} value={draft.legalMeta.defectRightsReservedText||""} onChange={e=>patchDraft({legalMeta:{...draft.legalMeta,defectRightsReservedText:e.target.value}})}/></label>
                  <label><span className="muted">Grund Abnahmeverweigerung</span><textarea style={{...field,minHeight:70}} disabled={selected.status==="ABGESCHLOSSEN"} value={draft.legalMeta.refusalReason||""} onChange={e=>patchDraft({legalMeta:{...draft.legalMeta,refusalReason:e.target.value}})}/></label>
                  <label><span className="muted">Einwendungen Auftragnehmer</span><textarea style={{...field,minHeight:70}} disabled={selected.status==="ABGESCHLOSSEN"} value={draft.legalMeta.contractorObjections||""} onChange={e=>patchDraft({legalMeta:{...draft.legalMeta,contractorObjections:e.target.value}})}/></label>
                  <label><span className="muted">Sachverständiger</span><input style={field} disabled={selected.status==="ABGESCHLOSSEN"} value={draft.legalMeta.expertName||""} onChange={e=>patchDraft({legalMeta:{...draft.legalMeta,expertName:e.target.value}})}/></label>
                  <label style={{display:"flex",gap:8,alignItems:"center"}}><input type="checkbox" disabled={selected.status==="ABGESCHLOSSEN"} checked={Boolean(draft.legalMeta.copyDeliveredToBoth)} onChange={e=>patchDraft({legalMeta:{...draft.legalMeta,copyDeliveredToBoth:e.target.checked}})}/> Niederschrift beiden Parteien ausgehändigt</label>
                  <label><span className="muted">Datum Zustandsfeststellung</span><input type="date" style={field} disabled={selected.status==="ABGESCHLOSSEN"} value={(draft.legalMeta.conditionAssessmentDate||"").slice(0,10)} onChange={e=>patchDraft({legalMeta:{...draft.legalMeta,conditionAssessmentDate:e.target.value}})}/></label>
                  <label style={{display:"flex",gap:8,alignItems:"center"}}><input type="checkbox" disabled={selected.status==="ABGESCHLOSSEN"} checked={Boolean(draft.legalMeta.conditionAssessmentJoint)} onChange={e=>patchDraft({legalMeta:{...draft.legalMeta,conditionAssessmentJoint:e.target.checked}})}/> Zustandsfeststellung gemeinsam</label>
                  <label><span className="muted">Grund einseitige Zustandsfeststellung</span><textarea style={{...field,minHeight:70}} disabled={selected.status==="ABGESCHLOSSEN"} value={draft.legalMeta.unilateralConditionAssessmentReason||""} onChange={e=>patchDraft({legalMeta:{...draft.legalMeta,unilateralConditionAssessmentReason:e.target.value}})}/></label>
                  <label><span className="muted">Umfang Teilabnahme</span><textarea style={{...field,minHeight:70}} disabled={selected.status==="ABGESCHLOSSEN"} value={draft.legalMeta.partialAcceptanceScope||""} onChange={e=>patchDraft({legalMeta:{...draft.legalMeta,partialAcceptanceScope:e.target.value}})}/></label>
                  <label style={{gridColumn:"span 2"}}><span className="muted">Rechtliche / vertragliche Dokumentation</span><textarea style={{...field,minHeight:80}} disabled={selected.status==="ABGESCHLOSSEN"} value={draft.legalMeta.legalNote||""} onChange={e=>patchDraft({legalMeta:{...draft.legalMeta,legalNote:e.target.value}})}/></label>
                </div>
              </div>

              <div
                style={{
                  paddingTop: 12,
                  borderTop:
                    "1px solid #e4eaf2"
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center"
                  }}
                >
                  <div>
                    <strong>
                      Checkliste / Mängel
                    </strong>
                    <div className="muted">
                      Abnahmepunkte und offene Mängel.
                    </div>
                  </div>

                  <div style={{ flex: 1 }} />

                  <button
                    className="btn"
                    onClick={() =>
                      void addItem()
                    }
                  >
                    + Punkt
                  </button>
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: 7,
                    marginTop: 10
                  }}
                >
                  {(selected.items || []).map(
                    (item) => (
                      <div
                        key={item.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "120px 1.2fr 1fr 90px",
                          gap: 7,
                          alignItems: "center",
                          padding: 8,
                          border:
                            "1px solid #e4eaf2",
                          borderRadius: 8
                        }}
                      >
                        <select
                          style={field}
                          value={item.status}
                          onChange={(e) =>
                            void updateItem(
                              item,
                              {
                                status:
                                  e.target.value
                              }
                            )
                          }
                        >
                          <option value="OPEN">
                            Offen
                          </option>
                          <option value="MANGEL">
                            Mangel
                          </option>
                          <option value="OK">
                            Erledigt
                          </option>
                        </select>

                        <input
                          style={field}
                          defaultValue={
                            item.text
                          }
                          onBlur={(e) =>
                            void updateItem(
                              item,
                              {
                                text:
                                  e.target.value
                              }
                            )
                          }
                        />

                        <input
                          style={field}
                          placeholder="Bemerkung"
                          defaultValue={
                            item.note || ""
                          }
                          onBlur={(e) =>
                            void updateItem(
                              item,
                              {
                                note:
                                  e.target.value
                              }
                            )
                          }
                        />

                        <button
                          className="btn"
                          onClick={() =>
                            void deleteItem(
                              item.id
                            )
                          }
                        >
                          Entfernen
                        </button>
                      </div>
                    )
                  )}

                  {!selected.items?.length && (
                    <div className="muted">
                      Noch keine Abnahmepunkte.
                    </div>
                  )}
                </div>
              </div>

              <div
                style={{
                  paddingTop: 12,
                  borderTop:
                    "1px solid #e4eaf2"
                }}
              >
                <strong>
                  Unterschriften
                </strong>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "1fr 1fr",
                    gap: 10,
                    marginTop: 10
                  }}
                >
                  {[
                    {
                      title: "Auftragnehmer",
                      role:
                        "AUFTRAGNEHMER" as const,
                      signature:
                        contractorSign
                    },
                    {
                      title: "Auftraggeber",
                      role:
                        "AUFTRAGGEBER" as const,
                      signature:
                        clientSign
                    }
                  ].map((entry) => (
                    <div
                      key={entry.role}
                      style={{
                        border:
                          "1px solid #e4eaf2",
                        borderRadius: 8,
                        padding: 10
                      }}
                    >
                      <b>{entry.title}</b>

                      {entry.signature ? (
                        <>
                          <div
                            className="muted"
                            style={{
                              marginTop: 4
                            }}
                          >
                            {entry.signature.name ||
                              "Ohne Name"}
                          </div>

                          {entry.signature.imageData && (
                            <img
                              src={
                                entry.signature.imageData
                              }
                              alt={
                                entry.title
                              }
                              style={{
                                width: "100%",
                                maxHeight: 100,
                                objectFit:
                                  "contain",
                                marginTop: 8,
                                background:
                                  "#f8fafc",
                                borderRadius: 6
                              }}
                            />
                          )}
                        </>
                      ) : (
                        <div
                          className="muted"
                          style={{
                            marginTop: 5
                          }}
                        >
                          Noch nicht unterschrieben.
                        </div>
                      )}

                      <button
                        className="btn"
                        style={{
                          marginTop: 8
                        }}
                        onClick={() =>
                          void addSignature(
                            entry.role
                          )
                        }
                      >
                        Unterschrift hinzufügen
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div
                style={{
                  paddingTop: 12,
                  borderTop:
                    "1px solid #e4eaf2"
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center"
                  }}
                >
                  <div>
                    <strong>
                      Übergabeunterlagen
                    </strong>

                    <div className="muted">
                      Dateien hier ablegen oder auswählen.
                    </div>
                  </div>

                  <div style={{ flex: 1 }} />

                  <button
                    className="btn"
                    onClick={() =>
                      fileInput.current?.click()
                    }
                  >
                    + Datei
                  </button>

                  <input
                    ref={fileInput}
                    type="file"
                    hidden
                    onChange={(e) => {
                      const file =
                        e.target.files?.[0];

                      if (file) {
                        void uploadAttachment(
                          file
                        );
                      }

                      e.currentTarget.value =
                        "";
                    }}
                  />
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: 6,
                    marginTop: 10
                  }}
                >
                  {(selected.attachments || []).map(
                    (attachment) => (
                      <div
                        key={attachment.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: 8,
                          background:
                            "#f8fafc",
                          borderRadius: 7
                        }}
                      >
                        <b>
                          {attachment.name}
                        </b>

                        <span className="muted">
                          {Math.round(
                            Number(
                              attachment.size ||
                                0
                            ) / 1024
                          )}{" "}
                          KB
                        </span>

                        <div style={{ flex: 1 }} />

                        <button
                          className="btn"
                          onClick={() =>
                            void openAttachment(
                              attachment
                            )
                          }
                        >
                          Öffnen
                        </button>

                        <button
                          className="btn"
                          onClick={() =>
                            void deleteAttachment(
                              attachment.id
                            )
                          }
                        >
                          Entfernen
                        </button>
                      </div>
                    )
                  )}

                  {!selected.attachments?.length && (
                    <div className="muted">
                      Keine Übergabeunterlagen.
                    </div>
                  )}
                </div>
              </div>

              <div
                style={{
                  paddingTop: 12,
                  borderTop:
                    "1px solid #e4eaf2"
                }}
              >
                <label className="muted">
                  Abschlussbemerkungen
                </label>

                <textarea
                  style={{
                    ...field,
                    minHeight: 100,
                    resize: "vertical"
                  }}
                  value={draft.notes}
                  onChange={(e) =>
                    patchDraft({
                      notes:
                        e.target.value
                    })
                  }
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {error && (
        <div
          className="card"
          style={{ color: "#b42318" }}
        >
          {error}
        </div>
      )}

      {loading && (
        <div className="muted">
          Übergaben werden geladen…
        </div>
      )}
    </div>
  );
}