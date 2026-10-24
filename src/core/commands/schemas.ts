/**
 * The command set as a documented tool interface (spec 5.7): one JSON
 * Schema (2020-12) and one plain description per command, in a shape that
 * can be handed to a model as tool definitions later. The schemas describe
 * the command object itself, `name` included, and allow no extra keys.
 */

import { CAR_TYPES } from "../schema/types";
import type { CommandName } from "./commands";

export interface CommandDoc {
  name: CommandName;
  description: string;
  schema: object;
}

type Schema = Record<string, unknown>;

const ID: Schema = { type: "string", pattern: "^[A-Za-z][A-Za-z0-9_-]*$", description: "An id in the plan." };
const FT: Schema = { type: "number", minimum: 0, description: "A distance in feet." };
const COUNT: Schema = { type: "integer", minimum: 1, description: "How many." };
const SIDE: Schema = { enum: ["left", "right"], description: "The arriving train's left or right." };
const APPROACH: Schema = { enum: ["facing", "trailing"], description: "Facing diverges ahead of the arriving train; trailing diverges back toward it." };
const DIRECTION: Schema = { enum: ["eastbound", "westbound", "northbound", "southbound"] };
const ROLE: Schema = { enum: ["main", "siding", "spur", "yard", "lead"] };
const TRACK_END: Schema = { enum: ["buffer_stop", "continues", "rejoins"] };
const FACILITY_KIND: Schema = { enum: ["unloading_racks", "loading_racks", "transload", "warehouse", "other"] };
const CAR_TYPE: Schema = { enum: [...CAR_TYPES], description: "What kind of car; sets how it is drawn." };
const CAR_STATE: Schema = { enum: ["loaded", "empty"] };
const LOCO_TYPE: Schema = { enum: ["six_axle", "four_axle", "switcher"] };
const TEXT: Schema = { type: "string" };
const STOP: Schema = {
  description: "Exactly where a move ends.",
  oneOf: [
    { type: "object", required: ["track", "ft", "end"], additionalProperties: false, properties: { track: ID, ft: FT, end: { enum: ["lead", "rear"] } } },
    { type: "object", required: ["beyond", "ft", "end"], additionalProperties: false, properties: { beyond: ID, ft: FT, end: { enum: ["lead", "rear"] } } },
    { type: "object", required: ["offstage"], additionalProperties: false, properties: { offstage: { enum: ["arrival_end", "far_end"] } } }
  ]
};
const CALLOUT: Schema = { type: "object", required: ["text"], additionalProperties: false, properties: { text: TEXT, at: ID } };
const IDS: Schema = { type: "array", minItems: 1, items: ID };

/** The step fields a person or agent can set; `id` is given by addStep unless passed. */
const STEP_FIELDS: Record<string, Schema> = {
  id: ID,
  actor: { enum: ["railroad", "customer"] },
  do: {
    enum: ["shove", "pull", "uncouple", "cut_off", "couple", "run_light", "runaround", "set_out", "pick_up", "stop", "load", "unload", "move_cars", "note"],
    description: "The one thing this step does."
  },
  cars: { ...IDS, description: "Car, loco or group ids the step moves or works on." },
  to: { ...ID, description: "A track or facility id, or offstage." },
  via: { ...IDS, description: "Switch ids the route passes, in order." },
  spot: { type: "integer", minimum: 1, description: "The leading unit's front goes to this spot's far edge." },
  stop: STOP,
  between: { type: "array", minItems: 2, maxItems: 2, items: ID, description: "For uncouple: the two adjacent pieces of equipment to split." },
  text: { ...TEXT, description: "The step caption." },
  callout: CALLOUT
};

function command(name: CommandName, description: string, properties: Record<string, Schema>, required: string[]): CommandDoc {
  return {
    name,
    description,
    schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      additionalProperties: false,
      required: ["name", ...required],
      properties: { name: { const: name }, ...properties }
    }
  };
}

export const COMMANDS: readonly CommandDoc[] = [
  command("setTitle", "Set the plan's title and optional description.", { title: TEXT, description: TEXT }, ["title"]),
  command(
    "setArrival",
    "Change how the train arrives: its heading, which side it enters from, where the power is, the caption, and where it stands (null clears the stop).",
    { direction: DIRECTION, enters: SIDE, locos: { enum: ["head", "rear"] }, text: TEXT, stop: { oneOf: [STOP, { type: "null" }] } },
    []
  ),
  command("setDeparture", "Change the departure's heading, caption, or which cuts leave with the train.", { direction: DIRECTION, text: TEXT, cars: IDS }, []),
  command("setLocos", "Set how many locomotives the train has, their type and length.", { count: COUNT, type: LOCO_TYPE, lengthFt: FT }, ["count"]),
  command(
    "addTurnout",
    "Place a turnout on a track at a distance from the track's start and grow a new branch out of it (400 ft spur with a buffer stop unless told otherwise).",
    {
      trackId: ID,
      distanceFt: FT,
      side: SIDE,
      approach: APPROACH,
      branchId: ID,
      branchRole: ROLE,
      branchLengthFt: FT,
      order: { type: "integer", minimum: 1, description: "The switch's place among the track's switches from its start; later ones shift up. Without it the switch goes last." }
    },
    ["trackId", "distanceFt", "side", "approach"]
  ),
  command(
    "flipTurnout",
    "Flip a turnout: up_down moves its branch to the other side of the track, left_right turns it to point the other way along the track.",
    { switchId: ID, axis: { enum: ["up_down", "left_right"] } },
    ["switchId", "axis"]
  ),
  command("setSwitchDistance", "Move a turnout along its track to a distance from the track's start.", { switchId: ID, distanceFt: FT }, ["switchId", "distanceFt"]),
  command("setTrack", "Rename a track, change its role, usable length in feet, or how it ends.", { trackId: ID, label: { ...TEXT, description: "The name shown on the drawing." }, role: ROLE, lengthFt: FT, end: TRACK_END }, ["trackId"]),
  command("deleteTrack", "Delete a track with its turnouts, facilities and any branches reached only through it. Steps that name it stay and are marked for attention.", { trackId: ID }, ["trackId"]),
  command(
    "addFacility",
    "Place a customer facility along a track, from a start distance for a length in feet.",
    { trackId: ID, startFt: FT, lengthFt: FT, label: { ...TEXT, description: "The name shown on the drawing." }, kind: FACILITY_KIND, facilityId: ID },
    ["trackId", "startFt", "lengthFt", "label", "kind"]
  ),
  command("setFacility", "Change a facility's name, kind, start, length or number of spots.", { facilityId: ID, label: { ...TEXT, description: "The name shown on the drawing." }, kind: FACILITY_KIND, startFt: FT, lengthFt: FT, spots: COUNT }, ["facilityId"]),
  command("deleteFacility", "Delete a facility. Steps that name it stay and are marked for attention.", { facilityId: ID }, ["facilityId"]),
  command(
    "addCars",
    "Add a group of cars to the arriving train, each as its own car with a permanent id.",
    { count: COUNT, type: CAR_TYPE, state: CAR_STATE, cutId: ID, for: { ...ID, description: "The facility these cars are going to." } },
    ["count", "type", "state"]
  ),
  command(
    "placeCars",
    "Place cars already on site before the train arrives, on a track or at a facility, optionally from a spot.",
    { count: COUNT, type: CAR_TYPE, state: CAR_STATE, at: ID, spot: { type: "integer", minimum: 1 }, cutId: ID },
    ["count", "type", "state", "at"]
  ),
  command(
    "setCar",
    "Change one car's type, loaded or empty state, reporting mark, number or length (null returns it to the default length).",
    { carId: ID, type: CAR_TYPE, state: CAR_STATE, mark: TEXT, number: TEXT, lengthFt: { oneOf: [FT, { type: "null" }] } },
    ["carId"]
  ),
  command("deleteCar", "Remove one car from the plan. Steps that name it stay and are marked for attention.", { carId: ID }, ["carId"]),
  command(
    "addStep",
    "Insert one step at an index (default: the end). A step does one thing: a move, an uncouple, a couple, a load or unload, a stop or a note.",
    { step: { type: "object", required: ["do", "text"], additionalProperties: false, properties: STEP_FIELDS }, index: { type: "integer", minimum: 0 } },
    ["step"]
  ),
  command(
    "setStep",
    "Change fields of one step; a field given as null is removed.",
    {
      stepId: ID,
      patch: {
        type: "object",
        additionalProperties: false,
        properties: Object.fromEntries(Object.entries(STEP_FIELDS).filter(([k]) => k !== "id").map(([k, v]) => [k, { oneOf: [v, { type: "null" }] }]))
      }
    },
    ["stepId", "patch"]
  ),
  command("deleteStep", "Delete one step. Later steps are worked out again.", { stepId: ID }, ["stepId"]),
  command("reorderStep", "Move one step to a new index. Later steps are worked out again.", { stepId: ID, index: { type: "integer", minimum: 0 } }, ["stepId", "index"])
];
