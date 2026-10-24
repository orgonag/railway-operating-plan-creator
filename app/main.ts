/**
 * The app: open a plan from a share link in the URL fragment as a new local
 * copy, else the last plan saved in this browser, else the demo as a new
 * saved plan, in the editor. Saved plans are never replaced by a link.
 */

import { createEditor } from "../src/editor/editor";
import { openShareHash } from "../src/editor/store/openShare";
import { lastOpenedId, loadPlan, newLocalId, savePlan, setLastOpenedId } from "../src/editor/store/storage";
import { templateById } from "../src/editor/templates";
import { isShareHash, SHARE_FAILED_TEXT } from "../src/export/share";

const mount = document.getElementById("app");
if (!mount) throw new Error("no #app element");

async function start(root: HTMLElement): Promise<void> {
  let status: string | undefined;
  let localId: string | null = null;
  let plan = null;
  const hash = window.location.hash;
  if (isShareHash(hash)) {
    const opened = await openShareHash(hash);
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    if (opened) {
      localId = opened.localId;
      plan = opened.plan;
      status = "Opened from a link as a copy";
    } else status = SHARE_FAILED_TEXT;
  }
  if (!plan) {
    localId = lastOpenedId();
    plan = localId ? loadPlan(localId) : null;
  }
  if (!localId || !plan) {
    localId = newLocalId();
    plan = templateById("demo").make();
    savePlan(localId, plan);
    setLastOpenedId(localId);
  }
  const editor = createEditor(root, { plan, localId });
  if (status) editor.setStatus(status);
  window.ropcEditor = editor;
}

void start(mount);
