// apps/mobile/src/navigation/types.ts

/**
 * Policy (reale, offline-first):
 * - projectId: identificatore progetto (UUID dal server O local-... in NUR_APP)
 * - projectCode: FS-key per storage/filesystem:
 *   - se BA esiste => "BA-2025-001"
 *   - altrimenti => "local-..." (mai vuoto nelle screens FS)
 */

/** =====================
 *  Base params
 *  ===================== */
export type ProjectBaseParams = {
  projectId: string; // UUID o local-...
  title?: string;
  projectCode?: string; // BA-... opzionale (solo se disponibile)
};

/** Screens che DEVONO avere una FS-key per storage locale */
export type ProjectFsParams = {
  projectId: string; // UUID o local-... (compat)
  projectCode: string; // ✅ REQUIRED: FS-key (BA-... oppure local-...)
  title?: string;
};

/** =====================
 *  Arbeitsmodus
 *  ===================== */
export type ArbeitsmodusType = "NUR_APP" | "SERVER_SYNC";

/** =====================
 *  Root Stack
 *  ===================== */
export type RootStackParamList = {
  /** Landing */
  Start: undefined;

  /** Inbox (può essere globale o filtrata su un progetto) */
  Inbox:
    | {
        projectId?: string; // UUID o local-...
        projectCode?: string; // FS-key (BA-... o local-...)
        title?: string;
      }
    | undefined;

      /** ✅ Support Chat (Server) */
  SupportChat:
    | (ProjectBaseParams & {
        /** opzionale: per prefill UI */
        initialMessage?: string;
        screen?: string; // es: "ProjectHome", "Inbox", ecc.
      })
    | undefined;


  /** Mode switcher / setup */
  Arbeitsmodus: { force?: boolean } | undefined;

  /** Login (server / offline) */
  Login: {
    mode: ArbeitsmodusType;
  };

  /** ✅ Company / Branding */
  CompanyAdmin: undefined; // SERVER_SYNC
  CompanyOfflineSetup: undefined; // NUR_APP
  CompanyImport:
    | {
        mode?: ArbeitsmodusType;
      }
    | undefined;

  /** Lista progetti */
  Projects: undefined;

  /** Home del progetto (base: può entrare anche senza FS-key risolta) */
  ProjectHome: ProjectBaseParams;

  /** Lista PDF del progetto (FS-key obbligatoria) */
  ProjectPdfs: {
    projectFsKey: string; // FS-key (BA-... o local-...)
    title?: string;
  };

  /** Viewer PDF */
  PdfViewer: {
    uri: string;
    title?: string;
  };

  /** Anmeldung (LEGACY / COMPAT) */
  Anmelden: ProjectBaseParams;

  /** Workflow docs (FS required) */
  Regie: ProjectFsParams & {
    editId?: string;
    fromInbox?: boolean;
  };

  Lieferschein: ProjectFsParams & {
    editId?: string;
    fromInbox?: boolean;
  };

  PhotosNotes: ProjectFsParams;

  EingangPruefung: ProjectFsParams;

  /** Projekt-Metadaten */
  TeamRoles: ProjectBaseParams;

  /** LV (Read Only) */
  LvReadOnly: ProjectBaseParams;
};
