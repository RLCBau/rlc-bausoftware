// apps/mobile/src/navigation/types.ts

/**
 * Policy (offline-first reale):
 * - projectId = UUID server o local-...
 * - projectCode = FS-key (BA-... oppure local-...)
 */

/* =====================
 *  BASE
 * ===================== */

export type ProjectBaseParams = {
  projectId: string;
  title?: string;
  projectCode?: string;
};

export type ProjectFsParams = {
  projectId: string;
  projectCode: string; // ✅ obbligatorio
  title?: string;
};

/* =====================
 *  MODALITÀ
 * ===================== */

export type ArbeitsmodusType = "NUR_APP" | "SERVER_SYNC";

/* =====================
 *  KALKULATION / KI MOBILE
 * ===================== */

export type KalkulationFilterType =
  | "ALL"
  | "KRITISCH"
  | "PRUEFHINWEISE"
  | "PRUEFPFLICHTIG"
  | "OUTLIER"
  | "OHNE_PREIS"
  | "DOPPELTE";

export type KalkulationSourceType =
  | "server"
  | "local"
  | "ki"
  | "database"
  | "manual"
  | "x84-benchmark"
  | "unknown";

export type KalkulationPositionRefParams = ProjectFsParams & {
  positionId?: string;
  posNr?: string;
  filter?: KalkulationFilterType;
  source?: KalkulationSourceType;
};

/* =====================
 *  COPILOT MOBILE
 * ===================== */

export type RlcCopilotEntryMode =
  | "free_chat"
  | "project_chat"
  | "kalkulation"
  | "outlier"
  | "position";

export type RlcCopilotParams = ProjectBaseParams & {
  projectCode?: string;
  initialMessage?: string;
  entryMode?: RlcCopilotEntryMode;
  positionId?: string;
  posNr?: string;
  returnScreen?: keyof RootStackParamList;
};

/* =====================
 *  ROOT STACK
 * ===================== */

export type RootStackParamList = {
  /* ===== CORE ===== */

  Start: undefined;

  Inbox:
    | {
        projectId?: string;
        projectCode?: string;
        title?: string;
      }
    | undefined;

  SupportChat:
    | (ProjectBaseParams & {
        initialMessage?: string;
        screen?: keyof RootStackParamList; // ✅ FIX FORTE
      })
    | undefined;

  Arbeitsmodus: { force?: boolean } | undefined;

  Login: {
    mode: ArbeitsmodusType;
  };

  CompanyAdmin: undefined;
  CompanyOfflineSetup: undefined;
  CompanyImport:
    | {
        mode?: ArbeitsmodusType;
      }
    | undefined;

  Projects: undefined;

  ProjectHome: ProjectBaseParams;

  ProjectPdfs: {
    projectFsKey: string;
    title?: string;
  };

  PdfViewer: {
    uri: string;
    title?: string;
    projectId?: string;
    projectCode?: string;
    documentType?: string;
  };

  Anmelden: ProjectBaseParams;

  /* ===== WORKFLOW ===== */

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

  /* ===== BAUTAGEBUCH / TAGESBERICHT ===== */

  Bautagebuch: ProjectFsParams;

  TagesberichtList: ProjectFsParams;

  TagesberichtEditor: ProjectFsParams & {
    tagesberichtId?: string;
    fromInbox?: boolean; // ✅ AGGIUNTO (come Regie)
  };

  /* ===== META ===== */

  TeamRoles: ProjectBaseParams;

  LvReadOnly: ProjectBaseParams;

  LvImport: ProjectFsParams & {
    importMode?: "READ_ONLY" | "SERVER_IMPORT" | "LOCAL_PREVIEW";
    returnScreen?: keyof RootStackParamList;
  };

  /* =====================
   *  KALKULATION / KI
   * ===================== */

  Kalkulation: ProjectFsParams & {
    filter?: KalkulationFilterType;
    focusPosNr?: string;
    focusPositionId?: string;
  };

  KiCalculation: ProjectFsParams & {
    forceRecalculate?: boolean;
    selectedPositionId?: string;
    selectedPosNr?: string;
    returnScreen?: keyof RootStackParamList;
  };

  KalkulationOutlier: ProjectFsParams & {
    filter?: KalkulationFilterType;
    selectedPositionId?: string;
    selectedPosNr?: string;
    returnScreen?: keyof RootStackParamList;
  };

  RlcCopilot: RlcCopilotParams | undefined;

  /* =====================
   *  ANGEBOT
   * ===================== */

  AngebotList: ProjectFsParams;

  AngebotEditor: ProjectFsParams & {
    angebotId?: string;
  };

  /* =====================
   *  MENGENERMITTLUNG
   * ===================== */

  MengenList: ProjectFsParams;

  MengenEditor: ProjectFsParams & {
    mengenId?: string;

    /* collegamenti */
    angebotId?: string;
  };

  /* =====================
   *  RECHNUNG
   * ===================== */

  RechnungList: ProjectFsParams;

  RechnungEditor: ProjectFsParams & {
    rechnungId?: string;

    /* collegamenti */
    fromAngebotId?: string;
    fromMengen?: boolean;
    mengenId?: string;

    /* tipo fattura */
    typ?: "RECHNUNG" | "ABSCHLAG" | "SCHLUSS";
  };

  /* =====================
   *  ABSCHLAG
   * ===================== */

  AbschlagList: ProjectFsParams;

  AbschlagEditor: ProjectFsParams & {
    rechnungId?: string;

    angebotId?: string;
    fromMengen?: boolean;
    mengenId?: string;

    abschlagNr?: number | string;
    inboxSnapshot?: any;
    fromInbox?: boolean;
  };

  /* =====================
   *  SCHLUSSRECHNUNG
   * ===================== */

  Schlussrechnung: ProjectFsParams & {
    rechnungId?: string;
    angebotId?: string;
    fromMengen?: boolean;
    mengenId?: string;
  };
};

