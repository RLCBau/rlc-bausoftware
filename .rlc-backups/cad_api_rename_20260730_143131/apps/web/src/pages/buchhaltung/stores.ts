import { nanoid } from "nanoid";
import { usePersistentState } from "../../utils/usePersistentState";
import { Rechnung, Zahlung, Lieferschein, Doc, KassenbuchEintrag, KostenstellenNode } from "./types";

export const useRechnungen = () => usePersistentState<Rechnung[]>("rlc_bh_rechnungen", []);
export const useZahlungen  = () => usePersistentState<Zahlung[]>("rlc_bh_zahlungen", []);
export const useLieferscheine = () => usePersistentState<Lieferschein[]>("rlc_bh_lieferscheine", []);
export const useDocs = () => usePersistentState<Doc[]>("rlc_bh_docs", []);
export const useKassenbuch = () => usePersistentState<KassenbuchEintrag[]>("rlc_bh_kassenbuch", []);
export const useKostenstellen = () => usePersistentState<KostenstellenNode[]>("rlc_bh_kostenstellen", [
  { id:"root", name:"Projekt", parent:null }
]);

export const helpers = {
  newRechnungNr: (len:number) => `AR-${String(len+1).padStart(3,"0")}`,
  id: (n=10) => nanoid(n)
};
