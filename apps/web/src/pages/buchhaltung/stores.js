import { nanoid } from "nanoid";
import { usePersistentState } from "../../utils/usePersistentState";
const STORAGE_KEYS = {
    rechnungen: "rlc_bh_rechnungen",
    zahlungen: "rlc_bh_zahlungen",
    lieferscheine: "rlc_bh_lieferscheine",
    docs: "rlc_bh_docs",
    kassenbuch: "rlc_bh_kassenbuch",
    kostenstellen: "rlc_bh_kostenstellen",
};
const DEFAULT_KOSTENSTELLEN = [
    { id: "root", name: "Projekt", parent: null },
];
export const useRechnungen = () => usePersistentState(STORAGE_KEYS.rechnungen, []);
export const useZahlungen = () => usePersistentState(STORAGE_KEYS.zahlungen, []);
export const useLieferscheine = () => usePersistentState(STORAGE_KEYS.lieferscheine, []);
export const useDocs = () => usePersistentState(STORAGE_KEYS.docs, []);
export const useKassenbuch = () => usePersistentState(STORAGE_KEYS.kassenbuch, []);
export const useKostenstellen = () => usePersistentState(STORAGE_KEYS.kostenstellen, DEFAULT_KOSTENSTELLEN);
function safeNumber(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}
function extractTrailingNumber(value) {
    const str = String(value ?? "");
    const match = str.match(/(\d+)(?!.*\d)/);
    return match ? safeNumber(match[1], 0) : 0;
}
export const helpers = {
    id: (n = 10) => nanoid(n),
    newRechnungNr: (rows) => {
        const maxNr = (rows || []).reduce((max, row) => {
            return Math.max(max, extractTrailingNumber(row?.nr));
        }, 0);
        return `AR-${String(maxNr + 1).padStart(3, "0")}`;
    },
    newGenericNr: (prefix, rows) => {
        const maxNr = (rows || []).reduce((max, row) => {
            return Math.max(max, extractTrailingNumber(row?.nr), extractTrailingNumber(row?.nummer));
        }, 0);
        return `${prefix}-${String(maxNr + 1).padStart(3, "0")}`;
    },
    storageKeys: STORAGE_KEYS,
};
