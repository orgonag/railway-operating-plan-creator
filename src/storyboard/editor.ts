import { TOOL_CREDIT, FULL_NOTICE, exportedPlan } from "./notice";
import {
  blank,
  drawingBounds,
  turnoutTracks,
  validateTracks,
  pauseSeconds,
  movementMs,
  durationMs,
  straightEnd,
  trackSnap,
  translateTracks,
  copy,
  id,
  nextSlide,
  snap,
  movementRoute,
  distance,
  animatedUnits,
  selectedInBox,
  moveSlide,
  rebuildRemaining,
  parseDeck,
  type Deck,
  type Point,
  type Unit,
  type Annotation,
} from "./model";
import { scene, points } from "./render";
import { openExports } from "./exports";
import { welcome } from "./tutorial";
import { PlanStore, PLAN_KEY, RECOVERY_KEY, DRAFT_KEY } from "./storage";
const KEY = PLAN_KEY;
const NS = "http://www.w3.org/2000/svg";
export function createStoryboard(root: HTMLElement): void {
  let deck = blank(),
    index = 0,
    selected: string[] = [],
    tool = "select",
    orientation = 0,
    playing = false,
    snapping = true,
    presentation = false,
    token = 0;
  let revising = false;
  let editingView: typeof view | null = null;
  let store: PlanStore | undefined;
  let saveIssue = "";
  let recoveryRaw: string | null = null;
  let unreadableRaw: string | null = null;
  let unsaved = false;
  let saveSequence = 0;
  let textEditing = false;
  let trackSelection: string[] = [];
  let annotationSelection: string | null = null;
  let lastAnnotationPick: { id: string; time: number } | undefined;
  let pendingStart: Point | null = null;
  let hover: Point | null = null;
  let trackPreview: ReturnType<typeof translateTracks> | null = null;
  let trackMoveBlocked = false;
  let view = { x: 0, y: 0, width: 1200, height: 700 };
  let pan: { x: number; y: number; view: typeof view } | null = null;
  let space = false;
  let canvasFocus = false;
  let lastPick: { id: string; time: number } | undefined;
  let history: string[] = [],
    redo: string[] = [],
    message = "Draw your track layout to begin.",
    manual: Point[] | null = null;
  let drag: {
    kind: string;
    start: Point;
    end: Point;
    ids: string[];
    unit?: string;
    side?: "a" | "b";
    add: boolean;
  } | null = null;
  try {
    store = new PlanStore(localStorage, navigator.locks);
    recoveryRaw = localStorage.getItem(RECOVERY_KEY);
    const saved = store.expected;
    if (saved) {
      try {
        deck = parseDeck(saved);
        view = drawingBounds(deck);
      } catch {
        unreadableRaw = saved;
        try {
          store.preserveUnreadable(saved);
          recoveryRaw = saved;
          unreadableRaw = null;
        } catch {
          /* Keep the original key untouched if recovery storage fails. */
        }
        saveIssue =
          "Saved data could not be opened. Download the original recovery copy below; it has not been discarded.";
      }
    }
  } catch {
    saveIssue =
      "Browser storage is unavailable. Download your plan to keep your work.";
  }
  const draftPrefix = `${DRAFT_KEY}:`;
  const currentDraftKey = `${draftPrefix}${crypto.randomUUID()}`;
  let recoveredDrafts: { key: string; raw: string; session?: boolean }[] = [];
  let consumedDraftKey: string | null = null;
  try {
    for (let n = 0; n < localStorage.length; n++) {
      const key = localStorage.key(n)!;
      if (key.startsWith(draftPrefix)) {
        const raw = localStorage.getItem(key)!;
        if (raw !== store?.expected) recoveredDrafts.push({ key, raw });
      }
    }
  } catch {
    /* Durable drafts may be unavailable in this browser. */
  }
  try {
    for (let n = 0; n < sessionStorage.length; n++) {
      const key = sessionStorage.key(n)!;
      if (key === DRAFT_KEY || key.startsWith(draftPrefix)) {
        const raw = sessionStorage.getItem(key)!;
        if (
          raw !== store?.expected &&
          !recoveredDrafts.some((d) => d.raw === raw)
        )
          recoveredDrafts.push({ key, raw, session: true });
      }
    }
  } catch {
    /* Keep Download available when all storage is blocked. */
  }
  if (recoveredDrafts.length)
    saveIssue ||=
      "Unsaved recovery drafts are available below. Recovery copies are retained; download a copy for safekeeping.";
  root.innerHTML =
    '<div class="storyboard"><header class="story-header"><div class="brand">RAILWAY <span>OPERATING PLAN</span></div><input aria-label="Plan title" class="plan-title"><div class="file-actions"></div></header><nav class="story-tools" aria-label="Drawing tools"></nav><aside class="story-steps" aria-label="Steps"></aside><main class="story-main"><div class="slide-heading"><span class="phase"></span><input aria-label="Step title"></div><div class="drawing"><svg viewBox="0 0 1200 700" aria-label="Railway canvas" role="img"></svg></div><textarea aria-label="Step instructions" placeholder="Explain what happens in this step…"></textarea><div class="play-controls"></div></main><aside class="story-inspector"></aside><footer class="story-footer"><span class="story-status" role="status"></span><button class="tool-notice" type="button">Tool by Orgo Nag · Visual use only</button></footer></div>';
  const shell = root.querySelector<HTMLElement>(".storyboard")!,
    tools = root.querySelector<HTMLElement>(".story-tools")!,
    steps = root.querySelector<HTMLElement>(".story-steps")!,
    props = root.querySelector<HTMLElement>(".story-inspector")!,
    status = root.querySelector<HTMLElement>(".story-status")!,
    svg = root.querySelector<SVGSVGElement>("svg")!,
    title = root.querySelector<HTMLInputElement>('[aria-label="Plan title"]')!,
    heading = root.querySelector<HTMLInputElement>(
      '[aria-label="Step title"]',
    )!,
    instructions = root.querySelector<HTMLTextAreaElement>("textarea")!,
    controls = root.querySelector<HTMLElement>(".play-controls")!;
  root.querySelector<HTMLButtonElement>(".tool-notice")!.onclick = () => {
    const dialog = document.createElement("dialog");
    dialog.className = "notice-dialog";
    dialog.setAttribute("aria-label", "About this visual tool");
    const heading = document.createElement("h2");
    heading.textContent = TOOL_CREDIT;
    const text = document.createElement("p");
    text.textContent = FULL_NOTICE;
    const close = document.createElement("button");
    close.textContent = "Close";
    close.onclick = () => dialog.close();
    dialog.addEventListener("close", () => dialog.remove());
    dialog.append(heading, text, close);
    document.body.append(dialog);
    dialog.showModal();
  };
  const savePanel = document.createElement("aside");
  savePanel.className = "save-notice";
  savePanel.setAttribute("role", "alert");
  root.querySelector(".story-header")!.after(savePanel);
  function storageNotice(): void {
    savePanel.replaceChildren();
    savePanel.hidden =
      !saveIssue && !recoveryRaw && !unreadableRaw && !recoveredDrafts.length;
    if (savePanel.hidden) return;
    const text = document.createElement("span");
    text.textContent = saveIssue || "A recovery copy is available.";
    savePanel.append(text);
    button(savePanel, "Download this tab's plan", () =>
      download("operating-plan-tab.slides.json", exportedPlan(deck)),
    );
    if (recoveryRaw)
      button(savePanel, "Download recovery copy", () =>
        download("operating-plan-recovery.json", recoveryRaw!),
      );
    if (unreadableRaw)
      button(savePanel, "Download unreadable original", () =>
        download("operating-plan-original.json", unreadableRaw!),
      );
    recoveredDrafts.forEach((draft, i) => {
      const suffix = recoveredDrafts.length > 1 ? ` ${i + 1}` : "";
      button(savePanel, `Download unsaved draft${suffix}`, () =>
        download("operating-plan-draft.json", draft.raw),
      );
      button(savePanel, `Restore unsaved draft${suffix}`, () => {
        try {
          const restored = parseDeck(draft.raw);
          change(() => {
            deck = restored;
            index = 0;
            view = drawingBounds(deck);
            consumedDraftKey = draft.key;
          });
        } catch (e) {
          tell((e as Error).message);
        }
      });
    });
    button(savePanel, "Load latest saved plan", () => {
      if (
        !window.confirm(
          "Replace this tab's working view with the latest saved plan? Download this tab's plan first to keep your edits.",
        )
      )
        return;
      window.location.reload();
    });
  }
  window.addEventListener("storage", (e) => {
    if (e.key === KEY && e.newValue !== store?.expected) {
      saveIssue =
        "Another tab changed the saved plan. Download your edits or load the latest saved plan before continuing.";
      storageNotice();
    }
  });
  window.addEventListener("beforeunload", (e) => {
    if (unsaved || recoveredDrafts.some((d) => d.session)) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  const viewControls = document.createElement("div");
  viewControls.className = "view-controls";
  root.querySelector(".drawing")!.before(viewControls);
  function updateView(): void {
    svg.setAttribute(
      "viewBox",
      `${view.x} ${view.y} ${view.width} ${view.height}`,
    );
    for (const background of svg.querySelectorAll("[data-background]")) {
      for (const [key, value] of Object.entries(view))
        background.setAttribute(key, String(value));
    }
    zoomLabel.textContent = `${Math.round((1200 / view.width) * 100)}%`;
  }
  function zoom(
    factor: number,
    anchor = { x: view.x + view.width / 2, y: view.y + view.height / 2 },
  ): void {
    const width = Math.max(240, Math.min(1000000, view.width / factor)),
      ratio = width / view.width;
    view = {
      x: anchor.x - (anchor.x - view.x) * ratio,
      y: anchor.y - (anchor.y - view.y) * ratio,
      width,
      height: (width * 700) / 1200,
    };
    updateView();
  }
  button(viewControls, "Zoom out", () => zoom(1 / 1.25)).textContent = "−";
  viewControls.lastElementChild!.setAttribute("aria-label", "Zoom out");
  const zoomLabel = document.createElement("span");
  viewControls.append(zoomLabel);
  button(viewControls, "Zoom in", () => zoom(1.25)).textContent = "+";
  viewControls.lastElementChild!.setAttribute("aria-label", "Zoom in");
  button(viewControls, "Fit", () => {
    const ps = [
      ...deck.tracks.flatMap((t) => [t.a, t.b]),
      ...slide().units,
      ...deck.labels.flatMap((a) => [a.a, a.b]),
      ...slide().annotations.flatMap((a) => [a.a, a.b]),
    ];
    if (!ps.length) {
      view = drawingBounds(deck);
      updateView();
      return;
    }
    const xs = ps.map((p) => p.x),
      ys = ps.map((p) => p.y),
      minX = Math.min(...xs),
      minY = Math.min(...ys),
      maxX = Math.max(...xs),
      maxY = Math.max(...ys);
    const width = Math.max(
      240,
      maxX - minX + 100,
      ((maxY - minY + 100) * 1200) / 700,
    );
    view = {
      x: (minX + maxX - width) / 2,
      y: (minY + maxY - (width * 700) / 1200) / 2,
      width,
      height: (width * 700) / 1200,
    };
    updateView();
  });
  button(viewControls, "Whole plan", () => {
    view = drawingBounds(deck);
    updateView();
  });
  const focusButton = button(viewControls, "Expand canvas", () => {
    canvasFocus = !canvasFocus;
    render();
  });
  const navigationHint = document.createElement("span");
  navigationHint.textContent =
    "Endless canvas · Wheel to pan · Ctrl/⌘ + wheel to zoom";
  navigationHint.className = "canvas-hint";
  viewControls.append(navigationHint);
  const panButton = button(viewControls, "Pan", () => {
    cancel();
    tool = tool === "pan" ? "select" : "pan";
    render();
  });
  panButton.title = "Drag to pan; or hold Space while dragging";
  updateView();
  const timing = document.createElement("div");
  timing.className = "slide-timing";
  controls.before(timing);
  const slide = () => deck.slides[index]!;
  const canAnnotate = () => !presentation && !playing;
  const editable = () =>
    (index === deck.slides.length - 1 || revising || !!slide().needsReview) &&
    !presentation &&
    !playing &&
    !deck.slides.slice(0, index).some((s) => s.needsReview);
  function button(
    parent: HTMLElement,
    label: string,
    fn: () => void,
    disabled = false,
  ): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.disabled = disabled;
    b.addEventListener("click", fn);
    parent.append(b);
    return b;
  }
  function tell(text: string): void {
    message = text;
    status.textContent = text;
  }
  function cancel(): void {
    token++;
    playing = false;
    manual = null;
    drag = null;
    pendingStart = null;
    hover = null;
    trackPreview = null;
  }
  function change(fn: () => void, propagate = true): void {
    cancel();
    const previous = JSON.stringify(deck);
    try {
      fn();
      const prior = JSON.parse(previous) as Deck;
      if (
        deck.slides.length === prior.slides.length &&
        deck.slides[index]?.id === prior.slides[index]?.id
      ) {
        const geometryChanged =
          JSON.stringify(deck.tracks) !== JSON.stringify(prior.tracks) ||
          JSON.stringify(slide().units) !==
            JSON.stringify(prior.slides[index]!.units) ||
          JSON.stringify(slide().motion) !==
            JSON.stringify(prior.slides[index]!.motion);
        if (geometryChanged && propagate)
          deck.slides
            .slice(Math.max(2, index + 1))
            .forEach((s) => (s.needsReview = true));
      }
      history.push(previous);
      if (history.length > 50) history.shift();
      redo = [];
      save();
    } catch (e) {
      deck = JSON.parse(previous) as Deck;
      tell((e as Error).message);
    }
    render();
  }
  function save(): void {
    const raw = JSON.stringify(deck),
      sequence = ++saveSequence;
    unsaved = true;
    root.dataset.saving = "true";
    try {
      localStorage.setItem(currentDraftKey, raw);
    } catch {
      try {
        sessionStorage.setItem(currentDraftKey, raw);
      } catch {
        /* Download remains available. */
      }
    }
    if (!store || unreadableRaw) {
      saveIssue = unreadableRaw
        ? "Original saved data is protected because its recovery copy could not be stored. Download your current plan and the original."
        : "Browser storage is unavailable. Download your plan to keep your work.";
      root.dataset.saving = "false";
      storageNotice();
      return;
    }
    message = "Saving…";
    void store
      .save(raw)
      .then(() => {
        if (sequence !== saveSequence) return;
        unsaved = false;
        root.dataset.saving = "false";
        if (!recoveryRaw) saveIssue = "";
        message = "Saved in this browser";
        try {
          localStorage.removeItem(currentDraftKey);
          sessionStorage.removeItem(currentDraftKey);
          if (consumedDraftKey) {
            // Never delete another page's recovery key: it may have newer edits.
            // Retain that backup; hide this restored version in the current view.
            recoveredDrafts = recoveredDrafts.filter(
              (d) => d.key !== consumedDraftKey,
            );
            consumedDraftKey = null;
          }
        } catch {
          /* optional */
        }
        status.textContent = message;
        storageNotice();
      })
      .catch((e) => {
        root.dataset.saving = "false";
        saveIssue = (e as Error).message;
        message = saveIssue;
        status.textContent = message;
        storageNotice();
      });
  }
  function download(
    name: string,
    text: string,
    type = "application/json",
  ): void {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const files = root.querySelector<HTMLElement>(".file-actions")!;
  button(files, "New", () => {
    if (
      !window.confirm(
        "Start a blank plan? Download the current plan first if you want to keep a separate copy.",
      )
    )
      return;
    cancel();
    change(() => {
      deck = blank();
      index = 0;
      selected = [];
      trackSelection = [];
      tool = "select";
      view = { x: 0, y: 0, width: 1200, height: 700 };
      updateView();
    });
    canvasFocus = false;
    render();
    welcome(root, true);
  });
  button(files, "Open", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const incoming = parseDeck(await file.text());
        cancel();
        change(() => {
          deck = incoming;
          index = 0;
          selected = [];
          revising = false;
          view = drawingBounds(deck);
        });
      } catch (e) {
        tell(
          (e as Error).message +
            " Older plans can be opened in the legacy editor.",
        );
      }
    };
    input.click();
  });
  button(files, "Download", () =>
    download("operating-plan.slides.json", exportedPlan(deck)),
  );
  button(files, "Export", () => {
    cancel();
    render();
    if (deck.slides.some((s) => s.needsReview)) {
      tell(
        "Review the marked steps before exporting. Download still saves your editable draft.",
      );
      return;
    }
    openExports(copy(deck), index, root);
  }).dataset.tourExport = "true";
  button(files, "Present", () => {
    cancel();
    if (deck.slides.some((s) => s.needsReview)) {
      tell("Review the marked steps before presenting.");
      return;
    }
    presentation = !presentation;
    if (presentation) {
      editingView = { ...view };
      view = drawingBounds(deck);
    } else if (editingView) view = editingView;
    selected = [];
    index = 0;
    render();
  });
  button(files, "Help", () => {
    canvasFocus = false;
    render();
    welcome(root, true);
  });
  const legacy = document.createElement("a");
  legacy.href = "?legacy=1";
  legacy.textContent = "Older plans";
  files.append(legacy);
  function bindText(
    input: HTMLInputElement | HTMLTextAreaElement,
    write: (value: string) => void,
  ): void {
    input.onfocus = () => {
      textEditing = false;
    };
    input.oninput = () => {
      if (!textEditing) {
        history.push(JSON.stringify(deck));
        if (history.length > 50) history.shift();
        redo = [];
        textEditing = true;
      }
      write(input.value);
      save();
      const undoButton = Array.from(tools.querySelectorAll("button")).find(
        (b) => b.textContent === "Undo",
      );
      if (undoButton) undoButton.disabled = false;
    };
    input.onblur = () => {
      textEditing = false;
    };
  }
  bindText(title, (value) => (deck.title = value));
  bindText(heading, (value) => (slide().title = value));
  bindText(instructions, (value) => (slide().text = value));
  function annotationPreview(a: Annotation): Annotation {
    if (!drag || drag.unit !== a.id) return a;
    if (drag.kind === "annotation-end") return { ...a, [drag.side!]: drag.end };
    if (drag.kind !== "annotation") return a;
    const dx = drag.end.x - drag.start.x,
      dy = drag.end.y - drag.start.y;
    return {
      ...a,
      a: { x: a.a.x + dx, y: a.a.y + dy },
      b: { x: a.b.x + dx, y: a.b.y + dy },
    };
  }
  function paint(units?: Unit[]): void {
    const drawingDeck = {
      ...deck,
      tracks: deck.tracks.map(
        (t) => trackPreview?.tracks.find((p) => p.id === t.id) ?? t,
      ),
      labels: deck.labels.map(annotationPreview),
      slides: deck.slides.map((s) => ({
        ...s,
        annotations: s.annotations.map(annotationPreview),
      })),
    };
    svg.innerHTML = scene(
      drawingDeck,
      index,
      units,
      selected,
      !playing && !presentation,
      view,
    );
    if (index === 0 && editable()) {
      for (const track of drawingDeck.tracks) {
        const line = document.createElementNS(NS, "line");
        for (const [k, v] of Object.entries({
          x1: track.a.x,
          y1: track.a.y,
          x2: track.b.x,
          y2: track.b.y,
        }))
          line.setAttribute(k, String(v));
        line.dataset.track = track.id;
        line.setAttribute(
          "stroke",
          trackSelection.includes(track.id)
            ? trackPreview && trackMoveBlocked
              ? "#e8432f"
              : "#e0c580"
            : "transparent",
        );
        line.setAttribute(
          "stroke-width",
          trackSelection.includes(track.id) ? "7" : "18",
        );
        line.setAttribute("vector-effect", "non-scaling-stroke");
        line.classList.toggle(
          "track-chosen",
          trackSelection.includes(track.id),
        );
        svg.append(line);
      }
      for (const track of drawingDeck.tracks.filter(
        (t) => trackSelection.includes(t.id) && !t.turnout,
      )) {
        for (const side of ["a", "b"] as const) {
          const c = document.createElementNS(NS, "circle");
          c.setAttribute("cx", String(track[side].x));
          c.setAttribute("cy", String(track[side].y));
          c.setAttribute("r", "6");
          c.setAttribute("fill", "#0e1013");
          c.setAttribute("stroke", "#d9c48c");
          c.dataset.endpoint = track.id;
          c.dataset.side = side;
          svg.append(c);
        }
      }
    }
    if (canAnnotate()) {
      // Place annotation hit targets above track hit areas, without exporting them.
      for (const a of annotations().map(annotationPreview)) {
        const el = Array.from(
          svg.querySelectorAll<SVGGraphicsElement>("[data-annotation]"),
        ).find((el) => el.getAttribute("data-annotation") === a.id);
        if (!el) continue;
        const bounds = el.getBBox();
        const hit =
          a.kind === "text"
            ? document.createElementNS(NS, "rect")
            : (el.cloneNode(true) as SVGElement);
        if (a.kind === "text") {
          for (const [k, v] of Object.entries({
            x: bounds.x - 5,
            y: bounds.y - 5,
            width: Math.max(20, bounds.width + 10),
            height: Math.max(20, bounds.height + 10),
          }))
            hit.setAttribute(k, String(v));
          hit.setAttribute("fill", "transparent");
        } else {
          hit.setAttribute("fill", "none");
          hit.setAttribute("stroke", "transparent");
          hit.setAttribute("stroke-width", "18");
          hit.setAttribute("vector-effect", "non-scaling-stroke");
          hit.removeAttribute("marker-end");
        }
        hit.setAttribute("data-annotation", a.id);
        hit.setAttribute("data-annotation-hit", a.id);
        svg.append(hit);
        if (annotationSelection === a.id) {
          const box = document.createElementNS(NS, "rect");
          for (const [k, v] of Object.entries({
            x: bounds.x - 7,
            y: bounds.y - 7,
            width: Math.max(14, bounds.width + 14),
            height: Math.max(14, bounds.height + 14),
          }))
            box.setAttribute(k, String(v));
          box.setAttribute("fill", "none");
          box.setAttribute("stroke", "#e0c580");
          box.setAttribute("stroke-dasharray", "5 4");
          box.setAttribute("pointer-events", "none");
          box.classList.add("annotation-chosen");
          svg.append(box);
          if (a.kind === "arrow")
            for (const side of ["a", "b"] as const) {
              const c = document.createElementNS(NS, "circle");
              c.setAttribute("cx", String(a[side].x));
              c.setAttribute("cy", String(a[side].y));
              c.setAttribute("r", "7");
              c.setAttribute("fill", "#e0c580");
              c.dataset.annotationEnd = a.id;
              c.dataset.side = side;
              svg.append(c);
            }
        }
      }
    }
    if (index === 0 && editable() && tool === "turnout" && hover) {
      const snapped = snap(hover, deck.tracks);
      if (snapped && distance(snapped.point, hover) < 30) {
        const preview = turnoutTracks(snapped.point, orientation);
        let color = "#e0c580";
        try {
          validateTracks(preview, deck.tracks);
        } catch {
          color = "#ff7869";
        }
        for (const t of preview) {
          const l = document.createElementNS(NS, "line");
          for (const [k, v] of Object.entries({
            x1: t.a.x,
            y1: t.a.y,
            x2: t.b.x,
            y2: t.b.y,
          }))
            l.setAttribute(k, String(v));
          l.setAttribute("stroke", color);
          l.setAttribute("stroke-width", "5");
          l.setAttribute("stroke-dasharray", "8 5");
          l.setAttribute("pointer-events", "none");
          svg.append(l);
        }
      }
    }
    const connection =
      (trackMoveBlocked ? null : trackPreview?.connection) ??
      (drag?.kind === "track" &&
      snap(drag.end, deck.tracks) &&
      distance(snap(drag.end, deck.tracks)!.point, drag.end) < 0.1
        ? drag.end
        : null);
    if (connection) {
      const marker = document.createElementNS(NS, "circle");
      marker.setAttribute("cx", String(connection.x));
      marker.setAttribute("cy", String(connection.y));
      marker.setAttribute("r", String(snapTolerance() * 0.6));
      marker.setAttribute("fill", "none");
      marker.setAttribute("stroke", "#70e0ad");
      marker.setAttribute("stroke-width", "2");
      marker.setAttribute("vector-effect", "non-scaling-stroke");
      marker.setAttribute("pointer-events", "none");
      marker.dataset.snapTarget = "true";
      svg.append(marker);
    }
    if (manual && manual.length) {
      const p = document.createElementNS(NS, "polyline");
      p.setAttribute("points", points(manual));
      p.setAttribute("fill", "none");
      p.setAttribute("stroke", "#fff");
      p.setAttribute("stroke-width", "3");
      svg.append(p);
    }
    if (drag && ["track", "arrow", "box"].includes(drag.kind)) {
      const p = document.createElementNS(
        NS,
        drag.kind === "box" ? "rect" : "line",
      );
      if (drag.kind === "box") {
        p.setAttribute("x", String(Math.min(drag.start.x, drag.end.x)));
        p.setAttribute("y", String(Math.min(drag.start.y, drag.end.y)));
        p.setAttribute("width", String(Math.abs(drag.end.x - drag.start.x)));
        p.setAttribute("height", String(Math.abs(drag.end.y - drag.start.y)));
        p.setAttribute("fill", "#d9c48c22");
      } else {
        p.setAttribute("x1", String(drag.start.x));
        p.setAttribute("y1", String(drag.start.y));
        p.setAttribute("x2", String(drag.end.x));
        p.setAttribute("y2", String(drag.end.y));
      }
      p.setAttribute("stroke", "#d9c48c");
      p.setAttribute("stroke-width", "2");
      p.setAttribute("pointer-events", "none");
      svg.append(p);
    }
    updateView();
  }
  function choose(i: number): void {
    cancel();
    index = i;
    revising = false;
    annotationSelection = null;
    selected = [];
    trackSelection = [];
    tool = "select";
    render();
  }
  function render(): void {
    storageNotice();
    shell.classList.toggle("presenting", presentation);
    shell.classList.toggle("canvas-focus", canvasFocus && !presentation);
    focusButton.textContent = canvasFocus ? "Restore panels" : "Expand canvas";
    focusButton.setAttribute("aria-pressed", String(canvasFocus));
    focusButton.disabled = presentation || playing;
    if (!annotations().some((a) => a.id === annotationSelection))
      annotationSelection = null;
    trackSelection = trackSelection.filter((id) =>
      deck.tracks.some((t) => t.id === id),
    );
    panButton.classList.toggle("active", tool === "pan");
    svg.style.cursor =
      tool === "pan" ? "grab" : tool === "track" ? "crosshair" : "default";
    title.value = deck.title;
    heading.value = slide().title;
    instructions.value = slide().text;
    heading.disabled = presentation || playing;
    instructions.disabled = presentation || playing;
    title.disabled = playing;
    timing.replaceChildren();
    if (!presentation) {
      const label = document.createElement("label");
      label.textContent = "Pause before next step (seconds) ";
      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.max = "3600";
      input.step = "0.5";
      input.value = String(pauseSeconds(slide()));
      input.setAttribute("aria-label", "Pause before next step (seconds)");
      input.disabled = playing;
      input.onchange = () => {
        const value = Number(input.value);
        if (
          input.value.trim() === "" ||
          !Number.isFinite(value) ||
          value < 0 ||
          value > 3600
        ) {
          tell("Enter a pause from 0 to 3600 seconds.");
          input.value = String(pauseSeconds(slide()));
          return;
        }
        change(() => {
          slide().pauseSeconds = value;
        });
      };
      label.append(input);
      timing.append(label);
      button(
        timing,
        "Apply pause to all steps",
        () =>
          change(() => {
            const value = pauseSeconds(slide());
            deck.slides.forEach((s) => (s.pauseSeconds = value));
          }),
        playing,
      );
    }
    root.querySelector(".phase")!.textContent =
      `STEP ${index + 1} / ${deck.slides.length} · ${index === 0 ? "DRAW THE SITE" : index === 1 ? "STARTING SNAPSHOT" : "ONE MOVEMENT"}`;
    steps.replaceChildren();
    const frame = drawingBounds(deck);
    deck.slides.forEach((s, i) => {
      const b = button(
        steps,
        `${i + 1}  ${s.title}${s.needsReview ? " · Review needed" : ""}`,
        () => choose(i),
      );
      b.className = i === index ? "slide-card current" : "slide-card";
      const thumb = document.createElementNS(NS, "svg");
      thumb.setAttribute(
        "viewBox",
        `${frame.x} ${frame.y} ${frame.width} ${frame.height}`,
      );
      thumb.innerHTML = scene(deck, i, undefined, [], false, frame);
      b.prepend(thumb);
    });
    button(
      steps,
      "+ Next step",
      () => {
        if (!deck.tracks.length) {
          tell("Draw at least one track first.");
          return;
        }
        if (deck.slides.length === 2 && !slide().units.length) {
          tell("Place the starting equipment first.");
          return;
        }
        cancel();
        change(() => {
          nextSlide(deck);
          index = deck.slides.length - 1;
          selected = [];
          tool = "select";
        });
      },
      presentation ||
        index !== deck.slides.length - 1 ||
        deck.slides.some((s) => s.needsReview),
    );
    if (deck.slides.length > 1)
      button(
        steps,
        "Remove last step",
        () => {
          cancel();
          change(() => {
            deck.slides.pop();
            index = deck.slides.length - 1;
            selected = [];
          });
        },
        presentation,
      );
    tools.replaceChildren();
    button(
      tools,
      "Undo",
      () => {
        cancel();
        const prev = history.pop();
        if (prev) {
          redo.push(JSON.stringify(deck));
          deck = JSON.parse(prev) as Deck;
          index = Math.min(index, deck.slides.length - 1);
          selected = [];
          save();
          render();
        }
      },
      !history.length || presentation,
    );
    button(
      tools,
      "Redo",
      () => {
        cancel();
        const next = redo.pop();
        if (next) {
          history.push(JSON.stringify(deck));
          deck = JSON.parse(next) as Deck;
          index = Math.min(index, deck.slides.length - 1);
          selected = [];
          save();
          render();
        }
      },
      !redo.length || presentation,
    );
    const list =
      index === 0
        ? ["select", "track", "turnout", "end", "text", "arrow"]
        : index === 1
          ? ["select", "loco", "loaded", "empty", "text", "arrow"]
          : ["select", "text", "arrow"];
    const names: Record<string, string> = {
      select: "Select",
      track: "Track",
      turnout: "Turnout",
      end: "End of track",
      text: "Text",
      arrow: "Arrow",
      loco: "Locomotive",
      loaded: "Loaded car",
      empty: "Empty car",
    };
    for (const t of list) {
      const b = button(
        tools,
        names[t]!,
        () => {
          tool = t;
          annotationSelection = null;
          pendingStart = null;
          trackSelection = [];
          manual = null;
          render();
        },
        ["select", "text", "arrow"].includes(t) ? !canAnnotate() : !editable(),
      );
      b.dataset.tool = t;
      b.classList.toggle("active", tool === t);
      if (["loco", "loaded", "empty", "turnout", "end"].includes(t)) {
        b.addEventListener("pointerdown", (e) => {
          if (b.disabled) return;
          tool = t;
          drag = {
            kind: "palette",
            start: { x: e.clientX, y: e.clientY },
            end: { x: e.clientX, y: e.clientY },
            ids: [],
            add: false,
          };
        });
      }
    }
    if (index === 0 && editable()) {
      if (tool === "turnout") directionButtons(tools);
      if (trackSelection.length)
        button(tools, "Delete selected track", deleteTrack);
    }
    button(
      tools,
      snapping ? "Snap: on" : "Snap: off",
      () => {
        snapping = !snapping;
        render();
      },
      playing,
    );
    if (annotationSelection && canAnnotate())
      button(tools, "Delete annotation", deleteAnnotation);
    controls.replaceChildren();
    button(controls, playing ? "Stop playback" : "▶ Play plan", () => {
      if (playing) {
        cancel();
        render();
      } else {
        if (deck.slides.some((s) => s.needsReview)) {
          tell("Review the marked steps before playback.");
          return;
        }
        if (!presentation) editingView = { ...view };
        view = drawingBounds(deck);
        index = 0;
        presentation = true;
        preview(true);
      }
    });
    button(controls, "Previous", () => choose(index - 1), index === 0);
    button(
      controls,
      playing ? "Stop" : "▶ Preview step",
      () => {
        if (playing) {
          cancel();
          render();
        } else preview();
      },
      !slide().motion,
    );
    button(
      controls,
      "Next",
      () => {
        if (index < deck.slides.length - 1) {
          choose(index + 1);
          if (presentation && slide().motion) preview();
        }
      },
      index === deck.slides.length - 1,
    );
    if (presentation)
      button(controls, "Exit presentation", () => {
        presentation = false;
        if (editingView) view = editingView;
        cancel();
        render();
      });
    inspector();
    status.textContent = message;
    paint();
  }
  function deleteAnnotation(): void {
    change(() => {
      const list = annotations(),
        i = list.findIndex((a) => a.id === annotationSelection);
      if (i >= 0) list.splice(i, 1);
      annotationSelection = null;
    });
  }
  function editText(): void {
    const a = annotations().find((a) => a.id === annotationSelection);
    if (!a || a.kind !== "text") return;
    const text = window.prompt("Label text", a.text);
    if (text?.trim())
      change(() => {
        a.text = text;
      });
  }
  function addAnnotation(a: Annotation): void {
    change(() => {
      annotations().push(a);
      annotationSelection = a.id;
      trackSelection = [];
      selected = [];
      tool = "select";
    });
  }
  function deleteTrack(): void {
    change(() => {
      deck.tracks = deck.tracks.filter((t) => !trackSelection.includes(t.id));
      trackSelection = [];
    });
  }
  function directionButtons(parent: HTMLElement, selectedGroup?: string): void {
    const row = document.createElement("div");
    row.className = "turnout-directions";
    row.setAttribute("aria-label", "Turnout direction");
    parent.append(row);
    ["Right up", "Right down", "Left up", "Left down"].forEach((name, i) => {
      const b = button(row, name, () => {
        orientation = i;
        if (selectedGroup) {
          change(() => {
            const old = deck.tracks.filter((t) => t.turnout === selectedGroup);
            const replacement = turnoutTracks(old[0]!.a, i, selectedGroup);
            const rest = deck.tracks.filter((t) => t.turnout !== selectedGroup);
            validateTracks(replacement, rest);
            deck.tracks = [...rest, ...replacement];
            trackSelection = replacement.map((t) => t.id);
          });
        } else render();
      });
      b.setAttribute("aria-label", name);
      b.title = name;
      const sx = i < 2 ? 1 : -1,
        sy = i % 2 === 0 ? -1 : 1;
      b.innerHTML = `<svg viewBox="0 0 64 40" aria-hidden="true"><path d="M2 20H62 M32 20L${32 + sx * 12} ${20 + sy * 13}H${32 + sx * 28}" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="32" cy="20" r="3" fill="currentColor"/></svg><span>${name}</span>`;
      b.classList.toggle("active", i === orientation);
    });
  }
  function inspector(): void {
    props.replaceChildren();
    const h = document.createElement("h2");
    h.textContent =
      index === 0
        ? "Draw the railway"
        : index === 1
          ? "Arrange the snapshot"
          : "Create the movement";
    props.append(h);
    const help = document.createElement("p");
    help.textContent =
      !editable() && !presentation
        ? "Track and equipment positions are preserved. Text, arrows, titles and instructions remain editable. Choose Revise this step to make corrections while preserving later slides."
        : index === 0
          ? "Choose Track: click a start and an end, or drag. Lines snap straight. Choose a turnout direction, then place it on a track. Choose Select (V) to drag a line or box-select several. Nearby ends snap together. Delete removes selected pieces. Track (L) draws more lines; Alt bypasses snapping. Wheel to pan; Ctrl/⌘ + wheel to zoom. Keep drawing in any direction."
          : index === 1
            ? "Drag a locomotive, loaded car, or empty car from the toolbar onto any track. Each drop creates a separate cut."
            : "Click a cut, double-click one car, or box-select individual cars. Shift adds to your selection. Drag the selection to its destination.";
    props.append(help);
    if (
      !presentation &&
      !playing &&
      index < deck.slides.length - 1 &&
      !editable() &&
      !deck.slides.slice(0, index).some((s) => s.needsReview)
    )
      button(props, "Revise this step", () => {
        revising = true;
        render();
        tell(
          "Changes here keep later slides and notes, and mark affected movements for review.",
        );
      });
    if (slide().needsReview && !presentation && !playing) {
      const p = document.createElement("p");
      p.textContent =
        "An earlier step changed. Review in order: rebuild this movement or keep the previous snapshot. Your notes remain.";
      props.append(p);
      button(props, "Rebuild remaining steps", () =>
        change(() => {
          const count = rebuildRemaining(deck);
          tell(
            `${count} steps rebuilt. Destinations and notes kept; paths suggested again. Preview the plan to check it. Undo restores all changes.`,
          );
        }, false),
      );
      const hint = document.createElement("p");
      hint.textContent =
        "Rebuild remaining keeps destinations and notes, and suggests paths again. One Undo restores everything. Or review each step below.";
      props.append(hint);
      const blocked = deck.slides.slice(0, index).some((s) => s.needsReview);
      if (slide().motion)
        button(
          props,
          "Rebuild this movement",
          () =>
            change(() => {
              const m = slide().motion!,
                before = deck.slides[index - 1]!.units;
              const anchor = before.find((u) => u.id === m.ids[0]);
              if (
                !anchor ||
                m.ids.some((id) => !before.some((u) => u.id === id))
              )
                throw new Error(
                  "Some equipment was removed. Use the previous snapshot, then select equipment and draw this movement again.",
                );
              moveSlide(
                deck,
                index,
                m.ids,
                movementRoute(deck.tracks, anchor, m.path[m.path.length - 1]!),
              );
              delete slide().needsReview;
            }),
          blocked,
        );
      button(
        props,
        "Use previous snapshot",
        () =>
          change(() => {
            slide().units = copy(deck.slides[index - 1]!.units);
            delete slide().motion;
            delete slide().needsReview;
          }),
        blocked,
      );
    }
    if (annotationSelection && canAnnotate()) {
      const a = annotations().find((a) => a.id === annotationSelection)!;
      const p = document.createElement("p");
      p.textContent = `${a.kind === "text" ? "Text" : a.kind === "arrow" ? "Arrow" : "End marker"} selected. Drag to move.${a.kind === "arrow" ? " Drag a round handle to change either end." : ""}`;
      props.append(p);
      if (a.kind === "text") button(props, "Edit text", editText);
      button(props, "Delete annotation", deleteAnnotation);
      button(props, "Clear selection", () => {
        annotationSelection = null;
        render();
      });
    }
    if (index === 0 && trackSelection.length && editable()) {
      const t = deck.tracks.find((t) => t.id === trackSelection[0]);
      const p = document.createElement("p");
      p.textContent =
        trackSelection.length > (t?.turnout ? 2 : 1)
          ? `${trackSelection.length} track pieces selected. Drag a selected line to move them together; Delete removes them. Undo restores the change.`
          : t?.turnout
            ? "Turnout selected. Drag either piece to move the whole turnout. Both pieces delete together. Choose a direction to change it."
            : "Track selected. Drag the line to move it, or either end to resize. Nearby endpoints snap together; hold Alt for free placement. Delete removes this section.";
      props.append(p);
      if (t?.turnout && trackSelection.length === 2)
        directionButtons(props, t.turnout);
      button(props, "Delete selected track", deleteTrack);
      button(props, "Clear selection", () => {
        trackSelection = [];
        render();
      });
    }
    if (selected.length) {
      const p = document.createElement("p");
      p.textContent = `${selected.length} selected`;
      props.append(p);
      button(props, "Clear selection", () => {
        selected = [];
        render();
      });
      if (index === 1 && editable()) {
        button(props, "Flip", () =>
          change(() => {
            slide()
              .units.filter((u) => selected.includes(u.id))
              .forEach((u) => (u.flipped = !u.flipped));
          }),
        );
        const cut = slide().units.find((u) => u.id === selected[0])?.cut,
          units = slide().units.filter((u) => u.cut === cut),
          same = selected.every((i) => units.some((u) => u.id === i));
        if (same && units[0]?.kind !== "loco") {
          const row = document.createElement("div");
          row.className = "quantity";
          props.append(row);
          button(
            row,
            "−",
            () =>
              change(() => {
                const last = units[units.length - 1]!;
                slide().units = slide().units.filter((u) => u.id !== last.id);
                selected = selected.filter((i) => i !== last.id);
              }),
            units.length < 2,
          );
          const count = document.createElement("span");
          count.textContent = String(units.length);
          row.append(count);
          button(row, "+", () =>
            change(() => {
              const last = units[units.length - 1]!,
                r = (last.angle * Math.PI) / 180;
              const u = {
                ...last,
                id: id(),
                x: last.x + 46 * Math.cos(r),
                y: last.y + 46 * Math.sin(r),
              };
              slide().units.push(u);
              selected = slide()
                .units.filter((u) => u.cut === cut)
                .map((u) => u.id);
            }),
          );
        }
        button(props, "Loaded", () =>
          change(() => {
            slide()
              .units.filter((u) => selected.includes(u.id) && u.kind !== "loco")
              .forEach((u) => (u.kind = "loaded"));
          }),
        );
        button(props, "Empty", () =>
          change(() => {
            slide()
              .units.filter((u) => selected.includes(u.id) && u.kind !== "loco")
              .forEach((u) => (u.kind = "empty"));
          }),
        );
        button(props, "Delete selected", () =>
          change(() => {
            slide().units = slide().units.filter(
              (u) => !selected.includes(u.id),
            );
            selected = [];
          }),
        );
      }
    }
    if (slide().motion && editable() && !slide().needsReview) {
      button(props, "Edit path", () => {
        manual = [copy(slide().motion!.path[0]!)];
        tell(
          "Click along the intended path, on or off track, then Finish path. Reversals need another slide.",
        );
        paint();
        inspector();
      });
      if (manual)
        button(props, "Finish path", () => {
          const m = slide().motion!,
            end = m.path[m.path.length - 1]!,
            tail = movementRoute(
              deck.tracks,
              manual![manual!.length - 1]!,
              end,
            );
          const path = [...manual!, ...tail.slice(1)];
          manual = null;
          change(() => moveSlide(deck, index, m.ids, path));
        });
      button(props, "Reset path", () => {
        const m = slide().motion!,
          path = movementRoute(
            deck.tracks,
            m.path[0]!,
            m.path[m.path.length - 1]!,
          );
        change(() => moveSlide(deck, index, m.ids, path));
      });
      button(props, "Clear movement", () => {
        cancel();
        change(() => {
          slide().units = copy(deck.slides[index - 1]!.units);
          delete slide().motion;
          selected = [];
        });
      });
    }
  }

  function point(e: PointerEvent | MouseEvent): Point {
    const p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const matrix = svg.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const q = p.matrixTransform(matrix.inverse());
    return { x: q.x, y: q.y };
  }
  function snapTolerance(): number {
    return 12 / (svg.getScreenCTM()?.a || 1);
  }
  function grid(p: Point, bypass = false): Point {
    if (!snapping || bypass) return p;
    return trackSnap(p, deck.tracks, snapTolerance()).point;
  }
  function place(p: Point): void {
    if (!canAnnotate() || (tool !== "text" && !editable())) return;
    const s = snap(p, deck.tracks);
    if (["loco", "loaded", "empty"].includes(tool) && index === 1) {
      if (!s || distance(s.point, p) > 50) {
        tell("Drop equipment onto a track.");
        return;
      }
      change(() => {
        const u: Unit = {
          id: id(),
          cut: id(),
          kind: tool as Unit["kind"],
          ...s.point,
          angle: s.angle,
          flipped: false,
        };
        slide().units.push(u);
        selected = [u.id];
      });
      tool = "select";
      render();
      return;
    }
    if (index === 0 && tool === "turnout") {
      if (!s || distance(s.point, p) > 30) {
        tell("Drop the turnout onto a track.");
        return;
      }
      change(() => {
        const tracks = turnoutTracks(s.point, orientation);
        validateTracks(tracks, deck.tracks);
        deck.tracks.push(...tracks);
        trackSelection = tracks.map((t) => t.id);
        tool = "select";
      });
      return;
    }
    if (index === 0 && tool === "end") {
      if (!s) return;
      const a =
        distance(p, s.track.a) < distance(p, s.track.b) ? s.track.a : s.track.b;
      addAnnotation({
        id: id(),
        kind: "end",
        a: copy(a),
        b: copy(a),
        text: "",
      });
      return;
    }
    if (tool === "text") {
      const text = window.prompt("Label text");
      if (text?.trim())
        addAnnotation({ id: id(), kind: "text", a: grid(p), b: grid(p), text });
    }
  }
  function annotations(): Annotation[] {
    return index === 0 ? deck.labels : slide().annotations;
  }
  root.addEventListener(
    "pointerdown",
    (e) => {
      if (!svg.contains(e.target as Node)) {
        lastAnnotationPick = undefined;
        lastPick = undefined;
      }
    },
    true,
  );
  svg.addEventListener("pointerdown", (e) => {
    if (e.button === 1 || space || tool === "pan") {
      e.preventDefault();
      pan = { x: e.clientX, y: e.clientY, view: { ...view } };
      return;
    }
    if (e.button !== 0 || !canAnnotate()) return;
    const p = point(e);
    if (manual) {
      const s = snap(p, deck.tracks);
      const target =
        snapping && !e.altKey && s && distance(s.point, p) < 24 ? s.point : p;
      const segment = movementRoute(
        deck.tracks,
        manual[manual.length - 1]!,
        target,
      );
      manual.push(...segment.slice(1));
      paint();
      return;
    }
    if (["loco", "loaded", "empty", "turnout", "end", "text"].includes(tool)) {
      place(p);
      return;
    }
    const endpoint = (e.target as Element).closest("[data-endpoint]");
    if (endpoint && index === 0 && editable() && tool === "select") {
      drag = {
        kind: "endpoint",
        start: p,
        end: p,
        ids: [],
        unit: endpoint.getAttribute("data-endpoint")!,
        side: endpoint.getAttribute("data-side") as "a" | "b",
        add: false,
      };
      return;
    }
    const handle = (e.target as Element).closest("[data-annotation-end]");
    const annotation =
      handle?.getAttribute("data-annotation-end") ??
      (e.target as Element)
        .closest("[data-annotation]")
        ?.getAttribute("data-annotation");
    if (annotation && tool === "select") {
      if (!annotations().some((a) => a.id === annotation)) {
        tell(
          "This label belongs to the shared layout. Select Step 1 to edit it.",
        );
        return;
      }
      annotationSelection = annotation;
      trackSelection = [];
      selected = [];
      drag = {
        kind: handle ? "annotation-end" : "annotation",
        start: p,
        end: p,
        ids: [],
        unit: annotation,
        side: handle?.getAttribute("data-side") as "a" | "b",
        add: false,
      };
      // Keep the hit element alive until pointerup so double-click can be detected.
      inspector();
      return;
    }
    annotationSelection = null;
    if ((tool === "track" && editable()) || tool === "arrow") {
      drag = {
        kind: tool,
        start: pendingStart ?? grid(p, e.altKey),
        end: p,
        ids: [],
        add: false,
      };
      return;
    }
    if (!editable()) {
      render();
      return;
    }
    const trackId = (e.target as Element)
      .closest("[data-track]")
      ?.getAttribute("data-track");
    if (index === 0 && tool === "select") {
      const t = deck.tracks.find((t) => t.id === trackId);
      if (!t) {
        if (!e.shiftKey) trackSelection = [];
        drag = { kind: "box", start: p, end: p, ids: [], add: e.shiftKey };
        paint();
        inspector();
        return;
      }
      const group = deck.tracks
        .filter((v) => v.id === t.id || (t.turnout && v.turnout === t.turnout))
        .map((v) => v.id);
      trackSelection = e.shiftKey
        ? group.every((id) => trackSelection.includes(id))
          ? trackSelection.filter((id) => !group.includes(id))
          : [...new Set([...trackSelection, ...group])]
        : trackSelection.includes(t.id)
          ? trackSelection
          : group;
      if (!e.shiftKey)
        drag = {
          kind: "tracks",
          start: p,
          end: p,
          ids: [...trackSelection],
          add: false,
        };
      if (t?.turnout) {
        const branch = deck.tracks.find((v) => v.turnout === t.turnout)!;
        orientation =
          (branch.b.x > branch.a.x ? 0 : 2) + (branch.b.y > branch.a.y ? 1 : 0);
      }
      render();
      return;
    }
    const unit = (e.target as Element)
      .closest("[data-unit]")
      ?.getAttribute("data-unit");
    if (unit) {
      const u = slide().units.find((u) => u.id === unit)!;
      const double =
        lastPick?.id === unit && performance.now() - lastPick.time < 400;
      lastPick = { id: unit, time: performance.now() };
      if (double) {
        selected = e.shiftKey ? [...new Set([...selected, unit])] : [unit];
      } else if (e.shiftKey) {
        const cut = slide()
          .units.filter((v) => v.cut === u.cut)
          .map((v) => v.id);
        selected = [...new Set([...selected, ...cut])];
      } else if (!selected.includes(unit))
        selected = slide()
          .units.filter((v) => v.cut === u.cut)
          .map((v) => v.id);
      drag = {
        kind: "units",
        start: p,
        end: p,
        ids: [...selected],
        unit,
        add: false,
      };
      paint();
      inspector();
    } else {
      drag = { kind: "box", start: p, end: p, ids: [], add: e.shiftKey };
      if (!e.shiftKey) selected = [];
      paint();
    }
  });
  svg.addEventListener("dblclick", (e) => {
    if (!canAnnotate()) return;
    const unit = (e.target as Element)
      .closest("[data-unit]")
      ?.getAttribute("data-unit");
    const aid = (e.target as Element)
      .closest("[data-annotation]")
      ?.getAttribute("data-annotation");
    if (aid) return;
    if (unit && editable()) {
      selected = e.shiftKey ? [...new Set([...selected, unit])] : [unit];
      drag = null;
      paint();
      inspector();
    }
  });
  window.addEventListener("pointermove", (e) => {
    if (pan) {
      const matrix = svg.getScreenCTM();
      if (!matrix) return;
      view = {
        ...pan.view,
        x: pan.view.x - (e.clientX - pan.x) / matrix.a,
        y: pan.view.y - (e.clientY - pan.y) / matrix.d,
      };
      updateView();
      return;
    }
    hover = point(e);
    if (pendingStart && !drag) {
      drag = {
        kind: "track",
        start: pendingStart,
        end: straightEnd(
          pendingStart,
          hover,
          deck.tracks,
          snapping && !e.altKey,
          snapTolerance(),
        ),
        ids: [],
        add: false,
      };
      paint();
      drag = null;
      return;
    }
    if (!drag || drag.kind === "palette") {
      if (tool === "turnout") paint();
      return;
    }
    drag.end =
      drag.kind === "track"
        ? straightEnd(
            drag.start,
            point(e),
            deck.tracks,
            snapping && !e.altKey,
            snapTolerance(),
          )
        : point(e);
    if (drag.kind === "tracks") {
      trackPreview = translateTracks(
        deck.tracks.filter((t) => drag!.ids.includes(t.id)),
        deck.tracks.filter((t) => !drag!.ids.includes(t.id)),
        { x: drag.end.x - drag.start.x, y: drag.end.y - drag.start.y },
        snapping && !e.altKey,
        snapTolerance(),
      );
      try {
        validateTracks(
          trackPreview.tracks,
          deck.tracks.filter((t) => !drag!.ids.includes(t.id)),
        );
        trackMoveBlocked = false;
      } catch {
        trackMoveBlocked = true;
      }
      paint();
    } else if (drag.kind === "units") {
      const dx = drag.end.x - drag.start.x,
        dy = drag.end.y - drag.start.y;
      paint(
        slide().units.map((u) =>
          drag!.ids.includes(u.id) ? { ...u, x: u.x + dx, y: u.y + dy } : u,
        ),
      );
    } else paint();
  });
  window.addEventListener("pointerup", (e) => {
    if (pan) {
      pan = null;
      return;
    }
    if (!drag) return;
    const d = drag;
    drag = null;
    trackPreview = null;
    if (d.kind === "palette") {
      const p = point(e);
      const bounds = svg.getBoundingClientRect();
      if (
        e.clientX >= bounds.left &&
        e.clientX <= bounds.right &&
        e.clientY >= bounds.top &&
        e.clientY <= bounds.bottom
      )
        place(p);
      return;
    }
    const p = point(e);
    if (d.kind === "box" && index === 0) {
      const inside = (q: Point) =>
        q.x >= Math.min(d.start.x, p.x) &&
        q.x <= Math.max(d.start.x, p.x) &&
        q.y >= Math.min(d.start.y, p.y) &&
        q.y <= Math.max(d.start.y, p.y);
      const contained = deck.tracks.filter((t) => inside(t.a) && inside(t.b));
      const groups = new Set(contained.map((t) => t.turnout).filter(Boolean));
      const ids = deck.tracks
        .filter(
          (t) => contained.includes(t) || (t.turnout && groups.has(t.turnout)),
        )
        .map((t) => t.id);
      trackSelection = d.add ? [...new Set([...trackSelection, ...ids])] : ids;
      paint();
      inspector();
      return;
    }
    if (d.kind === "box") {
      const ids = selectedInBox(slide().units, d.start, p);
      selected = d.add ? [...new Set([...selected, ...ids])] : ids;
      paint();
      inspector();
      return;
    }
    if (d.kind === "track" && distance(d.start, p) < 4) {
      pendingStart = d.start;
      tell("Start set. Click the other end; Escape cancels.");
      paint();
      return;
    }
    if (distance(d.start, p) < 4) {
      if (d.kind === "annotation") {
        const double =
          lastAnnotationPick &&
          lastAnnotationPick.id === d.unit &&
          performance.now() - lastAnnotationPick.time < 400;
        lastAnnotationPick = { id: d.unit!, time: performance.now() };
        if (double) {
          lastAnnotationPick = undefined;
          editText();
        }
      }
      render();
      return;
    }
    if (d.kind === "tracks") {
      change(() => {
        const moved = translateTracks(
          deck.tracks.filter((t) => d.ids.includes(t.id)),
          deck.tracks.filter((t) => !d.ids.includes(t.id)),
          { x: p.x - d.start.x, y: p.y - d.start.y },
          snapping && !e.altKey,
          snapTolerance(),
        );
        const rest = deck.tracks.filter((t) => !d.ids.includes(t.id));
        validateTracks(moved.tracks, rest);
        deck.tracks = deck.tracks.map(
          (t) => moved.tracks.find((m) => m.id === t.id) ?? t,
        );
      });
      return;
    }
    if (d.kind === "endpoint") {
      change(() => {
        const track = deck.tracks.find((t) => t.id === d.unit)!;
        const old = copy(track[d.side!]);
        const others = deck.tracks.filter((t) => t.id !== track.id);
        const candidate =
          Math.abs(track.a.x - track.b.x) < 0.1 ||
          Math.abs(track.a.y - track.b.y) < 0.1
            ? straightEnd(
                track[d.side === "a" ? "b" : "a"],
                p,
                others,
                snapping && !e.altKey,
                snapTolerance(),
              )
            : grid(p, e.altKey);
        const end = candidate;
        if (
          deck.tracks.some(
            (t) => t.turnout && [t.a, t.b].some((p) => distance(p, old) < 0.1),
          )
        )
          throw new Error(
            "This end joins a turnout. Delete or change the turnout first.",
          );
        for (const t of deck.tracks)
          for (const side of ["a", "b"] as const)
            if (distance(t[side], old) < 0.1) t[side] = copy(end);
        validateTracks(deck.tracks, []);
      });
      return;
    }
    if (d.kind === "annotation-end") {
      change(() => {
        const a = annotations().find((a) => a.id === d.unit);
        if (a) a[d.side!] = grid(p, e.altKey);
      });
      return;
    }
    if (d.kind === "annotation") {
      lastAnnotationPick = undefined;
      change(() => {
        const a = annotations().find((a) => a.id === d.unit)!;
        const target = grid(p, e.altKey);
        const dx = target.x - d.start.x,
          dy = target.y - d.start.y;
        a.a = { x: a.a.x + dx, y: a.a.y + dy };
        a.b = { x: a.b.x + dx, y: a.b.y + dy };
      });
      return;
    }
    if (d.kind === "track") {
      change(() => {
        const track = {
          id: id(),
          a: d.start,
          b: straightEnd(
            d.start,
            p,
            deck.tracks,
            snapping && !e.altKey,
            snapTolerance(),
          ),
        };
        validateTracks([track], deck.tracks);
        deck.tracks.push(track);
      });
      return;
    }
    if (d.kind === "arrow") {
      addAnnotation({ id: id(), kind: "arrow", a: d.start, b: p, text: "" });
      return;
    }
    if (d.kind === "units") {
      lastPick = undefined;
      const anchor = slide().units.find((u) => u.id === d.unit)!;
      const target = {
        x: anchor.x + p.x - d.start.x,
        y: anchor.y + p.y - d.start.y,
      };
      const nearest = snap(target, deck.tracks);
      const onTrack =
        snapping &&
        !e.altKey &&
        nearest &&
        distance(nearest.point, target) < 24;
      const destination = onTrack
        ? nearest!
        : { point: target, angle: anchor.angle };
      if (index === 1) {
        change(() => {
          if (!onTrack) {
            slide().units = slide().units.map((u) =>
              d.ids.includes(u.id)
                ? {
                    ...u,
                    x: u.x + target.x - anchor.x,
                    y: u.y + target.y - anchor.y,
                  }
                : u,
            );
            return;
          }
          const a = (destination.angle * Math.PI) / 180,
            old = (anchor.angle * Math.PI) / 180;
          slide().units = slide().units.map((u) => {
            if (!d.ids.includes(u.id)) return u;
            const offset =
              (u.x - anchor.x) * Math.cos(old) +
              (u.y - anchor.y) * Math.sin(old);
            return {
              ...u,
              x: destination.point.x + offset * Math.cos(a),
              y: destination.point.y + offset * Math.sin(a),
              angle: destination.angle,
            };
          });
        });
      } else if (index > 1) {
        const before = deck.slides[index - 1]!.units.find(
          (u) => u.id === d.unit,
        )!;
        const m = slide().motion;
        if (
          m &&
          (m.ids.length !== d.ids.length ||
            m.ids.some((i) => !d.ids.includes(i)))
        ) {
          tell(
            "One cut moves per slide. Add the next step, or clear this movement first.",
          );
          paint();
          return;
        }
        if (
          !before ||
          d.ids.some(
            (id) => !deck.slides[index - 1]!.units.some((u) => u.id === id),
          )
        ) {
          tell(
            "Some equipment was removed in an earlier step. Use previous snapshot, then select equipment again.",
          );
          paint();
          return;
        }
        const path = movementRoute(deck.tracks, before, destination.point);
        change(() =>
          moveSlide(
            deck,
            index,
            [d.unit!, ...d.ids.filter((i) => i !== d.unit)],
            path,
          ),
        );
      }
    }
  });
  svg.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12, point(e));
      } else {
        const scale = view.width / svg.getBoundingClientRect().width;
        const unit =
          e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? svg.clientHeight : 1;
        view.x += (e.shiftKey ? e.deltaY : e.deltaX) * scale * unit;
        view.y += (e.shiftKey ? 0 : e.deltaY) * scale * unit;
        updateView();
      }
    },
    { passive: false },
  );
  window.addEventListener("keyup", (e) => {
    if (e.code === "Space") space = false;
  });
  window.addEventListener("pointercancel", () => {
    trackPreview = null;
    drag = null;
    pan = null;
    paint();
  });
  window.addEventListener("blur", () => {
    space = false;
    pan = null;
  });
  window.addEventListener("keydown", (e) => {
    if (root.querySelector("dialog[open]")) return;
    const typing =
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement;
    if (
      !typing &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      index === 0 &&
      canAnnotate() &&
      ["v", "l"].includes(e.key.toLowerCase())
    ) {
      e.preventDefault();
      cancel();
      tool = e.key.toLowerCase() === "v" ? "select" : "track";
      render();
      return;
    }
    if (
      !typing &&
      index === 0 &&
      editable() &&
      (e.ctrlKey || e.metaKey) &&
      e.key.toLowerCase() === "a"
    ) {
      e.preventDefault();
      trackSelection = deck.tracks.map((t) => t.id);
      annotationSelection = null;
      paint();
      inspector();
      return;
    }
    if (
      e.code === "Space" &&
      !typing &&
      !(e.target instanceof HTMLButtonElement)
    ) {
      e.preventDefault();
      space = true;
    }
    if (
      !typing &&
      index === 0 &&
      editable() &&
      trackSelection.length &&
      ["Backspace", "Delete"].includes(e.key)
    ) {
      e.preventDefault();
      deleteTrack();
      return;
    }
    if (
      !typing &&
      canAnnotate() &&
      annotationSelection &&
      ["Backspace", "Delete"].includes(e.key)
    ) {
      e.preventDefault();
      deleteAnnotation();
      return;
    }
    if (e.key === "Escape" && !typing) {
      annotationSelection = null;
      cancel();
      tool = "select";
      selected = [];
      trackSelection = [];
      render();
    }
    if (
      (e.key === "Backspace" || e.key === "Delete") &&
      !(e.target instanceof HTMLInputElement) &&
      !(e.target instanceof HTMLTextAreaElement) &&
      index === 1 &&
      editable() &&
      selected.length
    ) {
      e.preventDefault();
      change(() => {
        slide().units = slide().units.filter((u) => !selected.includes(u.id));
        selected = [];
      });
    }
  });
  function preview(autoplay = false): void {
    if (
      (autoplay ? deck.slides : deck.slides.slice(0, index + 1)).some(
        (s) => s.needsReview,
      )
    ) {
      tell("Review the marked steps before playback.");
      return;
    }
    if (!autoplay && (!slide().motion || index < 2)) return;
    cancel();
    playing = true;
    selected = [];
    render();
    const run = ++token;
    let start = performance.now();
    function frame(now: number): void {
      if (run !== token) return;
      const current = slide(),
        elapsed = now - start,
        move = movementMs(current, index);
      const t = move ? Math.min(1, elapsed / move) : 1;
      paint(
        current.motion && index > 1
          ? animatedUnits(
              deck.slides[index - 1]!.units,
              current.motion,
              t * t * (3 - 2 * t),
            )
          : current.units,
      );
      if (autoplay ? elapsed >= durationMs(current, index) : t >= 1) {
        if (autoplay && index < deck.slides.length - 1) {
          index++;
          start = now;
          render();
          requestAnimationFrame(frame);
        } else {
          playing = false;
          render();
        }
      } else requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  render();
  welcome(root);
}
