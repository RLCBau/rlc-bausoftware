// apps/web/src/lib/cad/store.ts
// Kleiner Mock-Speicher für CAD Import / Export / Dokumente
// Später wird hier API-Anbindung (DB, Backend) ergänzt

export type CADDocument = {
  id: string;
  name: string;
  type: string; // DWG, DXF, PDF, LandXML …
  uploadedAt: string; // ISO / yyyy-mm-dd
  sizeKb: number;
};

const STORAGE_KEY = "rlc.cad.store.v1";

const demoDocs: CADDocument[] = [
  {
    id: "1",
    name: "Bestandsplan.dwg",
    type: "DWG",
    uploadedAt: "2025-10-01",
    sizeKb: 1450,
  },
  {
    id: "2",
    name: "Trasse.xml",
    type: "LandXML",
    uploadedAt: "2025-10-02",
    sizeKb: 320,
  },
];

function safeLoad(): CADDocument[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return demoDocs;

    const parsed = JSON.parse(raw) as CADDocument[];
    if (!Array.isArray(parsed)) return demoDocs;

    return parsed;
  } catch {
    return demoDocs;
  }
}

function persist(next: CADDocument[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

let docs: CADDocument[] = safeLoad();

function nextId() {
  return String(
    docs.reduce((max, d) => Math.max(max, Number(d.id) || 0), 0) + 1
  );
}

/* =========================
   READ
   ========================= */

export function loadDocs(): CADDocument[] {
  return [...docs];
}

// compatibilità col vecchio nome
export function loadDoc(): CADDocument[] {
  return loadDocs();
}

/* =========================
   CREATE
   ========================= */

export function saveDoc(doc: Omit<CADDocument, "id"> & { id?: string }): CADDocument {
  const newDoc: CADDocument = {
    ...doc,
    id: doc.id?.trim() || nextId(),
  };

  docs = [...docs, newDoc];
  persist(docs);
  return newDoc;
}

/* =========================
   UPDATE
   ========================= */

export function updateDoc(id: string, patch: Partial<CADDocument>): CADDocument | null {
  let updated: CADDocument | null = null;

  docs = docs.map((d) => {
    if (d.id !== id) return d;
    updated = { ...d, ...patch, id: d.id };
    return updated;
  });

  persist(docs);
  return updated;
}

/* =========================
   DELETE
   ========================= */

export function deleteDoc(id: string) {
  docs = docs.filter((d) => d.id !== id);
  persist(docs);
}

/* =========================
   RESET / REPLACE
   ========================= */

export function replaceDocs(next: CADDocument[]) {
  docs = Array.isArray(next) ? [...next] : [];
  persist(docs);
}

export function resetDocs() {
  docs = [...demoDocs];
  persist(docs);
}





