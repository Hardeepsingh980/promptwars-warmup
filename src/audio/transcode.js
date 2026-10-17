import { spawn } from "node:child_process";

/** Audio types Gemini reads directly. WhatsApp voice notes (OGG Opus) are not among them. */
const GEMINI_AUDIO = new Set(["audio/wav", "audio/mp3", "audio/mpeg", "audio/aiff", "audio/aac", "audio/flac"]);
const TARGET_RATE = 16_000;
const TIMEOUT_MS = 30_000;

export const geminiReadsAudio = (mimeType) => GEMINI_AUDIO.has(mimeType);

let available = null;

/** True when ffmpeg is on the PATH. The result is cached. */
export async function hasFfmpeg() {
  if (available !== null) return available;
  available = await new Promise((resolve) => {
    const probe = spawn("ffmpeg", ["-version"]);
    probe.on("error", () => resolve(false));
    probe.on("exit", (code) => resolve(code === 0));
  });
  return available;
}

/** Convert any audio ffmpeg understands into 16 kHz mono 16-bit WAV. Rejects when ffmpeg fails. */
export function toWav(buffer) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-ac", "1", "-ar", String(TARGET_RATE), "-f", "wav", "pipe:1"]);
    const chunks = [];
    let stderr = "";
    const timer = setTimeout(() => { ffmpeg.kill("SIGKILL"); reject(new Error("ffmpeg timed out")); }, TIMEOUT_MS);
    ffmpeg.stdout.on("data", (chunk) => chunks.push(chunk));
    ffmpeg.stderr.on("data", (chunk) => { stderr += chunk; });
    ffmpeg.on("error", (error) => { clearTimeout(timer); reject(error); });
    ffmpeg.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && chunks.length > 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`ffmpeg failed (${code}): ${stderr.trim().slice(0, 200)}`));
    });
    ffmpeg.stdin.on("error", () => {});
    ffmpeg.stdin.end(buffer);
  });
}

/**
 * Make audio safe for Gemini: pass through what it reads, convert the rest to WAV.
 * Without ffmpeg the audio is passed through as is, so the caller can still try.
 */
export async function prepareAudioForGemini({ buffer, mimeType }) {
  const clean = (mimeType ?? "").split(";")[0].trim().toLowerCase();
  if (geminiReadsAudio(clean)) return { buffer, mimeType: clean === "audio/mpeg" ? "audio/mp3" : clean };
  if (!(await hasFfmpeg())) return { buffer, mimeType: clean || "audio/ogg", converted: false };
  return { buffer: await toWav(buffer), mimeType: "audio/wav", converted: true };
}
