/**
 * Saathi's animated face. States: idle, riding, listening, thinking, speaking, alert.
 * While speaking, the mouth opens with the loudness of the real audio (Web Audio analyser).
 */

const SVG_NS = "http://www.w3.org/2000/svg";
const MOUTH = { x: 78, width: 44, baseY: 128, closed: 4, open: 26 };

function svg(tag, attributes = {}, ...children) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  element.append(...children);
  return element;
}

function buildFace() {
  const gradient = svg("radialGradient", { id: "face-fill", cx: "40%", cy: "35%", r: "75%" },
    svg("stop", { offset: "0%", "stop-color": "#eaddff" }),
    svg("stop", { offset: "60%", "stop-color": "#b69df8" }),
    svg("stop", { offset: "100%", "stop-color": "#6750a4" }));
  const eye = (cx) => svg("g", { class: "avatar__eye" },
    svg("ellipse", { cx, cy: 92, rx: 13, ry: 15, fill: "#fffbfe" }),
    svg("circle", { class: "avatar__pupil", cx, cy: 94, r: 7, fill: "#21005d" }),
    svg("circle", { cx: cx + 3, cy: 90, r: 2.5, fill: "#fffbfe" }));
  const mouth = svg("rect", { class: "avatar__mouth", x: MOUTH.x, y: MOUTH.baseY, width: MOUTH.width, height: MOUTH.closed, rx: 6, fill: "#31111d" });

  return svg("svg", { viewBox: "0 0 200 200", class: "avatar__face", "aria-hidden": "true" },
    svg("defs", {}, gradient),
    svg("circle", { cx: 100, cy: 100, r: 78, fill: "url(#face-fill)" }),
    svg("path", { class: "avatar__visor", d: "M40 78 Q100 40 160 78", fill: "none", stroke: "#fffbfe", "stroke-width": 3, "stroke-linecap": "round", opacity: 0.55 }),
    svg("path", { class: "avatar__brow", d: "M58 70 Q72 63 86 70", fill: "none", stroke: "#21005d", "stroke-width": 4, "stroke-linecap": "round" }),
    svg("path", { class: "avatar__brow", d: "M114 70 Q128 63 142 70", fill: "none", stroke: "#21005d", "stroke-width": 4, "stroke-linecap": "round" }),
    eye(72), eye(128),
    svg("path", { class: "avatar__smile", d: "M82 124 Q100 140 118 124", fill: "none", stroke: "#31111d", "stroke-width": 5, "stroke-linecap": "round" }),
    svg("ellipse", { cx: 56, cy: 118, rx: 9, ry: 5, fill: "#ffd8e4", opacity: 0.7 }),
    svg("ellipse", { cx: 144, cy: 118, rx: 9, ry: 5, fill: "#ffd8e4", opacity: 0.7 }),
    mouth);
}

/** Mount the face in `container` and return controls. */
export function createAvatar(container) {
  const face = buildFace();
  container.replaceChildren(face);
  const mouth = face.querySelector(".avatar__mouth");
  let audioContext = null;
  let current = null;
  let frame = 0;
  let mouthTimer = 0;
  let restingState = "idle";

  const setMouth = (openness) => {
    const height = MOUTH.closed + (MOUTH.open - MOUTH.closed) * Math.min(1, openness);
    mouth.setAttribute("height", height.toFixed(1));
    mouth.setAttribute("y", (MOUTH.baseY - height / 2 + MOUTH.closed / 2).toFixed(1));
  };

  const setState = (state) => { container.dataset.state = state; };

  function stop() {
    cancelAnimationFrame(frame);
    clearInterval(mouthTimer);
    current?.pause();
    current = null;
    window.speechSynthesis?.cancel();
    setMouth(0);
    setState(restingState);
  }

  /** Play an audio URL and move the mouth with its loudness. Resolves when it ends. */
  async function playAudio(url) {
    stop();
    audioContext ??= new AudioContext();
    await audioContext.resume();
    const audio = new Audio(url);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    audioContext.createMediaElementSource(audio).connect(analyser);
    analyser.connect(audioContext.destination);
    const samples = new Uint8Array(analyser.fftSize);
    current = audio;
    setState("speaking");

    const animate = () => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) sum += ((sample - 128) / 128) ** 2;
      setMouth(Math.sqrt(sum / samples.length) * 3.5);
      frame = requestAnimationFrame(animate);
    };
    animate();
    await new Promise((resolve) => {
      audio.onended = resolve;
      audio.onerror = resolve;
      audio.play().catch(resolve);
    });
    if (current === audio) stop();
  }

  /** Fallback: the browser voice, with a simple mouth movement. */
  function speakWithBrowser(text, language) {
    stop();
    if (!window.speechSynthesis) return Promise.resolve();
    setState("speaking");
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = `${language}-IN`;
    mouthTimer = setInterval(() => setMouth(0.3 + Math.random() * 0.6), 90);
    return new Promise((resolve) => {
      utterance.onend = utterance.onerror = () => { stop(); resolve(); };
      window.speechSynthesis.speak(utterance);
    });
  }

  setMouth(0);
  setState(restingState);
  return {
    setState,
    /** The state the face returns to after speaking, for example riding. */
    setResting(state) { restingState = state; if (!current) setState(state); },
    playAudio,
    speakWithBrowser,
    stop,
    isSpeaking: () => current !== null,
  };
}
