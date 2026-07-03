import React from "react";
import { BuroAPI } from "../../lib/buro/store";

type Contract = {
  id: string;
  partner: string;
  datum: string;
  wert: number;
  projectId?: string;
};

type DocVersionLike = {
  id?: string;
  fileName?: string;
  size?: number;
  uploadedAt?: string | number;
};

type DocLike = {
  id: string;
  projectId?: string;
  title?: string;
  tags?: string[];
  versions?: DocVersionLike[];
  updatedAt?: string | number;
};

/* ================= STYLES ================= */

const shell = {
  maxWidth: 1000,
  margin: "0 auto",
  padding: "12px 16px",
  fontFamily: "Inter,system-ui,Arial",
} as const;

const table = {
  width: "100%",
  borderCollapse: "collapse" as const,
  fontSize: 13,
} as const;

const thtd = {
  border: "1px solid #e2e8f0",
  padding: "6px 8px",
} as const;

const head = {
  ...thtd,
  background: "#f8fafc",
  fontWeight: 600,
} as const;

const input = {
  width: "100%",
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  padding: "4px 6px",
} as const;

const btn = {
  padding: "6px 10px",
  border: "1px solid #cbd5e1",
  background: "#fff",
  borderRadius: 6,
  fontSize: 13,
  cursor: "pointer",
} as const;

/* ================= HELPERS ================= */

function firstVersion(doc: DocLike): DocVersionLike | undefined {
  return Array.isArray(doc.versions) ? doc.versions[0] : undefined;
}

function toDateInput(value?: string | number): string {
  if (value == null || value === "") return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

/* ================= COMPONENT ================= */

export default function Vertrage() {
  const docs = BuroAPI.use((s) => s.docs) as DocLike[];

  const contracts: Contract[] = docs.map((d) => {
    const v = firstVersion(d);

    return {
      id: d.id,
      partner: d.title || "",
      datum: toDateInput(v?.uploadedAt),
      wert: typeof v?.size === "number" ? v.size : 0,
      projectId: d.projectId,
    };
  });

  const add = () => {
  const created = BuroAPI.addDocument({
    projectId: "",
    tags: ["Vertrag"],
    updatedAt: Date.now(),
  } as any);

  if (created?.id) {
    BuroAPI.updateDocument(
      created.id,
      {
        ...(created as any),
        title: "Neuer Vertrag",
        projectId: "",
        tags: ["Vertrag"],
        updatedAt: Date.now(),
      } as any
    );
  }
};

  const upd = (id: string, patch: Partial<Contract>) => {
    const doc = docs.find((d) => d.id === id);
    if (!doc) return;

    const updated: DocLike = {
      ...doc,
      title: patch.partner ?? doc.title ?? "",
      projectId: patch.projectId ?? doc.projectId,
      updatedAt: Date.now(),
    };

    BuroAPI.updateDocument(id, updated);
  };

  const del = (id: string) => {
    BuroAPI.removeDocument(id);
  };

  return (
    <div style={shell}>
      <h2>Vertragsverwaltung</h2>

      <button style={btn} onClick={add}>
        + Vertrag
      </button>

      <table style={table}>
        <thead>
          <tr>
            <th style={head}>Partner</th>
            <th style={head}>Datum</th>
            <th style={head}>Wert (€)</th>
            <th style={head}>Projekt</th>
            <th style={head}>Aktion</th>
          </tr>
        </thead>

        <tbody>
          {contracts.map((r) => (
            <tr key={r.id}>
              <td style={thtd}>
                <input
                  style={input}
                  value={r.partner}
                  onChange={(e) => upd(r.id, { partner: e.target.value })}
                />
              </td>

              <td style={thtd}>
                <input
                  style={input}
                  type="date"
                  value={r.datum}
                  onChange={(e) => upd(r.id, { datum: e.target.value })}
                />
              </td>

              <td style={thtd}>
                <input
                  style={input}
                  type="number"
                  value={r.wert}
                  onChange={(e) => upd(r.id, { wert: Number(e.target.value) })}
                />
              </td>

              <td style={thtd}>
                <input
                  style={input}
                  value={r.projectId || ""}
                  onChange={(e) => upd(r.id, { projectId: e.target.value })}
                />
              </td>

              <td style={thtd}>
                <button
                  style={{ ...btn, color: "#b91c1c" }}
                  onClick={() => del(r.id)}
                >
                  Löschen
                </button>
              </td>
            </tr>
          ))}

          {contracts.length === 0 && (
            <tr>
              <td
                colSpan={5}
                style={{ ...thtd, textAlign: "center", color: "#777" }}
              >
                Keine Verträge vorhanden
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}





