import { nanoid } from "nanoid";
import { usePersistentState } from "../../utils/usePersistentState";
import {
  Rechnung,
  Zahlung,
  Lieferschein,
  Doc,
  KassenbuchEintrag,
  KostenstellenNode,
} from "./types";

const STORAGE_KEYS = {
  rechnungen: "rlc_bh_rechnungen",
  zahlungen: "rlc_bh_zahlungen",
  lieferscheine: "rlc_bh_lieferscheine",
  docs: "rlc_bh_docs",
  kassenbuch: "rlc_bh_kassenbuch",
  kostenstellen: "rlc_bh_kostenstellen",
} as const;

const DEFAULT_KOSTENSTELLEN: KostenstellenNode[] = [
  { id: "root", name: "Projekt", parent: null },
];

export const useRechnungen = () =>
  usePersistentState<Rechnung[]>(STORAGE_KEYS.rechnungen, []);

export const useZahlungen = () =>
  usePersistentState<Zahlung[]>(STORAGE_KEYS.zahlungen, []);

export const useLieferscheine = () =>
  usePersistentState<Lieferschein[]>(STORAGE_KEYS.lieferscheine, []);

export const useDocs = () =>
  usePersistentState<Doc[]>(STORAGE_KEYS.docs, []);

export const useKassenbuch = () =>
  usePersistentState<KassenbuchEintrag[]>(STORAGE_KEYS.kassenbuch, []);

export const useKostenstellen = () =>
  usePersistentState<KostenstellenNode[]>(
    STORAGE_KEYS.kostenstellen,
    DEFAULT_KOSTENSTELLEN
  );

function safeNumber(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function extractTrailingNumber(value: unknown) {
  const str = String(value ?? "");
  const match = str.match(/(\d+)(?!.*\d)/);
  return match ? safeNumber(match[1], 0) : 0;
}

export const helpers = {
  id: (n = 10) => nanoid(n),

  newRechnungNr: (rows: Array<{ nr?: string | null }>) => {
    const maxNr = (rows || []).reduce((max, row) => {
      return Math.max(max, extractTrailingNumber(row?.nr));
    }, 0);

    return `AR-${String(maxNr + 1).padStart(3, "0")}`;
  },

  newGenericNr: (
    prefix: string,
    rows: Array<{ nr?: string | null; nummer?: string | null }>
  ) => {
    const maxNr = (rows || []).reduce((max, row) => {
      return Math.max(
        max,
        extractTrailingNumber(row?.nr),
        extractTrailingNumber(row?.nummer)
      );
    }, 0);

    return `${prefix}-${String(maxNr + 1).padStart(3, "0")}`;
  },

  storageKeys: STORAGE_KEYS,
};





