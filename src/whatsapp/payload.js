/**
 * Read incoming WhatsApp messages out of a webhook body.
 * The WhatsApp Cloud API shape (entry[].changes[].value.messages[]) is handled first.
 * Flatter shapes with from/type fields are handled too, because providers differ.
 */
const MAX_DEPTH = 10;
const MEDIA_TYPES = ["image", "audio", "voice", "video", "document", "sticker"];

function normalize(raw) {
  const type = raw.type ?? (raw.text ? "text" : raw.image ? "image" : raw.audio || raw.voice ? "audio" : "unknown");
  const kind = type === "voice" ? "audio" : type;
  const media = raw[type] ?? raw.audio ?? raw.voice ?? raw.image ?? raw.media ?? {};
  const text = typeof raw.text === "string" ? raw.text : raw.text?.body ?? raw.body ?? raw.message ?? "";
  const from = String(raw.from ?? raw.sender ?? raw.wa_id ?? raw.phone ?? "").replace(/\D/g, "");
  return {
    id: String(raw.id ?? raw.wamid ?? raw.message_id ?? `${from}:${raw.timestamp ?? Date.now()}`),
    from,
    type: ["text", ...MEDIA_TYPES].includes(kind) ? kind : "unknown",
    text: typeof text === "string" ? text.trim() : "",
    caption: typeof media?.caption === "string" ? media.caption.trim() : "",
    mediaId: media?.id ?? media?.media_id ?? media?.mediaId ?? null,
    mediaUrl: typeof media?.url === "string" ? media.url : typeof media?.link === "string" ? media.link : null,
    mimeType: media?.mime_type ?? media?.mimeType ?? media?.mimetype ?? null,
    timestamp: raw.timestamp ?? null,
  };
}

const looksLikeMessage = (value) =>
  value && typeof value === "object" && !Array.isArray(value) &&
  ("from" in value || "sender" in value || "wa_id" in value) &&
  ("type" in value || "text" in value || "image" in value || "audio" in value || "voice" in value || "body" in value);

/** Return every incoming message in the payload as a normalized list. Status updates are ignored. */
export function extractMessages(payload) {
  const found = [];
  const seen = new Set();
  const visit = (value, depth) => {
    if (!value || typeof value !== "object" || depth > MAX_DEPTH) return;
    if (Array.isArray(value)) return value.forEach((item) => visit(item, depth + 1));
    if (looksLikeMessage(value)) {
      const message = normalize(value);
      if (message.from && !seen.has(message.id)) {
        seen.add(message.id);
        found.push(message);
      }
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (key === "statuses" || key === "contacts") continue;
      visit(child, depth + 1);
    }
  };
  visit(payload, 0);
  return found;
}
