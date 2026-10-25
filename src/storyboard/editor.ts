import {
  blank,
  pauseSeconds,
  movementMs,
  durationMs,
  straightEnd,
  copy,
  id,
  nextSlide,
  snap,
  route,
  distance,
  animatedUnits,
  selectedInBox,
  moveSlide,
  parseDeck,
  type Deck,
  type Point,
  type Unit,
  type Annotation,
} from "./model";
import { scene, points } from "./render";
import { openExports } from "./exports";
const KEY = "railway-storyboard-v1";
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
    const saved = localStorage.getItem(KEY);
    if (saved) deck = parseDeck(saved);
  } catch {
    message =
      "Saved data could not be opened. It has been left untouched; use Open to restore a downloaded plan.";
  }
  root.innerHTML =
    '<div class="storyboard"><header class="story-header"><div class="brand">RAILWAY <span>OPERATING PLAN</span></div><input aria-label="Plan title" class="plan-title"><div class="file-actions"></div></header><nav class="story-tools" aria-label="Drawing tools"></nav><aside class="story-steps" aria-label="Steps"></aside><main class="story-main"><div class="slide-heading"><span class="phase"></span><input aria-label="Step title"></div><div class="drawing"><svg viewBox="0 0 1200 700" aria-label="Railway canvas" role="img"></svg></div><textarea aria-label="Step instructions" placeholder="Explain what happens in this step…"></textarea><div class="play-controls"></div></main><aside class="story-inspector"></aside><footer class="story-status" role="status"></footer></div>';
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
  const timing = document.createElement("div");
  timing.className = "slide-timing";
  controls.before(timing);
  const slide = () => deck.slides[index]!;
  const editable = () =>
    index === deck.slides.length - 1 && !presentation && !playing;
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
  }
  function change(fn: () => void): void {
    cancel();
    const previous = JSON.stringify(deck);
    try {
      fn();
      history.push(previous);
      redo = [];
      save();
    } catch (e) {
      deck = JSON.parse(previous) as Deck;
      tell((e as Error).message);
    }
    render();
  }
  function save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(deck));
      message = "Saved in this browser";
    } catch {
      message =
        "Could not save in this browser. Download your plan to keep it.";
    }
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
    });
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
    download("operating-plan.slides.json", JSON.stringify(deck, null, 2)),
  );
  button(files, "Export", () => {
    cancel();
    render();
    openExports(copy(deck), index, root);
  });
  button(files, "Present", () => {
    cancel();
    presentation = !presentation;
    selected = [];
    index = 0;
    render();
  });
  const legacy = document.createElement("a");
  legacy.href = "?legacy=1";
  legacy.textContent = "Older plans";
  files.append(legacy);
  title.onchange = () =>
    change(() => {
      deck.title = title.value;
    });
  heading.onchange = () =>
    change(() => {
      slide().title = heading.value;
    });
  instructions.onchange = () =>
    change(() => {
      slide().text = instructions.value;
    });
  function paint(units?: Unit[]): void {
    svg.innerHTML = scene(
      deck,
      index,
      units,
      selected,
      !playing && !presentation,
    );
    if (index === 0 && editable()) {
      for (const track of deck.tracks) {
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
  }
  function choose(i: number): void {
    cancel();
    index = i;
    selected = [];
    tool = "select";
    render();
  }
  function render(): void {
    shell.classList.toggle("presenting", presentation);
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
    deck.slides.forEach((s, i) => {
      const b = button(steps, `${i + 1}  ${s.title}`, () => choose(i));
      b.className = i === index ? "slide-card current" : "slide-card";
      const thumb = document.createElementNS(NS, "svg");
      thumb.setAttribute("viewBox", "0 0 1200 700");
      thumb.innerHTML = scene(deck, i);
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
      presentation || index !== deck.slides.length - 1,
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
          manual = null;
          render();
        },
        !editable() || presentation,
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
    if (index === 0)
      button(
        tools,
        `Turnout ↻ ${orientation + 1}/4`,
        () => {
          orientation = (orientation + 1) % 4;
          render();
        },
        !editable(),
      );
    button(
      tools,
      snapping ? "Snap: on" : "Snap: off",
      () => {
        snapping = !snapping;
        render();
      },
      playing,
    );
    controls.replaceChildren();
    button(controls, playing ? "Stop playback" : "▶ Play plan", () => {
      if (playing) {
        cancel();
        render();
      } else {
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
        cancel();
        render();
      });
    inspector();
    status.textContent = message;
    paint();
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
        ? "This snapshot is preserved. Remove later steps or undo to revise its geometry. Titles and instructions remain editable."
        : index === 0
          ? "Choose Track and drag a line. Drop turnouts on tracks; rotate before placing. Endpoints snap."
          : index === 1
            ? "Drag a locomotive, loaded car, or empty car from the toolbar onto any track. Each drop creates a separate cut."
            : "Click a cut, double-click one car, or box-select individual cars. Shift adds to your selection. Drag the selection to its destination.";
    props.append(help);
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
    if (slide().motion && editable()) {
      button(props, "Edit path", () => {
        manual = [copy(slide().motion!.path[0]!)];
        tell(
          "Click tracks to choose the route, then Finish path. Reversals need another slide.",
        );
        paint();
        inspector();
      });
      if (manual)
        button(props, "Finish path", () => {
          const m = slide().motion!,
            end = m.path[m.path.length - 1]!,
            tail = route(deck.tracks, manual![manual!.length - 1]!, end);
          if (!tail) {
            tell("No connected track route. Choose another track.");
            return;
          }
          const path = [...manual!, ...tail.slice(1)];
          manual = null;
          change(() => moveSlide(deck, index, m.ids, path));
        });
      button(props, "Reset path", () => {
        const m = slide().motion!,
          path = route(deck.tracks, m.path[0]!, m.path[m.path.length - 1]!);
        if (path) change(() => moveSlide(deck, index, m.ids, path));
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
    if (index === 0 && editable() && deck.tracks.length)
      button(props, "Remove last track", () =>
        change(() => {
          deck.tracks.pop();
        }),
      );
    const annotations = index === 0 ? deck.labels : slide().annotations;
    if (annotations.length && editable())
      button(props, "Remove last annotation", () =>
        change(() => {
          annotations.pop();
        }),
      );
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
  function grid(p: Point, bypass = false): Point {
    if (!snapping || bypass) return p;
    const s = snap(p, deck.tracks);
    if (s && distance(s.point, p) < 12) return s.point;
    return { x: Math.round(p.x / 20) * 20, y: Math.round(p.y / 20) * 20 };
  }
  function place(p: Point): void {
    if (!editable()) return;
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
        const sx = orientation < 2 ? 1 : -1,
          sy = orientation % 2 === 0 ? -1 : 1;
        const a = s.point,
          b = { x: a.x + sx * 80, y: a.y + sy * 60 },
          c = { x: b.x + sx * 120, y: b.y };
        deck.tracks.push({ id: id(), a, b }, { id: id(), a: b, b: c });
      });
      return;
    }
    if (index === 0 && tool === "end") {
      if (!s) return;
      const a =
        distance(p, s.track.a) < distance(p, s.track.b) ? s.track.a : s.track.b;
      change(() =>
        deck.labels.push({
          id: id(),
          kind: "end",
          a: copy(a),
          b: copy(a),
          text: "",
        }),
      );
      return;
    }
    if (tool === "text") {
      const text = window.prompt("Label text");
      if (text?.trim())
        change(() =>
          annotations().push({
            id: id(),
            kind: "text",
            a: grid(p),
            b: grid(p),
            text,
          }),
        );
    }
  }
  function annotations(): Annotation[] {
    return index === 0 ? deck.labels : slide().annotations;
  }
  svg.addEventListener("pointerdown", (e) => {
    if (!editable() || playing) return;
    const p = point(e);
    if (manual) {
      const s = snap(p, deck.tracks);
      const segment =
        s && route(deck.tracks, manual[manual.length - 1]!, s.point);
      if (segment) {
        manual.push(...segment.slice(1));
        paint();
      } else tell("Choose a connected track.");
      return;
    }
    if (["loco", "loaded", "empty", "turnout", "end", "text"].includes(tool)) {
      place(p);
      return;
    }
    const endpoint = (e.target as Element).closest("[data-endpoint]");
    if (endpoint && index === 0) {
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
    const annotation = (e.target as Element)
      .closest("[data-annotation]")
      ?.getAttribute("data-annotation");
    if (annotation && tool === "select") {
      drag = {
        kind: "annotation",
        start: p,
        end: p,
        ids: [],
        unit: annotation,
        add: false,
      };
      return;
    }
    if (tool === "track" || tool === "arrow") {
      drag = {
        kind: tool,
        start: grid(p, e.altKey),
        end: p,
        ids: [],
        add: false,
      };
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
    if (!editable()) return;
    const unit = (e.target as Element)
      .closest("[data-unit]")
      ?.getAttribute("data-unit");
    const aid = (e.target as Element)
      .closest("[data-annotation]")
      ?.getAttribute("data-annotation");
    if (aid) {
      const a = annotations().find((a) => a.id === aid);
      if (a?.kind === "text") {
        const text = window.prompt("Label text", a.text);
        if (text !== null)
          change(() => {
            a.text = text;
          });
      }
      return;
    }
    if (unit) {
      selected = e.shiftKey ? [...new Set([...selected, unit])] : [unit];
      drag = null;
      paint();
      inspector();
    }
  });
  window.addEventListener("pointermove", (e) => {
    if (!drag || drag.kind === "palette") return;
    drag.end =
      drag.kind === "track"
        ? straightEnd(drag.start, point(e), deck.tracks, snapping && !e.altKey)
        : point(e);
    if (drag.kind === "units") {
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
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.kind === "palette") {
      const p = point(e);
      if (p.x >= 0 && p.x <= 1200 && p.y >= 0 && p.y <= 700) place(p);
      return;
    }
    const p = point(e);
    if (d.kind === "box") {
      const ids = selectedInBox(slide().units, d.start, p);
      selected = d.add ? [...new Set([...selected, ...ids])] : ids;
      paint();
      inspector();
      return;
    }
    if (distance(d.start, p) < 4) {
      paint();
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
              )
            : grid(p, e.altKey);
        const projected = snap(candidate, others);
        const end =
          snapping &&
          !e.altKey &&
          projected &&
          distance(projected.point, candidate) < 12
            ? projected.point
            : candidate;
        for (const t of deck.tracks)
          for (const side of ["a", "b"] as const)
            if (distance(t[side], old) < 0.1) t[side] = copy(end);
      });
      return;
    }
    if (d.kind === "annotation") {
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
      change(() =>
        deck.tracks.push({
          id: id(),
          a: d.start,
          b: straightEnd(d.start, p, deck.tracks, snapping && !e.altKey),
        }),
      );
      return;
    }
    if (d.kind === "arrow") {
      change(() =>
        annotations().push({
          id: id(),
          kind: "arrow",
          a: d.start,
          b: p,
          text: "",
        }),
      );
      return;
    }
    if (d.kind === "units") {
      const anchor = slide().units.find((u) => u.id === d.unit)!;
      const destination = snap(
        { x: anchor.x + p.x - d.start.x, y: anchor.y + p.y - d.start.y },
        deck.tracks,
      );
      if (!destination) {
        paint();
        return;
      }
      if (index === 1) {
        change(() => {
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
        const path = route(deck.tracks, before, destination.point);
        if (!path) {
          tell(
            "No connected path found. Check the track connections in Step 1.",
          );
          paint();
          return;
        }
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
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      cancel();
      tool = "select";
      selected = [];
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
}
