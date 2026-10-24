/**
 * A right-click menu: a small list of buttons at the pointer. One menu is open
 * at a time; picking an item, pressing Esc or pointing anywhere else closes it.
 */

import { el } from "./dom";

export interface MenuItem {
  action: string;
  label: string;
  onPick(): void;
}

let openMenu: (() => void) | undefined;

export function closeContextMenu(): void {
  openMenu?.();
}

export function openContextMenu(host: HTMLElement, at: { x: number; y: number }, items: MenuItem[]): HTMLElement {
  closeContextMenu();
  const menu = el("div", "context-menu");
  menu.setAttribute("role", "menu");
  menu.style.left = `${at.x}px`;
  menu.style.top = `${at.y}px`;
  for (const item of items) {
    const b = el("button", "menu-item", item.label);
    b.type = "button";
    b.dataset.action = item.action;
    b.setAttribute("role", "menuitem");
    b.addEventListener("click", () => {
      close();
      item.onPick();
    });
    menu.appendChild(b);
  }
  const onPointer = (e: Event): void => {
    if (!(e.target instanceof Node && menu.contains(e.target))) close();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") close();
  };
  function close(): void {
    document.removeEventListener("pointerdown", onPointer, true);
    document.removeEventListener("keydown", onKey, true);
    menu.remove();
    if (openMenu === close) openMenu = undefined;
  }
  // Listen on the next tick so the right-click that opened the menu does not close it.
  setTimeout(() => {
    if (openMenu !== close) return;
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey, true);
  }, 0);
  openMenu = close;
  host.appendChild(menu);
  return menu;
}
