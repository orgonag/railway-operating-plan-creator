import { NOTICE_LINES, TOOL_CREDIT, FULL_NOTICE, exportedPlan } from "./notice";
import {
  type Deck,
  animatedUnits,
  frameAt,
  totalMs,
  drawingBounds,
} from "./model";
import { escape, scene, standalone } from "./render";

export function wrap(text: string, width = 90): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      if (line.length + word.length + 1 > width && line) {
        lines.push(line);
        line = "";
      }
      for (let offset = 0; offset < word.length; offset += width) {
        const part = word.slice(offset, offset + width);
        if (offset > 0) {
          lines.push(line);
          line = "";
        }
        line += (line ? " " : "") + part;
      }
    }
    lines.push(line);
  }
  return lines;
}
/** One reusable slide image, including every line of authored instructions. */
export function slideSvg(
  deck: Deck,
  index: number,
  progress = 1,
  includeText = true,
  frame = drawingBounds(deck, true),
): { svg: string; height: number } {
  const s = deck.slides[index]!,
    lines = wrap(s.text),
    titles = wrap(`${index + 1}. ${s.title}`, 65),
    head = includeText ? 35 + titles.length * 32 : 0;
  const diagramHeight = (1200 * frame.height) / frame.width;
  const height = includeText
    ? head + diagramHeight + 30 + lines.length * 25 + 44
    : diagramHeight;
  const units =
    s.motion && index > 1
      ? animatedUnits(deck.slides[index - 1]!.units, s.motion, progress)
      : s.units;
  return {
    height,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${height}" viewBox="0 0 1200 ${height}"><rect width="1200" height="${height}" fill="#0e1013"/>${includeText ? titles.map((l, i) => `<text x="24" y="${35 + i * 32}" fill="#d9c48c" font-family="sans-serif" font-size="26">${escape(l)}</text>`).join("") : ""}<svg y="${head}" width="1200" height="${diagramHeight}" viewBox="${frame.x} ${frame.y} ${frame.width} ${frame.height}">${scene(deck, index, units, [], false, frame)}</svg>${includeText ? lines.map((l, i) => `<text x="24" y="${head + diagramHeight + 30 + i * 25}" fill="#f2efe6" font-family="sans-serif" font-size="20">${escape(l)}</text>`).join("") : ""}${includeText ? NOTICE_LINES.map((line, i) => `<text x="24" y="${height - 24 + i * 16}" fill="#aeb5bd" font-family="sans-serif" font-size="12">${escape(line)}</text>`).join("") : ""}</svg>`,
  };
}
export function saveBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
async function loadSvg(svg: string): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () =>
        reject(new Error("Could not render the slide image."));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
async function raster(
  deck: Deck,
  index: number,
  includeText = true,
  frame = drawingBounds(deck, true),
): Promise<HTMLCanvasElement> {
  const { svg, height } = slideSvg(deck, index, 1, includeText, frame);
  const img = await loadSvg(svg),
    canvas = document.createElement("canvas");
  canvas.width = Math.max(
    1,
    Math.floor(
      Math.min(4800, Math.max(1200, frame.width), (4800 * 1200) / height),
    ),
  );
  canvas.height = Math.max(1, Math.ceil((height * canvas.width) / 1200));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas rendering is unavailable.");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}
async function png(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("PNG export failed."))),
      "image/png",
    ),
  );
}
export function videoType(): { mime: string; extension: string } | undefined {
  if (
    typeof MediaRecorder === "undefined" ||
    typeof HTMLCanvasElement.prototype.captureStream !== "function"
  )
    return;
  for (const mime of [
    "video/mp4;codecs=avc1.42001E",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ])
    if (MediaRecorder.isTypeSupported(mime))
      return { mime, extension: mime.startsWith("video/mp4") ? "mp4" : "webm" };
}
async function recordVideo(
  deck: Deck,
  signal: AbortSignal,
  report: (s: string) => void,
): Promise<void> {
  const type = videoType();
  if (!type)
    throw new Error(
      "Video export is unavailable in this browser. Use animated HTML instead.",
    );
  const frame = drawingBounds(deck);
  const duration = totalMs(deck);
  if (duration <= 0)
    throw new Error(
      "Set a pause on at least one step before exporting a still plan as video.",
    );
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 900;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas rendering is unavailable.");
  const ctx = context;
  const stream = canvas.captureStream(30);
  try {
    const recorder = new MediaRecorder(stream, {
        mimeType: type.mime,
        videoBitsPerSecond: 5000000,
      }),
      chunks: Blob[] = [];
    let failure: Error | undefined;
    const done = new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recorder.onerror = () => {
        failure = new Error(
          "The browser could not encode the video. Try animated HTML.",
        );
      };
      recorder.onstop = () => {
        if (failure) reject(failure);
        else resolve(new Blob(chunks, { type: type.mime }));
      };
    });
    // Attach a rejection handler immediately while the recording loop is running.
    void done.catch(() => undefined);
    async function draw(elapsed: number): Promise<void> {
      const f = frameAt(deck, elapsed),
        { svg, height } = slideSvg(deck, f.index, f.progress, true, frame),
        img = await loadSvg(svg);
      const ratio = Math.min(1200 / 1200, 900 / height);
      ctx.fillStyle = "#0e1013";
      ctx.fillRect(0, 0, 1200, 900);
      ctx.drawImage(
        img,
        (1200 - 1200 * ratio) / 2,
        (900 - height * ratio) / 2,
        1200 * ratio,
        height * ratio,
      );
    }
    try {
      await draw(0);
      if (signal.aborted) throw new Error("Export cancelled.");
      recorder.start();
      const started = performance.now();
      while (true) {
        if (signal.aborted) throw new Error("Export cancelled.");
        if (document.hidden)
          throw new Error(
            "Video export stopped because the tab was hidden. Keep this tab visible while exporting.",
          );
        if (failure) throw failure;
        const elapsed = performance.now() - started;
        await draw(Math.min(elapsed, duration));
        report(
          `Recording ${Math.min(100, Math.round((elapsed / duration) * 100))}% — keep this tab visible.`,
        );
        if (elapsed >= duration) break;
        await new Promise((r) => setTimeout(r, 25));
      }
      recorder.stop();
      const blob = await done;
      if (!blob.size) throw new Error("The browser produced an empty video.");
      if (!signal.aborted) saveBlob(`operating-plan.${type.extension}`, blob);
    } catch (error) {
      if (recorder.state !== "inactive") {
        failure = error as Error;
        recorder.stop();
      }
      throw error;
    }
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}
export function openExports(
  deck: Deck,
  index: number,
  root: HTMLElement,
): void {
  const dialog = document.createElement("dialog");
  dialog.className = "export-dialog";
  dialog.setAttribute("aria-label", "Export operating plan");
  const title = document.createElement("h2");
  title.textContent = "Export your operating plan";
  const intro = document.createElement("p");
  intro.textContent = `${deck.slides.length} steps · ${(totalMs(deck) / 1000).toFixed(1)} seconds with pauses. Everything is generated on this device.`;
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  const grid = document.createElement("div");
  grid.className = "export-choices";
  dialog.append(title, intro, grid, status);
  const controller = new AbortController();
  let busy = false;
  let staticFrame: ReturnType<typeof drawingBounds> | undefined;
  const frame = () => (staticFrame ??= drawingBounds(deck, true));
  function download(name: string, blob: Blob): void {
    if (!controller.signal.aborted) saveBlob(name, blob);
  }
  const close = document.createElement("button");
  close.textContent = "Close";
  close.onclick = () => {
    controller.abort();
    dialog.close();
    dialog.remove();
  };
  dialog.addEventListener("cancel", () => controller.abort());
  dialog.addEventListener("close", () => dialog.remove());
  function option(
    label: string,
    description: string,
    fn: () => Promise<void> | void,
    disabled = false,
  ): void {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    const small = document.createElement("small");
    small.textContent = description;
    b.append(small);
    b.disabled = disabled;
    grid.append(b);
    b.onclick = async () => {
      if (busy) return;
      busy = true;
      for (const el of grid.querySelectorAll("button")) el.disabled = true;
      status.textContent = "Preparing export…";
      close.textContent = "Cancel export";
      try {
        await fn();
        if (!controller.signal.aborted)
          status.textContent = "Export ready. Check your downloads.";
      } catch (e) {
        status.textContent = (e as Error).message;
      } finally {
        busy = false;
        for (const el of grid.querySelectorAll("button"))
          el.disabled = el.dataset.unavailable === "true";
        close.textContent = "Close";
      }
    };
    if (disabled) b.dataset.unavailable = "true";
  }
  option("Editable plan (JSON)", "Reopen and continue editing.", () =>
    download(
      "operating-plan.slides.json",
      new Blob([exportedPlan(deck)], { type: "application/json" }),
    ),
  );
  option(
    "Animated HTML",
    "Offline presentation with manual controls and autoplay.",
    () =>
      download(
        "operating-plan.html",
        new Blob([standalone(deck)], { type: "text/html" }),
      ),
  );
  option(
    "PDF — all steps",
    "One numbered step per page, including instructions.",
    async () => {
      const { jsPDF } = await import("jspdf");
      let pdf: InstanceType<typeof jsPDF> | undefined;
      for (let i = 0; i < deck.slides.length; i++) {
        if (controller.signal.aborted) return;
        const canvas = await raster(deck, i, true, frame());
        const imageHeight = (canvas.height * 1200) / canvas.width;
        const pdfScale = Math.min(1, 10000 / imageHeight);
        const dimensions: [number, number] = [
          1200 * pdfScale,
          imageHeight * pdfScale,
        ];
        if (!pdf)
          pdf = new jsPDF({
            unit: "px",
            format: dimensions,
            orientation: imageHeight > 1200 ? "portrait" : "landscape",
            hotfixes: ["px_scaling"],
            compress: true,
          });
        else
          pdf.addPage(
            dimensions,
            imageHeight > 1200 ? "portrait" : "landscape",
          );
        pdf.addImage(
          canvas.toDataURL("image/png"),
          "PNG",
          0,
          0,
          dimensions[0],
          dimensions[1],
          undefined,
          "FAST",
        );
      }
      download("operating-plan.pdf", pdf!.output("blob"));
    },
  );
  option(
    "PowerPoint (PPTX)",
    "Static diagrams with editable titles and instructions.",
    async () => {
      const { default: PptxGenJS } = await import("pptxgenjs");
      const pptx = new PptxGenJS();
      pptx.layout = "LAYOUT_WIDE";
      pptx.title = deck.title;
      pptx.author = "Railway Operating Plan Creator — tool by Orgo Nag";
      for (let i = 0; i < deck.slides.length; i++) {
        if (controller.signal.aborted) return;
        const s = deck.slides[i]!,
          out = pptx.addSlide();
        out.background = { color: "0E1013" };
        out.addText(`${i + 1}. ${s.title}`, {
          x: 0.3,
          y: 0.15,
          w: 12.7,
          h: 0.5,
          fontSize: 22,
          color: "D9C48C",
          fit: "shrink",
        });
        const diagram = await raster(deck, i, false, frame());
        const scale = Math.min(12.7 / diagram.width, 5.2 / diagram.height);
        const w = diagram.width * scale,
          h = diagram.height * scale;
        out.addImage({
          data: diagram.toDataURL("image/png"),
          x: (13.333 - w) / 2,
          y: 0.8 + (5.2 - h) / 2,
          w,
          h,
        });
        out.addText(s.text, {
          x: 0.3,
          y: 6.1,
          w: 12.7,
          h: 0.95,
          fontSize: 16,
          color: "F2EFE6",
          fit: "shrink",
          breakLine: false,
        });
        out.addText(NOTICE_LINES.join("\n"), {
          x: 0.3,
          y: 7.15,
          w: 12.7,
          h: 0.28,
          fontSize: 7,
          color: "AEB5BD",
          margin: 0,
          fit: "shrink",
        });
        out.addNotes(`${s.text}\n\n${TOOL_CREDIT}\n${FULL_NOTICE}`);
      }
      const blob = await pptx.write({ outputType: "blob" });
      download("operating-plan.pptx", blob as Blob);
    },
  );
  option("PNG — current step", "Image with title and instructions.", async () =>
    download(
      `step-${index + 1}.png`,
      await png(await raster(deck, index, true, frame())),
    ),
  );
  option(
    "SVG — current step",
    "Scalable diagram with title and instructions.",
    () =>
      download(
        `step-${index + 1}.svg`,
        new Blob([slideSvg(deck, index, 1, true, frame()).svg], {
          type: "image/svg+xml",
        }),
      ),
  );
  for (const format of ["PNG", "SVG"] as const)
    option(
      `${format} — all steps (ZIP)`,
      "A separate numbered image for every step.",
      async () => {
        const { zipSync, strToU8 } = await import("fflate"),
          files: Record<string, Uint8Array> = {};
        for (let i = 0; i < deck.slides.length; i++) {
          if (controller.signal.aborted) return;
          files[
            `step-${String(i + 1).padStart(3, "0")}.${format.toLowerCase()}`
          ] =
            format === "SVG"
              ? strToU8(slideSvg(deck, i, 1, true, frame()).svg)
              : new Uint8Array(
                  await (
                    await png(await raster(deck, i, true, frame()))
                  ).arrayBuffer(),
                );
        }
        download(
          `operating-plan-${format.toLowerCase()}.zip`,
          new Blob([zipSync(files)], { type: "application/zip" }),
        );
      },
    );
  const video = videoType();
  option(
    video ? `Video (${video.extension.toUpperCase()})` : "Video unavailable",
    `Takes about ${Math.ceil(totalMs(deck) / 1000)} seconds. Keep this tab visible. For a quick animated export, choose HTML.`,
    () =>
      recordVideo(deck, controller.signal, (text) => {
        status.textContent = text;
      }),
    !video,
  );
  dialog.append(close);
  root.append(dialog);
  dialog.showModal();
}
