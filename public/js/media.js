/**
 * Photo and voice capture in the browser.
 * Photos are shrunk before upload. Voice is recorded as 16 kHz mono WAV, a format Gemini reads.
 */

const MAX_IMAGE_SIDE = 1280;
const JPEG_QUALITY = 0.82;
const TARGET_SAMPLE_RATE = 16_000;

/** Read a Blob as base64 without the data: prefix. */
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function decodeImage(file) {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall through to the <img> path, which supports more formats in some browsers.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Shrink a photo to at most 1280 px on its long side and encode it as JPEG. */
export async function shrinkImage(file) {
  if (!file.type.startsWith("image/")) throw new Error("not an image");
  const image = await decodeImage(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  return { mimeType: "image/jpeg", data: await blobToBase64(blob), previewUrl: URL.createObjectURL(blob) };
}

/** Average samples down to the target rate. Good enough for speech. */
function downsample(samples, fromRate, toRate) {
  if (fromRate === toRate) return samples;
  const ratio = fromRate / toRate;
  const output = new Float32Array(Math.floor(samples.length / ratio));
  for (let i = 0; i < output.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(samples.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += samples[j];
    output[i] = sum / Math.max(1, end - start);
  }
  return output;
}

/** Encode mono float samples as a 16-bit PCM WAV file. */
export function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeText = (offset, text) => [...text].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  writeText(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, i) => {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  });
  return new Blob([view], { type: "audio/wav" });
}

/**
 * Start recording from the microphone.
 * Returns { stop } where stop() resolves to { mimeType, data } as base64 WAV.
 */
export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const context = new AudioContext();
  await context.audioWorklet.addModule("/js/recorder-worklet.js");
  const source = context.createMediaStreamSource(stream);
  const recorder = new AudioWorkletNode(context, "recorder-processor");
  const mute = context.createGain();
  mute.gain.value = 0;
  const chunks = [];
  recorder.port.onmessage = (event) => chunks.push(event.data);
  source.connect(recorder).connect(mute).connect(context.destination);

  async function release() {
    stream.getTracks().forEach((track) => track.stop());
    source.disconnect();
    recorder.disconnect();
    await context.close();
  }

  return {
    async stop() {
      await release();
      const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const merged = new Float32Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      const wav = encodeWav(downsample(merged, context.sampleRate, TARGET_SAMPLE_RATE), TARGET_SAMPLE_RATE);
      return { mimeType: "audio/wav", data: await blobToBase64(wav), seconds: length / context.sampleRate };
    },
    cancel: release,
  };
}
