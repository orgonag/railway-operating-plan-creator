/**
 * PlanReading v1: the one public format. These types mirror the field names in
 * docs/schema/plan-reading.schema.json. The schema is the source of truth for
 * validation; these types are what the rest of the code works with.
 */

export const SCHEMA_VERSION = "1";

export type Id = string;

export type Direction = "eastbound" | "westbound" | "northbound" | "southbound";
export type Side = "left" | "right";
export type OffstageEnd = "arrival_end" | "far_end";
export type GroupEnd = "lead" | "rear";
export type CarState = "loaded" | "empty";

export type TrackRole = "main" | "siding" | "spur" | "yard" | "lead";
export type TrackEnd = "buffer_stop" | "continues" | "rejoins";

export type FacilityKind = "unloading_racks" | "loading_racks" | "transload" | "warehouse" | "other";

export type LocoType = "six_axle" | "four_axle" | "switcher";

export type CarType =
  | "generic"
  | "boxcar_50"
  | "boxcar_60"
  | "covered_hopper_small"
  | "covered_hopper_large"
  | "covered_hopper_plastics"
  | "open_hopper"
  | "gondola"
  | "tank_general"
  | "tank_pressure"
  | "flat_bulkhead"
  | "flat_centerbeam"
  | "flat_89"
  | "autorack"
  | "well_car"
  | "reefer";

export const CAR_TYPES: readonly CarType[] = [
  "generic",
  "boxcar_50",
  "boxcar_60",
  "covered_hopper_small",
  "covered_hopper_large",
  "covered_hopper_plastics",
  "open_hopper",
  "gondola",
  "tank_general",
  "tank_pressure",
  "flat_bulkhead",
  "flat_centerbeam",
  "flat_89",
  "autorack",
  "well_car",
  "reefer"
];

/** Exactly where a move ends, in railway terms. */
export type Stop =
  | { track: Id; ft: number; end: GroupEnd }
  | { beyond: Id; ft: number; end: GroupEnd }
  | { offstage: OffstageEnd };

export interface Arrival {
  direction: Direction;
  /** Which side of the drawing the arriving train comes in from. */
  enters: Side;
  /** The main track the train arrives on. */
  on: Id;
  /** Where the power is in the arriving train. */
  locos: "head" | "rear";
  /** Where the train stands before work begins. Without it, layout picks a starting position. */
  stop?: Stop;
  text: string;
}

export interface CarLength {
  ft?: number;
  /** Slack check used inside the engine for fit notes only. Never below 10. */
  allowancePct?: number;
}

export interface LocoLength {
  ft?: number;
}

export interface Track {
  id: Id;
  role: TrackRole;
  name?: string;
  /** Usable length. On a branch it starts at the clear point. */
  lengthFt?: number;
  end?: TrackEnd;
}

export interface Switch {
  id: Id;
  /** The track the switch sits on. */
  on: Id;
  /** The track the diverging route leads to. */
  to: Id;
  side: Side;
  approach: "facing" | "trailing";
  order?: number;
  distanceFt?: number;
  name?: string;
}

export interface Facility {
  id: Id;
  name: string;
  kind: FacilityKind;
  track: Id;
  lengthFt?: number;
  startFt?: number;
  spots?: number;
}

export interface Loco {
  id: Id;
  type?: LocoType;
  lengthFt?: number;
}

export interface Locos {
  count: number;
  lengthFt?: number;
  type?: LocoType;
  /** Individual locos, from the head end. */
  list?: Loco[];
}

export interface Car {
  id: Id;
  type?: CarType;
  lengthFt?: number;
  state?: CarState;
  mark?: string;
  number?: string;
  spot?: number;
}

export interface Cut {
  id: Id;
  cars: number;
  state: CarState;
  carType?: CarType;
  carLengthFt?: number;
  /** Facility these cars are going to. */
  for?: Id;
  list?: Car[];
}

export interface OnSiteCut {
  id: Id;
  cars: number;
  state: CarState;
  carType?: CarType;
  carLengthFt?: number;
  /** Facility or track id. */
  at: Id;
  list?: Car[];
  spot?: number;
}

export interface Consist {
  locos: Locos;
  /** Cars in the arriving train, from the head end. */
  cuts: Cut[];
  /** Cars already on site before the train arrives. */
  onSite?: OnSiteCut[];
}

export interface Callout {
  text: string;
  /** Switch, track or facility id to pin the note to. */
  at?: Id;
}

export type RailroadDo =
  | "shove"
  | "pull"
  | "uncouple"
  | "cut_off"
  | "couple"
  | "run_light"
  | "runaround"
  | "set_out"
  | "pick_up"
  | "stop";

export type CustomerDo = "load" | "unload" | "move_cars";

export interface RailroadStep {
  id: Id;
  actor: "railroad";
  do: RailroadDo;
  cars?: Id[];
  /** Facility or track id, or "offstage". */
  to?: Id;
  via?: Id[];
  text: string;
  callout?: Callout;
  /** The leading unit's front goes to this spot's far edge. */
  spot?: number;
  stop?: Stop;
  /** For uncouple: the two adjacent pieces of equipment to split. */
  between?: [Id, Id];
}

export interface CustomerStep {
  id: Id;
  actor: "customer";
  do: CustomerDo;
  cars?: Id[];
  to?: Id;
  text: string;
  callout?: Callout;
  spot?: number;
  stop?: Stop;
}

export interface NoteStep {
  id: Id;
  actor?: "railroad" | "customer";
  do: "note";
  text: string;
  callout?: Callout;
}

export type WorkStep = RailroadStep | CustomerStep | NoteStep;

export interface Departure {
  direction: Direction;
  /** Cuts that leave with the train. */
  cars?: Id[];
  text: string;
}

export interface Question {
  id: Id;
  /** Field path, collection.id.field. */
  about: string;
  ask: string;
  guess?: unknown;
  options?: unknown[];
  basis: string;
}

export type ProvenanceStatus = "read" | "assumed" | "unknown" | "confirmed";

export interface Provenance {
  status: ProvenanceStatus;
  source?: string;
}

export interface PlanReading {
  schemaVersion: typeof SCHEMA_VERSION;
  title: string;
  description?: string;
  arrival: Arrival;
  carLength?: CarLength;
  locoLength?: LocoLength;
  tracks: Track[];
  switches: Switch[];
  facilities: Facility[];
  consist: Consist;
  work: WorkStep[];
  departure: Departure;
  questions?: Question[];
  provenance?: Record<string, Provenance>;
  notes?: string[];
}

/** One thing found wrong with a file on the way in. Repaired problems were fixed up; the rest are left as authored. */
export interface FileProblem {
  /** Where in the file, as a path like tracks[1].id or arrival.on. */
  path: string;
  message: string;
  repaired: boolean;
}
