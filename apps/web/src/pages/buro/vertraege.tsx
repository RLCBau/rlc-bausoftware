import React from "react";
import { DocsDB } from "./store.docs";
import { Dokument, DocVersion } from "./types";

/* ================= STYLES ================= */

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  borderBottom: "1px solid var(--line)",
  fontSize: 13,
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "6px 10px",
  borderBottom: "1px solid var(--line)",
  fontSize: 13,
  verticalAlign: "middle",
};

const lbl: React.CSSProperties = { fontSize: 13, opacity: 0.8 };

const inp: React.CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: 6,
  padding: "6px 8px",
  fontSize: 13,
};

/* ================= TYPES ================= */

type Sig = {
  id: string;
  by: string;
  role?: string;
  when: number;
  imgDataURL: string;
};

type Hist = {
  id: string;
  when: number;
  type: "status" | "signature";
  message: string;
};

/* ================= COMPONENT ================= */

export default function Dokumente() {
  const [all, setAll] = React.useState<Dokument[]>(DocsDB.list());
  const [selId, setSelId] = React.useState<string | null>(
    all[0]?.id ?? null
  );

  const [q, setQ] = React.useState("");
  const [tagFilter, setTagFilter] = React.useState("");
  const [zoom, setZoom] = React.useState(1);
  const [showSig, setShowSig] = React.useState(false);

  const sel = all.find((d) => d.id === selId) ?? null;
  const cur: DocVersion | undefined = sel?.versions?.[0];

  const refresh = () => {
    const list = DocsDB.list();
    setAll(list);

    if (selId) {
      const exists = list.find((x) => x.id === selId);
      if (!exists) setSelId(list[0]?.id ?? null);
    }
  };

  /* ================= SAFE HELPERS ================= */

  const getStatus = () => ((sel as any)?.status as string) || "Entwurf";
  const getSigs = () => ((sel as any)?.signatures as Sig[]) || [];
  const getHist = () => ((sel as any)?.history as Hist[]) || [];

  const patch = (p: Partial<Dokument> & any) => {
    if (!sel) return;

    DocsDB.upsert({
      ...sel,
      ...p,
      updatedAt: Date.now(),
    });

    refresh();
  };

  /* ================= ACTIONS ================= */

  const addDoc = () => {
    const d = DocsDB.create();
    refresh();
    setSelId(d.id);
  };

  const delDoc = () => {
    if (!sel) return;
    if (!confirm("Dokument löschen?")) return;

    DocsDB.remove(sel.id);
    refresh();
  };

  const update = (p: Partial<Dokument>) => {
    if (!sel) return;
    DocsDB.upsert({ ...sel, ...p });
    refresh();
  };

  /* ================= VERSION ================= */

  const uploadNewVersion = async () =>
    pickFile(async (f) => {
      if (!sel) return;
      await DocsDB.addVersion(sel.id, f);
      addHist("status", `Neue Version: ${f.name}`);
      refresh();
    });

  const onDrop = async (ev: React.DragEvent) => {
    ev.preventDefault();
    if (!sel) return;

    const f = ev.dataTransfer.files?.[0];
    if (!f) return;

    await DocsDB.addVersion(sel.id, f);
    addHist("status", `Neue Version (Drag&Drop): ${f.name}`);
    refresh();
  };

  /* ================= HISTORY ================= */

  const addHist = (type: "status" | "signature", message: string) => {
    if (!sel) return;

    const hist = getHist();

    const rec: Hist = {
      id: crypto.randomUUID(),
      when: Date.now(),
      type,
      message,
    };

    patch({ history: [rec, ...hist] });
  };

  /* ================= FILTER ================= */

  const filtered = React.useMemo(() => {
    return all.filter((d) => {
      const s = (
        d.title +
        " " +
        (d.tags ?? []).join(" ")
      ).toLowerCase();

      const okQ = !q || s.includes(q.toLowerCase());
      const okT =
        !tagFilter ||
        (d.tags ?? []).map((t) => t.toLowerCase()).includes(tagFilter.toLowerCase());

      return okQ && okT;
    });
  }, [all, q, tagFilter]);

  const allTags = React.useMemo(
    () =>
      Array.from(
        new Set(all.flatMap((d) => d.tags ?? []))
      ).sort(),
    [all]
  );

  /* ================= PREVIEW ================= */

  const renderPreview = (v?: DocVersion) => {
    if (!v) return <div style={{ opacity: 0.6 }}>Keine Vorschau.</div>;

    const isPDF = (v.mime || "").includes("pdf");
    const isImg = (v.mime || "").startsWith("image/");

    return isPDF ? (
      <iframe src={v.dataURL} style={{ width: "100%", height: "100%" }} />
    ) : isImg ? (
      <img src={v.dataURL} style={{ width: "100%" }} />
    ) : (
      <div>Keine Vorschau verfügbar</div>
    );
  };

  /* ================= UI ================= */

  return (
    <div style={{ padding: 10 }}>
      <button onClick={addDoc}>+ Dokument</button>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
        <div>
          {filtered.map((d) => (
            <div key={d.id} onClick={() => setSelId(d.id)}>
              {d.title}
            </div>
          ))}
        </div>

        <div>{renderPreview(cur)}</div>
      </div>
    </div>
  );
}

/* ================= UTILS ================= */

function pickFile(onPick: (f: File) => void) {
  const i = document.createElement("input");
  i.type = "file";
  i.onchange = () => {
    const f = i.files?.[0];
    if (f) onPick(f);
  };
  i.click();
}





