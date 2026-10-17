import lamejs from "@breezystack/lamejs";

const BITRATE_KBPS = 64;
const FRAME_SAMPLES = 1152;

/** Read a 16-bit PCM WAV buffer. Returns { sampleRate, channels, samples } with Int16 samples of the first channel. */
export function parseWav(buffer) {
  if (buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF") throw new Error("Not a WAV file");
  const channels = buffer.readUInt16LE(22);
  const sampleRate = buffer.readUInt32LE(24);
  const bitsPerSample = buffer.readUInt16LE(34);
  if (bitsPerSample !== 16) throw new Error(`Unsupported WAV bit depth: ${bitsPerSample}`);
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    if (chunkId === "data") {
      const data = buffer.subarray(offset + 8, Math.min(buffer.length, offset + 8 + chunkSize));
      const frames = Math.floor(data.length / 2 / channels);
      const samples = new Int16Array(frames);
      for (let i = 0; i < frames; i++) samples[i] = data.readInt16LE(i * 2 * channels);
      return { sampleRate, channels, samples };
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  throw new Error("WAV file has no data chunk");
}

/** Encode a 16-bit PCM WAV buffer as a mono MP3 buffer, which WhatsApp accepts as audio. */
export function wavToMp3(wavBuffer) {
  const { sampleRate, samples } = parseWav(wavBuffer);
  const encoder = new lamejs.Mp3Encoder(1, sampleRate, BITRATE_KBPS);
  const chunks = [];
  for (let i = 0; i < samples.length; i += FRAME_SAMPLES) {
    const frame = encoder.encodeBuffer(samples.subarray(i, i + FRAME_SAMPLES));
    if (frame.length > 0) chunks.push(Buffer.from(frame));
  }
  const tail = encoder.flush();
  if (tail.length > 0) chunks.push(Buffer.from(tail));
  return Buffer.concat(chunks);
}
