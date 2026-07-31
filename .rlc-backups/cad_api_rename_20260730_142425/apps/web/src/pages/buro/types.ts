export type ID = string;

export type ProjektStatus = "aktiv" | "archiv";

export type Projekt = {
  id: ID;
  name: string;
  baustellenNummer?: string;
  bauleiter?: string;
  ort?: string;
  status: ProjektStatus;
  createdAt: string; // ISO
  updatedAt: string; // ISO
};
// ... (tipi Projekt già presenti)

export type DocID = string;

export type DocVersion = {
  id: DocID;
  fileName: string;
  mime: string;
  size: number;
  uploadedAt: string; // ISO
  dataURL: string;    // base64
};

export type Dokument = {
  id: DocID;
  projektId?: string;     // opzionale link progetto
  title: string;
  tags?: string[];
  versions: DocVersion[]; // [0] = versione più recente
  createdAt: string;
  updatedAt: string;
};
// === Progetti ===
export type ID = string;
export type ProjektStatus = "aktiv" | "archiv";

export type Projekt = {
  id: ID;
  name: string;
  baustellenNummer?: string;
  bauleiter?: string;
  ort?: string;
  status: ProjektStatus;
  createdAt: string;
  updatedAt: string;
};

// === Documenti ===
export type DocID = string;

export type DocVersion = {
  id: DocID;
  fileName: string;
  mime: string;
  size: number;        // bytes
  uploadedAt: string;  // ISO
  dataURL: string;     // base64 (solo locale)
};

export type Dokument = {
  id: DocID;
  projektId?: ID;
  title: string;
  tags?: string[];
  versions: DocVersion[]; // [0] = più recente
  createdAt: string;
  updatedAt: string;
};
export type Dokument = {
  id: string;
  title: string;
  tags?: string[];
  projektId?: string;
  versions: DocVersion[];
  updatedAt: number;

  // nuovi (opzionali)
  status?: "Entwurf" | "Freigegeben" | "Signiert";
  signatures?: { id:string; by:string; role?:string; when:number; imgDataURL:string }[];
  history?: { id:string; when:number; type:"status"|"signature"; message:string }[];
};

export type DocVersion = {
  id: string;
  fileName: string;
  mime?: string;
  size: number;
  uploadedAt: number;
  dataURL: string;
};
export type KAttachment = { id:string; name:string; mime?:string; size:number; dataURL:string };
export type KMessage = {
  id:string; when:number; from:string;
  to?:string[]; cc?:string[];
  subject?:string; body:string;
  attachments: KAttachment[];
};
export type KThread = {
  id:string;
  subject:string;
  projectId?:string;
  participants?:string[];
  messages: KMessage[];
  attachments?: KAttachment[]; // allegati a livello thread
  unreadCount?: number;
  updatedAt: number;
};
export type CalEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  projectId?: string;
  location?: string;
  attendees?: string[];
  notes?: string;
};
export type RlcUser={
  id:string;
  name:string;
  email:string;
  role:"Admin"|"Bauleiter"|"Polier"|"Mitarbeiter"|"Leser";
  active:boolean;
  rights:string[];
};
export type GanttTask={
  id:string;
  name:string;
  projectId?:string;
  start:string; // ISO
  end:string;   // ISO
  progress?:number; // 0-100
  dependsOn?:string[];
  notes?:string;
};
export type EmpAttachment = { id:string; name:string; mime?:string; size:number; dataURL:string };
export type EmpCert = { id:string; name:string; validUntil:string }; // ISO
export type RlcEmployee = {
  id:string;
  name:string;
  role?:string;
  email?:string;
  phone?:string;
  hourlyRate?:number;
  costCenter?:string;
  projects?:string[];
  employmentType?: "Vollzeit" | "Teilzeit" | "Werkvertrag" | "Praktikum";
  contractStart?:string; // ISO
  contractEnd?:string;   // ISO
  vacationTotal?:number;
  vacationTaken?:number;
  certs?: EmpCert[];
  attachments?: EmpAttachment[];
  updatedAt: number;
};
export type MatAttachment={ id:string; name:string; mime?:string; size:number; dataURL:string };
export type MatMove={ id:string; when:string; dir:"IN"|"OUT"; qty:number; projectId?:string; note?:string };
export type MaterialItem={
  id:string; name:string; code?:string; projectId?:string; location?:string;
  unit?:string; stock?:number; minStock?:number; priceNet?:number; supplier?:string;
  moves?:MatMove[]; attachments?:MatAttachment[]; updatedAt:number;
};
export type MachAttachment={ id:string; name:string; mime?:string; size:number; dataURL:string };
export type MaintRecord={ id:string; date:string; hours?:number; notes?:string };
export type Machine={
  id:string; name?:string; type?:string; serial?:string; projectId?:string; location?:string;
  status?:"Betrieb"|"Wartung"|"Außer Betrieb"; hours?:number;
  lastService?:string; serviceIntervalDays?:number; nextService?:string;
  maintenance?:MaintRecord[]; attachments?:MachAttachment[]; updatedAt:number;
};
export type SafetyAttachment = {
  id: string;
  name: string;
  mime: string;
  dataURL: string;
};

export type SafetyRecord = {
  id: string;
  title: string;
  person?: string;
  project?: string;
  date?: string;
  nextDate?: string;
  notes?: string;
  attachments?: SafetyAttachment[];
  updatedAt?: number;
};
export type ResAssign = {
  id: string;
  resourceId: string;   // employeeId o machineId
  date: string;         // YYYY-MM-DD
  projectId?: string;
  hours?: number;       // default 8
  notes?: string;
};
// Übergabe
export type HandoverItem = { id:string; text:string; status:"open"|"ok"|"mangel"; note?:string };
export type HandoverSign = { role:"auftragnehmer"|"auftraggeber"; name?:string; when?:string; image?:string };
export type HandoverAttachment = { id:string; name:string; mime?:string; size?:number; dataURL:string };
export type HandoverDoc = {
  id:string; title:string; projectId?:string; client?:string; address?:string; date?:string;
  status?: "Entwurf" | "Im Gange" | "Abgeschlossen" | "Abgelehnt";
  checklist?: HandoverItem[]; signs?: { auftragnehmer?:HandoverSign; auftraggeber?:HandoverSign };
  attachments?: HandoverAttachment[]; updatedAt?:number;
};

// Lager & Einkauf
export type StockItem = { id:string; name:string; sku?:string; location?:string; price?:number; stock?:number; minStock?:number; updatedAt?:number };
export type PoLine = { id:string; sku:string; name:string; qty:number; price:number };
export type PurchaseOrder = { id:string; number:string; vendor?:string; status?:"Entwurf"|"Bestellt"|"Geliefert"|"Storniert"; deliveryDate?:string; lines?:PoLine[]; updatedAt?:number };
