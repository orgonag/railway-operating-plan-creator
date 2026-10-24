/** Small DOM helpers shared by the editor's panels. User text always goes in with textContent. */

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function button(className: string, label: string, onClick: () => void): HTMLButtonElement {
  const b = el("button", className, label);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/** Open a dialog in browsers that support it; fall back to the open attribute elsewhere (tests). */
export function showDialog(d: HTMLDialogElement): void {
  if (typeof d.showModal === "function") d.showModal();
  else d.setAttribute("open", "");
}

export function closeDialog(d: HTMLDialogElement): void {
  if (typeof d.close === "function") d.close();
  else d.removeAttribute("open");
}
