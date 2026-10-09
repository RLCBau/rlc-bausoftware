import React from "react";

import { API_BASE } from "../../lib/apiBase";
import { useProject } from "../../store/useProject";
import {
  initDocument,
  uploadFileDirect
} from "../../api/files";

type ContractStatus =
  | "Entwurf"
  | "Aktiv"
  | "Läuft aus"
  | "Signiert"
  | "Beendet"
  | "Archiviert";

type ContractType =
  | "Bauvertrag"
  | "Nachunternehmervertrag"
  | "Liefervertrag"
  | "Mietvertrag"
  | "Wartungsvertrag"
  | "Arbeitsvertrag"
  | "Sonstige";

type ContractVersion = {
  id: string;
  version: number;
  createdAt?: string;
  uploadedBy?: string | null;
};

type ContractDocument = {
  id: string;
  name: string;
  kind?: string;
  currentVid?: string | null;
  updatedAt?: string;
  versions?: ContractVersion[];
};

type Contract = {
  id: string;
  companyId: string;
  projectId: string;
  documentId?: string | null;

  title: string;
  contractNumber?: string | null;
  partner?: string | null;
  contractType: ContractType;
  status: ContractStatus;

  valueNet: number;
  startDate?: string | null;
  endDate?: string | null;
  cancellationDays: number;

  notes?: string | null;
  tags: string[];

  createdAt?: string;
  updatedAt?: string;

  document?: ContractDocument | null;
};

function api(path: string) {
  return `${API_BASE}${path}`;
}

function getAuthToken(): string {
  try {
    const directKeys = [
      "rlc_token",
      "token",
      "authToken",
      "accessToken",
      "rlc_auth_token",
      "rlc_access_token",
      "rlc.auth.token",
      "rlc_mobile_token"
    ];

    for (const key of directKeys) {
      for (const storage of [localStorage, sessionStorage]) {
        const value = storage.getItem(key);
        if (value && value.trim()) return value.trim();
      }
    }

    const jsonKeys = [
      "rlc_auth",
      "auth",
      "user",
      "session",
      "rlc_session"
    ];

    for (const key of jsonKeys) {
      for (const storage of [localStorage, sessionStorage]) {
        const raw = storage.getItem(key);
        if (!raw) continue;

        try {
          const parsed = JSON.parse(raw);
          const token =
            parsed?.token ??
            parsed?.accessToken ??
            parsed?.authToken ??
            parsed?.jwt ??
            parsed?.data?.token ??
            parsed?.data?.accessToken;

          if (typeof token === "string" && token.trim()) {
            return token.trim();
          }
        } catch {}
      }
    }
  } catch {}

  return "";
}

async function request<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const token = getAuthToken();

  const res = await fetch(api(path), {
    credentials: "include",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body
        ? { "Content-Type": "application/json" }
        : {}),
      ...(token
        ? { Authorization: `Bearer ${token}` }
        : {}),
      ...(init?.headers || {})
    }
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(
      data?.error ||
      `HTTP ${res.status}`
    );
  }

  return data as T;
}

function money(value: number) {
  return Number(value || 0).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR"
  });
}

function dateInput(value?: string | null) {
  if (!value) return "";

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) {
    return "";
  }

  return d.toISOString().slice(0, 10);
}

function daysUntil(value?: string | null) {
  if (!value) return null;

  const end = new Date(value).getTime();

  if (!Number.isFinite(end)) {
    return null;
  }

  return Math.ceil(
    (end - Date.now()) /
    (1000 * 60 * 60 * 24)
  );
}

export default function Vertraege() {
  const { getSelectedProject } = useProject();
  const project = getSelectedProject();

  const projectId = String(project?.id || "").trim();
  const projectCode = String(project?.code || "").trim();

  const projectLabel =
    [projectCode, project?.name]
      .filter(Boolean)
      .join(" · ") ||
    projectId ||
    "—";

  const [all, setAll] = React.useState<Contract[]>([]);
  const [selectedId, setSelectedId] =
    React.useState<string | null>(null);

  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] =
    React.useState("ALL");
  const [typeFilter, setTypeFilter] =
    React.useState("ALL");

  const [loading, setLoading] =
    React.useState(false);
  const [saving, setSaving] =
    React.useState(false);
  const [error, setError] =
    React.useState("");

  const selected =
    all.find((row) => row.id === selectedId) ||
    null;

  const selectedLocked = Boolean(selected && selected.status !== "Entwurf");

  const load = React.useCallback(async () => {
    if (!projectId) {
      setAll([]);
      setSelectedId(null);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data = await request<{
        ok: true;
        items: Contract[];
      }>(
        `/api/contracts?projectId=${encodeURIComponent(projectId)}`
      );

      const rows = Array.isArray(data.items)
        ? data.items
        : [];

      setAll(rows);

      setSelectedId((current) => {
        if (
          current &&
          rows.some((row) => row.id === current)
        ) {
          return current;
        }

        return rows[0]?.id || null;
      });
    } catch (e: any) {
      setError(
        e?.message ||
        "Verträge konnten nicht geladen werden."
      );
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  function localPatch(values: Partial<Contract>) {
    if (!selectedId) return;

    setAll((rows) =>
      rows.map((row) =>
        row.id === selectedId
          ? { ...row, ...values }
          : row
      )
    );
  }

  async function savePatch(
    id: string,
    values: Partial<Contract>
  ) {
    setSaving(true);
    setError("");

    try {
      await request(
        `/api/contracts/${encodeURIComponent(id)}`,
        {
          method: "PUT",
          body: JSON.stringify(values)
        }
      );

    } catch (e: any) {
      setError(
        e?.message ||
        "Vertrag konnte nicht gespeichert werden."
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveContract() {
    if (!selected) return;

    await savePatch(selected.id, {
      title: selected.title,
      contractNumber: selected.contractNumber || "",
      partner: selected.partner || "",
      contractType: selected.contractType,
      status: selected.status,
      valueNet: Number(selected.valueNet || 0),
      startDate: selected.startDate || "",
      endDate: selected.endDate || "",
      cancellationDays: Number(selected.cancellationDays || 0),
      notes: selected.notes || "",
      tags: selected.tags || []
    });

    await load();
  }

  async function createContract() {
    if (!projectId) return;

    setSaving(true);
    setError("");

    try {
      const data = await request<{
        ok: true;
        item: Contract;
      }>("/api/contracts", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          title: "Neuer Vertrag",
          contractType: "Bauvertrag",
          status: "Entwurf",
          valueNet: 0,
          cancellationDays: 30,
          startDate:
            new Date().toISOString().slice(0, 10),
          tags: ["Vertrag"]
        })
      });

      await load();
      setSelectedId(data.item.id);
    } catch (e: any) {
      setError(
        e?.message ||
        "Vertrag konnte nicht angelegt werden."
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteContract() {
    if (!selected) return;
    const locked = selected.status !== "Entwurf";
    if (!window.confirm(locked ? `Vertrag "${selected.title}" archivieren?` : `Vertrag "${selected.title}" wirklich löschen?`)) return;
    setSaving(true); setError("");
    try {
      if (locked) {
        await request(`/api/contracts/${encodeURIComponent(selected.id)}`, { method:"PUT", body:JSON.stringify({status:"Archiviert"}) });
      } else {
        await request(`/api/contracts/${encodeURIComponent(selected.id)}`, { method:"DELETE" });
        setSelectedId(null);
      }
      await load();
    } catch (e:any) { setError(e?.message || (locked ? "Vertrag konnte nicht archiviert werden." : "Vertrag konnte nicht gelöscht werden.")); }
    finally { setSaving(false); }
  }

  async function uploadContractFile() {
    if (!selected || !projectId) return;

    pickFile(async (file) => {
      setSaving(true);
      setError("");

      try {
        let documentId =
          String(selected.documentId || "").trim();

        if (!documentId) {
          const initialized = await initDocument(
            projectId,
            "OTHER",
            file.name
          );

          documentId = initialized.documentId;
        }

        await uploadFileDirect(
          documentId,
          file
        );

        if (
          documentId !== selected.documentId
        ) {
          await request(
            `/api/contracts/${encodeURIComponent(selected.id)}/document`,
            {
              method: "POST",
              body: JSON.stringify({
                documentId
              })
            }
          );
        }

        await load();
      } catch (e: any) {
        setError(
          e?.message ||
          "Vertragsdatei konnte nicht gespeichert werden."
        );
      } finally {
        setSaving(false);
      }
    });
  }

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();

    return all.filter((row) => {
      const text = [
        row.title,
        row.contractNumber,
        row.partner,
        row.contractType,
        ...(row.tags || [])
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        (!q || text.includes(q)) &&
        (statusFilter === "ALL" ||
          row.status === statusFilter) &&
        (typeFilter === "ALL" ||
          row.contractType === typeFilter)
      );
    });
  }, [
    all,
    search,
    statusFilter,
    typeFilter
  ]);

  const activeCount =
    all.filter((row) => row.status === "Aktiv")
      .length;

  const expiringCount =
    all.filter((row) => {
      const days = daysUntil(row.endDate);

      return (
        days !== null &&
        days >= 0 &&
        days <= 90
      );
    }).length;

  const totalValue =
    all.reduce(
      (sum, row) =>
        sum + Number(row.valueNet || 0),
      0
    );

  return (
    <div className="card">
      <header className="rlc-page-hero rlc-page-hero--split">
        <div>
          <div className="rlc-page-hero__eyebrow">
            Büro & Verwaltung
          </div>

          <h1>Vertragsverwaltung</h1>

          <p>
            Verträge, Fristen und Vertragsdokumente
            zentral verwalten · Projekt {projectLabel}
          </p>
        </div>

        <div className="rlc-page-hero__actions">
          <button
            type="button"
            className="rlc-page-hero__button"
            onClick={() => void createContract()}
            disabled={!projectId || saving}
          >
            + Vertrag
          </button>

          <button
            type="button"
            className="rlc-page-hero__button"
            onClick={() => void uploadContractFile()}
            disabled={!selected || saving || selectedLocked}
          >
            + Dokument
          </button>
        </div>
      </header>

      {error ? (
        <div
          className="card"
          style={{
            marginBottom: 12,
            borderColor: "#dc2626"
          }}
        >
          {error}
        </div>
      ) : null}

      <section
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(4,minmax(0,1fr))",
          gap: 10,
          marginBottom: 10
        }}
      >
        <Kpi
          label="Verträge gesamt"
          value={String(all.length)}
        />

        <Kpi
          label="Aktiv"
          value={String(activeCount)}
        />

        <Kpi
          label="Läuft ≤ 90 Tage aus"
          value={String(expiringCount)}
        />

        <Kpi
          label="Vertragswert netto"
          value={money(totalValue)}
        />
      </section>

      <div className="rlc-page-toolbar">
        <input
          className="rlc-page-toolbar__search"
          value={search}
          onChange={(e) =>
            setSearch(e.target.value)
          }
          placeholder="Verträge durchsuchen..."
        />

        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value)
          }
        >
          <option value="ALL">
            Alle Status
          </option>
          <option value="Entwurf">
            Entwurf
          </option>
          <option value="Aktiv">
            Aktiv
          </option>
          <option value="Läuft aus">
            Läuft aus
          </option>
          <option value="Signiert">
            Signiert
          </option>
          <option value="Beendet">
            Beendet
          </option>
        </select>

        <select
          value={typeFilter}
          onChange={(e) =>
            setTypeFilter(e.target.value)
          }
        >
          <option value="ALL">
            Alle Vertragstypen
          </option>
          <option value="Bauvertrag">
            Bauvertrag
          </option>
          <option value="Nachunternehmervertrag">
            Nachunternehmervertrag
          </option>
          <option value="Liefervertrag">
            Liefervertrag
          </option>
          <option value="Mietvertrag">
            Mietvertrag
          </option>
          <option value="Wartungsvertrag">
            Wartungsvertrag
          </option>
          <option value="Arbeitsvertrag">
            Arbeitsvertrag
          </option>
          <option value="Sonstige">
            Sonstige
          </option>
        </select>

        <button
          className="btn"
          type="button"
          onClick={() => void load()}
          disabled={loading}
        >
          Aktualisieren
        </button>
      </div>

      <div
        className="rlc-page-workspace"
        style={{
          gridTemplateColumns:
            "300px minmax(0,1fr)"
        }}
      >
        <section className="rlc-page-list">
          <div className="rlc-page-section-head">
            <strong>Verträge</strong>
            <span>
              {loading
                ? "Lädt..."
                : `${filtered.length} Einträge`}
            </span>
          </div>

          <div className="rlc-page-document-list">
            {filtered.map((row) => {
              const days =
                daysUntil(row.endDate);

              return (
                <button
                  key={row.id}
                  type="button"
                  className={
                    selectedId === row.id
                      ? "rlc-page-document-row is-active"
                      : "rlc-page-document-row"
                  }
                  onClick={() =>
                    setSelectedId(row.id)
                  }
                >
                  <div className="rlc-page-document-icon">
                    VER
                  </div>

                  <div className="rlc-page-document-copy">
                    <strong>
                      {row.title}
                    </strong>

                    <div className="rlc-page-document-meta">
                      <span>
                        {row.partner ||
                          "Kein Vertragspartner"}
                      </span>

                      <span>
                        {row.contractType}
                      </span>

                      <span>
                        {row.status}
                      </span>

                      {days !== null &&
                      days >= 0 ? (
                        <span>
                          {days} Tage
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="rlc-page-document-version">
                    V
                    {row.document?.versions
                      ?.length || 0}
                  </div>
                </button>
              );
            })}

            {!loading &&
            !filtered.length ? (
              <div className="rlc-page-empty">
                <strong>
                  Keine Verträge vorhanden
                </strong>
                <span>
                  Einen neuen Vertrag anlegen.
                </span>
              </div>
            ) : null}
          </div>
        </section>

        <section className="rlc-page-detail">
          {!selected ? (
            <div className="rlc-page-empty">
              <strong>
                Vertrag auswählen
              </strong>
              <span>
                Links einen Vertrag auswählen
                oder neu anlegen.
              </span>
            </div>
          ) : (
            <>
              <div className="rlc-page-detail-head">
                <div className="rlc-page-detail-kicker">
                  {selected.contractType}
                </div>

                <h2>{selected.title}</h2>

                <div className="rlc-page-document-meta">
                  <span>
                    {selected.status}
                  </span>

                  <span>
                    {selected.contractNumber ||
                      "Keine Vertragsnummer"}
                  </span>

                  <span>
                    {selected.document?.versions
                      ?.length || 0}{" "}
                    Version(en)
                  </span>

                  {saving ? (
                    <span>
                      Speichert...
                    </span>
                  ) : null}
                </div>
              </div>

              {selectedLocked ? (
                <div className="card" style={{margin:"10px 0",borderColor:"#bfdbfe",background:"#eff6ff"}}>
                  <b>Vertragsnachweis gesperrt</b> · Inhalte und DMS-Versionen dieses Vertrags werden nicht mehr überschrieben. Änderungen als Nachtrag/neue Vertragsfassung anlegen.
                </div>
              ) : null}

              <div className="rlc-page-detail-actions">
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() =>
                    void saveContract()
                  }
                  disabled={saving || selectedLocked}
                >
                  {selectedLocked ? "Gesperrt" : saving ? "Speichert..." : "Speichern"}
                </button>

                <button
                  className="btn"
                  type="button"
                  onClick={() =>
                    void uploadContractFile()
                  }
                  disabled={saving || selectedLocked}
                >
                  Neue Version
                </button>

                <button
                  className="btn"
                  type="button"
                  onClick={() =>
                    void deleteContract()
                  }
                  disabled={saving || selected.status === "Archiviert"}
                >
                  {selected.status === "Entwurf" ? "Löschen" : "Archivieren"}
                </button>
              </div>

              <div
                style={{
                  padding: 18,
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(3,minmax(0,1fr))",
                  columnGap: 18,
                  rowGap: 14
                }}
              >
                <Field label="Vertragsbezeichnung">
                  <input
                    value={selected.title || ""}
                    onChange={(e) =>
                      localPatch({
                        title: e.target.value
                      })
                    }
                    onBlur={(e) =>
                      void savePatch(
                        selected.id,
                        {
                          title: e.target.value
                        }
                      )
                    }
                  />
                </Field>

                <Field label="Vertragsnummer">
                  <input
                    value={
                      selected.contractNumber || ""
                    }
                    onChange={(e) =>
                      localPatch({
                        contractNumber:
                          e.target.value
                      })
                    }
                    onBlur={(e) =>
                      void savePatch(
                        selected.id,
                        {
                          contractNumber:
                            e.target.value
                        }
                      )
                    }
                  />
                </Field>

                <Field label="Vertragspartner">
                  <input
                    value={
                      selected.partner || ""
                    }
                    onChange={(e) =>
                      localPatch({
                        partner: e.target.value
                      })
                    }
                    onBlur={(e) =>
                      void savePatch(
                        selected.id,
                        {
                          partner:
                            e.target.value
                        }
                      )
                    }
                  />
                </Field>

                <Field label="Vertragstyp">
                  <select
                    value={
                      selected.contractType
                    }
                    onChange={(e) => {
                      const value =
                        e.target
                          .value as ContractType;

                      localPatch({
                        contractType: value
                      });

                      void savePatch(
                        selected.id,
                        {
                          contractType: value
                        }
                      );
                    }}
                  >
                    <option>
                      Bauvertrag
                    </option>
                    <option>
                      Nachunternehmervertrag
                    </option>
                    <option>
                      Liefervertrag
                    </option>
                    <option>
                      Mietvertrag
                    </option>
                    <option>
                      Wartungsvertrag
                    </option>
                    <option>
                      Arbeitsvertrag
                    </option>
                    <option>
                      Sonstige
                    </option>
                  </select>
                </Field>

                <Field label="Status">
                  <select
                    value={selected.status}
                    disabled={selected.status === "Archiviert"}
                    onChange={(e) => {
                      const value =
                        e.target
                          .value as ContractStatus;

                      localPatch({
                        status: value
                      });

                      void savePatch(
                        selected.id,
                        {
                          status: value
                        }
                      );
                    }}
                  >
                    <option>
                      Entwurf
                    </option>
                    <option>
                      Aktiv
                    </option>
                    <option>
                      Läuft aus
                    </option>
                    <option>
                      Signiert
                    </option>
                    <option>
                      Beendet
                    </option>
                    <option>
                      Archiviert
                    </option>
                  </select>
                </Field>

                <Field label="Vertragswert netto">
                  <input
                    type="number"
                    step="0.01"
                    value={
                      selected.valueNet || 0
                    }
                    onChange={(e) =>
                      localPatch({
                        valueNet:
                          Number(
                            e.target.value || 0
                          )
                      })
                    }
                    onBlur={(e) =>
                      void savePatch(
                        selected.id,
                        {
                          valueNet:
                            Number(
                              e.target.value || 0
                            )
                        }
                      )
                    }
                  />
                </Field>

                <Field label="Vertragsbeginn">
                  <input
                    type="date"
                    value={dateInput(
                      selected.startDate
                    )}
                    onChange={(e) =>
                      localPatch({
                        startDate:
                          e.target.value
                      })
                    }
                    onBlur={(e) =>
                      void savePatch(
                        selected.id,
                        {
                          startDate:
                            e.target.value
                        }
                      )
                    }
                  />
                </Field>

                <Field label="Vertragsende">
                  <input
                    type="date"
                    value={dateInput(
                      selected.endDate
                    )}
                    onChange={(e) =>
                      localPatch({
                        endDate:
                          e.target.value
                      })
                    }
                    onBlur={(e) =>
                      void savePatch(
                        selected.id,
                        {
                          endDate:
                            e.target.value
                        }
                      )
                    }
                  />
                </Field>

                <Field label="Kündigungsfrist (Tage)">
                  <input
                    type="number"
                    value={
                      selected.cancellationDays ||
                      0
                    }
                    onChange={(e) =>
                      localPatch({
                        cancellationDays:
                          Number(
                            e.target.value || 0
                          )
                      })
                    }
                    onBlur={(e) =>
                      void savePatch(
                        selected.id,
                        {
                          cancellationDays:
                            Number(
                              e.target.value || 0
                            )
                        }
                      )
                    }
                  />
                </Field>

                <Field label="Projekt">
                  <input
                    value={projectLabel}
                    readOnly
                  />
                </Field>

                <div
                  style={{
                    gridColumn: "1 / -1"
                  }}
                >
                  <Field label="Notizen">
                    <textarea
                      value={
                        selected.notes || ""
                      }
                      onChange={(e) =>
                        localPatch({
                          notes:
                            e.target.value
                        })
                      }
                      onBlur={(e) =>
                        void savePatch(
                          selected.id,
                          {
                            notes:
                              e.target.value
                          }
                        )
                      }
                      style={{
                        minHeight: 82
                      }}
                    />
                  </Field>
                </div>

                <div
                  style={{
                    gridColumn: "1 / -1"
                  }}
                >
                  <Field label="Tags">
                    <input
                      value={(
                        selected.tags || []
                      ).join(", ")}
                      onChange={(e) =>
                        localPatch({
                          tags:
                            e.target.value
                              .split(",")
                              .map((tag) =>
                                tag.trim()
                              )
                              .filter(Boolean)
                        })
                      }
                      onBlur={(e) =>
                        void savePatch(
                          selected.id,
                          {
                            tags:
                              e.target.value
                                .split(",")
                                .map((tag) =>
                                  tag.trim()
                                )
                                .filter(Boolean)
                          }
                        )
                      }
                      placeholder="z. B. Bauvertrag, Nachunternehmer, 2026"
                    />
                  </Field>
                </div>
              </div>

              <div className="rlc-page-section-head">
                <strong>
                  Vertragsdokument
                </strong>

                <span>
                  {selected.document
                    ? `${
                        selected.document
                          .versions?.length || 0
                      } Version(en)`
                    : "Kein Dokument"}
                </span>
              </div>

              <div
                style={{
                  padding: 16
                }}
              >
                {!selected.document ? (
                  <div className="rlc-page-empty">
                    <strong>
                      Noch kein Vertragsdokument
                    </strong>

                    <span>
                      PDF, Word, Excel oder Bild
                      hochladen.
                    </span>

                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() =>
                        void uploadContractFile()
                      }
                    >
                      Dokument hochladen
                    </button>
                  </div>
                ) : (
                  <div className="card">
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent:
                          "space-between",
                        gap: 16
                      }}
                    >
                      <div>
                        <strong>
                          {
                            selected.document
                              .name
                          }
                        </strong>

                        <div className="muted">
                          DMS ·{" "}
                          {selected.document
                            .kind || "OTHER"}{" "}
                          ·{" "}
                          {selected.document
                            .versions?.length ||
                            0}{" "}
                          Version(en)
                        </div>
                      </div>

                      <button
                        className="btn btn-primary"
                        type="button"
                        onClick={() =>
                          void uploadContractFile()
                        }
                      >
                        Neue Version
                      </button>
                    </div>

                    {!!selected.document
                      .versions?.length && (
                      <div
                        style={{
                          marginTop: 14
                        }}
                      >
                        {selected.document.versions.map(
                          (version) => (
                            <div
                              key={version.id}
                              style={{
                                display:
                                  "flex",
                                justifyContent:
                                  "space-between",
                                padding:
                                  "8px 0",
                                borderTop:
                                  "1px solid var(--line)"
                              }}
                            >
                              <strong>
                                Version{" "}
                                {
                                  version.version
                                }
                              </strong>

                              <span className="muted">
                                {version.createdAt
                                  ? new Date(
                                      version.createdAt
                                    ).toLocaleString(
                                      "de-DE"
                                    )
                                  : ""}
                              </span>
                            </div>
                          )
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="card">
      <div className="muted">
        {label}
      </div>

      <strong
        style={{
          fontSize: 23
        }}
      >
        {value}
      </strong>
    </div>
  );
}

function Field({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows:
          "auto minmax(40px,auto)",
        alignContent: "start",
        gap: 6,
        minWidth: 0
      }}
    >
      <div
        style={{
          color: "#334155",
          fontSize: 12,
          fontWeight: 650,
          lineHeight: 1.25
        }}
      >
        {label}
      </div>

      <div
        style={{
          minWidth: 0
        }}
      >
        {children}
      </div>
    </div>
  );
}

function pickFile(
  onPick: (file: File) => void
) {
  const input =
    document.createElement("input");

  input.type = "file";
  input.accept =
    ".pdf,.doc,.docx,.xls,.xlsx,image/*";

  input.onchange = () => {
    const file =
      input.files?.[0];

    if (file) {
      onPick(file);
    }
  };

  input.click();
}
