/**
 * RLC Tiefbau 2026 – central personnel and equipment cost anchors.
 *
 * Personnel:
 * - IG BAU / Bauhauptgewerbe tariff effective 2026-04-01.
 * - Bauindustrie 2026 kalkulatorische Lohnzusatzkosten West: 90.7% of Tariflohn.
 * - Internal hourly cost = GTL + 0.907 * TL.
 *
 * Equipment:
 * - 2026 Zeppelin Rental public net day rates are used as market anchors.
 * - Rental day = 8 operating hours.
 * - Internal machine cost includes rental/insurance/service allowance plus
 *   conservative fuel/energy/consumables. Transport is kept separate.
 *
 * IMPORTANT:
 * These are direct/internal cost anchors, NOT customer-facing Regie prices.
 */

export const BAU_LOHNZUSATZ_WEST_2026 = 0.907;

export type PersonnelRateKey =
  | "helper_lg2"
  | "worker_lg3"
  | "facharbeiter_lg4"
  | "spezial_lg5"
  | "polier_lg6"
  | "machine_operator_lg4"
  | "vermessung"
  | "bauleiter";

type TariffAnchor = {
  tl: number;
  bauzuschlag: number;
  gtl: number;
};

export const BAU_TARIFF_2026: Record<string, TariffAnchor> = {
  LG1: { tl: 14.98, bauzuschlag: 0.88, gtl: 15.86 },
  LG2: { tl: 17.69, bauzuschlag: 1.04, gtl: 18.73 },
  LG3: { tl: 22.64, bauzuschlag: 1.33, gtl: 23.97 },
  LG4: { tl: 24.60, bauzuschlag: 1.45, gtl: 26.05 },
  LG5: { tl: 25.77, bauzuschlag: 1.52, gtl: 27.29 },
  LG6: { tl: 28.06, bauzuschlag: 1.66, gtl: 29.72 },
  MACHINE_OPERATOR_LG4: { tl: 24.98, bauzuschlag: 1.47, gtl: 26.45 },
};

export function tariffInternalCost(anchor: TariffAnchor): number {
  return Math.round((anchor.gtl + anchor.tl * BAU_LOHNZUSATZ_WEST_2026) * 100) / 100;
}

export const PERSONNEL_INTERNAL_COST_2026: Record<PersonnelRateKey, number> = {
  helper_lg2: tariffInternalCost(BAU_TARIFF_2026.LG2),           // 34.77
  worker_lg3: tariffInternalCost(BAU_TARIFF_2026.LG3),           // 44.50
  facharbeiter_lg4: tariffInternalCost(BAU_TARIFF_2026.LG4),     // 48.36
  spezial_lg5: tariffInternalCost(BAU_TARIFF_2026.LG5),          // 50.67
  polier_lg6: tariffInternalCost(BAU_TARIFF_2026.LG6),           // 55.17
  machine_operator_lg4: tariffInternalCost(BAU_TARIFF_2026.MACHINE_OPERATOR_LG4), // 49.11

  // Technical staff are not mapped to BRTV wage groups; keep separate market-cost anchors.
  vermessung: 54.0,
  bauleiter: 65.0,
};

export type MachineRateKey =
  | "mini_excavator_2t"
  | "compact_excavator_6t"
  | "excavator_14t"
  | "excavator_22t"
  | "wheel_loader_09"
  | "plate_light"
  | "plate_heavy"
  | "roller_14t"
  | "joint_saw";

export type MachineMarketAnchor = {
  dayRentNet: number;
  dayInsurance: number;
  servicePerDay: number;
  fuelEnergyPerHour: number;
  internalPerHour: number;
  sourceNote: string;
};

function machineInternalPerHour(
  dayRentNet: number,
  dayInsurance: number,
  servicePerDay: number,
  fuelEnergyPerHour: number,
): number {
  return Math.round((((dayRentNet + dayInsurance + servicePerDay) / 8) + fuelEnergyPerHour) * 100) / 100;
}

export const MACHINE_MARKET_2026: Record<MachineRateKey, MachineMarketAnchor> = {
  mini_excavator_2t: {
    // Conservative anchor between small diesel/electric 1.8–2.5 t public rental offers.
    dayRentNet: 95.0,
    dayInsurance: 11.0,
    servicePerDay: 2.0,
    fuelEnergyPerHour: 4.5,
    internalPerHour: machineInternalPerHour(95, 11, 2, 4.5),
    sourceNote: "2026 public rental market, 1.8–2.5 t class",
  },
  compact_excavator_6t: {
    dayRentNet: 139.56,
    dayInsurance: 15.50,
    servicePerDay: 2.0,
    fuelEnergyPerHour: 8.5,
    internalPerHour: machineInternalPerHour(139.56, 15.50, 2.0, 8.5),
    sourceNote: "Zeppelin Rental CAT 305 NG 5.8 t, 2026",
  },
  excavator_14t: {
    dayRentNet: 223.20,
    dayInsurance: 22.0,
    servicePerDay: 4.0,
    fuelEnergyPerHour: 13.5,
    internalPerHour: machineInternalPerHour(223.20, 22.0, 4.0, 13.5),
    sourceNote: "Zeppelin Rental CAT 313 GC 13.7 t / M314 14.9 t class, 2026",
  },
  excavator_22t: {
    dayRentNet: 253.88,
    dayInsurance: 25.50,
    servicePerDay: 4.0,
    fuelEnergyPerHour: 18.0,
    internalPerHour: machineInternalPerHour(253.88, 25.50, 4.0, 18.0),
    sourceNote: "Zeppelin Rental CAT 320 GC 21.9 t, 2026",
  },
  wheel_loader_09: {
    dayRentNet: 123.52,
    dayInsurance: 12.0,
    servicePerDay: 2.0,
    fuelEnergyPerHour: 7.5,
    internalPerHour: machineInternalPerHour(123.52, 12.0, 2.0, 7.5),
    sourceNote: "Zeppelin Rental ZL45/CAT906 ~0.9 m3, 2026",
  },
  plate_light: {
    dayRentNet: 36.02,
    dayInsurance: 4.0,
    servicePerDay: 1.0,
    fuelEnergyPerHour: 1.2,
    internalPerHour: machineInternalPerHour(36.02, 4.0, 1.0, 1.2),
    sourceNote: "Zeppelin Rental CR1 118 kg, 2026",
  },
  plate_heavy: {
    dayRentNet: 65.70,
    dayInsurance: 8.0,
    servicePerDay: 1.0,
    fuelEnergyPerHour: 2.5,
    internalPerHour: machineInternalPerHour(65.70, 8.0, 1.0, 2.5),
    sourceNote: "Zeppelin Rental DPU110 830 kg, 2026",
  },
  roller_14t: {
    dayRentNet: 176.20,
    dayInsurance: 17.50,
    servicePerDay: 4.0,
    fuelEnergyPerHour: 14.0,
    internalPerHour: machineInternalPerHour(176.20, 17.50, 4.0, 14.0),
    sourceNote: "Zeppelin Rental CAT CS14 / CS68 ~14.3 t, 2026",
  },
  joint_saw: {
    dayRentNet: 62.58,
    dayInsurance: 6.50,
    servicePerDay: 1.0,
    fuelEnergyPerHour: 2.2,
    internalPerHour: machineInternalPerHour(62.58, 6.50, 1.0, 2.2),
    sourceNote: "Zeppelin Rental CF1020B, 2026; blade wear separate",
  },
};

export const MACHINE_INTERNAL_COST_2026: Record<MachineRateKey, number> = Object.fromEntries(
  Object.entries(MACHINE_MARKET_2026).map(([key, value]) => [key, value.internalPerHour]),
) as Record<MachineRateKey, number>;

/**
 * Commercial Regie anchors. These are intentionally separate from internal cost.
 * They include company overhead/risk/profit and are used only for customer-facing
 * Regie positions, not as direct recipe costs.
 */
export const COMMERCIAL_REGIE_2026 = {
  // Preserve the already validated RLC customer-facing Regie rates.
  // The 2026 audit changes their internal decomposition, not the selling price.
  helper: 70.11,
  facharbeiter: 82.41,
  spezialbaufacharbeiter: 86.10,
  vorarbeiter: 89.79,
  polier: 95.94,
  bauleiter: 110.00,
  machineOperator: 72.00,

  miniExcavator2tWithOperator: 92.00,
  compactExcavator6tWithOperator: 108.00,
  excavator14tWithOperator: 128.26,
  excavator22tWithOperator: 148.00,
  wheelLoaderWithOperator: 108.90,
  plateLight: 30.25,
  plateHeavy: 38.00,
  roller14tWithOperator: 118.58,
  jointSaw: 48.00,
} as const;
