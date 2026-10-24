/**
 * The app: open the last plan saved in this browser, or the demo as a new
 * saved plan, in the editor.
 */

import { createEditor } from "../src/editor/editor";
import { lastOpenedId, loadPlan, newLocalId, savePlan, setLastOpenedId } from "../src/editor/store/storage";
import { templateById } from "../src/editor/templates";

const mount = document.getElementById("app");
if (!mount) throw new Error("no #app element");

let localId = lastOpenedId();
let plan = localId ? loadPlan(localId) : null;
if (!localId || !plan) {
  localId = newLocalId();
  plan = templateById("demo").make();
  savePlan(localId, plan);
  setLastOpenedId(localId);
}

createEditor(mount, { plan, localId });
