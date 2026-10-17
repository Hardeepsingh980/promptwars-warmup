/**
 * A small client for the Cheerio Direct API (WhatsApp Cloud API message shapes).
 * All calls carry the account's x-api-key header.
 */
const DEFAULT_BASE_URL = "https://newprod.api.cheerio.in/direct-apis";
const TIMEOUT_MS = 30_000;

export function createWhatsAppClient({ apiKey, baseUrl = DEFAULT_BASE_URL, fetchImpl = fetch }) {
  async function call(path, { method = "POST", body, headers = {} } = {}) {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: { "x-api-key": apiKey, ...headers },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const contentType = response.headers.get("content-type") ?? "";
    const payload = contentType.includes("application/json") ? await response.json().catch(() => ({})) : await response.arrayBuffer();
    if (!response.ok) {
      const detail = typeof payload === "object" && !(payload instanceof ArrayBuffer) ? JSON.stringify(payload).slice(0, 300) : "";
      throw new Error(`Cheerio ${method} ${path} failed with ${response.status} ${detail}`);
    }
    return { payload, contentType };
  }

  const sendMessage = (message) =>
    call("/v1/whatsapp/direct/send", { body: JSON.stringify({ recipient_type: "individual", ...message }), headers: { "Content-Type": "application/json" } });

  return {
    /** Send a plain text message. */
    sendText: (to, text) => sendMessage({ to, type: "text", text: { body: text.slice(0, 4000) } }),

    /** Send an audio message by uploaded media id. */
    sendAudio: (to, mediaId) => sendMessage({ to, type: "audio", audio: { id: mediaId } }),

    /** Upload a file and return the media id to send it with. */
    async uploadMedia({ buffer, filename, mimeType }) {
      const form = new FormData();
      form.append("file", new Blob([buffer], { type: mimeType }), filename);
      const { payload } = await call("/v1/whatsapp/media-id", { body: form });
      const id = payload?.id ?? payload?.mediaId ?? payload?.media_id ?? payload?.data?.id ?? payload?.data?.mediaId;
      if (!id) throw new Error(`Cheerio media upload returned no id: ${JSON.stringify(payload).slice(0, 200)}`);
      return String(id);
    },

    /** Download an incoming media file by id. Returns { buffer, mimeType }. */
    async getMedia(mediaId) {
      const { payload, contentType } = await call("/v1/whatsapp/media", { body: JSON.stringify({ mediaId }), headers: { "Content-Type": "application/json" } });
      if (payload instanceof ArrayBuffer) return { buffer: Buffer.from(payload), mimeType: contentType.split(";")[0] || "application/octet-stream" };
      // Some deployments answer with a JSON object that holds a temporary URL.
      const url = payload?.url ?? payload?.data?.url ?? payload?.media_url ?? payload?.link;
      if (typeof url !== "string" || !url.startsWith("https://")) throw new Error("Cheerio get media returned no file");
      const response = await fetchImpl(url, { headers: { "x-api-key": apiKey }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!response.ok) throw new Error(`Media download failed with ${response.status}`);
      return { buffer: Buffer.from(await response.arrayBuffer()), mimeType: (response.headers.get("content-type") ?? "application/octet-stream").split(";")[0] };
    },
  };
}
