import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";

export const SECRETS = {
  sessionSecret: "test-session-secret", copilotToolKey: "test-tool-key", copilotWebhookToken: "test-webhook-token",
  whatsapp: { apiKey: "test", baseUrl: "https://cheerio.test", webhookToken: "test-wa-token", number: "+15550000000" },
};

/** A fake model client. Set `reply` per test. `calls` records every request. */
export function createFakeAi() {
  return {
    reply: () => ({}),
    calls: [],
    async generateJson(request) {
      this.calls.push(request);
      return this.reply(request);
    },
    async generateSpeech(text) {
      this.calls.push({ text });
      return { mimeType: "audio/wav", data: silentWav().toString("base64") };
    },
    /** Set `toolReplies` to a list of part arrays; each call returns the next one. */
    toolReplies: [],
    async generateWithTools(request) {
      this.calls.push(request);
      return this.toolReplies.length ? this.toolReplies.shift() : [{ text: "Done." }];
    },
  };
}

/** A tiny valid 16-bit mono WAV with 240 samples of silence at 24 kHz. */
export function silentWav() {
  const samples = 240;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0); buffer.writeUInt32LE(36 + samples * 2, 4); buffer.write("WAVE", 8); buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(24000, 24);
  buffer.writeUInt32LE(48000, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write("data", 36); buffer.writeUInt32LE(samples * 2, 40);
  return buffer;
}

/** A fake Cheerio client that records what it sends. */
export function createFakeWhatsApp() {
  return {
    sent: [],
    media: new Map(),
    async sendText(to, text) { this.sent.push({ to, type: "text", text }); },
    async sendAudio(to, mediaId) { this.sent.push({ to, type: "audio", mediaId }); },
    async uploadMedia({ buffer, mimeType }) { const id = `media-${this.sent.length + 1}`; this.media.set(id, { buffer, mimeType }); return id; },
    async getMedia(mediaId) {
      if (mediaId === "img-1") return { buffer: Buffer.from("fakejpeg"), mimeType: "image/jpeg" };
      if (mediaId === "voice-1") return { buffer: silentWav(), mimeType: "audio/ogg" };
      throw new Error("unknown media");
    },
  };
}

/** Start the app on a free port with an in-memory db. Returns helpers for HTTP calls. */
export async function startTestServer({ rateLimit = { windowMs: 60_000, max: 10_000 } } = {}) {
  const ai = createFakeAi();
  const whatsapp = createFakeWhatsApp();
  const db = await openDb(null);
  const { app, services } = createApp({ ai, db, rateLimit, secrets: SECRETS, whatsappClient: whatsapp });
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  /** A client that keeps its own session cookie, like a browser. */
  function client() {
    let cookie = "";
    const call = async (path, { method = "GET", body, headers = {} } = {}) => {
      const response = await fetch(baseUrl + path, {
        method,
        headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const setCookie = response.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";")[0];
      return response;
    };
    const json = async (path, options) => {
      const response = await call(path, options);
      return { status: response.status, body: await response.json().catch(() => ({})) };
    };
    return { call, json, signup: (user) => json("/api/auth/signup", { method: "POST", body: user }) };
  }

  return { ai, whatsapp, db, services, baseUrl, client, close: () => server.close() };
}
