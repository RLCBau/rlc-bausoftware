import { rlcClass } from "../../ui/rlcRuntimeStyle";import React from "react";
import { UebergabeDB } from "./store.uebergabe";
import {
  HandoverDoc,
  HandoverItem,
  HandoverSign,
  HandoverAttachment } from
"./types";

/* ================= STYLES ================= */

const inp: React.CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: 6,
  padding: "6px 8px",
  fontSize: 13
};

const lbl: React.CSSProperties = { fontSize: 12, opacity: 0.8 };

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  borderBottom: "1px solid var(--line)",
  fontSize: 13,
  whiteSpace: "nowrap"
};

const td: React.CSSProperties = {
  padding: "6px 10px",
  borderBottom: "1px solid var(--line)",
  fontSize: 13,
  verticalAlign: "middle"
};

/* ================= COMPONENT ================= */

export default function Uebergabe() {
  const [all, setAll] = React.useState<HandoverDoc[]>(UebergabeDB.list());
  const [sel, setSel] = React.useState<HandoverDoc | null>(all[0] ?? null);

  const [q, setQ] = React.useState("");
  const [proj, setProj] = React.useState("");

  const refresh = () => {
    const list = UebergabeDB.list();
    setAll(list);

    // keep selection valid
    if (sel) {
      const found = list.find((x) => x.id === sel.id);
      setSel(found ?? list[0] ?? null);
    }
  };

  /* ================= FILTER ================= */

  const filtered = React.useMemo(() => {
    return all.filter((d) => {
      const s = (
      d.title +
      " " + (
      d.projectId ?? "") +
      " " + (
      d.client ?? "")).
      toLowerCase();

      const okQ = !q || s.includes(q.toLowerCase());
      const okP = !proj || d.projectId === proj;

      return okQ && okP;
    });
  }, [all, q, proj]);

  const projects = React.useMemo(
    () =>
    Array.from(
      new Set(all.map((d) => d.projectId).filter(Boolean))
    ) as string[],
    [all]
  );

  /* ================= ACTIONS ================= */

  const add = () => {
    const d = UebergabeDB.create();
    refresh();
    setSel(d);
  };

  const del = () => {
    if (!sel) return;
    if (!confirm("Protokoll löschen?")) return;

    UebergabeDB.remove(sel.id);
    refresh();
  };

  const up = (p: Partial<HandoverDoc>) => {
    if (!sel) return;

    const next = {
      ...sel,
      ...p,
      updatedAt: Date.now()
    };

    setSel(next);
    UebergabeDB.upsert(next);
    setAll(UebergabeDB.list());
  };

  /* ================= CHECKLIST ================= */

  const addItem = () => {
    if (!sel) return;

    const it: HandoverItem = {
      id: crypto.randomUUID(),
      text: "",
      status: "open",
      note: ""
    };

    up({ checklist: [it, ...(sel.checklist || [])] });
  };

  const delItem = (id: string) => {
    if (!sel) return;

    up({
      checklist: (sel.checklist || []).filter((i) => i.id !== id)
    });
  };

  /* ================= SIGN ================= */

  const addSign = (role: "auftragnehmer" | "auftraggeber") => {
    if (!sel) return;

    pickFile(async (f) => {
      const url = await fileToDataURL(f);

      const s: HandoverSign = {
        role,
        name: "",
        when: new Date().toISOString(),
        image: url
      };

      const signs = { ...(sel.signs || {}) };
      (signs as any)[role] = s;

      up({ signs });
    });
  };

  /* ================= ATTACHMENTS ================= */

  const onDrop = async (ev: React.DragEvent) => {
    ev.preventDefault();
    if (!sel) return;

    const f = ev.dataTransfer.files?.[0];
    if (!f) return;

    await UebergabeDB.attach(sel.id, f);
    refresh();
  };

  const open = (a: HandoverAttachment) => {
    const w = window.open(a.dataURL, "_blank");
    if (!w) alert("Popup blockiert.");
  };

  /* ================= EXPORT ================= */

  const exportCSV = () =>
  download(
    "text/csv;charset=utf-8",
    "uebergabe.csv",
    UebergabeDB.exportCSV(filtered)
  );

  const exportJSON = () =>
  download(
    "application/json",
    "uebergabe_backup.json",
    UebergabeDB.exportJSON()
  );

  const importJSON = () =>
  pickFile(async (f) => {
    const n = UebergabeDB.importJSON(await f.text());
    alert(`Backup importiert: ${n}.`);
    refresh();
  });

  /* ================= UI ================= */

  return (
    <div className="rlc-migrated-pages-buro-uebergabe-tsx-650">
      {/* Toolbar */}
      <div className="card rlc-migrated-pages-buro-uebergabe-tsx-651">
        <button className="btn" onClick={add}>+ Protokoll</button>
        <button className="btn" onClick={del} disabled={!sel}>Löschen</button>

        <div className="rlc-migrated-pages-buro-uebergabe-tsx-652" />

        <input
          placeholder="Suche…"
          value={q}
          onChange={(e) => setQ(e.target.value)} className={rlcClass(null,
          { ...inp, width: 280 })} />
        

        <select
          value={proj}
          onChange={(e) => setProj(e.target.value)} className={rlcClass(null,
          { ...inp, width: 160 })}>
          
          <option value="">Alle Projekte</option>
          {projects.map((p) =>
          <option key={p}>{p}</option>
          )}
        </select>

        <button className="btn" onClick={exportCSV}>Export CSV</button>
        <button className="btn" onClick={importJSON}>Import JSON</button>
        <button className="btn" onClick={exportJSON}>Export JSON</button>
      </div>

      {/* Layout */}
      <div className="rlc-migrated-pages-buro-uebergabe-tsx-653">
        {/* LISTA */}
        <div className="card rlc-migrated-pages-buro-uebergabe-tsx-654">
          {filtered.map((d) =>
          <div
            key={d.id}
            onClick={() => setSel(d)} className={rlcClass(null,
            {
              padding: 10,
              cursor: "pointer",
              background: sel?.id === d.id ? "#eef2ff" : undefined
            })}>
            
              <b>{d.title}</b> — {d.projectId || "—"}
            </div>
          )}
        </div>

        {/* EDITOR */}
        <div className="card" onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
          {!sel ?
          <div>Kein Protokoll gewählt</div> :

          <input
            value={sel.title}
            onChange={(e) => up({ title: e.target.value })} className={rlcClass(null,
            inp)} />

          }
        </div>
      </div>
    </div>);

}

/* ================= UTILS ================= */

function toDateInput(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function fileToDataURL(f: File) {
  return await new Promise<string>((res) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.readAsDataURL(f);
  });
}

function pickFile(onPick: (f: File) => void) {
  const i = document.createElement("input");
  i.type = "file";
  i.onchange = () => {
    const f = i.files?.[0];
    if (f) onPick(f);
  };
  i.click();
}

function download(type: string, name: string, data: string) {
  const b = new Blob([data], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(b);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
