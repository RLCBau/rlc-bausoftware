import { apiUrl } from "../../lib/apiBase";
// apps/web/src/pages/ki/Maengel.tsx

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProject } from "../../store/useProject";

type Mangel = {
  id: string;
  foto?: string;
  titel: string;
  beschreibung: string;
  kategorie: string;
  prioritaet: "niedrig" | "mittel" | "hoch" | "kritisch";
  status: "offen" | "in Bearbeitung" | "behoben" | "abgenommen";
  ort?: string;
  lvPos?: string;
  regieberichtId?: string;
  faelligAm?: string;
  verantwortlicher?: string;
  notiz?: string;
  erkannt?: string;
  erstelltAm: string;
  email?: string;
};

type Opt = { id: string; label: string };

type LookupResponse = {
  items?: Opt[];
};

type SaveLoadResponse = {
  items?: Mangel[];
};

type UploadResponse = {
  url?: string;
  detected?: {
    title?: string;
    desc?: string;
    cat?: string;
    prio?: Mangel["prioritaet"];
    lv?: string;
  };
};

type ProjectLike = {
  id?: string;
  code?: string;
};

const shell: React.CSSProperties = {
  display: "grid",
  gap: 16,
  padding: 24,
};

const card: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: 16,
  background: "#fff",
};

const input: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 14,
};

const btn: React.CSSProperties = {
  padding: "8px 12px",
  border: "1px solid #cbd5e1",
  background: "#fff",
  borderRadius: 8,
  fontSize: 13,
  cursor: "pointer",
};

const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const th: React.CSSProperties = {
  borderBottom: "1px solid #ccc",
  textAlign: "left",
  padding: 8,
  background: "#f8fafc",
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: 6,
  borderBottom: "1px solid #eee",
  verticalAlign: "top",
};

export default function Maengel() {
  const nav = useNavigate();

  const projectCtx = useProject() as unknown as {
    currentProject?: ProjectLike | null;
  };

  const currentProject = projectCtx?.currentProject ?? null;
  const storeProjectId = currentProject?.id ?? "";
  const projectCode = currentProject?.code ?? "";

  const [projectInput, setProjectInput] = useState("");
  const [items, setItems] = useState<Mangel[]>([]);
  const [busy, setBusy] = useState(false);
  const [useAI, setUseAI] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [lvOpts, setLvOpts] = useState<Opt[]>([]);
  const [regieOpts, setRegieOpts] = useState<Opt[]>([]);

  const fileRef = useRef<HTMLInputElement | null>(null);

  const effectiveProjectId = useMemo(
    () => projectInput.trim() || storeProjectId || projectCode || "",
    [projectInput, storeProjectId, projectCode]
  );

  useEffect(() => {
    if (!effectiveProjectId) {
      setLvOpts([]);
      setRegieOpts([]);
      return;
    }

    void fetch(
      apiUrl(`/api/lookup/lv?projectId=${encodeURIComponent(effectiveProjectId)}`)
    )
      .then((r) => r.json())
      .then((d: LookupResponse) => setLvOpts(Array.isArray(d.items) ? d.items : []))
      .catch(() => {});

    void fetch(
      apiUrl(
        `/api/lookup/regieberichte?projectId=${encodeURIComponent(
          effectiveProjectId
        )}`
      )
    )
      .then((r) => r.json())
      .then((d: LookupResponse) =>
        setRegieOpts(Array.isArray(d.items) ? d.items : [])
      )
      .catch(() => {});
  }, [effectiveProjectId]);

  async function uploadFotos(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;

    if (!effectiveProjectId) {
      window.alert("Projekt-ID fehlt.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const fd = new FormData();
      fd.append("projectId", effectiveProjectId);
      if (projectCode) fd.append("projectCode", projectCode);
      fd.append("file", f);

      const res = await fetch(
        apiUrl(`/api/ki/maengel/upload?ai=${useAI ? "1" : "0"}`),
        {
          method: "POST",
          body: fd,
        }
      );

      if (!res.ok) throw new Error(await res.text());

      const data = (await res.json()) as UploadResponse;

      const detected = data.detected;

      const neu: Mangel = {
        id: crypto.randomUUID(),
        foto: data.url,
        titel: detected?.title || "Mangel",
        beschreibung: detected?.desc || "",
        kategorie: detected?.cat || "Allgemein",
        prioritaet: isPrioritaet(detected?.prio) ? detected.prio : "mittel",
        status: "offen",
        ort: "",
        lvPos: detected?.lv || "",
        regieberichtId: "",
        faelligAm: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
        verantwortlicher: "",
        notiz: "",
        erkannt: JSON.stringify(detected || {}),
        erstelltAm: new Date().toISOString(),
        email: "",
      };

      setItems((arr) => [neu, ...arr]);
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "Upload/Erkennung fehlgeschlagen";
      setError(msg);
      window.alert(`Upload/Erkennung fehlgeschlagen: ${msg}`);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
      setBusy(false);
    }
  }

  function update(i: number, patch: Partial<Mangel>) {
    setItems((arr) => arr.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  }

  function remove(i: number) {
    setItems((arr) => arr.filter((_, idx) => idx !== i));
  }

  async function speichern() {
    if (!effectiveProjectId) {
      window.alert("Projekt-ID fehlt.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const res = await fetch(apiUrl("/api/ki/maengel/save"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: effectiveProjectId, items }),
      });

      if (!res.ok) throw new Error(await res.text());
      window.alert("Gespeichert.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Speichern fehlgeschlagen";
      setError(msg);
      window.alert(`Speichern fehlgeschlagen: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  async function laden() {
    if (!effectiveProjectId) {
      window.alert("Projekt-ID fehlt.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const r = await fetch(apiUrl("/api/ki/maengel/load"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: effectiveProjectId }),
      });

      if (!r.ok) throw new Error(await r.text());

      const d = (await r.json()) as SaveLoadResponse;
      setItems(Array.isArray(d.items) ? d.items.map(normalizeMangel) : []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Laden fehlgeschlagen";
      setError(msg);
      window.alert(`Laden fehlgeschlagen: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  async function exportPdf(list: Mangel[]) {
    if (!effectiveProjectId || !list.length) return;

    setBusy(true);
    setError(null);

    try {
      const r = await fetch(apiUrl("/api/ki/maengel/pdf"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: effectiveProjectId, items: list }),
      });

      if (!r.ok) throw new Error(await r.text());

      const data = (await r.json()) as { url?: string };
      if (data.url) window.open(data.url, "_blank");
      return data.url;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "PDF-Export fehlgeschlagen";
      setError(msg);
      window.alert(`PDF-Export fehlgeschlagen: ${msg}`);
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function notifySingle(m: Mangel) {
    if (!m.email?.trim()) {
      window.alert("E-Mail fehlt.");
      return;
    }

    const url = await exportPdf([m]);
    if (!url) return;

    const html = `
      <p>Guten Tag,</p>
      <p><b>${escapeHtml(m.titel)}</b> – Priorität: ${escapeHtml(
        m.prioritaet
      )} – Status: ${escapeHtml(m.status)}</p>
      <p>Ort: ${escapeHtml(m.ort || "-")} – Fällig: ${escapeHtml(
        m.faelligAm || "-"
      )}</p>
      <p>LV-Pos.: ${escapeHtml(m.lvPos || "-")} – Regiebericht: ${escapeHtml(
        m.regieberichtId || "-"
      )}</p>
      <p>Protokoll: <a href="${url}" target="_blank" rel="noreferrer">${url}</a></p>`;

    try {
      const res = await fetch(apiUrl("/api/ki/maengel/notify"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: effectiveProjectId,
          to: m.email.trim(),
          subject: `Mangel: ${m.titel} (${effectiveProjectId})`,
          html,
          pdfUrl: url,
          fileName: "Maengelprotokoll.pdf",
        }),
      });

      if (!res.ok) throw new Error(await res.text());
      window.alert("E-Mail gesendet.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Fehler";
      window.alert(`Mail fehlgeschlagen: ${msg}`);
    }
  }

  async function searchLv(term: string) {
    if (!effectiveProjectId) return;
    try {
      const r = await fetch(
        apiUrl(
          `/api/lookup/lv?projectId=${encodeURIComponent(
            effectiveProjectId
          )}&q=${encodeURIComponent(term)}`
        )
      );
      const d = (await r.json()) as LookupResponse;
      setLvOpts(Array.isArray(d.items) ? d.items : []);
    } catch {}
  }

  async function searchRegie(term: string) {
    if (!effectiveProjectId) return;
    try {
      const r = await fetch(
        apiUrl(
          `/api/lookup/regieberichte?projectId=${encodeURIComponent(
            effectiveProjectId
          )}&q=${encodeURIComponent(term)}`
        )
      );
      const d = (await r.json()) as LookupResponse;
      setRegieOpts(Array.isArray(d.items) ? d.items : []);
    } catch {}
  }

  function openLV(pos?: string) {
    if (!pos) return;
    nav(
      `/mengenermittlung/PositionLV?pos=${encodeURIComponent(
        pos
      )}&project=${encodeURIComponent(effectiveProjectId)}`
    );
  }

  function openRegie(id?: string) {
    if (!id) return;
    nav(
      `/mengenermittlung/regieberichte?rid=${encodeURIComponent(
        id
      )}&project=${encodeURIComponent(effectiveProjectId)}`
    );
  }

  return (
    <div style={shell}>
      <h1>Mängelmanagement KI-gestützt</h1>

      <div style={card}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <label>
            Projekt-ID:&nbsp;
            <input
              style={input}
              value={projectInput}
              onChange={(e) => setProjectInput(e.target.value)}
              placeholder="P-2025-001"
            />
          </label>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={uploadFotos}
          />

          <label>
            KI aktiv:&nbsp;
            <input
              type="checkbox"
              checked={useAI}
              onChange={(e) => setUseAI(e.target.checked)}
            />
          </label>

          <button style={btn} onClick={laden} disabled={!effectiveProjectId || busy}>
            Laden
          </button>

          <button style={btn} onClick={speichern} disabled={!effectiveProjectId || busy}>
            {busy ? "..." : "Speichern"}
          </button>

          <button
            style={btn}
            onClick={() => void exportPdf(items)}
            disabled={!items.length || busy}
          >
            Mängelprotokoll (PDF)
          </button>
        </div>

        <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
          Aktiv: {effectiveProjectId || "kein Projekt gewählt"}
        </div>

        {error && (
          <div style={{ marginTop: 10, color: "#b91c1c", fontSize: 13 }}>
            {error}
          </div>
        )}
      </div>

      <datalist id="lvlist">
        {lvOpts.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </datalist>

      <datalist id="regielist">
        {regieOpts.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </datalist>

      <div style={{ ...card, overflowX: "auto" }}>
        <table style={table}>
          <thead>
            <tr>
              {[
                "Foto",
                "Titel",
                "Beschreibung",
                "Kategorie",
                "Priorität",
                "Status",
                "Ort/Bereich",
                "LV-Pos.",
                "Regiebericht",
                "Fällig am",
                "Verantw.",
                "E-Mail",
                "Notiz",
                "Aktion",
              ].map((h) => (
                <th key={h} style={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {items.map((m, i) => (
              <tr key={m.id}>
                <td style={{ ...td, minWidth: 110 }}>
                  {m.foto ? (
                    <a href={m.foto} target="_blank" rel="noreferrer">
                      Foto
                    </a>
                  ) : (
                    "-"
                  )}
                </td>

                <td style={td}>
                  <input
                    style={input}
                    value={m.titel}
                    onChange={(e) => update(i, { titel: e.target.value })}
                  />
                </td>

                <td style={td}>
                  <input
                    style={input}
                    value={m.beschreibung}
                    onChange={(e) => update(i, { beschreibung: e.target.value })}
                  />
                </td>

                <td style={td}>
                  <input
                    style={input}
                    value={m.kategorie}
                    onChange={(e) => update(i, { kategorie: e.target.value })}
                    placeholder="Erdarbeiten/Leitungen/..."
                  />
                </td>

                <td style={td}>
                  <select
                    style={input}
                    value={m.prioritaet}
                    onChange={(e) =>
                      update(i, {
                        prioritaet: e.target.value as Mangel["prioritaet"],
                      })
                    }
                  >
                    <option value="niedrig">niedrig</option>
                    <option value="mittel">mittel</option>
                    <option value="hoch">hoch</option>
                    <option value="kritisch">kritisch</option>
                  </select>
                </td>

                <td style={td}>
                  <select
                    style={input}
                    value={m.status}
                    onChange={(e) =>
                      update(i, {
                        status: e.target.value as Mangel["status"],
                      })
                    }
                  >
                    <option value="offen">offen</option>
                    <option value="in Bearbeitung">in Bearbeitung</option>
                    <option value="behoben">behoben</option>
                    <option value="abgenommen">abgenommen</option>
                  </select>
                </td>

                <td style={td}>
                  <input
                    style={input}
                    value={m.ort || ""}
                    onChange={(e) => update(i, { ort: e.target.value })}
                  />
                </td>

                <td style={{ ...td, minWidth: 260 }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      style={{ ...input, margin: 0 }}
                      list="lvlist"
                      value={m.lvPos || ""}
                      onChange={(e) => {
                        update(i, { lvPos: e.target.value });
                        void searchLv(e.target.value);
                      }}
                      placeholder="ERD-1001 …"
                    />
                    <button style={btn} onClick={() => openLV(m.lvPos)} disabled={!m.lvPos}>
                      Öffnen
                    </button>
                  </div>
                </td>

                <td style={{ ...td, minWidth: 260 }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      style={{ ...input, margin: 0 }}
                      list="regielist"
                      value={m.regieberichtId || ""}
                      onChange={(e) => {
                        update(i, { regieberichtId: e.target.value });
                        void searchRegie(e.target.value);
                      }}
                      placeholder="RB-2025-…"
                    />
                    <button
                      style={btn}
                      onClick={() => openRegie(m.regieberichtId)}
                      disabled={!m.regieberichtId}
                    >
                      Öffnen
                    </button>
                  </div>
                </td>

                <td style={td}>
                  <input
                    style={input}
                    type="date"
                    value={m.faelligAm || ""}
                    onChange={(e) => update(i, { faelligAm: e.target.value })}
                  />
                </td>

                <td style={td}>
                  <input
                    style={input}
                    value={m.verantwortlicher || ""}
                    onChange={(e) =>
                      update(i, { verantwortlicher: e.target.value })
                    }
                  />
                </td>

                <td style={td}>
                  <input
                    style={input}
                    value={m.email || ""}
                    onChange={(e) => update(i, { email: e.target.value })}
                    placeholder="name@firma.de"
                  />
                </td>

                <td style={td}>
                  <input
                    style={input}
                    value={m.notiz || ""}
                    onChange={(e) => update(i, { notiz: e.target.value })}
                  />
                </td>

                <td style={{ ...td, width: 180 }}>
                  <button style={btn} onClick={() => void notifySingle(m)}>
                    Benachrichtigen
                  </button>
                  <button style={{ ...btn, marginLeft: 6 }} onClick={() => remove(i)}>
                    Entf.
                  </button>
                </td>
              </tr>
            ))}

            {!items.length && (
              <tr>
                <td colSpan={14} style={{ padding: 10, color: "#777" }}>
                  Keine Mängel erfasst.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function isPrioritaet(v: unknown): v is Mangel["prioritaet"] {
  return v === "niedrig" || v === "mittel" || v === "hoch" || v === "kritisch";
}

function normalizeMangel(m: unknown): Mangel {
  const x = (m ?? {}) as Partial<Mangel>;
  return {
    id: String(x.id || crypto.randomUUID()),
    foto: x.foto ? String(x.foto) : undefined,
    titel: String(x.titel || "Mangel"),
    beschreibung: String(x.beschreibung || ""),
    kategorie: String(x.kategorie || "Allgemein"),
    prioritaet: isPrioritaet(x.prioritaet) ? x.prioritaet : "mittel",
    status:
      x.status === "offen" ||
      x.status === "in Bearbeitung" ||
      x.status === "behoben" ||
      x.status === "abgenommen"
        ? x.status
        : "offen",
    ort: x.ort ? String(x.ort) : "",
    lvPos: x.lvPos ? String(x.lvPos) : "",
    regieberichtId: x.regieberichtId ? String(x.regieberichtId) : "",
    faelligAm: x.faelligAm ? String(x.faelligAm) : "",
    verantwortlicher: x.verantwortlicher ? String(x.verantwortlicher) : "",
    notiz: x.notiz ? String(x.notiz) : "",
    erkannt: x.erkannt ? String(x.erkannt) : "",
    erstelltAm: String(x.erstelltAm || new Date().toISOString()),
    email: x.email ? String(x.email) : "",
  };
}

function escapeHtml(s: string) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
