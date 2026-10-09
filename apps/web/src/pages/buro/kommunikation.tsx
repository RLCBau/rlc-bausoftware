import React from "react";
import BuroWorkTabs from "./BuroWorkTabs";

import { API_BASE } from "../../lib/apiBase";
import { useProject } from "../../store/useProject";

import {
  detectKind,
  initDocument,
  uploadFileDirect
} from "../../api/files";

type Message = {
  id: string;
  threadId: string;
  fromName: string;
  toList: string[];
  ccList: string[];
  subject?: string | null;
  body: string;
  createdAt: string;
};

type AttachmentVersion = {
  id: string;
  version: number;
  createdAt?: string;
};

type Attachment = {
  id: string;
  threadId: string;
  documentId?: string | null;
  name: string;
  createdAt: string;
  document?: {
    id: string;
    name: string;
    kind?: string;
    versions?: AttachmentVersion[];
  } | null;
};

type Thread = {
  id: string;
  companyId: string;
  projectId: string;
  subject: string;
  participants: string[];
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
  attachments: Attachment[];
};

type ComposeState = {
  to: string;
  cc: string;
  subject: string;
  body: string;
};

const EMPTY_COMPOSE: ComposeState = {
  to: "",
  cc: "",
  subject: "",
  body: ""
};

function api(path: string) {
  return `${API_BASE}${path}`;
}

function getToken(): string {
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

        if (value?.trim()) {
          return value.trim();
        }
      }
    }

    for (const key of [
      "rlc_auth",
      "auth",
      "user",
      "session",
      "rlc_session"
    ]) {
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
  const token = getToken();

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

  if (!res.ok || data?.ok === false) {
    throw new Error(
      data?.error ||
      data?.message ||
      `HTTP ${res.status}`
    );
  }

  return data as T;
}

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function dateTime(value?: string) {
  if (!value) return "—";

  const d = new Date(value);

  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleString("de-DE");
}

export default function Kommunikation() {
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

  const [threads, setThreads] =
    React.useState<Thread[]>([]);

  const [selectedId, setSelectedId] =
    React.useState<string | null>(null);

  const [query, setQuery] =
    React.useState("");

  const [onlyUnread, setOnlyUnread] =
    React.useState(false);

  const [compose, setCompose] =
    React.useState<ComposeState>(EMPTY_COMPOSE);

  const [subjectDraft, setSubjectDraft] =
    React.useState("");

  const [participantsDraft, setParticipantsDraft] =
    React.useState("");

  const [loading, setLoading] =
    React.useState(false);

  const [saving, setSaving] =
    React.useState(false);

  const [error, setError] =
    React.useState("");

  const selected =
    threads.find((row) => row.id === selectedId) ||
    null;

  const load = React.useCallback(async () => {
    if (!projectId) {
      setThreads([]);
      setSelectedId(null);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data = await request<{
        ok: true;
        items: Thread[];
      }>(
        `/api/communication?projectId=${encodeURIComponent(projectId)}`
      );

      const items =
        Array.isArray(data.items)
          ? data.items
          : [];

      setThreads(items);

      setSelectedId((current) => {
        if (
          current &&
          items.some((row) => row.id === current)
        ) {
          return current;
        }

        return items[0]?.id || null;
      });
    } catch (e: any) {
      setError(
        e?.message ||
        "Kommunikation konnte nicht geladen werden."
      );
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (!selected) {
      setSubjectDraft("");
      setParticipantsDraft("");
      setCompose(EMPTY_COMPOSE);
      return;
    }

    setSubjectDraft(selected.subject || "");
    setParticipantsDraft(
      (selected.participants || []).join(", ")
    );

    setCompose((prev) => ({
      ...prev,
      subject:
        prev.subject ||
        selected.subject ||
        ""
    }));
  }, [selectedId, selected?.updatedAt]);

  async function createThread() {
    if (!projectId) return;

    setSaving(true);
    setError("");

    try {
      const data = await request<{
        ok: true;
        item: Thread;
      }>("/api/communication", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          subject: "Neue Konversation",
          participants: []
        })
      });

      await load();
      setSelectedId(data.item.id);
    } catch (e: any) {
      setError(
        e?.message ||
        "Konversation konnte nicht erstellt werden."
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveThread() {
    if (!selected) return;

    setSaving(true);
    setError("");

    try {
      await request(
        `/api/communication/${encodeURIComponent(selected.id)}`,
        {
          method: "PUT",
          body: JSON.stringify({
            subject: subjectDraft,
            participants:
              splitList(participantsDraft)
          })
        }
      );

      await load();
    } catch (e: any) {
      setError(
        e?.message ||
        "Konversation konnte nicht gespeichert werden."
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteThread() {
    if (!selected) return;

    if (
      !window.confirm(
        `Konversation "${selected.subject}" wirklich löschen?`
      )
    ) {
      return;
    }

    setSaving(true);
    setError("");

    try {
      await request(
        `/api/communication/${encodeURIComponent(selected.id)}`,
        {
          method: "DELETE"
        }
      );

      setSelectedId(null);
      await load();
    } catch (e: any) {
      setError(
        e?.message ||
        "Konversation konnte nicht gelöscht werden."
      );
    } finally {
      setSaving(false);
    }
  }

  async function markRead() {
    if (!selected) return;

    try {
      await request(
        `/api/communication/${encodeURIComponent(selected.id)}`,
        {
          method: "PUT",
          body: JSON.stringify({
            unreadCount: 0
          })
        }
      );

      await load();
    } catch (e: any) {
      setError(
        e?.message ||
        "Status konnte nicht geändert werden."
      );
    }
  }

  async function createTaskFromThread() {
    if (!selected) return;

    const latestMessage =
      [...(selected.messages || [])]
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() -
            new Date(a.createdAt).getTime()
        )[0];

    setSaving(true);
    setError("");

    try {
      await request("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          projectId: selected.projectId,
          title: selected.subject || "Aufgabe aus Kommunikation",
          description: latestMessage?.body || "",
          priority: "med",
          tags: ["Kommunikation"],
          sourceType: "communication",
          sourceId: selected.id
        })
      });

      window.alert("Aufgabe wurde erstellt.");
    } catch (e: any) {
      setError(
        e?.message ||
        "Aufgabe konnte nicht erstellt werden."
      );
    } finally {
      setSaving(false);
    }
  }

  function createCalendarFromThread() {
    if (!selected) return;

    const latestMessage =
      [...(selected.messages || [])]
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() -
            new Date(a.createdAt).getTime()
        )[0];

    sessionStorage.setItem(
      "rlc.calendar.prefill",
      JSON.stringify({
        projectId: selected.projectId,
        title:
          selected.subject ||
          "Termin aus Kommunikation",
        attendees:
          (selected.participants || []).join(", "),
        notes: latestMessage?.body || "",
        category: "Besprechung",
        sourceType: "communication",
        sourceId: selected.id
      })
    );

    window.location.assign("/buro/outlook?new=1");
  }

  async function sendMessage() {
    if (!selected) return;

    const body = compose.body.trim();

    if (!body) return;

    setSaving(true);
    setError("");

    try {
      await request(
        `/api/communication/${encodeURIComponent(selected.id)}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            fromName: "Ich",
            toList: splitList(compose.to),
            ccList: splitList(compose.cc),
            subject:
              compose.subject ||
              selected.subject,
            body
          })
        }
      );

      setCompose((prev) => ({
        ...prev,
        body: ""
      }));

      await load();
    } catch (e: any) {
      setError(
        e?.message ||
        "Nachricht konnte nicht gespeichert werden."
      );
    } finally {
      setSaving(false);
    }
  }

  async function uploadAttachment() {
    if (!selected || !projectId) return;

    pickFile(async (file) => {
      setSaving(true);
      setError("");

      try {
        const initialized = await initDocument(
          projectId,
          detectKind(file),
          file.name
        );

        await uploadFileDirect(
          initialized.documentId,
          file
        );

        await request(
          `/api/communication/${encodeURIComponent(selected.id)}/attachments`,
          {
            method: "POST",
            body: JSON.stringify({
              documentId:
                initialized.documentId,
              name: file.name
            })
          }
        );

        await load();
      } catch (e: any) {
        setError(
          e?.message ||
          "Datei konnte nicht gespeichert werden."
        );
      } finally {
        setSaving(false);
      }
    });
  }

  async function onDrop(
    ev: React.DragEvent<HTMLElement>
  ) {
    ev.preventDefault();

    const file =
      ev.dataTransfer.files?.[0];

    if (!file || !selected || !projectId) {
      return;
    }

    setSaving(true);
    setError("");

    try {
      const initialized =
        await initDocument(
          projectId,
          detectKind(file),
          file.name
        );

      await uploadFileDirect(
        initialized.documentId,
        file
      );

      await request(
        `/api/communication/${encodeURIComponent(selected.id)}/attachments`,
        {
          method: "POST",
          body: JSON.stringify({
            documentId:
              initialized.documentId,
            name: file.name
          })
        }
      );

      await load();
    } catch (e: any) {
      setError(
        e?.message ||
        "Datei konnte nicht gespeichert werden."
      );
    } finally {
      setSaving(false);
    }
  }

  const filtered =
    React.useMemo(() => {
      const q =
        query.trim().toLowerCase();

      return threads.filter((thread) => {
        const text = [
          thread.subject,
          ...(thread.participants || [])
        ]
          .join(" ")
          .toLowerCase();

        return (
          (!q || text.includes(q)) &&
          (!onlyUnread ||
            Number(thread.unreadCount || 0) > 0)
        );
      });
    }, [
      threads,
      query,
      onlyUnread
    ]);

  const unreadTotal =
    threads.reduce(
      (sum, thread) =>
        sum +
        Number(thread.unreadCount || 0),
      0
    );

  const messageTotal =
    threads.reduce(
      (sum, thread) =>
        sum +
        Number(thread.messages?.length || 0),
      0
    );

  const attachmentTotal =
    threads.reduce(
      (sum, thread) =>
        sum +
        Number(thread.attachments?.length || 0),
      0
    );

  return (
    <div className="card">

      <header className="rlc-page-hero rlc-page-hero--split">
        <div>
          <div className="rlc-page-hero__eyebrow">
            Büro & Verwaltung
          </div>

          <h1>Kommunikation</h1>

          <p>
            Projektbezogene Konversationen,
            Nachrichten und Anhänge zentral
            verwalten · Projekt {projectLabel}
          </p>
        </div>

        <div className="rlc-page-hero__actions">
          <button
            type="button"
            className="rlc-page-hero__button"
            onClick={() =>
              void createThread()
            }
            disabled={!projectId || saving}
          >
            + Neue Konversation
          </button>

          <button
            type="button"
            className="rlc-page-hero__button"
            onClick={() =>
              void uploadAttachment()
            }
            disabled={!selected || saving}
          >
            + Datei
          </button>
        </div>
      </header>

      <BuroWorkTabs active="kommunikation" />

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
          label="Konversationen"
          value={String(threads.length)}
        />

        <Kpi
          label="Nachrichten"
          value={String(messageTotal)}
        />

        <Kpi
          label="Ungelesen"
          value={String(unreadTotal)}
        />

        <Kpi
          label="Anhänge"
          value={String(attachmentTotal)}
        />
      </section>

      <div className="rlc-page-toolbar">
        <input
          className="rlc-page-toolbar__search"
          value={query}
          onChange={(e) =>
            setQuery(e.target.value)
          }
          placeholder="Betreff oder Teilnehmer suchen..."
        />

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7
          }}
        >
          <input
            type="checkbox"
            checked={onlyUnread}
            onChange={(e) =>
              setOnlyUnread(
                e.target.checked
              )
            }
          />

          Nur ungelesene
        </label>

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
            "330px minmax(0,1fr)",
          alignItems: "start"
        }}
      >
        <section className="rlc-page-list">
          <div className="rlc-page-section-head">
            <strong>
              Konversationen
            </strong>

            <span>
              {loading
                ? "Lädt..."
                : `${filtered.length} Einträge`}
            </span>
          </div>

          <div className="rlc-page-document-list">
            {filtered.map((thread) => (
              <button
                key={thread.id}
                type="button"
                className={
                  selectedId === thread.id
                    ? "rlc-page-document-row is-active"
                    : "rlc-page-document-row"
                }
                onClick={() =>
                  setSelectedId(thread.id)
                }
              >
                <div className="rlc-page-document-icon">
                  KOM
                </div>

                <div className="rlc-page-document-copy">
                  <strong>
                    {thread.subject ||
                      "(ohne Betreff)"}
                  </strong>

                  <div className="rlc-page-document-meta">
                    <span>
                      {thread.participants
                        ?.slice(0, 2)
                        .join(", ") ||
                        "Keine Teilnehmer"}
                    </span>

                    <span>
                      {thread.messages?.length ||
                        0}{" "}
                      Nachricht(en)
                    </span>

                    <span>
                      {thread.attachments
                        ?.length || 0}{" "}
                      Datei(en)
                    </span>
                  </div>
                </div>

                {thread.unreadCount > 0 ? (
                  <div className="rlc-page-document-version">
                    {thread.unreadCount}
                  </div>
                ) : null}
              </button>
            ))}

            {!loading &&
            !filtered.length ? (
              <div className="rlc-page-empty">
                <strong>
                  Keine Konversationen
                </strong>

                <span>
                  Neue Konversation
                  anlegen.
                </span>
              </div>
            ) : null}
          </div>
        </section>

        <section
          className="rlc-page-detail"
          style={{
            minHeight: 0,
            overflow: "hidden"
          }}
          onDragOver={(e) =>
            e.preventDefault()
          }
          onDrop={(e) =>
            void onDrop(e)
          }
        >
          {!selected ? (
            <div className="rlc-page-empty">
              <strong>
                Konversation auswählen
              </strong>

              <span>
                Links eine Konversation
                auswählen oder neu anlegen.
              </span>
            </div>
          ) : (
            <>
              <div className="rlc-page-detail-head">
                <div className="rlc-page-detail-kicker">
                  Kommunikation
                </div>

                <h2>
                  {selected.subject ||
                    "(ohne Betreff)"}
                </h2>

                <div className="rlc-page-document-meta">
                  <span>
                    {selected.messages
                      ?.length || 0}{" "}
                    Nachricht(en)
                  </span>

                  <span>
                    {selected.attachments
                      ?.length || 0}{" "}
                    Datei(en)
                  </span>

                  <span>
                    Aktualisiert{" "}
                    {dateTime(
                      selected.updatedAt
                    )}
                  </span>
                </div>
              </div>

              <div className="rlc-page-detail-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() =>
                    void saveThread()
                  }
                  disabled={saving}
                >
                  {saving
                    ? "Speichert..."
                    : "Speichern"}
                </button>

                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    void markRead()
                  }
                >
                  Als gelesen markieren
                </button>

                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    void uploadAttachment()
                  }
                >
                  Datei anhängen
                </button>

                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    void createTaskFromThread()
                  }
                  disabled={saving}
                >
                  Als Aufgabe erstellen
                </button>

                <button
                  type="button"
                  className="btn"
                  onClick={createCalendarFromThread}
                >
                  In Kalender übernehmen
                </button>

                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    void deleteThread()
                  }
                >
                  Löschen
                </button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "minmax(0,1fr) minmax(0,1fr)",
                  gap: 14,
                  padding: 18
                }}
              >
                <Field label="Betreff">
                  <input
                    value={subjectDraft}
                    onChange={(e) =>
                      setSubjectDraft(
                        e.target.value
                      )
                    }
                  />
                </Field>

                <Field label="Teilnehmer">
                  <input
                    value={participantsDraft}
                    onChange={(e) =>
                      setParticipantsDraft(
                        e.target.value
                      )
                    }
                    placeholder="kommagetrennt"
                  />
                </Field>

                <Field label="Projekt">
                  <input
                    value={projectLabel}
                    readOnly
                  />
                </Field>
              </div>

              <div className="rlc-page-section-head">
                <strong>
                  Anhänge
                </strong>

                <span>
                  DMS ·{" "}
                  {selected.attachments
                    ?.length || 0}
                </span>
              </div>

              <div
                style={{
                  padding: "6px 14px",
                  display: "grid",
                  gap: 6
                }}
              >
                {!selected.attachments
                  ?.length ? (
                  <div
                    style={{
                      padding: "8px 12px",
                      textAlign: "left",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      color: "#64748b"
                    }}
                  >
                    <strong style={{ color: "#0f172a" }}>
                      Keine Anhänge
                    </strong>

                    <span>
                      Datei hierher ziehen oder über „Datei anhängen“ hochladen.
                    </span>
                  </div>
                ) : (
                  selected.attachments.map(
                    (attachment) => (
                      <div
                        key={attachment.id}
                        className="card"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent:
                            "space-between",
                          gap: 12
                        }}
                      >
                        <div>
                          <strong>
                            {attachment.name}
                          </strong>

                          <div className="muted">
                            DMS ·{" "}
                            {attachment.document
                              ?.kind || "OTHER"}{" "}
                            ·{" "}
                            {attachment.document
                              ?.versions?.length ||
                              0}{" "}
                            Version(en)
                          </div>
                        </div>

                        <span className="muted">
                          {dateTime(
                            attachment.createdAt
                          )}
                        </span>
                      </div>
                    )
                  )
                )}
              </div>

              <div className="rlc-page-section-head">
                <strong>
                  Nachrichtenverlauf
                </strong>

                <span>
                  {selected.messages
                    ?.length || 0}
                </span>
              </div>

              <div
                style={{
                  padding: "6px 14px",
                  display: "grid",
                  gap: 8
                }}
              >
                {!selected.messages
                  ?.length ? (
                  <div
                    style={{
                      padding: "8px 12px",
                      textAlign: "left",
                      color: "#64748b"
                    }}
                  >
                    <strong style={{ color: "#0f172a" }}>
                      Noch keine Nachrichten
                    </strong>
                  </div>
                ) : (
                  [...selected.messages]
                    .sort(
                      (a, b) =>
                        new Date(
                          a.createdAt
                        ).getTime() -
                        new Date(
                          b.createdAt
                        ).getTime()
                    )
                    .map((message) => (
                      <div
                        key={message.id}
                        className="card"
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent:
                              "space-between",
                            gap: 12,
                            marginBottom: 8
                          }}
                        >
                          <strong>
                            {message.fromName}
                          </strong>

                          <span className="muted">
                            {dateTime(
                              message.createdAt
                            )}
                          </span>
                        </div>

                        {message.subject ? (
                          <div
                            style={{
                              fontWeight: 650,
                              marginBottom: 6
                            }}
                          >
                            {message.subject}
                          </div>
                        ) : null}

                        <div
                          style={{
                            whiteSpace:
                              "pre-wrap"
                          }}
                        >
                          {message.body}
                        </div>
                      </div>
                    ))
                )}
              </div>

              <div className="rlc-page-section-head">
                <strong>
                  Neue Nachricht
                </strong>
              </div>

              <div
                style={{
                  padding: "10px 14px 16px",
                  display: "grid",
                  gridTemplateColumns:
                    "minmax(0,1fr) minmax(0,1fr)",
                  gap: 12
                }}
              >
                <Field label="An">
                  <input
                    value={compose.to}
                    onChange={(e) =>
                      setCompose((prev) => ({
                        ...prev,
                        to: e.target.value
                      }))
                    }
                    placeholder="mail1@..., mail2@..."
                  />
                </Field>

                <Field label="CC">
                  <input
                    value={compose.cc}
                    onChange={(e) =>
                      setCompose((prev) => ({
                        ...prev,
                        cc: e.target.value
                      }))
                    }
                  />
                </Field>

                <div
                  style={{
                    gridColumn: "1 / -1"
                  }}
                >
                  <Field label="Betreff">
                    <input
                      value={compose.subject}
                      onChange={(e) =>
                        setCompose((prev) => ({
                          ...prev,
                          subject:
                            e.target.value
                        }))
                      }
                    />
                  </Field>
                </div>

                <div
                  style={{
                    gridColumn: "1 / -1"
                  }}
                >
                  <Field label="Nachricht">
                    <textarea
                      value={compose.body}
                      onChange={(e) =>
                        setCompose((prev) => ({
                          ...prev,
                          body:
                            e.target.value
                        }))
                      }
                      placeholder="Nachricht schreiben..."
                      style={{
                        minHeight: 120
                      }}
                    />
                  </Field>
                </div>

                <div
                  style={{
                    gridColumn: "1 / -1",
                    display: "flex",
                    justifyContent:
                      "flex-start"
                  }}
                >
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() =>
                      void sendMessage()
                    }
                    disabled={
                      saving ||
                      !compose.body.trim()
                    }
                  >
                    Senden
                  </button>
                </div>
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
        gap: 6,
        minWidth: 0
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 650,
          color: "#334155"
        }}
      >
        {label}
      </div>

      <div
        style={{
          minWidth: 0,
          width: "100%"
        }}
      >
        {React.isValidElement(children)
          ? React.cloneElement(
              children as React.ReactElement<any>,
              {
                style: {
                  width: "100%",
                  boxSizing: "border-box",
                  ...((children.props as any)?.style || {})
                }
              }
            )
          : children}
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

  input.onchange = () => {
    const file =
      input.files?.[0];

    if (file) {
      onPick(file);
    }
  };

  input.click();
}
