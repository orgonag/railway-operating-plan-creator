/**
 * The properties panel: a form for whatever is selected, like PowerPoint's
 * Format pane. Every input dispatches one command on change, labelled with
 * the field, so each edit is one Undo.
 */

import type { Command } from "../core/commands/commands";
import { CAR_TYPES, type Car, type CarType, type Direction, type FacilityKind, type Id, type LocoType, type PlanReading, type TrackEnd, type TrackRole } from "../core/schema/types";
import { CAR_TYPE_LABELS, FACILITY_KIND_LABELS, LOCO_TYPE_LABELS } from "../core/schema/labels";
import { clear, el } from "./dom";
import type { EditorState } from "./model";

export interface PropertiesPanel {
  root: HTMLElement;
  render(state: EditorState): void;
}

export interface PropertiesHandlers {
  dispatch(cmd: Command | Command[], label: string): void;
  setShowSpots(on: boolean): void;
  flip(switchId: Id, axis: "up_down" | "left_right"): void;
}

const DIRECTIONS: Direction[] = ["eastbound", "westbound", "northbound", "southbound"];
const ROLES: TrackRole[] = ["main", "siding", "spur", "yard", "lead"];
const ENDS: TrackEnd[] = ["buffer_stop", "continues", "rejoins"];
const END_LABELS: Record<TrackEnd, string> = { buffer_stop: "Buffer stop", continues: "Continues off the drawing", rejoins: "Rejoins its track" };

export function createProperties(h: PropertiesHandlers): PropertiesPanel {
  const root = el("aside", "properties");
  root.setAttribute("aria-label", "Properties");

  function render(state: EditorState): void {
    clear(root);
    const form = el("form", "props");
    form.addEventListener("submit", (e) => e.preventDefault());
    const sel = state.selection;
    form.dataset.kind = sel.kind;
    switch (sel.kind) {
      case "none":
        planForm(form, state.plan);
        break;
      case "step":
        stepForm(form, state, sel.id);
        break;
      case "track":
        trackForm(form, state.plan, sel.id);
        break;
      case "switch":
        switchForm(form, state.plan, sel.id);
        break;
      case "facility":
        facilityForm(form, state, sel.id);
        break;
      case "units":
        unitsForm(form, state.plan, sel.ids);
        break;
    }
    root.appendChild(form);
  }

  // ---- forms ----

  function planForm(form: HTMLFormElement, plan: PlanReading): void {
    form.appendChild(el("h2", undefined, "Plan"));
    text(form, "title", "Title", plan.title, (v) => h.dispatch({ name: "setTitle", title: v }, "title"));
    text(form, "description", "Description", plan.description ?? "", (v) =>
      h.dispatch({ name: "setTitle", title: plan.title, description: v }, "description")
    );
    form.appendChild(el("h2", undefined, "Arrival"));
    select(form, "direction", "Heading", DIRECTIONS, plan.arrival.direction, capitalise, (v) =>
      h.dispatch({ name: "setArrival", direction: v as Direction }, "heading")
    );
    select(form, "enters", "Enters from", ["left", "right"], plan.arrival.enters, capitalise, (v) =>
      h.dispatch({ name: "setArrival", enters: v as "left" | "right" }, "enters from")
    );
    select(form, "locos", "Power at the", ["head", "rear"], plan.arrival.locos, capitalise, (v) =>
      h.dispatch({ name: "setArrival", locos: v as "head" | "rear" }, "power end")
    );
    number(form, "locoCount", "Locomotives", plan.consist.locos.count, 1, 1, (v) =>
      h.dispatch({ name: "setLocos", count: v }, "locomotives")
    );
    select(form, "locoType", "Locomotive type", Object.keys(LOCO_TYPE_LABELS), plan.consist.locos.type ?? "six_axle", (k) => LOCO_TYPE_LABELS[k as LocoType], (v) =>
      h.dispatch({ name: "setLocos", count: plan.consist.locos.count, type: v as LocoType }, "locomotive type")
    );
    text(form, "arrivalText", "Arrival caption", plan.arrival.text, (v) => h.dispatch({ name: "setArrival", text: v }, "arrival caption"));
    form.appendChild(el("h2", undefined, "Departure"));
    select(form, "departureDirection", "Heading", DIRECTIONS, plan.departure.direction, capitalise, (v) =>
      h.dispatch({ name: "setDeparture", direction: v as Direction }, "departure heading")
    );
    text(form, "departureText", "Departure caption", plan.departure.text, (v) => h.dispatch({ name: "setDeparture", text: v }, "departure caption"));
  }

  function stepForm(form: HTMLFormElement, state: EditorState, id: Id | "arrival" | "departure"): void {
    const plan = state.plan;
    if (id === "arrival") {
      form.appendChild(el("h2", undefined, "Arrival"));
      textarea(form, "text", "Caption", plan.arrival.text, (v) => h.dispatch({ name: "setArrival", text: v }, "caption"));
      return;
    }
    if (id === "departure") {
      form.appendChild(el("h2", undefined, "Departure"));
      textarea(form, "text", "Caption", plan.departure.text, (v) => h.dispatch({ name: "setDeparture", text: v }, "caption"));
      return;
    }
    const step = plan.work.find((w) => w.id === id);
    if (!step) return;
    const result = state.computed.sim.steps.find((s) => s.stepId === id);
    form.appendChild(el("h2", undefined, `Step: ${step.do.replace(/_/g, " ")}`));
    textarea(form, "text", "Caption", step.text, (v) => h.dispatch({ name: "setStep", stepId: id, patch: { text: v } }, "caption"));
    text(form, "callout", "Callout", step.callout?.text ?? "", (v) =>
      h.dispatch({ name: "setStep", stepId: id, patch: { callout: v.trim() ? { ...(step.callout ?? {}), text: v } : undefined } }, "callout")
    );
    if (result && result.status !== "ok") {
      const why = el("p", "step-reason", result.reason ?? result.status.replace(/_/g, " "));
      form.appendChild(why);
    }
    const notes = state.computed.notes.filter((n) => n.stepId === id);
    if (notes.length > 0) {
      const ul = el("ul", "step-notes");
      for (const n of notes) ul.appendChild(el("li", `note ${n.level}`, n.text));
      form.appendChild(ul);
    }
  }

  function trackForm(form: HTMLFormElement, plan: PlanReading, id: Id): void {
    const t = plan.tracks.find((x) => x.id === id);
    if (!t) return;
    form.appendChild(el("h2", undefined, `Track ${t.name ?? t.id}`));
    text(form, "label", "Name", t.name ?? "", (v) => h.dispatch({ name: "setTrack", trackId: id, label: v }, "track name"));
    select(form, "role", "Role", ROLES, t.role, capitalise, (v) => h.dispatch({ name: "setTrack", trackId: id, role: v as TrackRole }, "track role"));
    if (t.role !== "main") {
      number(form, "lengthFt", "Usable length (ft)", t.lengthFt ?? 400, 60, 10, (v) => h.dispatch({ name: "setTrack", trackId: id, lengthFt: v }, "track length"));
      select(form, "end", "Ends with", ENDS, t.end ?? "buffer_stop", (k) => END_LABELS[k as TrackEnd], (v) =>
        h.dispatch({ name: "setTrack", trackId: id, end: v as TrackEnd }, "track end")
      );
    }
  }

  function switchForm(form: HTMLFormElement, plan: PlanReading, id: Id): void {
    const s = plan.switches.find((x) => x.id === id);
    if (!s) return;
    form.appendChild(el("h2", undefined, `Turnout ${s.id}`));
    number(form, "distanceFt", "Distance from track start (ft)", s.distanceFt ?? 0, 0, 10, (v) =>
      h.dispatch({ name: "setSwitchDistance", switchId: id, distanceFt: v }, "turnout distance")
    );
    readonly(form, "Branch side", s.side === "left" ? "Train's left" : "Train's right");
    readonly(form, "Approach", s.approach === "facing" ? "Facing point" : "Trailing point");
    const row = el("div", "flip-row");
    row.appendChild(flipButton("up_down", "Flip up/down", "Move the branch to the other side of the track", () => h.flip(id, "up_down")));
    row.appendChild(flipButton("left_right", "Flip left/right", "Turn the turnout to point the other way along the track", () => h.flip(id, "left_right")));
    form.appendChild(row);
  }

  function facilityForm(form: HTMLFormElement, state: EditorState, id: Id): void {
    const f = state.plan.facilities.find((x) => x.id === id);
    if (!f) return;
    form.appendChild(el("h2", undefined, `Facility ${f.name}`));
    text(form, "label", "Name", f.name, (v) => h.dispatch({ name: "setFacility", facilityId: id, label: v }, "facility name"));
    select(form, "kind", "Kind", Object.keys(FACILITY_KIND_LABELS), f.kind, (k) => FACILITY_KIND_LABELS[k as FacilityKind], (v) =>
      h.dispatch({ name: "setFacility", facilityId: id, kind: v as FacilityKind }, "facility kind")
    );
    number(form, "startFt", "Starts at (ft)", f.startFt ?? 0, 0, 10, (v) => h.dispatch({ name: "setFacility", facilityId: id, startFt: v }, "facility start"));
    number(form, "lengthFt", "Length (ft)", f.lengthFt ?? 300, 60, 10, (v) => h.dispatch({ name: "setFacility", facilityId: id, lengthFt: v }, "facility length"));
    number(form, "spots", "Spots", f.spots ?? Math.floor((f.lengthFt ?? 300) / 60), 1, 1, (v) =>
      h.dispatch({ name: "setFacility", facilityId: id, spots: v }, "spots")
    );
    checkbox(form, "showSpots", "Show spots on the drawing", state.showSpots, (on) => h.setShowSpots(on));
  }

  function unitsForm(form: HTMLFormElement, plan: PlanReading, ids: Id[]): void {
    const cars = ids.filter((id) => findCar(plan, id));
    const locos = ids.filter((id) => (plan.consist.locos.list ?? []).some((l) => l.id === id));
    form.appendChild(el("h2", undefined, cars.length === 1 ? `Car ${cars[0]}` : `${cars.length} cars${locos.length ? ` and ${locos.length} loco${locos.length > 1 ? "s" : ""}` : ""}`));
    if (cars.length === 0) return;
    const first = findCar(plan, cars[0]!)!;
    const each = (make: (carId: Id) => Command, label: string): void => h.dispatch(cars.map(make), label);
    select(form, "type", "Type", [...CAR_TYPES], first.type ?? "generic", (k) => CAR_TYPE_LABELS[k as CarType], (v) =>
      each((carId) => ({ name: "setCar", carId, type: v as CarType }), "car type")
    );
    select(form, "state", "Loaded or empty", ["loaded", "empty"], first.state ?? "loaded", capitalise, (v) =>
      each((carId) => ({ name: "setCar", carId, state: v as "loaded" | "empty" }), "loaded or empty")
    );
    if (cars.length === 1) {
      text(form, "mark", "Reporting mark", first.mark ?? "", (v) => h.dispatch({ name: "setCar", carId: cars[0]!, mark: v }, "reporting mark"));
      text(form, "number", "Number", first.number ?? "", (v) => h.dispatch({ name: "setCar", carId: cars[0]!, number: v }, "car number"));
    }
    const length = number(form, "lengthFt", "Length (ft, blank for the default)", first.lengthFt, 10, 1, (v) =>
      each((carId) => ({ name: "setCar", carId, lengthFt: v }), "car length")
    );
    length.addEventListener("change", () => {
      if (length.value.trim() === "") each((carId) => ({ name: "setCar", carId, lengthFt: null }), "car length");
    });
  }

  // ---- fields ----

  function field(form: HTMLFormElement, name: string, label: string, control: HTMLElement): void {
    const wrap = el("label", "field");
    wrap.appendChild(el("span", "field-label", label));
    control.setAttribute("name", name);
    wrap.appendChild(control);
    form.appendChild(wrap);
  }

  function text(form: HTMLFormElement, name: string, label: string, value: string, onChange: (v: string) => void): HTMLInputElement {
    const input = el("input");
    input.type = "text";
    input.value = value;
    input.addEventListener("change", () => onChange(input.value));
    field(form, name, label, input);
    return input;
  }

  function textarea(form: HTMLFormElement, name: string, label: string, value: string, onChange: (v: string) => void): void {
    const input = el("textarea");
    input.rows = 3;
    input.value = value;
    input.addEventListener("change", () => onChange(input.value));
    field(form, name, label, input);
  }

  function number(form: HTMLFormElement, name: string, label: string, value: number | undefined, min: number, step: number, onChange: (v: number) => void): HTMLInputElement {
    const input = el("input");
    input.type = "number";
    input.min = String(min);
    input.step = String(step);
    input.value = value === undefined ? "" : String(value);
    input.addEventListener("change", () => {
      const v = Number(input.value);
      if (input.value.trim() === "" || !Number.isFinite(v)) return;
      // Snap to the field's step (whole locos, 10 ft) so the plan never holds a value its schema refuses.
      const snapped = Math.max(min, Math.round(v / step) * step);
      input.value = String(snapped);
      onChange(snapped);
    });
    field(form, name, label, input);
    return input;
  }

  function select(form: HTMLFormElement, name: string, label: string, options: string[], value: string, show: (k: string) => string, onChange: (v: string) => void): void {
    const sel = el("select");
    for (const o of options) {
      const opt = el("option", undefined, show(o));
      opt.value = o;
      opt.selected = o === value;
      sel.appendChild(opt);
    }
    sel.addEventListener("change", () => onChange(sel.value));
    field(form, name, label, sel);
  }

  function checkbox(form: HTMLFormElement, name: string, label: string, checked: boolean, onChange: (on: boolean) => void): void {
    const input = el("input");
    input.type = "checkbox";
    input.checked = checked;
    input.addEventListener("change", () => onChange(input.checked));
    const wrap = el("label", "field check");
    input.setAttribute("name", name);
    wrap.appendChild(input);
    wrap.appendChild(el("span", "field-label", label));
    form.appendChild(wrap);
  }

  function readonly(form: HTMLFormElement, label: string, value: string): void {
    const wrap = el("div", "field");
    wrap.appendChild(el("span", "field-label", label));
    wrap.appendChild(el("span", "field-value", value));
    form.appendChild(wrap);
  }

  function flipButton(axis: string, label: string, title: string, onClick: () => void): HTMLButtonElement {
    const b = el("button", "flip", label);
    b.type = "button";
    b.dataset.flip = axis;
    b.title = title;
    b.addEventListener("click", onClick);
    return b;
  }

  return { root, render };
}

function findCar(plan: PlanReading, id: Id): Car | undefined {
  for (const cut of [...plan.consist.cuts, ...(plan.consist.onSite ?? [])]) {
    const car = cut.list?.find((c) => c.id === id);
    if (car) return car;
  }
  return undefined;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}
