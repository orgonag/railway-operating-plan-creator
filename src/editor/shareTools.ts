/**
 * The Share button: a dialog with the plan's link, a Copy button, the one
 * line that says what the link holds, and the link's length.
 */

import { encodeShare, SHARE_NOTICE } from "../export/share";
import { button, closeDialog, el, showDialog } from "./dom";
import type { Editor } from "./editor";

export const COPIED_TEXT = "Copied";
export const COPY_FAILED_TEXT = "Could not copy; select the link and copy it yourself";

function pageBase(): string {
  const { origin, pathname, search } = window.location;
  return origin + pathname + search;
}

export function attachShareTools(editor: Editor): () => void {
  return editor.registerTool("share", () => void openShareDialog(editor));
}

export async function openShareDialog(editor: Editor): Promise<HTMLDialogElement> {
  const link = await encodeShare(editor.history.plan, pageBase());
  const dialog = el("dialog", "share");
  dialog.appendChild(el("h2", undefined, "Share this plan"));
  const input = el("input", "share-link");
  input.type = "text";
  input.readOnly = true;
  input.value = link;
  input.addEventListener("focus", () => input.select());
  dialog.appendChild(input);
  const copied = el("span", "copied");
  const buttons = el("div", "dialog-buttons");
  buttons.appendChild(
    button("ok copy", "Copy", async () => {
      try {
        await navigator.clipboard.writeText(link);
        copied.textContent = COPIED_TEXT;
      } catch {
        copied.textContent = COPY_FAILED_TEXT;
        input.focus();
      }
    })
  );
  buttons.appendChild(copied);
  buttons.appendChild(
    button("close", "Close", () => {
      closeDialog(dialog);
      dialog.remove();
    })
  );
  dialog.appendChild(buttons);
  dialog.appendChild(el("p", "notice", SHARE_NOTICE));
  dialog.appendChild(el("p", "link-length", `${link.length} characters`));
  editor.root.appendChild(dialog);
  showDialog(dialog);
  input.focus();
  return dialog;
}
