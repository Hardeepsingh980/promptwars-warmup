/**
 * Helpers that read an end-of-call webhook whose exact shape we do not control.
 * They search the JSON for a transcript and a caller number by common field names.
 */

const TRANSCRIPT_KEY = /transcript|transcription|conversation|dialog|messages|chat/i;
const NUMBER_KEY = /^(from|caller|caller_?number|customer_?number|phone|phone_?number|mobile|from_?number|contact)$/i;
const TEXT_KEYS = ["text", "content", "message", "transcript", "utterance"];
const ROLE_KEYS = ["role", "speaker", "sender", "from", "type"];
const MAX_DEPTH = 6;

/** Turn one transcript value (string or list of turns) into plain text. */
function transcriptText(value) {
  if (typeof value === "string") return value.trim();
  if (!Array.isArray(value)) return "";
  return value
    .map((turn) => {
      if (typeof turn === "string") return turn;
      if (!turn || typeof turn !== "object") return "";
      const text = TEXT_KEYS.map((key) => turn[key]).find((item) => typeof item === "string");
      const role = ROLE_KEYS.map((key) => turn[key]).find((item) => typeof item === "string");
      return text ? (role ? `${role}: ${text}` : text) : "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

/** Walk the payload and return the longest transcript we can find, or "". */
export function findTranscript(payload, depth = 0) {
  if (!payload || typeof payload !== "object" || depth > MAX_DEPTH) return "";
  let best = "";
  for (const [key, value] of Object.entries(payload)) {
    const candidate = TRANSCRIPT_KEY.test(key) ? transcriptText(value) : "";
    const nested = typeof value === "object" ? findTranscript(value, depth + 1) : "";
    for (const text of [candidate, nested]) if (text.length > best.length) best = text;
  }
  return best;
}

/** Return the first phone-like value under a caller-number key, digits only, or "". */
export function findCallerNumber(payload, depth = 0) {
  if (!payload || typeof payload !== "object" || depth > MAX_DEPTH) return "";
  for (const [key, value] of Object.entries(payload)) {
    if (NUMBER_KEY.test(key) && (typeof value === "string" || typeof value === "number")) {
      const digits = String(value).replace(/\D/g, "");
      if (digits.length >= 10 && digits.length <= 15) return digits;
    }
  }
  for (const value of Object.values(payload)) {
    if (value && typeof value === "object") {
      const found = findCallerNumber(value, depth + 1);
      if (found) return found;
    }
  }
  return "";
}

/** Hide all but the last 4 digits, for display. */
export function maskNumber(digits) {
  if (!digits) return "";
  return `${"•".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

const RECORDING_KEY = /record|recording|audio_?url|call_?audio|media_?url/i;
const AUDIO_URL = /^https:\/\/\S+\.(mp3|wav|ogg|m4a|aac|opus)(\?\S*)?$/i;

/** Return the first https link to a call recording, or "". */
export function findRecordingUrl(payload, depth = 0) {
  if (!payload || typeof payload !== "object" || depth > MAX_DEPTH) return "";
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === "string" && value.startsWith("https://") && (RECORDING_KEY.test(key) || AUDIO_URL.test(value))) return value;
  }
  for (const value of Object.values(payload)) {
    if (value && typeof value === "object") {
      const found = findRecordingUrl(value, depth + 1);
      if (found) return found;
    }
  }
  return "";
}

/** Describe the shape of a payload as key paths with types, without values. For logs. */
export function describeKeys(payload, prefix = "", depth = 0) {
  if (!payload || typeof payload !== "object" || depth > 3) return "";
  return Object.entries(payload).slice(0, 40).map(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(value)) return `${path}[${value.length}]` + (value[0] && typeof value[0] === "object" ? `{${describeKeys(value[0], "", depth + 1)}}` : "");
    if (value && typeof value === "object") return `${path}{${describeKeys(value, "", depth + 1)}}`;
    return `${path}:${typeof value}`;
  }).join(",");
}
