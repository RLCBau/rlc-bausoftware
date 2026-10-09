import React, { useEffect, useMemo, useState } from "react";
import PageHeader from "../../components/PageHeader";
import Card from "../../components/Card";
import { apiGet, apiPost } from "../../lib/api";

type Dashboard = {
  status: any;
  counters: { events: number; new: number; approved: number; applied: number; rejected: number };
  trends: any[];
  recentEvents: any[];
  recentCandidates: any[];
};

const badge = (text: string) => <span style={{ padding: "3px 8px", borderRadius: 999, background: "#eef2ff", fontSize: 12, fontWeight: 700 }}>{text}</span>;

export default function MarketIntelligence() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("ALL");

  const load = async () => {
    setLoading(true);
    setError("");
    try { setData(await apiGet<Dashboard>("/api/autonomous/market/dashboard")); }
    catch (e: any) { setError(e?.message || "Market Intelligence konnte nicht geladen werden."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const candidates = useMemo(() => (data?.recentCandidates || []).filter((c) => filter === "ALL" || c.status === filter || c.type === filter), [data, filter]);


  const newestMarketDate = useMemo(() => {
    const timestamps = (data?.recentEvents || [])
      .map((event: any) => new Date(event?.publishedAt || "").getTime())
      .filter((value: number) => Number.isFinite(value));

    return timestamps.length
      ? new Date(Math.max(...timestamps))
      : null;
  }, [data]);

  const formatDateTime = (value?: string | null) => {
    if (!value) return "-";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";

    return date.toLocaleString("de-DE");
  };

  const formatMarketDate = (value?: Date | null) => {
    if (!value) return "-";
    return value.toLocaleDateString("de-DE");
  };

  const review = async (id: string, action: "APPROVE" | "REJECT") => {
    await apiPost(`/api/autonomous/market/candidates/${id}/review`, { action });
    await load();
  };

  return (
    <div className="space-y-3 p-4">
      <PageHeader breadcrumb="RLC Module / KI / Market Intelligence" title="Market Intelligence" subtitle="Markt, Preise, Normen und Innovationen – kontrolliert, nachvollziehbar und ohne automatische Datenänderungen." />
      {error && <div className="card" style={{ padding: 14, color: "#991b1b" }}>{error}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(130px, 1fr))", gap: 12 }}>
        {[["Ereignisse", data?.counters.events || 0], ["Neu", data?.counters.new || 0], ["Freigegeben", data?.counters.approved || 0], ["Angewendet", data?.counters.applied || 0], ["Abgelehnt", data?.counters.rejected || 0]].map(([label, value]) => (
          <Card key={String(label)}><div style={{ padding: 14 }}><div style={{ fontSize: 13, opacity: .7 }}>{label}</div><div style={{ fontSize: 28, fontWeight: 800 }}>{value}</div></div></Card>
        ))}
      </div>
      <Card>
        <div style={{ padding: 18 }}>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            flexWrap: "wrap"
          }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>
                Internet- und Marktbeobachtung
              </div>

              <div style={{
                marginTop: 5,
                fontSize: 13,
                opacity: .72
              }}>
                {data?.status?.state === "error"
                  ? "Fehler bei der letzten Marktpr\u00fcfung"
                  : "Automatische Marktpr\u00fcfung aktiv"}
              </div>
            </div>

            <button onClick={() => void load()}>
              Aktualisieren
            </button>
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
            marginTop: 18
          }}>

            <div style={{
              padding: 14,
              border: "1px solid #e5e7eb",
              borderRadius: 12
            }}>
              <div style={{ fontSize: 12, opacity: .65 }}>
                Letzte Systempr\u00fcfung
              </div>
              <div style={{
                marginTop: 5,
                fontSize: 17,
                fontWeight: 800
              }}>
                {formatDateTime(data?.status?.finishedAt)}
              </div>
            </div>

            <div style={{
              padding: 14,
              border: "1px solid #e5e7eb",
              borderRadius: 12
            }}>
              <div style={{ fontSize: 12, opacity: .65 }}>
                Neueste Marktinformation
              </div>
              <div style={{
                marginTop: 5,
                fontSize: 17,
                fontWeight: 800
              }}>
                {formatMarketDate(newestMarketDate)}
              </div>
            </div>

            <div style={{
              padding: 14,
              border: "1px solid #e5e7eb",
              borderRadius: 12
            }}>
              <div style={{ fontSize: 12, opacity: .65 }}>
                N\u00e4chste automatische Pr\u00fcfung
              </div>
              <div style={{
                marginTop: 5,
                fontSize: 17,
                fontWeight: 800
              }}>
                {formatDateTime(data?.status?.nextRunAt)}
              </div>
            </div>

            <div style={{
              padding: 14,
              border: "1px solid #e5e7eb",
              borderRadius: 12
            }}>
              <div style={{ fontSize: 12, opacity: .65 }}>
                Quellen gepr\u00fcft
              </div>
              <div style={{
                marginTop: 5,
                fontSize: 17,
                fontWeight: 800
              }}>
                {data?.status?.sourcesChecked || 0}
              </div>
            </div>

            <div style={{
              padding: 14,
              border: "1px solid #e5e7eb",
              borderRadius: 12
            }}>
              <div style={{ fontSize: 12, opacity: .65 }}>
                Eintr\u00e4ge analysiert
              </div>
              <div style={{
                marginTop: 5,
                fontSize: 17,
                fontWeight: 800
              }}>
                {data?.status?.entriesRead || 0}
              </div>
            </div>

            <div style={{
              padding: 14,
              border: "1px solid #e5e7eb",
              borderRadius: 12
            }}>
              <div style={{ fontSize: 12, opacity: .65 }}>
                Automatisch verworfen
              </div>
              <div style={{
                marginTop: 5,
                fontSize: 17,
                fontWeight: 800
              }}>
                {data?.status?.rejectedEntries || 0}
              </div>
            </div>
          </div>

          <div style={{
            marginTop: 14,
            padding: "11px 13px",
            borderRadius: 10,
            background:
              data?.status?.state === "error"
                ? "#fef2f2"
                : "#f0fdf4",
            color:
              data?.status?.state === "error"
                ? "#991b1b"
                : "#166534",
            fontSize: 13,
            fontWeight: 600
          }}>
            {data?.status?.state === "error"
              ? data?.status?.message
              : (data?.status?.newEvents || 0) > 0
                ? `${data?.status?.newEvents || 0} neue Marktinformationen erkannt.`
                : "Aktuell - keine neuere relevante Marktinformation gefunden."}
          </div>

          <div style={{
            marginTop: 7,
            fontSize: 12,
            opacity: .6
          }}>
            {data?.status?.message}
          </div>
        </div>
      </Card>
      <Card>
        <div style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Markttrends</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            {(data?.trends || []).slice(0, 12).map((t: any) => <div key={t.material} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12 }}><b>{t.material}</b><div>{t.direction} · {t.confidence}%</div><small>{t.eventCount} Quellenhinweise</small></div>)}
          </div>
        </div>
      </Card>
      <Card>
        <div style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>Prüfkandidaten</h3>
            <select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="ALL">Alle</option><option value="NEW">Neu</option><option value="APPROVED">Freigegeben</option><option value="REJECTED">Abgelehnt</option><option value="DATABASE_POSITION">Datenbankpositionen</option><option value="KNOWLEDGE">Knowledge</option><option value="PRICE_SUGGESTION">Preisvorschläge</option></select>
          </div>
          <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
            {candidates.map((c: any) => <div key={c.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><div><b>{c.title}</b><div style={{ display: "flex", gap: 6, marginTop: 6 }}>{badge(c.type)}{badge(c.status)}{badge(`${Math.round((c.confidence || 0) * 100)}%`)}</div></div><div style={{ whiteSpace: "nowrap" }}>{c.status === "NEW" && <><button onClick={() => void review(c.id, "APPROVE")}>Freigeben</button> <button onClick={() => void review(c.id, "REJECT")}>Ablehnen</button></>}</div></div>
              <p style={{ marginBottom: 4 }}>{c.rationale}</p><small>{c.event?.sourceName} · {c.event?.url || "ohne Link"}</small>
            </div>)}
            {!loading && candidates.length === 0 && <div>Keine Kandidaten für diesen Filter.</div>}
          </div>
        </div>
      </Card>
      <Card><div style={{ padding: 16 }}><h3 style={{ marginTop: 0 }}>Neueste Marktereignisse</h3>{(data?.recentEvents || []).map((e: any) => <div key={e.id} style={{ padding: "9px 0", borderBottom: "1px solid #eee" }}><b>{e.title}</b><div style={{ fontSize: 13 }}>{e.sourceName} · Score {e.totalScore}/100 · {new Date(e.publishedAt).toLocaleDateString("de-DE")}</div></div>)}</div></Card>
    </div>
  );
}
