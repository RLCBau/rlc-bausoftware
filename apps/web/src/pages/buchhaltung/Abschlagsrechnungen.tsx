import { API_BASE } from "../../lib/apiBase";
// apps/web/src/pages/buchhaltung/Abschlagsrechnungen.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProject } from "../../store/useProject";
import "./styles.css";

function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${p}` : p;
}

type AbschlagStatus = "Entwurf" | "Freigegeben" | "Gebucht";

type AbschlagRow = {
  lvPos: string;
  kurztext: string;
  einheit: string;
  qty: number;
  ep: number;
  total: number;
};

type AbschlagItem = {
  id: string;
  projectId: string;
  nr: number;
  date: string;
  title?: string;
  netto: number;
  mwst: number;
  brutto: number;
  status: AbschlagStatus;
  rows: AbschlagRow[];
};

const fmtEUR = (v: number) =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(safeNum(v));

function safeTrim(v: unknown) {
  return String(v ?? "").trim();
}

function safeNum(x: unknown, fallback = 0) {
  if (x === null || x === undefined || x === "") return fallback;
  const normalized =
    typeof x === "string" ? x.replace(/\s/g, "").replace(",", ".") : x;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : fallback;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function uuid() {
  try {
    if ((globalThis as any)?.crypto?.randomUUID) {
      return (globalThis as any).crypto.randomUUID();
    }
  } catch {}
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = {
    "Content-Type": "application/json",
    ...(init?.headers || {}),
  };

  const res = await fetch(apiUrl(path), {
    ...init,
    headers,
    credentials: "include",
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `Server-Fehler (${res.status})`);
  }

  return (await res.json()) as T;
}

function normalizeRow(row: any): AbschlagRow {
  const qty = safeNum(row?.qty);
  const ep = safeNum(row?.ep);
  const total =
    row?.total !== undefined && row?.total !== null
      ? safeNum(row.total)
      : qty * ep;

  return {
    lvPos: safeTrim(row?.lvPos),
    kurztext: safeTrim(row?.kurztext),
    einheit: safeTrim(row?.einheit) || "m",
    qty,
    ep,
    total,
  };
}

function normalizeStatus(v: unknown): AbschlagStatus {
  const s = safeTrim(v);
  if (s === "Freigegeben" || s === "Gebucht") return s;
  return "Entwurf";
}

function normalizeItem(item: any): AbschlagItem {
  const rows: AbschlagRow[] = Array.isArray(item?.rows)
    ? item.rows.map(normalizeRow)
    : [];

  const mwst = safeNum(item?.mwst, 19);
  const netto =
    item?.netto !== undefined && item?.netto !== null
      ? safeNum(item.netto)
      : rows.reduce((sum: number, r: AbschlagRow) => sum + safeNum(r.total), 0);

  const brutto =
    item?.brutto !== undefined && item?.brutto !== null
      ? safeNum(item.brutto)
      : netto * (1 + mwst / 100);

  return {
    id: safeTrim(item?.id) || uuid(),
    projectId: safeTrim(item?.projectId),
    nr: safeNum(item?.nr),
    date: safeTrim(item?.date) || todayIso(),
    title: safeTrim(item?.title),
    netto,
    mwst,
    brutto,
    status: normalizeStatus(item?.status),
    rows,
  };
}

export default function AbschlagsrechnungenPage() {
  const { currentProject, getSelectedProject } = useProject() as any;
  const navigate = useNavigate();

  const p = currentProject || getSelectedProject?.() || null;
  const projectKey = safeTrim(p?.code);
  const projectId = safeTrim(p?.id) || projectKey || "_none_";
  const mwstDefault = 19;

  const [items, setItems] = useState<AbschlagItem[]>([]);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filePath, setFilePath] = useState<string | null>(null);

  const totals = useMemo(() => {
    const netto = items.reduce((s, a) => s + safeNum(a.netto), 0);
    const brutto = items.reduce((s, a) => s + safeNum(a.brutto), 0);
    return { netto, brutto };
  }, [items]);

  async function loadFromServer() {
    if (!projectKey) {
      setItems([]);
      setInfo("Kein Projekt ausgewählt.");
      setFilePath(null);
      return;
    }

    setLoading(true);
    setInfo(null);

    try {
      const data: any = await apiJson(
        `/api/abschlag/list/${encodeURIComponent(projectKey)}`
      );

      const nextItems = Array.isArray(data?.items)
        ? data.items.map(normalizeItem)
        : [];

      setItems(nextItems);
      setFilePath(data?.file || null);
    } catch (e: any) {
      setItems([]);
      setInfo((e?.message || "Fehler beim Laden") + `\n\nAPI: ${API_BASE || "(relative)"}`);
    } finally {
      setLoading(false);
    }
  }

  async function saveToServer(nextItems?: AbschlagItem[]) {
    if (!projectKey) {
      setInfo("Kein Projekt ausgewählt.");
      return;
    }

    setLoading(true);
    setInfo(null);

    try {
      const normalized = (nextItems ?? items).map(normalizeItem);
      const payload = { items: normalized };

      const data: any = await apiJson(
        `/api/abschlag/save/${encodeURIComponent(projectKey)}`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );

      setItems(normalized);
      setFilePath(data?.file || null);
      setInfo(
        `Gespeichert (${data?.saved ?? normalized.length} Abschlagsrechnung(en)).`
      );
    } catch (e: any) {
      setInfo((e?.message || "Fehler beim Speichern") + `\n\nAPI: ${API_BASE || "(relative)"}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectKey]);

  const createNew = async () => {
    if (!projectKey || loading) return;

    const nextNr =
      (items.reduce((m, x) => Math.max(m, safeNum(x.nr)), 0) || 0) + 1;

    const a: AbschlagItem = {
      id: uuid(),
      projectId,
      nr: nextNr,
      date: todayIso(),
      title: `Abschlagsrechnung ${nextNr}`,
      netto: 0,
      mwst: mwstDefault,
      brutto: 0,
      status: "Entwurf",
      rows: [],
    };

    const next = [a, ...items];
    setItems(next);
    await saveToServer(next);
  };

  const remove = async (id: string) => {
    if (!confirm("Abschlagsrechnung löschen?")) return;
    const next = items.filter((x) => x.id !== id);
    setItems(next);
    await saveToServer(next);
  };

  const updateStatus = async (id: string, status: AbschlagStatus) => {
    const next = items.map((x) =>
      x.id === id ? normalizeItem({ ...x, status }) : x
    );
    setItems(next);
    await saveToServer(next);
  };

  return (
    <div style={{ padding: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <nav style={{ color: "#888", fontSize: 13 }}>
            RLC / 7. Buchhaltung / Abrechnung / Abschlagsrechnungen
          </nav>
          <h2 style={{ margin: "6px 0 0 0" }}>Abschlagsrechnungen</h2>
          <div style={{ color: "#666", marginTop: 6 }}>
            {p ? (
              <>
                <b>{p.code}</b> — {p.name}
                {p.place ? <> • {p.place}</> : null}
              </>
            ) : (
              "Kein Projekt ausgewählt"
            )}
          </div>

          {filePath ? (
            <div style={{ color: "#888", marginTop: 6, fontSize: 12 }}>
              Datei: <span style={{ fontFamily: "monospace" }}>{filePath}</span>
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => navigate(-1)}>← Zurück</button>

          <button
            onClick={() => void loadFromServer()}
            disabled={loading || !projectKey}
          >
            Laden
          </button>

          <button
            onClick={() => void saveToServer()}
            disabled={loading || !projectKey}
          >
            Speichern
          </button>

          <button
            onClick={() => void createNew()}
            style={{
              fontWeight: 700,
              border: "1px solid #2b7",
              background: "#eafff4",
              padding: "8px 10px",
              borderRadius: 8,
            }}
            disabled={!projectKey || loading}
          >
            + Neue Abschlagsrechnung
          </button>
        </div>
      </div>

      {info && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #FECACA",
            background: "#FEF2F2",
            color: "#991B1B",
            fontSize: 13,
            whiteSpace: "pre-wrap",
          }}
        >
          {info}
        </div>
      )}

      <div style={{ marginTop: 14, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div
          style={{
            border: "1px solid #eee",
            borderRadius: 12,
            padding: 12,
            minWidth: 220,
            background: "#fff",
          }}
        >
          <div style={{ color: "#666" }}>Summe Netto</div>
          <div style={{ fontWeight: 800, fontSize: 18 }}>
            {fmtEUR(totals.netto)}
          </div>
        </div>

        <div
          style={{
            border: "1px solid #eee",
            borderRadius: 12,
            padding: 12,
            minWidth: 220,
            background: "#fff",
          }}
        >
          <div style={{ color: "#666" }}>Summe Brutto</div>
          <div style={{ fontWeight: 800, fontSize: 18 }}>
            {fmtEUR(totals.brutto)}
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 14,
          border: "1px solid #eee",
          borderRadius: 12,
          overflow: "hidden",
          background: "#fff",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead style={{ background: "#fafafa" }}>
            <tr>
              <th
                style={{
                  textAlign: "left",
                  padding: 12,
                  borderBottom: "1px solid #eee",
                }}
              >
                Nr.
              </th>
              <th
                style={{
                  textAlign: "left",
                  padding: 12,
                  borderBottom: "1px solid #eee",
                }}
              >
                Datum
              </th>
              <th
                style={{
                  textAlign: "left",
                  padding: 12,
                  borderBottom: "1px solid #eee",
                }}
              >
                Titel
              </th>
              <th
                style={{
                  textAlign: "right",
                  padding: 12,
                  borderBottom: "1px solid #eee",
                }}
              >
                Positionen
              </th>
              <th
                style={{
                  textAlign: "right",
                  padding: 12,
                  borderBottom: "1px solid #eee",
                }}
              >
                Netto
              </th>
              <th
                style={{
                  textAlign: "right",
                  padding: 12,
                  borderBottom: "1px solid #eee",
                }}
              >
                Brutto
              </th>
              <th
                style={{
                  textAlign: "left",
                  padding: 12,
                  borderBottom: "1px solid #eee",
                }}
              >
                Status
              </th>
              <th
                style={{
                  textAlign: "right",
                  padding: 12,
                  borderBottom: "1px solid #eee",
                }}
              >
                Aktion
              </th>
            </tr>
          </thead>

          <tbody>
            {items.map((a) => (
              <tr key={a.id}>
                <td
                  style={{
                    padding: 12,
                    borderBottom: "1px solid #f3f3f3",
                    fontWeight: 800,
                  }}
                >
                  #{a.nr}
                </td>

                <td style={{ padding: 12, borderBottom: "1px solid #f3f3f3" }}>
                  {a.date}
                </td>

                <td style={{ padding: 12, borderBottom: "1px solid #f3f3f3" }}>
                  {a.title || ""}
                </td>

                <td
                  style={{
                    padding: 12,
                    borderBottom: "1px solid #f3f3f3",
                    textAlign: "right",
                    fontWeight: 800,
                  }}
                >
                  {Array.isArray(a.rows) ? a.rows.length : 0}
                </td>

                <td
                  style={{
                    padding: 12,
                    borderBottom: "1px solid #f3f3f3",
                    textAlign: "right",
                    fontWeight: 700,
                  }}
                >
                  {fmtEUR(a.netto)}
                </td>

                <td
                  style={{
                    padding: 12,
                    borderBottom: "1px solid #f3f3f3",
                    textAlign: "right",
                    fontWeight: 700,
                  }}
                >
                  {fmtEUR(a.brutto)}
                </td>

                <td style={{ padding: 12, borderBottom: "1px solid #f3f3f3" }}>
                  <select
                    value={a.status}
                    onChange={(e) =>
                      void updateStatus(a.id, e.target.value as AbschlagStatus)
                    }
                    style={{
                      padding: "6px 10px",
                      border: "1px solid #ddd",
                      borderRadius: 8,
                    }}
                    disabled={loading}
                  >
                    <option value="Entwurf">Entwurf</option>
                    <option value="Freigegeben">Freigegeben</option>
                    <option value="Gebucht">Gebucht</option>
                  </select>
                </td>

                <td
                  style={{
                    padding: 12,
                    borderBottom: "1px solid #f3f3f3",
                    textAlign: "right",
                    whiteSpace: "nowrap",
                  }}
                >
                  <button
                    onClick={() =>
                      navigate(`/buchhaltung/abschlagsrechnungen/${a.id}`)
                    }
                    disabled={loading}
                  >
                    Öffnen
                  </button>{" "}
                  <button onClick={() => void remove(a.id)} disabled={loading}>
                    Löschen
                  </button>
                </td>
              </tr>
            ))}

            {items.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: 14, color: "#777" }}>
                  Noch keine Abschlagsrechnungen. Klicke oben auf{" "}
                  <b>„+ Neue Abschlagsrechnung“</b>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 10, color: "#777", fontSize: 12 }}>
        Hinweis: Speichern/Laden erfolgt über{" "}
        <b>data/projects/&lt;projectCode&gt;/abschlaege.json</b>.
      </div>
    </div>
  );
}










