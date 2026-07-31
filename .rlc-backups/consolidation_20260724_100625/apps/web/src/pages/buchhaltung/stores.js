import { nanoid } from "nanoid";
import { usePersistentState } from "../../utils/usePersistentState";
export const useRechnungen = () => usePersistentState("rlc_bh_rechnungen", []);
export const useZahlungen = () => usePersistentState("rlc_bh_zahlungen", []);
export const useLieferscheine = () => usePersistentState("rlc_bh_lieferscheine", []);
export const useDocs = () => usePersistentState("rlc_bh_docs", []);
export const useKassenbuch = () => usePersistentState("rlc_bh_kassenbuch", []);
export const useKostenstellen = () => usePersistentState("rlc_bh_kostenstellen", [
    { id: "root", name: "Projekt", parent: null }
]);
export const helpers = {
    newRechnungNr: (len) => `AR-${String(len + 1).padStart(3, "0")}`,
    id: (n = 10) => nanoid(n)
};
