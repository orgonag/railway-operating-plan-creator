/** Plain words for the enumerations people pick from. */

import type { CarType, FacilityKind, LocoType } from "./types";

export const CAR_TYPE_LABELS: Record<CarType, string> = {
  generic: "Car (generic)",
  boxcar_50: "Boxcar, 50 ft",
  boxcar_60: "Boxcar, 60 ft",
  covered_hopper_small: "Covered hopper, small",
  covered_hopper_large: "Covered hopper, large",
  covered_hopper_plastics: "Covered hopper, plastics",
  open_hopper: "Open hopper",
  gondola: "Gondola",
  tank_general: "Tank car",
  tank_pressure: "Tank car, pressure",
  flat_bulkhead: "Bulkhead flat",
  flat_centerbeam: "Centerbeam flat",
  flat_89: "Flat car, 89 ft",
  autorack: "Autorack",
  well_car: "Well car",
  reefer: "Refrigerator car"
};

export const LOCO_TYPE_LABELS: Record<LocoType, string> = {
  six_axle: "Six-axle road unit",
  four_axle: "Four-axle unit",
  switcher: "Switcher"
};

export const FACILITY_KIND_LABELS: Record<FacilityKind, string> = {
  unloading_racks: "Unloading racks",
  loading_racks: "Loading racks",
  transload: "Transload",
  warehouse: "Warehouse",
  other: "Other"
};
