// @ts-check
// Embedded verbatim in exported HTML. Keep this dependency-free: exported plans
// must work offline, without module loading or serializing minified functions.
(() => {
  /** @typedef {{id: string, x: number, y: number, angle: number}} FrameUnit */
  /** @typedef {{title: string, text: string, hold: number, movement: number, markup: string, frames: FrameUnit[][] | null}} PlaybackSlide */
  /** @param {string} id */
  function element(id) {
    const result = document.getElementById(id);
    if (!result) throw new Error(`Missing presentation element: ${id}`);
    return result;
  }
  /** @type {PlaybackSlide[]} */
  const slides = JSON.parse(element("plan-data").textContent ?? "[]");
  const foundCanvas = document.querySelector("svg");
  if (!foundCanvas) throw new Error("Missing presentation canvas");
  const canvas = foundCanvas;
  const caption = element("caption");
  const play = element("autoplay");
  const previous = /** @type {HTMLButtonElement} */ (element("previous"));
  const next = /** @type {HTMLButtonElement} */ (element("next"));
  let index = 0;
  let token = 0;
  let auto = false;

  /** @param {number} requested */
  function show(requested) {
    index = Math.max(0, Math.min(slides.length - 1, requested));
    const foundSlide = slides[index];
    if (!foundSlide) return;
    const slide = foundSlide;
    const run = ++token;
    caption.textContent = `${index + 1} / ${slides.length} — ${slide.title} — ${slide.text}`;
    previous.disabled = index === 0;
    next.disabled = index === slides.length - 1;
    play.textContent = auto ? "Stop autoplay" : "Autoplay";
    // Markup comes only from the escaped scene renderer, never imported HTML.
    canvas.innerHTML = slide.markup;
    const units = new Map(
      [...canvas.querySelectorAll("[data-unit]")].map((el) => [
        el.getAttribute("data-unit"),
        el,
      ]),
    );
    const start = performance.now();
    /** @param {number} now */
    function frame(now) {
      if (run !== token) return;
      const elapsed = now - start;
      const progress = slide.movement
        ? Math.min(1, elapsed / slide.movement)
        : 1;
      const eased = progress * progress * (3 - 2 * progress);
      if (slide.frames) {
        for (const unit of slide.frames[Math.round(eased * 60)] ?? []) {
          units
            .get(unit.id)
            ?.setAttribute(
              "transform",
              `translate(${unit.x} ${unit.y}) rotate(${unit.angle})`,
            );
        }
      }
      if (auto && elapsed >= slide.movement + slide.hold) {
        if (index < slides.length - 1) show(index + 1);
        else {
          auto = false;
          play.textContent = "Autoplay";
        }
        return;
      }
      if (progress < 1 || auto) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  previous.onclick = () => {
    auto = false;
    show(index - 1);
  };
  next.onclick = () => {
    auto = false;
    show(index + 1);
  };
  element("replay").onclick = () => {
    auto = false;
    show(index);
  };
  play.onclick = () => {
    if (auto) {
      auto = false;
      ++token;
      play.textContent = "Autoplay";
    } else {
      auto = true;
      show(0);
    }
  };
  show(0);
})();
