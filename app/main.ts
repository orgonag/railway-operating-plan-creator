/**
 * Private preview page: pick one of three plans and play it.
 *
 * Each plan goes through the same path a real file would: validateFile,
 * materialize, then the player (which builds the graph, simulates, collects
 * notes and lays the drawing out once). Problems the file check reports are
 * listed above the player with textContent.
 */

import demoJson from "../docs/schema/examples/customer-service-demo.reading.json";
import crossingJson from "../tests/fixtures/extra-crossing.reading.json";
import pickupJson from "../tests/fixtures/extra-pickup-cutoff.reading.json";
import { validateFile } from "../src/core/schema/validateFile";
import { materialize } from "../src/core/engine/materialize";
import { createPlayer, type Player } from "../src/player/player";

interface Choice {
  id: string;
  label: string;
  raw: unknown;
}

const PLANS: Choice[] = [
  { id: "demo", label: "Customer service demo", raw: demoJson },
  { id: "extra-crossing", label: "Extra: shove stopped across the switch", raw: crossingJson },
  { id: "extra-pickup-cutoff", label: "Extra: pick up an empty and cut off", raw: pickupJson }
];

const select = document.getElementById("plan") as HTMLSelectElement;
const problems = document.getElementById("problems") as HTMLUListElement;
const mount = document.getElementById("mount") as HTMLElement;

for (const choice of PLANS) {
  const option = document.createElement("option");
  option.value = choice.id;
  option.textContent = choice.label;
  select.appendChild(option);
}

let player: Player | undefined;

function open(id: string): void {
  const choice = PLANS.find((c) => c.id === id) ?? PLANS[0]!;
  player?.destroy();
  player = undefined;
  while (problems.firstChild) problems.removeChild(problems.firstChild);

  const checked = validateFile(choice.raw);
  for (const problem of checked.problems) {
    const li = document.createElement("li");
    li.textContent = `${problem.path}: ${problem.message}${problem.repaired ? " (repaired)" : ""}`;
    problems.appendChild(li);
  }
  if (!checked.plan) {
    const li = document.createElement("li");
    li.textContent = "This file could not be opened.";
    problems.appendChild(li);
    return;
  }
  const made = materialize(checked.plan);
  for (const problem of made.problems) {
    const li = document.createElement("li");
    li.textContent = `${problem.path}: ${problem.message}`;
    problems.appendChild(li);
  }
  player = createPlayer(mount, made.plan);
}

select.addEventListener("change", () => open(select.value));
open(PLANS[0]!.id);
