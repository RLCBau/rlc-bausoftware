import AsyncStorage from "@react-native-async-storage/async-storage";

/* =========================
 *  Tipi base
 * ========================= */

export type Person = {
  name: string;
  phone?: string;
  email?: string;
};

export type Auftraggeber = {
  company?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  note?: string;
};

/* =========================
 *  Email-Set (Offline Versand / Workflow)
 * ========================= */

export type ProjectEmails = {
  bauleiter?: string;
  buero?: string;
  extern?: string;
};

/* =========================
 *  Ruoli di progetto
 * ========================= */

export type ProjectRoles = {
  /** Interne Hauptrollen */
  bauleiter?: Person;
  abrechnung?: Person;
  buero?: Person;
  polier?: Person;
  vermessung?: Person;

  /** Operative Rollen */
  fahrer?: Person;
  mitarbeiter?: Person;

  /** E-Mail-Empfänger (für Offline/Versand/Prüfung) */
  emails?: ProjectEmails;

  /** Kunde / Auftraggeber */
  auftraggeber?: Auftraggeber;

  /** Weitere interne Ansprechpartner (optional) */
  ansprechpartnerIntern?: {
    einkauf?: Person;
    lager?: Person;
    logistik?: Person;
  };
};

/* =========================
 *  Storage
 * ========================= */

const keyRoles = (projectId: string) => `rlc.project.roles.${projectId}`;

/* =========================
 *  Normalizer (fix legacy formats)
 * ========================= */

function trim(v?: any): string {
  return String(v ?? "").trim();
}

function normalizePerson(input: any): Person | undefined {
  if (!input) return undefined;

  // legacy: "Ciro" -> { name: "Ciro" }
  if (typeof input === "string") {
    const n = trim(input);
    return n ? { name: n } : undefined;
  }

  // legacy: { value: "Ciro" } / { label: "Ciro" } ecc.
  if (typeof input === "object") {
    const name =
      trim((input as any).name) ||
      trim((input as any).value) ||
      trim((input as any).label);

    if (!name) return undefined;

    const phone = trim((input as any).phone) || undefined;
    const email = trim((input as any).email) || undefined;

    return { name, phone, email };
  }

  return undefined;
}

function normalizeEmails(input: any): ProjectEmails | undefined {
  if (!input || typeof input !== "object") return undefined;

  // accetta anche casi strani (es. numeri/null)
  const bauleiter = trim((input as any).bauleiter) || undefined;
  const buero = trim((input as any).buero) || undefined;
  const extern = trim((input as any).extern) || undefined;

  if (!bauleiter && !buero && !extern) return undefined;
  return { bauleiter, buero, extern };
}

function normalizeAuftraggeber(input: any): Auftraggeber | undefined {
  if (!input || typeof input !== "object") return undefined;

  const company = trim((input as any).company) || undefined;
  const contactName = trim((input as any).contactName) || undefined;
  const phone = trim((input as any).phone) || undefined;
  const email = trim((input as any).email) || undefined;
  const note = trim((input as any).note) || undefined;

  if (!company && !contactName && !phone && !email && !note) return undefined;
  return { company, contactName, phone, email, note };
}

function normalizeRoles(raw: any): ProjectRoles {
  const out: ProjectRoles = {};

  out.bauleiter = normalizePerson(raw?.bauleiter);
  out.abrechnung = normalizePerson(raw?.abrechnung);
  out.buero = normalizePerson(raw?.buero);
  out.polier = normalizePerson(raw?.polier);
  out.vermessung = normalizePerson(raw?.vermessung);

  out.fahrer = normalizePerson(raw?.fahrer);
  out.mitarbeiter = normalizePerson(raw?.mitarbeiter);

  out.emails = normalizeEmails(raw?.emails);
  out.auftraggeber = normalizeAuftraggeber(raw?.auftraggeber);

  const ai = raw?.ansprechpartnerIntern;
  if (ai && typeof ai === "object") {
    const einkauf = normalizePerson(ai?.einkauf);
    const lager = normalizePerson(ai?.lager);
    const logistik = normalizePerson(ai?.logistik);

    if (einkauf || lager || logistik) {
      out.ansprechpartnerIntern = {
        einkauf,
        lager,
        logistik,
      };
    }
  }

  return out;
}

/* =========================
 *  API
 * ========================= */

export async function getProjectRoles(projectId: string): Promise<ProjectRoles | null> {
  try {
    const raw = await AsyncStorage.getItem(keyRoles(projectId));
    if (!raw) return null;

    const parsed = JSON.parse(raw);

    // ✅ normalizza sempre (fix “una lettera” / legacy schema)
    const normalized = normalizeRoles(parsed);

    // ✅ (opzionale ma consigliato) migra subito nello storage nel formato nuovo
    // così non ti trascini dietro dati sporchi
    await AsyncStorage.setItem(keyRoles(projectId), JSON.stringify(normalized));

    return normalized;
  } catch {
    return null;
  }
}

export async function setProjectRoles(projectId: string, roles: ProjectRoles): Promise<void> {
  // ✅ normalizza anche in scrittura (evita di salvare roba sporca)
  const normalized = normalizeRoles(roles as any);
  await AsyncStorage.setItem(keyRoles(projectId), JSON.stringify(normalized));
}
