// apps/web/src/lib/cad/store.ts
// Kleiner Mock-Speicher für CAD Import / Export / Dokumente
// Später wird hier API-Anbindung (DB, Backend) ergänzt

export type CADDocument = {
  id: string;
  name: string;
  type: string; // DWG, DXF, PDF, LandXML …
  uploadedAt: string;
  sizeKb: number;
};

let docs: CADDocument[] = [
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

export function loadDoc(): CADDocument[] {
  return docs;
}

export function saveDoc(doc: CADDocument) {
  docs = [...docs, { ...doc, id: String(docs.length + 1) }];
}

export function deleteDoc(id: string) {
  docs = docs.filter((d) => d.id !== id);
}
