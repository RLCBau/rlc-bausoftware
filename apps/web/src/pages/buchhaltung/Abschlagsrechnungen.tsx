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
  currency: "EUR"
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
    ...(init?.headers || {})
  };

  const res = await fetch(apiUrl(path), {
    ...init,
    headers,
    credentials: "include"
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
  row?.total !== undefined && row?.total !== null ?
  safeNum(row.total) :
  qty * ep;

  return {
    lvPos: safeTrim(row?.lvPos),
    kurztext: safeTrim(row?.kurztext),
    einheit: safeTrim(row?.einheit) || "m",
    qty,
    ep,
    total
  };
}

function normalizeStatus(v: unknown): AbschlagStatus {
  const s = safeTrim(v);
  if (s === "Freigegeben" || s === "Gebucht") return s;
  return "Entwurf";
}

function normalizeItem(item: any): AbschlagItem {
  const rows: AbschlagRow[] = Array.isArray(item?.rows) ?
  item.rows.map(normalizeRow) :
  [];

  const mwst = safeNum(item?.mwst, 19);
  const netto =
  item?.netto !== undefined && item?.netto !== null ?
  safeNum(item.netto) :
  rows.reduce((sum: number, r: AbschlagRow) => sum + safeNum(r.total), 0);

  const brutto =
  item?.brutto !== undefined && item?.brutto !== null ?
  safeNum(item.brutto) :
  netto * (1 + mwst / 100);

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
    rows
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

      const nextItems = Array.isArray(data?.items) ?
      data.items.map(normalizeItem) :
      [];

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
          body: JSON.stringify(payload)
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
      rows: []
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
    <div className="rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-124">
      <div className="rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-125">







        
        <div>
          <nav className="rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-126">
            RLC / 7. Buchhaltung / Abrechnung / Abschlagsrechnungen
          </nav>
          <h2 className="rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-127">Abschlagsrechnungen</h2>
          <div className="rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-128">
            {p ?
            <>
                <b>{p.code}</b> — {p.name}
                {p.place ? <> • {p.place}</> : null}
              </> :

            "Kein Projekt ausgewählt"
            }
          </div>

          {filePath ?
          <div className="rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-129">
              Datei: <span className="rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-130">{filePath}</span>
            </div> :
          null}
        </div>

        <div className="rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-131">
          <button onClick={() => navigate(-1)}>← Zurück</button>

          <button
            onClick={() => void loadFromServer()}
            disabled={loading || !projectKey}>
            
            Laden
          </button>

          <button
            onClick={() => void saveToServer()}
            disabled={loading || !projectKey}>
            
            Speichern
          </button>

          <button
            onClick={() => void createNew()}







            disabled={!projectKey || loading} className="rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-132">
            
            + Neue Abschlagsrechnung
          </button>
        </div>
      </div>

      {info &&
      <div className="rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-133">










        
          {info}
        </div>
      }

      <div className="rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-134">
        <div className="rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-135">







          
          <div className="rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-136">Summe Netto</div>
          <div className="rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-137">
            {fmtEUR(totals.netto)}
          </div>
        </div>

        <div className="rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-138">







          
          <div className="rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-139">Summe Brutto</div>
          <div className="rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-140">
            {fmtEUR(totals.brutto)}
          </div>
        </div>
      </div>

      <div className="rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-141">







        
        <table className="rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-142">
          <thead className="rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-143">
            <tr>
              <th className="rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-144">





                
                Nr.
              </th>
              <th className="rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-145">





                
                Datum
              </th>
              <th className="rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-146">





                
                Titel
              </th>
              <th className="rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-147">





                
                Positionen
              </th>
              <th className="rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-148">





                
                Netto
              </th>
              <th className="rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-149">





                
                Brutto
              </th>
              <th className="rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-150">





                
                Status
              </th>
              <th className="rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-151">





                
                Aktion
              </th>
            </tr>
          </thead>

          <tbody>
            {items.map((a) =>
            <tr key={a.id}>
                <td className="rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-152">





                
                  #{a.nr}
                </td>

                <td className="rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-153">
                  {a.date}
                </td>

                <td className="rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-154">
                  {a.title || ""}
                </td>

                <td className="rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-155">






                
                  {Array.isArray(a.rows) ? a.rows.length : 0}
                </td>

                <td className="rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-156">






                
                  {fmtEUR(a.netto)}
                </td>

                <td className="rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-157">






                
                  {fmtEUR(a.brutto)}
                </td>

                <td className="rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-158">
                  <select
                  value={a.status}
                  onChange={(e) =>
                  void updateStatus(a.id, e.target.value as AbschlagStatus)
                  }





                  disabled={loading} className="rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-159">
                  
                    <option value="Entwurf">Entwurf</option>
                    <option value="Freigegeben">Freigegeben</option>
                    <option value="Gebucht">Gebucht</option>
                  </select>
                </td>

                <td className="rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-160">






                
                  <button
                  onClick={() =>
                  navigate(`/buchhaltung/abschlagsrechnungen/${a.id}`)
                  }
                  disabled={loading}>
                  
                    Öffnen
                  </button>{" "}
                  <button onClick={() => void remove(a.id)} disabled={loading}>
                    Löschen
                  </button>
                </td>
              </tr>
            )}

            {items.length === 0 &&
            <tr>
                <td colSpan={8} className="rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-161">
                  Noch keine Abschlagsrechnungen. Klicke oben auf{" "}
                  <b>„+ Neue Abschlagsrechnung“</b>.
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <div className="rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-162">
        Hinweis: Speichern/Laden erfolgt über{" "}
        <b>data/projects/&lt;projectCode&gt;/abschlaege.json</b>.
      </div>
    </div>);

}
