/**
 * The browser side of a live voice session with Saathi.
 * Mic audio streams to the server as 16 kHz PCM. Saathi's 24 kHz PCM comes back and plays
 * through an analyser, so the avatar's mouth follows the real voice.
 */

const INPUT_RATE = 16_000;
const OUTPUT_RATE = 24_000;
const SEND_EVERY_SAMPLES = 1600; // 100 ms

const toBase64 = (int16) => btoa(String.fromCharCode(...new Uint8Array(int16.buffer)));

function fromBase64(data) {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

function downsample(samples, fromRate, toRate) {
  const ratio = fromRate / toRate;
  const output = new Int16Array(Math.floor(samples.length / ratio));
  for (let i = 0; i < output.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(samples.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += samples[j];
    const value = sum / Math.max(1, end - start);
    output[i] = value < 0 ? value * 0x8000 : value * 0x7fff;
  }
  return output;
}

/**
 * Start a session. `handlers` may define onReady, onCaption({ role, text }), onTool({ name, result, uiEvent }),
 * onSpeaking(boolean), onEnd(reason). Returns { sendText, stop, isOpen }.
 */
export async function startLiveSession({ avatar, intro = false, handlers = {} }) {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(`${protocol}://${location.host}/api/live${intro ? "?intro=1" : ""}`);
  const context = new AudioContext();
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.5;
  analyser.connect(context.destination);
  avatar.attachAnalyser(analyser);

  let playing = new Set();
  let nextTime = 0;
  let mic = null;
  let open = false;
  let pending = [];

  const say = (frame) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(frame)); };

  function setSpeaking(isSpeaking) {
    avatar.setState(isSpeaking ? "speaking" : "listening");
    handlers.onSpeaking?.(isSpeaking);
  }

  function playChunk(data) {
    const samples = fromBase64(data);
    const buffer = context.createBuffer(1, samples.length, OUTPUT_RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 0x8000;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(analyser);
    const startAt = Math.max(context.currentTime + 0.05, nextTime);
    source.start(startAt);
    nextTime = startAt + buffer.duration;
    playing.add(source);
    if (playing.size === 1) setSpeaking(true);
    source.onended = () => {
      playing.delete(source);
      if (playing.size === 0) setSpeaking(false);
    };
  }

  function stopPlayback() {
    for (const source of playing) { try { source.stop(); } catch { /* already stopped */ } }
    playing = new Set();
    nextTime = 0;
    setSpeaking(false);
  }

  async function startMic() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    await context.audioWorklet.addModule("/js/recorder-worklet.js");
    const source = context.createMediaStreamSource(stream);
    const recorder = new AudioWorkletNode(context, "recorder-processor");
    const mute = context.createGain();
    mute.gain.value = 0;
    recorder.port.onmessage = (event) => {
      pending.push(event.data);
      const total = pending.reduce((sum, chunk) => sum + chunk.length, 0);
      if (total < (SEND_EVERY_SAMPLES * context.sampleRate) / INPUT_RATE) return;
      const merged = new Float32Array(total);
      let offset = 0;
      for (const chunk of pending) { merged.set(chunk, offset); offset += chunk.length; }
      pending = [];
      say({ type: "audio", data: toBase64(downsample(merged, context.sampleRate, INPUT_RATE)) });
    };
    source.connect(recorder).connect(mute).connect(context.destination);
    mic = { stream, source, recorder };
  }

  socket.onmessage = async (event) => {
    const frame = JSON.parse(event.data);
    switch (frame.type) {
      case "ready":
        open = true;
        avatar.setState("listening");
        handlers.onReady?.();
        try {
          await startMic();
        } catch {
          handlers.onMicError?.();
        }
        break;
      case "audio": playChunk(frame.data); break;
      case "interrupted": stopPlayback(); break;
      case "caption": handlers.onCaption?.(frame); break;
      case "tool": handlers.onTool?.(frame); break;
      case "turnComplete": handlers.onTurnComplete?.(); break;
      case "error": handlers.onError?.(frame.message); break;
      case "goAway": handlers.onEnd?.("goAway"); break;
      case "closed": handlers.onEnd?.(frame.reason || "closed"); break;
      default: break;
    }
  };
  socket.onerror = () => handlers.onError?.("Could not connect to Saathi");
  socket.onclose = () => { open = false; stop(); handlers.onEnd?.("closed"); };

  function stop() {
    if (mic) {
      mic.stream.getTracks().forEach((track) => track.stop());
      mic.source.disconnect();
      mic.recorder.disconnect();
      mic = null;
    }
    stopPlayback();
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close();
    if (context.state !== "closed") context.close().catch(() => {});
    avatar.rest();
  }

  await context.resume();
  return {
    sendText: (text) => say({ type: "text", text }),
    stop,
    isOpen: () => open && socket.readyState === WebSocket.OPEN,
  };
}
