/**
 * Cars: the Add cars and Place cars dialogs. Add cars appends a group to the
 * arriving train; Place cars drops a group on a track or at a facility's spot
 * before the train arrives. Either way the new cars are selected and the
 * strip returns to the arrival so the person sees them.
 */

import type { Command } from "../core/commands/commands";
import { CAR_TYPE_LABELS } from "../core/schema/labels";
import { CAR_TYPES, type CarState, type CarType, type Id } from "../core/schema/types";
import { button, closeDialog, el, showDialog } from "./dom";
import type { Editor } from "./editor";

export const MAX_CARS_PER_GROUP = 50;

type Mode = "add" | "place";

export function attachCarTools(editor: Editor): () => void {
  const detach = [editor.registerTool("add-cars", () => openDialog("add")), editor.registerTool("place-cars", () => openDialog("place"))];
  let dialog: HTMLDialogElement | undefined;

  function close(): void {
    if (!dialog) return;
    closeDialog(dialog);
    dialog.remove();
    dialog = undefined;
  }

  function openDialog(mode: Mode): void {
    close();
    const plan = editor.history.plan;
    dialog = el("dialog", "add-cars");
    dialog.dataset.mode = mode;
    dialog.appendChild(el("h2", undefined, mode === "add" ? "Add cars to the train" : "Place cars on site"));
    const form = el("form", "dialog-form");
    form.addEventListener("submit", (e) => e.preventDefault());

    const count = numberField(form, "count", "How many", 5, 1, MAX_CARS_PER_GROUP);
    const type = selectField(
      form,
      "type",
      "Type",
      CAR_TYPES.map((t) => [t, CAR_TYPE_LABELS[t]]),
      "generic"
    );
    const state = selectField(
      form,
      "state",
      "Loaded or empty",
      [
        ["loaded", "Loaded"],
        ["empty", "Empty"]
      ],
      mode === "add" ? "loaded" : "empty"
    );

    let at: HTMLSelectElement | undefined;
    let spot: HTMLInputElement | undefined;
    if (mode === "place") {
      const places: Array<[string, string]> = [
        ...plan.facilities.map((f): [string, string] => [f.id, f.name]),
        ...plan.tracks.map((t): [string, string] => [t.id, t.name ?? t.id])
      ];
      at = selectField(form, "at", "Where", places, places[0]?.[0] ?? "");
      spot = numberField(form, "spot", "Spot (at a facility)", 1, 1, 99);
      const syncSpot = (): void => {
        spot!.disabled = !plan.facilities.some((f) => f.id === at!.value);
      };
      at.addEventListener("change", syncSpot);
      syncSpot();
    }

    const row = el("div", "dialog-buttons");
    row.appendChild(
      button("ok", mode === "add" ? "Add" : "Place", () => {
        const n = Math.min(MAX_CARS_PER_GROUP, Math.max(1, Math.round(Number(count.value) || 1)));
        const carType = type.value as CarType;
        const carState = state.value as CarState;
        let cmd: Command;
        if (mode === "add") cmd = { name: "addCars", count: n, type: carType, state: carState };
        else {
          const where: Id = at!.value;
          cmd = { name: "placeCars", count: n, type: carType, state: carState, at: where };
          if (!spot!.disabled) {
            const s = Math.max(1, Math.round(Number(spot!.value) || 1));
            cmd.spot = s;
          }
        }
        close();
        const r = editor.dispatch(cmd, mode === "add" ? "add cars" : "place cars");
        const cars = r.created.slice(1);
        editor.showStep(0);
        if (cars.length > 0) editor.select({ kind: "units", ids: cars });
      })
    );
    row.appendChild(button("close", "Cancel", close));
    form.appendChild(row);
    dialog.appendChild(form);
    editor.root.appendChild(dialog);
    showDialog(dialog);
    count.focus();
  }

  return () => {
    close();
    detach.forEach((d) => d());
  };
}

function field(form: HTMLFormElement, name: string, label: string, control: HTMLElement): void {
  const wrap = el("label", "field");
  wrap.appendChild(el("span", "field-label", label));
  control.setAttribute("name", name);
  wrap.appendChild(control);
  form.appendChild(wrap);
}

function numberField(form: HTMLFormElement, name: string, label: string, value: number, min: number, max: number): HTMLInputElement {
  const input = el("input");
  input.type = "number";
  input.min = String(min);
  input.max = String(max);
  input.step = "1";
  input.value = String(value);
  field(form, name, label, input);
  return input;
}

function selectField(form: HTMLFormElement, name: string, label: string, options: Array<[string, string]>, value: string): HTMLSelectElement {
  const sel = el("select");
  for (const [v, text] of options) {
    const opt = el("option", undefined, text);
    opt.value = v;
    opt.selected = v === value;
    sel.appendChild(opt);
  }
  field(form, name, label, sel);
  return sel;
}
