import {
  type Deck,
  drawingBounds,
  type Unit,
  type Point,
  animatedUnits,
  pauseSeconds,
  movementMs,
} from "./model";
export const escape = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export const points = (ps: Point[]): string =>
  ps.map((p) => `${p.x},${p.y}`).join(" ");
export function scene(
  deck: Deck,
  index: number,
  units?: Unit[],
  selected: string[] = [],
  ghost = false,
  page = drawingBounds(deck),
): string {
  const slide = deck.slides[index]!;
  const equipment = (us: Unit[], cls = ""): string =>
    us
      .map(
        (u) =>
          `<g class="equipment ${cls} ${selected.includes(u.id) ? "chosen" : ""}" data-unit="${escape(u.id)}" transform="translate(${u.x} ${u.y}) rotate(${u.angle + (u.flipped ? 180 : 0)})"><rect x="-19" y="-10" width="38" height="20" rx="3" fill="${u.kind === "loco" ? "#e8432f" : u.kind === "loaded" ? "#e0ad4b" : "#15181c"}" stroke="${selected.includes(u.id) ? "#fff" : "#d9c48c"}" stroke-width="${selected.includes(u.id) ? 3 : 1.5}"/><path d="M-13 12h6m14 0h6" stroke="#8a9199" stroke-width="4"/>${u.kind === "loco" ? '<path d="M5 -8L16 0L5 8Z" fill="#f2efe6"/>' : `<text text-anchor="middle" y="4" fill="${u.kind === "loaded" ? "#15181c" : "#f2efe6"}" font-size="12">${u.kind === "loaded" ? "L" : "E"}</text>`}</g>`,
      )
      .join("");
  const annotations = [...deck.labels, ...slide.annotations]
    .map((a) =>
      a.kind === "text"
        ? `<text data-annotation="${escape(a.id)}" x="${a.a.x}" y="${a.a.y}" fill="#f2efe6" font-size="17">${escape(a.text)}</text>`
        : a.kind === "end"
          ? `<path data-annotation="${escape(a.id)}" d="M${a.a.x - 9} ${a.a.y - 15}v30m-5-30h10m-10 30h10" stroke="#d9c48c" stroke-width="3"/>`
          : `<path data-annotation="${escape(a.id)}" d="M${a.a.x} ${a.a.y}L${a.b.x} ${a.b.y}" stroke="#d9c48c" stroke-width="2" marker-end="url(#arrow)"/>`,
    )
    .join("");
  return `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10" fill="#d9c48c"/></marker><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".7" fill="#30343a"/></pattern></defs><rect data-background="true" x="${page.x}" y="${page.y}" width="${page.width}" height="${page.height}" fill="#0e1013"/><rect data-background="true" x="${page.x}" y="${page.y}" width="${page.width}" height="${page.height}" fill="url(#grid)"/>${deck.tracks.map((t) => `<line data-track="${escape(t.id)}" x1="${t.a.x}" y1="${t.a.y}" x2="${t.b.x}" y2="${t.b.y}" stroke="#69737d" stroke-width="5" stroke-linecap="round"/>`).join("")}${annotations}${
    ghost && index > 1
      ? equipment(
          deck.slides[index - 1]!.units.filter((u) =>
            slide.motion?.ids.includes(u.id),
          ),
          "ghost",
        )
      : ""
  }${slide.motion ? `<polyline class="motion-path" points="${points(slide.motion.path)}" fill="none" stroke="#d9c48c" stroke-width="2" stroke-dasharray="7 6" marker-end="url(#arrow)"/>` : ""}${equipment(units ?? slide.units)}`;
}
export function standalone(deck: Deck): string {
  const page = drawingBounds(deck);
  const slides = deck.slides.map((s, i) => ({
    title: s.title,
    text: s.text,
    hold: pauseSeconds(s) * 1000,
    movement: movementMs(s, i),
    markup: scene(deck, i, undefined, [], false, page),
    frames:
      s.motion && i > 1
        ? Array.from({ length: 61 }, (_, n) =>
            animatedUnits(deck.slides[i - 1]!.units, s.motion!, n / 60).map(
              (u) => ({
                id: u.id,
                x: u.x,
                y: u.y,
                angle: u.angle + (u.flipped ? 180 : 0),
              }),
            ),
          )
        : null,
  }));
  const js = `const slides=${JSON.stringify(slides).replace(/</g, "\\u003c")};let index=0,token=0,auto=false;const canvas=document.querySelector('svg'),caption=document.querySelector('#caption'),play=document.querySelector('#autoplay');function show(i){index=Math.max(0,Math.min(slides.length-1,i));const s=slides[index],run=++token;caption.textContent=(index+1)+' / '+slides.length+' — '+s.title+' — '+s.text;document.querySelector('#previous').disabled=index===0;document.querySelector('#next').disabled=index===slides.length-1;play.textContent=auto?'Stop autoplay':'Autoplay';canvas.innerHTML=s.markup;const units=new Map([...canvas.querySelectorAll('[data-unit]')].map(el=>[el.dataset.unit,el]));const start=performance.now();function frame(now){if(run!==token)return;const elapsed=now-start,t=s.movement?Math.min(1,elapsed/s.movement):1,ease=t*t*(3-2*t);if(s.frames)for(const u of s.frames[Math.round(ease*60)])units.get(u.id)?.setAttribute('transform','translate('+u.x+' '+u.y+') rotate('+u.angle+')');if(auto&&elapsed>=s.movement+s.hold){if(index<slides.length-1)show(index+1);else{auto=false;play.textContent='Autoplay';}return;}if(t<1||auto)requestAnimationFrame(frame);}requestAnimationFrame(frame);}document.querySelector('#previous').onclick=()=>{auto=false;show(index-1);};document.querySelector('#next').onclick=()=>{auto=false;show(index+1);};document.querySelector('#replay').onclick=()=>{auto=false;show(index);};play.onclick=()=>{if(auto){auto=false;++token;play.textContent='Autoplay';}else{auto=true;show(0);}};show(0);`;

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(deck.title)}</title><style>body{background:#0e1013;color:#f2efe6;font:16px system-ui;margin:24px}svg{width:100%;max-height:75vh}.ghost{opacity:.2}button{padding:12px;margin-right:8px}#caption{white-space:pre-wrap}</style></head><body><h1>${escape(deck.title)}</h1><svg viewBox="${page.x} ${page.y} ${page.width} ${page.height}"></svg><p id="caption"></p><button id="autoplay">Autoplay</button><button id="previous">Previous</button><button id="replay">Replay</button><button id="next">Next</button><script>${js}</script></body></html>`;
}
