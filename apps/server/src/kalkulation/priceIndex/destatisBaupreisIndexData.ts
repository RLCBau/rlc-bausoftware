import type { BaupreisIndexPoint } from "./baupreisIndexService";

/*
 * Statistisches Bundesamt (Destatis)
 * GENESIS Tabelle 61261-0004
 *
 * Baupreisindizes Deutschland
 * Ingenieurbau / Bauarbeiten (Tiefbau)
 * Basis 2021 = 100
 * Indizes OHNE Umsatzsteuer
 *
 * Offizielle Quartalswerte:
 * Februar / Mai / August / November
 *
 * Straßenbau:
 * - Bauleistungen am Bauwerk (Tiefbau)
 * - Erdarbeiten
 * - Verkehrswegebau, Oberbauschichten aus Asphalt
 * - Verkehrswegebau, Pflaster, Platten, Einfassungen
 *
 * Kanalbau:
 * - Ortskanäle / Bauleistungen am Bauwerk (Tiefbau)
 */

export const DESTatis_META = {
  table: "61261-0004",
  base: "2021=100",
  taxMode: "OHNE_UMSATZSTEUER",
  referenceMonths: ["Februar", "Mai", "August", "November"],
  source: "Statistisches Bundesamt (Destatis) GENESIS",
} as const;

export const TIEFBAU_SERIES: BaupreisIndexPoint[] = [
  { date: "2021-02-01", index: 97.7 },
  { date: "2021-05-01", index: 99.0 },
  { date: "2021-08-01", index: 100.8 },
  { date: "2021-11-01", index: 102.6 },
  { date: "2022-02-01", index: 107.2 },
  { date: "2022-05-01", index: 116.0 },
  { date: "2022-08-01", index: 119.0 },
  { date: "2022-11-01", index: 122.0 },
  { date: "2023-02-01", index: 126.0 },
  { date: "2023-05-01", index: 127.7 },
  { date: "2023-08-01", index: 128.6 },
  { date: "2023-11-01", index: 129.6 },
  { date: "2024-02-01", index: 132.3 },
  { date: "2024-05-01", index: 133.3 },
  { date: "2024-08-01", index: 135.0 },
  { date: "2024-11-01", index: 135.6 },
  { date: "2025-02-01", index: 137.8 },
  { date: "2025-05-01", index: 139.2 },
  { date: "2025-08-01", index: 139.7 },
  { date: "2025-11-01", index: 140.3 },
  { date: "2026-02-01", index: 142.9 },
  { date: "2026-05-01", index: 147.8 },
];

/*
 * STRASSENBAU = Gesamtindex Bauleistungen am Bauwerk (Tiefbau)
 * innerhalb des Ingenieurbaus Straßenbau.
 */
export const STRASSENBAU_SERIES: BaupreisIndexPoint[] = TIEFBAU_SERIES;

export const ERDARBEITEN_SERIES: BaupreisIndexPoint[] = [
  { date: "2021-02-01", index: 97.9 },
  { date: "2021-05-01", index: 99.2 },
  { date: "2021-08-01", index: 100.7 },
  { date: "2021-11-01", index: 102.2 },
  { date: "2022-02-01", index: 106.7 },
  { date: "2022-05-01", index: 114.0 },
  { date: "2022-08-01", index: 116.6 },
  { date: "2022-11-01", index: 118.9 },
  { date: "2023-02-01", index: 122.7 },
  { date: "2023-05-01", index: 124.5 },
  { date: "2023-08-01", index: 125.5 },
  { date: "2023-11-01", index: 126.5 },
  { date: "2024-02-01", index: 129.1 },
  { date: "2024-05-01", index: 129.9 },
  { date: "2024-08-01", index: 131.8 },
  { date: "2024-11-01", index: 132.6 },
  { date: "2025-02-01", index: 134.7 },
  { date: "2025-05-01", index: 135.9 },
  { date: "2025-08-01", index: 136.5 },
  { date: "2025-11-01", index: 137.2 },
  { date: "2026-02-01", index: 139.5 },
  { date: "2026-05-01", index: 144.2 },
];

export const ASPHALT_SERIES: BaupreisIndexPoint[] = [
  { date: "2021-02-01", index: 98.3 },
  { date: "2021-05-01", index: 99.0 },
  { date: "2021-08-01", index: 100.4 },
  { date: "2021-11-01", index: 102.3 },
  { date: "2022-02-01", index: 107.0 },
  { date: "2022-05-01", index: 118.3 },
  { date: "2022-08-01", index: 122.0 },
  { date: "2022-11-01", index: 125.3 },
  { date: "2023-02-01", index: 129.5 },
  { date: "2023-05-01", index: 131.2 },
  { date: "2023-08-01", index: 132.0 },
  { date: "2023-11-01", index: 133.2 },
  { date: "2024-02-01", index: 136.0 },
  { date: "2024-05-01", index: 137.1 },
  { date: "2024-08-01", index: 138.6 },
  { date: "2024-11-01", index: 139.3 },
  { date: "2025-02-01", index: 141.9 },
  { date: "2025-05-01", index: 143.3 },
  { date: "2025-08-01", index: 143.8 },
  { date: "2025-11-01", index: 144.3 },
  { date: "2026-02-01", index: 147.3 },
  { date: "2026-05-01", index: 153.8 },
];

export const PFLASTER_SERIES: BaupreisIndexPoint[] = [
  { date: "2021-02-01", index: 97.7 },
  { date: "2021-05-01", index: 99.0 },
  { date: "2021-08-01", index: 100.9 },
  { date: "2021-11-01", index: 102.4 },
  { date: "2022-02-01", index: 106.7 },
  { date: "2022-05-01", index: 112.9 },
  { date: "2022-08-01", index: 115.5 },
  { date: "2022-11-01", index: 119.2 },
  { date: "2023-02-01", index: 123.7 },
  { date: "2023-05-01", index: 125.3 },
  { date: "2023-08-01", index: 126.4 },
  { date: "2023-11-01", index: 127.2 },
  { date: "2024-02-01", index: 129.6 },
  { date: "2024-05-01", index: 131.4 },
  { date: "2024-08-01", index: 133.0 },
  { date: "2024-11-01", index: 133.4 },
  { date: "2025-02-01", index: 135.8 },
  { date: "2025-05-01", index: 136.7 },
  { date: "2025-08-01", index: 137.5 },
  { date: "2025-11-01", index: 138.2 },
  { date: "2026-02-01", index: 140.7 },
  { date: "2026-05-01", index: 143.9 },
];

export const KANALBAU_SERIES: BaupreisIndexPoint[] = [
  { date: "2021-02-01", index: 96.8 },
  { date: "2021-05-01", index: 98.9 },
  { date: "2021-08-01", index: 101.0 },
  { date: "2021-11-01", index: 103.3 },
  { date: "2022-02-01", index: 107.5 },
  { date: "2022-05-01", index: 114.8 },
  { date: "2022-08-01", index: 117.5 },
  { date: "2022-11-01", index: 120.2 },
  { date: "2023-02-01", index: 124.3 },
  { date: "2023-05-01", index: 125.8 },
  { date: "2023-08-01", index: 126.6 },
  { date: "2023-11-01", index: 127.3 },
  { date: "2024-02-01", index: 129.6 },
  { date: "2024-05-01", index: 130.6 },
  { date: "2024-08-01", index: 132.1 },
  { date: "2024-11-01", index: 132.5 },
  { date: "2025-02-01", index: 134.3 },
  { date: "2025-05-01", index: 135.6 },
  { date: "2025-08-01", index: 136.1 },
  { date: "2025-11-01", index: 136.4 },
  { date: "2026-02-01", index: 138.4 },
  { date: "2026-05-01", index: 142.2 },
];
