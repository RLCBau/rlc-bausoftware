import React from "react";

import { API_BASE } from "../../lib/apiBase";
import { useProject } from "../../store/useProject";
import BuroWorkTabs from "./BuroWorkTabs";

type Note = {
  id: string;
  projectId: string;
  text: string;
  tags: string[];
  author?: string | null;
  createdAt: string;
  updatedAt: string;
};

function getToken() {
  const keys = [
    "rlc_token",
    "token",
    "authToken",
    "accessToken",
    "rlc_auth_token",
    "rlc_access_token",
    "rlc.auth.token"
  ];

  for (const key of keys) {
    for (const storage of [localStorage, sessionStorage]) {
      const value = storage.getItem(key);
      if (value?.trim()) return value.trim();
    }
  }

  return "";
}

async function request<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const token = getToken();

  const res = await fetch(`${API_BASE}${path}`, {
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

export default function NotizenPage() {
  const { getSelectedProject } = useProject();
  const project = getSelectedProject();

  const projectId = String(project?.id || "").trim();

  const projectLabel =
    [project?.code, project?.name]
      .filter(Boolean)
      .join(" · ") ||
    projectId ||
    "—";

  const [items, setItems] = React.useState<Note[]>([]);
  const [selectedId, setSelectedId] =
    React.useState<string | null>(null);

  const [query, setQuery] = React.useState("");
  const [error, setError] = React.useState("");

  const [form, setForm] = React.useState({
    text: "",
    tags: "",
    author: ""
  });

  const selected =
    items.find((item) => item.id === selectedId) || null;

  const load = React.useCallback(async () => {
    if (!projectId) return;

    try {
      const data = await request<{
        ok: true;
        items: Note[];
      }>(
        `/api/notes?projectId=${encodeURIComponent(projectId)}`
      );

      setItems(data.items || []);

      setSelectedId((current) => {
        if (
          current &&
          data.items?.some((item) => item.id === current)
        ) {
          return current;
        }

        return data.items?.[0]?.id || null;
      });
    } catch (e: any) {
      setError(e?.message || "Notizen konnten nicht geladen werden.");
    }
  }, [projectId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (!selected) {
      setForm({
        text: "",
        tags: "",
        author: ""
      });
      return;
    }

    setForm({
      text: selected.text || "",
      tags: (selected.tags || []).join(", "),
      author: selected.author || ""
    });
  }, [selectedId, selected?.updatedAt]);

  async function createNote() {
    if (!projectId) return;

    const data = await request<{
      ok: true;
      item: Note;
    }>("/api/notes", {
      method: "POST",
      body: JSON.stringify({
        projectId,
        text: "Neue Notiz",
        tags: []
      })
    });

    await load();
    setSelectedId(data.item.id);
  }

  async function saveNote() {
    if (!selected) return;

    await request(
      `/api/notes/${encodeURIComponent(selected.id)}`,
      {
        method: "PUT",
        body: JSON.stringify({
          text: form.text,
          author: form.author || null,
          tags: form.tags
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean)
        })
      }
    );

    await load();
  }

  function moveNoteToCalendar() {
    if (!selected) return;

    const cleanText =
      String(selected.text || "")
        .replace(/\s+/g, " ")
        .trim();

    const title =
      cleanText.length > 70
        ? cleanText.slice(0, 67) + "..."
        : cleanText || "Termin aus Notiz";

    sessionStorage.setItem(
      "rlc.calendar.prefill",
      JSON.stringify({
        projectId: selected.projectId,
        title,
        notes: selected.text || "",
        category: "Projekt",
        sourceType: "note",
        sourceId: selected.id
      })
    );

    window.location.assign("/buro/outlook?new=1");
  }

  async function removeNote() {
    if (!selected) return;

    if (!window.confirm("Notiz wirklich löschen?")) {
      return;
    }

    await request(
      `/api/notes/${encodeURIComponent(selected.id)}`,
      { method: "DELETE" }
    );

    setSelectedId(null);
    await load();
  }

  const filtered = items.filter((item) => {
    const q = query.toLowerCase().trim();

    return (
      !q ||
      [
        item.text,
        item.author || "",
        ...(item.tags || [])
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  });

  return (
    <div className="card">
      <header className="rlc-page-hero rlc-page-hero--split">
        <div>
          <div className="rlc-page-hero__eyebrow">
            Büro & Verwaltung
          </div>

          <h1>Notizen</h1>

          <p>
            Projektbezogene Notizen dauerhaft speichern
            · Projekt {projectLabel}
          </p>
        </div>

        <div className="rlc-page-hero__actions">
          <button
            className="rlc-page-hero__button"
            onClick={() => void createNote()}
          >
            + Neue Notiz
          </button>
        </div>
      </header>

      <BuroWorkTabs active="notizen" />

      {error ? <div className="card">{error}</div> : null}

      <div className="rlc-page-toolbar">
        <input
          className="rlc-page-toolbar__search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Notiz, Autor oder Tag suchen..."
        />

        <button className="btn" onClick={() => void load()}>
          Aktualisieren
        </button>
      </div>

      <div
        className="rlc-page-workspace"
        style={{
          gridTemplateColumns: "360px minmax(0,1fr)",
          alignItems: "start"
        }}
      >
        <section className="rlc-page-list">
          <div className="rlc-page-section-head">
            <strong>Notizen</strong>
            <span>{filtered.length} Einträge</span>
          </div>

          <div className="rlc-page-document-list">
            {filtered.map((note) => (
              <button
                key={note.id}
                className={
                  selectedId === note.id
                    ? "rlc-page-document-row is-active"
                    : "rlc-page-document-row"
                }
                onClick={() => setSelectedId(note.id)}
              >
                <div className="rlc-page-document-icon">
                  N
                </div>

                <div className="rlc-page-document-copy">
                  <strong>
                    {note.text.slice(0, 70)}
                  </strong>

                  <div className="rlc-page-document-meta">
                    <span>{note.author || "Ohne Autor"}</span>
                    <span>
                      {new Date(note.updatedAt).toLocaleDateString("de-DE")}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="rlc-page-detail">
          {!selected ? (
            <div className="rlc-page-empty">
              Notiz auswählen oder neu anlegen.
            </div>
          ) : (
            <>
              <div className="rlc-page-detail-head">
                <div className="rlc-page-detail-kicker">
                  Notiz
                </div>

                <h2>Projektnotiz</h2>
              </div>

              <div className="rlc-page-detail-actions">
                <button
                  className="btn btn-primary"
                  onClick={() => void saveNote()}
                >
                  Speichern
                </button>

                <button
                  className="btn"
                  onClick={moveNoteToCalendar}
                >
                  In Kalender übernehmen
                </button>

                <button
                  className="btn"
                  onClick={() => void removeNote()}
                >
                  Löschen
                </button>
              </div>

              <div
                style={{
                  padding: 18,
                  display: "grid",
                  gap: 14
                }}
              >
                <Field label="Autor">
                  <input
                    value={form.author}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        author: e.target.value
                      })
                    }
                  />
                </Field>

                <Field label="Tags">
                  <input
                    value={form.tags}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        tags: e.target.value
                      })
                    }
                    placeholder="kommagetrennt"
                  />
                </Field>

                <Field label="Notiz">
                  <textarea
                    value={form.text}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        text: e.target.value
                      })
                    }
                    style={{
                      minHeight: 260,
                      resize: "vertical"
                    }}
                  />
                </Field>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Field({
  label,
  children
}: {
  label: string;
  children: React.ReactElement<any>;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <strong style={{ fontSize: 12 }}>{label}</strong>

      {React.cloneElement(children, {
        style: {
          width: "100%",
          boxSizing: "border-box",
          ...(children.props?.style || {})
        }
      })}
    </div>
  );
}
