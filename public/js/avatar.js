/**
 * Saathi, an animated character drawn in SVG.
 * It breathes, blinks, glances around, follows the pointer, and moves its mouth
 * with the loudness and tone of the real voice audio. States: idle, riding,
 * listening, thinking, speaking, alert, happy.
 */

const NS = "http://www.w3.org/2000/svg";
const MOUTH = { cx: 120, cy: 150, minRx: 9, maxRx: 20, minRy: 1.5, maxRy: 13 };
const STATES = ["idle", "riding", "listening", "thinking", "speaking", "alert", "happy"];

function el(tag, attributes = {}, ...children) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  node.append(...children);
  return node;
}

const lerp = (from, to, amount) => from + (to - from) * amount;

function buildCharacter() {
  const defs = el("defs", {},
    el("radialGradient", { id: "sk", cx: "40%", cy: "30%", r: "80%" },
      el("stop", { offset: "0%", "stop-color": "#f8d9c0" }), el("stop", { offset: "70%", "stop-color": "#e8b48f" }), el("stop", { offset: "100%", "stop-color": "#c98b64" })),
    el("linearGradient", { id: "hair", x1: "0", y1: "0", x2: "1", y2: "1" },
      el("stop", { offset: "0%", "stop-color": "#3a2a3f" }), el("stop", { offset: "100%", "stop-color": "#1c1420" })),
    el("linearGradient", { id: "jacket", x1: "0", y1: "0", x2: "0", y2: "1" },
      el("stop", { offset: "0%", "stop-color": "#7f67c0" }), el("stop", { offset: "100%", "stop-color": "#4f3d8a" })),
    el("radialGradient", { id: "iris", cx: "40%", cy: "35%", r: "70%" },
      el("stop", { offset: "0%", "stop-color": "#8f7ad1" }), el("stop", { offset: "60%", "stop-color": "#4a3791" }), el("stop", { offset: "100%", "stop-color": "#231a4d" })),
    el("clipPath", { id: "mouth-clip" }, el("ellipse", { class: "mouth-clip", cx: MOUTH.cx, cy: MOUTH.cy, rx: MOUTH.minRx, ry: MOUTH.minRy })),
  );

  const eye = (cx, side) => el("g", { class: `eye eye--${side}` },
    el("ellipse", { class: "sclera", cx, cy: 108, rx: 15, ry: 17, fill: "#fffdfb" }),
    el("g", { class: "pupil" },
      el("circle", { cx, cy: 110, r: 9.5, fill: "url(#iris)" }),
      el("circle", { cx, cy: 110, r: 4.6, fill: "#140d2a" }),
      el("circle", { cx: cx + 3.4, cy: 106, r: 2.6, fill: "#fff" }),
      el("circle", { cx: cx - 3, cy: 113.5, r: 1.2, fill: "#fff", opacity: 0.8 })),
    el("ellipse", { class: "lid", cx, cy: 108, rx: 16.5, ry: 18.5, fill: "url(#sk)" }),
    el("path", { class: "lash", d: `M${cx - 15} 100 Q${cx} 88 ${cx + 15} 100`, fill: "none", stroke: "#2a1b2e", "stroke-width": 2.4, "stroke-linecap": "round" }),
  );

  const head = el("g", { class: "head" },
    el("ellipse", { cx: 120, cy: 196, rx: 28, ry: 14, fill: "#c98b64" }),
    el("path", { d: "M72 118 Q66 60 120 50 Q174 60 168 118 Q170 175 120 184 Q70 175 72 118 Z", fill: "url(#sk)" }),
    el("path", { d: "M64 108 Q62 40 120 36 Q178 40 176 108 Q170 82 150 74 Q138 96 118 84 Q100 98 88 76 Q72 84 64 108 Z", fill: "url(#hair)" }),
    el("path", { d: "M84 62 Q100 48 128 50 Q110 56 94 70 Z", fill: "#5b4567", opacity: 0.6 }),
    el("ellipse", { class: "cheek", cx: 90, cy: 136, rx: 10, ry: 6, fill: "#f29aa6", opacity: 0.45 }),
    el("ellipse", { class: "cheek", cx: 150, cy: 136, rx: 10, ry: 6, fill: "#f29aa6", opacity: 0.45 }),
    el("path", { class: "brow brow--left", d: "M80 92 Q94 84 108 90", fill: "none", stroke: "#2a1b2e", "stroke-width": 4.5, "stroke-linecap": "round" }),
    el("path", { class: "brow brow--right", d: "M132 90 Q146 84 160 92", fill: "none", stroke: "#2a1b2e", "stroke-width": 4.5, "stroke-linecap": "round" }),
    eye(96, "left"), eye(144, "right"),
    el("path", { d: "M118 126 Q114 136 121 137", fill: "none", stroke: "#c98b64", "stroke-width": 2.2, "stroke-linecap": "round" }),
    el("g", { class: "mouth" },
      el("path", { class: "smile", d: "M104 150 Q120 164 136 150", fill: "none", stroke: "#8a3a4a", "stroke-width": 4, "stroke-linecap": "round" }),
      el("ellipse", { class: "mouth-open", cx: MOUTH.cx, cy: MOUTH.cy, rx: MOUTH.minRx, ry: MOUTH.minRy, fill: "#4a1d2b" }),
      el("rect", { class: "teeth", x: 102, y: 139, width: 36, height: 7, fill: "#fff", "clip-path": "url(#mouth-clip)" }),
      el("ellipse", { class: "tongue", cx: 120, cy: 162, rx: 12, ry: 7, fill: "#d4606f", "clip-path": "url(#mouth-clip)" })),
    // Headset: band, ear cup, and mic boom. It says "I take your calls".
    el("path", { d: "M62 112 Q60 60 120 54 Q180 60 178 112", fill: "none", stroke: "#2b2140", "stroke-width": 5, "stroke-linecap": "round", opacity: 0.9 }),
    el("rect", { x: 56, y: 104, width: 16, height: 28, rx: 7, fill: "#2b2140" }),
    el("rect", { x: 168, y: 104, width: 16, height: 28, rx: 7, fill: "#2b2140" }),
    el("path", { class: "boom", d: "M72 128 Q70 160 104 166", fill: "none", stroke: "#2b2140", "stroke-width": 4, "stroke-linecap": "round" }),
    el("circle", { class: "mic", cx: 106, cy: 167, r: 5, fill: "#6750a4" }),
  );

  const body = el("g", { class: "body" },
    el("path", { d: "M48 240 Q52 196 92 188 L120 204 L148 188 Q188 196 192 240 Z", fill: "url(#jacket)" }),
    el("path", { d: "M92 188 L120 204 L148 188 L140 182 L120 194 L100 182 Z", fill: "#eaddff" }),
    el("circle", { cx: 120, cy: 222, r: 4, fill: "#eaddff", opacity: 0.8 }),
  );

  return el("svg", { viewBox: "0 0 240 240", class: "saathi", "aria-hidden": "true" }, defs, body, head);
}

/** Mount Saathi in `container`. Returns controls for state, audio, and lip sync. */
export function createAvatar(container) {
  const svg = buildCharacter();
  container.replaceChildren(svg);
  const head = svg.querySelector(".head");
  const pupils = [...svg.querySelectorAll(".pupil")];
  const lids = [...svg.querySelectorAll(".lid")];
  const mouthOpen = svg.querySelector(".mouth-open");
  const mouthClip = svg.querySelector(".mouth-clip");
  const smile = svg.querySelector(".smile");

  let state = "idle";
  let resting = "idle";
  let analyser = null;
  let frequencies = null;
  let mouth = { rx: MOUTH.minRx, ry: MOUTH.minRy };
  let look = { x: 0, y: 0, targetX: 0, targetY: 0 };
  let pointer = null;
  let blink = { until: 0, next: performance.now() + 2500 };
  let glanceAt = performance.now() + 2000;
  let speakingEnergy = 0;
  let frame = 0;

  const setState = (next) => {
    state = STATES.includes(next) ? next : "idle";
    container.dataset.state = state;
  };

  container.addEventListener("pointermove", (event) => {
    const box = container.getBoundingClientRect();
    pointer = { x: ((event.clientX - box.left) / box.width - 0.5) * 2, y: ((event.clientY - box.top) / box.height - 0.5) * 2 };
  });
  container.addEventListener("pointerleave", () => { pointer = null; });

  /** Read the analyser and turn loudness and tone into mouth shape targets. */
  function mouthTargets() {
    if (!analyser || state !== "speaking") return { rx: MOUTH.minRx, ry: MOUTH.minRy, energy: 0 };
    analyser.getByteFrequencyData(frequencies);
    const bandEnergy = (from, to) => {
      let sum = 0;
      for (let i = from; i < to; i++) sum += frequencies[i];
      return sum / Math.max(1, to - from) / 255;
    };
    const binsPerKhz = frequencies.length / (analyser.context.sampleRate / 2000);
    const low = bandEnergy(1, Math.round(binsPerKhz));
    const mid = bandEnergy(Math.round(binsPerKhz), Math.round(binsPerKhz * 3));
    const high = bandEnergy(Math.round(binsPerKhz * 3), Math.round(binsPerKhz * 8));
    const energy = Math.min(1, (low * 0.6 + mid * 0.9 + high * 1.2) * 2.2);
    const wide = Math.min(1, high / Math.max(0.05, low + mid));
    return {
      rx: lerp(MOUTH.minRx, MOUTH.maxRx, 0.4 * energy + 0.6 * energy * wide),
      ry: lerp(MOUTH.minRy, MOUTH.maxRy, energy * (1 - 0.35 * wide)),
      energy,
    };
  }

  function animate(now) {
    frame = requestAnimationFrame(animate);
    const seconds = now / 1000;

    // Breathing and a slow idle sway keep the character alive even when nothing happens.
    const breathe = Math.sin(seconds * 1.6) * 1.2;
    const sway = state === "riding" ? Math.sin(seconds * 6) * 1.4 : Math.sin(seconds * 0.7) * 1.6;
    const tilt = state === "listening" ? -6 : state === "thinking" ? 4 : 0;
    const bob = speakingEnergy * -4;
    head.style.transform = `translate(${sway}px, ${breathe + bob}px) rotate(${tilt + sway * 0.4}deg)`;

    // Eyes: follow the pointer, otherwise glance somewhere new every few seconds.
    if (pointer) {
      look.targetX = pointer.x * 0.8;
      look.targetY = pointer.y * 0.6;
    } else if (now > glanceAt) {
      glanceAt = now + 1800 + Math.random() * 3000;
      look.targetX = (Math.random() - 0.5) * 1.2;
      look.targetY = (Math.random() - 0.5) * 0.8;
    }
    if (state === "thinking") { look.targetX = 0.7; look.targetY = -0.8; }
    if (state === "listening") { look.targetX = 0; look.targetY = 0; }
    look.x = lerp(look.x, look.targetX, 0.08);
    look.y = lerp(look.y, look.targetY, 0.08);
    for (const pupil of pupils) pupil.style.transform = `translate(${look.x * 5}px, ${look.y * 4}px)`;

    // Blinks: quick, random, and a little more often when thinking.
    if (now > blink.next) {
      blink.until = now + 130;
      blink.next = now + (state === "thinking" ? 1200 : 2200) + Math.random() * 3500;
    }
    const closed = now < blink.until;
    const squint = state === "happy" ? 0.45 : state === "listening" ? -0.1 : 0;
    for (const lid of lids) lid.style.transform = `translateY(${closed ? 0 : -34 + squint * 14}px)`;

    // Mouth: driven by the voice when speaking, otherwise closed with a smile.
    const target = mouthTargets();
    speakingEnergy = lerp(speakingEnergy, target.energy, 0.3);
    mouth.rx = lerp(mouth.rx, target.rx, 0.45);
    mouth.ry = lerp(mouth.ry, target.ry, 0.45);
    const open = state === "alert" ? { rx: 8, ry: 7 } : mouth;
    for (const node of [mouthOpen, mouthClip]) {
      node.setAttribute("rx", open.rx.toFixed(2));
      node.setAttribute("ry", open.ry.toFixed(2));
    }
    smile.style.opacity = open.ry > 3 ? "0" : "1";
  }
  frame = requestAnimationFrame(animate);

  return {
    setState,
    /** The state Saathi returns to after speaking. */
    setResting(next) { resting = next; if (state !== "speaking") setState(next); },
    rest: () => setState(resting),
    /** Connect an AnalyserNode so the mouth follows the audio that flows through it. */
    attachAnalyser(node) {
      analyser = node;
      frequencies = new Uint8Array(node.frequencyBinCount);
    },
    destroy() { cancelAnimationFrame(frame); },
  };
}
