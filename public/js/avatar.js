/**
 * Saathi, a friendly orb mascot with a headset, drawn in SVG.
 * It breathes, blinks, glances around, follows the pointer, and moves its mouth
 * with the loudness and tone of the real voice audio.
 * States: idle, riding, listening, thinking, speaking, alert, happy.
 */

const NS = "http://www.w3.org/2000/svg";
const MOUTH = { cx: 120, cy: 160, minRx: 8, maxRx: 19, minRy: 1.5, maxRy: 12 };
const STATES = ["idle", "riding", "listening", "thinking", "speaking", "alert", "happy"];
const INK = "#2b2342";
const ACCENT = "#ff8fab";

function el(tag, attributes = {}, ...children) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  node.append(...children);
  return node;
}

const lerp = (from, to, amount) => from + (to - from) * amount;

/** Build the character. `uid` keeps gradient ids unique when two Saathis exist on one page. */
function buildCharacter(uid) {
  const id = (name) => `${name}-${uid}`;
  const defs = el("defs", {},
    el("radialGradient", { id: id("orb"), cx: "32%", cy: "28%", r: "85%" },
      el("stop", { offset: "0%", "stop-color": "#e9ddff" }), el("stop", { offset: "45%", "stop-color": "#9d85e6" }),
      el("stop", { offset: "100%", "stop-color": "#4a3791" })),
    el("linearGradient", { id: id("gloss"), x1: "0", y1: "0", x2: "0", y2: "1" },
      el("stop", { offset: "0%", "stop-color": "#ffffff", "stop-opacity": "0.55" }), el("stop", { offset: "100%", "stop-color": "#ffffff", "stop-opacity": "0" })),
    el("radialGradient", { id: id("iris"), cx: "40%", cy: "35%", r: "70%" },
      el("stop", { offset: "0%", "stop-color": "#7cc4ff" }), el("stop", { offset: "60%", "stop-color": "#2f6fd6" }), el("stop", { offset: "100%", "stop-color": "#1b2a6b" })),
    el("clipPath", { id: id("mouth") }, el("ellipse", { class: "mouth-clip", cx: MOUTH.cx, cy: MOUTH.cy, rx: MOUTH.minRx, ry: MOUTH.minRy })),
  );

  const eye = (cx) => el("g", { class: "eye" },
    el("ellipse", { cx, cy: 118, rx: 15, ry: 19, fill: "#fffdfb" }),
    el("g", { class: "pupil" },
      el("circle", { cx, cy: 120, r: 9, fill: `url(#${id("iris")})` }),
      el("circle", { cx, cy: 120, r: 4.3, fill: "#101433" }),
      el("circle", { cx: cx + 3.2, cy: 115.5, r: 2.6, fill: "#fff" }),
      el("circle", { cx: cx - 3, cy: 123, r: 1.2, fill: "#fff", opacity: 0.8 })),
    el("ellipse", { class: "lid", cx, cy: 118, rx: 16.5, ry: 20.5, fill: "#7d64cf" }),
  );

  const head = el("g", { class: "head" },
    el("ellipse", { cx: 120, cy: 214, rx: 54, ry: 9, fill: "#4a3791", opacity: 0.16 }),
    el("circle", { cx: 120, cy: 124, r: 86, fill: `url(#${id("orb")})` }),
    el("ellipse", { cx: 96, cy: 72, rx: 40, ry: 20, fill: `url(#${id("gloss")})`, transform: "rotate(-18 96 72)" }),
    el("ellipse", { class: "cheek", cx: 82, cy: 148, rx: 10, ry: 5.5, fill: ACCENT, opacity: 0.4 }),
    el("ellipse", { class: "cheek", cx: 158, cy: 148, rx: 10, ry: 5.5, fill: ACCENT, opacity: 0.4 }),
    el("path", { class: "brow brow--left", d: "M78 94 Q92 86 106 92", fill: "none", stroke: INK, "stroke-width": 4.5, "stroke-linecap": "round" }),
    el("path", { class: "brow brow--right", d: "M134 92 Q148 86 162 94", fill: "none", stroke: INK, "stroke-width": 4.5, "stroke-linecap": "round" }),
    eye(92), eye(148),
    el("g", { class: "mouth" },
      el("path", { class: "smile", d: "M104 158 Q120 172 136 158", fill: "none", stroke: INK, "stroke-width": 4.5, "stroke-linecap": "round" }),
      el("ellipse", { class: "mouth-open", cx: MOUTH.cx, cy: MOUTH.cy, rx: MOUTH.minRx, ry: MOUTH.minRy, fill: "#2a1a4d" }),
      el("rect", { class: "teeth", x: 102, y: 149, width: 36, height: 7, fill: "#fff", "clip-path": `url(#${id("mouth")})` }),
      el("ellipse", { cx: 120, cy: 171, rx: 11, ry: 6, fill: "#f06a8a", "clip-path": `url(#${id("mouth")})` })),
    // Headset: band, two ear cups, and a mic boom. It says "I take your calls".
    el("path", { d: "M50 118 Q54 44 120 42 Q186 44 190 118", fill: "none", stroke: INK, "stroke-width": 6, "stroke-linecap": "round" }),
    el("rect", { x: 38, y: 104, width: 20, height: 36, rx: 9, fill: INK }),
    el("rect", { x: 182, y: 104, width: 20, height: 36, rx: 9, fill: INK }),
    el("path", { d: "M56 138 Q58 176 100 178", fill: "none", stroke: INK, "stroke-width": 4.5, "stroke-linecap": "round" }),
    el("circle", { class: "mic", cx: 103, cy: 178, r: 5.5, fill: ACCENT }),
  );

  return el("svg", { viewBox: "0 0 240 240", class: "saathi", "aria-hidden": "true" }, defs, head);
}

/** Mount Saathi in `container`. Returns controls for state, audio, and lip sync. */
export function createAvatar(container) {
  const uid = Math.random().toString(36).slice(2, 8);
  const svg = buildCharacter(uid);
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
  let visible = true;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

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
    const calm = reduceMotion.matches;

    // Breathing and a slow sway keep the character alive even when nothing happens.
    // With reduced motion on, the head stays still and only the eyes and mouth move.
    const breathe = calm ? 1 : 1 + Math.sin(seconds * 1.6) * 0.012;
    const sway = calm ? 0 : state === "riding" ? Math.sin(seconds * 6) * 1.6 : Math.sin(seconds * 0.7) * 2;
    const tilt = state === "listening" ? -7 : state === "thinking" ? 5 : 0;
    const bob = calm ? 0 : speakingEnergy * -5;
    head.style.transform = `translate(${sway}px, ${bob}px) rotate(${tilt + sway * 0.5}deg) scale(${breathe})`;

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

    // Blinks: quick and random, a little more often when thinking.
    if (now > blink.next) {
      blink.until = now + 130;
      blink.next = now + (state === "thinking" ? 1200 : 2200) + Math.random() * 3500;
    }
    const closed = now < blink.until;
    const squint = state === "happy" ? 0.45 : state === "listening" ? -0.1 : 0;
    for (const lid of lids) lid.style.transform = `translateY(${closed ? 0 : -38 + squint * 16}px)`;

    // Mouth: driven by the voice when speaking, otherwise a closed smile.
    const target = mouthTargets();
    speakingEnergy = lerp(speakingEnergy, target.energy, 0.3);
    mouth.rx = lerp(mouth.rx, target.rx, 0.45);
    mouth.ry = lerp(mouth.ry, target.ry, 0.45);
    const open = state === "alert" ? { rx: 7, ry: 7 } : mouth;
    for (const node of [mouthOpen, mouthClip]) {
      node.setAttribute("rx", open.rx.toFixed(2));
      node.setAttribute("ry", open.ry.toFixed(2));
    }
    smile.style.opacity = open.ry > 3 ? "0" : "1";
  }
  // The animation loop runs only while the stage is on screen and the tab is visible.
  const start = () => { if (!frame) frame = requestAnimationFrame(animate); };
  const pause = () => { cancelAnimationFrame(frame); frame = 0; };
  const sync = () => { if (visible && !document.hidden) start(); else pause(); };
  const observer = new IntersectionObserver((entries) => { visible = entries.some((entry) => entry.isIntersecting); sync(); });
  observer.observe(container);
  document.addEventListener("visibilitychange", sync);
  start();

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
    destroy() {
      pause();
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
      svg.remove();
    },
  };
}
