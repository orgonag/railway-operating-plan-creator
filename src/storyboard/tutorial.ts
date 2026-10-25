const SEEN = "railway-welcome-v1";
export function welcome(root: HTMLElement, force = false): void {
  try {
    if (!force && localStorage.getItem(SEEN)) return;
  } catch {
    /* storage may be unavailable */
  }
  if (root.querySelector(".welcome")) return;
  const items = [
    [
      ".story-steps .slide-card",
      "1. Draw the site",
      "Step 1 is your shared track layout. Finish the tracks before adding the next step; the layout then stays fixed.",
    ],
    [
      ".story-tools",
      "Straight tracks, simple turnouts",
      "Choose Track, then click a start and an end, or drag. Lines snap straight. Choose one of four turnout pictures, then place it on a track. Select a piece to delete it.",
    ],
    [
      ".story-steps .slide-card",
      "2. Arrange the starting snapshot",
      "Choose + Next step. Drag locomotives, loaded cars and empties onto tracks. Add cars with + and flip the direction as needed.",
    ],
    [
      ".story-steps .slide-card",
      "3 onward. One movement per step",
      "Add the next step, select cars and drag them to their destination. Double-click for one car or drag a box for several. A reversal goes on another step.",
    ],
    [
      ".slide-timing",
      "Pause between steps",
      "Set how long the finished step stays on screen before the next begins. Movement animates automatically. Apply the pause to all steps if you like.",
    ],
    [
      ".view-controls",
      "Zoom and explore",
      "Use − and + to zoom, Fit to see the layout, or Page to see the whole drawing. Choose Pan and drag to look around. Ctrl/⌘ + scroll also zooms.",
    ],
    [
      "[data-tour-export]",
      "Export when you are done",
      "Export offers animated HTML, video, PDF, PowerPoint and images. Download saves an editable plan. Replay this guide anytime with Help.",
    ],
  ];
  const dialog = document.createElement("dialog");
  dialog.className = "welcome";
  dialog.setAttribute("aria-label", "Quick start guide");
  dialog.innerHTML =
    '<svg class="tour-arrow" aria-hidden="true"><defs><marker id="tour-tip" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0 0L8 3L0 6" fill="none" stroke="#e0c580"/></marker></defs><rect/><line marker-end="url(#tour-tip)"/></svg><section><small></small><h2></h2><p></p><div><button type="button" data-skip>Skip guide</button><button type="button" data-back>Back</button><button type="button" data-next>Next tip</button></div></section>';
  root.append(dialog);
  const card = dialog.querySelector("section")!;
  let index = 0;
  function position(): void {
    const target = root.querySelector(items[index]![0]!) as HTMLElement;
    const rect = target.getBoundingClientRect();
    const width = Math.min(380, window.innerWidth - 32);
    card.style.width = width + "px";
    card.style.left =
      Math.max(
        16,
        Math.min(
          window.innerWidth - width - 16,
          rect.left + rect.width / 2 - width / 2,
        ),
      ) + "px";
    const height = card.offsetHeight;
    const top =
      rect.bottom + 30 + height < window.innerHeight
        ? rect.bottom + 30
        : Math.max(16, rect.top - height - 30);
    card.style.top = top + "px";
    const r = dialog.querySelector("rect")!;
    for (const [k, v] of Object.entries({
      x: rect.left - 3,
      y: rect.top - 3,
      width: rect.width + 6,
      height: rect.height + 6,
    }))
      r.setAttribute(k, String(v));
    const c = card.getBoundingClientRect(),
      line = dialog.querySelector("line")!;
    for (const [k, v] of Object.entries({
      x1: c.left + c.width / 2,
      y1: top > rect.bottom ? c.top : c.bottom,
      x2: rect.left + rect.width / 2,
      y2: top > rect.bottom ? rect.bottom : rect.top,
    }))
      line.setAttribute(k, String(v));
  }
  function show(): void {
    card.querySelector("small")!.textContent =
      `QUICK START ${index + 1} / ${items.length}`;
    card.querySelector("h2")!.textContent = items[index]![1]!;
    card.querySelector("p")!.textContent = items[index]![2]!;
    (card.querySelector("[data-back]") as HTMLButtonElement).disabled =
      index === 0;
    card.querySelector("[data-next]")!.textContent =
      index === items.length - 1 ? "Start drawing" : "Next tip";
    position();
  }
  function close(): void {
    try {
      localStorage.setItem(SEEN, "1");
    } catch {
      /* no persistence */
    }
    window.removeEventListener("resize", position);
    dialog.close();
    dialog.remove();
  }
  dialog.querySelector("[data-skip]")!.addEventListener("click", close);
  dialog.querySelector("[data-back]")!.addEventListener("click", () => {
    index--;
    show();
  });
  dialog.querySelector("[data-next]")!.addEventListener("click", () => {
    if (index === items.length - 1) close();
    else {
      index++;
      show();
    }
  });
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    close();
  });
  window.addEventListener("resize", position);
  dialog.showModal();
  show();
}
